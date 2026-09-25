// FindingEngine offline tests — deep finding detector (Part B/C, rules R1-R8).
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import type { Evidence } from '../src/server/IntelligenceCase';
import type { DeepSignal } from '../src/server/DeepTypes';

let pass = 0, fail = 0; const failures: string[] = [];
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; failures.push(m); console.log('[FAIL] ' + m); } };
const assertEq = <T,>(a: T, b: T, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else { fail++; failures.push(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); console.log('[FAIL] ' + m); } };

const detect = (b: DeepProspectBuilder) => (b as any).detectDeepFinding.bind(b);

const mkEv = (over: Partial<Evidence> & { id: string; observed_behavior?: string; status?: number; sensitive_fields?: string[]; public_url?: string; reproductions?: number; latency_ms?: number; baseline_latency_ms?: number }): Evidence => ({
  evidence_origin: over.evidence_origin ?? 'REAL_PUBLIC_OBSERVATION',
  source_type: over.source_type ?? 'API_ENDPOINT',
  public_url: over.public_url ?? `https://api.acme.com/${over.id}`,
  status: over.status ?? 200,
  observed_behavior: over.observed_behavior ?? 'ok',
  reproductions: over.reproductions ?? 1, repeatable: over.repeatable ?? true,
  tested_without_auth: over.tested_without_auth ?? true,
  not_tested: over.not_tested ?? [],
  retrieved_at: over.retrieved_at ?? new Date().toISOString(),
  evidence_text: over.evidence_text ?? over.observed_behavior ?? 'ok',
  sensitive_fields: over.sensitive_fields, latency_ms: over.latency_ms, baseline_latency_ms: over.baseline_latency_ms,
  ...over,
} as Evidence);

const mkSig = (over: Partial<DeepSignal> & { signal_id: string; type: string; source_url: string; excerpt?: string; related_evidence_ids?: string[] }): DeepSignal => ({
  provenance: over.provenance ?? 'DOCUMENTED_FACT',
  signal_strength: over.signal_strength ?? 'MEDIUM',
  relevance: over.excerpt || '',
  ...over,
} as DeepSignal);

const b = new DeepProspectBuilder({ onProgress: () => {}, logger: () => {} });
const find = detect(b);

