/**
 * XAVIRA — OUTREACH CLAIM VALIDATOR
 * ─────────────────────────────────────────────────────────────────────────────
 * The absolute hard gate for outreach. Evaluates every assertion in the
 * generated email against the ClaimLedger and EvidencePool.
 */

import {
  OutreachPackage,
  OutreachValidationResult,
  OutreachValidationStatus,
  OutreachClaim
} from './DeepTypes';
import { ClaimLedger } from './ClaimLedger';

export class OutreachClaimValidator {
  static validate(body: string, ledger: ClaimLedger): {
    status: 'QA_PASSED' | 'QA_FAILED',
    results: OutreachValidationResult[],
    blocked_reason?: string
  } {
    const sentences = body.split(/[.!?]\s+/);
    const validationResults: OutreachValidationResult[] = [];
    let isBlocked = false;

    for (const sentence of sentences) {
      if (sentence.trim().length === 0) continue;
      if (sentence.includes('Vishnu') || sentence.includes('Best,')) continue; // Skip signatures

      // Attempt to find a matching claim in the ledger
      const matchingClaim = ledger.getAllClaims().find(c =>
        sentence.toLowerCase().includes(c.text.toLowerCase()) ||
        c.text.toLowerCase().includes(sentence.toLowerCase())
      );

      if (!matchingClaim) {
        // Sentence is a factual claim but not in the ledger -> BLOCK
        if (this.isFactualAssertion(sentence)) {
          validationResults.push({
            sentence,
            claim_id: 'NONE',
            status: 'UNSUPPORTED',
            reason: 'Factual claim found in prose but missing from ClaimLedger.'
          });
          isBlocked = true;
        } else {
          // Generic filler or greeting
          validationResults.push({
            sentence,
            claim_id: 'GENERIC',
            status: 'SUPPORTED',
            reason: 'Non-factual filler/greeting.'
          });
        }
      } else {
        // Claim exists, check its provenance
        if (matchingClaim.type === 'UNSUPPORTED_ASSUMPTION' || !matchingClaim.allowed_in_email) {
          validationResults.push({
            sentence,
            claim_id: matchingClaim.claim_id,
            status: 'UNSUPPORTED',
            reason: 'Claim is marked as unsupported assumption.'
          });
          isBlocked = true;
        } else {
          validationResults.push({
            sentence,
            claim_id: matchingClaim.claim_id,
            status: matchingClaim.type === 'XAVIRA_INFERENCE' ? 'INFERENCE' : 'SUPPORTED',
            evidence_id: matchingClaim.supporting_evidence_ids[0],
            reason: 'Backed by evidence.'
          });
        }
      }
    }

    return {
      status: isBlocked ? 'QA_FAILED' : 'QA_PASSED',
      results: validationResults,
      blocked_reason: isBlocked ? 'One or more unsupported factual claims found in prose.' : undefined
    };
  }

  private static isFactualAssertion(sentence: string): boolean {
    const factualKeywords = [
      'noticed', 'saw', 'observed', 'shows', 'indicates', 'documented',
      'found', 'using', 'version', 'endpoint', 'configured', 'exposed'
    ];
    const s = sentence.toLowerCase();
    return factualKeywords.some(k => s.includes(k));
  }
}
