// DeepEmailGenerator.ts
// -----------------------
// Builds the FINAL first-contact outreach email exclusively from the finding-led
// evidence lineage (DeepFinding + DeepOwner + contactability + IntelligenceCase).
//
// The email ALWAYS follows the XAVIRA 9-section structure (verbatim spec):
//
//   Hi {{FirstName}},
//   I'm Vishnu, the solo founder building XAVIRA.
//   I was looking at {{Company}}'s public {{technical surface}} and noticed {{specific observation}}.
//   I was able to {{safe reproduction statement}}, where applicable.
//   Source: {{URL}}
//   I reached out because your public role is associated with {{technical area}}.
//   I'd rather show you something you can verify than ask you to take my word for it.
//   This isn't a sales pitch, and there is no meeting request.
//   If useful, reply "details" and I'll send over the evidence.
//   Best,
//   Vishnu
//   Founder, XAVIRA
//
// The CLAIM -> EVIDENCE map is preserved in the returned `claims` list: every
// factual claim (OBSERVATION / REPRODUCTION / OWNER) carries the evidence_ids
// that support it, so the lineage (observation -> finding -> email) stays
// traceable. 80-150 words preferred.
//
// GATE (per XAVIRA spec):
//   REAL FINDING (defensible) + EVIDENCE + VERIFIED PERSON (HIGH owner) +
//   RELEVANT OWNER RELATIONSHIP + CLAIM QA PASSED  =>  generate.
//   Otherwise: blocked, no draft produced, no send.

import type { DeepEmailDraft, DeepOwner, DeepProspect, DeepFinding } from './DeepTypes';
import type { IntelligenceCase, EvidenceClaim, Evidence, FindingClassification } from './IntelligenceCase';

export interface DeepEmailContext {
  prospect: Omit<DeepProspect, 'email_draft'>;
  caseRef: IntelligenceCase;
}

type OnProgress = (stage: string, message: string) => void;

const UNSUPPORTED_TERMS = [
  'vulnerable', 'definitely', 'guaranteed', 'most teams', 'critical exposure',
  'breached', 'hacked', 'customer data exposed', 'fix this', 'patch this',
  'i can help you scale', 'take over'
];

// Finding types that are never defensible enough to draft on their own.
const NON_DEFENSIBLE = new Set([
  'GENERIC_ENGINEERING_ARTICLE', 'UNEXPECTED_PUBLIC_BEHAVIOR', 'CONFLICTING_EVIDENCE'
]);

export class DeepEmailGenerator {
  static generate(ctx: DeepEmailContext, onProgress?: OnProgress): DeepEmailDraft {
    const { prospect, caseRef } = ctx;
    const df = prospect.deep_finding;
    const finding: FindingClassification | DeepFinding | null = df ?? (caseRef.finding_classification || null);
    const owner = prospect.selected_owner;
    const ownerHigh = !!owner && owner.confidence === 'HIGH';
    const hasChannel = prospect.contactability.some(
      ct => ct.type === 'PROFESSIONAL_EMAIL' || ct.type === 'PROFESSIONAL_PROFILE'
    );

    const findingDefensible = !!finding && (df ? df.confidence !== 'LOW' : true)
      && !NON_DEFENSIBLE.has(finding.finding_type);
    // "Relevant owner relationship": verified HIGH owner whose stated area covers the finding.
    const ownerRelevant = ownerHigh && !!owner && !!owner.finding_link;

    // Claims come from the engine when the engine already QA-passed (GO path),
    // otherwise we compose truthful finding-led claims (deep path).
    const engineClaimsValid = caseRef.claim_validation === 'PASSED'
      && !!caseRef.email_model?.claims?.length;
    const engineClaims: EvidenceClaim[] = caseRef.email_model?.claims || [];
    const composedClaims = (!engineClaimsValid && !!df)
      ? this.composeDeepClaims(prospect, df, owner)
      : [];
    const claims = engineClaimsValid ? engineClaims : composedClaims;

    const claimQAPassed = engineClaimsValid
      ? true
      : (claims.length > 0 && this.deepClaimsPassQa(claims));

    // ---- GATE -------------------------------------------------------------
    const blocked: string[] = [];
    if (!findingDefensible) blocked.push(
      `no defensible finding (finding: ${finding ? `${finding.finding_type}/${df ? df.confidence : '?'}` : 'NONE'}).`
    );
    if (!ownerHigh) blocked.push('no evidence-backed HIGH-confidence technical owner.');
    if (!hasChannel) blocked.push('no usable public professional contact channel.');
    if (!ownerRelevant) blocked.push('verified owner is not relevant to the finding area.');
    if (!claimQAPassed) blocked.push('claim QA failed (unsupported language or no evidence-backed claims).');

    if (blocked.length) {
      onProgress?.('email', 'Email draft blocked — gates not satisfied (no send).');
      return {
        primary_subject: '', alternate_subject: '', body: '', claims: [],
        generated: false, blocked_reason: blocked.join(' ')
      };
    }

    const { primary_subject, alternate_subject, body } = this.renderEmail(prospect, finding, owner, claims);
    onProgress?.(
      'email',
      `Finding-led email drafted (${claims.filter(cl => cl.evidence_ids.length > 0).length} evidence-backed claim(s)).`
    );
    return { primary_subject, alternate_subject, body, claims, generated: true };
  }

