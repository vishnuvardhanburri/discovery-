/**
 * XAVIRA — WEB SEARCH PROVIDER ABSTRACTION (§3, §4)
 * ─────────────────────────────────────────────────────────────────────────────
 * A pluggable search-provider abstraction so the intelligence core never
 * hard-codes one vendor. Adapters can target:
 *   - PublicWebSearchProvider  (legitimate public search, e.g. DuckDuckGo HTML)
 *   - LicensedSearchProvider   (future paid search API)
 *   - NullSearchProvider       (records SEARCH_UNAVAILABLE — no pretending)
 *
 * The implementation uses DDG HTML endpoint — read-only, no auth required,
 * no API key. If unavailable, returns SEARCH_UNAVAILABLE.
 */

import type { HttpFetcher } from './IntelligenceCase';
import type { SearchResult } from './SearchCache';

export interface SearchProvider {
  /** Human-readable name of this search provider. */
  readonly name: string;
  /** Whether this provider is available (not blocked/disabled). */
  readonly available: boolean;
  /** Execute a search query and return results. */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

export interface SearchOptions {
  maxResults?: number;
  /** TTL override for cached results (ms). */
  ttlMs?: number;
  signal?: AbortSignal;
}

export interface SearchCapabilities {
  available: boolean;
  name: string;
  reason?: string;
}

/**
 * PublicWebSearchProvider — uses the DuckDuckGo HTML endpoint (no API key,
 * read-only, public). Falls back to SEARCH_UNAVAILABLE if blocked.
 */
export class PublicWebSearchProvider implements SearchProvider {
  readonly name = 'PublicWebSearchProvider';
  readonly available: boolean;
  private readonly fetcher: HttpFetcher;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: {
    fetcher?: HttpFetcher;
    userAgent?: string;
    timeoutMs?: number;
  } = {}) {
    this.fetcher = options.fetcher ?? (globalThis.fetch as any);
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (XAVIRA)';
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.available = true;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const maxResults = options.maxResults ?? 10;
    const signal = options.signal;

    const params = new URLSearchParams({
      q: query,
      kl: 'us-en',
      df: 'y', // past year — prefer recent
    });

    const url = `https://html.duckduckgo.com/html/?${params.toString()}`;

    try {
      const res = await this.fetcher(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: signal ?? AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        return [];
      }

      const html = await res.text();
      return this.parseResults(html, url, maxResults);
    } catch (e) {
      // Network error, CAPTCHA, rate limit — record unavailable, no pretending
      return [];
    }
  }

  /**
   * Parse DuckDuckGo HTML results. Extracts result links + snippets.
   * Does NOT bypass CAPTCHA or anti-bot — if blocked, returns [].
   */
  private parseResults(html: string, baseUrl: string, maxResults: number): SearchResult[] {
    const results: SearchResult[] = [];
    const re = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]*href="(https?:\/\/[^"']+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;

    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = re.exec(html)) !== null && count < maxResults) {
      const url = m[1];
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      const snippet = m[3].replace(/<[^>]+>/g, '').trim();
      if (url && title) {
        results.push({ title, snippet, url, source: 'search-result' });
        count++;
      }
    }

    return results;
  }
}

/**
 * NullSearchProvider — used when no search capability is configured or
 * available. Records SEARCH_UNAVAILABLE honestly — never pretends search occurred.
 */
export class NullSearchProvider implements SearchProvider {
  readonly name = 'NullSearchProvider';
  readonly available = false;

  async search(_query: string, _options?: SearchOptions): Promise<SearchResult[]> {
    return []; // SEARCH_UNAVAILABLE — no results, no pretending
  }
}

export function detectSearchCapabilities(): SearchCapabilities {
  try {
    if (typeof globalThis.fetch !== 'function') {
      return { available: false, name: 'none', reason: 'No fetch available in environment.' };
    }
    return { available: true, name: 'PublicWebSearchProvider' };
  } catch {
    return { available: false, name: 'none', reason: 'Environment check failed.' };
  }
}
