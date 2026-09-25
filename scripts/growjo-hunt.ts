// growjo-hunt.ts
// ─────────────────
// REAL public-surface deep research on companies from a Growjo CSV export.
// The Growjo data is passed into the DeepProspectBuilder as the PRIMARY
// owner-candidate source (Growjo people → role match → company identity match
// → public corroboration → confidence). Read-only, same-origin, bounded.
// Honest decisions only (NO_GO / RESEARCH_MORE / OUTREACH_READY). No invented owners.
//
// Usage: npx tsx scripts/growjo-hunt.ts data/growjo_export.csv --batch <n> [--start <k>]
import * as fs from 'fs';
import * as path from 'path';
import { GrowjoProvider } from '../src/server/GrowjoProvider';
import type { GrowjoCompany, CompanyResolution } from '../src/server/DeepTypes';
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms)),
  ]);
}

function saveArtifact(p: string, data: string): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data, 'utf8');
}

const boundedFetch: typeof fetch = (async (url: string, init: any) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try { return await fetch(url, { ...(init || {}), signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}) as any;

function parseArgs(argv: string[]): { csv: string; batch: number; start: number } {
  const csv = argv[2] || 'data/growjo_export.csv';
  const batchMatch = argv.join(' ').match(/--batch\s+(\d+)/);
  const startMatch = argv.join(' ').match(/--start\s+(\d+)/);
  return { csv, batch: batchMatch ? parseInt(batchMatch[1], 10) : 3, start: startMatch ? parseInt(startMatch[1], 10) : 0 };
}

interface HuntResult {
  company: string; domain: string; industry: string; ranking: string;
  decision: string; confidence: string | null;
  finding: string; findingProvenance: string;
  owner: string | null; ownerConfidence: string | null; ownerProvenance: string | null;
  people: number; ownerCandidates: number;
  growjoHasPerson: boolean;
  error: string | null;
}

async function runOne(company: GrowjoCompany, idx: number, total: number): Promise<HuntResult> {
  const target = company.domain ? `https://${company.domain}` : (company.website || '');
  const growjoName = company.canonical_name;
  const ranking = company.raw.ranking || company.raw.temp_ranking || '';

  console.log(`\n[${idx}/${total}] ${growjoName} (${target}) — growjo rank #${ranking || '?'}, industry: ${company.industry || 'n/a'}`);

  const resolution: CompanyResolution = {
    canonical_name: company.canonical_name,
    official_domain: company.domain,
    resolution_method: company.domain ? 'GROWJO_DOMAIN' : 'AMBIGUOUS',
    resolution_source: company.source_url || company.growjo_url || 'GROWJO record',
    resolution_confidence: company.domain ? 'HIGH' : 'LOW',
  };

  // Check: does this Growjo record carry any person-level data?
  const hasPerson = !!(company.primary_person_name && company.primary_person_name !== company.company);
  const hasTitle = !!company.primary_title;
  const hasEmail = !!company.primary_email;
  console.log(`  [growjo] person_name=${company.primary_person_name || '(none)'}  title=${company.primary_title || '(none)'}  email=${company.primary_email || '(none)'}  hasPersonData=${hasPerson || hasTitle || hasEmail}`);

  const builder = new DeepProspectBuilder({
    fetcher: boundedFetch as any,
    saveArtifact,
    artifactsBaseDir: process.cwd(),
    maxDiscoveryPages: 8,
    discoveryDelayMs: 40,
    discoveryTimeoutMs: 6000,
    observationDelayMs: 40,
    onProgress: (stage, msg) => console.log(`  [${stage}] ${msg}`),
    logger: (m) => console.log(`  [discovery] ${m}`),
    growjo: company,
    resolution,
  });

  const result: HuntResult = {
    company: growjoName, domain: company.domain || '', industry: company.industry || '', ranking: ranking,
    decision: '', confidence: null, finding: '', findingProvenance: '',
    owner: null, ownerConfidence: null, ownerProvenance: null,
    people: 0, ownerCandidates: 0, growjoHasPerson: hasPerson || hasTitle || hasEmail,
    error: null,
  };

  try {
    const { prospect } = await withTimeout(builder.build(target), 90000);
    result.decision = prospect.decision;
    result.confidence = prospect.confidence;
    result.finding = prospect.deep_finding ? `${prospect.deep_finding.finding_type} / ${prospect.deep_finding.confidence}` : (prospect.findings ? prospect.findings.finding_type : 'NONE');
    result.findingProvenance = prospect.deep_finding ? prospect.deep_finding.provenance : '';
    result.owner = prospect.selected_owner ? prospect.selected_owner.name : '(none)';
    result.ownerConfidence = prospect.selected_owner ? prospect.selected_owner.confidence : null;
    result.ownerProvenance = prospect.selected_owner ? (prospect.selected_owner as any).deep_owner_provenance || '(none)' : null;
    result.people = prospect.people.length;
    result.ownerCandidates = prospect.owner_candidates.length;
    console.log(`  ── RESULT: ${result.decision} (confidence ${result.confidence})`);
    console.log(`     finding:   ${result.finding}  [${result.findingProvenance}]`);
    console.log(`     owner:     ${result.owner} (${result.ownerConfidence}, provenance: ${result.ownerProvenance || 'none'})`);
    console.log(`     people:    ${result.people}  owner_candidates: ${result.ownerCandidates}`);
    console.log(`     growjo person data: ${result.growjoHasPerson ? 'YES' : 'NO (Contact Data → lead411 redirect)'}`);
  } catch (e: any) {
    result.error = e?.message || String(e);
    console.log(`  ── RESULT: ERROR: ${result.error}`);
  }

  return result;
}

async function main(): Promise<void> {
  const { csv, batch, start } = parseArgs(process.argv);
  if (!fs.existsSync(csv)) { console.error(`CSV not found: ${csv}`); process.exit(1); }
  const text = fs.readFileSync(csv, 'utf8');
  const { companies } = GrowjoProvider.parseCsv(text);
  console.log(`XAVIRA GROWJO HUNT — ${companies.length} companies in CSV, hunting batch of ${batch} (from index ${start})`);
  console.log(`Source: ${csv}`);

  const slice = companies.slice(start, start + batch);
  const results: HuntResult[] = [];
  let i = start;
  for (const c of slice) {
    i++;
    try { results.push(await runOne(c, i, companies.length)); }
    catch (e: any) {
      console.log(`\n[${i}/${companies.length}] ${c.canonical_name} — FAILED: ${e?.message || String(e)}`);
      results.push({
        company: c.canonical_name, domain: c.domain || '', industry: c.industry || '', ranking: c.raw.ranking || '',
        decision: 'ERROR', confidence: null, finding: '', findingProvenance: '',
        owner: null, ownerConfidence: null, ownerProvenance: null,
        people: 0, ownerCandidates: 0, growjoHasPerson: false,
        error: e?.message || String(e),
      });
    }
  }

  // Summary table
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                    GROWJO HUNT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`${'Company'.padEnd(24)} | ${'Domain'.padEnd(18)} | ${'Decision'.padEnd(14)} | ${'Owner'.padEnd(18)} | ${'Prov'.padEnd(18)} | GrowjoPerson`);
  console.log('─'.repeat(130));
  for (const r of results) {
    console.log(
      `${r.company.slice(0, 22).padEnd(24)} | ${(r.domain || '—').slice(0, 16).padEnd(18)} | ${r.decision.padEnd(14)} | ${(r.owner || '—').slice(0, 16).padEnd(18)} | ${(r.ownerProvenance || '—').slice(0, 16).padEnd(18)} | ${r.growjoHasPerson ? 'YES' : 'NO'}`
    );
  }
  console.log('═'.repeat(130));
  const byDecision = results.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`Decision breakdown: ${Object.entries(byDecision).map(([d, n]) => `${d}×${n}`).join('  ')}`);
  const ownersFound = results.filter(r => r.owner !== '(none)' && r.owner !== null);
  console.log(`Owners found: ${ownersFound.length} / ${results.length}  (honest: ${results.length - ownersFound.length} companies produced no owner — no persons in Growjo CSV)`);
  console.log('\n═══ DONE ═══');
}

void main();