console.log('\n--- R1: sensitive metadata exposure ---');
{
  const obs = [mkEv({ id: 'E1', observed_behavior: 'response exposes storage_path', sensitive_fields: ['storage_path'], reproductions: 3 })];
  const f = find([], obs);
  assert(f !== null, 'R1 produces a finding');
  assertEq(f?.finding_type, 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', 'R1 type');
  assert(f?.evidence_ids.includes('E1'), 'R1 evidence id preserved');
  assert(f?.source_urls.length > 0, 'R1 source url present');
}

console.log('\n--- R2: repeated 5xx -> availability issue ---');
{
  const obs = [
    mkEv({ id: 'E1', status: 500, observed_behavior: '500 internal server error' }),
    mkEv({ id: 'E2', status: 502, observed_behavior: '502 bad gateway' }),
  ];
  const f = find([], obs);
  assertEq(f?.finding_type, 'OBSERVED_AVAILABILITY_ISSUE', 'R2 type');
  assert(f?.evidence_ids.length === 2, 'R2 two evidence ids');
}

console.log('\n--- R3: documented incident (PUBLIC_INCIDENT signal w/ incident language + evidence) ---');
{
  const obs = [mkEv({ id: 'E1', observed_behavior: 'status page documents outage', public_url: 'https://acme.com/status', source_type: 'STATUS_PAGE' as any })];
  const sig = mkSig({ signal_id: 'S1', type: 'PUBLIC_INCIDENT', source_url: 'https://acme.com/status', excerpt: 'Major outage resolved yesterday.', related_evidence_ids: ['E1'] });
  const f = find([sig], obs);
  assertEq(f?.finding_type, 'DOCUMENTED_INCIDENT', 'R3 type');
  assert(f?.evidence_ids.includes('E1'), 'R3 links evidence');
}

console.log('\n--- R4: documented engineering failure (article w/ failure language) ---');
{
  const sig = mkSig({ signal_id: 'S1', type: 'ENGINEERING_ARTICLE', source_url: 'https://acme.com/blog/postmortem', excerpt: 'Postmortem: we rolled back after a critical bug.', related_evidence_ids: [] });
  const obs = [mkEv({ id: 'E1', observed_behavior: 'read article', public_url: 'https://acme.com/blog/postmortem' })];
  const f = find([sig], obs);
  assertEq(f?.finding_type, 'DOCUMENTED_ENGINEERING_FAILURE', 'R4 type');
}

console.log('\n--- R5: documented scaling constraint ---');
{
  const sig = mkSig({ signal_id: 'S1', type: 'ARCHITECTURE_DISCUSSION', source_url: 'https://acme.com/docs/arch', excerpt: 'We rate-limit to 100 req/s per client to protect throughput.', related_evidence_ids: [] });
  const obs = [mkEv({ id: 'E1', observed_behavior: 'read docs', public_url: 'https://acme.com/docs/arch' })];
  const f = find([sig], obs);
  assertEq(f?.finding_type, 'DOCUMENTED_SCALING_CONSTRAINT', 'R5 type');
}

console.log('\n--- R6: observed latency (>=3 slow reproducible samples) ---');
{
  const obs = [
    mkEv({ id: 'E1', observed_behavior: 'slow', latency_ms: 2500, baseline_latency_ms: 100, reproductions: 3 }),
    mkEv({ id: 'E2', observed_behavior: 'slow', latency_ms: 2200, baseline_latency_ms: 100, reproductions: 3 }),
    mkEv({ id: 'E3', observed_behavior: 'slow', latency_ms: 3000, baseline_latency_ms: 100, reproductions: 3 }),
  ];
  const f = find([], obs);
  assertEq(f?.finding_type, 'OBSERVED_LATENCY', 'R6 type');
}

console.log('\n--- R7: public exposure (repeatable unauth + exposure language) ---');
{
  const obs = [mkEv({ id: 'E1', observed_behavior: 'config exposed without auth, accessible to anyone', reproductions: 4 })];
  const f = find([], obs);
  assertEq(f?.finding_type, 'POSSIBLE_PUBLIC_EXPOSURE', 'R7 type');
}

console.log('\n--- R8: access issue (repeatable 401/403 + denial language) ---');
{
  const obs = [mkEv({ id: 'E1', status: 403, observed_behavior: 'access denied — authentication required to view this resource', reproductions: 2 })];
  const f = find([], obs);
  assertEq(f?.finding_type, 'POSSIBLE_ACCESS_ISSUE', 'R8 type');
  assertEq(f?.impact_severity, 'LOW', 'R8 severity LOW');
}

console.log('\n--- Part B: generic engineering content NEVER becomes a finding ---');
{
  const sig = mkSig({ signal_id: 'S1', type: 'ENGINEERING_ARTICLE', source_url: 'https://acme.com/blog', excerpt: 'We migrated to microservices on AWS, Azure, and GCP.', related_evidence_ids: [] });
  const obs = [mkEv({ id: 'E1', observed_behavior: 'a general blog post', public_url: 'https://acme.com/blog' })];
  const f = find([sig], obs);
  assert(f === null, 'generic architecture blog does NOT yield a finding');
}

console.log('\n--- No fabrication: signal with no evidence -> no finding ---');
{
  const sig = mkSig({ signal_id: 'S1', type: 'PUBLIC_INCIDENT', source_url: 'https://acme.com/status', excerpt: 'Outage resolved.', related_evidence_ids: [] });
  const f = find([sig], []);
  assert(f === null, 'incident signal without observation evidence -> no finding');
}

console.log('\n--- Severity ranking picks highest defensible, breaks ties by evidence count ---');
{
  // sensitive metadata (MEDIUM, 1 evidence) vs two exposure observations (MEDIUM, 2 evidence)
  const obs = [
    mkEv({ id: 'A', observed_behavior: 'exposes storage_path', sensitive_fields: ['storage_path'], reproductions: 3 }),
    mkEv({ id: 'B', observed_behavior: 'config exposed without auth, accessible to anyone', reproductions: 4 }),
    mkEv({ id: 'C', observed_behavior: 'debug config exposed without auth', reproductions: 4 }),
  ];
  const f = find([], obs);
  assert(f !== null, 'picked a finding');
  assertEq(f?.finding_type, 'POSSIBLE_PUBLIC_EXPOSURE', 'picks POSSIBLE_PUBLIC_EXPOSURE (tie-break: more evidence)');
}

console.log('\n==================================================');
console.log(`FindingEngine tests: ${pass} passed, ${fail} failed.`);
if (fail === 0) console.log('ALL TESTS PASSED.');
else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);
