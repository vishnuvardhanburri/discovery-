/**
 * XAVIRA — DEEP INTELLIGENCE test suite
 * Run with:  npx tsx tests/deepOperator.test.ts
 *
 * Additive suite (does not modify acceptanceTest.ts or xaviraOperator.test.ts):
 *   - deep CLI command parsing (deep help / deep <url> dispatch / show all no-op)
 *   - deep single-company run (READY path: surface→signals→people→owner→evidence→finding→email)
 *   - deep NO_GO run (no surface / no people / no finding)
 *   - deep RESEARCH_MORE run (signals+owner but no finding + no contact)
 *   - surface discovery (bounded, 2xx gating)
 *   - technical signals (structured, classified FACT/OBS/OINF)
 *   - fact / observation / inference separation
 *   - people extraction (explicit HIGH / no-name not fabricated)
 *   - owner selection + owner evidence string ("is listed as")
 *   - contact provenance (only public, never guessed)
 *   - strict ICP qualification (NO_GO / RESEARCH_MORE / PASS)
 *   - evidence lineage (resolved → raw)
 *   - email claim lineage (claims reference evidence ids)
 *   - no fabricated email (founder identity present; unsupported terms absent)
 *   - no auto-send (send requires --confirm + GO)
 *   - artifact persistence (per-company + batch summary)
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import { PublicLinkDiscovery } from '../src/server/PublicLinkDiscovery';
import { PeopleExtractor } from '../src/server/PeopleExtractor';
import { OwnerSelector } from '../src/server/OwnerSelector';
import { DeepSignalExtractor } from '../src/server/DeepSignalExtractor';
import { ContactabilityFinder } from '../src/server/ContactabilityFinder';
import { IcpQualificationEngine } from '../src/server/IcpQualificationEngine';
import { DeepEmailGenerator } from '../src/server/DeepEmailGenerator';
import { GrowjoProvider } from '../src/server/GrowjoProvider';
import { XaviraOperator } from '../src/server/XaviraOperator';
import type {
  IntelligenceCase, Evidence, OwnerCandidate, CompanySurface,
  DiscoveredPage, PublicObservationProvider, ObservationResult
} from '../src/server/IntelligenceCase';
import type { HttpFetcher } from '../src/server/IntelligenceCase';
import type { DeepProspect, GrowjoCompany, CompanyResolution } from '../src/server/DeepTypes';
import type { IcpContext } from '../src/server/IcpQualificationEngine';

// ── CANNED HTML ─────────────────────────────────────────────────────────────

const HOME_HTML = `<html><body><nav>
<a href="/team">Team</a><a href="/leadership">Leadership</a><a href="/developers">Developers</a>
<a href="/engineering">Engineering</a><a href="/about">About</a><a href="/status">Status</a>
</nav><h1>Acme Corp</h1><p>Acme builds developer infra.</p></body></html>`;

const TEAM_HTML = `<html><body><section class="team">
<div class="member"><img src="/jane.jpg" alt="Jane Doe"><h3>Jane Doe</h3><p class="title">Head of Engineering</p></div>
<div class="member"><img src="/bob.jpg" alt="Bob Smith"><h3>Bob Smith</h3><p class="title">VP of Engineering</p></div>
<div class="member"><img src="/sarah.jpg" alt="Sarah Jones"><h3>Sarah Jones</h3><p class="title">Head of Marketing</p></div>
</section></body></html>`;

const ABOUT_HTML = `<html><body><h2>Leadership</h2><p>Jane Doe — CTO</p><p>Bob Smith — VP Engineering</p></body></html>`;

const DEV_WITH_CONTACT_HTML = `<html><body><h1>Developer Platform</h1>
<p>We offer a REST API and SDK. Docs at /docs. Services run on Kubernetes.</p>
<p>Follow the team on <a href="https://www.linkedin.com/in/janedoe">LinkedIn</a>.</p>
<p>Contact: <a href="mailto:jane@acme.com">jane@acme.com</a></p>
</body></html>`;

const DEV_BARE_HTML = `<html><body><h1>Developer Platform</h1>
<p>We offer a REST API and SDK. Microservices on Kubernetes.</p>
</body></html>`;

const ENG_HTML = `<html><body><article><h1>Engineering Blog</h1>
<p>We migrated to microservices on AWS. We are hiring platform and SRE engineers.</p>
<p>All systems operational via our status page.</p></article></body></html>`;

const BLOG_HTML = `<html><body><article><h1>Engineering Blog</h1><p>We run on AWS and use Kubernetes for orchestration.</p></article></body></html>`;

const STATUS_HTML = `<html><body><h1>System Status</h1>
<p>All systems operational. Last incident: 2024-03-01 partial outage resolved.</p></body></html>`;

const MINIMAL_HOME_HTML = `<html><body><h1>Welcome to Acme</h1><p>We sell consumer widgets.</p></body></html>`;

// ── FAKE TRANSPORT ───────────────────────────────────────────────────────────

type Route = { status: number; body: string; ct?: string };
function fakeFetcher(routes: Record<string, Route>): HttpFetcher {
  return async (url: string, _init: any): Promise<Response> => {
    const key = url.replace(/\/$/, '') || url;
    const hit = routes[key] || routes[url];
    if (hit) return new Response(hit.body, { status: hit.status, headers: hit.ct ? { 'content-type': hit.ct } : {} });
    return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
  };
}

function goRoutes(): Record<string, Route> {
  return {
    'https://acme.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
    'https://acme.com/team': { status: 200, body: TEAM_HTML, ct: 'text/html' },
    'https://acme.com/leadership': { status: 200, body: ABOUT_HTML, ct: 'text/html' },
    'https://acme.com/about': { status: 200, body: ABOUT_HTML, ct: 'text/html' },
    'https://acme.com/developers': { status: 200, body: DEV_WITH_CONTACT_HTML, ct: 'text/html' },
    'https://acme.com/engineering': { status: 200, body: ENG_HTML, ct: 'text/html' },
    'https://acme.com/status': { status: 200, body: STATUS_HTML, ct: 'text/html' },
  };
}
function noContactRoutes(): Record<string, Route> {
  const r = goRoutes();
  r['https://acme.com/developers'] = { status: 200, body: DEV_BARE_HTML, ct: 'text/html' };
  return r;
}
function minimalRoutes(): Record<string, Route> {
  return { 'https://acme.com': { status: 200, body: MINIMAL_HOME_HTML, ct: 'text/html' } };
}

// ── MOCK OBSERVATION PROVIDER ────────────────────────────────────────────────

class MockProvider implements PublicObservationProvider {
  constructor(private evidenceToReturn: Evidence[]) {}
  async observePublicSurface(_url: string, _options?: any): Promise<ObservationResult> {
    return { evidence: this.evidenceToReturn, discovery_errors: 0 };
  }
}

const goEvidence: Evidence[] = [{
  id: 'ev_go_test', evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
  public_url: 'https://api.acme.com/v1/users', source_type: 'API_ENDPOINT' as const,
  status: 200, observed_behavior: 'The payload exposes internal metadata fields like storage_path.',
  sensitive_fields: ['storage_path'], reproductions: 3, repeatable: true,
  tested_without_auth: true, not_tested: ['access private data'],
  retrieved_at: new Date().toISOString(), evidence_text: 'exposes storage_path',
  latency_ms: 120, baseline_latency_ms: 100
}];

const genericEvidence: Evidence[] = [{
  id: 'ev_generic_test', evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
  public_url: 'https://acme.com/engineering', source_type: 'ENGINEERING_BLOG' as const,
  status: 200, observed_behavior: 'A general engineering blog post about scaling practices.',
  reproductions: 1, repeatable: true, tested_without_auth: true,
  not_tested: ['mutations'], retrieved_at: new Date().toISOString(), evidence_text: 'blog scaling'
}];

const janeCandidate: OwnerCandidate = {
  name: 'Jane Doe', role: 'Head of Engineering', company: 'acme.com',
  source_urls: ['https://acme.com/team'],
  evidence: ['Jane Doe is listed as Head of Engineering on the Acme team page.'],
  relationship_to_area: "Role 'Head of Engineering' covers engineering & technical leadership.",
  confidence: 'HIGH', explicit_evidence: true
};

// ── TEST RIG ─────────────────────────────────────────────────────────────────

let passCount = 0;
let failCount = 0;
const failures: string[] = [];
function assert(cond: boolean, message: string): void {
  if (cond) passCount++; else { failCount++; failures.push(message); console.log(`[FAIL] ${message}`); }
}
function assertEq<T>(actual: T, expected: T, message: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passCount++; else { failCount++; failures.push(`${message}`); console.log(`[FAIL] ${message} got ${JSON.stringify(actual)}`); }
}
function capture() { const buf: string[] = []; return { buf, output: { write: (s: string) => buf.push(s) }, text: () => buf.join('') }; }
function runTest(name: string, fn: () => Promise<void> | void) { console.log(`\n--- ${name} ---`); return fn(); }
function writeArtifact(filePath: string, data: string): void {
  try { fs.mkdirSync(path.dirname(filePath), { recursive: true }); } catch { /* exists */ }
  fs.writeFileSync(filePath, data, 'utf8');
}

