// growjo-hunt.ts
// ─────────────────
// UNIFIED XAVIRA DEEP-RESEARCH HUNT ENTRY POINT
//
// Supports all input modes:
//   npx tsx scripts/growjo-hunt.ts data/growjo_export.csv --batch 3
//   npx tsx scripts/growjo-hunt.ts data/ft1000_2026.csv --batch 5 --start 200
//   npx tsx scripts/growjo-hunt.ts --domains "vercel.com,supabase.com,stripe.com"
//   npx tsx scripts/growjo-hunt.ts --companies "Vercel,Supabase,Stripe"
//   npx tsx scripts/growjo-hunt.ts --research https://vercel.com
//
// All data sources are OPTIONAL / pluggable. When no CSV is provided,
// company names/domains are used as direct seeds — the pipeline resolves
// them independently of any provider.
//
// Honest decisions only (NO_GO / RESEARCH_MORE / OUTREACH_READY). No invented owners.

import * as fs from 'fs';
import * as path from 'path';
import { CSVProvider } from '../src/server/providers/CSVProvider';
import { PublicDatasetProvider } from '../src/server/providers/PublicDatasetProvider';
import { ProviderRegistry } from '../src/server/providers/ProviderRegistry';
import { GrowjoProviderAdapter } from '../src/server/providers/GrowjoProviderAdapter';
import { EntityResolver } from '../src/server/providers/EntityResolver';
import { GrowjoProvider } from '../src/server/GrowjoProvider';
import type { CanonicalCompany, CanonicalPerson } from '../src/server/providers/Model';
import type { CompanyResolution, DeepBuilderResult } from '../src/server/DeepTypes';
import type { ProviderCompanyLike } from '../src/server/DeepTypes';
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import { StatePersistence } from '../src/server/StatePersistence';

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

/** Shared state persistence directory for resume/refresh/changes. */
const statePersistence = new StatePersistence(path.join(process.cwd(), 'artifacts', 'intelligence'));

