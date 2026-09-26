/**
 * XAVIRA — DEEP INTELLIGENCE LAYER (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * This module defines the types for the high-precision prospect research operator
 * (`deep` command). It is intentionally additive: it REUSES the existing
 * IntelligenceCase evidence model, FindingClassification, OwnerCandidate, and
 * CompanySurface. It does NOT redefine or replace them.
 *
 * The Deep prospect is a super-structure that layers:
 *   - structured technical signal discovery
 *   - ICP qualification
 *   - contactability (public professional links only)
 *   - an owner graph (finding → subsystem → responsibility → candidate)
 *   - a finding-led email with explicit angles / subjects / uncertainty
 *
 * Evidence IDs are carried through from the underlying IntelligenceCase so the
 * full lineage (observation → finding → owner → email) remains traceable.
 */

import type {
  Evidence, EvidenceClaim, FindingClassification, FindingType,
  OwnerCandidate, CompanySurface, DiscoveredPage, IntelligenceCase,
  SeverityLevel, StrengthLevel, FindingStrength
} from './IntelligenceCase';

// ── Signals ──────────────────────────────────────────────────────────────────

/** Broad bucket of a publicly observable technical artefact. */
export type SignalSourceType =
  | 'ENGINEERING_ARTICLE'
  | 'TECHNICAL_DOCUMENTATION'
  | 'API_REFERENCE'
  | 'SDK_DOCS'
  | 'STATUS_PAGE'
  | 'PUBLIC_INCIDENT'
  | 'SECURITY_PAGE'
  | 'TECHNICAL_HIRING'
  | 'ARCHITECTURE_DISCUSSION'
  | 'BLOG'
  | 'NEWS';

/**
 * Every signal MUST be one of these — categories are never blurred.
 *  - DOCUMENTED_FACT        : explicitly stated on a public company source
 *  - REAL_PUBLIC_OBSERVATION: a public resource we actually fetched/observed
 *  - XAVIRA_INFERENCE       : a conclusion drawn from other public signals
 * An inference is never written as an observed fact.
 */
export type EvidenceProvenance =
  | 'DOCUMENTED_FACT'
  | 'REAL_PUBLIC_OBSERVATION'
  | 'XAVIRA_INFERENCE';

export type SignalStrength = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DeepSignal {
  signal_id: string;
  type: SignalSourceType;
  source_url: string;
  source_title?: string;
  published_at?: string;
  /** Sanitised, length-capped evidence excerpt taken from the public page. */
  excerpt: string;
  provenance: EvidenceProvenance;
  signal_strength: SignalStrength;
  /** Why this signal is relevant to technical outreach for this company. */
  relevance: string;
  /** Evidence IDs from the observation/finding layer this connects to. */
  related_evidence_ids?: string[];
}

// ── Contactability ───────────────────────────────────────────────────────────

export type ContactKind =
  | 'PROFESSIONAL_PROFILE'   // public LinkedIn / Twitter / GitHub profile link (legacy)
  | 'PROFILE'                // generic public professional profile link (non-LinkedIn)
  | 'PROFESSIONAL_EMAIL'     // public mailto: or Growjo licensed professional email
  | 'LINKEDIN'               // public LinkedIn profile link (Growjo or explicit)
  | 'PHONE'                  // publicly listed professional phone number
  | 'PRESS_CONTACT'          // press / media contact
  | 'CONTACT_PAGE';          // a publicly linked contact page

export type ContactConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/** Only information that is PUBLICLY visible or already configured is captured. */
export interface DeepContact {
  type: ContactKind;
  value: string;
  source_url: string;
  confidence: ContactConfidence;
  /** Human readable note describing how the value was observed. */
  note?: string;
}

// ── Owner graph ──────────────────────────────────────────────────────────────

export type OwnerConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Which provenance layer produced an owner (kept separate per spec).
 * - GROWJO_SOURCE            : licensed Growjo lead record (identity + role + company)
 * - OFFICIAL_COMPANY_SOURCE  : person listed on the company's own people/team/about page
 * - PUBLIC_PROFESSIONAL_SOURCE: person on any other public professional surface
 * - REAL_PUBLIC_OBSERVATION  : observed via public crawl (no explicit listing)
 * - DOCUMENTED_FACT          : asserted in a documented public fact (status/incident/etc.)
 * - XAVIRA_INFERENCE         : residual fallback when no explicit person evidence exists
 */
export type OwnerProvenance =
  | 'GROWJO_SOURCE'
  | 'OFFICIAL_COMPANY_SOURCE'
  | 'PUBLIC_PROFESSIONAL_SOURCE'
  | 'REAL_PUBLIC_OBSERVATION'
  | 'DOCUMENTED_FACT'
  | 'XAVIRA_INFERENCE';

/**
 * A person linked, via evidence, to a specific responsibility area of a finding.
 * The engine's TechnicalOwner is preserved in the provenance trail.
 */
