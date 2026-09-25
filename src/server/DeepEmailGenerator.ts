/**
 * XAVIRA — DEEP EMAIL GENERATOR (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces a finding-led outreach email ONLY when all gates pass:
 *   - engine prospect_decision === GO
 *   - engine claim QA === PASSED
 *   - an evidence-backed HIGH-confidence technical owner exists
 *   - a usable public professional contact channel exists
 *
 * The body is built from the engine's EvidenceClaim[] (so evidence IDs are
 * preserved end-to-end) and framed with: founder identity, a specific
 * observation, the relevant owner, and explicit uncertainty. It never fabricates
 * claims, never makes generic sales pitches, and never promises results.
 */

import type { DeepEmailDraft, DeepProspect, DeepStage } from './DeepTypes';
import type { IntelligenceCase, EvidenceClaim } from './IntelligenceCase';

export interface DeepEmailContext {
  prospect: Omit<DeepProspect, 'email_draft'>;
  caseRef: IntelligenceCase;
}

export class DeepEmailGenerator {
  static generate(ctx: DeepEmailContext, onProgress?: (stage: DeepStage, message: string) => void): DeepEmailDraft {
    const { prospect, caseRef } = ctx;
    const c = caseRef;

    const ownerHigh = !!prospect.selected_owner && prospect.selected_owner.confidence === 'HIGH';
    const hasChannel = prospect.contactability.some(ct =>
      ct.type === 'PROFESSIONAL_EMAIL' || ct.type === 'PROFESSIONAL_PROFILE'
    );

    const blockedReasons: string[] = [];

    if (c.prospect_decision !== 'GO') {
      blockedReasons.push(`no GO finding (engine decision: ${c.prospect_decision}; finding: ${c.finding_classification?.finding_type || 'NONE'}).`);
    }
    if (c.claim_validation !== 'PASSED') {
      blockedReasons.push(`claim QA is ${c.claim_validation} (not PASSED).`);
    }
    if (!ownerHigh) {
      blockedReasons.push('no evidence-backed HIGH-confidence technical owner.');
    }
    if (!hasChannel) {
      blockedReasons.push('no usable public professional contact channel.');
    }

    if (blockedReasons.length > 0) {
      onProgress?.('email', 'Email draft blocked — gates not satisfied.');
      return {
        primary_subject: '',
        alternate_subject: '',
        body: '',
        claims: [],
        generated: false,
        blocked_reason: blockedReasons.join(' ')
      };
    }

    const engineClaims: EvidenceClaim[] = c.email_model?.claims || [];
    const urls = Array.from(new Set(c.resolved_evidence.map(e => e.public_url)));
    const finding = c.finding_classification;

    const primary_subject = c.subject || `Technical note: ${finding?.finding_type || 'observation'} on ${prospect.domain}`;
    const alternate_subject = finding
      ? `Quick technical note regarding your ${finding.finding_type.replace(/_/g, ' ').toLowerCase()}`
      : `A verifiable technical observation about ${prospect.domain}`;

    // Frame with angle + founder identity, then the engine claims (evidence IDs preserved),
    // then uncertainty. The founder + observation blocks are part of engineClaims already.
    const angle = prospect.primary_angle
      ? `Primary angle: ${prospect.primary_angle}\n`
      : '';

    const uncertainty = c.uncertainty_model?.what_we_do_not_know
      ? `\n\nUncertainty: ${c.uncertainty_model.what_we_do_not_know}`
      : '';

    const contactLine = prospect.contactability
      ? `\n\nContact noted: ${prospect.contactability.map(ct => `${ct.value} (${ct.type})`).join('; ')}.`
      : '';

    const body =
      `${angle}` +
      engineClaims.map(cl => cl.text).join('\n\n') +
      `${uncertainty}${contactLine}\n\nReply "details" and I'll send the evidence directly — no meeting needed.`;

    onProgress?.('email', `Finding-led email drafted (claims reference ${engineClaims.filter(cl => cl.evidence_ids.length > 0).length} evidence-backed claim(s)).`);

    return {
      primary_subject,
      alternate_subject,
      body,
      claims: engineClaims,
      generated: true
    };
  }
}
