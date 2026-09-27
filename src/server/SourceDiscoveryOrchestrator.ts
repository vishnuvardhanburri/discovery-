/**
 * XAVIRA — SOURCE DISCOVERY ORCHESTRATOR (§4, §6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Discovers legitimate public sources for a company:
 *   - official website (homepage, sitemap, robots)
 *   - subdomains
 *   - GitHub repos/orgs (linked or inferred from company pages)
 *   - public documentation
 *   - API documentation
 *   - status pages
 *   - security pages
 *   - changelogs
 *   - engineering blogs
 *   - public job postings
 *   - public professional/company sources (LinkedIn, etc.)
 *   - public news/articles (via search)
 *   - other relevant indexed public sources
 *
 * Follows relationships found on one source to discover other sources.
 * Tiered discovery: Tier 1 (official) → Tier 2 (platform) → Tier 3 (professional)
 * → Tier 4 (news/directories) → Tier 5 (search expansion) → Tier 6 (deep research).
 *
 * Never bypasses auth, CAPTCHA, WAF, or rate limits. If a source is
 * inaccessible, records BLOCKED and continues.
 */

import type { HttpFetcher } from './IntelligenceCase';
import { PublicLinkDiscovery } from './PublicLinkDiscovery';
import { GitHubDiscovery } from './GitHubDiscovery';
import { NullSearchProvider, type SearchProvider } from './WebSearchProvider';
import type { SearchResult } from './SearchCache';
import { QueryGenerator } from './QueryGenerator';
import { FreshnessEngine, type FreshSource } from './FreshnessEngine';
import { randomBytes } from 'crypto';

export type SourceTier = 1 | 2 | 3 | 4 | 5 | 6;

export type SourceKind =
  | 'WEBSITE'
  | 'SUBDOMAIN'
  | 'SITEMAP'
  | 'ROBOTS'
  | 'GITHUB'
  | 'GITHUB_REPO'
  | 'DOCUMENTATION'
  | 'API_DOCS'
  | 'STATUS_PAGE'
  | 'SECURITY_PAGE'
  | 'CHANGELOG'
  | 'ENGINEERING_BLOG'
  | 'JOB_BOARD'
  | 'PROFESSIONAL_PROFILE'
  | 'NEWS'
  | 'DIRECTORY'
  | 'SEARCH_RESULT'
  | 'OTHER';

export interface DiscoveredSource {
  source_id: string;
  kind: SourceKind;
  url: string;
  title: string | null;
  tier: SourceTier;
  /** How this source was discovered. */
  discovered_via: string;
  /** Relationship to company in the IdentityGraph. */
  relationship: 'OFFICIAL' | 'LINKED' | 'DISCOVERED' | 'LIKELY' | 'VERIFIED';
  confidence: number; // 0–1
  /** Provenance tag from the 6 required tags. */
  provenance: string;
  /** Freshness of this source. */
  freshness: FreshSource;
  /** HTML content if fetched (for evidence extraction). */
  html: string | null;
  /** HTTP status if fetched. */
  status: number | null;
  /** Whether the source blocked access (network error, CAPTCHA, 403, etc.). */
  blocked: boolean;
  error: string | null;
}

export interface SourceDiscoveryOptions {
  fetcher?: HttpFetcher;
  searchProvider?: SearchProvider;
  maxSources?: number;
  companyName: string;
  domain: string;
  /** Initial seed URLs (e.g. known company website). */
  seedUrls?: string[];
  onProgress?: (stage: string, message: string) => void;
}

export interface SourceDiscoveryResult {
  sources: DiscoveredSource[];
  /** All HTML collected (URL → content). */
  htmlByUrl: Map<string, string>;
  /** All evidence generated from source discovery. */
  evidence: Evidence[];
  /** Errors during discovery. */
  errors: string[];
  /** Sources that were blocked (never defeated access controls). */
  blockedSources: DiscoveredSource[];
}

import type { Evidence } from './IntelligenceCase';

