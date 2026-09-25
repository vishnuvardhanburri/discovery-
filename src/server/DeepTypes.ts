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
  Evidence, EvidenceClaim, FindingClassification,
  OwnerCandidate, CompanySurface, DiscoveredPage, IntelligenceCase
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
  | 'PROFESSIONAL_PROFILE'   // public LinkedIn / Twitter / GitHub profile link
  | 'PROFESSIONAL_EMAIL'     // public mailto: or directory email
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
export type IcpOverall = 'PASS' | 'RESEARCH_MORE' | 'NO_GO';

export interface IcpQualification {
  overall: IcpOverall;
  fit: IcpFit;
  dimensions: IcpDimension[];
  reasons: string[];
  /** The single strict gate, if any, that blocked a PASS. */
  gated_reason?: string;
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

export type DeepDecision = 'READY' | 'RESEARCH_MORE' | 'NO_GO';
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
}

/** Minimal interface the builder relies on from the live provider. */
export interface PublicObservationProviderLike {
  observePublicSurface(url: string, options?: { timeoutMs?: number; headers?: Record<string, string> }): Promise<{ evidence: Evidence[]; discovery_errors: number }>;
}

export interface DeepBuilderResult {
  prospect: DeepProspect;
  case_ref?: IntelligenceCase;
}
