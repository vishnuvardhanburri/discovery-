import { 
  OpportunityDecision, 
  OpportunityDecisionState, 
  OpportunityEvidencePacket 
} from './SemanticTypes';
import { Evidence, IntelligenceCase, InvestigationHypothesis } from '../IntelligenceCase';
import { ExposureGraph } from './ExternalExposureGraphEngine';
import { SurfaceSemanticAssessment } from './SemanticTypes';

export class OpportunityDecisionEngine {
  /**
   * Determines if the gathered intelligence represents a meaningful XAVIRA opportunity.
   */
  async decide(
    org: any,
    evidenceStore: Evidence[],
    signals: any[],
    complexityMap: any,
    exposureGraph: ExposureGraph,
    surfaceAssessments: SurfaceSemanticAssessment[],
    trendHistory: any[],
    hypotheses: InvestigationHypothesis[],
    verificationResults: any[],
    diagnosticFit: any
  ): Promise<OpportunityDecision> {
    
    // Rule 1: VERIFIED_FINDING is absolute.
    const verifiedFinding = hypotheses.find(h => h.status === 'VERIFIED');
    if (verifiedFinding) {
      return {
        state: 'VERIFIED_FINDING',
        reason: `Verified finding: ${verifiedFinding.claim}`,
        supportingEvidenceIds: verifiedFinding.evidenceIds,
        decisionTimeline: new Date().toISOString(),
        confidence: 1.0,
        commercialRelevance: 'HIGH - Verified technical failure/exposure'
      };
    }

    // Rule 2: Check for ADVISORY_OPPORTUNITY
    // Condition: Attributable evidence + relevant signal + bounded claim + advisory contract.
    const advisoryCandidate = hypotheses.find(h => 
      h.status === 'HYPOTHESIS' && 
      h.confidence > 0.6 && 
      this.isAdvisoryType(h)
    );

    if (advisoryCandidate && this.isEvidenceAttributable(evidenceStore)) {
      return {
        state: 'ADVISORY_OPPORTUNITY',
        reason: `Advisory opportunity based on: ${advisoryCandidate.claim}. Evidence is attributable but does not require live verification.`,
        supportingEvidenceIds: advisoryCandidate.evidenceIds,
        decisionTimeline: new Date().toISOString(),
        confidence: 0.7,
        commercialRelevance: 'MEDIUM - Technical transition or architecture signal'
      };
    }

    // Rule 3: INVESTIGATION_OPPORTUNITY
    // Condition: Real complexity + meaningful evidence + reasonable hypothesis.
    if (complexityMap && complexityMap.nodes.length > 0 && hypotheses.length > 0) {
      return {
        state: 'INVESTIGATION_OPPORTUNITY',
        reason: `Technical complexity identified (${complexityMap.nodes.length} nodes). Hypotheses generated but require further research to transition to verified/advisory state.`,
        supportingEvidenceIds: hypotheses[0].evidenceIds,
        decisionTimeline: new Date().toISOString(),
        confidence: 0.5,
        commercialRelevance: 'TBD - Requires deeper investigation'
      };
    }

    // Rule 4: RESEARCH_MORE
    // Condition: Missing critical evidence but likelihood of resolution is high.
    if (hypotheses.length === 0 && evidenceStore.length > 0) {
      return {
        state: 'RESEARCH_MORE',
        reason: 'Initial signals detected but insufficient to form testable hypotheses.',
        supportingEvidenceIds: evidenceStore.slice(0, 5).map(e => e.id),
        missingEvidence: ['Specific architectural markers', 'Boundary behavioral proof'],
        recommendedResearch: ['Deepen technical footprint search', 'Analyze recent engineering blog posts'],
        decisionTimeline: new Date().toISOString(),
        confidence: 0.3,
        commercialRelevance: 'LOW - Preliminary stage'
      };
    }

    // Rule 5: MONITOR
    // Condition: Signal is real, org is relevant, but no current problem.
    if (signals.length > 0) {
      return {
        state: 'MONITOR',
        reason: 'Signals are real but no current architectural pressure or exposure is evident. Monitoring for change.',
        supportingEvidenceIds: [],
        decisionTimeline: new Date().toISOString(),
        confidence: 0.4,
        commercialRelevance: 'LOW - Latent opportunity'
      };
    }

    // Rule 6: NO_ACTIONABLE_SIGNAL / REJECT
    return {
      state: 'NO_ACTIONABLE_SIGNAL',
      reason: 'Evidence exists but is not materially relevant to XAVIRA diagnostic scope.',
      supportingEvidenceIds: [],
      decisionTimeline: new Date().toISOString(),
      confidence: 0.9,
      commercialRelevance: 'NONE'
    };
  }

  private isAdvisoryType(h: InvestigationHypothesis): boolean {
    const advisoryKeywords = ['transition', 'migration', 'architecture', 'legacy', 'scaling'];
    return advisoryKeywords.some(k => h.claim.toLowerCase().includes(k));
  }

  private isEvidenceAttributable(evidence: Evidence[]): boolean {
    return evidence.some(e => e.provenance.provider !== 'UNKNOWN');
  }

  /**
   * Synthesizes the Evidence Packet for downstream use.
   */
  async createEvidencePacket(
    org: any,
    decision: OpportunityDecision,
    context: any
  ): Promise<OpportunityEvidencePacket> {
    return {
      organization: org.companyName || org.name,
      domain: org.domain,
      industryContext: org.industry || 'Unknown',
      keySignals: context.signals || [],
      supportingEvidence: context.evidenceIds || [],
      surfaceSummary: context.surfaceSummary || 'No surface map available',
      technicalContext: context.technicalContext || 'No complexity map available',
      changeTimeline: context.changeTimeline || 'No temporal changes detected',
      hypotheses: context.hypotheses || [],
      verificationStatus: decision.state,
      decision: decision,
      decisionReason: decision.reason,
      uncertainties: context.unknowns || [],
      recommendedNextAction: this.mapDecisionToNextAction(decision.state),
      sourceUrls: context.sourceUrls || [],
      provenance: 'XAVIRA Autonomous Intelligence Pipeline'
    };
  }

  private mapDecisionToNextAction(state: OpportunityDecisionState): string {
    switch(state) {
      case 'VERIFIED_FINDING': return 'Proceed to high-priority outreach with verified evidence.';
      case 'ADVISORY_OPPORTUNITY': return 'Prepare diagnostic advisory based on attributable signals.';
      case 'INVESTIGATION_OPPORTUNITY': return 'Execute targeted deep-research phase.';
      case 'MONITOR': return 'Add to monitoring queue for architectural changes.';
      case 'RESEARCH_MORE': return 'Execute recommended research tasks to resolve uncertainty.';
      default: return 'No further action required.';
    }
  }
}
