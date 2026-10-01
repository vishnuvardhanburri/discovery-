import { 
  OpportunityDecision, 
  OpportunityDecisionState, 
  OpportunityEvidencePacket 
} from './SemanticTypes';
import { Evidence, IntelligenceCase, InvestigationHypothesis } from '../IntelligenceCase';
import { ExposureGraph } from './ExternalExposureGraphEngine';
import { SurfaceSemanticAssessment } from './SemanticTypes';

export class OpportunityDecisionEngine {
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
    
    // Rule 1: VERIFIED_FINDING (The Diamond) - Must have evidence
    const verifiedFinding = hypotheses.find(h => h.status === 'VERIFIED');
    if (verifiedFinding && verifiedFinding.evidenceIds.length > 0) {
      return {
        state: 'VERIFIED_FINDING',
        reason: `Verified finding: ${verifiedFinding.claim}`,
        supportingEvidenceIds: verifiedFinding.evidenceIds,
        decisionTimeline: new Date().toISOString(),
        confidence: 1.0,
        commercialRelevance: 'HIGH'
      };
    }

    // Rule 2: INVESTIGATION_OPPORTUNITY
    // Now REQUIRES: (meaningful technical context OR evidence-supported signal OR reasonable hypothesis)
    const hasMeaningfulComplexity = complexityMap && complexityMap.nodes && complexityMap.nodes.length > 0;
    const hasStrongHypothesis = hypotheses.find(h => h.confidence > 0.5 && h.evidenceIds.length > 0);
    const hasSupportedSignal = signals.length > 0 && evidenceStore.length > 0;

    if (hasStrongHypothesis || (hasMeaningfulComplexity && hasSupportedSignal)) {
      return {
        state: 'INVESTIGATION_OPPORTUNITY',
        reason: `Technical opportunity identified based on complexity and supported signals.`,
        supportingEvidenceIds: hasStrongHypothesis ? hasStrongHypothesis.evidenceIds : evidenceStore.slice(0, 3).map(e => e.id),
        decisionTimeline: new Date().toISOString(),
        confidence: 0.6,
        commercialRelevance: 'MEDIUM-HIGH'
      };
    }

    // Rule 3: ADVISORY_OPPORTUNITY
    const advisoryCandidate = hypotheses.find(h => this.isAdvisoryType(h) && h.evidenceIds.length > 0);
    if (advisoryCandidate) {
      return {
        state: 'ADVISORY_OPPORTUNITY',
        reason: `Advisory signal: ${advisoryCandidate.claim}`,
        supportingEvidenceIds: advisoryCandidate.evidenceIds,
        decisionTimeline: new Date().toISOString(),
        confidence: 0.5,
        commercialRelevance: 'MEDIUM'
      };
    }

    // Rule 4: RESEARCH_MORE
    // If we have surfaces or some evidence, but not enough for an opportunity
    if (surfaceAssessments.length > 0 || evidenceStore.length > 0 || signals.length > 0) {
      return {
        state: 'RESEARCH_MORE',
        reason: 'Technical footprint identified, but insufficient evidence for an opportunity decision.',
        supportingEvidenceIds: evidenceStore.slice(0, 3).map(e => e.id),
        decisionTimeline: new Date().toISOString(),
        confidence: 0.3,
        commercialRelevance: 'LOW'
      };
    }

    return {
      state: 'NO_ACTIONABLE_SIGNAL',
      reason: 'No technical footprints or actionable signals detected.',
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

  async createEvidencePacket(org: any, decision: OpportunityDecision, context: any): Promise<OpportunityEvidencePacket> {
    return {
      organization: org.organizationName || org.name,
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
      provenance: 'XAVIRA Intelligence Pipeline'
    };
  }

  private mapDecisionToNextAction(state: OpportunityDecisionState): string {
    switch(state) {
      case 'VERIFIED_FINDING': return 'Immediate high-priority outreach.';
      case 'ADVISORY_OPPORTUNITY': return 'Prepare technical advisory.';
      case 'INVESTIGATION_OPPORTUNITY': return 'Execute deep-research verification.';
      case 'RESEARCH_MORE': return 'Deepen technical footprint search.';
      default: return 'Monitor for changes.';
    }
  }
}
