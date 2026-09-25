export type EvidenceLevel = 'CONFIRMED' | 'SUPPORTED' | 'HYPOTHESIS' | 'UNKNOWN';
export type FitStatus = 'FIT' | 'NOT_FIT';
export type ProspectDecision = 'GO' | 'RESEARCH_MORE' | 'NO_GO';
export type StrengthLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'NOT_APPLICABLE';
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type EvidenceOrigin = 'MOCK_TEST' | 'REAL_PUBLIC_OBSERVATION' | 'DOCUMENTED_SOURCE';
export type EngineMode = 'TEST' | 'PRODUCTION';

export type FindingType =
  | 'POSSIBLE_PUBLIC_EXPOSURE'
  | 'POSSIBLE_INFORMATION_DISCLOSURE'
  | 'POSSIBLE_ACCESS_ISSUE'
  | 'POSSIBLE_EXPOSED_CONFIGURATION'
  | 'POSSIBLE_PUBLIC_RESOURCE'
  | 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE'
  | 'OBSERVED_LATENCY'
  | 'REPEATED_ERRORS'
  | 'OBSERVED_AVAILABILITY_ISSUE'
  | 'UNEXPECTED_PUBLIC_BEHAVIOR'
  | 'DOCUMENTED_ENGINEERING_FAILURE'
  | 'DOCUMENTED_INCIDENT'
  | 'DOCUMENTED_SCALING_CONSTRAINT'
  | 'GENERIC_ENGINEERING_ARTICLE'
  | 'CONFLICTING_EVIDENCE'; 

export interface Evidence {
  id: string;
  evidence_origin: EvidenceOrigin;
  public_url: string;
  source_type: 'API_ENDPOINT' | 'PUBLIC_DOCUMENTATION' | 'ENGINEERING_BLOG' | 'UNKNOWN';
  method?: string;
  status?: number;
  observed_behavior: string;
  observed_fields?: string[];
  unexpected_fields?: string[];
  sensitive_fields?: string[];
  http_status_class?: string;
  reproductions: number;
  repeatable: boolean;
  tested_without_auth: boolean;
  not_tested: string[];
  retrieved_at: string;
  evidence_text: string;
  owner_source_link?: string; 
  latency_ms?: number;
  latency_samples?: number[];
  baseline_latency_ms?: number;
}

export interface ObservationOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface ObservationResult {
  evidence: Evidence[];
  discovery_errors: number;
}

export interface PublicObservationProvider {
  observePublicSurface(
    url: string,
    options?: ObservationOptions
  ): Promise<ObservationResult>;
}

/** Minimal injective fetcher shape used by XAVIRA's read-only probes. */
export type HttpFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal }
) => Promise<Response>;

export interface FindingClassification {
  finding_type: FindingType;
  impact_severity: SeverityLevel;
  severity_basis: string;
}

export interface TechnicalThesis {
  source_fact: string;
  xavira_observation: string;
  xavira_inference: string;
}

export interface UncertaintyModel {
  what_we_know: string;
  what_we_observed: string;
  what_we_infer: string;
  what_we_do_not_know: string;
}

export interface FindingStrength {
  evidence_strength: StrengthLevel;
  reproducibility: StrengthLevel;
  source_quality: StrengthLevel;
  technical_specificity: StrengthLevel;
  owner_confidence: StrengthLevel;
}

export interface TechnicalOwner {
  name: string;
  role: string;
  owner_source: string;
  owner_evidence: string;
  verified_relevance: string;
  owner_confidence: StrengthLevel;
}

export interface EvidenceClaim {
  text: string;
  evidence_ids: string[];
  claim_type: 'OBSERVATION' | 'REPRODUCTION' | 'DOCUMENTED_FACT' | 'OWNER' | 'SEVERITY' | 'INFERENCE' | 'STANDARD_BLOCK';
}

export interface FindingLedEmail {
  claims: EvidenceClaim[];
  subject: string;
}

export interface IntelligenceCase {
  company: string;
  fit_status: FitStatus;
  evidence: Evidence[];
  resolved_evidence: Evidence[];
  discovery_errors: number;
  finding_classification?: FindingClassification;
  finding_strength?: FindingStrength;
  technical_thesis?: TechnicalThesis;
  uncertainty_model?: UncertaintyModel;
  technical_owner?: TechnicalOwner;
  email_model?: FindingLedEmail;
  contradictions: string[];
  prospect_decision: ProspectDecision;
  subject: string;
  body: string;
  claim_validation: string;
  audit_trail: string[];
  mode: EngineMode;
  /** Optional interactive-operator additions (additive, backward compatible). */
  owner_candidates?: OwnerCandidate[];
  company_surface?: CompanySurface;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * INTERACTIVE OPERATOR EXTENSIONS (additive)
 * These support the interactive terminal operator without altering the core
 * intelligence pipeline semantics above.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Public professional roles that map to a relevant technical owner. */
export const CANDIDATE_ROLES = [
  'CTO', 'CPO',
  'VP Engineering', 'VP of Engineering', 'VP Product',
  'Director of Engineering', 'Director of Platform', 'Director of Infrastructure',
  'Head of Engineering', 'Head of Platform', 'Head of Infrastructure',
  'Head of Security',
  'Platform Engineering Lead', 'Infrastructure Lead', 'SRE Lead',
  'Security Lead', 'Security Engineer',
  'Engineering Manager', 'Staff Engineer', 'Principal Engineer',
  'Technical Founder', 'Co-Founder', 'Co-founder'
] as const;

export type CandidateRole = (typeof CANDIDATE_ROLES)[number] | string;

/**
 * A person discovered on a public company page, with the evidence that backs
 * the assertion that they hold (or held) a technical role relevant to a finding.
 */
export interface OwnerCandidate {
  name: string;
  role: string;
  company: string;
  source_urls: string[];
  evidence: string[];
  relationship_to_area: string;
  confidence: StrengthLevel;
  explicit_evidence: boolean;
}

/** A public page discovered during bounded same-origin crawling. */
export interface DiscoveredPage {
  url: string;
  path: string;
  title?: string;
  status?: number;
  category?: ProfessionalPageCategory;
}

export type ProfessionalPageCategory =
  | 'homepage'
  | 'team_people'
  | 'engineering'
  | 'blog'
  | 'docs'
  | 'security'
  | 'status_ops'
  | 'about'
  | 'hiring'
  | 'other';

/** The public professional surface discovered for a company. */
export interface CompanySurface {
  company: string;
  origin: string;
  homepage: string;
  discovered_pages: DiscoveredPage[];
  page_categories: Record<string, string[]>;
}

/** Progress events emitted while the operator works through a research run. */
export interface OperatorProgress {
  stage: 'company' | 'pages' | 'engineering' | 'people' | 'findings' | 'owner' | 'evidence' | 'email';
  message: string;
  detail?: string;
}
