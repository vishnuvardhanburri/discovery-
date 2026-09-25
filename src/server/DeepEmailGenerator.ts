// DeepEmailGenerator.ts
// -----------------------
// Builds the FINAL first-contact outreach email exclusively from the finding-led
// evidence lineage (DeepFinding + DeepOwner + contactability + IntelligenceCase).
//
// The email ALWAYS follows the XAVIRA 9-section structure. The CLAIM -> EVIDENCE
// map is rendered from the claim list (each claim carries evidence_ids).
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

    const claims: EvidenceClaim[] = [];
    claims.push({ text: `Hi ${first},`, evidence_ids: [], claim_type: 'STANDARD_BLOCK' });
    claims.push({
      text: "I'm Vishnu, the solo founder building XAVIRA. I'd rather show you something you can verify than ask you to trust me.",
      evidence_ids: [], claim_type: 'STANDARD_BLOCK'
    });
    // The single primary finding, stated factually.
    claims.push({
      text: `I observed:\n${finding.explanation}`,
      evidence_ids: ev, claim_type: 'OBSERVATION'
    });
    if (reproducible) {
      claims.push({
        text: 'The behavior was reproducible from the public side using a normal read-only request (no auth bypass).',
        evidence_ids: ev, claim_type: 'REPRODUCTION'
      });
    }
    claims.push({
      text: `I reached out because your public role is associated with ${techArea} at ${prospect.company}.`,
      evidence_ids: ev, claim_type: 'OWNER'
    });
    claims.push({
      text: "This isn't a sales pitch, and there is no meeting request.",
      evidence_ids: [], claim_type: 'STANDARD_BLOCK'
    });
    claims.push({
      text: 'If useful, reply "details" and I will send over the evidence.',
      evidence_ids: [], claim_type: 'STANDARD_BLOCK'
    });
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

    const obsClaim = claims.find(c => c.claim_type === 'OBSERVATION' || c.claim_type === 'DOCUMENTED_FACT');
    const reproClaim = claims.find(c => c.claim_type === 'REPRODUCTION');

    // "I observed:" — prefer the claim's factual wording (engine), fall back to the finding.
    let observedText: string;
    if (obsClaim) {
      observedText = obsClaim.text.replace(/^.*I observed:\s*/is, '').trim();
    } else if (finding) {
      observedText = finding.finding_type.startsWith('OBSERVED_')
        ? `Observed: ${finding.severity_basis}`
        : `The public surface shows: ${finding.severity_basis}`;
    } else {
      observedText = 'a publicly observable behavior on the documented surface';
    }

    const deepUrls = finding ? (finding as DeepFinding).source_urls : [];
    const deepUrl = deepUrls?.[0] || '';
    const claimUrls = obsClaim ? (obsClaim.text.match(/https?:\/\/[^\s\n]+/g) || []) : [];
    const evidenceUrl = deepUrl || claimUrls[0] || '';
    let hostname = prospect.domain;
    let path = '';
    if (evidenceUrl) {
      try {
        const u = new URL(evidenceUrl);
        hostname = u.hostname;
        path = u.pathname.replace(/^\/$/, '');
      } catch {
        hostname = prospect.public_surface.homepage;
      }
    }
    const displaySrc = evidenceUrl || prospect.public_surface.homepage || hostname;

    const reproBlock = reproClaim
      ? `\nI was able to reproduce the publicly observable behavior:\n${reproClaim.text}\n`
      : '';

    // ---- SUBJECTS (finding-led) ----
    const fb = (finding ? finding.finding_type : 'observation')
      .replace(/_/g, ' ').toLowerCase();
    let primary_subject: string;
    let alternate_subject: string;
    if (finding && finding.finding_type.startsWith('OBSERVED_')) {
      primary_subject = `Observed ${finding.finding_type.replace(/^OBSERVED_/, '').replace(/_/g, ' ').toLowerCase()} on ${hostname}${path ? path : '/'}`;
      alternate_subject = `Quick technical note on ${hostname}${path ? path : '/'}`;
    } else if (finding && finding.finding_type.startsWith('DOCUMENTED_')) {
      primary_subject = `Possible ${fb} on ${hostname}`;
      alternate_subject = `Technical note regarding ${fb} at ${hostname}`;
    } else {
      primary_subject = `Possible ${fb} in the ${path || 'public surface'}`;
      alternate_subject = `Technical note regarding ${fb} at ${hostname}`;
    }

    // ---- 9-SECTION BODY ----
    const body =
`Hi ${firstName},

I'm Vishnu, the solo founder building XAVIRA.

I was looking at ${company}'s public ${techArea} and noticed something I'd like to verify with you.

I observed:
${observedText}

Source:
${displaySrc}
${reproBlock}
I reached out because your public role is associated with ${techArea} at ${company}.

I'd rather show you something you can verify than ask you to take my word for it.

This isn't a sales pitch, and there is no meeting request.

If useful, reply "details" and I'll send over the evidence.

Best,
Vishnu
Founder, XAVIRA`;

    return { primary_subject, alternate_subject, body };
  }
}