export interface DeepOwner {
  name: string;
  role: string;
  company: string;
  source_urls: string[];
  /** Verbatim public evidence backing the ownership claim. */
  owner_evidence: string[];
  /** Which responsibility area of the finding this owner covers. */
  responsibility_match: string;
  confidence: OwnerConfidence;
  /** The subsystem/topic of the finding this owner is responsible for. */
  finding_link?: string;
  /** Primary provenance layer that produced this owner (Growjo is primary). */
  deep_owner_provenance?: OwnerProvenance;
}

// ── ICP qualification ────────────────────────────────────────────────────────

export interface IcpDimension {
  name: string;
  /** 0 = absent, 1 = partial, 2 = strong. */
  score: 0 | 1 | 2;
  /** Public evidence backing the score. */
  evidence: string[];
}

export type IcpFit = 'STRONG' | 'WEAK' | 'POOR';
/** Deep ICP outcome. OUTREACH_READY replaces the prior PASS gate. */
export type IcpOverall = 'OUTREACH_READY' | 'RESEARCH_MORE' | 'NO_GO';

export interface IcpQualification {
  overall: IcpOverall;
  fit: IcpFit;
  dimensions: IcpDimension[];
  reasons: string[];
  /** The single strict gate, if any, that blocked an OUTREACH_READY. */
  gated_reason?: string;
}

// ── Deep finding ─────────────────────────────────────────────────────────────

/**
 * A finding detected by the DEEP layer (supplements the engine's
 * FindingClassification with richer, evidence-attributed metadata). It is always
 * constructed from concrete public evidence — it never infers a problem from
 * generic engineering content.
 */
export interface DeepFinding {
  /** Mirrors FindingClassification so it can drive the engine/ICP gate. */
  finding_type: FindingType;
  impact_severity: SeverityLevel;
  severity_basis: string;
  /** Public evidence backing the finding — IDs preserved end-to-end. */
  evidence_ids: string[];
  source_urls: string[];
  provenance: EvidenceProvenance;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  strength: FindingStrength;
  /** Plain-language explanation of why it qualifies (and what it does NOT claim). */
  explanation: string;
  recommendation: string;
}

// ── Email ────────────────────────────────────────────────────────────────────

export interface DeepEmailDraft {
  primary_subject: string;
  alternate_subject: string;
  body: string;
  /** Claims reused from the engine's FindingLedEmail — evidence IDs preserved. */
  claims: EvidenceClaim[];
  generated: boolean;
  blocked_reason?: string;
}

// ── Dossier / decision ───────────────────────────────────────────────────────

export type DeepDecision = 'OUTREACH_READY' | 'RESEARCH_MORE' | 'NO_GO';
export type DeepConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface DeepProspect {
  company: string;
  domain: string;
  industry: string;
  fit: IcpFit;
  qualification_reasons: string[];
  public_surface: CompanySurface;
  technical_signals: DeepSignal[];
  documented_facts: DeepSignal[];
  public_observations: DeepSignal[];
  inferences: DeepSignal[];
  people: OwnerCandidate[];
  owner_candidates: OwnerCandidate[];
  selected_owner: DeepOwner | null;
  owner_evidence: string[];
  contactability: DeepContact[];
  findings: FindingClassification | null;
  /** Deep-layer finding (supplements `findings` with evidence IDs + provenance). */
  deep_finding: DeepFinding | null;
  evidence: Evidence[];
  primary_angle: string;
  secondary_angle: string | null;
  recommended_subjects: string[];
  email_draft: DeepEmailDraft;
  decision: DeepDecision;
  confidence: DeepConfidence;
  artifact_path: string;
  audit_trail: string[];
  /** Full link to the engine case for end-to-end lineage. */
  case_ref?: IntelligenceCase;
  /** Growjo lead data that seeded this company (provenance-preserved). */
  growjo_data?: GrowjoCompany | null;
  /** Additional provider companies that seeded this company (non-Growjo). */
  provider_data?: ProviderCompanyLike[] | null;
  /** Domain resolution provenance (canonical name, official domain, method, confidence). */
  resolution?: CompanyResolution | null;
  /** GitHub activity discovered on the company's own public pages. */
  github_activity?: GithubRepoMeta[];
  /** Synthesized activity timeline (findings + evidence + GitHub, provenance-tracked). */
  activity_timeline?: ActivityEvent[];
}

// ── Builder I/O ─�────────────────────────────────────────────────────────────

/** Progressive stage events emitted while research runs. */
export type DeepStage =
  | 'company' | 'qualification' | 'surface' | 'engineering'
  | 'signals' | 'people' | 'owners' | 'evidence' | 'findings'
  | 'contactability' | 'email' | 'decision';

