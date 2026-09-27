/**
 * XAVIRA — OWNER PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the transition from "Collect-then-Filter" to "Plan-then-Hunt".
 * 
 * Flow:
 * Opportunity -> OwnerSearchPlanner -> TargetedDiscoveryEngine -> 
 * OwnershipInferenceEngine -> DeepOwnerResolver
 */

import { OwnerSearchPlanner } from './OwnerSearchPlanner';
import { TargetedDiscoveryEngine } from './TargetedDiscoveryEngine';
import { OwnershipInferenceEngine } from './OwnershipInferenceEngine';
import { PeopleExtractor } from './PeopleExtractor';
import { LiveWebResearchProvider } from './LiveWebResearchProvider';
import type { 
  FindingClassification, Evidence, OwnerResolutionResult, 
  DeepOwner, OwnerSearchPlan, EvidenceLedger 
} from './DeepTypes';

export class OwnerPipeline {
  constructor(
    private researchProvider: LiveWebResearchProvider,
    private peopleExtractor: PeopleExtractor
  ) {}

  async resolve(
    opportunityId: string,
    classification: FindingClassification | null,
    evidence: Evidence[]
  ): Promise<OwnerResolutionResult> {
    const plan: OwnerSearchPlan = OwnerSearchPlanner.plan(
      opportunityId, 
      classification, 
      evidence
    );

    const discoveryEngine = new TargetedDiscoveryEngine(
      this.researchProvider, 
      this.peopleExtractor
    );
    const ledger: EvidenceLedger = await discoveryEngine.hunt(plan);

    const candidates = this.aggregateCandidates(ledger);
    const scoredCandidates = candidates.map(c => {
      const { score, dimensions } = OwnershipInferenceEngine.scoreCandidate(c, ledger, plan);
      return {
        candidate: c,
        score,
        dimensions
      };
    });

    return this.finalizeResolution(opportunityId, scoredCandidates, ledger);
  }

  private aggregateCandidates(ledger: EvidenceLedger): any[] {
    const registry = new Map<string, any>();
    for (const claim of ledger.claims) {
      const parts = claim.claim.split(' is a ');
      if (parts.length < 2) continue;
      const name = parts[0];
      const role = parts[1];
      const existing = registry.get(name);
      if (!existing) {
        registry.set(name, {
          name,
          role,
          company: 'Unknown',
          source_urls: [claim.source_url],
          owner_evidence: [claim.claim]
        });
      } else {
        existing.source_urls.push(claim.source_url);
        existing.owner_evidence.push(claim.claim);
      }
    }
    return Array.from(registry.values());
  }

  private finalizeResolution(
    opportunityId: string, 
    scored: any[], 
    ledger: EvidenceLedger
  ): OwnerResolutionResult {
    const sorted = scored.sort((a, b) => b.score - a.score);
    const primary = sorted[0];

    if (!primary) {
      return {
        opportunity_id: opportunityId,
        candidates: [],
        primary_candidate: null,
        identity_confidence: 0,
        role_confidence: 0,
        technical_relevance: 0,
        ownership_confidence: 0,
        contactability_confidence: 0,
        evidence_ids: [],
        source_urls: [],
        verification_state: 'NO_OWNER_FOUND',
        next_action: 'RESEARCH_MORE'
      };
    }

    const candidate = primary.candidate;
    const isContactable = this.verifyLegitimateContact(candidate);
    const confidence = OwnershipInferenceEngine.resolveConfidence(
      primary.score, 
      isContactable
    );

    // STRICT STATE-TRANSITION GATE
    let nextAction: 'OUTREACH_CANDIDATE' | 'RESEARCH_MORE' = 'RESEARCH_MORE';

    if (confidence === 'OWNER_VERIFIED_CONTACTABLE') {
      nextAction = 'OUTREACH_CANDIDATE';
    } else if (confidence === 'OWNER_HIGH_CONFIDENCE' && isContactable) {
      // In a real system, this might trigger a separate verification step, 
      // but based on requirements, we only promote VERIFIED_CONTACTABLE to outreach.
      nextAction = 'RESEARCH_MORE'; 
    } else {
      nextAction = 'RESEARCH_MORE';
    }

    return {
      opportunity_id: opportunityId,
      candidates: sorted.map(s => ({
        ...s.candidate,
        confidence: confidence
      })),
      primary_candidate: {
        ...candidate,
        confidence: confidence
      },
      identity_confidence: primary.dimensions.IDENTITY,
      role_confidence: primary.dimensions.ROLE,
      technical_relevance: primary.dimensions.TECHNICAL_RELEVANCE,
      ownership_confidence: primary.dimensions.OWNERSHIP,
      contactability_confidence: primary.dimensions.CONTACTABILITY,
      evidence_ids: ledger.claims.map(c => c.evidence_id),
      source_urls: candidate.source_urls,
      verification_state: confidence,
      next_action: nextAction
    };
  }

  private verifyLegitimateContact(candidate: any): boolean {
    // Reject guessed/generated emails (basic heuristic: check for 'example.com' or patterns)
    if (!candidate.email || !candidate.linkedin_url) return false;
    
    const email = candidate.email.toLowerCase();
    if (email.includes('example.com') || email.includes('test@')) return false;
    
    // In a real system, this would check the source of the contact data
    // (e.g., licensed enrichment vs. inferred pattern)
    return true;
  }
}
