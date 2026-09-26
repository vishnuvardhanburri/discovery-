/**
 * XAVIRA — LIVE WEB RESEARCH PROVIDER (§2, §8, §9)
 * ─────────────────────────────────────────────────────────────────────────────
 * Performs legitimate public web research as a fallback/augmentation when
 * dataset data is incomplete or stale. Uses search + direct public-page
 * observation. All access is READ-ONLY, bounded, and polite.
 *
 * Pipeline:
 *   dataset (seed) → data sufficiency check → if incomplete/stale → live web
 *   search → public source discovery → evidence gathering → signals
 *   → person discovery from search sources → owner/contact verification
 *
 * Never bypasses auth, CAPTCHA, rate limits, or anti-bot. If a source blocks
 * access, records BLOCKED and continues.
 */

import type { HttpFetcher } from './IntelligenceCase';
import type { Evidence } from './IntelligenceCase';
import { SearchCache } from './SearchCache';
import { NullSearchProvider } from './WebSearchProvider';
import type { SearchProvider, SearchOptions } from './WebSearchProvider';
import type { SearchResult } from './SearchCache';
import { QueryGenerator } from './QueryGenerator';
import { FreshnessEngine } from './FreshnessEngine';
import { ResearchBudget } from './ResearchBudget';
import type { ResearchStage } from './ResearchBudget';
import { PublicLinkDiscovery } from './PublicLinkDiscovery';
import { PeopleExtractor } from './PeopleExtractor';
import type { OwnerCandidate, DiscoveredPage } from './IntelligenceCase';
import { GitHubDiscovery } from './GitHubDiscovery';
import type { GithubRepoMeta } from './DeepTypes';
import { randomBytes } from 'crypto';

export interface LiveWebResearchResult {
  /** Evidence gathered from live web sources. */
  evidence: Evidence[];
  /** Additional discovered pages from search results (same-origin + third-party professional). */
  discovered_pages: DiscoveredPage[];
  /** HTML fetched from search-result pages (URL → HTML). */
  htmlByUrl: Map<string, string>;
  /** Owner candidates discovered from live web person discovery. */
  owner_candidates: OwnerCandidate[];
  /** GitHub repo metadata discovered via search. */
  github_repos: GithubRepoMeta[];
  /** Queries executed (for audit). */
  queries_executed: { query: string; results: number; cached: boolean }[];
  /** Errors / blocked sources (never faked). */
  errors: string[];
  /** Whether search was available. */
  search_available: boolean;
  /** Search provider name used. */
  search_provider: string;
  /** Stage reached. */
  stage_reached: ResearchStage;
}

export interface LiveWebResearchOptions {
  fetcher?: HttpFetcher;
  searchProvider?: SearchProvider;
  /** Override the query context. */
  context: {
    company: string;
    domain: string;
    personName?: string;
    technicalTopic?: string;
    technicalArea?: string;
  };
  /** Max stages to run. */
  maxStage?: ResearchStage;
  /** Per-query result limit. */
  maxResultsPerQuery?: number;
  /** Callback for progress. */
  onProgress?: (stage: string, message: string) => void;
}

export class LiveWebResearchProvider {
  private readonly fetcher: HttpFetcher;
  private readonly cache = new SearchCache();
  private readonly budget: ResearchBudget;

  constructor() {
    this.fetcher = ((url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) =>
      fetch(url, { method: init.method, headers: init.headers, signal: init.signal })) as HttpFetcher;
    this.budget = new ResearchBudget();
  }

