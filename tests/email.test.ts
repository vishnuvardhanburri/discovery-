// DeepEmailGenerator tests — Topology G: Email / Claim QA.
// Run with:  npx tsx tests/email.test.ts
//
// Verifies the XAVIRA email gate + verbatim 9-section body + claim->evidence map.
import { DeepEmailGenerator } from '../src/server/DeepEmailGenerator';
import type { DeepEmailDraft, DeepOwner, DeepProspect, DeepFinding, DeepContact } from '../src/server/DeepTypes';
import type { IntelligenceCase, Evidence, EvidenceClaim, FindingClassification, FindingStrength } from '../src/server/IntelligenceCase';

let pass = 0, fail = 0; const failures: string[] = [];
const assert = (c: boolean, m: string) => { if (c) pass++; else { fail++; failures.push(m); console.log('[FAIL] ' + m); } };
const assertEq = <T,>(a: T, b: T, m: string) => { const ok = JSON.stringify(a) === JSON.stringify(b); if (ok) pass++; else { fail++; failures.push(`${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); console.log('[FAIL] ' + m); } };

// ── Fixtures ─────────────────────────────────────────────────────────────────

const ev = (over: Partial<Evidence> & { id: string; public_url: string }): Evidence => {
  const base: Partial<Evidence> = {
    evidence_origin: over.evidence_origin ?? 'REAL_PUBLIC_OBSERVATION',
    source_type: over.source_type ?? 'API_ENDPOINT',
    status: over.status ?? 200,
    observed_behavior: over.observed_behavior ?? 'ok',
    reproductions: over.reproductions ?? 3,
    repeatable: over.repeatable ?? true,
    tested_without_auth: over.tested_without_auth ?? true,
    not_tested: over.not_tested ?? [],
    retrieved_at: over.retrieved_at ?? new Date().toISOString(),
    evidence_text: over.evidence_text ?? over.observed_behavior ?? 'ok',
  };
  return { ...base, ...over } as Evidence;
};

const strength = (repro: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM'): FindingStrength => ({
  evidence_strength: 'HIGH', reproducibility: repro, source_quality: 'HIGH',
  technical_specificity: 'HIGH', owner_confidence: 'HIGH',
});

const mkFinding = (over: Partial<DeepFinding> & {
  evidence_ids: string[]; source_urls: string[]; explanation: string;
}): DeepFinding => {
  const base: Partial<DeepFinding> = {
    finding_type: over.finding_type ?? 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE',
    impact_severity: over.impact_severity ?? 'MEDIUM',
    severity_basis: over.severity_basis ?? 'sensitive metadata exposed on a public endpoint',
    provenance: over.provenance ?? 'REAL_PUBLIC_OBSERVATION',
    confidence: over.confidence ?? 'HIGH',
    strength: over.strength ?? strength(),
    recommendation: over.recommendation ?? 'review the field',
  };
  return { ...base, ...over } as DeepFinding;
};

const mkOwner = (over: Partial<DeepOwner> & { name: string; confidence: 'LOW' | 'MEDIUM' | 'HIGH' }): DeepOwner => {
  const base: Partial<DeepOwner> = {
    role: over.role ?? 'Head of Engineering',
    company: over.company ?? 'Acme Corp',
    source_urls: over.source_urls ?? ['https://acme.com/team'],
    owner_evidence: over.owner_evidence ?? ['listed on the team page'],
    responsibility_match: over.responsibility_match ?? 'API surface',
    finding_link: over.finding_link ?? 'API surface',
  };
  return { ...base, ...over } as DeepOwner;
};

const mkContact = (type: DeepContact['type'] = 'PROFESSIONAL_EMAIL'): DeepContact => ({
  type, value: 'jane@acme.com', source_url: 'https://acme.com/team',
  confidence: 'HIGH', note: 'public mailto',
});

const EMAIL = [mkContact('PROFESSIONAL_EMAIL')];

const mkProspect = (over: Partial<DeepProspect> & {
  deep_finding: DeepFinding | null; selected_owner: DeepOwner | null; contactability: DeepContact[]; evidence: Evidence[];
}): Omit<DeepProspect, 'email_draft'> => {
  const base: Omit<DeepProspect, 'email_draft'> = {
    company: over.company ?? 'Acme Corp',
    domain: over.domain ?? 'acme.com',
    industry: over.industry ?? 'Technology',
    fit: over.fit ?? 'STRONG',
    qualification_reasons: over.qualification_reasons ?? [],
    public_surface: over.public_surface ?? {
      company: 'acme.com', origin: 'https://acme.com', homepage: 'https://acme.com',
      discovered_pages: [{ url: 'https://acme.com', path: '/', title: 'Acme', status: 200, category: 'homepage' }],
      page_categories: {},
    },
    technical_signals: over.technical_signals ?? [],
    documented_facts: over.documented_facts ?? [],
    public_observations: over.public_observations ?? [],
    inferences: over.inferences ?? [],
    people: over.people ?? [],
    owner_candidates: over.owner_candidates ?? [],
    selected_owner: over.selected_owner,
    owner_evidence: over.owner_evidence ?? [],
    contactability: over.contactability,
    findings: over.findings ?? null,
    deep_finding: over.deep_finding,
    evidence: over.evidence,
    primary_angle: over.primary_angle ?? '',
    secondary_angle: over.secondary_angle ?? null,
    recommended_subjects: over.recommended_subjects ?? [],
    decision: over.decision ?? 'OUTREACH_READY',
    confidence: over.confidence ?? 'HIGH',
    artifact_path: over.artifact_path ?? '',
    audit_trail: over.audit_trail ?? [],
  };
  return over.case_ref !== undefined ? { ...base, case_ref: over.case_ref } : base;
};

const mkCase = (over: Partial<IntelligenceCase> & {
  claim_validation: string; evidence: Evidence[]; finding_classification?: FindingClassification | null;
}): IntelligenceCase => {
  const base: IntelligenceCase = {
    company: over.company ?? 'Acme Corp',
    fit_status: over.fit_status ?? 'FIT',
    evidence: over.evidence,
    resolved_evidence: over.resolved_evidence ?? over.evidence,
    discovery_errors: over.discovery_errors ?? 0,
    finding_classification: over.finding_classification ?? undefined,
    contradictions: over.contradictions ?? [],
    prospect_decision: over.prospect_decision ?? 'GO',
    subject: over.subject ?? '',
    body: over.body ?? '',
    claim_validation: over.claim_validation,
    audit_trail: over.audit_trail ?? [],
    mode: over.mode ?? 'TEST',
  };
  return { ...base, ...over } as IntelligenceCase;
};

const goodFinding = (evidence: Evidence[]): DeepFinding => mkFinding({
  evidence_ids: evidence.map(e => e.id),
  source_urls: ['https://api.acme.com/v1/users'],
  explanation: 'a read-only GET request to /v1/users returned a response containing an internal storage_path field',
  severity_basis: 'a public response exposes a sensitive internal identifier',
});
const goodOwner = (): DeepOwner => mkOwner({
  name: 'Jane Doe', role: 'Head of Engineering', company: 'Acme Corp',
  finding_link: 'API authentication configuration', confidence: 'HIGH',
});

const idsOf = (e: Evidence[]): Set<string> => new Set(e.map(x => x.id));

// ── GATE BLOCKS ──────────────────────────────────────────────────────────────

console.log('\n--- BLOCK: no defensible finding (null finding) ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://acme.com' })];
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: null, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'no finding -> not generated');
  assert(!!draft.blocked_reason, 'no finding -> blocked_reason set');
  assert(/no defensible finding/.test(draft.blocked_reason || ''), 'blocked reason names finding');
}

console.log('\n--- BLOCK: finding is non-defensible type (GENERIC_ENGINEERING_ARTICLE) ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://acme.com/blog' })];
  const finding = mkFinding({
    finding_type: 'GENERIC_ENGINEERING_ARTICLE', evidence_ids: ['E1'], source_urls: ['https://acme.com/blog'],
    explanation: 'a blog post about cloud architecture',
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'generic article -> not generated');
  assert(/no defensible finding/.test(draft.blocked_reason || ''), 'blocked reason names finding');
}

console.log('\n--- BLOCK: finding is LOW confidence ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://acme.com/x' })];
  const finding = mkFinding({
    finding_type: 'POSSIBLE_PUBLIC_EXPOSURE', confidence: 'LOW', evidence_ids: ['E1'],
    source_urls: ['https://acme.com/x'], explanation: 'something seen',
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'LOW confidence -> not generated');
  assert(/no defensible finding/.test(draft.blocked_reason || ''), 'blocked reason names finding');
}

console.log('\n--- BLOCK: no HIGH-confidence owner ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users' })];
  const finding = goodFinding(evidence);
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({
      deep_finding: finding,
      selected_owner: mkOwner({ name: 'Jane Doe', finding_link: 'API surface', confidence: 'MEDIUM' }),
      contactability: EMAIL, evidence,
    }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'MEDIUM owner -> not generated');
  assert(/HIGH-confidence technical owner/.test(draft.blocked_reason || ''), 'blocked reason names owner');
}

console.log('\n--- BLOCK: verified owner not relevant (no finding_link) ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users' })];
  const finding = goodFinding(evidence);
  const ownerNoLink: DeepOwner = { ...goodOwner(), finding_link: undefined };
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: ownerNoLink, contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'owner without finding_link -> not generated');
  assert(/not relevant to the finding area/.test(draft.blocked_reason || ''), 'blocked reason names relevance');
}

console.log('\n--- BLOCK: no usable professional contact channel ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users' })];
  const finding = goodFinding(evidence);
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: [], evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'no channel -> not generated');
  assert(/no usable public professional contact channel/.test(draft.blocked_reason || ''), 'blocked reason names contact channel');
}

console.log('\n--- BLOCK: claim QA failed (unsupported language) ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users' })];
  const finding = mkFinding({
    finding_type: 'POSSIBLE_PUBLIC_EXPOSURE', confidence: 'HIGH', evidence_ids: ['E1'],
    source_urls: ['https://api.acme.com/v1/users'],
    explanation: 'this endpoint is vulnerable to injection — user input reaches the query layer',
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'unsupported language -> claim QA fails -> not generated');
  assert(/claim QA failed/.test(draft.blocked_reason || ''), 'blocked reason names claim QA');
}

console.log('\n--- BLOCK: claim QA failed (no evidence-backed factual claims) ---');
{
  const evidence = [ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users' })];
  const finding = mkFinding({
    finding_type: 'POSSIBLE_PUBLIC_EXPOSURE', confidence: 'HIGH', evidence_ids: [],
    source_urls: ['https://api.acme.com/v1/users'], explanation: 'a public endpoint exposes an internal field',
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(!draft.generated, 'no evidence-backed claims -> claim QA fails -> not generated');
  assert(/claim QA failed/.test(draft.blocked_reason || ''), 'blocked reason names claim QA');
}

// ── POSITIVE: full gate passes + verbatim 9-section body ─────────────────────

console.log('\n--- POSITIVE: all gates pass -> verbatim 9-section email ---');
{
  const evidence: Evidence[] = [
    ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users', observed_behavior: 'response exposes storage_path', sensitive_fields: ['storage_path'], reproductions: 4 }),
    ev({ id: 'E2', public_url: 'https://api.acme.com/v1/users', observed_behavior: 'repeatable without auth', reproductions: 4 }),
  ];
  const finding = goodFinding(evidence);
  const owner = goodOwner();
  const caseRef = mkCase({ claim_validation: 'N/A', evidence });
  const prospect = mkProspect({ deep_finding: finding, selected_owner: owner, contactability: EMAIL, evidence });
  const draft = DeepEmailGenerator.generate({ prospect, caseRef });
  const lines = draft.body.split('\n');
  const allIds = idsOf(evidence);

  assert(draft.generated === true, 'all gates pass -> email generated');
  assert(draft.primary_subject.length > 0, 'primary subject present');
  assert(draft.alternate_subject.length > 0, 'alternate subject present');

  // Founder-identity line (verbatim spec line).
  assert(lines.includes("I'm Vishnu, the solo founder building XAVIRA."), 'verbatim founder-identity line');

  // Personalization.
  assert(lines[0] === 'Hi Jane,', 'personalized greeting (first name)');
  assert(draft.body.includes("Acme Corp's public"), 'personalization includes company + technical surface');
  assert(draft.body.includes('API authentication configuration'), 'personalization includes technical area (finding_link)');

  // Exact spec prose lines.
  assert(lines.includes("This isn't a sales pitch, and there is no meeting request."), 'verbatim no-sales / no-meeting line');
  assert(lines.includes('If useful, reply "details" and I\'ll send over the evidence.'), 'verbatim reply "details" line');
  assert(lines.includes("I'd rather show you something you can verify than ask you to take my word for it."), 'verbatim verification line');
  assert(lines.includes('Source: https://api.acme.com/v1/users'), 'single-line Source: <url>');
  assert(lines.includes('I reached out because your public role is associated with API authentication configuration.'), 'verbatim owner-relevance line');

  // Subject is finding-led ("Possible … in the …" / "Observed … on …").
  assert(/^Possible /.test(draft.primary_subject) || /^Observed /.test(draft.primary_subject), 'primary subject is finding-led (Possible/Observed)');

  // 9-section structure + signature, no blank lines between sections.
  assert(lines.length === 12, `body has 9 sections + 3 signature lines (got ${lines.length})`);
  assert(lines[9] === 'Best,' && lines[10] === 'Vishnu' && lines[11] === 'Founder, XAVIRA', 'signature block intact');
  assert(!draft.body.includes('\n\n'), 'no blank lines between sections');
  assert(/I was able to .+, where applicable\./.test(draft.body), 'reproduction line with "where applicable"');

  // Claim -> evidence map.
  const obsClaim = draft.claims.find(c => c.claim_type === 'OBSERVATION');
  assert(!!obsClaim, 'OBSERVATION claim exists in the map');
  assert(!!obsClaim && obsClaim.evidence_ids.length > 0 && finding.evidence_ids.every(id => obsClaim.evidence_ids.includes(id)), 'OBSERVATION claim carries the finding evidence IDs');
  assert(draft.claims.some(c => c.evidence_ids.length > 0), 'at least one evidence-backed claim (claim->evidence map)');
  assert(draft.claims.every(c => c.evidence_ids.every(id => allIds.has(id))), 'every claim evidence_id traces to prospect evidence');

  // Word count within 80-150 (preferred range).
  const wc = draft.body.split(/\s+/).filter(Boolean).length;
  assert(wc >= 80 && wc <= 150, `body word count within 80-150 (got ${wc})`);
}

// ── Positive: OBSERVED_* finding -> "Observed … on …" subject ─────────────────
console.log('\n--- POSITIVE: OBSERVED finding -> "Observed … on …" subject ---');
{
  const evidence: Evidence[] = [
    ev({ id: 'S1', public_url: 'https://api.acme.com/health', observed_behavior: 'HTTP 500 on /health', reproductions: 5 }),
    ev({ id: 'S2', public_url: 'https://api.acme.com/health', observed_behavior: 'HTTP 500 on /health', reproductions: 5 }),
  ];
  const finding = mkFinding({
    finding_type: 'OBSERVED_AVAILABILITY_ISSUE', confidence: 'HIGH', evidence_ids: ['S1', 'S2'],
    source_urls: ['https://api.acme.com/health'],
    explanation: 'a read-only GET to /health returned HTTP 500 across repeatable requests',
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(draft.generated === true, 'OBSERVED finding -> generated');
  assert(/^Observed /.test(draft.primary_subject), 'subject is "Observed … on …"');
  assert(draft.body.includes('I was looking at Acme Corp'), 'body personalised for OBSERVED case');
}

// ── Positive: DOCUMENTED_* finding (DOCUMENTED_FACT) -> safe "verify" statement ──
console.log('\n--- POSITIVE: DOCUMENTED finding -> safe verify statement ("where applicable") ---');
{
  const evidence: Evidence[] = [
    ev({ id: 'D1', public_url: 'https://acme.com/status', evidence_origin: 'DOCUMENTED_SOURCE', observed_behavior: 'status page documents a resolved outage', reproductions: 1 }),
  ];
  const finding = mkFinding({
    finding_type: 'DOCUMENTED_INCIDENT', confidence: 'HIGH', provenance: 'DOCUMENTED_FACT',
    evidence_ids: ['D1'], source_urls: ['https://acme.com/status'],
    explanation: 'the public status page documents a recent partial outage that was resolved',
    strength: strength('LOW'),
  });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: goodOwner(), contactability: EMAIL, evidence }),
    caseRef: mkCase({ claim_validation: 'N/A', evidence }),
  });
  assert(draft.generated === true, 'DOCUMENTED finding -> generated');
  assert(/^Possible /.test(draft.primary_subject), 'subject is "Possible … in the …"');
  assert(/I was able to verify this specific observation .+ where applicable\./.test(draft.body), 'non-reproducible -> safe verify statement');
}

// ── Positive: engine-path claims (claim_validation PASSED) -> verbatim body ────
console.log('\n--- POSITIVE: engine QA-passed path -> verbatim spec body from engine claims ---');
{
  const evidence: Evidence[] = [
    ev({ id: 'E1', public_url: 'https://api.acme.com/v1/users', observed_behavior: 'exposes storage_path', sensitive_fields: ['storage_path'], reproductions: 4 }),
  ];
  const finding = goodFinding(evidence);
  const owner = goodOwner();
  const engineClaims: EvidenceClaim[] = [
    { text: `Hi ${owner.name.split(' ')[0]},`, evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
    { text: "I'm Vishnu, the solo founder building XAVIRA.", evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
    { text: `While checking the publicly accessible surface at:\n${evidence[0].public_url}\n\nI observed that:\n${finding.explanation}`, evidence_ids: ['E1'], claim_type: 'OBSERVATION' },
    { text: 'The behavior was repeatable from the public side using a normal read-only request. I did not bypass authentication.', evidence_ids: ['E1'], claim_type: 'REPRODUCTION' },
    { text: `I reached out because your public role is associated with ${owner.finding_link}.`, evidence_ids: ['E1'], claim_type: 'OWNER' },
    { text: "This isn't a sales pitch, and there is no meeting request.", evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
    { text: 'If useful, reply "details" and I\'ll send over the evidence.', evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
  ];
  const caseRef = mkCase({ claim_validation: 'PASSED', evidence, email_model: { claims: engineClaims, subject: 'engine-subj' } });
  const draft = DeepEmailGenerator.generate({
    prospect: mkProspect({ deep_finding: finding, selected_owner: owner, contactability: EMAIL, evidence }),
    caseRef,
  });
  assert(draft.generated === true, 'engine PASSED path -> generated');
  assert(draft.claims === engineClaims, 'engine claims are passed through (claim->evidence map preserved)');
  assert(draft.body.includes("I'm Vishnu, the solo founder building XAVIRA."), 'engine path still emits verbatim founder-identity line');
  assert(draft.body.includes("This isn't a sales pitch, and there is no meeting request."), 'engine path emits verbatim no-sales line');
  assert(draft.body.includes('reply "details"'), 'engine path emits reply "details"');
  const obsClaim = draft.claims.find(c => c.claim_type === 'OBSERVATION');
  assert(!!obsClaim && obsClaim.evidence_ids.includes('E1'), 'engine OBSERVATION claim is evidence-backed');
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n==================================================');
console.log(`Email/Claim QA tests: ${pass} passed, ${fail} failed.`);
if (fail === 0) console.log('ALL TESTS PASSED.');
else { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail === 0 ? 0 : 1);
