/**
 * XAVIRA — OWNER PIPELINE (orchestrator integration)
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner resolution topology:
 *
 *   Finding → responsibility profile → Growjo people → role match
 *          → company identity match → public corroboration → confidence
 *
 * Growjo people are the PRIMARY candidate source (licensed identity + role +
 * company record). A Growjo person becomes a candidate ONLY when all three
 * explicit-evidence gates hold:
 *   - identity      : a real person name is present
 *   - role match    : the title maps to a relevant technical role (CANDIDATE_ROLES)
 *   - company match : the Growjo company domain equals the resolved official domain
 *
 * Public candidates (PeopleExtractor on the company's team/people/about pages)
 * provide OPTIONAL corroboration: a same-name public listing strengthens the
 * evidence (and adds OFFICIAL_COMPANY_SOURCE provenance) but is NOT required
 * for HIGH confidence — "the person's name does NOT have to appear on the
 * company's own team page."
 *
 * The HIGH-only gate is enforced by DeepOwnerResolver.resolve (unchanged). This
 * module never promotes LOW/MEDIUM and never invents owners.
 */

import type { DeepOwner, OwnerProvenance, DeepStage, GrowjoCompany, CompanyResolution } from './DeepTypes';
import type { OwnerCandidate, FindingClassification, Evidence } from './IntelligenceCase';
import { GrowjoProvider } from './GrowjoProvider';
import { PeopleExtractor } from './PeopleExtractor';
import { OwnerSelector } from './OwnerSelector';
import { DeepOwnerResolver, subsystemFromFinding } from './DeepOwnerResolver';
import { CANDIDATE_ROLES } from './IntelligenceCase';

/** Technical role keywords (augments CANDIDATE_ROLES for title matching). */
const ROLE_KEYWORDS = [
  ...CANDIDATE_ROLES.map(r => r.toLowerCase()),
  // broader tokens the spec lists
  'cto', 'chief technology officer', 'vp engineering', 'vp of engineering',
  'vp platform', 'director of engineering', 'director of platform',
  'head of engineering', 'head of platform', 'head of infrastructure',
  'platform engineering lead', 'infrastructure lead', 'sre', 'security',
  'developer platform', 'engineering manager', 'staff engineer',
  'principal engineer', 'technical founder', 'co-founder', 'co founder',
  'backend', 'devops', 'infrastructure', 'platform', 'reliability',
];

/** Evidence-provenance tags kept as the first token of an evidence string. */
const EVID_TAGS = {
  GROWJO: 'GROWJO_SOURCE',
  OFFICIAL_COMPANY: 'OFFICIAL_COMPANY_SOURCE',
  PUBLIC_PROFESSIONAL: 'PUBLIC_PROFESSIONAL_SOURCE',
} as const;

export interface OwnerPipelineInput {
  company: string;
  /** Resolved official domain (company identity match target). */
  targetDomain: string | null;
  technicalArea: string;
  classification: FindingClassification | null;
  resolvedEvidence: Evidence[];
  growjoData: GrowjoCompany | null;
  /** Public people-page candidates (already extracted by PeopleExtractor). */
  publicCandidates: OwnerCandidate[];
  onProgress?: (stage: DeepStage, message: string) => void;
}

export interface OwnerPipelineResult {
  /** Merged candidate set (Growjo primary + public corroboration). */
  candidates: OwnerCandidate[];
  /** The HIGH-confidence raw candidate the engine can verify (if any). */
  selectedCandidate: OwnerCandidate | null;
  /** The resolved DeepOwner (HIGH-only) — null if no eligible owner. */
  selected: DeepOwner | null;
  /** Evidence string for IntelligenceEngine (contains "is listed as"). */
  ownerEvidenceString: string;
  /** Selection reason (mirrors OwnerSelector). */
  reason: string;
  /** Primary provenance layer that produced the selected owner. */
  provenance: OwnerProvenance;
}

function canonicalName(name: string): string {
  return (name || '').toLowerCase().replace(/\s+/g, '').replace(/^['"]+|['"]+$/g, '');
}

function domainMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (d: string) => d.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').replace(/:\d+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** True if the title maps to a relevant technical role. */
function isTechnicalRole(title: string | null | undefined): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ROLE_KEYWORDS.some(k => t.includes(k));
}

/** Normalize company identity label for matching (e.g. "Cloudflare, Inc."). */
function companyIdentityMatch(growjoCompany: string | null | undefined, targetCompany: string): boolean {
  if (!growjoCompany) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s*(inc|llc|ltd|co\.?)\s*$/i, '').replace(/\s+/g, ' ').trim();
  const a = norm(growjoCompany);
  const b = norm(targetCompany);
  return a.includes(b) || b.includes(a);
}

/**
 * Build Growjo-derived owner candidates. A candidate is produced ONLY when
 * identity + role-match + company-identity all hold (explicit, licensed evidence).
 */
