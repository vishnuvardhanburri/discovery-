/**
 * XAVIRA — CLAIM LEDGER
 * ─────────────────────────────────────────────────────────────────────────────
 * A formal tracking system that maps every assertion in the outreach email
 * to its supporting evidence. This is the source of truth for the Validator.
 */

import { OutreachClaim, ClaimType } from './DeepTypes';

export class ClaimLedger {
  private claims: Map<string, OutreachClaim> = new Map();

  addClaim(claim: OutreachClaim): void {
    this.claims.set(claim.claim_id, claim);
  }

  getClaim(id: string): OutreachClaim | undefined {
    return this.claims.get(id);
  }

  getAllClaims(): OutreachClaim[] {
    return Array.from(this.claims.values());
  }

  /**
   * Verifies if a claim is backed by legitimate provenance.
   */
  verifyProvenance(id: string): boolean {
    const claim = this.getClaim(id);
    if (!claim) return false;

    // UNSUPPORTED_ASSUMPTION must always fail
    if (claim.type === 'UNSUPPORTED_ASSUMPTION') return false;

    // Must have at least one supporting evidence ID
    if (!claim.supporting_evidence_ids || claim.supporting_evidence_ids.length === 0) {
      return false;
    }

    return true;
  }

  clear(): void {
    this.claims.clear();
  }
}
