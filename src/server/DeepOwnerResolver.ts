/**
 * XAVIRA — DEEP OWNER RESOLVER (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the "owner graph": a responsibility link between the technical finding
 * (subsystem / topic) and an evidence-backed public person.
 *
 * It REUSES OwnerSelector (which in turn builds the evidence string that
 * IntelligenceEngine.identifyTechnicalOwner treats as explicit public listing).
 * The DeepOwner is a richer, provenance-preserving representation: it keeps the
 * verbatim candidate evidence, the responsibility match, and the confidence.
 */

import type { DeepOwner, OwnerConfidence, DeepStage } from './DeepTypes';
import type { OwnerCandidate, FindingClassification, Evidence } from './IntelligenceCase';
import { OwnerSelector } from './OwnerSelector';

/** Derive the responsibility area ("subsystem") from the finding + evidence. */
export function subsystemFromFinding(
  classification: FindingClassification | null,
  resolvedEvidence: Evidence[]
): string {
  const ft = classification?.finding_type || '';
  if (ft === 'OBSERVED_AVAILABILITY_ISSUE' || ft === 'REPEATED_ERRORS' || ft === 'OBSERVED_LATENCY') return 'availability & performance';
  if (ft.startsWith('DOCUMENTED_INCIDENT')) return 'reliability & observability';
  if (ft === 'POSSIBLE_PUBLIC_EXPOSURE' || ft === 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE' || ft === 'POSSIBLE_INFORMATION_DISCLOSURE') return 'public API surface';
  if (resolvedEvidence.some(e => (e.sensitive_fields || []).some(f => /security|token|credential|key/i.test(f)))) return 'security & auth';
  if (ft.startsWith('DOCUMENTED_SCALING_CONSTRAINT') || ft === 'DOCUMENTED_ENGINEERING_FAILURE') return 'platform engineering';
  return 'platform engineering';
}

export class DeepOwnerResolver {
  static resolve(
    candidates: OwnerCandidate[],
    technicalArea: string,
    classification: FindingClassification | null,
    resolvedEvidence: Evidence[],
    onProgress?: (stage: DeepStage, message: string) => void
  ): DeepOwner | null {
    const sel = OwnerSelector.select(candidates, technicalArea);
    onProgress?.('owners', `Owner graph resolved: ${sel.candidate ? sel.candidate.name : '(no evidence-backed owner)'} — ${sel.reason}`);

    if (!sel.candidate) {
      return null;
    }

    const candidate = sel.candidate;
    const responsibility = candidate.relationship_to_area || `Role '${candidate.role}' covers ${technicalArea}.`;
    const subsystem = subsystemFromFinding(classification, resolvedEvidence) || technicalArea || 'platform engineering';

    const confidence: OwnerConfidence = (candidate.confidence as OwnerConfidence) || 'LOW';

    return {
      name: candidate.name,
      role: candidate.role,
      company: candidate.company,
      source_urls: candidate.source_urls,
      owner_evidence: candidate.evidence.length
        ? candidate.evidence
        : [sel.ownerEvidenceString],
      responsibility_match: responsibility,
      confidence,
      finding_link: subsystem
    };
  }
}
