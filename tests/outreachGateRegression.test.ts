/**
 * XAVIRA — REGRESSION TESTS FOR OUTREACH GATE QUALITY
 * ─────────────────────────────────────────────────────────────────────────────
 * These tests lock in the fixes from the "Freeze Code" pass:
 *
 *  R1: public compliance page ≠ security vulnerability
 *  R2: HTTP GET ≠ technical reproduction
 *  R3: company product ≠ person's technical ownership
 *  R4: indirect signal excerpt ≠ sufficient evidence provenance
 *  R5: malformed generated sentence → BLOCKED
 *  R6: generic posture observation → RESEARCH_MORE
 *
 * All tests are self-contained (no network). They use synthetic builders
 * (DeepProspectBuilder with a fake fetcher / mock observation provider).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import { DeepEmailGenerator } from '../src/server/DeepEmailGenerator';
import type {
  DeepProspect, DeepFinding, DeepOwner, DeepContact, DeepEmailDraft,
  DeepSignal, IcpQualification
} from '../src/server/DeepTypes';
import type {
  Evidence, FindingClassification, IntelligenceCase, OwnerCandidate, CompanySurface
} from '../src/server/IntelligenceCase';
import { DeepSignalExtractor } from '../src/server/DeepSignalExtractor';
import { ContactabilityFinder } from '../src/server/ContactabilityFinder';

// ── Helpers ──────────────────────────────────────────────────────────────────

function ev(overrides: Partial<Evidence> & { id: string; public_url: string; observed_behavior: string }): Evidence {
  return {
    evidence_origin: 'REAL_PUBLIC_OBSERVATION' as const,
    source_type: 'PUBLIC_DOCUMENTATION',
    method: 'GET',
    status: 200,
    reproductions: 1,
    repeatable: true,
    tested_without_auth: true,
    not_tested: [],
    retrieved_at: new Date().toISOString(),
    evidence_text: overrides.observed_behavior,
    raw_observation: overrides.observed_behavior,
    ...overrides,
  };
}

const HOME_HTML = `<html><body><h1>TestCorp</h1><nav>
  <a href="/about">About</a><a href="/security">Security</a>
  <a href="/team">Team</a><a href="/developers">Developers</a>
  <a href="/engineering">Engineering</a><a href="/status">Status</a>
  <a href="/contact">Contact</a>
</nav></body></html>`;

const ABOUT_HTML = `<html><head>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"TestCorp","founder":{"@type":"Person","name":"John Founder","sameAs":"https://x.com/johndoe"}}</script>
</head><body><h1>About TestCorp</h1></body></html>`;

const SECURITY_HTML = `<html><body><h1>Security</h1>
  <p>We are ISO 27001 SOC 2 PCI DSS HIPAA GDPR DPF certified.</p>
  <p>Frequently asked questions.</p>
  <a href="/contact">Contact us</a>
</body></html>`;

const TEAM_HTML = `<html><body><section class="team">
  <h3>John Founder</h3><p class="title">Co-Founder</p>
</section></body></html>`;

const CONTACT_HTML = `<html><body><h1>Contact</h1>
  <p>Email: <a href="mailto:press@testcorp.com">press@testcorp.com</a></p>
  <p>X: <a href="https://x.com/testcorp">x.com/testcorp</a></p>
</body></html>`;

function fakeFetcher(routes: Record<string, { status: number; body: string; ct?: string }>) {
  return async (url: string, _init: any): Promise<Response> => {
    const key = url.replace(/\/$/, '') || url;
    const hit = routes[key] || routes[url];
    if (hit) return new Response(hit.body, { status: hit.status, headers: hit.ct ? { 'content-type': hit.ct } : {} });
    return new Response('', { status: 404, headers: { 'content-type': 'text/html' } });
  };
}

function makeSurface(domain: string): CompanySurface {
  return {
    company: domain,
    origin: `https://${domain}`,
    homepage: `https://${domain}/`,
    discovered_pages: [
      { url: `https://${domain}/`, path: '/', category: 'homepage' },
      { url: `https://${domain}/about`, path: '/about', category: 'about' },
      { url: `https://${domain}/security`, path: '/security', category: 'security' },
      { url: `https://${domain}/contact`, path: '/contact', category: 'about' },
    ],
    page_categories: {},
  };
}

// ── Test 1: public compliance page ≠ security vulnerability ──────────────────
// R1: DOCUMENTED_SECURITY_POSTURE is NOT an actionable finding. A compliance
// page listing certifications is a positive organizational statement, not a
// defect. OUTREACH_READY should NOT be reached when the only finding is
// DOCUMENTED_SECURITY_POSTURE.
async function testR1_complianceNotVulnerability(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r1-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 5, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  assert.strictEqual(prospect.decision, 'RESEARCH_MORE',
    `R1: compliance page should be RESEARCH_MORE, got ${prospect.decision}`);
  const findingType = prospect.deep_finding?.finding_type || 'NONE';
  assert.strictEqual(findingType, 'DOCUMENTED_SECURITY_POSTURE',
    `R1: expected DOCUMENTED_SECURITY_POSTURE, got ${findingType}`);
  assert.strictEqual(prospect.email_draft?.generated, false,
    'R1: email should NOT be generated for documentation-only finding');
  assert.ok(prospect.email_draft?.blocked_reason?.includes('no defensible finding'),
    `R1: should be blocked on defensible finding, got: ${prospect.email_draft?.blocked_reason}`);
  console.log('  ✓ R1: compliance page ≠ vulnerability (RESEARCH_MORE)');
}

// ── Test 2: HTTP GET ≠ technical reproduction ────────────────────────────────
// R2: The email for a DOCUMENTED_* finding must NOT use "reproduce" language.
// A public page visit is not technical reproduction.
async function testR2_httpGetNotReproduction(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r2-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 5, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  const body = prospect.email_draft?.body || '';
  // If email is blocked (RESEARCH_MORE), verify the claims don't use reproduction
  // language. If somehow generated, the body must not contain "reproduce".
  if (prospect.email_draft?.generated) {
    assert.ok(!/reproduce/i.test(body),
      'R2: HTTP GET observation must not use "reproduce" language in email body');
  }
  // Check the claims themselves
  const claims = prospect.email_draft?.claims || [];
  const reproClaims = claims.filter(c => /reproduce/i.test(c.text));
  assert.strictEqual(reproClaims.length, 0,
    'R2: no claim should use "reproduce" language for static page observations');
  console.log('  ✓ R2: HTTP GET ≠ reproduction language');
}

// ── Test 3: company product ≠ person's technical ownership ───────────────────
// R3: An owner selected as "Co-Founder" with no evidence connecting them to
// the finding's technical domain must NOT get a finding_link. The outreach
// gate must fail on owner relevance.
async function testR3_productNotOwnership(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r3-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/about': { status: 200, body: ABOUT_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 5, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  const owner = prospect.selected_owner;
  if (owner) {
    // A Co-Founder with no technical domain evidence in their owner_evidence
    // must NOT have finding_link set (no inference from company product).
    const evidenceText = (owner.owner_evidence || []).join(' ').toLowerCase();
    const hasTechnicalTerm = ['security', 'engineering', 'platform', 'infra', 'sre', 'devops', 'backend'].some(t => evidenceText.includes(t));
    if (!hasTechnicalTerm && owner.role === 'Co-Founder') {
      assert.strictEqual(owner.finding_link, undefined,
        `R3: Co-Founder without technical evidence must not get finding_link, got: ${owner.finding_link}`);
    }
  }
  assert.strictEqual(prospect.decision, 'RESEARCH_MORE',
    `R3: company product ≠ ownership, expected RESEARCH_MORE, got ${prospect.decision}`);
  console.log('  ✓ R3: company product ≠ person\'s technical ownership');
}

// ── Test 4: indirect signal excerpt ≠ sufficient evidence provenance ────────
// R4: Evidence records must contain the actual claimable text (observed_behavior
// or evidence_text), not just "HTTP 200 observed" + an external signal.excerpt.
async function testR4_evidenceProvenanceIsDirect(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r4-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 5, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  const finding = prospect.deep_finding;
  if (finding && finding.evidence_ids.length > 0) {
    for (const evId of finding.evidence_ids) {
      const evidence = prospect.evidence.find(e => e.id === evId);
      assert.ok(evidence, `R4: evidence ID ${evId} referenced by finding must exist in evidence ledger`);
      // The evidence record must contain the actual observed excerpt text
      // (not just "HTTP 200 observed" with the text only in signal.excerpt).
      const combined = `${evidence.observed_behavior || ''} ${evidence.evidence_text || ''}`.toLowerCase();
      if (finding.finding_type === 'DOCUMENTED_SECURITY_POSTURE') {
        assert.ok(combined.includes('iso 27001') || combined.includes('soc 2') || combined.includes('certif'),
          `R4: evidence record for ${evId} must contain the actual compliance text, got: "${evidence.observed_behavior.slice(0, 80)}"`);
      }
    }
  }
  console.log('  ✓ R4: evidence record provenance is direct (contains claimable text)');
}

// ── Test 5: malformed generated sentence → BLOCKED ──────────────────────────
// R5: If the observed text would produce malformed prose ("noticed The company's..."),
// the observation text must be lowercased for mid-sentence integration, and
// irrelevant noise ("Frequently asked questions.") must be stripped.
async function testR5_noMalformedProse(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r5-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 5, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  const body = prospect.email_draft?.body || '';
  if (prospect.email_draft?.generated && body) {
    // Must not have "noticed The" (capitalized start after "noticed")
    assert.ok(!/noticed\s+[A-Z]/.test(body),
      'R5: must not produce "noticed The company\'s..." (capitalized after "noticed")');
    // Must not include "Frequently asked questions" in the email body
    assert.ok(!/frequently asked questions/i.test(body),
      'R5: email body must not contain irrelevant "Frequently asked questions."');
  }
  // Also verify the finding explanation doesn't contain irrelevant text
  const finding = prospect.deep_finding;
  if (finding) {
    const explanation = finding.explanation.toLowerCase();
    // If the finding explanation has "frequently asked questions", it should
    // have been stripped — only relevant compliance text should remain.
    // The explanation should mention compliance certs but not "frequently asked"
    if (explanation.includes('iso 27001')) {
      assert.ok(!explanation.includes('frequently asked questions'),
        'R5: finding explanation must not contain "Frequently asked questions."');
    }
  }
  console.log('  ✓ R5: no malformed prose, irrelevant text stripped');
}

// ── Test 6: generic posture observation → RESEARCH_MORE ──────────────────────
// R6: When the only finding is DOCUMENTED_SECURITY_POSTURE (compliance certs),
// and no actionable technical finding exists, the decision must be RESEARCH_MORE
// (not OUTREACH_READY).
async function testR6_genericPostureResearchMore(): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-r6-'));
  const builder = new DeepProspectBuilder({
    fetcher: fakeFetcher({
      'https://testcorp.com': { status: 200, body: HOME_HTML, ct: 'text/html' },
      'https://testcorp.com/security': { status: 200, body: SECURITY_HTML, ct: 'text/html' },
      'https://testcorp.com/team': { status: 200, body: TEAM_HTML, ct: 'text/html' },
      'https://testcorp.com/contact': { status: 200, body: CONTACT_HTML, ct: 'text/html' },
    }),
    saveArtifact: () => {},
    artifactsBaseDir: tmpDir,
    maxDiscoveryPages: 8, discoveryDelayMs: 0, observationDelayMs: 0,
    onProgress: () => {}, logger: () => {},
    skipLiveWebResearch: true,
  });

  const { prospect } = await builder.build('https://testcorp.com');

  assert.notStrictEqual(prospect.decision, 'OUTREACH_READY',
    'R6: DOCUMENTED_SECURITY_POSTURE alone must NOT produce OUTREACH_READY');
  assert.strictEqual(prospect.decision, 'RESEARCH_MORE',
    `R6: generic posture observation should be RESEARCH_MORE, got ${prospect.decision}`);
  assert.ok(!prospect.email_draft?.generated,
    'R6: email should not be generated when finding is not actionable');
  console.log('  ✓ R6: generic posture observation → RESEARCH_MORE');
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  XAVIRA — OUTREACH GATE REGRESSION TESTS (R1–R6)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const tests = [
    ['R1: compliance page ≠ vulnerability', testR1_complianceNotVulnerability],
    ['R2: HTTP GET ≠ reproduction',       testR2_httpGetNotReproduction],
    ['R3: product ≠ ownership',           testR3_productNotOwnership],
    ['R4: evidence provenance is direct', testR4_evidenceProvenanceIsDirect],
    ['R5: no malformed prose',             testR5_noMalformedProse],
    ['R6: posture → RESEARCH_MORE',        testR6_genericPostureResearchMore],
  ];

  let pass = 0; let fail = 0;
  for (const [name, fn] of tests) {
    try {
      console.log(`--- ${name} ---`);
      await fn();
      pass++;
    } catch (e: any) {
      fail++;
      console.error(`  ✗ FAIL: ${e.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Tests Executed: ${pass + fail}`);
  console.log(`  Pass Count:     ${pass}`);
  console.log(`  Fail Count:     ${fail}`);
  if (fail === 0) {
    console.log('  ALL REGRESSION TESTS PASSED.');
  } else {
    console.log('  SOME TESTS FAILED.');
    process.exit(1);
  }
  console.log('═══════════════════════════════════════════════════════════════');
}

main();
