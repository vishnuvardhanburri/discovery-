// GrowjoProvider offline tests — CSV alias mapping, dedupe, provenance.
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GrowjoProvider } from '../src/server/GrowjoProvider';

let pass = 0, fail = 0; const failures: string[] = [];
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; failures.push(m); console.log('[FAIL] ' + m); } };

function run(name: string, fn: () => void) { console.log('\n--- ' + name + ' ---'); fn(); }

run('growjo CSV — flexible column aliases', () => {
  const csv = [
    'company_name,website,industry,employees,employee_growth_pct,funding,revenue,valuation,person_name,person_title,email,linkedin_url,growjo_url',
    'Acme Corp,https://acme.com,Developer Infrastructure,250,12,12000000,50000000,2000000000,Jane Doe,Head of Engineering,jane@acme.com,https://www.linkedin.com/in/janedoe,https://www.acme.com/about',
  ].join('\n');
  const r = GrowjoProvider.parseCsv(csv);
  assert(r.companies.length === 1, 'one company parsed');
  const c = r.companies[0];
  assert(c.source === 'GROWJO', 'provenance source = GROWJO');
  assert(c.canonical_name === 'Acme Corp', 'canonical_name preserved');
  assert(c.domain === 'acme.com', 'domain normalised from website');
  assert(c.industry === 'Developer Infrastructure', 'industry mapped');
  assert(c.employee_count === 250, 'employees mapped to number');
  assert(c.employee_growth_pct === 12, 'growth pct mapped');
  assert(c.funding === 12000000, 'funding mapped to number');
  assert(c.revenue === 50000000, 'revenue mapped');
  assert(c.valuation === 2000000000, 'valuation mapped');
  assert(c.primary_person_name === 'Jane Doe', 'person_name mapped');
  assert(c.primary_title === 'Head of Engineering', 'person_title mapped');
  assert(c.primary_email === 'jane@acme.com', 'email mapped');
  assert(c.linkedin_url === 'https://www.linkedin.com/in/janedoe', 'linkedin mapped');
  assert(c.growjo_url === 'https://www.acme.com/about', 'growjo_url mapped');
  assert(c.source_url === c.growjo_url, 'source_url from growjo_url');
  assert(!!c.retrieved_at, 'retrieved_at present');
  assert(c.raw.company_name === 'Acme Corp', 'raw row preserved');
  assert(r.column_mapping.website === 'domain', 'website -> domain alias');
});

run('growjo CSV — alternate aliases (domain/url/title/phone)', () => {
  const csv = [
    'company,domain,url,title,phone,email',
    'Beta LLC,betalabs.com,https://betalabs.com,CTO,555-1234,cto@betalabs.com',
  ].join('\n');
  const r = GrowjoProvider.parseCsv(csv);
  const c = r.companies[0];
  assert(c.canonical_name === 'Beta LLC', 'name');
  assert(c.domain === 'betalabs.com', 'domain from domain col');
  assert(c.primary_title === 'CTO', 'title alias');
  assert(c.primary_phone === '555-1234', 'phone mapped');
  assert(c.primary_email === 'cto@betalabs.com', 'email');
});

run('growjo CSV — dedupe by canonical domain', () => {
  const csv = [
    'company,domain',
    'Acme,acme.com',
    'Acme Corp,https://www.acme.com',  // same canonical domain
    'OtherCo,other.com',
  ].join('\n');
  const r = GrowjoProvider.parseCsv(csv);
  assert(r.companies.length === 2, `deduped to 2 (got ${r.companies.length})`);
  assert(r.duplicate_domains_dropped === 1, 'one duplicate dropped');
});

run('growjo CSV — no silent promotion of estimates', () => {
  const csv = [
    'company,domain,funding,revenue,valuation',
    'Gamma,gamma.com,$12.5M,$1.0M,$200M',
  ].join('\n');
  const r = GrowjoProvider.parseCsv(csv);
  const c = r.companies[0];
  assert(c.funding === 12.5, 'funding $12.5M -> 12.5 (currency-stripped, numeric, not a fact)');
  assert(c.valuation === 200, 'valuation $200M -> 200');
  assert(c.funding_currency === 'USD', 'currency default USD preserved as metadata, not a fact');
});

run('growjo CSV — unmapped columns warn, never invent', () => {
  const csv = [
    'company,domain,bogus_column,crowd_pleaser',
    'Delta,delta.com,hello,no',
  ].join('\n');
  const r = GrowjoProvider.parseCsv(csv);
  assert(r.companies.length === 1, 'still parses the real company');
  assert(r.warnings.some(w => w.includes('bogus_column')), 'unmapped column warned');
  assert(r.warnings.some(w => w.includes('crowd_pleaser')), 'unmapped column warned');
  assert(!('bogus_column' in r.companies[0].raw === false), 'bogus not in canonical model');
});

run('growjo CSV — empty file handled', () => {
  const r = GrowjoProvider.parseCsv('');
  assert(r.companies.length === 0, 'empty CSV -> 0 companies');
  assert(r.warnings.length > 0, 'empty CSV warns');
});

console.log('\n==================================================');
console.log(`GrowjoProvider tests: ${pass} passed, ${fail} failed.`);
if (fail === 0) console.log('ALL TESTS PASSED.');
else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);