export interface DeepBuilderOptions {
  /** Injectable fetcher (defaults to globalThis.fetch in PRODUCTION). */
  fetcher?: (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
  /** Inject a live/mock observation provider; null => LivePublicObservationProvider (real). */
  observationProvider?: PublicObservationProviderLike | null;
  maxDiscoveryPages?: number;
  discoveryDelayMs?: number;
  discoveryTimeoutMs?: number;
  observationDelayMs?: number;
  /** Persist artifact when true; provide a path to write. */
  saveArtifact?: (path: string, data: string) => void;
  /** Progressive stage output (human readable). */
  onProgress?: (stage: DeepStage, message: string) => void;
  /** Optional logger mirroring the operator's discovery diagnostics. */
  logger?: (msg: string) => void;
  artifactsBaseDir?: string;
  /** Growjo lead data that seeded this company (provenance-preserved). */
  growjo?: GrowjoCompany | null;
  /** Additional provider companies (CSV, PublicDataset, etc.) — optional, non-Growjo sources. */
  providerCompanies?: ProviderCompanyLike[] | null;
  /** Pre-resolved canonical domain (from DomainResolver); null if not yet resolved. */
  resolution?: CompanyResolution | null;
}

/** Minimal interface the builder relies on from the live provider. */
export interface PublicObservationProviderLike {
  observePublicSurface(url: string, options?: { timeoutMs?: number; headers?: Record<string, string> }): Promise<{ evidence: Evidence[]; discovery_errors: number }>;
}

// ── Growjo input model ──────────────────────────────────────────────────────

export type GrowjoSource = 'GROWJO';

/**
 * Minimal structural view of a provider company that the OwnerPipeline
 * can accept from ANY provider (Growjo, CSV, PublicDataset, etc.).
 * Every field is checked against the company under research; if no person
 * or domain is available, the role-match gate naturally rejects the candidate
 * — no owners are invented.
 */
export interface ProviderCompanyLike {
  source: string;
  company: string;
  canonical_name: string;
  domain: string | null;
  website: string | null;
  primary_person_name: string | null;
  primary_title: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  linkedin_url: string | null;
  growjo_url: string | null;
  source_url: string | null;
  retrieved_at: string;
}

/**
 * Canonical lead record imported from a Growjo CSV export / licensed API.
 * Every field preserves its provenance: source, source_url, retrieved_at.
 * Numeric estimates are explicitly typed as such — never silently promoted
 * to internal "facts".
 */
export interface GrowjoCompany {
  source: GrowjoSource;
  /** The list/company name exactly as imported. */
  company: string;
  /** Canonical display name (trimmed). */
  canonical_name: string;
  /** Primary domain (may be absent). */
  domain: string | null;
  website: string | null;
  industry: string | null;
  employee_count: number | null;
  employee_growth_pct: number | null;
  funding: number | null;
  funding_currency: string | null;
  revenue: number | null;
  revenue_currency: string | null;
  valuation: number | null;
  valuation_currency: string | null;
  /** A single verified professional contact (if legitimately licensed). */
  primary_person_name: string | null;
  primary_title: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  linkedin_url: string | null;
  growjo_url: string | null;
  source_url: string | null;
  retrieved_at: string;
  /** Original column alias mapping that produced this record. */
  column_mapping: Record<string, string>;
  /** Raw imported row (for audit). */
  raw: Record<string, string>;
}

export interface CompanyResolution {
  canonical_name: string;
  official_domain: string | null;
  /** How the domain was resolved (never guessed). */
  resolution_method: 'GROWJO_DOMAIN' | 'GROWJO_HOMEPAGE_CANONICAL' | 'PUBLIC_REDIRECT' | 'PUBLIC_CANONICAL_LINK' | 'OGP_URL' | 'AMBIGUOUS';
  /** Public source that backs the resolution. */
  resolution_source: string | null;
  resolution_confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface GithubRepoMeta {
  org: string;
  repo: string;
  url: string;
  /** How the link to this repo/org was discovered (a public page on the company domain). */
  discovered_via: string;
  stars: number | null;
  language: string | null;
  description: string | null;
  updated_at: string | null;
}

export type ActivityType =
  | 'TECHNICAL_SIGNAL' | 'PUBLIC_INCIDENT' | 'ENGINEERING_RELEASE'
  | 'SECURITY_UPDATE' | 'STATUS_DEGRADATION' | 'HIRING_FOR_ROLE'
  | 'ARCHITECTURE_CHANGE';

export interface ActivityEvent {
  activity_id: string;
  company_id: string;
  type: ActivityType;
  source_url: string;
  title: string;
  published_at: string | null;
  observed_at: string;
  evidence: string;
  provenance: 'DOCUMENTED_FACT' | 'REAL_PUBLIC_OBSERVATION' | 'XAVIRA_INFERENCE';
  strength: 'LOW' | 'MEDIUM' | 'HIGH';
  related_evidence_ids: string[];
}

// ── Company research queue (persistent state) ────────────────────────────────

export type QueueState =
  | 'QUEUED' | 'RESOLVING' | 'RESEARCHING' | 'RESEARCH_MORE'
  | 'NO_GO' | 'OUTREACH_READY' | 'CONTACT_READY' | 'APPROVED' | 'SENT';

export interface QueuedCompany {
  id: string;
  company: string;
  domain: string | null;
  state: QueueState;
  growjo?: GrowjoCompany | null;
  resolution?: CompanyResolution | null;
  artifact_path: string | null;
  prospect: { decision: DeepDecision; finding: string | null; owner: string | null; confidence: DeepConfidence } | null;
  attempt: number;
  last_error: string | null;
  enqueued_at: string;
  updated_at: string;
}

export interface DeepBuilderResult {
  prospect: DeepProspect;
  case_ref?: IntelligenceCase;
}
