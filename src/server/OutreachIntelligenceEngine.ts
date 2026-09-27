/**
 * XAVIRA — OUTREACH INTELLIGENCE ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the transition from a verified prospect to a validated outreach package.
 * This is the final "Intelligence" gate before human review.
 */

import {
  DeepProspect,
  OutreachPackage,
  OutreachInput,
  DeepEmailDraft,
  DeepFinding
} from './DeepTypes';
import { EvidencePackBuilder } from './outreach/EvidencePackBuilder';
import { ClaimLedger } from './outreach/ClaimLedger';
import { OutreachStrategyEngine } from './outreach/OutreachStrategyEngine';
import { OutreachGenerator } from './outreach/OutreachGenerator';
import { OutreachClaimValidator } from './outreach/OutreachClaimValidator';
import { OutreachQualityScoreEngine } from './outreach/OutreachQualityScore';
import { XaviraModelGateway } from './XaviraModelGateway';

export class OutreachIntelligenceEngine {
  constructor(private modelGateway: XaviraModelGateway) {}

  async process(prospect: DeepProspect): Promise<OutreachPackage> {
    // 1. Map to OutreachInput
    const input = this.mapToInput(prospect);

    // 2. Build Evidence Pack (Smallest Defensible Set)
    const evidencePack = EvidencePackBuilder.build(prospect);

    // 3. Determine Strategy
    const strategyEngine = new OutreachStrategyEngine(this.modelGateway);
    const strategy = await strategyEngine.determineStrategy(prospect);

    // 4. Generate Draft & Claims
    const ledger = new ClaimLedger();
    const generator = new OutreachGenerator(this.modelGateway);
    const draft = await generator.generate(prospect, strategy, ledger);

    // 5. Hard Validation Gate
    const validation = OutreachClaimValidator.validate(draft.body, ledger);

    // 6. Quality Scoring
    const qualityScore = OutreachQualityScoreEngine.calculate(prospect, {
      recipient: {
        name: prospect.selected_owner?.name || 'Unknown',
        role: prospect.selected_owner?.role || 'Unknown',
        email: prospect.contactability[0]?.value || 'unknown'
      },
      subject: draft.primary_subject,
      body: draft.body,
      opportunity_id: prospect.deep_finding?.opportunity_id || 'unknown',
      evidence_pack_id: 'pack_001',
      claim_ledger: ledger.getAllClaims(),
      quality_score: {} as any,
      verification_state: 'PENDING',
      qa_status: 'PENDING',
      next_action: 'PENDING'
    });

    // 7. Final Packaging
    return {
      recipient: {
        name: prospect.selected_owner?.name || 'Unknown',
        role: prospect.selected_owner?.role || 'Unknown',
        email: prospect.contactability[0]?.value || 'unknown'
      },
      subject: draft.primary_subject,
      body: draft.body,
      opportunity_id: prospect.deep_finding?.opportunity_id || 'unknown',
      evidence_pack_id: 'pack_001',
      claim_ledger: ledger.getAllClaims(),
      quality_score: qualityScore,
      verification_state: validation.status === 'QA_PASSED' ? 'VERIFIED' : 'BLOCKED',
      qa_status: validation.status,
      next_action: validation.status === 'QA_PASSED' ? 'HUMAN_REVIEW' : 'BLOCKED'
    };
  }

  private mapToInput(prospect: DeepProspect): OutreachInput {
    return {
      opportunity_id: prospect.deep_finding?.opportunity_id || 'unknown',
      company_id: prospect.domain,
      company_name: prospect.company,
      person_id: prospect.selected_owner?.name || 'unknown',
      recipient_name: prospect.selected_owner?.name || 'unknown',
      recipient_role: prospect.selected_owner?.role || 'unknown',
      opportunity_type: prospect.deep_finding?.finding_type || 'unknown',
      subsystem: prospect.selected_owner?.finding_link || 'unknown',
      qualified_signal_ids: prospect.technical_signals.map(s => s.signal_id),
      correlation_ids: [], // Simplified for now
      evidence_ids: prospect.evidence.map(e => e.id),
      source_urls: prospect.public_surface?.homepage ? [prospect.public_surface.homepage] : [],
      key_observation: prospect.deep_finding?.explanation || '',
      technical_context: prospect.deep_finding?.severity_basis || '',
      owner_reason: 'Verified technical owner',
      contactability: prospect.contactability,
      freshness: 'FRESH',
      confidence_dimensions: { identity: 1.0, role: 1.0 },
      source_relationships: []
    };
  }
}
