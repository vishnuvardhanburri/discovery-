// Orchestration offline test — Growjo CSV -> import -> hunt -> pipeline -> ready -> no-auto-send.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { XaviraOperator } from '../src/server/XaviraOperator';
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import { DeepEmailGenerator } from '../src/server/DeepEmailGenerator';
import { IcpQualificationEngine } from '../src/server/IcpQualificationEngine';
import type { IcpContext } from '../src/server/IcpQualificationEngine';
import type { DeepOwner, DeepContact, DeepSignal, DeepFinding } from '../src/server/DeepTypes';
import type { Evidence, HttpFetcher, OwnerCandidate, CompanySurface, FindingClassification, PublicObservationProvider } from '../src/server/IntelligenceCase';

let pass = 0, fail = 0; const failures: string[] = [];
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; failures.push(m); console.log('[FAIL] ' + m); } };

// ── Canned surfaces ──────────────────────────────────────────────────────────
const HOME = `<html><head><script type="application/ld+json">{"sameAs":["https://github.com/acme"]}</script></head><body><nav>
<a href="/team">Team</a><a href="/developers">Developers</a><a href="/status">Status</a><a href="/about">About</a></nav><h1>Acme Corp</h1></body></html>`;

const TEAM = `<html><body><section class="team">
<div class="member"><h3>Jane Doe</h3><p>Head of Engineering</p></div>
</section></body></html>`;

const DEV = `<html><body><h1>Developer Platform</h1>
<p>Contact: <a href="mailto:jane@acme.com">jane@acme.com</a></p>
<p>Follow <a href="https://www.linkedin.com/in/janedoe">LinkedIn</a></p></body></html>`;

const STATUS = `<html><body><h1>System Status</h1>
<p>All systems operational. Last incident: 2024-03-01 partial outage resolved.</p></body></html>`;

function routes() {
  return {
    'https://acme.com': { status: 200, body: HOME, ct: 'text/html' },
    'https://acme.com/team': { status: 200, body: TEAM, ct: 'text/html' },
    'https://acme.com/developers': { status: 200, body: DEV, ct: 'text/html' },
    'https://acme.com/status': { status: 200, body: STATUS, ct: 'text/html' },
    'https://acme.com/about': { status: 200, body: TEAM, ct: 'text/html' },
    'https://beta.com': { status: 200, body: `<html><body><h1>Beta Widgets</h1><p>Sells consumer widgets.</p></body></html>`, ct: 'text/html' },
  };
}

type Route = { status: number; body: string; ct?: string };
function fakeFetcher(r: Record<string, Route>): HttpFetcher {
  return async (url: string, _init: any) => {
    const key = url.replace(/\/$/, '') || url;
    const hit = r[key] || r[url];
    if (hit) return new Response(hit.body, { status: hit.status, headers: hit.ct ? { 'content-type': hit.ct } : {} });
    return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
  };
}

class MockProvider implements PublicObservationProvider {
  constructor(private evidenceToReturn: Evidence[]) {}
  async observePublicSurface(_url: string, _options?: any) { return { evidence: this.evidenceToReturn, discovery_errors: 0 }; }
}

const goEvidence: Evidence[] = [{
  id: 'ev_go_test', evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
  public_url: 'https://api.acme.com/v1/users', source_type: 'API_ENDPOINT' as const,
  status: 200, observed_behavior: 'The payload exposes internal metadata fields like storage_path.',
  sensitive_fields: ['storage_path'], reproductions: 3, repeatable: true,
  tested_without_auth: true, not_tested: ['access private data'],
  retrieved_at: new Date().toISOString(), evidence_text: 'exposes storage_path',
  latency_ms: 120, baseline_latency_ms: 100,
}];

const csv = 'company,domain\nAcme Corp,acme.com\nBeta Widgets,beta.com\n';

// ── ICP / outreach gate negative-regression suite (additive) ──────────────────
// Verifies the TOPOLOGY-F decision contract: OUTREACH_READY is reached only when
// ALL required gates hold. The `qualifyingCtx()` fixture below passes every gate
// (GOLDEN -> OUTREACH_READY); each negative case flips exactly one gate to prove
// it is independently required:
//   (a) selected_owner null / LOW          (ownerHigh gate)
//   (b) deep_finding NONE / CONFLICTING    (findingDefensible gate)
//   (c) claim QA failed                    (email.generated gate)
// Existing orchestration assertions above are untouched.