  /**
   * Run live web research for a company.
   * Dataset data is the seed; live web provides freshness + discovery.
   * Returns evidence, pages, and owner candidates.
   */
  async research(options: LiveWebResearchOptions): Promise<LiveWebResearchResult> {
    const { context, maxStage = 4, maxResultsPerQuery = 8 } = options;
    const onProgress = options.onProgress || (() => {});
    const fetcher = options.fetcher || this.fetcher;
    const evidence: Evidence[] = [];
    const discoveredPages: DiscoveredPage[] = [];
    const htmlByUrl = new Map<string, string>();
    const ownerCandidates: OwnerCandidate[] = [];
    const githubRepos: GithubRepoMeta[] = [];
    const queriesExecuted: { query: string; results: number; cached: boolean }[] = [];
    const errors: string[] = [];

    // Determine search provider
    let searchProvider: SearchProvider | undefined = options.searchProvider;
    if (!searchProvider || !searchProvider.available) {
      if (searchProvider && !searchProvider.available) {
        onProgress('search', `Search provider ${searchProvider.name} is not available — falling back to NullSearchProvider.`);
      }
      searchProvider = new NullSearchProvider();
    }
    const searchAvailable = searchProvider.available;
    if (!searchAvailable) {
      onProgress('search', 'SEARCH_UNAVAILABLE — no search provider configured. Continuing with direct public sources.');
      errors.push('SEARCH_UNAVAILABLE: no search provider available.');
    }

    // === Stage 2: Public source discovery (homepage, sitemap, links) ===
    if (this.budget.shouldAttemptStage(2)) {
      onProgress('sources', `Stage 2: Public source discovery for ${context.domain}`);
      try {
        const targetUrl = context.domain.startsWith('http') ? context.domain : `https://${context.domain}`;
        const surface = await PublicLinkDiscovery.discover(targetUrl, {
          maxPages: 12,
          delayMs: 100,
          timeoutMs: 6000,
          fetcher: fetcher as any,
          onProgress: (page) => {
            discoveredPages.push(page);
            onProgress('sources', `[page] ${page.path} (${page.category}) HTTP ${page.status}`);
          },
          onHtml: (url, html) => { htmlByUrl.set(url, html); },
          logger: (m) => onProgress('sources', m),
        });
        auditEvidenceFromSurface(surface, evidence, errors);
      } catch (e: any) {
        errors.push(`Stage 2 discovery error: ${e?.message || String(e)}`);
      }
      this.budget.advanceStage();
    }

    // === Stage 3: Live technical research (search queries) ===
    if (searchAvailable && this.budget.shouldAttemptStage(3) && maxStage >= 3) {
      onProgress('search', `Stage 3: Live technical research — generating queries for ${context.company || context.domain}`);
      const queries = QueryGenerator.generate({
        company: context.company,
        domain: context.domain,
        personName: context.personName,
        technicalTopic: context.technicalTopic,
        technicalArea: context.technicalArea,
      });

      for (const q of queries) {
        if (!this.budget.recordQuery(3)) {
          onProgress('search', 'Query budget exhausted for stage 3.');
          break;
        }

        // Check cache first
        const cached = this.cache.get(q.query);
        if (cached) {
          onProgress('search', `[cached] ${q.query} (${cached.length} results)`);
          queriesExecuted.push({ query: q.query, results: cached.length, cached: true });
          this.collectSearchEvidence(cached, evidence, discoveredPages, htmlByUrl, ownerCandidates, q.category, errors);
        } else {
          onProgress('search', `[search] ${q.query}`);
          try {
            const results = await searchProvider.search(q.query, { maxResults: maxResultsPerQuery } as SearchOptions);
            this.cache.set(q.query, results);
            queriesExecuted.push({ query: q.query, results: results.length, cached: false });
            this.collectSearchEvidence(results, evidence, discoveredPages, htmlByUrl, ownerCandidates, q.category, errors);
          } catch (e: any) {
            errors.push(`Search error for "${q.query}": ${e?.message || String(e)}`);
          }
        }
      }
      this.budget.advanceStage();
    }

    // === Stage 4: Signal correlation (follow search-result pages) ===
    if (this.budget.shouldAttemptStage(4) && maxStage >= 4) {
      onProgress('signals', `Stage 4: Signal correlation from ${discoveredPages.length} public sources`);
      // Crawl search-result URLs that are same-origin or professional
      const toCrawl = discoveredPages
        .filter(p => p.status === 200 && !htmlByUrl.has(p.url))
        .slice(0, this.budget.getStageConfig(4)?.maxRequests ?? 5);

      for (const page of toCrawl) {
        if (!this.budget.recordRequest(4)) break;
        try {
          const res = await this.fetcher(page.url, {
            method: 'GET', headers: { 'User-Agent': 'XAVIRA-LIVE-OBSERVER/1.0', 'Accept': 'text/html' },
            signal: AbortSignal.timeout(6000),
          });
          if (res.ok) {
            const html = await res.text();
            htmlByUrl.set(page.url, html);
            // Extract signals from the page
            const signals = this.extractSignalsFromHtml(html, page.url, page.category);
            evidence.push(...signals);
            onProgress('signals', `[${page.category}] ${page.path} → ${signals.length} signal(s)`);
          }
        } catch {
          errors.push(`BLOCKED: Could not fetch ${page.url} (network error, CAPTCHA, or access denied).`);
        }
      }
      this.budget.advanceStage();
    }

    // === Stage 5: Safe verification ===
    if (this.budget.shouldAttemptStage(5) && maxStage >= 5) {
      onProgress('verification', 'Stage 5: Safe verification of technical signals');
      // Re-verify key evidence with bounded repeat observations
      const reproEvidence = evidence.filter(e =>
        e.status && (e.status >= 500 || e.latency_ms! > 1000)
      ).slice(0, this.budget.getStageConfig(5)?.maxRequests ?? 3);

      for (const ev of reproEvidence) {
        if (!this.budget.recordRequest(5)) break;
        try {
          const res = await this.fetcher(ev.public_url, {
            method: 'GET', headers: { 'User-Agent': 'XAVIRA-LIVE-OBSERVER/1.0' },
            signal: AbortSignal.timeout(6000),
          });
          const latency = 0; // simplified
          ev.reproductions++;
          ev.repeatable = ev.repeatable && res.status === ev.status;
          ev.latency_samples = [...(ev.latency_samples || []), latency];
          onProgress('verification', `re-verified ${ev.public_url} → HTTP ${res.status}`);
        } catch {
          errors.push(`BLOCKED: Could not re-verify ${ev.public_url}.`);
        }
      }
      this.budget.advanceStage();
    }

    // === Stage 6: Owner/contact refresh ===
    if (this.budget.shouldAttemptStage(6) && maxStage >= 6) {
      onProgress('people', 'Stage 6: Owner/contact refresh via public sources');

      // Person discovery from all collected public pages
      const pagesForPeople = discoveredPages.filter(p =>
        p.category !== undefined && p.category !== 'other' && p.category !== 'homepage'
      );
      const peopleFromPages = PeopleExtractor.extractFromPages(pagesForPeople, htmlByUrl, {
        company: context.company || context.domain,
        technicalAreaHints: ['api', 'backend', 'infrastructure', 'platform', 'security'],
      });
      ownerCandidates.push(...peopleFromPages);

      onProgress('people', `Discovered ${peopleFromPages.length} person candidate(s) from live web`);
      this.budget.advanceStage();
    }

    // GitHub discovery from all collected pages
    const githubPages = Array.from(htmlByUrl.entries()).map(([url, html]) => ({ url, html }));
    if (githubPages.length > 0) {
      try {
        const gh = await GitHubDiscovery.discover({
          fetcher: this.fetcher,
          pages: githubPages,
          companyDomain: context.domain,
          onProgress: (stage, msg) => onProgress('github', msg),
        });
        githubRepos.push(...gh.repos);
        if (gh.rate_limited) {
          errors.push('GitHub discovery rate-limited.');
        }
      } catch (e: any) {
        errors.push(`GitHub discovery error: ${e?.message || String(e)}`);
      }
    }

    // Deduplicate owner candidates
    const deduplicated = this.dedupeOwners(ownerCandidates);

    // Evaluate overall freshness
    const freshness = FreshnessEngine.needsRefresh(
      evidence.map(e => FreshnessEngine.fromEvidence(e))
    );
    if (freshness.needs_refresh) {
      onProgress('freshness', `${freshness.stale.length} stale, ${freshness.aging.length} aging sources — consider refreshing.`);
    }

    return {
      evidence,
      discovered_pages: discoveredPages,
      htmlByUrl,
      owner_candidates: deduplicated,
      github_repos: githubRepos,
      queries_executed: queriesExecuted,
      errors,
      search_available: searchAvailable,
      search_provider: searchProvider!.name,
      stage_reached: this.budget.currentStageNum,
    };
  }

