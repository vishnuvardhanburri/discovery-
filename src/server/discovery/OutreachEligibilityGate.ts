import { OpportunityEvidencePacket } from './SemanticTypes';

export class OutreachEligibilityGate {
  /**
   * Determines if an Evidence Packet is ready for human-led outreach.
   */
  checkEligibility(packet: OpportunityEvidencePacket): { eligible: boolean; gaps: string[] } {
    const gaps: string[] = [];

    if (!packet.organization || !packet.domain) gaps.push('Missing basic organization identity');
    if (packet.supportingEvidence.length === 0) gaps.push('No supporting evidence provided');
    if (packet.decision.state === 'RESEARCH_MORE' || packet.decision.state === 'NO_ACTIONABLE_SIGNAL') {
      gaps.push(`Decision state ${packet.decision.state} is not eligible for outreach`);
    }
    if (packet.provenance === 'UNKNOWN') gaps.push('Missing source provenance');
    
    // Ensure language is non-speculative
    if (packet.decisionReason.toLowerCase().includes('maybe') || packet.decisionReason.toLowerCase().includes('possibly')) {
      gaps.push('Decision reasoning is too speculative for outreach');
    }

    return {
      eligible: gaps.length === 0,
      gaps
    };
  }
}