const JANE_EVIDENCE = ['Jane Doe is listed as Head of Engineering on https://acme.com/team — "Jane leads platform engineering."'];

function qualifyingOwner(): DeepOwner {
  return {
    name: 'Jane Doe', role: 'Head of Engineering', company: 'acme.com',
    source_urls: ['https://acme.com/team'], owner_evidence: JANE_EVIDENCE,
    responsibility_match: 'api surface', finding_link: 'api surface', confidence: 'HIGH'
  };
}
function qualifyingCandidate(): OwnerCandidate {
  return {
    name: 'Jane Doe', role: 'Head of Engineering', company: 'acme.com',
    source_urls: ['https://acme.com/team'], evidence: JANE_EVIDENCE,
    relationship_to_area: "Role 'Head of Engineering' covers engineering & technical leadership.",
    confidence: 'HIGH', explicit_evidence: true
  };
}
function qualifyingContacts(): DeepContact[] {
  return [{ type: 'PROFESSIONAL_EMAIL', value: 'jane@acme.com', source_url: 'https://acme.com/developers', confidence: 'HIGH' }];
}
function qualifyingSignals(): DeepSignal[] {
  return [
    { signal_id: 'S-ARCH', type: 'ARCHITECTURE_DISCUSSION', source_url: 'https://acme.com/engineering',
      excerpt: 'We run microservices on Kubernetes and expose a public REST API on AWS.', provenance: 'DOCUMENTED_FACT',
      signal_strength: 'MEDIUM', relevance: 'platform architecture & API surface', related_evidence_ids: [] },
    { signal_id: 'S-API', type: 'API_REFERENCE', source_url: 'https://acme.com/developers',
      excerpt: 'Public API exposes internal metadata fields like storage_path.', provenance: 'REAL_PUBLIC_OBSERVATION',
      signal_strength: 'HIGH', relevance: 'public API surface exposure', related_evidence_ids: ['E-1'] },
    { signal_id: 'S-STATUS', type: 'STATUS_PAGE', source_url: 'https://acme.com/status',
      excerpt: 'System status page — last incident 2024-03-01 partial outage resolved.', provenance: 'DOCUMENTED_FACT',
      signal_strength: 'MEDIUM', relevance: 'observability & incident history', related_evidence_ids: [] },
  ];
}
function qualifyingSurface(): CompanySurface {
  return {
    company: 'acme', origin: 'https://acme.com', homepage: 'https://acme.com',
    discovered_pages: [
      { url: 'https://acme.com/developers', path: '/developers', category: 'engineering' },
      { url: 'https://acme.com/engineering', path: '/engineering', category: 'engineering' },
      { url: 'https://acme.com/status', path: '/status', category: 'status_ops' },
      { url: 'https://acme.com/team', path: '/team', category: 'team_people' }
    ], page_categories: {}
  };
}
function defensibleFinding(): FindingClassification {
  return { finding_type: 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', impact_severity: 'MEDIUM', severity_basis: 'observed via evidence E-1' };
}
/** A context that passes every ICP gate; override one field to regress a gate. */
function qualifyingCtx(overrides?: Partial<IcpContext>): IcpContext {
  const base: IcpContext = {
    company: 'acme', domain: 'acme.com', surface: qualifyingSurface(), signals: qualifyingSignals(),
    people: [qualifyingCandidate()], owner: qualifyingOwner(), contacts: qualifyingContacts(),
    finding: defensibleFinding(), evidence: []
  };
  return { ...base, ...(overrides || {}) };
}

async function negativeRegression(): Promise<void> {
  console.log('\n--- ICP / outreach negative-regression (gates) ---');

  // GOLDEN: fully-qualifying context reaches OUTREACH_READY (proves the negatives
  // below fail the INTENDED gate, not a missing fixture).
  const golden = IcpQualificationEngine.qualify(qualifyingCtx());
  assert(golden.overall === 'OUTREACH_READY', `GOLDEN: fully-qualifying context -> OUTREACH_READY (got ${golden.overall})`);
  assert(golden.dimensions.every(d => d.score >= 1), 'GOLDEN: all dimensions scored >= 1');

  // (a) selected_owner is null — a HIGH candidate in the list alone is not enough;
  //     the resolved owner must be non-null + evidence-backed.
  {
    const q = IcpQualificationEngine.qualify(qualifyingCtx({ owner: null }));
    assert(q.overall !== 'OUTREACH_READY', `(a1) selected_owner null -> NOT OUTREACH_READY (got ${q.overall})`);
    assert(q.overall === 'RESEARCH_MORE', `(a1) selected_owner null -> RESEARCH_MORE (got ${q.overall})`);
  }
  // (a) selected_owner is LOW — owner confidence below HIGH can never qualify.
  {
    const lowOwner: DeepOwner = { ...qualifyingOwner(), confidence: 'LOW' };
    const lowPeople: OwnerCandidate[] = [{ ...qualifyingCandidate(), confidence: 'LOW' } as OwnerCandidate];
    const q = IcpQualificationEngine.qualify(qualifyingCtx({ owner: lowOwner, people: lowPeople }));
    assert(q.overall !== 'OUTREACH_READY', `(a2) selected_owner LOW -> NOT OUTREACH_READY (got ${q.overall})`);
    assert(q.overall === 'RESEARCH_MORE', `(a2) selected_owner LOW -> RESEARCH_MORE (got ${q.overall})`);
  }

  // (b) deep_finding is NONE (finding null) — no defensible finding, never outreach.
  {
    const q = IcpQualificationEngine.qualify(qualifyingCtx({ finding: null }));
    assert(q.overall !== 'OUTREACH_READY', `(b1) finding NONE -> NOT OUTREACH_READY (got ${q.overall})`);
    assert(q.overall === 'RESEARCH_MORE', `(b1) finding NONE -> RESEARCH_MORE (got ${q.overall})`);
  }
  // (b) deep_finding is CONFLICTING_EVIDENCE — explicitly excluded as non-defensible.
  {
    const q = IcpQualificationEngine.qualify(qualifyingCtx({
      finding: { finding_type: 'CONFLICTING_EVIDENCE', impact_severity: 'LOW', severity_basis: 'contradictory observations' }
    }));
    assert(q.overall !== 'OUTREACH_READY', `(b2) finding CONFLICTING_EVIDENCE -> NOT OUTREACH_READY (got ${q.overall})`);
    assert(q.overall === 'RESEARCH_MORE', `(b2) finding CONFLICTING_EVIDENCE -> RESEARCH_MORE (got ${q.overall})`);
  }
  // (b) finding is not defensible (generic article) — finding_quality below threshold.
  {
    const q = IcpQualificationEngine.qualify(qualifyingCtx({
      finding: { finding_type: 'GENERIC_ENGINEERING_ARTICLE', impact_severity: 'LOW', severity_basis: 'generic content' }
    }));
    assert(q.overall !== 'OUTREACH_READY', `(b3) finding GENERIC_ENGINEERING_ARTICLE -> NOT OUTREACH_READY (got ${q.overall})`);
  }

  // (c) claim QA failed — the builder's OUTREACH_READY gate includes `email.generated`
  //     (claim QA PASSED). Isolate that gate: a defensible finding + HIGH owner +
  //     professional contact are all present, but the composed finding-led claims
  //     carry unsupported language, so the email is blocked -> no outreach.
  {
    const deepFinding: DeepFinding = {
      finding_type: 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE',
      impact_severity: 'MEDIUM', severity_basis: 'observed via evidence E-1',
      evidence_ids: ['E-1'], source_urls: ['https://acme.com/developers'],
      provenance: 'REAL_PUBLIC_OBSERVATION', confidence: 'HIGH',
      strength: { evidence_strength: 'HIGH', reproducibility: 'HIGH', source_quality: 'HIGH', technical_specificity: 'HIGH', owner_confidence: 'HIGH' },
      explanation: 'The public response is breached and exposed to unauthenticated callers — verifiable public behavior, not a vulnerability claim.',
      recommendation: 'Remove the field if it is not part of the product data model.'
    };
    const email = DeepEmailGenerator.generate({
      prospect: {
        company: 'acme', domain: 'acme.com', industry: 'Developer Platform / SaaS', fit: 'STRONG',
        qualification_reasons: [], public_surface: qualifyingSurface(),
        technical_signals: qualifyingSignals(), evidence: [],
        deep_finding: deepFinding, selected_owner: qualifyingOwner(),
        contactability: qualifyingContacts(),
      } as any,
      caseRef: { claim_validation: 'NOT_PASSED', email_model: undefined } as any
    });
    assert(!email.generated, `(c) claim QA failed -> email NOT generated (generated=${email.generated})`);
    assert(/claim QA/i.test(email.blocked_reason || ''), `(c) blocked_reason cites claim QA (${email.blocked_reason})`);
  }

  // (b) INTEGRATION — deep_finding NONE end-to-end: with no observation evidence
  //     detectDeepFinding returns null, so `findingDefensible` is false in the
  //     builder's final gate -> decision is never OUTREACH_READY (deep_finding wired).
  {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-neg-nofinding-'));
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(routes()),
      observationProvider: new MockProvider([]),
      saveArtifact: (p, d) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* */ } fs.writeFileSync(p, d, 'utf8'); },
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {}
    });
    const { prospect } = await builder.build('https://acme.com');
    assert(prospect.deep_finding === null, `(b1) builder deep_finding NONE (got ${prospect.deep_finding?.finding_type || 'null'})`);
    assert(prospect.decision !== 'OUTREACH_READY', `(b1) builder no deep finding -> NOT OUTREACH_READY (got ${prospect.decision})`);
  }
}

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-orch-'));
  const csvPath = path.join(tmpDir, 'growjo.csv');
  fs.writeFileSync(csvPath, csv, 'utf8');

  const buf: string[] = [];
  const c = capture();
  const op = new XaviraOperator({
    fetch: fakeFetcher(routes()),
    observationProvider: new MockProvider(goEvidence),
    saveArtifact: (p, d) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); } catch { /* */ } fs.writeFileSync(p, d, 'utf8'); },
    artifactsDir: tmpDir,
    output: c.output,
    maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
    inputLines: [
      `import ${csvPath}`,
      'pipeline',
      'hunt growjo.csv --batch 2',
      'pipeline',
      'ready',
      'send',
      'send --confirm',
      'show company Acme Corp',
      'export deep',
      'exit',
    ],
  });
  await op.start();
  const out = c.text();

  console.log('\n--- assertions ---');
  assert(out.includes('Growjo import: 2 company'), `import loaded 2 (got ${out.slice(0, 200)})`);
  assert(out.includes('QUEUED') && out.includes('OUTREACH_READY'), 'pipeline lists states');
  assert(out.includes('Acme Corp') && (out.includes('OUTREACH_READY') || out.includes('RESEARCH_MORE')), 'acme researched and reached a terminal state');
  assert(out.includes('Deep decision:'), 'deep decisions printed');
  assert(out.includes('Send requires explicit confirmation'), 'send without --confirm refused');
  assert(out.includes('Sending is NOT configured') || out.includes('Send blocked'), `send --confirm blocked (${out.includes('Sending is NOT configured') ? 'not configured' : out.includes('Send blocked') ? 'blocked' : 'neither'})`);
  assert(!out.includes('Actual email sent'), 'no email was ever auto-sent');
  assert(out.includes('Export') || out.includes('Exported'), 'export command produced output');

  // The queue file should reflect terminal state on disk (crash-safety).
  const queueFile = path.join(tmpDir, 'artifacts', 'intelligence', 'queue.jsonl');
  assert(fs.existsSync(queueFile), 'queue persistently written to disk');
  const queueLines = fs.readFileSync(queueFile, 'utf8').trim().split('\n').length;
  assert(queueLines === 2, `queue has 2 rows persisted (${queueLines})`);

  await negativeRegression();

  console.log('\n==================================================');
  console.log(`Orchestration tests: ${pass} passed, ${fail} failed.`);
  if (fail === 0) console.log('ALL TESTS PASSED.');
  else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
}

function capture() { const buf: string[] = []; return { buf, output: { write: (s: string) => buf.push(s) }, text: () => buf.join('') }; }

void main();