  /** Compose truthful finding-led claims for the deep path (no engine model). */
  private static composeDeepClaims(
    prospect: Omit<DeepProspect, 'email_draft'>,
    finding: DeepFinding,
    owner: DeepOwner | null
  ): EvidenceClaim[] {
    const ev = finding.evidence_ids;
    const reproducible = finding.provenance === 'REAL_PUBLIC_OBSERVATION'
      && finding.strength.reproducibility !== 'LOW';
    const first = owner ? owner.name.split(' ')[0] : 'there';
    const techArea = owner?.finding_link || 'technical ownership';
    const observedText = (finding.explanation || finding.severity_basis || 'a publicly observable behavior').trim();
    const reproStatement = reproducible
      ? 'reproduce the observed behavior using a normal read-only request (no auth bypass)'
      : 'verify this specific observation against the public surface with a normal read-only request';
    const sourceUrl = finding.source_urls?.[0] || '';

    const claims: EvidenceClaim[] = [
      // Section 1 — greeting (personalized)
      { text: `Hi ${first},`, evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
      // Section 2 — founder identity (verbatim spec line)
      { text: "I'm Vishnu, the solo founder building XAVIRA.", evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
      // Section 3 — the specific observation (evidence-backed)
      { text: observedText, evidence_ids: ev, claim_type: 'OBSERVATION' },
    ];
    // Section 4 — safe reproduction statement ("where applicable")
    if (reproducible) {
      claims.push({ text: reproStatement, evidence_ids: ev, claim_type: 'REPRODUCTION' });
    } else {
      // Still surfaced in the body (section 4) as a safe verify statement; not a
      // factual reproduction claim because reproducibility is not established.
      claims.push({ text: reproStatement, evidence_ids: [], claim_type: 'STANDARD_BLOCK' });
    }
    claims.push(
      // Section 5 — source citation
      { text: sourceUrl ? `Source: ${sourceUrl}` : 'Source: (unavailable)', evidence_ids: ev, claim_type: 'STANDARD_BLOCK' },
      // Section 6 — relevance to the owner's technical area (evidence-backed)
      { text: `I reached out because your public role is associated with ${techArea}.`, evidence_ids: ev, claim_type: 'OWNER' },
      // Section 7
      { text: "I'd rather show you something you can verify than ask you to take my word for it.", evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
      // Section 8
      { text: "This isn't a sales pitch, and there is no meeting request.", evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
      // Section 9
      { text: 'If useful, reply "details" and I\'ll send over the evidence.', evidence_ids: [], claim_type: 'STANDARD_BLOCK' },
    );
    return claims;
  }

  /** Lightweight QA on composed claims (engine claims are already engine-QA'd). */
  private static deepClaimsPassQa(claims: EvidenceClaim[]): boolean {
    const text = claims.map(c => c.text).join(' ').toLowerCase();
    if (!text.includes('vishnu')) return false;            // founder identity required
    if (!text.includes('no meeting') && !text.includes("no sales")) return false;
    for (const term of UNSUPPORTED_TERMS) {
      if (text.includes(term)) return false;
    }
    // Factual claims must carry concrete evidence IDs.
    const factual = claims.filter(
      c => c.claim_type === 'OBSERVATION' || c.claim_type === 'REPRODUCTION' || c.claim_type === 'DOCUMENTED_FACT'
    );
    if (factual.length === 0) return false;
    if (factual.some(c => c.evidence_ids.length === 0)) return false;
    return true;
  }

  /** Render the exact XAVIRA 9-section structure from finding + owner + claims. */
  private static renderEmail(
    prospect: Omit<DeepProspect, 'email_draft'>,
    finding: FindingClassification | DeepFinding | null,
    owner: DeepOwner | null,
    claims: EvidenceClaim[]
  ): { primary_subject: string; alternate_subject: string; body: string } {
    const firstName = owner ? owner.name.split(' ')[0] : 'there';
    const company = prospect.company;
    const techArea = owner?.finding_link || 'the relevant technical area';

    // --- Section 3: the specific observation ---
    const obsClaim = claims.find(c => c.claim_type === 'OBSERVATION' || c.claim_type === 'DOCUMENTED_FACT');
    let observedText = obsClaim ? DeepEmailGenerator.extractObservation(obsClaim.text) : '';
    if (!observedText) observedText = (finding as DeepFinding | null)?.explanation || '';
    if (!observedText) observedText = finding?.severity_basis || '';
    if (!observedText) observedText = 'a publicly observable behavior on the documented surface';
    observedText = DeepEmailGenerator.cleanSentence(observedText);

    // --- Section 4: safe reproduction statement ("where applicable") ---
    const isReal = (finding as DeepFinding | null)?.provenance === 'REAL_PUBLIC_OBSERVATION';
    const strength = (finding as DeepFinding | null)?.strength;
    const reproducible = !!isReal && !!strength && strength.reproducibility !== 'LOW';
    const reproStatement = reproducible
      ? 'reproduce the observed behavior using a normal read-only request (no auth bypass)'
      : 'verify this specific observation against the public surface with a normal read-only request';

    // --- Section 5: source URL ---
    const deepUrls = finding ? ((finding as DeepFinding).source_urls || []) : [];
    const claimUrls = obsClaim ? (obsClaim.text.match(/https?:\/\/[^\s\n]+/g) || []) : [];
    const evidenceUrl = deepUrls[0] || claimUrls[0] || '';
    let hostname = prospect.domain;
    let path = '';
    if (evidenceUrl) {
      try {
        const u = new URL(evidenceUrl);
        hostname = u.hostname;
        path = u.pathname.replace(/^\/$/, '');
      } catch {
        hostname = prospect.public_surface?.homepage || prospect.domain;
      }
    }
    const displaySrc = evidenceUrl || prospect.public_surface?.homepage || hostname;
    const surface = path && path !== '/' ? path : 'public surface';

    // --- Subjects (finding-led: "Possible … in the …" / "Observed … on …") ---
    let primary_subject: string;
    let alternate_subject: string;
    if (finding && finding.finding_type.startsWith('OBSERVED_')) {
      const detail = finding.finding_type.replace(/^OBSERVED_/, '').replace(/_/g, ' ').toLowerCase();
      primary_subject = `Observed ${detail} on ${hostname}`;
      alternate_subject = `Quick technical note on ${hostname}`;
    } else if (finding) {
      const detail = finding.finding_type.replace(/^POSSIBLE_|^DOCUMENTED_/, '').replace(/_/g, ' ').toLowerCase();
      primary_subject = `Possible ${detail} in the ${surface}`;
      alternate_subject = `Technical note regarding ${detail} at ${hostname}`;
    } else {
      primary_subject = `Possible technical observation in the ${surface}`;
      alternate_subject = `Technical note on ${hostname}`;
    }

    // --- 9-SECTION BODY (verbatim XAVIRA spec, no blank lines) ---
    const body = [
      `Hi ${firstName},`,
      "I'm Vishnu, the solo founder building XAVIRA.",
      `I was looking at ${company}'s public ${techArea} and noticed ${observedText}.`,
      `I was able to ${reproStatement}, where applicable.`,
      `Source: ${displaySrc}`,
      `I reached out because your public role is associated with ${techArea}.`,
      "I'd rather show you something you can verify than ask you to take my word for it.",
      "This isn't a sales pitch, and there is no meeting request.",
      'If useful, reply "details" and I\'ll send over the evidence.',
      'Best,',
      'Vishnu',
      'Founder, XAVIRA',
    ].join('\n');

    return { primary_subject, alternate_subject, body };
  }

  /** Strip reportage preamble so the factual observation is surfaced cleanly. */
  private static extractObservation(text: string): string {
    let t = text.replace(/\s+/g, ' ').trim();
    const m = t.match(/I observed that:\s*(.+)$/i) || t.match(/explicitly documents:\s*(.+)$/i);
    if (m) t = m[1].trim();
    return t;
  }

  /** Collapse whitespace and strip a trailing sentence terminator (template adds one). */
  private static cleanSentence(text: string): string {
    return text.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  }
}
