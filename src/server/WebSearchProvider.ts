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

export enum SearchFailureReason {
  SEARCH_BLOCKED = 'SEARCH_BLOCKED', // CAPTCHA, 403, Bot detection
  SEARCH_UNAVAILABLE = 'SEARCH_UNAVAILABLE', // 5xx, Network timeout
  SEARCH_EMPTY = 'SEARCH_EMPTY', // 200 OK but no results
  SEARCH_RATE_LIMITED = 'SEARCH_RATE_LIMITED', // 429
  SEARCH_PARSE_ERROR = 'SEARCH_PARSE_ERROR' // HTML returned but no results extracted
}

export class WebSearchProviderManager {
  private providers: SearchProvider[] = [];
  private activeProviderIndex = 0;

  constructor(providers: SearchProvider[]) {
    this.providers = providers;
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchProviderResponse> {
    const tried: string[] = [];

    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[i];
      tried.push(provider.name);

      const result = await provider.search(query, options);

      // Success: result found
      if (result.results && result.results.length > 0) {
        return { ...result, provider: provider.name };
      }

      // If it was just EMPTY, we might still want to try others,
      // but usually EMPTY means EMPTY for that specific query.
      // However, for resilience, we only fallback on BLOCKED, UNAVAILABLE, or TIMEOUT.
      const failure = result.failureReason;
      if (failure !== SearchFailureReason.SEARCH_EMPTY && failure !== SearchFailureReason.SEARCH_PARSE_ERROR) {
        continue; // Try next provider
      }

      // If we get a a definitive EMPTY or PARSE_ERROR, we might stop or try others.
      // For now, we treat EMPTY as a signal to continue if other providers are available.
    }

    // Return the last failure reason if no results were found
    const lastResult = await this.providers[this.providers.length - 1].search(query, options);
    return lastResult;
  }
}

export interface SearchProviderResponse {
  results: SearchResult[];
  total?: number;
  provider?: string;
  error?: string;
  failureReason?: string;
  queries?: string[];
}

export interface SearchProvider {
  /** Human-readable name of this search provider. */
  readonly name: string;
  /** Whether this provider is available (not blocked/disabled). */
  readonly available: boolean;
  /** Execute a search query and return results. */
  search(query: string, options?: SearchOptions): Promise<SearchProviderResponse>;
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

  async search(query: string, options: SearchOptions = {}): Promise<SearchProviderResponse> {
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

      if (res.status === 403 || res.status === 429) {
        return {
          results: [],
          failureReason: res.status === 429 ? SearchFailureReason.SEARCH_RATE_LIMITED : SearchFailureReason.SEARCH_BLOCKED
        };
      }

      if (!res.ok) {
        return {
          results: [],
          failureReason: SearchFailureReason.SEARCH_UNAVAILABLE
        };
      }

      const html = await res.text();
      const results = this.parseResults(html, url, maxResults);

      if (results.length === 0) {
        // Heuristic: if the page contains search result markers but regex failed, it's a parse error.
        const isActuallyEmpty = html.includes('no results found') || html.length < 1000;
        if (!isActuallyEmpty && html.includes('href=')) {
          return {
            results: [],
            failureReason: SearchFailureReason.SEARCH_PARSE_ERROR
          };
        }
        return {
          results: [],
          failureReason: SearchFailureReason.SEARCH_EMPTY
        };
      }

      return { results };
    } catch (e) {
      return {
        results: [],
        failureReason: SearchFailureReason.SEARCH_UNAVAILABLE
      };
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

  async search(_query: string, _options?: SearchOptions): Promise<SearchProviderResponse> {
    return { results: [], failureReason: SearchFailureReason.SEARCH_UNAVAILABLE };
  }
}

export { SerperSearchProvider } from './providers/SerperSearchProvider';

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
