// CompanyQueue offline tests — persistent state, dedupe, resume, crash-safety.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CompanyQueue } from '../src/server/CompanyQueue';
import { GrowjoProvider } from '../src/server/GrowjoProvider';

let pass = 0, fail = 0; const failures: string[] = [];
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; failures.push(m); console.log('[FAIL] ' + m); } };

function makeCsv() {
  const csv = [
    'company,domain,industry,person_name,email',
    'Acme,acme.com,Developer Infra,Jane Doe,jane@acme.com',
    'Beta,betalabs.com,SaaS,Mark Smith,mark@beta.com',
  ].join('\n');
  return GrowjoProvider.parseCsv(csv).companies;
}

console.log('\n--- CompanyQueue persistence + enqueue ---');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-q-'));
const q = new CompanyQueue(path.join(tmp, 'queue.jsonl'));
{
  const { added, duplicates } = q.enqueue(makeCsv());
  assert(added === 2, `enqueued 2 (got ${added})`);
  assert(duplicates === 0, 'no dupes on first enqueue');
  assert(q.count() === 2, `queue total 2 (got ${q.count()})`);
  assert(q.count('QUEUED') === 2, 'both QUEUED');
}

console.log('\n--- CompanyQueue dedupe by canonical domain ---');
{
  const d = q.enqueue(makeCsv());
  assert(d.added === 0, `re-enqueue adds 0 (got ${d.added})`);
  assert(d.duplicates === 2, `re-enqueue dedupes 2 (got ${d.duplicates})`);
  assert(q.count() === 2, 'still 2 after duplicate enqueue');
}

console.log('\n--- CompanyQueue crash-safe resume (reopen file) ---');
{
  const q2 = new CompanyQueue(path.join(tmp, 'queue.jsonl'));
  assert(q2.count() === 2, `reopened queue has 2 (got ${q2.count()})`);
}

console.log('\n--- CompanyQueue claimNext + markResearched ---');
{
  const row = q.claimNext();
  assert(!!row && row!.state === 'RESOLVING', 'claimNext advances to RESOLVING');
  const id = row!.id;
  q.markResearched(id, 'OUTREACH_READY', 'HIGH', 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', 'Jane Doe', '/artifacts/acme.json', 'OUTREACH_READY');
  const updated = q.list().find(r => r.id === id);
  assert(updated?.state === 'OUTREACH_READY', `state OUTREACH_READY (got ${updated?.state})`);
  assert(updated?.prospect?.decision === 'OUTREACH_READY', 'prospect decision recorded');
  assert(updated?.prospect?.finding === 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', 'finding recorded');
  assert(updated?.prospect?.owner === 'Jane Doe', 'owner recorded');
  assert(updated?.artifact_path === '/artifacts/acme.json', 'artifact path recorded');
}

console.log('\n--- CompanyQueue pipeline/resume ---');
{
  assert(q.count('QUEUED') === 1, 'one still QUEUED');
  assert(q.count('OUTREACH_READY') === 1, 'one OUTREACH_READY');
  const pending = q.pending();
  assert(pending.length === 2, `pending includes non-terminal (OUTREACH_READY + QUEUED) (got ${pending.length})`);
  assert(pending.some(r => r.state === 'QUEUED'), 'pending still includes the QUEUED company (Beta)');
}

console.log('\n--- CompanyQueue approve -> APPROVED -> SENT ---');
{
  const id = q.list().find(r => r.state === 'OUTREACH_READY')!.id;
  q.approve(id);
  const approved = q.list().find(r => r.id === id);
  assert(approved?.state === 'APPROVED', 'approve -> APPROVED');
  q.markSent(id);
  const sent = q.list().find(r => r.id === id);
  assert(sent?.state === 'SENT', 'markSent -> SENT');
  // After SENT, only the QUEUED company remains pending.
  assert(q.pending().length === 1, 'pending excludes terminal SENT/APPROVED');
  assert(q.pending()[0].state === 'QUEUED', 'pending returns the remaining QUEUED company');
  assert(q.markSent(q.list().find(r => r.state === 'QUEUED')!.id) === null, 'cannot SENT a non-APPROVED company');
}

console.log('\n==================================================');
console.log(`CompanyQueue tests: ${pass} passed, ${fail} failed.`);
if (fail === 0) console.log('ALL TESTS PASSED.');
else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);
