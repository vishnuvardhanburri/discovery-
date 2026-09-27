/**
 * XAVIRA — OUTREACH QUALITY SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * Quantifies the technical quality and human-ness of the outreach package.
 */

import { OutreachQualityScore, DeepProspect, OutreachPackage } from './DeepTypes';

export class OutreachQualityScoreEngine {
  static calculate(prospect: DeepProspect, pkg: OutreachPackage): OutreachQualityScore {
    const body = pkg.body.toLowerCase();

    // 1. Evidence Specificity: Does it mention specific IDs or URLs?
    const specificity = pkg.claim_ledger.some(c => c.supporting_evidence_ids.length > 0) ? 1.0 : 0.2;

    // 2. Recipient Relevance: Link between role and finding
    const relevance = prospect.selected_owner?.finding_link ? 1.0 : 0.5;

    // 3. Technical Relevance: Avoids generic "scaling" fluff
    const techRelevance = body.includes('observed') && !body.includes('industry-leading') ? 1.0 : 0.6;

    // 4. Claim Support: % of factual claims backed by evidence
    const support = pkg.claim_ledger.length > 0
      ? (pkg.claim_ledger.filter(c => c.allowed_in_email).length / pkg.claim_ledger.length)
      : 0;

    // 5. Naturalness: Absence of AI-isms
    const aiTerms = ['revolutionary', 'game-changing', 'unlock', 'leverage', 'synergy'];
    const naturalness = aiTerms.some(t => body.includes(t)) ? 0.1 : 1.0;

    // 6. Brevity: 70-140 words
    const wordCount = body.split(/\s+/).length;
    const brevity = (wordCount >= 70 && wordCount <= 140) ? 1.0 : 0.7;

    // 7. CTA Quality: Low pressure
    const ctaQuality = body.includes('reply "details"') && !body.includes('meeting') ? 1.0 : 0.4;

    return {
      evidence_specificity: specificity,
      recipient_relevance: relevance,
      technical_relevance: techRelevance,
      claim_support: support,
      naturalness: naturalness,
      brevity: brevity,
      cta_quality: ctaQuality,
      reasoning: {
        specificity: specificity === 1.0 ? 'Cites specific evidence' : 'Generic claims',
        naturalness: naturalness === 1.0 ? 'No AI fluff detected' : 'Marketing language detected',
        brevity: brevity === 1.0 ? 'Optimal length' : 'Too short or too long'
      }
    };
  }
}
