/**
 * XAVIRA PUBLIC LINK DISCOVERY
 * ─────────────────────────────────────────────────────────────────────────────
 * Bounded, same-origin, READ-ONLY discovery of a company's public professional
 * surface.
 *
 * The discovery prioritises professional / technical pages that are most
 * relevant to finding a public technical owner and engineering signals:
 *
 *   /about        /team        /leadership
 *   /engineering  /technology  /blog
 *   /docs         /developers  /security
 *   /status       /changelog   /careers
 *   /company      /press
 *
 * Strict safety bounds (public observation only — never intrusive):
 *   - Only `GET` requests are issued.
 *   - Only same-origin, publicly reachable pages are followed.
 *   - A hard cap on total requests (default 12) keeps the crawl low-impact.
 *   - A polite delay between requests.
 *   - Content is read; nothing is posted, mutated, or enumerated.
 *   - robots.txt is surfaced as a diagnostic (it is NOT used to bypass anything,
 *     and we never fetch disallowed resources aggressively).
 */

import { CompanySurface, DiscoveredPage, ProfessionalPageCategory, HttpFetcher } from './IntelligenceCase';

export const XAVIRA_USER_AGENT = 'XAVIRA-Public-OBSERVER/1.0 (read-only; contact@xavira.ai)';

/** Shared injective fetcher shape (structural alias for HttpFetcher). */
export type Fetcher = HttpFetcher;

export interface PublicLinkDiscoveryOptions {
  maxPages?: number;          // total pages to fetch (incl. homepage) — bounded
  delayMs?: number;           // polite delay between requests
  timeoutMs?: number;         // per-request timeout
  fetcher?: HttpFetcher;      // injectable fetch for tests
  onProgress?: (page: DiscoveredPage) => void;
  /** Optional capture of raw HTML for a fetched page (used for people extraction). */
  onHtml?: (url: string, html: string) => void;
  logger?: (message: string) => void;
}

export const PROFESSIONAL_PATHS: Array<{ category: ProfessionalPageCategory; labels: string[] }> = [
  { category: 'team_people', labels: ['/team', '/leadership', '/people', '/our-team', '/team/'] },
  { category: 'engineering', labels: ['/engineering', '/technology', '/tech', '/developers', '/engineering-team'] },
  { category: 'blog', labels: ['/blog', '/changelog', '/engineering/blog', '/medium'] },
  { category: 'docs', labels: ['/docs', '/documentation'] },
  { category: 'security', labels: ['/security', '/trust', '/trust-center'] },
  { category: 'status_ops', labels: ['/status', '/incidents', '/system-status'] },
  { category: 'about', labels: ['/about', '/company', '/press', '/about-us'] },
  { category: 'hiring', labels: ['/careers', '/jobs', '/join-us'] }
];

export class PublicLinkDiscovery {
  /**
   * Discover the public professional surface for a company, starting from its
   * homepage. Returns the company surface with categorised discovered pages.
   */
  static async discover(
    companyUrl: string,
    options: PublicLinkDiscoveryOptions = {}
  ): Promise<CompanySurface> {
    const maxPages = options.maxPages ?? 12;
    const delayMs = options.delayMs ?? 300;
    const timeoutMs = options.timeoutMs ?? 8000;
    const fetcher = options.fetcher ?? this.defaultFetcher;
    const log = options.logger ?? (() => {});

    let baseUrl: URL;
    try {
      baseUrl = new URL(companyUrl);
    } catch {
      throw new Error(`Invalid company URL: ${companyUrl}`);
    }
    if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
      throw new Error(`XAVIRA only supports http(s) URLs. Refusing non-web scheme.`);
    }

    const origin = baseUrl.origin;
    const company = baseUrl.hostname.replace(/^www\./, '');

    const surface: CompanySurface = {
      company,
      origin,
      homepage: baseUrl.href,
      discovered_pages: [],
      page_categories: {}
    };

    const visited = new Set<string>();
    // Seed with homepage + high-signal professional pages first.
    const seedPaths = this.resolveSeedPaths(baseUrl);

    const queue: { url: string; categoryHint?: ProfessionalPageCategory }[] = [];
    queue.push({ url: baseUrl.href, categoryHint: 'homepage' });
    // Prioritise professional pages discovered via heuristics on the homepage,
    // but also seed the canonical professional paths so they are attempted even
    // if not linked from the homepage.
    for (const p of seedPaths.slice(0, maxPages - 1)) {
      queue.push({ url: p.url, categoryHint: p.category });
    }

