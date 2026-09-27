/**
 * XAVIRA — EVIDENCE PACK BUILDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements the "Smallest Defensible Set" logic.
 * Selects the minimum number of evidence records required to support the
 * primary finding and owner claims without dumping the full research corpus.
 */

import { DeepProspect, EvidencePack, Evidence } from './DeepTypes';

export class EvidencePackBuilder {
  static build(prospect: DeepProspect): EvidencePack {
    const { deep_finding, evidence } = prospect;

    if (!deep_finding) {
      throw new Error('Cannot build evidence pack without a deep finding.');
    }

    // 1. Primary Finding is mandatory
    const primaryFinding = deep_finding;

    // 2. Select Supporting Evidence (The Smallest Defensible Set)
    // Prioritize: REAL_PUBLIC_OBSERVATION -> DOCUMENTED_FACT -> XAVIRA_INFERENCE
    const supporting = evidence
      .filter(ev => !deep_finding.evidence_ids.includes(ev.id)) // Avoid duplication
      .sort((a, b) => {
        const scoreA = this.getEvidencePriority(a);
        const scoreB = this.getEvidencePriority(b);
        return scoreB - scoreA;
      })
      .slice(0, 2); // Normally 1-2 supporting records

    return {
      primary_finding: primaryFinding,
      supporting_evidence: supporting,
      evidence_ids: [...deep_finding.evidence_ids, ...supporting.map(s => s.id)]
    };
  }

  private static getEvidencePriority(ev: Evidence): number {
    let score = 0;
    if (ev.evidence_origin === 'REAL_PUBLIC_OBSERVATION') score += 100;
    if (ev.evidence_origin === 'DOCUMENTED_FACT') score += 50;
    if (ev.evidence_origin === 'XAVIRA_INFERENCE') score += 10;

    // Bonus for high strength
    if (ev.strength === 'HIGH') score += 20;

    return score;
  }
}
