import { Evidence, PublicObservationProvider, ObservationOptions, ObservationResult, HttpFetcher, SourceState, EvidenceClassification, Provenance, ProviderExecutionResult } from './IntelligenceCase';
import { randomBytes } from 'crypto';

/**
 * No longer using a static list of SUBDOMAIN_CANDIDATES to avoid blind enumeration.
 * Discovery is now handled by the SourceDiscoveryOrchestrator.
 */

/** Extract the registrable root domain from a hostname (e.g. "example.com" from "api.sub.example.com"). */
function extractRootDomain(hostname: string): string {
  let h = hostname.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length >= 3) {
    h = parts.slice(-2).join('.');
  }
  return h;
}

/** Check if a hostname is on the same root domain. */
function isSameRootDomain(hostname: string, rootDomain: string): boolean {
  return hostname === rootDomain || hostname.endsWith('.' + rootDomain);
}

export class LivePublicObservationProvider implements PublicObservationProvider {
  private visited = new Set<string>();
  private rateLimitedUrls: string[] = [];
  private discovery_errors = 0;

  constructor(private options?: {
    onPage?: (url: string, status: number, latency: number) => void;
    fetcher?: HttpFetcher;
    delayMs?: number;
    sampleDelayMs?: number;
    maxRequests?: number;
  }) {}