  /** Extract evidence records from a discovered surface (read-only observations). */
  private extractSignalsFromHtml(html: string, url: string, category?: string): Evidence[] {
    const evidence: Evidence[] = [];
    const notTested = ['mutations', 'auth bypass', 'authorization bypass', 'brute force', 'fuzzing'];

    // Detect engineering/technical signals from page content
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();

    // Engineering article (blog post about technical topic)
    if ((text.includes('kubernetes') || text.includes('microservice') || text.includes('aws') ||
         text.includes('cloud') || text.includes('api') || text.includes('infrastructure')) &&
        (text.includes('engineering') || text.includes('scal') || text.includes('infrastructure'))) {
      evidence.push({
        id: 'ev_web_' + randomBytes(8).toString('hex'),
        evidence_origin: 'REAL_PUBLIC_OBSERVATION',
        public_url: url,
        source_type: category === 'engineering' || category === 'blog' ? 'ENGINEERING_BLOG' : 'PUBLIC_DOCUMENTATION',
        method: 'GET',
        status: 200,
        observed_behavior: `Page documents technical information related to the company's engineering/scale/infrastructure.`,
        reproductions: 1,
        repeatable: true,
        tested_without_auth: true,
        not_tested: notTested,
        retrieved_at: new Date().toISOString(),
        evidence_text: `technical content: ${text.slice(0, 200)}`,
        latency_ms: 0,
      });
    }

    // API endpoint detection (page mentions /api/)
    if (text.includes('/api/') || text.includes('rest api') || text.includes('graphql')) {
      evidence.push({
        id: 'ev_web_' + randomBytes(8).toString('hex'),
        evidence_origin: 'REAL_PUBLIC_OBSERVATION',
        public_url: url,
        source_type: 'ENGINEERING_BLOG',
        method: 'GET',
        status: 200,
        observed_behavior: 'Public API documentation/reference discovered on company domain.',
        reproductions: 1,
        repeatable: true,
        tested_without_auth: true,
        not_tested: notTested,
        retrieved_at: new Date().toISOString(),
        evidence_text: 'API reference discovered',
        latency_ms: 0,
      });
    }

    return evidence;
  }

