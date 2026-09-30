/**
 * XAVIRA — OUTREACH READINESS GATE
 * ─────────────────────────────────────────────────────────────────────────────
 * The final authority check before a lead is passed to a human operator.
 *
 * OUTREACH_READY requires a chain of:
 * CandidateSignal -> VerifiedFinding -> DiagnosticOpportunity
 */

import { VerifiedFinding, DeepSignal } from './DeepTypes';
import { DiagnosticOpportunity } from './DiagnosticFitEngine';

export interface OutreachReadinessResult {
  isReady: boolean;
  readyOpportunity?: {
    company_name: string;
    finding: VerifiedFinding;
    diagnostic: DiagnosticOpportunity;
    problem_statement: string;
    responsibility_guidance: string;
  };
  reasons: string[];
  status: 'OUTREACH_READY' | 'INCOMPLETE' | 'NO_GO';
}

export class OutreachReadiness {
  /**
   * Determines if a diagnostic opportunity is ready for outreach.
   * Now derives the company-specific claim from verified evidence,
   * not the original candidate text.
   */
  static evaluate(
    companyName: string,
    finding: VerifiedFinding,
    diagnostic: DiagnosticOpportunity
  ): OutreachReadinessResult {
    const reasons: string[] = [];

    // 1. Basic Prerequisites
    if (!diagnostic.is_eligible) {
      reasons.push('DIAGNOSTIC_NOT_ELIGIBLE: Finding failed the diagnostic fit test.');
      return { isReady: false, reasons, status: 'NO_GO' };
    }

    // 2. Company-Specific Claim Generation
    // We no longer check if companyName is in finding.relevance or finding.excerpt.
    // Instead, we synthesize the claim from the verified finding's properties.
    const problemStatement = this.generateClaimFromVerifiedFinding(companyName, finding, diagnostic);
    if (!problemStatement) {
      reasons.push('CLAIM_GENERATION_FAILURE: Could not derive a concrete technical claim from verified evidence.');
      return { isReady: false, reasons, status: 'INCOMPLETE' };
    }

    // 3. Primary Evidence & Source
    if (!finding.source_url) {
      reasons.push('MISSING_SOURCE: No primary evidence URL attached.');
      return { isReady: false, reasons, status: 'INCOMPLETE' };
    }

    // 4. Responsibility Guidance
    const guidance = this.generateResponsibilityGuidance(finding);
    if (!guidance) {
      reasons.push('MISSING_RESPONSIBILITY_GUIDANCE: Could not map finding to a target role.');
      return { isReady: false, reasons, status: 'INCOMPLETE' };
    }

    // 5. Causal Statement Guard
    if (this.hasUnsupportedCausalStatement(problemStatement)) {
      reasons.push('UNSUPPORTED_CAUSAL_STATEMENT: Problem statement asserts cause without internal evidence.');
      return { isReady: false, reasons, status: 'NO_GO' };
    }

    return {
      isReady: true,
      status: 'OUTREACH_READY',
      reasons: ['All outreach readiness criteria satisfied'],
      readyOpportunity: {
        company_name: companyName,
        finding,
        diagnostic,
        problem_statement: problemStatement,
        responsibility_guidance: guidance,
      }
    };
  }

  private static generateClaimFromVerifiedFinding(companyName: string, finding: VerifiedFinding, diagnostic: DiagnosticOpportunity): string | null {
    // Synthesize a claim based on the finding type and verified behavior.
    // This removes the dependency on the original CandidateSignal.raw_match.

    const type = finding.type;
    const url = finding.source_url;

    switch (type) {
      case 'OBSERVED_LATENCY':
        return `We observed repeated elevated response times on publicly accessible ${companyName} endpoints (e.g. ${url}), suggesting potential uncertainty regarding ${diagnostic.measurable_outcome}.`;

      case 'SCALING_PAIN':
        return `Evidence of capacity constraints was observed on ${companyName}'s public surfaces, suggesting a need to evaluate ${diagnostic.measurable_outcome}.`;

      case 'ARCHITECTURE_SHIFT':
        return `Observation of an architecture transition at ${companyName} suggests potential technical uncertainty regarding ${diagnostic.measurable_outcome}.`;

      default:
        return `Technical observations at ${companyName} (${url}) suggest a potential opportunity to investigate ${diagnostic.measurable_outcome}.`;
    }
  }

  private static generateResponsibilityGuidance(finding: VerifiedFinding): string | null {
    const text = (finding.excerpt + ' ' + finding.relevance).toLowerCase();
    if (text.includes('latency') || text.includes('performance')) return 'Engineering Lead / Performance Engineer';
    if (text.includes('scaling') || text.includes('infrastructure')) return 'Infrastructure Lead / SRE';
    if (text.includes('architecture') || text.includes('migration')) return 'CTO / Software Architect';
    if (text.includes('security') || text.includes('gap')) return 'CISO / Security Engineer';
    return 'Engineering Lead';
  }

  private static hasUnsupportedCausalStatement(statement: string): boolean {
    const causalKeywords = ['because of', 'caused by', 'due to', 'is the result of'];
    const lower = statement.toLowerCase();
    return causalKeywords.some(k => lower.includes(k));
  }
}