// ── TESTS ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('==================================================');
  console.log('XAVIRA DEEP INTELLIGENCE — TEST SUITE');
  console.log('==================================================\n');

  // 1. CLI command parsing
  await runTest('deep CLI parsing — help / no-arg', () => {
    const c = capture();
    const op = new XaviraOperator({ output: c.output });
    op.dispatch('deep help');
    assert(c.text().includes('DEEP INTELLIGENCE'), 'deep help prints deep help');
    op.dispatch('deep');
    assert(c.text().includes('deep file'), 'deep with no arg shows help (lists deep file)');
  });

  // 2. show all no-op when no deep research
  await runTest('show all no-op without deep research', () => {
    const c = capture();
    const op = new XaviraOperator({ output: c.output });
    op.dispatch('show all');
    assert(c.text().includes('No deep research'), 'show all warns when no deep research');
  });

  // 3. deep prospects listing (empty)
  await runTest('deep prospects empty listing', () => {
    const c = capture();
    const op = new XaviraOperator({ output: c.output, artifactsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-noprospects-')) });
    op.dispatch('deep prospects');
    assert(c.text().includes('No deep-prospect artifacts'), 'empty deep prospects listing');
  });

  // 4. SURFACE DISCOVERY (bounded, 2xx gating, same-origin)
  await runTest('surface discovery — bounded, same-origin, 2xx gating', async () => {
    const surface = await PublicLinkDiscovery.discover('https://acme.com', {
      fetcher: fakeFetcher(goRoutes()), maxPages: 20, delayMs: 0, timeoutMs: 2000
    });
    assert(surface.discovered_pages.length > 0, 'discovery returns pages');
    const urls = surface.discovered_pages.map(p => p.url);
    assert(!urls.some(u => u.includes('evil')), 'no cross-origin');
    const team = surface.discovered_pages.find(p => p.path === '/team');
    assert(!!team, '/team discovered');
    // 404 routes are NOT recorded (2xx gating)
    assert(!surface.discovered_pages.some(p => p.path === '/technology'), '/technology (404) not recorded as a page');
  });

  // 5. PEOPLE EXTRACTION — explicit HIGH + no fabrication
  await runTest('people extraction — explicit HIGH, non-candidate not fabricated', () => {
    const pages: DiscoveredPage[] = [{ url: 'https://acme.com/team', path: '/team', category: 'team_people' }];
    const html = new Map([['https://acme.com/team', TEAM_HTML]]);
    const cands = PeopleExtractor.extractFromPages(pages, html, { company: 'acme.com' });
    const jane = cands.find(c => c.name === 'Jane Doe');
    const bob = cands.find(c => c.name === 'Bob Smith');
    const sarah = cands.find(c => c.name === 'Sarah Jones');
    assert(!!jane, 'Jane extracted');
    assert(jane?.confidence === 'HIGH', 'Jane HIGH (explicit team listing)');
    assert(jane?.explicit_evidence === true, 'Jane explicit_evidence true');
    assert(jane?.role === 'Head of Engineering', 'Jane role Head of Engineering');
    assert(!!bob, 'Bob extracted');
    assert(bob?.role === 'VP Engineering', 'Bob normalised to VP Engineering');
    assert(!sarah, 'Sarah (Head of Marketing) NOT fabricated');
  });

  // 5b. PEOPLE EXTRACTION — never fabricate "Use Case Ve", "Mark Hawkins Dire", "Docs Dire"
  await runTest('people extraction — no false-positive names (Use Case Ve / Mark Hawkins Dire / Docs Dire)', () => {
    const html = `<html><body>
<section><h2>Use Case</h2><p>Ve — CTO</p><p>Jane Roe — Director of Data Platform</p></section>
<nav><a href="/docs">Docs</a> — Dire</nav>
<section class="team"><h3>Team</h3><p>Mark Hawkins — Director of Engineering</p></section>
</body></html>`;
    const pages: DiscoveredPage[] = [
      { url: 'https://acme.com/team', path: '/team', category: 'team_people' },
      { url: 'https://acme.com/docs', path: '/docs', category: 'docs' }
    ];
    const cands = PeopleExtractor.extractFromPages(pages, new Map([
      ['https://acme.com/team', html], ['https://acme.com/docs', html]
    ]), { company: 'acme.com' });
    const names = cands.map(c => c.name);
    const roles = cands.map(c => c.role);
    assert(!names.some(n => /^Use Case/.test(n) || /Dire$/i.test(n) || n === 'Docs Dire'),
      `no fabricated names like "Use Case Ve"/"Docs Dire" (got ${JSON.stringify(names)})`);
    assert(!roles.some(r => r === 'Dire'), `no truncated role "Dire" (got ${JSON.stringify(roles)})`);
    assert(cands.every(c => c.confidence === 'HIGH'), 'all people-context candidates are HIGH');
  });

  // 6. OWNER SELECTION — evidence string uses "is listed as"
  await runTest('owner selection — explicit candidate -> HIGH evidence string', () => {
    const sel = OwnerSelector.select([janeCandidate], 'api surface');
    assert(!!sel.candidate, 'an owner selected');
    assert(sel.candidate?.name === 'Jane Doe', 'selected Jane Doe');
    assert(sel.ownerEvidenceString.includes('Jane Doe'), 'evidence string names candidate');
    assert(sel.ownerEvidenceString.includes('is listed as'), 'evidence string uses explicit "is listed as" phrase');
    assert(sel.ownerEvidenceString.includes('https://acme.com/team'), 'evidence string cites source URL');
  });

  // 7. TECHNICAL SIGNALS + FACT/OBSERVATION/INFERENCE separation
  await runTest('technical signals — extracted + provenance classification', () => {
    const pages: DiscoveredPage[] = [
      { url: 'https://acme.com/engineering', path: '/engineering', category: 'engineering' },
      { url: 'https://acme.com/status', path: '/status', category: 'status_ops' },
      { url: 'https://acme.com/blog', path: '/blog', category: 'blog' }
    ];
    const html = new Map<string, string>([
      ['https://acme.com/engineering', ENG_HTML],
      ['https://acme.com/status', STATUS_HTML],
      ['https://acme.com/blog', BLOG_HTML]
    ]);
    const signals = DeepSignalExtractor.extract(pages, html, [], { onProgress: () => {} });
    assert(signals.length >= 3, `signals extracted (got ${signals.length})`);
    assert(signals.some(s => s.type === 'ARCHITECTURE_DISCUSSION'), 'architecture signal present');
    assert(signals.some(s => s.type === 'TECHNICAL_HIRING'), 'technical hiring signal present');
    assert(signals.some(s => s.type === 'STATUS_PAGE' && s.provenance === 'REAL_PUBLIC_OBSERVATION'), 'status page is a REAL_PUBLIC_OBSERVATION');
    assert(signals.some(s => s.type === 'PUBLIC_INCIDENT'), 'incident signal present');
    // engineering-page signals are DOCUMENTED_FACT; blog-page architecture is INFERENCE
    const archEng = signals.find(s => s.type === 'ARCHITECTURE_DISCUSSION' && s.source_url === 'https://acme.com/engineering');
    const archBlog = signals.find(s => s.type === 'ARCHITECTURE_DISCUSSION' && s.source_url === 'https://acme.com/blog');
    assert(archEng?.provenance === 'DOCUMENTED_FACT', 'engineering-page architecture = DOCUMENTED_FACT (not inference)');
    assert(archBlog?.provenance === 'XAVIRA_INFERENCE', 'blog-page architecture = XAVIRA_INFERENCE (not stated as fact)');
    // separation
    const split = DeepSignalExtractor.splitByProvenance(signals);
    assert(split.inferences.every(s => s.provenance === 'XAVIRA_INFERENCE'), 'inferences bucket clean');
    assert(split.documented_facts.every(s => s.provenance === 'DOCUMENTED_FACT'), 'facts bucket clean');
    assert(split.public_observations.every(s => s.provenance === 'REAL_PUBLIC_OBSERVATION'), 'observations bucket clean');
    assert(signals.every(s => !!s.signal_id && !!s.excerpt && !!s.relevance), 'every signal has id + excerpt + relevance');
    assert(signals.every(s => s.excerpt.length <= 200), 'excerpts length-capped');
  });

  // 8. CONTACTABILITY — only public contacts, never guessed
  await runTest('contactability — public contacts captured with provenance, no guesses', () => {
    const pages: DiscoveredPage[] = [{ url: 'https://acme.com/developers', path: '/developers', category: 'engineering' }];
    const html = new Map([['https://acme.com/developers', DEV_WITH_CONTACT_HTML]]);
    const contacts = ContactabilityFinder.find(pages, html);
    const email = contacts.find(c => c.type === 'PROFESSIONAL_EMAIL');
    const profile = contacts.find(c => c.type === 'PROFESSIONAL_PROFILE');
    assert(!!email, 'mailto email captured');
    assert(email?.value === 'jane@acme.com', 'captured the real public email (not invented)');
    assert(email?.source_url === 'https://acme.com/developers', 'email provenance recorded');
    assert(!!profile, 'public profile link captured');
    assert(!!profile && profile.value.includes('linkedin.com/in/janedoe'), 'LinkedIn profile link captured');
    // NO invented emails: an address must come from the page, never constructed
    const allEmails = contacts.filter(c => c.type === 'PROFESSIONAL_EMAIL');
    assert(allEmails.every(c => c.value === 'jane@acme.com'), 'no invented/gmail-style emails generated');
    assert(ContactabilityFinder.hasUsableChannel(contacts), 'usable channel exists');
  });

  // 9. CONTACTABILITY — role accounts / no-reply filtered
  await runTest('contactability — roles/no-reply filtered', () => {
    const html = `<html><body><a href="mailto:info@acme.com">info</a><a href="mailto:noreply@acme.com">noreply</a><a href="mailto:team@acme.com">team</a></body></html>`;
    const contacts = ContactabilityFinder.find([{ url: 'https://acme.com/contact', path: '/contact' }], new Map([['https://acme.com/contact', html]]));
    assert(contacts.length === 0, 'role/no-reply accounts filtered out (got ' + contacts.length + ')');
  });

  // 10. ICP QUALIFICATION — NO_GO (no surface/signals/people/contact)
  await runTest('ICP qualification — NO_GO when not an engineering target', () => {
    const emptySurface: CompanySurface = {
      company: 'acme', origin: 'https://acme.com', homepage: 'https://acme.com',
      discovered_pages: [{ url: 'https://acme.com', path: '/', category: 'homepage' }],
      page_categories: {}
    };
    const q = IcpQualificationEngine.qualify({
      company: 'acme', domain: 'acme.com', surface: emptySurface, signals: [],
      people: [], owner: null, contacts: [], finding: null, evidence: []
    } as IcpContext);
    assert(q.overall === 'NO_GO', `minimal surface -> NO_GO (got ${q.overall})`);
    assert(!!q.gated_reason, 'NO_GO has a gated reason');
  });

  // 11. ICP QUALIFICATION — PASS (full, defensible)
  await runTest('ICP qualification — PASS when all gates met', () => {
    const signals = DeepSignalExtractor.extract(
      [{ url: 'https://acme.com/engineering', path: '/engineering', category: 'engineering' },
       { url: 'https://acme.com/status', path: '/status', category: 'status_ops' }],
      new Map([['https://acme.com/engineering', ENG_HTML], ['https://acme.com/status', STATUS_HTML]]),
      goEvidence, { onProgress: () => {} }
    );
    const surface: CompanySurface = {
      company: 'acme', origin: 'https://acme.com', homepage: 'https://acme.com',
      discovered_pages: [
        { url: 'https://acme.com/developers', path: '/developers', category: 'engineering' },
        { url: 'https://acme.com/status', path: '/status', category: 'status_ops' },
        { url: 'https://acme.com/team', path: '/team', category: 'team_people' }
      ], page_categories: {}
    };
    const q = IcpQualificationEngine.qualify({
      company: 'acme', domain: 'acme.com', surface, signals,
      people: [janeCandidate], owner: { ...janeCandidate, owner_evidence: janeCandidate.evidence, responsibility_match: 'engineering', finding_link: 'api surface' },
      contacts: [{ type: 'PROFESSIONAL_EMAIL', value: 'jane@acme.com', source_url: 'https://acme.com/developers', confidence: 'HIGH' } as any],
      finding: { finding_type: 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', impact_severity: 'MEDIUM', severity_basis: 'x' },
      evidence: goEvidence
    } as IcpContext);
    assert(q.overall === 'OUTREACH_READY', `full context -> OUTREACH_READY (got ${q.overall})`);
    assert(q.fit === 'STRONG', 'OUTREACH_READY implies STRONG fit');
  });

  // 12. ICP QUALIFICATION — RESEARCH_MORE (signals+owner, no contact, no defensible finding)
  await runTest('ICP qualification — RESEARCH_MORE when a gate is missing', () => {
    const signals = DeepSignalExtractor.extract(
      [{ url: 'https://acme.com/engineering', path: '/engineering', category: 'engineering' }],
      new Map([['https://acme.com/engineering', ENG_HTML]]), [], { onProgress: () => {} }
    );
    const surface: CompanySurface = {
      company: 'acme', origin: 'https://acme.com', homepage: 'https://acme.com',
      discovered_pages: [
        { url: 'https://acme.com/developers', path: '/developers', category: 'engineering' },
        { url: 'https://acme.com/engineering', path: '/engineering', category: 'engineering' }
      ], page_categories: {}
    };
    const q = IcpQualificationEngine.qualify({
      company: 'acme', domain: 'acme.com', surface, signals,
      people: [janeCandidate], owner: { ...janeCandidate, owner_evidence: janeCandidate.evidence, responsibility_match: 'engineering', finding_link: 'platform engineering' },
      contacts: [], finding: { finding_type: 'GENERIC_ENGINEERING_ARTICLE', impact_severity: 'LOW', severity_basis: 'x' },
      evidence: []
    } as IcpContext);
    assert(q.overall === 'RESEARCH_MORE', `missing contact -> RESEARCH_MORE (got ${q.overall})`);
  });

  // 13. DEEP SINGLE RUN — GO / READY path (real builder, mock transport, no network)
  await runTest('deep single run — READY: defensible finding + HIGH owner + contact + email', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-go-'));
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(goRoutes()),
      observationProvider: new MockProvider(goEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {}
    });
    const { prospect, case_ref } = await builder.build('https://acme.com');

    assert(prospect.decision === 'OUTREACH_READY', `deep decision OUTREACH_READY (got ${prospect.decision})`);
    assert(prospect.confidence === 'HIGH', 'READY -> HIGH confidence');
    assert(prospect.fit !== 'POOR', 'fit is not poor');
    assert(!!case_ref, 'engine case_ref produced by GO run');
    assert(case_ref!.prospect_decision === 'GO', `engine decision GO (got ${case_ref!.prospect_decision})`);
    assert(prospect.findings?.finding_type === 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE',
      `finding preserved (got ${prospect.findings?.finding_type})`);
    assert(!!prospect.selected_owner, 'an owner was resolved');
    assert(prospect.selected_owner!.confidence === 'HIGH', 'owner HIGH');
    assert(prospect.selected_owner!.name === 'Jane Doe', `owner is Jane Doe (got ${prospect.selected_owner!.name})`);
    assert(prospect.contactability.length >= 1, 'contactability captured');
    assert(prospect.technical_signals.length >= 2, `signals extracted (got ${prospect.technical_signals.length})`);
    const split = DeepSignalExtractor.splitByProvenance(prospect.technical_signals);
    assert(split.inferences.length > 0, 'inferences present (separated from facts)');
    assert(split.documented_facts.length > 0, 'documented facts present');
    // email drafted + evidence-backed
    assert(prospect.email_draft.generated === true, 'email drafted');
    assert(!!prospect.email_draft.primary_subject, 'primary subject present');
    assert(!!prospect.email_draft.alternate_subject, 'alternate subject present');
    const body = prospect.email_draft.body.toLowerCase();
    assert(body.includes('vishnu') || body.includes('solo founder'), 'founder identity present in email');
    const unsupported = ['vulnerable', 'definitely', 'guaranteed', 'most teams', 'critical exposure', 'breached', 'hacked'];
    for (const term of unsupported) assert(!body.includes(term), `no fabricated term "${term}" in email`);
    // evidence lineage: resolved -> raw ; email claims -> evidence
    const rawIds = new Set(prospect.evidence.map(e => e.id));
    for (const id of case_ref!.resolved_evidence.map(e => e.id)) assert(rawIds.has(id), `resolved evidence ${id} traces to raw`);
    for (const cl of prospect.email_draft.claims) for (const id of cl.evidence_ids) assert(rawIds.has(id), `email claim evidence_id ${id} traces to evidence`);
    // artifact persisted
    assert(fs.existsSync(prospect.artifact_path), 'deep artifact persisted to disk');
    const persisted = JSON.parse(fs.readFileSync(prospect.artifact_path, 'utf8')) as DeepProspect;
    assert(persisted.company === 'acme' || persisted.company === 'acme.com', 'persisted company field');
    assert(persisted.email_draft.generated === true, 'persisted dossier has generated email');
  });

  // 14. DEEP SINGLE RUN — NO_GO (no surface / no people / no finding)
  await runTest('deep single run — NO_GO: no surface, no people, no finding, no email', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-nogo-'));
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(minimalRoutes()),
      observationProvider: new MockProvider([]),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {}
    });
    const { prospect } = await builder.build('https://acme.com');
    assert(prospect.decision === 'NO_GO', `minimal surface -> NO_GO (got ${prospect.decision})`);
    assert(!prospect.email_draft.generated, 'NO_GO -> no email drafted');
    assert(!!prospect.email_draft.blocked_reason, 'email blocked with a reason');
    assert(prospect.people.length === 0, 'no people on minimal surface');
    assert(prospect.selected_owner === null, 'no owner on minimal surface');
    assert(prospect.technical_signals.length === 0, 'no signals on minimal surface');
    assert(fs.existsSync(prospect.artifact_path), 'NO_GO artifact still persisted');
  });

  // 15. DEEP SINGLE RUN — RESEARCH_MORE (signals+owner, but no finding + no contact)
  await runTest('deep single run — RESEARCH_MORE: signals+owner but no finding and no contact', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-rm-'));
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(noContactRoutes()),
      observationProvider: new MockProvider(genericEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {}
    });
    const { prospect } = await builder.build('https://acme.com');
    assert(prospect.decision === 'RESEARCH_MORE', `signals+owner, no finding/contact -> RESEARCH_MORE (got ${prospect.decision})`);
    assert(!prospect.email_draft.generated, 'RESEARCH_MORE -> no email drafted');
    assert(prospect.people.length >= 1, 'people still discovered');
    assert(prospect.selected_owner !== null, 'owner still resolved (HIGH)');
    assert(prospect.contactability.length === 0, 'no contact channel (DEV_BARE has no mailto/profile)');
  });

  // 17. DEEP RUN WITH GROWJO OWNER — Growjo people as the PRIMARY owner source
  await runTest('deep run — Growjo person is the PRIMARY owner (GROWJO_SOURCE, HIGH)', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-growjo-'));
    // Legitimate Growjo CSV (operator-supplied) with a technical owner.
    const csv = 'company,domain,person_name,person_title,email,growjo_url\n' +
      'Acme Corp,acme.com,Jane Doe,CTO,jane@acme.com,https://app.growjo.com/profile/acme-corp';
    const { companies } = GrowjoProvider.parseCsv(csv);
    const growjoData = companies[0] as GrowjoCompany;
    assert(!!growjoData, 'growjo CSV parsed into a company record');
    assert(growjoData.canonical_name === 'Acme Corp', 'growjo canonical_name');
    assert(growjoData.domain === 'acme.com', 'growjo domain');
    assert(growjoData.primary_title === 'CTO', 'growjo person title');
    const growjoResolution: CompanyResolution = {
      canonical_name: 'Acme Corp', official_domain: 'acme.com',
      resolution_method: 'GROWJO_DOMAIN', resolution_source: growjoData.source_url,
      resolution_confidence: 'HIGH',
    };
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(goRoutes()),
      observationProvider: new MockProvider(goEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {},
      growjo: growjoData,            // <-- Growjo people feed the owner graph
      resolution: growjoResolution,
    });
    const { prospect } = await builder.build('https://acme.com');

    // Owner resolved FROM Growjo (primary), HIGH, provenance GROWJO_SOURCE.
    assert(!!prospect.selected_owner, 'an owner was resolved');
    assert(prospect.selected_owner!.confidence === 'HIGH', 'growjo owner is HIGH');
    assert(prospect.selected_owner!.name === 'Jane Doe', `owner name is Jane Doe (got ${prospect.selected_owner!.name})`);
    assert((prospect.selected_owner as any).deep_owner_provenance === 'GROWJO_SOURCE',
      `owner provenance is GROWJO_SOURCE (got ${(prospect.selected_owner as any).deep_owner_provenance})`);
    const ev0 = prospect.selected_owner!.owner_evidence[0] || '';
    assert(ev0.includes('GROWJO_IDENTITY'), 'owner evidence carries GROWJO_IDENTITY tag');
    assert(ev0.includes('is listed as'), 'owner evidence string preserves "is listed as" for the engine');

    // Honest gates: defensible finding + HIGH growjo owner + contact -> OUTREACH_READY
    assert(prospect.decision === 'OUTREACH_READY', `honest OUTREACH_READY via growjo owner (got ${prospect.decision})`);
    assert(!!prospect.deep_finding, 'a defensible deep finding was assembled');
    assert(prospect.email_draft.generated === true, 'email drafted through the gate');
    const body = prospect.email_draft.body.toLowerCase();
    const unsupported = ['vulnerable','definitely','guaranteed','most teams','critical exposure','breached','hacked'];
    for (const term of unsupported) assert(!body.includes(term), `no fabricated term "${term}" in email`);
    assert(prospect.contactability.length >= 1, 'professional contact captured (growjo/mailto)');

    // Artifact persisted with the growjo-owner lineage
    assert(fs.existsSync(prospect.artifact_path), 'deep artifact persisted');
    const persisted = JSON.parse(fs.readFileSync(prospect.artifact_path, 'utf8')) as DeepProspect;
    assert((persisted.selected_owner as any)?.deep_owner_provenance === 'GROWJO_SOURCE', 'persisted owner provenance is GROWJO_SOURCE');
  });

  // 16. DEEP CLI end-to-end via operator REPL (inputLines) + show all
  await runTest('deep CLI end-to-end (operator inputLines) + show all dossier', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-cli-'));
    const c = capture();
    const op = new XaviraOperator({
      fetch: fakeFetcher(goRoutes()),
      observationProvider: new MockProvider(goEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsDir: tmpDir,
      output: c.output,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      inputLines: ['deep research https://acme.com', 'show all', 'exit']
    });
    await op.start();
    const out = c.text();
    assert(out.includes('DEEP INTELLIGENCE'), 'banner/help shown');
    assert(out.includes('Deep decision: OUTREACH_READY'), 'deep decision OUTREACH_READY printed');
    assert(out.includes('DEEP PROSPECT DOSSIER'), 'show all prints full dossier');
    assert(out.includes('Jane Doe'), 'dossier includes resolved owner Jane Doe');
    assert(out.includes('NEVER AUTO-SENT'), 'show all reminds never-auto-send');
  });

  // 17. NO AUTO-SEND — send requires --confirm + GO
  await runTest('no auto-send — send blocked without --confirm and on non-GO', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-send-'));
    const c = capture();
    const op = new XaviraOperator({
      fetch: fakeFetcher(minimalRoutes()),
      observationProvider: new MockProvider([]),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsDir: tmpDir,
      output: c.output,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      inputLines: ['deep research https://acme.com', 'send', 'send --confirm', 'exit']
    });
    await op.start();
    const out = c.text();
    assert(out.includes('Send requires explicit confirmation'), 'send without --confirm is refused');
    assert(out.includes('Send blocked: decision is not OUTREACH_READY'), 'send --confirm on non-OUTREACH_READY is blocked');
  });

  // 18. BATCH MODE — deep file <csv> + summary artifact
  await runTest('deep batch mode — deep file <csv> produces summary artifact', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-deep-batch-'));
    const csvPath = path.join(tmpDir, 'prospects.csv');
    fs.writeFileSync(csvPath, 'company,url\nAcme Corp,https://acme.com\nAcme Two,https://acme.com\n', 'utf8');
    const c = capture();
    const op = new XaviraOperator({
      fetch: fakeFetcher(goRoutes()),
      observationProvider: new MockProvider(goEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d),
      artifactsDir: tmpDir,
      output: c.output,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      inputLines: [`deep file ${csvPath}`, 'deep prospects', 'exit']
    });
    await op.start();
    const out = c.text();
    assert(out.includes('OUTREACH_READY'), 'batch produced OUTREACH_READY results');
    assert(out.includes('total →'), 'batch summary line printed');
    // summary artifact persisted
    const deepDir = path.join(tmpDir, 'artifacts', 'intelligence', 'deep');
    const batchFiles = fs.readdirSync(deepDir).filter(f => f.startsWith('_batch_'));
    assert(batchFiles.length >= 1, 'batch summary artifact persisted');
    const summary = JSON.parse(fs.readFileSync(path.join(deepDir, batchFiles[0]), 'utf8'));
    assert(summary.total === 2, `batch total is 2 (got ${summary.total})`);
    assert(summary.outreach_ready === 2, `batch outreach_ready is 2 (got ${summary.outreach_ready})`);
    assert(summary.no_go === 0, 'batch no_go is 0');
    assert(Array.isArray(summary.top_reasons_for_rejection), 'summary has rejection reasons field');
    // deep prospects listing now finds entries
    assert(out.includes('OUTREACH_READY'), 'deep prospects lists dossiers');
  });

  // 17b. DeepEmailGenerator gating (unit)
  await runTest('DeepEmailGenerator — blocked without GO + HIGH owner + contact', () => {
    const blocked = DeepEmailGenerator.generate({
      prospect: { selected_owner: null, contactability: [] } as any,
      caseRef: { prospect_decision: 'NO_GO', claim_validation: 'N/A' } as any
    } as any);
    assert(!blocked.generated, 'email not generated when gates fail');
    assert(!!blocked.blocked_reason, 'blocked reason provided');
  });

  // 17c. DEEP FINDING ENGINE (Part B/C/R1-R8) — conservative, evidence-bound
  await runTest('detectDeepFinding — R1 sensitive metadata / documented incident / NO generic finding', () => {
    const b = new DeepProspectBuilder({ onProgress: () => {}, logger: () => {} });
    const detect = (b as any).detectDeepFinding.bind(b);

    // R1: sensitive fields exposed -> defensible LOW-strength finding w/ evidence ids
    const sensitiveObs: Evidence[] = [{
      id: 'E-001', evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
      public_url: 'https://api.acme.com/v1/users', source_type: 'API_ENDPOINT' as const,
      status: 200, observed_behavior: 'response exposes storage_path', sensitive_fields: ['storage_path'],
      reproductions: 3, repeatable: true, tested_without_auth: true,
      not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: 'exposes storage_path'
    }];
    const f1 = detect([], sensitiveObs);
    assert(f1 !== null, 'R1 produces a finding for sensitive metadata');
    assert(f1?.finding_type === 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', 'R1 type correct');
    assert(f1?.evidence_ids.length > 0, 'R1 finding carries evidence ids (no evidence-only finding)');
    assert(f1?.source_urls.length > 0, 'R1 finding carries source urls');

    // Public incident signal WITHOUT observation evidence -> NO finding (no fabricated evidence)
    const incidentSig = {
      id: 'S-1', type: 'PUBLIC_INCIDENT', source_url: 'https://acme.com/status',
      excerpt: 'Outage resolved 2024-03-01. All systems operational.',
      related_evidence_ids: [], provenance: 'DOCUMENTED_FACT',
      strength: { evidence_strength: 'LOW', reproducibility: 'LOW', source_quality: 'HIGH', technical_specificity: 'MEDIUM', owner_confidence: 'NOT_APPLICABLE' } as any,
      relevance_score: 0.7, confidence: 'MEDIUM', explanation: 'status page mentions outage'
    } as any;
    const f2 = detect([incidentSig], []);
    assert(f2 === null, 'a documented-incident signal with no observation evidence does NOT yield a finding (no fabrication)');

    // Generic engineering article signal -> NO finding (Part B: don't convert generic content)
    const genericSig = {
      id: 'S-2', type: 'GENERIC_ENGINEERING_ARTICLE', source_url: 'https://acme.com/blog',
      excerpt: 'We migrated to microservices on AWS, Azure, and GCP.',
      related_evidence_ids: [], provenance: 'DOCUMENTED_FACT',
      strength: { evidence_strength: 'LOW', reproducibility: 'LOW', source_quality: 'MEDIUM', technical_specificity: 'LOW', owner_confidence: 'NOT_APPLICABLE' } as any,
      relevance_score: 0.4, confidence: 'LOW', explanation: 'generic infra blog'
    } as any;
    const f3 = detect([genericSig], []);
    assert(f3 === null, 'generic engineering content never becomes a finding');

    // A genuine repeatable public exposure observation -> POSSIBLE_PUBLIC_EXPOSURE
    const exposedObs: Evidence[] = [{
      id: 'E-002', evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
      public_url: 'https://api.acme.com/v1/debug', source_type: 'API_ENDPOINT' as const,
      status: 200, observed_behavior: 'debug config exposed without auth, accessible to anyone.',
      reproductions: 4, repeatable: true, tested_without_auth: true,
      not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: 'config exposed'
    }];
    const f4 = detect([genericSig], exposedObs);
    assert(f4 !== null && f4.finding_type === 'POSSIBLE_PUBLIC_EXPOSURE',
      'R7 yields POSSIBLE_PUBLIC_EXPOSURE for repeatable unauthenticated exposure (got ' + (f4?.finding_type || 'null') + ')');
  });

  // 17d. DECISION SEMANTICS — defensible finding + no HIGH owner => RESEARCH_MORE;
  //      strong ICP + no finding => RESEARCH_MORE; finding w/o evidence => RESEARCH_MORE/NO_GO.
  await runTest('decision semantics — finding without verified owner stays RESEARCH_MORE (no email)', async () => {
    // STATUS_HTML gives an incident signal; goEvidence gives a finding, but the team
    // page intentionally has NO valid person name -> no HIGH owner.
    const noPeopleRoutes: Record<string, ReturnType<typeof goRoutes>[string]> = {
      'https://acme.com': { status: 200, body: `<html><body><nav><a href="/status">Status</a></nav><h1>Acme</h1></body></html>`, ct: 'text/html' },
      'https://acme.com/status': { status: 200, body: STATUS_HTML, ct: 'text/html' }
    };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-dec-sem-'));
    const builder = new DeepProspectBuilder({
      fetcher: fakeFetcher(noPeopleRoutes),
      observationProvider: new MockProvider(goEvidence),
      saveArtifact: (p, d) => writeArtifact(p, d), artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 20, discoveryDelayMs: 0, observationDelayMs: 0,
      onProgress: () => {}, logger: () => {}
    });
    const { prospect } = await builder.build('https://acme.com');
    assert(prospect.selected_owner === null, 'no valid HIGH owner on people-less surface');
    assert(prospect.decision !== 'OUTREACH_READY', 'no OUTREACH_READY without a verified HIGH owner');
    assert(!prospect.email_draft.generated, 'no email generated without verified owner');
  });

  // ── final ──────────────────────────────────────────────────────────────────
  console.log('\n==================================================');
  console.log(`Tests Executed: ${passCount + failCount}`);
  console.log(`Pass Count:     ${passCount}`);
  console.log(`Fail Count:     ${failCount}`);
  if (failCount === 0) console.log('ALL TESTS PASSED.');
  else { console.log('\nFAILURES:'); failures.forEach(f => console.log(`  - ${f}`)); }
  process.exit(failCount === 0 ? 0 : 1);
}

void main();