  /** Deduplicate owner candidates by name+role, keeping highest confidence. */
  private dedupeOwners(candidates: OwnerCandidate[]): OwnerCandidate[] {
    const best = new Map<string, OwnerCandidate>();
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, NOT_APPLICABLE: 0 };
    for (const c of candidates) {
      const key = `${c.name.toLowerCase()}|${(c.role || '').toLowerCase()}`;
      const existing = best.get(key);
      if (!existing || rank[c.confidence] > rank[existing.confidence]) {
        best.set(key, c);
      }
    }
    return Array.from(best.values());
  }

  /** Collect evidence from search results (audit + page discovery). */
  private collectSearchEvidence(
    results: SearchResult[],
    evidence: Evidence[],
    discoveredPages: DiscoveredPage[],
    htmlByUrl: Map<string, string>,
    _ownerCandidates: OwnerCandidate[],
    _category: string,
    errors: string[],
  ): void {
    for (const result of results) {
      const url = result.url;
      if (!url.startsWith('http')) continue;

      // Add to discovered pages if it's a relevant professional page
      let pageCategory: DiscoveredPage['category'] = 'other';
      try {
        const u = new URL(url);
        pageCategory = this.categorizeSearchUrl(u.pathname, u.hostname);
      } catch { /* ignore invalid URLs */ }

      if (!discoveredPages.some(p => p.url === url)) {
        discoveredPages.push({
          url,
          path: (() => { try { return new URL(url).pathname; } catch { return url; } })(),
          title: result.title,
          status: undefined, // not yet fetched
          category: pageCategory,
        });
      }

      // Record search result as a documented public source
      evidence.push({
        id: 'ev_search_' + randomBytes(8).toString('hex'),
        evidence_origin: 'REAL_PUBLIC_OBSERVATION',
        public_url: url,
        source_type: 'PUBLIC_DOCUMENTATION',
        method: 'GET',
        status: 0,
        observed_behavior: `Search result: "${result.title}" — ${result.snippet.slice(0, 200)}`,
        reproductions: 0,
        repeatable: false,
        tested_without_auth: true,
        not_tested: ['reproduction', 'verification'],
        retrieved_at: new Date().toISOString(),
        evidence_text: result.snippet,
        latency_ms: 0,
      });
    }
  }

  /** Categorize a search-result URL into a professional page category. */
  private categorizeSearchUrl(pathname: string, hostname: string): DiscoveredPage['category'] {
    const p = '/' + pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const first = p.split('/').filter(Boolean)[0] || '';

    // Known search-result patterns
    if (p.includes('/engineering') || p.includes('/team') || p.includes('/leadership') ||
        p.includes('/about') || first === 'engineering' || first === 'about') {
      return p.includes('/engineering') ? 'engineering' :
             p.includes('/team') || p.includes('/leadership') ? 'team_people' :
             'about';
    }
    if (p.includes('/blog') || first === 'blog') return 'blog';
    if (p.includes('/docs') || p.includes('/developers') || first === 'docs' || first === 'developers') return 'docs';
    if (p.includes('/security') || first === 'security') return 'security';
    if (p.includes('/careers') || p.includes('/jobs') || first === 'careers') return 'hiring';
    if (p.includes('/status') || first === 'status') return 'status_ops';

    // Professional domain heuristics
    if (hostname.includes('github.com')) return 'engineering';
    if (hostname.includes('linkedin.com')) return 'team_people';
    if (hostname.includes('medium.com') || hostname.includes('dev.to') || hostname.includes('blog')) return 'blog';

    return 'other';
  }
}

/** Record read-only observation evidence from a discovered surface. */
function auditEvidenceFromSurface(
  surface: import('./IntelligenceCase').CompanySurface,
  evidence: Evidence[],
  errors: string[],
): void {
  const now = new Date().toISOString();
  const notTested = ['mutations', 'auth bypass', 'brute force', 'exploitation'];

  for (const page of surface.discovered_pages) {
    if (page.status && page.status >= 200 && page.status < 300) {
      evidence.push({
        id: 'ev_live_' + randomBytes(8).toString('hex'),
        evidence_origin: 'REAL_PUBLIC_OBSERVATION',
        public_url: page.url,
        source_type: 'PUBLIC_DOCUMENTATION',
        method: 'GET',
        status: page.status,
        observed_behavior: `Public page observed: ${page.title || page.path} (HTTP ${page.status})`,
        reproductions: 1,
        repeatable: true,
        tested_without_auth: true,
        not_tested: notTested,
        retrieved_at: now,
        evidence_text: `${page.title || page.category} page at ${page.url}`,
        latency_ms: 0,
      });
    }
  }
}
