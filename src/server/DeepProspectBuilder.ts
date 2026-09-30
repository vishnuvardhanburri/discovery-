/**
 * XAVIRA — DEEP PROSPECT BUILDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the transition from CandidateSignals to Outreach-Ready opportunities.
 *
 * Authority Chain:
 * CandidateSignal -> FindingVerificationEngine -> VerifiedFinding
 * -> DiagnosticFitEngine -> DiagnosticOpportunity
 * -> OutreachReadiness -> OutreachReadyOpportunity
 */

import {
  SignalCandidate,
  DeepSignal
} from './DeepTypes';
import {
  Evidence
} from './IntelligenceCase';
import { FindingVerificationEngine } from './FindingVerificationEngine';
import { DiagnosticFitEngine } from './DiagnosticFitEngine';
import { OutreachReadiness } from './OutreachReadiness';

export interface DeepProspect {
  company_name: string;
  verified_findings: DeepSignal[];
  diagnostic_opportunities: any[];
  outreach_ready_opportunities: any[];
  rejected_candidates: { candidate: SignalCandidate; reason: string }[];
}

export class DeepProspectBuilder {
  /**
   * Builds a deep technical prospect by pushing signals through the authority chain.
   */
  static build(
    companyName: string,
    candidates: SignalCandidate[],
    allEvidence: Evidence[]
  ): DeepProspect {
    const prospect: DeepProspect = {
      company_name: companyName,
      verified_findings: [],
      diagnostic_opportunities: [],
      outreach_ready_opportunities: [],
      rejected_candidates: [],
    };

    for (const candidate of candidates) {
      // 1. VERIFICATION GATE (Candidate -> VerifiedFinding)
      const verification = FindingVerificationEngine.verify(
        candidate,
        allEvidence,
        companyName
      );

      if (!verification.isVerified || !verification.verifiedFinding) {
        prospect.rejected_candidates.push({
          candidate,
          reason: verification.reasons.join(' | ') || 'Verification failed',
        });
        continue;
      }

      const verifiedFinding = verification.verifiedFinding;
      prospect.verified_findings.push(verifiedFinding);

      // 2. DIAGNOSTIC FIT GATE (VerifiedFinding -> DiagnosticOpportunity)
      const diagnostic = DiagnosticFitEngine.evaluate(verifiedFinding);

      if (!diagnostic.is_eligible) {
        // Still a verified finding, but not a £15K diagnostic opportunity.
        continue;
      }

      prospect.diagnostic_opportunities.push(diagnostic);

      // 3. OUTREACH READINESS GATE (DiagnosticOpportunity -> OutreachReady)
      const readiness = OutreachReadiness.evaluate(
        companyName,
        verifiedFinding,
        diagnostic
      );

      if (readiness.isReady && readiness.readyOpportunity) {
        prospect.outreach_ready_opportunities.push(readiness.readyOpportunity);
      }
    }

    return prospect;
  }
}
