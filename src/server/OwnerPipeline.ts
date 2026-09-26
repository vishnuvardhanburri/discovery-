/**
 * XAVIRA — OWNER PIPELINE (orchestrator integration)
 * ─────────────────────────────────────────────────────────────────────────────
 * Owner resolution topology (provider-agnostic — spec §1, §7):
 *
 *   Finding → responsibility profile
 *          ↓
 *   PersonDiscoveryEngine candidates (ANY provider + public source graph)
 *          ↓
 *   technical responsibility profile → role relevance → company match
 *          ↓
 *   explicit evidence → HIGH-only gate (DeepOwnerResolver)
 *
 * No provider is inherently primary. PersonDiscoveryEngine (via
 * PersonDiscoveryEngine.discover) collects candidates from:
 *   - Provider data (Growjo / CSV / licensed — whichever carry people)
 *   - Public professional pages (PeopleExtractor on ALL page categories)
 *   - GitHub identities (company-linked repos)
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
  GROWJO: 'GROWJO_IDENTITY',
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
  /** Additional provider companies (from CSV, PublicDataset, etc.) — optional. */
  providerCompanies?: ProviderCompanyLike[] | null;
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
 * Build provider-derived owner candidates (Growjo, CSV, PublicDataset, etc.).
 * A candidate is produced ONLY when identity + role-match + company-identity
 * all hold (explicit, licensed evidence). Providers that carry no person
 * data naturally produce zero candidates — no owners are invented.
 */
function buildFromProviderData(
  data: ProviderCompanyLike,
  technicalArea: string,
  targetDomain: string | null,
  targetCompany: string,
  evidenceTag: string,
  onProgress?: (stage: DeepStage, message: string) => void
): OwnerCandidate[] {
  const candidates: OwnerCandidate[] = [];
  const p = { name: data.primary_person_name, title: data.primary_title };
  const label = data.source || 'provider';
  if (!p.name) {
    onProgress?.('people', `  [${label}] no person name in record (not an owner candidate).`);
    return candidates;
  }
  // Role match
  if (!isTechnicalRole(p.title)) {
    onProgress?.('people', `  [${label}] ${p.name} — skipped (role "${p.title || ''}" is not a technical owner role; not a candidate).`);
    return candidates;
  }
  // Company identity match (domain, then name fallback)
  const domainOk = domainMatch(data.domain, targetDomain) || domainMatch(data.domain, targetDomain);
  const companyOk = domainOk || companyIdentityMatch(data.company, targetCompany);
  if (!companyOk) {
    onProgress?.('people', `  [${label}] ${p.name} — skipped (company identity mismatch; not a candidate, not invented).`);
    return candidates;
  }

  const src = data.growjo_url || data.source_url || '';
  const evidence = `${evidenceTag}: ${p.name} is listed as ${p.title} on ${src || `(${label} record)`}`;
  candidates.push({
    name: p.name,
    role: p.title || 'Technical role',
    company: data.company || targetCompany,
    source_urls: src ? [src] : [],
    evidence: [evidence],
    relationship_to_area: `Role '${p.title}' covers ${technicalArea}.`,
    confidence: 'HIGH',
    explicit_evidence: true,
  });
  onProgress?.('people', `  [${label}] ${p.name} — ${p.title} (HIGH, ${evidenceTag})`);
  return candidates;
}

interface ProviderCompanyLike {
  source: string;
  company: string;
  domain: string | null;
  primary_person_name: string | null;
  primary_title: string | null;
  growjo_url: string | null;
  source_url: string | null;
}

/**
 * Merge provider-derived candidates with public candidates.
 * Both are treated as PRIMARY candidate sources (spec §3 — no single provider
 * is required). Candidates from different sources referring to the same real
 * person (matched by canonical name + shared source URL or role) are merged,
 * preserving all provenance tags.
 */
function mergeCandidates(
  providerCandidates: OwnerCandidate[],
  publicCandidates: OwnerCandidate[],
  onProgress?: (stage: DeepStage, message: string) => void
): OwnerCandidate[] {
  const merged: OwnerCandidate[] = [];
  const byName = new Map<string, number>();

  for (const c of providerCandidates) {
    const key = canonicalName(c.name);
    const idx = byName.get(key);
    if (idx !== undefined) {
      // Same person already present — merge evidence.
      const existing = merged[idx];
      existing.evidence = Array.from(new Set([...existing.evidence, ...c.evidence]));
      existing.source_urls = Array.from(new Set([...existing.source_urls, ...c.source_urls]));
      existing.explicit_evidence = existing.explicit_evidence || c.explicit_evidence;
      onProgress?.('people', `  [dedupe] ${existing.name} — merged candidate from multiple provider sources.`);
    } else {
      byName.set(key, merged.length);
      merged.push(c);
    }
  }

  for (const pub of publicCandidates) {
    const idx = byName.get(canonicalName(pub.name));
    if (idx !== undefined) {
      // Corroboration: same real person on an official/public source.
      const existing = merged[idx];
      existing.evidence = Array.from(new Set([...existing.evidence, ...pub.evidence]));
      existing.source_urls = Array.from(new Set([...existing.source_urls, ...pub.source_urls]));
      existing.explicit_evidence = existing.explicit_evidence || pub.explicit_evidence;
      onProgress?.('people', `  [corroborate] ${existing.name} — public listing corroborates provider identity.`);
    } else {
      // Public candidate is a PRIMARY candidate (not just corroboration).
      // When no provider data exists, public candidates are the sole source.
      byName.set(canonicalName(pub.name), merged.length);
      merged.push(pub);
    }
  }
  return merged;
}