function buildFromGrowjo(
  growjo: GrowjoContactLike,
  technicalArea: string,
  targetDomain: string | null,
  targetCompany: string,
  onProgress?: (stage: DeepStage, message: string) => void
): OwnerCandidate[] {
  const candidates: OwnerCandidate[] = [];
  const p = growjo.person;
  if (!p.name) {
    onProgress?.('people', '  [growjo] no person name in Growjo record (not an owner candidate).');
    return candidates;
  }
  // Role match
  if (!isTechnicalRole(p.title)) {
    onProgress?.('people', `  [growjo] ${p.name} — skipped (role "${p.title || ''}" is not a technical owner role; not a candidate).`);
    return candidates;
  }
  // Company identity match (domain, then name fallback)
  const domainOk = domainMatch(growjo.domain, targetDomain) || domainMatch(growjo.domain, targetDomain);
  const companyOk = domainOk || companyIdentityMatch(growjo.company, targetCompany);
  if (!companyOk) {
    onProgress?.('people', `  [growjo] ${p.name} — skipped (company identity mismatch; not a candidate, not invented).`);
    return candidates;
  }

  const src = growjo.growjo_url || growjo.source_url || '';
  const evidence = `${EVID_TAGS.GROWJO}: ${p.name} is listed as ${p.title} on ${src || '(growjo record)'}`;
  candidates.push({
    name: p.name,
    role: p.title || 'Technical role',
    company: growjo.company || targetCompany,
    source_urls: src ? [src] : [],
    evidence: [evidence],
    relationship_to_area: `Role '${p.title}' covers ${technicalArea}.`,
    confidence: 'HIGH',
    explicit_evidence: true,
  });
  onProgress?.('people', `  [growjo] ${p.name} — ${p.title} (HIGH, ${EVID_TAGS.GROWJO})`);
  return candidates;
}

/** Lightweight view of the bits of GrowjoContact we need (decouples from A's exports). */
interface GrowjoContactLike {
  company: string;
  domain: string | null;
  person: { name: string | null; title: string | null };
  growjo_url: string | null;
  source_url: string | null;
}

/** Merge Growjo (primary) candidates with public candidates; same-name corroborates. */
function mergeCandidates(
  growjoCandidates: OwnerCandidate[],
  publicCandidates: OwnerCandidate[],
  onProgress?: (stage: DeepStage, message: string) => void
): OwnerCandidate[] {
  const merged: OwnerCandidate[] = [];
  const byName = new Map<string, number>(); // name -> index in merged

  for (const c of growjoCandidates) {
    byName.set(canonicalName(c.name), merged.length);
    merged.push(c);
  }

  for (const pub of publicCandidates) {
    const idx = byName.get(canonicalName(pub.name));
    if (idx !== undefined) {
      // Corroboration: same real person on an official/public source.
      const existing = merged[idx];
      existing.evidence = Array.from(new Set([...existing.evidence, ...pub.evidence]));
      existing.source_urls = Array.from(new Set([...existing.source_urls, ...pub.source_urls]));
      existing.explicit_evidence = existing.explicit_evidence || pub.explicit_evidence;
      onProgress?.('people', `  [corroborate] ${existing.name} — public listing corroborates Growjo identity.`);
    } else {
      byName.set(canonicalName(pub.name), merged.length);
      merged.push(pub);
    }
  }
  return merged;
}

export class OwnerPipeline {
  /**
   * Resolve the technical owner using Growjo as the primary identity source.
   * The HIGH-only gate is delegated to DeepOwnerResolver (unchanged) — this
   * method never promotes LOW/MEDIUM and never invents owners.
   */
  static resolve(input: OwnerPipelineInput): OwnerPipelineResult {
    const {
      company, targetDomain, technicalArea, classification, resolvedEvidence,
      growjoData, publicCandidates, onProgress,
    } = input;

    // 1) responsibility profile from the finding
    const subsystem = subsystemFromFinding(classification, resolvedEvidence);
    const area = technicalArea || subsystem || 'platform engineering';
    onProgress?.('owners', `Responsibility profile: ${area} (subsystem: ${subsystem || 'n/a'}).`);

    // 2-3) Growjo people PRIMARY (role match + company identity match)
    let growjoContact: GrowjoContactLike | null = null;
    if (growjoData) {
      const extracted = GrowjoProvider.extractContacts(growjoData);
      growjoContact = {
        company: extracted.company,
        domain: extracted.domain,
        person: { name: extracted.person.name, title: extracted.person.title },
        growjo_url: growjoData.growjo_url,
        source_url: growjoData.source_url,
      };
    }
    const growjoCandidates = growjoContact ? buildFromGrowjo(growjoContact, area, targetDomain, company, onProgress) : [];

    // 4) public corroboration (optional — does not weaken the gate)
    const publicSelected = publicCandidates.length > 0;
    onProgress?.('owners', `Public candidates from company people pages: ${publicCandidates.length}.`);

    // 5) merge Growjo (primary) + public (corroboration); dedupe by canonical name
    const merged = mergeCandidates(growjoCandidates, publicCandidates, onProgress);

    // 6) select best + HIGH-only resolve (gate NOT weakened)
    const sel = merged.length > 0
      ? OwnerSelector.select(merged, area)
      : { candidate: null, ownerEvidenceString: '', reason: 'No publicly listed persons found.' };
    const selected = merged.length > 0
      ? DeepOwnerResolver.resolve(merged, area, classification, resolvedEvidence, onProgress)
      : null;

    // 7) provenance: primary layer that produced the selected owner.
    // Public candidates arrive pre-filtered to company people/about pages
    // (OFFICIAL_COMPANY_SOURCE); Growjo candidates carry a GROWJO_SOURCE tag.
    let provenance: OwnerProvenance = 'XAVIRA_INFERENCE';
    if (selected && sel.candidate) {
      const ev = sel.candidate.evidence.join('\n');
      if (ev.startsWith(`GROWJO_SOURCE`)) provenance = 'GROWJO_SOURCE';
      else provenance = 'OFFICIAL_COMPANY_SOURCE';
    }

    return {
      candidates: merged,
      selectedCandidate: sel.candidate,
      selected,
      ownerEvidenceString: sel.ownerEvidenceString,
      reason: sel.reason,
      provenance,
    };
  }
}