const boundedFetch: typeof fetch = (async (url: string, init: any) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try { return await fetch(url, { ...(init || {}), signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}) as any;

// ── Convert GrowjoCompany to CanonicalCompany (adds missing canonical fields) ──

function toCanonical(c: any): CanonicalCompany {
  return { ...c, people: c.people || [], contacts: c.contacts || [], entity_sources: c.entity_sources || [] };
}

// ── Arg parsing ──

interface HuntArgs {
  csv: string | null;
  batch: number;
  start: number;
  domains: string[];
  companies: string[];
  research: string | null;
}

function parseArgs(argv: string[]): HuntArgs {
  const raw = argv.slice(2);
  // First pass: identify and consume flag values so they don't leak as positional args
  const flagsWithValue = new Set(['--csv', '--batch', '--start', '--domains', '--companies', '--research']);
  const positionals: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (flagsWithValue.has(raw[i])) { i++; continue; } // skip flag + its value
    if (raw[i].startsWith('--')) { continue; }          // skip unknown flag
    positionals.push(raw[i]);                          // genuine positional
  }
  const csv = positionals[0] || null;
  const batchMatch = argv.join(' ').match(/--batch\s+(\d+)/);
  const startMatch = argv.join(' ').match(/--start\s+(\d+)/);
  const domainsMatch = argv.join(' ').match(/--domains\s+([\w.,\-:]+)/);
  const companiesMatch = argv.join(' ').match(/--companies\s+(["']?)([^"']+)\1/);
  const researchMatch = argv.join(' ').match(/--research\s+(https?:\/\/[\w.\-]+)/);
  return {
    csv,
    batch: batchMatch ? parseInt(batchMatch[1], 10) : 5,
    start: startMatch ? parseInt(startMatch[1], 10) : 0,
    domains: domainsMatch ? domainsMatch[1].split(',').map(d => d.trim()).filter(Boolean) : [],
    companies: companiesMatch ? companiesMatch[2].split(',').map(c => c.trim()).filter(Boolean) : [],
    research: researchMatch ? researchMatch[1] : null,
  };
}

// ── Resolution ──

function buildResolution(company: CanonicalCompany | null, domain: string, source: string): CompanyResolution {
  return {
    canonical_name: company?.canonical_name || domain,
    official_domain: domain,
    resolution_method: company && company.domain ? 'GROWJO_DOMAIN' : 'AMBIGUOUS',
    resolution_source: source,
    resolution_confidence: 'HIGH',
  };
}

// ── Single-company hunt ──

interface HuntResult {
  company: string; domain: string; sector: string;
  decision: string; confidence: string | null;
  finding: string; findingProvenance: string;
  owner: string | null; ownerConfidence: string | null; ownerProvenance: string | null;
  people: number; owner_candidates: number;
  growjo_person: boolean;
  provider_sources: string[];
  error: string | null;
  /** Full deep prospect (for show/why commands). */
  prospect?: any;
}

async function runOne(
  company: CanonicalCompany | null,
  domain: string,
  targetUrl: string,
  providerCompanies: ProviderCompanyLike[],
): Promise<HuntResult> {
  const growjoName = company?.canonical_name || domain;
  const sector = company?.industry || 'unknown';

  console.log(`\n${growjoName} (${targetUrl})`);
  if (company) {
    const hasPerson = !!(company.primary_person_name && company.primary_person_name !== company.company);
    console.log(`  [${company.source}] person=${company.primary_person_name || '(none)'}  title=${company.primary_title || '(none)'}  email=${company.primary_email || '(none)'}  hasPersonData=${hasPerson || !!company.primary_title || !!company.primary_email}`);
  }

  const resolution = buildResolution(company, domain, company?.source_url || `Direct seed: ${domain}`);

  const builder = new DeepProspectBuilder({
    fetcher: boundedFetch as any,
    saveArtifact,
    artifactsBaseDir: process.cwd(),
    maxDiscoveryPages: 15,
    discoveryDelayMs: 40,
    discoveryTimeoutMs: 6000,
    observationDelayMs: 40,
    onProgress: (stage, msg) => console.log(`  [${stage}] ${msg}`),
    logger: (m) => console.log(`  [discovery] ${m}`),
    growjo: company && company.source === 'GROWJO' ? company as any : null,
    providerCompanies,
    resolution,
    statePersistence,
  });

  const result: HuntResult = {
    company: growjoName, domain, sector,
    decision: '', confidence: null,
    finding: '', findingProvenance: '',
    owner: null, ownerConfidence: null, ownerProvenance: null,
    people: 0, owner_candidates: 0, growjo_person: false,
    provider_sources: company ? [company.source] : [],
    error: null,
  };

  try {
    const { prospect } = await withTimeout(builder.build(targetUrl), 90000);
    result.prospect = prospect;
    result.decision = prospect.decision;
    result.confidence = prospect.confidence;
    result.finding = prospect.deep_finding ? `${prospect.deep_finding.finding_type} / ${prospect.deep_finding.confidence}` : (prospect.findings ? prospect.findings.finding_type : 'NONE');
    result.findingProvenance = prospect.deep_finding ? prospect.deep_finding.provenance : '';
    result.owner = prospect.selected_owner ? prospect.selected_owner.name : '(none)';
    result.ownerConfidence = prospect.selected_owner ? prospect.selected_owner.confidence : null;
    result.ownerProvenance = prospect.selected_owner ? (prospect.selected_owner as any).deep_owner_provenance || '(none)' : null;
    result.people = prospect.people.length;
    result.owner_candidates = prospect.owner_candidates.length;
    result.growjo_person = !!company?.primary_person_name && company.primary_person_name !== company.company;
    console.log(`  ── RESULT: ${result.decision} (confidence ${result.confidence})`);
    console.log(`     finding:   ${result.finding}  [${result.findingProvenance}]`);
    console.log(`     owner:     ${result.owner} (${result.ownerConfidence}, provenance: ${result.ownerProvenance || 'none'})`);
    console.log(`     people:    ${result.people}  owner_candidates: ${result.owner_candidates}`);
  } catch (e: any) {
    result.error = e?.message || String(e);
    console.log(`  ── RESULT: ERROR: ${result.error}`);
  }

  return result;
}

// ── CSV loading — auto-detects format ──

function loadCsv(csvPath: string): { companies: CanonicalCompany[]; format: string; provider: string } {
  const text = fs.readFileSync(csvPath, 'utf8');

  // Try Growjo format (comma-delimited, matches GrowjoProvider aliases)
  const growjoResult = GrowjoProvider.parseCsv(text);
  if (growjoResult.companies.length > 0) {
    // Check if companies have real person data or are just company names
    const providerSource = growjoResult.column_mapping['name'] || growjoResult.column_mapping['company_name']
      ? 'GROWJO' : 'CSV';
    return { companies: growjoResult.companies.map(toCanonical), format: 'growjo-comma', provider: providerSource };
  }

  // Try generic CSV (comma-delimited)
  const csvProvider = new CSVProvider({ sourceUrl: csvPath });
  const csvResult = csvProvider.parseCsv(text);
  if (csvResult.companies.length > 0) {
    return { companies: csvResult.companies, format: 'generic-comma', provider: 'CSV' };
  }

  // Try semicolon-delimited (CityData / PublicDataset format)
  const publicProvider = new PublicDatasetProvider({
    datasetName: path.basename(csvPath),
    sourceUrl: csvPath,
  });
  const pubResult = publicProvider.parseCsv(text, ';');
  if (pubResult.companies.length > 0) {
    return { companies: pubResult.companies, format: 'citydata-semicolon', provider: 'PUBLIC_DATASET' };
  }

  throw new Error(`Could not parse CSV: ${csvPath}`);
}

// ── Show commands ──

async function showCompany(targetUrl: string, result: HuntResult, domain: string): Promise<void> {
  const p = result.prospect;
  if (!p) {
    console.log('  (no prospect data — research failed)');
    return;
  }
  console.log(`\n── COMPANY SURFACE ──`);
  console.log(`  company:         ${p.company}`);
  console.log(`  domain:          ${p.domain}`);
  console.log(`  industry:        ${p.industry}`);
  console.log(`  fit:             ${p.fit}`);
  console.log(`  public surface:  ${p.public_surface?.discovered_pages?.length || 0} page(s)`);
  for (const pg of (p.public_surface?.discovered_pages || [])) {
    console.log(`    ${pg.category || '??'}  ${pg.path || pg.url}`);
  }
  console.log(`\n── TECHNICAL SIGNALS ──`);
  for (const sig of (p.technical_signals || [])) {
    console.log(`  [${sig.signal_strength}] ${sig.type} — ${sig.relevance}  (${sig.source_url})`);
  }
  if (!p.technical_signals?.length) console.log('  (none)');
  console.log(`\n── FINDING ──`);
  console.log(`  ${p.deep_finding?.finding_type || p.findings?.finding_type || 'NONE'}  (${p.deep_finding?.confidence || p.findings?.impact_severity || '?'})`);
  if (p.deep_finding?.explanation) console.log(`  explanation: ${p.deep_finding.explanation.slice(0, 120)}`);
  console.log(`\n── DECISION ──`);
  console.log(`  ${p.decision} (confidence ${p.confidence})`);
}

async function showPeople(targetUrl: string, result: HuntResult, domain: string): Promise<void> {
  const p = result.prospect;
  if (!p) {
    console.log('  (no prospect data — research failed)');
    return;
  }
  console.log(`\n── PEOPLE DISCOVERED ──`);
  for (const person of (p.people || [])) {
    console.log(`  ${person.name} — ${person.role} (${person.confidence})`);
    console.log(`    sources: ${person.source_urls.join(', ')}`);
    console.log(`    evidence: ${(person.evidence || []).slice(0, 2).join(' | ')}`);
  }
  if (!p.people?.length) console.log('  (no people discovered — not invented)');
  console.log(`\n── OWNER CANDIDATES ──`);
  for (const c of (p.owner_candidates || [])) {
    console.log(`  ${c.name} — ${c.role} (${c.confidence})  explicit=${c.explicit_evidence}`);
  }
  if (!p.owner_candidates?.length) console.log('  (none)');
  console.log(`\n── SELECTED OWNER ──`);
  if (p.selected_owner) {
    console.log(`  ${p.selected_owner.name} — ${p.selected_owner.role} (${p.selected_owner.confidence})`);
    console.log(`  provenance: ${(p.selected_owner as any).deep_owner_provenance || '(none)'}`);
    console.log(`  finding link: ${p.selected_owner.finding_link}`);
    console.log(`  responsibility: ${p.selected_owner.responsibility_match}`);
    console.log(`  evidence:`);
    for (const e of (p.selected_owner.owner_evidence || [])) {
      console.log(`    — ${e.slice(0, 120)}`);
    }
  } else {
    console.log('  (none — HIGH-only gate: no verified person reached HIGH ownership confidence)');
  }
  console.log(`\n── CONTACTABILITY ──`);
  for (const c of (p.contactability || [])) {
    console.log(`  [${c.type}] ${(c.email || c.url || c.phone || '').slice(0, 60)}  confidence=${c.confidence}`);
  }
  if (!p.contactability?.length) console.log('  (no professional contact channels found)');
}

async function showOwnerReasoning(targetUrl: string, result: HuntResult, domain: string): Promise<void> {
  const p = result.prospect;
  if (!p) {
    console.log('  (no prospect data — research failed)');
    return;
  }
  console.log(`\n── OWNER RESOLUTION REASONING ──`);
  console.log(`  company: ${p.company}`);
  console.log(`  finding: ${p.deep_finding?.finding_type || p.findings?.finding_type || 'NONE'}`);
  console.log(`  technical area: ${p.deep_finding?.technical_area || 'n/a'}`);

  console.log(`\n  Candidate pool (${p.owner_candidates?.length || 0} candidates):`);
  for (const c of (p.owner_candidates || [])) {
    console.log(`    ${c.name} — ${c.role}  (${c.confidence})  explicit=${c.explicit_evidence}`);
    console.log(`      relationship: ${c.relationship_to_area}`);
    console.log(`      evidence: ${(c.evidence || []).slice(0, 1).join(' | ').slice(0, 100)}`);
  }

  if (p.selected_owner) {
    console.log(`\n  ✓ Selected: ${p.selected_owner.name} (${p.selected_owner.confidence})`);
    console.log(`    provenance: ${(p.selected_owner as any).deep_owner_provenance || '(none)'}`);
    console.log(`    HIGH-only gate: passed (candidate confidence = HIGH)`);
  } else {
    console.log(`\n  ✗ No owner selected — HIGH-only gate not met.`);
    console.log(`    (identity confidence ≠ ownership confidence — a person can be`);
    console.log(`     clearly listed (HIGH identity) but not a verified technical owner)`);
    console.log(`    (Strong ICP + good research + no HIGH owner → RESEARCH_MORE, not NO_GO)`);
  }

  console.log(`\n  Evidence lineage:`);
  if (p.evidence && p.evidence.length > 0) {
    for (const e of p.evidence.slice(0, 10)) {
      console.log(`    [${e.source_type || '?'}] ${e.public_url || e.id}  provenance=${e.evidence_origin}`);
    }
  } else {
    console.log('    (no evidence collected)');
  }

  console.log(`\n  Decision: ${p.decision} (confidence ${p.confidence})`);
  if (p.decision === 'RESEARCH_MORE' && !p.selected_owner) {
    console.log(`  → Strong technical surface but no verified HIGH-confidence owner.`);
    console.log(`  → Next step: deepen person discovery (engineering pages, GitHub contributors, blog authors).`);
  }
}

async function main(): Promise<void> {
  const { csv, batch, start, domains, companies: companyNames, research } = parseArgs(process.argv);

  // Initialize provider registry (providers are optional/pluggable)
  const registry = new ProviderRegistry();
  const entityResolver = new EntityResolver();

  // ── Mode 1: --research <URL> ──
  if (research) {
    console.log(`XAVIRA HUNT — direct research: ${research}`);
    console.log(`Providers: (none — direct seed, no Growjo required)`);
    const result = await runOne(null, new URL(research).hostname, research, []);
    printSummary([result]);
    return;
  }

  // ── Mode 2: --domains ──
  if (domains.length > 0) {
    console.log(`XAVIRA HUNT — ${domains.length} domain seed(s): ${domains.join(', ')}`);
    console.log(`Providers: (none — direct domain seeds, no Growjo required)`);
    const results: HuntResult[] = [];
    let i = 0;
    for (const d of domains) {
      i++;
      try {
        const providerCompanies: CanonicalCompany[] = csv ? loadCsv(csv).companies : [];
        const company = providerCompanies.find(c => (c.domain || '').toLowerCase() === d.toLowerCase()) || null;
        const target = d.startsWith('http') ? d : `https://${d}`;
        results.push(await runOne(company, d, target, company ? [company] : []));
      } catch (e: any) {
        console.log(`\n[${i}/${domains.length}] ${d} — FAILED: ${e?.message || String(e)}`);
        results.push({ company: d, domain: d, sector: 'unknown', decision: 'ERROR', confidence: null, finding: '', findingProvenance: '', owner: null, ownerConfidence: null, ownerProvenance: null, people: 0, owner_candidates: 0, growjo_person: false, provider_sources: [], error: e?.message || String(e) });
      }
    }
    printSummary(results);
    return;
  }

  // ── Mode 3: --companies ──
  if (companyNames.length > 0) {
    console.log(`XAVIRA HUNT — ${companyNames.length} company name seed(s): ${companyNames.join(', ')}`);
    console.log(`Providers: (none — direct name seeds, no Growjo required)`);
    const results: HuntResult[] = [];
    let i = 0;
    for (const name of companyNames) {
      i++;
      try {
        const providerCompanies: CanonicalCompany[] = csv ? loadCsv(csv).companies : [];
        const company = providerCompanies.find(c => c.company.toLowerCase().includes(name.toLowerCase())) || null;
        const domain = company?.domain || name.toLowerCase().replace(/\s+/g, '') + '.com';
        const target = `https://${domain.replace(/^https?:\/\//, '')}`;
        results.push(await runOne(company, domain, target, company ? [company] : []));
      } catch (e: any) {
        console.log(`\n[${i}/${companyNames.length}] ${name} — FAILED: ${e?.message || String(e)}`);
        results.push({ company: name, domain: '', sector: 'unknown', decision: 'ERROR', confidence: null, finding: '', findingProvenance: '', owner: null, ownerConfidence: null, ownerProvenance: null, people: 0, owner_candidates: 0, growjo_person: false, provider_sources: [], error: e?.message || String(e) });
      }
    }
    printSummary(results);
    return;
  }

  // ── Mode 4: CSV file (batch) ──
  if (csv) {
    const { companies, format, provider } = loadCsv(csv);
    console.log(`XAVIRA HUNT — ${companies.length} companies from ${csv}`);
    console.log(`Format: ${format} | Provider source: ${provider}`);

    const slice = companies.slice(start, start + batch);
    const results: HuntResult[] = [];
    let i = start;
    for (const c of slice) {
      i++;
      try {
        const targetUrl = c.domain ? (c.domain.startsWith('http') ? c.domain : `https://${c.domain}`) : `https://${c.canonical_name.replace(/\s+/g, '').toLowerCase()}.com`;
        const providerCompanies = [c] as ProviderCompanyLike[];
        results.push(await runOne(c, c.domain || '', targetUrl, providerCompanies));
      } catch (e: any) {
        console.log(`\n[${i}/${companies.length}] ${c.canonical_name} — FAILED: ${e?.message || String(e)}`);
        results.push({ company: c.canonical_name, domain: c.domain || '', sector: c.industry || 'unknown', decision: 'ERROR', confidence: null, finding: '', findingProvenance: '', owner: null, ownerConfidence: null, ownerProvenance: null, people: 0, owner_candidates: 0, growjo_person: false, provider_sources: [c.source], error: e?.message || String(e) });
      }
    }
    printSummary(results);
    return;
  }

  // ── Mode --show (REPL-style display subcommands) ──
  // Usage: npx tsx scripts/growjo-hunt.ts show company <domain>
  //        npx tsx scripts/growjo-hunt.ts show people <domain>
  //        npx tsx scripts/growjo-hunt.ts why owner <domain>
  const subcommand = process.argv.slice(2).find(a => !a.startsWith('--'));
  if (subcommand === 'show' || subcommand === 'why') {
    const subArgs = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const mode = subArgs[0]; // 'show' or 'why'
    const aspect = subArgs[1];  // 'company' | 'people' | 'owner'
    const targetDomain = subArgs[2];
    if (!aspect || !targetDomain) {
      console.error(`Usage: npx tsx scripts/growjo-hunt.ts ${mode} ${aspect || '<aspect>'} <domain>`);
      console.error(`  show company <domain>  — full company surface + signals + findings`);
      console.error(`  show people <domain>   — discovered people + owner candidates`);
      console.error(`  why owner <domain>     — owner resolution reasoning`);
      process.exit(1);
    }

    console.log(`XAVIRA SHOW — ${mode} ${aspect} for ${targetDomain}`);
    console.log(`Providers: (none — direct domain seed, no Growjo required)`);

    const target = `https://${targetDomain.replace(/^https?:\/\//, '')}`;
    const result = await runOne(null, targetDomain, target, []);

    if (aspect === 'company') {
      await showCompany(target, result, targetDomain);
    } else if (aspect === 'people') {
      await showPeople(target, result, targetDomain);
    } else if (aspect === 'owner' || (mode === 'why' && aspect === 'owner')) {
      await showOwnerReasoning(target, result, targetDomain);
    }
    return;
  }

  // ── Mode: refresh <domain> — re-research a single company with fresh state ──
  if (subcommand === 'refresh') {
    const domain = process.argv.slice(2).filter(a => !a.startsWith('--'))[1];
    if (!domain) {
      console.error('Usage: npx tsx scripts/growjo-hunt.ts refresh <domain>');
      process.exit(1);
    }
    console.log(`XAVIRA REFRESH — re-researching ${domain}`);
    console.log(`Providers: (dataset-first; live-web fallback when incomplete/stale)`);
    const target = `https://${domain.replace(/^https?:\/\//, '')}`;
    const csvCompanies = csv ? loadCsv(csv).companies : [];
    const company = csvCompanies.find(c => (c.domain || '').toLowerCase() === domain.toLowerCase()) || null;
    const result = await runOne(company, domain, target, company ? [company] : []);
    if (result.prospect) {
      showChanges(result.prospect, domain);
    } else {
      console.log('  (no prospect data — refresh failed)');
    }
    return;
  }

  // ── Mode: refresh all — re-research all companies with stored state ──
  if (subcommand === 'refresh-all' || (subcommand === 'refresh' && process.argv.slice(2).includes('--all'))) {
    const allDomains = parseRefreshAll(process.argv, csv);
    console.log(`XAVIRA REFRESH-ALL — re-researching ${allDomains.length} company/companies`);
    const results: HuntResult[] = [];
    let i = 0;
    for (const d of allDomains) {
      i++;
      try {
        const csvCompanies = csv ? loadCsv(csv).companies : [];
        const company = csvCompanies.find(c => (c.domain || '').toLowerCase() === d.toLowerCase()) || null;
        const target = d.startsWith('http') ? d : `https://${d}`;
        console.log(`\n[${i}/${allDomains.length}] Refreshing ${d}...`);
        results.push(await runOne(company, d, target, company ? [company] : []));
      } catch (e: any) {
        console.log(`\n[${i}/${allDomains.length}] ${d} — FAILED: ${e?.message || String(e)}`);
        results.push({ company: d, domain: d, sector: 'unknown', decision: 'ERROR', confidence: null, finding: '', findingProvenance: '', owner: null, ownerConfidence: null, ownerProvenance: null, people: 0, owner_candidates: 0, growjo_person: false, provider_sources: [], error: e?.message || String(e) });
      }
    }
    printSummary(results);
    return;
  }

  // ── Mode: changes <domain> — show diff vs. previously stored state ──
  if (subcommand === 'changes') {
    const domain = process.argv.slice(2).filter(a => !a.startsWith('--'))[1];
    if (!domain) {
      console.error('Usage: npx tsx scripts/growjo-hunt.ts changes <domain>');
      process.exit(1);
    }
    console.log(`XAVIRA CHANGES — diff for ${domain}`);
    const target = `https://${domain.replace(/^https?:\/\//, '')}`;
    const csvCompanies = csv ? loadCsv(csv).companies : [];
    const company = csvCompanies.find(c => (c.domain || '').toLowerCase() === domain.toLowerCase()) || null;
    const result = await runOne(company, domain, target, company ? [company] : []);
    if (result.prospect) {
      showChanges(result.prospect, domain);
    } else {
      console.log('  (no prospect data — cannot diff)');
    }
    return;
  }

  // ── Mode: resume <domain> — resume interrupted research ──
  if (subcommand === 'resume') {
    const domain = process.argv.slice(2).filter(a => !a.startsWith('--'))[1];
    if (!domain) {
      console.error('Usage: npx tsx scripts/growjo-hunt.ts resume <domain>');
      process.exit(1);
    }
    console.log(`XAVIRA RESUME — continuing research for ${domain}`);
    const target = `https://${domain.replace(/^https?:\/\//, '')}`;
    const csvCompanies = csv ? loadCsv(csv).companies : [];
    const company = csvCompanies.find(c => (c.domain || '').toLowerCase() === domain.toLowerCase()) || null;
    const result = await runOne(company, domain, target, company ? [company] : []);
    if (result.prospect) {
      console.log(`\n── RESUME SUMMARY ──`);
      console.log(`  decision:    ${result.prospect.decision} (confidence ${result.prospect.confidence})`);
      console.log(`  finding:     ${result.prospect.deep_finding?.finding_type || result.prospect.findings?.finding_type || 'NONE'}`);
      console.log(`  owner:       ${result.prospect.selected_owner?.name || '(none)'}`);
      console.log(`  people:      ${result.prospect.people.length}`);
      console.log(`  evidence:    ${result.prospect.evidence.length}`);
      console.log(`  sources:     ${result.prospect.public_surface?.discovered_pages?.length || 0}`);
      if ((result.prospect as any).changes && (result.prospect as any).changes.length > 0) {
        console.log(`  changes vs prior: ${(result.prospect as any).changes.length}`);
        for (const ch of (result.prospect as any).changes) {
          console.log(`    [${ch.kind}] ${ch.category}: ${ch.change}`);
        }
      } else {
        console.log(`  changes vs prior: (none — first run)`);
      }
    }
    return;
  }

  console.error('Usage: npx tsx scripts/growjo-hunt.ts <csv> [options]');
  console.error('       npx tsx scripts/growjo-hunt.ts --domains "vercel.com,supabase.com"');
  console.error('       npx tsx scripts/growjo-hunt.ts --companies "Vercel,Supabase"');
  console.error('       npx tsx scripts/growjo-hunt.ts --research https://vercel.com');
  console.error('       npx tsx scripts/growjo-hunt.ts refresh <domain>');
  console.error('       npx tsx scripts/growjo-hunt.ts refresh --all [--csv <csv>]');
  console.error('       npx tsx scripts/growjo-hunt.ts changes <domain>');
  console.error('       npx tsx scripts/growjo-hunt.ts resume <domain>');
  console.error('Options: --batch N  --start K');
  process.exit(1);
}

// ── Changes display ──

function showChanges(prospect: any, domain: string): void {
  console.log(`\n── CHANGE DETECTION — ${prospect.company} (${domain}) ──`);
  const changes = prospect.changes || [];
  if (changes.length === 0) {
    console.log('  (no changes detected — first run or all UNCHANGED)');
  } else {
    const byKind = changes.reduce((acc: Record<string, number>, c: any) => { acc[c.kind] = (acc[c.kind] || 0) + 1; return acc; }, {});
    console.log(`  ${changes.length} change(s): ${Object.entries(byKind).map(([k, v]) => `${k}×${v}`).join('  ')}`);
    console.log('');
    for (const c of changes) {
      const marker: Record<string, string> = { NEW: '✚', CHANGED: '~', UNCHANGED: '=', REMOVED: '✖', UNKNOWN: '?' };
      console.log(`  ${marker[c.kind] || '?'} [${c.category}] ${c.entity.slice(0, 50)}`);
      console.log(`      ${c.change}`);
    }
  }

  console.log(`\n── LIVE-WEB RESEARCH ──`);
  console.log(`  researched:   ${prospect.live_web_researched || false}`);
  console.log(`  evidence:     ${prospect.live_web_evidence?.length || 0}`);
  console.log(`  search queries: ${prospect.search_queries?.length || 0}`);
  if (prospect.search_queries && prospect.search_queries.length > 0) {
    for (const q of prospect.search_queries) {
      console.log(`    ${q.cached ? '[cached]' : '[new]'} "${q.query}" → ${q.results} result(s)`);
    }
  }

  console.log(`\n── DATA COMPLETENESS ──`);
  const ds = prospect.data_sufficiency;
  if (ds) {
    console.log(`  sufficient:           ${ds.sufficient}`);
    console.log(`  needs_live_research:  ${ds.needs_live_research}`);
    if (ds.missing.length > 0) console.log(`  missing:              ${ds.missing.join(', ')}`);
    if (ds.stale.length > 0) console.log(`  stale:                ${ds.stale.join(', ')}`);
    for (const r of ds.reasons) console.log(`  reason: ${r}`);
  } else {
    console.log('  (no sufficiency data)');
  }
}

// ── Parse domains for refresh --all ──

function parseRefreshAll(argv: string[], csv: string | null): string[] {
  const domainsFlag = argv.join(' ').match(/--domains\s+([\w.,\-:]+)/);
  if (domainsFlag) {
    return domainsFlag[1].split(',').map(d => d.trim()).filter(Boolean);
  }
  if (csv) {
    return loadCsv(csv).companies.map(c => c.domain || c.canonical_name).filter(Boolean);
  }
  return [];
}

// ── Summary ──

function printSummary(results: HuntResult[]): void {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('                    HUNT SUMMARY');
  console.log('══════════════════════════════════════════════════════════════════');
  for (const r of results) {
    console.log(
      `${r.company.slice(0, 22).padEnd(24)} | ${(r.domain || '—').slice(0, 16).padEnd(18)} | ${r.decision.padEnd(14)} | ${(r.owner || '—').slice(0, 16).padEnd(18)} | ${(r.ownerProvenance || '—').slice(0, 16).padEnd(18)} | prov=${r.provider_sources.join(',')}`
    );
  }
  console.log('═'.repeat(120));
  const byDecision = results.reduce((acc, r) => { acc[r.decision] = (acc[r.decision] || 0) + 1; return acc; }, {} as Record<string, number>);
  console.log(`Decision breakdown: ${Object.entries(byDecision).map(([d, n]) => `${d}×${n}`).join('  ')}`);
  const ownersFound = results.filter(r => r.owner !== '(none)' && r.owner !== null);
  console.log(`Owners found: ${ownersFound.length} / ${results.length}  (no persons in CSV → no owners invented)`);
  console.log('\n═══ DONE ═══');
}

void main();