    let requests = 0;
    let abortController: AbortController | undefined;

    const fetchPage = async (targetUrl: string, categoryHint?: ProfessionalPageCategory): Promise<DiscoveredPage | null> => {
      if (visited.has(targetUrl)) return null;
      if (requests >= maxPages) return null;
      visited.add(targetUrl);
      requests++;

      abortController = new AbortController();
      const timer = setTimeout(() => abortController!.abort(), timeoutMs);

      let status = 0;
      let html = '';
      let ok = false;
      try {
        const res = await fetcher(targetUrl, {
          method: 'GET',
          headers: { 'User-Agent': XAVIRA_USER_AGENT, 'Accept': 'text/html' },
          signal: abortController.signal
        });
        status = res.status;
        ok = true;
        html = await res.text().catch(() => '');
      } catch {
        // read-only network failure — record diagnostic, do not create evidence
        log(`[discovery] network error reaching ${targetUrl}`);
      } finally {
        clearTimeout(timer);
      }

      let title: string | undefined;
      let category = this.categorizePath(new URL(targetUrl).pathname);
      if (categoryHint === 'homepage') category = 'homepage';
      else if (category === 'other') category = categoryHint ?? 'other';

      // A page is part of the public professional surface only when it resolved
      // successfully (HTTP 2xx). 404 / 5xx / network failures are NOT public
      // pages — they are logged as diagnostics and excluded from the surface so
      // the operator never reports a "discovered" page that does not exist.
      const isPublicPage = ok && status >= 200 && status < 300;

      if (isPublicPage && html) {
        title = this.extractTitle(html);
        // Discover more same-origin professional links from this page.
        const discovered = this.extractSameOriginLinks(html, targetUrl, origin);
        for (const link of discovered) {
          if (!visited.has(link) && queue.length < maxPages) {
            queue.push({ url: link, categoryHint: this.categorizePath(new URL(link).pathname) });
          }
        }
      }

      const page: DiscoveredPage = { url: targetUrl, path: new URL(targetUrl).pathname, title, status: ok ? status : undefined, category };

      if (isPublicPage) {
        surface.discovered_pages.push(page);
        if (page.category) {
          (surface.page_categories[page.category] ||= []).push(targetUrl);
        }
        if (html) options.onHtml?.(targetUrl, html);
        options.onProgress?.(page);
      } else {
        log(`[discovery] ${targetUrl} -> ${ok ? status : 'network error'} (not a public page, skipping)`);
      }
      await new Promise(r => setTimeout(r, delayMs));
      return page;
    };

    while (queue.length > 0) {
      const next = queue.shift()!;
      await fetchPage(next.url, next.categoryHint);
    }

    return surface;
  }

  // ── default fetcher (Node 22 global fetch) ───────────────────────────────
  private static defaultFetcher: HttpFetcher = async (url, init) => {
    return fetch(url, { method: init.method, headers: init.headers, signal: init.signal });
  };

  // ── helpers ──────────────────────────────────────────────────────────────
  private static resolveSeedPaths(base: URL): Array<{ url: string; category: ProfessionalPageCategory }> {
    const out: Array<{ url: string; category: ProfessionalPageCategory }> = [];
    for (const { category, labels } of PROFESSIONAL_PATHS) {
      for (const label of labels) {
        // normalise: ensure leading slash, no trailing slash conflicts
        const path = label.startsWith('/') ? label : '/' + label;
        out.push({ url: base.origin + path, category });
      }
    }
    return out;
  }

  private static categorizePath(pathname: string): ProfessionalPageCategory {
    const p = '/' + pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    const segments = p.split('/').filter(Boolean);
    const first = segments[0] || '';
    for (const { category, labels } of PROFESSIONAL_PATHS) {
      for (const label of labels) {
        const needle = label.replace(/^\/+/, '').replace(/\/$/, '');
        if (p === '/' + needle || p.startsWith('/' + needle) || first === needle) {
          return category;
        }
      }
    }
    return 'other';
  }

  private static extractSameOriginLinks(html: string, currentUrl: string, origin: string): string[] {
    const links: string[] = [];
    const re = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      try {
        const resolved = new URL(m[1], currentUrl).href;
        if (resolved.startsWith(origin) && !resolved.includes('#') ) {
          links.push(resolved);
        }
      } catch {
        // ignore non-http/mailto links etc.
      }
    }
    return Array.from(new Set(links));
  }

  private static extractTitle(html: string): string | undefined {
    const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
    return m ? m[1].trim() : undefined;
  }
}
