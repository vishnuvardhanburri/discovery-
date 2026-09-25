// Orchestration offline test — Growjo CSV -> import -> hunt -> pipeline -> ready -> no-auto-send.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { XaviraOperator } from '../src/server/XaviraOperator';
import type { Evidence, HttpFetcher, PublicObservationProvider } from '../src/server/IntelligenceCase';

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

  console.log('\n==================================================');
  console.log(`Orchestration tests: ${pass} passed, ${fail} failed.`);
  if (fail === 0) console.log('ALL TESTS PASSED.');
  else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exit(fail === 0 ? 0 : 1);
}

function capture() { const buf: string[] = []; return { buf, output: { write: (s: string) => buf.push(s) }, text: () => buf.join('') }; }

void main();