  /** Probe a single URL and return the response details. */
  private async probeUrl(url: string, options?: ObservationOptions): Promise<{
    status: number; latency: number; text: string; contentType: string | null;
  }> {
    const fetcher: HttpFetcher = this.options?.fetcher ?? (async (u, init) => fetch(u, { method: init.method, headers: init.headers, signal: init.signal }));
    const start = performance.now();
    const response = await fetcher(url, {
      method: 'GET',
      headers: options?.headers || { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(options?.timeoutMs || 8000),
    });
    const latency = Math.round(performance.now() - start);
    const text = await response.text().catch(() => '');
    return {
      status: response.status,
      latency,
      text,
      contentType: response.headers.get('content-type'),
    };
  }

  /** Observe a single URL: fetch, measure, classify, and return evidence. */
  private async observeUrl(url: string, options: any, notTested: string[], rootDomain: string, provenance: Partial<Provenance>): Promise<{
    evidence: Evidence | null;
  }> {
    const start = performance.now();
    let response: Response;
    try {
      const fetcher: HttpFetcher = this.options?.fetcher ?? (async (u, init) => fetch(u, { method: init.method, headers: init.headers, signal: init.signal }));
      response = await fetcher(url, {
        method: 'GET',
        headers: options?.headers || { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: AbortSignal.timeout(options?.timeoutMs || 8000),
      });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('429') || err.message?.includes('rate')) {
        this.rateLimitedUrls.push(url);
      } else {
        this.discovery_errors++;
        console.log(`[FETCH_FAILED] ${url}: ${err.message}`);
      }
      return { evidence: null };
    }

    const latency = Math.round(performance.now() - start);
    const text = await response.text().catch(() => '');
    const status = response.status;

    if (status === 429) {
      this.rateLimitedUrls.push(url);
    }

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const source_type = isJson || url.includes('/api/') ? 'API_ENDPOINT' : 'PUBLIC_DOCUMENTATION';

    const evidence = this.createEvidence(url, status, `HTTP ${status} observed`, 1, false, notTested, text, provenance);
    evidence.latency_ms = latency;
    evidence.baseline_latency_ms = latency;
    evidence.source_type = source_type;

    // ALWAYS perform repeated observations for stability measurement,
    // regardless of whether the first sample is "interesting".
    const samples = await this.performRepeatedObservations(url, 2, options);
    evidence.latency_samples = [latency, ...samples.map(s => s.latency)];
    evidence.baseline_latency_ms = Math.min(...evidence.latency_samples) || latency;
    evidence.reproductions = 1 + samples.length;

    // Repeatability is a transport fact: did the status remain consistent?
    evidence.repeatable = samples.every(s => s.status === status);

    // BEHAVIORAL PROMOTION:
    // We preserve the existing thresholds for 'observed_behavior' markers,
    // but we no longer use them as gates for data collection.
    const latencyTriggered = latency > 1500;
    if (status >= 500 && evidence.repeatable && evidence.latency_samples.length >= 3) {
      evidence.observed_behavior = `Repeated HTTP ${status} response`;
    } else if (latencyTriggered && evidence.repeatable) {
      evidence.observed_behavior = evidence.observed_behavior
        ? `${evidence.observed_behavior} — slow latency reproduced across ${evidence.reproductions} sample(s).`
        : `Slow latency (${latency}ms) reproduced across ${evidence.reproductions} sample(s).`;
    }

    if (isJson && text) {
      try {
        const parsed = JSON.parse(text);
        const fields = this.extractFields(parsed);
        evidence.observed_fields = fields;
        const sensitive = fields.filter(f =>
          /(password|passwd|token|secret|credential|api_key|private_key|storage_path|internal_path|cluster_ip|internal_host|debug|stack_trace)/i.test(f)
        );
        if (sensitive.length > 0) {
          evidence.sensitive_fields = sensitive;
          evidence.observed_behavior = `Exposes fields matching sensitive or operational internal metadata.`;
        }
      } catch (e) {}
    }

    return { evidence };
  }

  async observePublicSurface(url: string, options?: any): Promise<ProviderExecutionResult<Evidence>> {
    this.visited.clear();
    this.rateLimitedUrls = [];
    this.discovery_errors = 0;

    const baseUrl = new URL(url);
    const targetOrigin = baseUrl.origin;
    const targetHostname = baseUrl.hostname;
    const rootDomain = extractRootDomain(targetHostname);

    if (options?.requiredOrigin) {
      const urlObj = new URL(url);
      const urlHostname = urlObj.hostname;
      const required = options.requiredOrigin;

      if (urlHostname !== required && !urlHostname.endsWith('.' + required)) {
        console.log(`[IDENTITY_GUARD] Blocked access to external origin: ${urlHostname}. Required: ${required}`);
        this.discovery_errors++;
        return {
          status: 'UNAVAILABLE',
          provider: 'LivePublicObservationProvider',
          observations: [],
          metadata: { requestsAttempted: 0 }
        };
      }
    }

    const evidenceList: Evidence[] = [];
    const notTested = ['mutations', 'auth bypass', 'authorization bypass', 'brute force', 'fuzzing', 'exploit execution'];
    let requestCount = 0;
    const maxRequests = this.options?.maxRequests ?? 20;

    this.queue = [url];

    while (this.queue.length > 0 && requestCount < maxRequests) {
      const currentUrl = this.queue.shift()!;
      if (this.visited.has(currentUrl)) continue;
      this.visited.add(currentUrl);

      requestCount++;
      const { evidence } = await this.observeUrl(currentUrl, options, notTested, rootDomain, {
        source_url: currentUrl,
        canonical_url: currentUrl,
        retrieval_timestamp: new Date().toISOString(),
        provider: 'LivePublicObservationProvider',
        attribution: 'Direct Observation',
        classification: 'OBSERVATION'
      });
      if (evidence) evidenceList.push(evidence);

      await new Promise(r => setTimeout(r, this.options?.delayMs ?? 200));
    }

    let status: ProviderExecutionStatus = 'SUCCESS';
    if (this.rateLimitedUrls.length > 0) {
      status = 'RATE_LIMITED';
    } else if (evidenceList.length === 0) {
      status = 'EMPTY';
    } else if (this.discovery_errors > (requestCount * 0.5)) {
      status = 'ERROR';
    }

    return {
      status,
      provider: 'LivePublicObservationProvider',
      observations: evidenceList,
      metadata: {
        requestsAttempted: requestCount,
        sourceCount: evidenceList.length
      }
    };
  }

  private async performRepeatedObservations(url: string, count: number, options?: ObservationOptions) {
    const results = [];
    for (let i = 0; i < count; i++) {
      await new Promise(r => setTimeout(r, this.options?.sampleDelayMs ?? 300));
      const start = performance.now();
      try {
        const fetcher: HttpFetcher = this.options?.fetcher ?? (async (u, init) => fetch(u, { method: init.method, headers: init.headers, signal: init.signal }));
        const res = await fetcher(url, { method: 'GET', headers: options?.headers || {}, signal: AbortSignal.timeout(options?.timeoutMs || 8000) });
        await res.arrayBuffer().catch(()=>null);
        results.push({ status: res.status, latency: Math.round(performance.now() - start) });
      } catch (err) {}
    }
    return results;
  }

  private extractFields(obj: any, prefix = '', limit = 100): string[] {
    let fields: string[] = [];
    if (fields.length > limit) return fields;

    if (obj !== null && typeof obj === 'object') {
      if (Array.isArray(obj)) {
        if (obj.length > 0) fields.push(...this.extractFields(obj[0], prefix, limit));
      } else {
        for (const [key, val] of Object.entries(obj)) {
          fields.push(key);
          fields.push(...this.extractFields(val, key + '.', limit));
        }
      }
    }
    return Array.from(new Set(fields)).slice(0, limit);
  }

  private createEvidence(url: string, status: number, behavior: string, reps: number, rep: boolean, notTested: string[], text: string = '', provenance: Partial<Provenance>): Evidence {
    return {
      id: 'ev_live_' + randomBytes(8).toString('hex'),
      provenance: {
        source_url: provenance.source_url || url,
        canonical_url: provenance.canonical_url || url,
        source_type: provenance.source_type || 'UNKNOWN',
        discovery_mechanism: provenance.discovery_mechanism || 'API_DISCOVERY',
        retrieval_timestamp: provenance.retrieval_timestamp || new Date().toISOString(),
        provider: provenance.provider || 'LivePublicObservationProvider',
        attribution: provenance.attribution || 'Direct Observation',
        classification: provenance.classification || 'OBSERVATION'
      },
      evidence_origin: 'REAL_PUBLIC_OBSERVATION',
      public_url: url,
      source_type: provenance.source_type || 'UNKNOWN',
      method: 'GET',
      status,
      observed_behavior: behavior,
      reproductions: reps,
      repeatable: rep,
      tested_without_auth: true,
      not_tested: notTested,
      retrieved_at: new Date().toISOString(),
      evidence_text: text,
      raw_observation: text
    };
  }
}
