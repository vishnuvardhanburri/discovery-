/**
 * XAVIRA — SOURCE REGISTRY
 * ─────────────────────────────────────────────────────────────────────────────
 * Every public source the crawler may visit gets registered here with:
 *   domain, category, priority, authority metadata, allowed/blocked,
 *   last_checked, notes.
 *
 * The crawler MUST check the registry before visiting any URL.
 * Sources are prioritized based on technical relevance, company relationship,
 * source quality, freshness, and likelihood of useful evidence.
 */
import type { SourceEntry, SourceCategory } from './Model';

interface AuthorityMetadata {
  /** Trust score 0-100 (editorial sources = 90+, user-content = 30). */
  trust_score?: number;
  /** Whether the source exposes structured data (JSON-LD, OGP). */
  structured_data?: boolean;
  /** Whether the source is rate-limited / anti-bot protected. */
  rate_limited?: boolean;
  /** Content language hint. */
  language?: string;
}

export class SourceRegistry {
  private sources: Map<string, SourceEntry> = new Map();

  /** Register a source. Overwrites if the domain already exists. */
  register(source: SourceEntry): void {
    const key = this.canonicalDomain(source.domain);
    this.sources.set(key, { ...source });
  }

  /** Bulk-register from a list. */
  registerAll(sources: SourceEntry[]): void {
    for (const s of sources) this.register(s);
  }

  /** Check if a URL is allowed to be crawled. */
  isAllowed(url: string): boolean {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      const entry = this.sources.get(this.canonicalDomain(domain));
      if (!entry) return false; // unknown → not allowed (explicit allow-list)
      return entry.allowed && !entry.blocked;
    } catch {
      return false;
    }
  }

  /** Look up a source entry by domain. */
  get(domain: string): SourceEntry | undefined {
    return this.sources.get(this.canonicalDomain(domain));
  }

  /** Get sources prioritized by technical relevance for a given company. */
  getPrioritizedForCompany(companyDomain: string | null): SourceEntry[] {
    const all = Array.from(this.sources.values());
    // Always prioritize the company's own domain + its subdomains
    return all.sort((a, b) => {
      const aIsCompany = a.domain === companyDomain;
      const bIsCompany = b.domain === companyDomain;
      if (aIsCompany && !bIsCompany) return -1;
      if (!aIsCompany && bIsCompany) return 1;
      return b.priority - a.priority;
    });
  }

  /** Record the last-checked timestamp for a domain. */
  markChecked(domain: string, when: string = new Date().toISOString()): void {
    const key = this.canonicalDomain(domain);
    const entry = this.sources.get(key);
    if (entry) entry.last_checked = when;
  }

  /** Get all sources in a category. */
  getByCategory(category: SourceCategory): SourceEntry[] {
    return Array.from(this.sources.values()).filter(s => s.category === category);
  }

  private canonicalDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '').replace(/\/.*$/, '');
  }

  /** Build a default registry with well-known technical sources. */
  static createDefault(): SourceRegistry {
    const reg = new SourceRegistry();
    reg.registerAll([
      { domain: 'github.com', category: 'GITHUB', priority: 100, authority_metadata: { trust_score: 95, structured_data: true }, allowed: true, blocked: false, last_checked: null, notes: 'Official GitHub — public repos and engineering orgs.' },
      { domain: 'raw.githubusercontent.com', category: 'GITHUB', priority: 80, authority_metadata: { trust_score: 95, structured_data: true }, allowed: true, blocked: false, last_checked: null, notes: 'Raw GitHub file hosting.' },
      { domain: 'api.github.com', category: 'GITHUB', priority: 95, authority_metadata: { trust_score: 95, rate_limited: true }, allowed: true, blocked: false, last_checked: null, notes: 'GitHub REST API — public metadata only.' },
      { domain: 'vercel.com', category: 'PROFESSIONAL', priority: 50, authority_metadata: { trust_score: 75 }, allowed: true, blocked: false, last_checked: null, notes: 'Company websites / Vercel deployments.' },
      { domain: 'netlify.app', category: 'PROFESSIONAL', priority: 45, authority_metadata: { trust_score: 65 }, allowed: true, blocked: false, last_checked: null, notes: 'Static site deployments.' },
      { domain: 'linkedin.com', category: 'PROFESSIONAL', priority: 40, authority_metadata: { trust_score: 80, rate_limited: true }, allowed: true, blocked: false, last_checked: null, notes: 'Professional profiles — public pages only.' },
    ]);
    return reg;
  }
}