export class OwnerPipeline {
  /**
   * Resolve the technical owner using person-discovery candidates as the
   * unified candidate pool. The HIGH-only gate is delegated to
   * DeepOwnerResolver (unchanged) — this method never promotes LOW/MEDIUM
   * and never invents owners.
   *
   * PersonDiscoveryEngine already processed all provider data + public pages,
   * so `publicCandidates` here is the FULL candidate pool (provider-agnostic).
   * For backward compatibility, `growjoData` and `providerCompanies` can still
   * be passed — they are processed in waterfall order and deduped against
   * public candidates by canonical name.
   */
  static resolve(input: OwnerPipelineInput): OwnerPipelineResult {
    const {
      company, targetDomain, technicalArea, classification, resolvedEvidence,
      growjoData, providerCompanies, publicCandidates, onProgress,
    } = input;

    // 1) responsibility profile from the finding
    const subsystem = subsystemFromFinding(classification, resolvedEvidence);
    const area = technicalArea || subsystem || 'platform engineering';
    onProgress?.('owners', `Responsibility profile: ${area} (subsystem: ${subsystem || 'n/a'}).`);

    // 2-3) Provider people PRIMARY (role match + company identity match).
    //      Growjo remains the PRIMARY source; other provider companies
    //      (CSV, PublicDataset, etc.) are checked in waterfall order.
    let providerCandidates: OwnerCandidate[] = [];

    if (growjoData) {
      const extracted = GrowjoProvider.extractContacts(growjoData);
      const contact: ProviderCompanyLike = {
        source: 'GROWJO',
        company: extracted.company,
        domain: extracted.domain,
        primary_person_name: extracted.person.name,
        primary_title: extracted.person.title,
        growjo_url: growjoData.growjo_url,
        source_url: growjoData.source_url,
      };
      providerCandidates.push(...buildFromProviderData(contact, area, targetDomain, company, EVID_TAGS.GROWJO, onProgress));
    }

    if (providerCompanies) {
      for (const pc of providerCompanies) {
        if (pc.source === 'GROWJO') continue; // already processed above
        providerCandidates.push(...buildFromProviderData(pc, area, targetDomain, company, EVID_TAGS.OFFICIAL_COMPANY, onProgress));
      }
    }

    // 4) public candidates (primary — spec §3: autonomous discovery independent
    //    of any provider). PersonDiscoveryEngine already merged provider data
    //    and public-page candidates into this pool, but for backward compat
    //    growjoData/providerCompanies are also processed above.
    const publicSelected = publicCandidates.length > 0;
    onProgress?.('owners', `Candidates from person discovery (provider-agnostic): ${publicCandidates.length}.`);

    // 5) merge provider (primary) + public (also primary); dedupe by canonical name
    const merged = mergeCandidates(providerCandidates, publicCandidates, onProgress);

    // 6) select best + HIGH-only resolve (gate NOT weakened)
    const sel = merged.length > 0
      ? OwnerSelector.select(merged, area)
      : { candidate: null, ownerEvidenceString: '', reason: 'No publicly listed persons found.' };
    const selected = merged.length > 0
      ? DeepOwnerResolver.resolve(merged, area, classification, resolvedEvidence, onProgress)
      : null;

    // 7) provenance: primary layer that produced the selected owner.
    // PersonDiscoveryEngine tags evidence with GROWJO_IDENTITY or
    // OFFICIAL_COMPANY_SOURCE; public-page candidates carry OFFICIAL_COMPANY_SOURCE.
    let provenance: OwnerProvenance = 'XAVIRA_INFERENCE';
    if (selected && sel.candidate) {
      const ev = sel.candidate.evidence.join('\n');
      if (ev.startsWith(`GROWJO_IDENTITY`)) provenance = 'GROWJO_SOURCE';
      else if (ev.startsWith(`OFFICIAL_COMPANY_SOURCE`)) provenance = 'OFFICIAL_COMPANY_SOURCE';
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
