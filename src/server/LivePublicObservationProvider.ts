import { Evidence, PublicObservationProvider, ObservationOptions, ObservationResult, HttpFetcher } from './IntelligenceCase';
import { randomBytes } from 'crypto';

export class LivePublicObservationProvider implements PublicObservationProvider {
  private visited = new Set<string>();
  private queue: string[] = [];
  
  constructor(private options?: {
    onPage?: (url: string, status: number, latency: number) => void;
    /** Injectable fetcher (defaults to the runtime global fetch). */
    fetcher?: HttpFetcher;
    /** Polite delay between requests (default 200ms). */
    delayMs?: number;
  }) {}
  
  async observePublicSurface(url: string, options?: ObservationOptions): Promise<ObservationResult> {
    const evidenceList: Evidence[] = [];
    let discovery_errors = 0;
    
    const baseUrl = new URL(url);
    const targetOrigin = baseUrl.origin;

    this.queue.push(url);
    this.queue.push(`${targetOrigin}/robots.txt`);
    this.queue.push(`${targetOrigin}/sitemap.xml`);

    const maxRequests = 20;
    let requestCount = 0;

    const notTested = ['mutations', 'auth bypass', 'authorization bypass', 'brute force', 'fuzzing', 'exploit execution'];

    while (this.queue.length > 0 && requestCount < maxRequests) {
      const currentUrl = this.queue.shift()!;
      if (this.visited.has(currentUrl)) continue;
      this.visited.add(currentUrl);

      requestCount++;
      let response: Response;
      const start = performance.now();
      
      try {
        const fetcher: HttpFetcher = this.options?.fetcher ?? (async (u, init) => fetch(u, { method: init.method, headers: init.headers, signal: init.signal }));
        response = await fetcher(currentUrl, {
          method: 'GET',
          headers: options?.headers || { 'User-Agent': 'XAVIRA-Public-Observer/1.0' },
          signal: AbortSignal.timeout(options?.timeoutMs || 8000)
        });
      } catch (err: any) {
        // Do NOT create REAL_PUBLIC_OBSERVATION. Record an error diagnostic instead.
        discovery_errors++;
        continue;
      }

      const latency = Math.round(performance.now() - start);
      const text = await response.text().catch(() => '');
      const status = response.status;
      
      if (response.headers.get('content-type')?.includes('text/html')) {
        const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;
        let match;
        while ((match = linkRegex.exec(text)) !== null) {
          try {
            const discoveredUrl = new URL(match[1], currentUrl).href;
            if (discoveredUrl.startsWith(targetOrigin) && !this.visited.has(discoveredUrl)) {
              if (this.queue.length < 30) this.queue.push(discoveredUrl);
            }
          } catch (e) {}
        }
      }

      let evidence = this.createEvidence(currentUrl, status, `HTTP ${status} observed`, 1, false, notTested);
      evidence.latency_ms = latency;
      
      const isJson = response.headers.get('content-type')?.includes('application/json');
      evidence.source_type = isJson || currentUrl.includes('/api/') ? 'API_ENDPOINT' : 'PUBLIC_DOCUMENTATION';

      if (status >= 500 || latency > 1500 || isJson) {
        const samples = await this.performRepeatedObservations(currentUrl, 2, options);
        evidence.latency_samples = [latency, ...samples.map(s => s.latency)];
        evidence.baseline_latency_ms = Math.min(...evidence.latency_samples);
        evidence.reproductions = 1 + samples.length;
        evidence.repeatable = samples.every(s => s.status === status);
        
        if (status >= 500 && evidence.repeatable) {
          evidence.observed_behavior = `Repeated HTTP ${status} response`;
        }
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

      evidenceList.push(evidence);
      this.options?.onPage?.(currentUrl, status, latency);
      await new Promise(r => setTimeout(r, this.options?.delayMs ?? 200));
    }

    return { evidence: evidenceList, discovery_errors };
  }

  private async performRepeatedObservations(url: string, count: number, options?: ObservationOptions) {
    const results = [];
    for (let i = 0; i < count; i++) {
      await new Promise(r => setTimeout(r, 300));
      const start = performance.now();
      try {
        const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(options?.timeoutMs || 8000) });
        await res.arrayBuffer().catch(()=>null);
        results.push({ status: res.status, latency: Math.round(performance.now() - start) });
      } catch (err) {
        // Drop network failures from repetition samples safely
      }
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

  private createEvidence(url: string, status: number, behavior: string, reps: number, rep: boolean, notTested: string[]): Evidence {
    return {
      id: 'ev_live_' + randomBytes(8).toString('hex'),
      evidence_origin: 'REAL_PUBLIC_OBSERVATION',
      public_url: url,
      source_type: 'UNKNOWN',
      method: 'GET',
      status,
      observed_behavior: behavior,
      reproductions: reps,
      repeatable: rep,
      tested_without_auth: true,
      not_tested: notTested,
      retrieved_at: new Date().toISOString(),
      evidence_text: ''
    };
  }
}