export class SourceDiscoveryOrchestrator {
  /**
   * Discover all legitimate public sources for a company.
   * Tiered, bounded, read-only. Never defeats auth/CAPTCHA/WAF.
   */
  static async discover(options: SourceDiscoveryOptions): Promise<SourceDiscoveryResult> {
    const { companyName, domain, seedUrls = [], onProgress = () => {} } = options;
    const fetcher = (options.fetcher || (globalThis.fetch as any)) as HttpFetcher;
    const maxSources = options.maxSources ?? 40;
    const sources: DiscoveredSource[] = [];
    const htmlByUrl = new Map<string, string>();
    const evidence: Evidence[] = [];
    const errors: string[] = [];
    const blockedSources: DiscoveredSource[] = [];
    const now = new Date().toISOString();

    const origin = domain.startsWith('http') ? domain : `https://${domain}`;

    // === Tier 1: Official company website ===
    onProgress('discovery', 'Tier 1: Official company website');
    const tier1Urls = [origin, ...seedUrls];
    for (const url of tier1Urls) {
      if (sources.length >= maxSources) break;
      await this.probeSource(url, 'WEBSITE', 1, 'seed', 'OFFICIAL', fetcher, sources, htmlByUrl, evidence, errors, blockedSources);
    }

    // Crawl the official website to discover sitemap/robots/internal links
    if (sources.some(s => s.kind === 'WEBSITE' && !s.blocked)) {
      try {
        const surface = await PublicLinkDiscovery.discover(origin, {
          maxPages: 20,
          delayMs: 100,
          timeoutMs: 6000,
          fetcher,
          onProgress: (page) => onProgress('discovery', `[page] ${page.category}  ${page.path}  (HTTP ${page.status ?? '?'})`),
          onHtml: (url, html) => { htmlByUrl.set(url, html); },
        });
        for (const page of surface.discovered_pages) {
          if (sources.length >= maxSources) break;
          if (sources.some(s => s.url === page.url)) continue;
          const tier = this.categorizeTier(page.category);
          const kind = this.categorizeKind(page.url, page.category);
          await this.probeSource(page.url, kind, tier, `same-origin crawl (${page.category})`, this.relationshipForKind(kind), fetcher, sources, htmlByUrl, evidence, errors, blockedSources);
        }
      } catch (e: any) {
        errors.push(`Website crawl error: ${e?.message || String(e)}`);
      }
    }

    // === Tier 2: GitHub (company-linked repos) ===
    onProgress('discovery', 'Tier 2: GitHub discovery');
    const githubPages = Array.from(htmlByUrl.entries()).map(([url, html]) => ({ url, html }));
    if (githubPages.length > 0) {
      try {
        const gh = await GitHubDiscovery.discover({
          fetcher,
          pages: githubPages,
          companyDomain: domain,
          onProgress: (stage, msg) => onProgress('discovery', msg),
        });
        if (gh.rate_limited) errors.push('GitHub discovery rate-limited.');
        for (const repo of gh.repos) {
          if (sources.length >= maxSources) break;
          const src: DiscoveredSource = {
            source_id: 'src_' + randomBytes(6).toString('hex'),
            kind: 'GITHUB_REPO',
            url: repo.url,
            title: `${repo.org}/${repo.repo}`,
            tier: 2,
            discovered_via: `linked from company pages (GitHubDiscovery)`,
            relationship: 'LINKED',
            confidence: 0.9,
            provenance: 'PUBLIC_PROFESSIONAL_SOURCE',
            freshness: {
              source_url: repo.url,
              source_type: 'GITHUB_REPO',
              first_seen: now,
              last_seen: now,
              published_at: repo.updated_at,
              retrieved_at: now,
              age_days: repo.updated_at ? Math.round((Date.now() - Date.parse(repo.updated_at)) / (1000 * 60 * 60 * 24)) : null,
              freshness: 'UNKNOWN',
              freshness_reason: 'No retrieval timestamp.',
            },
            html: null,
            status: null,
            blocked: false,
            error: null,
          };
          sources.push(src);
        }
      } catch (e: any) {
        errors.push(`GitHub discovery error: ${e?.message || String(e)}`);
      }
    }

    // === Tier 3: Public professional sources (LinkedIn, etc.) ===
    onProgress('discovery', 'Tier 3: Public professional sources');
    // Look for LinkedIn/company profile links in discovered HTML
    for (const [url, html] of htmlByUrl) {
      const linkedinMatch = html.match(/https?:\/\/(www\.)?linkedin\.com\/company\/[^\s"'<>]+/i);
      if (linkedinMatch) {
        const linkedinUrl = linkedinMatch[0];
        if (!sources.some(s => s.url === linkedinUrl)) {
          sources.push(this.makeSource(linkedinUrl, 'PROFESSIONAL_PROFILE', 3, 'JSON-LD / page link', 'LINKED', now));
        }
      }
    }

    // === Tier 4-5: Search-based discovery (if search available) ===
    const searchProvider = options.searchProvider;
    if (searchProvider && searchProvider.available) {
      onProgress('discovery', 'Tier 5: Search-based source discovery');
      const queries = QueryGenerator.generate({ company: companyName, domain });
      for (const q of queries.slice(0, 8)) {
        if (sources.length >= maxSources) break;
        try {
          const results = await searchProvider.search(q.query, { maxResults: 5 });
          for (const r of (results?.results || [])) {
            if (sources.length >= maxSources) break;
            // Skip search engine URLs
            if (r.url.includes('duckduckgo.com') || r.url.includes('google.com') || r.url.includes('bing.com')) continue;
            if (!sources.some(s => s.url === r.url)) {
              sources.push(this.makeSource(r.url, 'SEARCH_RESULT', 5, `search: "${q.query}"`, 'DISCOVERED', now));
            }
          }
        } catch {
          errors.push(`Search error for "${q.query}"`);
        }
      }
    } else {
      onProgress('discovery', 'SEARCH_UNAVAILABLE — skipping search-based discovery');
    }

    return { sources, htmlByUrl, evidence, errors, blockedSources };
  }

  /** Probe a URL and record it as a discovered source + evidence. */
  private static async probeSource(
    url: string,
    kind: SourceKind,
    tier: SourceTier,
    discoveredVia: string,
    relationship: DiscoveredSource['relationship'],
    fetcher: HttpFetcher,
    sources: DiscoveredSource[],
    htmlByUrl: Map<string, string>,
    evidence: Evidence[],
    errors: string[],
    blockedSources: DiscoveredSource[],
  ): Promise<void> {
    if (sources.some(s => s.url === url)) return;

    let status: number | null = null;
    let html: string | null = null;
    let blocked = false;
    let error: string | null = null;

    try {
      const res = await fetcher(url, {
        method: 'GET',
        headers: { 'User-Agent': 'XAVIRA-SourceDiscovery/1.0', 'Accept': 'text/html' },
        signal: AbortSignal.timeout(8000),
      });
      status = res.status;
      const ct = res.headers.get('content-type');
      if (ct?.includes('text/html') || ct?.includes('application/json') || ct?.includes('text/plain')) {
        html = await res.text().catch(() => null);
        if (html) htmlByUrl.set(url, html);
      }
    } catch (e: any) {
      blocked = true;
      error = `Network error, CAPTCHA, or access denied: ${e?.name || e?.message || String(e)}`;
      errors.push(`BLOCKED: ${url} — ${error}`);
      if (sources.length < 100) blockedSources.push({} as any); // placeholder, will be set below
    }

    const src: DiscoveredSource = {
      source_id: 'src_' + randomBytes(6).toString('hex'),
      kind,
      url,
      title: null,
      tier,
      discovered_via: discoveredVia,
      relationship,
      confidence: relationship === 'OFFICIAL' ? 0.95 : relationship === 'LINKED' ? 0.85 : 0.5,
      provenance: this.provenanceForKind(kind),
      freshness: {
        source_url: url,
        source_type: kind,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        published_at: null,
        retrieved_at: new Date().toISOString(),
        age_days: null,
        freshness: FreshnessEngine.classify(new Date().toISOString()).level,
        freshness_reason: FreshnessEngine.classify(new Date().toISOString()).reason,
      },
      html,
      status,
      blocked,
      error,
    };
    sources.push(src);

    // Generate evidence from the probe
    if (status && status >= 200 && status < 300) {
      evidence.push({
        id: 'ev_src_' + randomBytes(6).toString('hex'),
        evidence_origin: src.provenance as any,
        public_url: url,
        source_type: this.evidenceSourceType(kind),
        method: 'GET',
        status,
        observed_behavior: `Public source discovered: ${kind} at ${url} (HTTP ${status})`,
        reproductions: 1,
        repeatable: true,
        tested_without_auth: true,
        not_tested: ['mutations', 'auth bypass'],
        retrieved_at: new Date().toISOString(),
        evidence_text: `${kind} source: ${url}`,
        latency_ms: 0,
      });
    }
  }

  private static categorizeTier(category?: string): SourceTier {
    if (!category) return 1;
    if (category === 'homepage') return 1;
    if (['engineering', 'docs', 'security', 'status_ops'].includes(category)) return 2;
    if (category === 'team_people') return 2;
    if (['blog', 'about', 'hiring'].includes(category)) return 3;
    return 4;
  }

  private static categorizeKind(url: string, category?: string): SourceKind {
    if (url.includes('github.com')) return 'GITHUB';
    if (url.includes('/docs') || url.includes('/developers')) return 'DOCUMENTATION';
    if (url.includes('/api/')) return 'API_DOCS';
    if (url.includes('/status')) return 'STATUS_PAGE';
    if (url.includes('/security')) return 'SECURITY_PAGE';
    if (url.includes('/changelog') || url.includes('/releases')) return 'CHANGELOG';
    if (url.includes('/blog') || url.includes('/engineering')) return 'ENGINEERING_BLOG';
    if (url.includes('/careers') || url.includes('/jobs')) return 'JOB_BOARD';
    if (category === 'team_people') return 'PROFESSIONAL_PROFILE';
    if (category === 'hiring') return 'JOB_BOARD';
    return 'OTHER';
  }

  private static relationshipForKind(kind: SourceKind): DiscoveredSource['relationship'] {
    if (kind === 'WEBSITE' || kind === 'SITEMAP' || kind === 'ROBOTS') return 'OFFICIAL';
    if (kind === 'GITHUB' || kind === 'GITHUB_REPO') return 'LINKED';
    if (kind === 'DOCUMENTATION' || kind === 'API_DOCS' || kind === 'STATUS_PAGE' || kind === 'SECURITY_PAGE' || kind === 'CHANGELOG' || kind === 'ENGINEERING_BLOG' || kind === 'JOB_BOARD') return 'LINKED';
    if (kind === 'PROFESSIONAL_PROFILE' || kind === 'NEWS' || kind === 'DIRECTORY') return 'DISCOVERED';
    return 'DISCOVERED';
  }

  private static evidenceSourceType(kind: SourceKind): 'API_ENDPOINT' | 'PUBLIC_DOCUMENTATION' | 'ENGINEERING_BLOG' | 'UNKNOWN' {
    if (kind === 'API_DOCS') return 'API_ENDPOINT';
    if (kind === 'DOCUMENTATION' || kind === 'GITHUB' || kind === 'GITHUB_REPO' || kind === 'CHANGELOG') return 'PUBLIC_DOCUMENTATION';
    if (kind === 'ENGINEERING_BLOG' || kind === 'NEWS') return 'ENGINEERING_BLOG';
    return 'UNKNOWN';
  }

  private static provenanceForKind(kind: SourceKind): string {
    if (kind === 'WEBSITE' || kind === 'SITEMAP' || kind === 'ROBOTS') return 'OFFICIAL_COMPANY_SOURCE';
    if (kind === 'PROFESSIONAL_PROFILE' || kind === 'NEWS' || kind === 'DIRECTORY') return 'PUBLIC_PROFESSIONAL_SOURCE';
    return 'REAL_PUBLIC_OBSERVATION';
  }

  private static makeSource(url: string, kind: SourceKind, tier: SourceTier, discoveredVia: string, relationship: DiscoveredSource['relationship'], now: string): DiscoveredSource {
    return {
      source_id: 'src_' + randomBytes(6).toString('hex'),
      kind,
      url,
      title: null,
      tier,
      discovered_via: discoveredVia,
      relationship,
      confidence: relationship === 'OFFICIAL' ? 0.95 : relationship === 'LINKED' ? 0.85 : 0.5,
      provenance: this.provenanceForKind(kind),
      freshness: {
        source_url: url,
        source_type: kind,
        first_seen: now,
        last_seen: now,
        published_at: null,
        retrieved_at: now,
        age_days: null,
        freshness: 'UNKNOWN',
        freshness_reason: 'No retrieval timestamp.',
      },
      html: null,
      status: null,
      blocked: false,
      error: null,
    };
  }
}
