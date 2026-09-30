import type { SearchResult } from './SearchCache';
import { SignalType } from './SignalTaxonomy';

export enum SearchFailureReason {
  SEARCH_BLOCKED = 'SEARCH_BLOCKED',
  SEARCH_UNAVAILABLE = 'SEARCH_UNAVAILABLE',
  SEARCH_EMPTY = 'SEARCH_EMPTY',
  SEARCH_RATE_LIMITED = 'SEARCH_RATE_LIMITED',
  SEARCH_PARSE_ERROR = 'SEARCH_PARSE_ERROR'
}

export type EvidenceOrigin =
  | 'MOCK_TEST'
  | 'REAL_PUBLIC_OBSERVATION'
  | 'DOCUMENTED_SOURCE'
  | 'DISCOVERY'
  | 'PASSIVE_RECON'
  | 'HUMAN_TELEMETRY'
  | 'DOCUMENTED_FACT'
  | 'BEHAVIORAL_XRAY'
  | 'MARKET_SIGNAL'
  | 'GROWJO_SOURCE'
  | 'OFFICIAL_COMPANY_SOURCE'
  | 'PUBLIC_PROFESSIONAL_SOURCE';

export type EvidenceLevel = 'L0_DISCOVERY' | 'L1_SIGNAL' | 'L2_ADVISORY' | 'L3_VERIFIED';
export type FitStatus = 'FIT' | 'NOT_FIT';
export type ProspectDecision = 'GO' | 'RESEARCH_MORE' | 'NO_GO';
export type StrengthLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'NOT_APPLICABLE';
export type SignalStrength = 'LOW' | 'MEDIUM' | 'HIGH';
export type SignalSourceType =
  | 'ENGINEERING_ARTICLE'
  | 'TECHNICAL_DOCUMENTATION'
  | 'API_REFERENCE'
  | 'GITHUB'
  | 'SOURCE_CODE'
  | 'STATUS_PAGE'
  | 'SECURITY_PAGE'
  | 'JOB_POSTING'
  | 'PUBLIC_PROFESSIONAL'
  | 'OTHER';
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';
export type SourceState =
  | 'SUCCESS' | 'EMPTY' | 'RATE_LIMITED' | 'UNAVAILABLE'
  | 'BLOCKED_BY_POLICY' | 'DEFERRED' | 'SKIPPED' | 'ERROR';

export type EvidenceClassification =
  | 'SURFACE'    // Infrastructure metadata (robots.txt, sitemaps)
  | 'DOCUMENT'   // Static technical truth (blogs, docs, READMEs)
  | 'DISCUSSION' // Community/Social truth (Issues, Forums, Reddit)
  | 'OBSERVATION'; // Direct behavioral proof (HTTP response, latency)

export interface Provenance {
  source_url: string;
  canonical_url: string;
  source_type: SourceType;
  discovery_mechanism: 'SEARCH' | 'SITEMAP' | 'ROBOTS' | 'HTML_LINK' | 'API_DISCOVERY' | 'GITHUB_WEB_DISCOVERY';
  retrieval_timestamp: string;
  provider: string;
  attribution: string;
  classification: EvidenceClassification;
}

export type EngineMode = 'AUTONOMOUS' | 'INTERACTIVE' | 'HYBRID' | 'PRODUCTION' | 'TEST';

export interface DiscoveryMetrics {
  attempts: number;
  results_count: number;
  new_sources_count: number;
  failure_reasons: string[];
  last_strategy?: string;
}

export type SourceType =
  | 'API_ENDPOINT'
  | 'PUBLIC_DOCUMENTATION'
  | 'ENGINEERING_BLOG'
  | 'GITHUB'
  | 'STATUS_PAGE'
  | 'SECURITY'
  | 'JOB_SOURCE'
  | 'NEWS'
  | 'PUBLIC_PROFESSIONAL'
  | 'SEARCH_RESULT'
  | 'OTHER_PUBLIC_SOURCE'
  | 'JS_BUNDLE'
  | 'TIMING_ANALYSIS'
  | 'COMMIT_SENTIMENT'
  | 'UNKNOWN';

export type EvidenceStrength = 'MICRO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TemporalStatus = 'CURRENT' | 'RECENT' | 'HISTORICAL' | 'UNKNOWN_DATE';

export type EvidenceRelationship = 'SUPPORT' | 'CONTRADICT' | 'CORROBORATE' | 'NEUTRAL';

export interface SignalCandidate {
  id: string;
  type: SignalType;
  source_url: string;
  raw_match: string;
  initial_strength: SignalStrength;
  evidence_ids: string[];
  qualification_gaps: string[];
}

export interface SourceCoverage {
  source_type: SourceType;
  state: SourceState;
  evidence_count: number;
  strongest_signal: EvidenceStrength;
  last_observed_at?: string;
}

export type EvidenceType =
  | 'DIRECT_OBSERVATION'   // Live HTTP response, status code, etc.
  | 'PUBLIC_CODE'          // GitHub commit, README, etc.
  | 'DOCUMENTED_FACT'      // Blog post, documentation
  | 'HUMAN_TELEMETRY'      // LinkedIn, professional profiles
  | 'INFERENCE_SUPPORT'    // Derived from other evidence
  | 'SEARCH_RESULT';       // Initial discovery URL

export interface ScoreBreakdown {
  reliability: number;     // 0-100: Trust in the source
  directness: number;      // 0-100: How directly it proves a claim
  specificity: number;      // 0-100: Technical detail vs generic prose
  freshness: number;       // 0-100: Recency of the observation
  relevance: number;       // 0-100: Alignment with the target persona/pain
  repeatability: number;   // 0-100: Can it be reproduced?
  independence: number;     // 0-100: New info vs echoing existing signals
  total_score?: number;     // Calculated weighted average (0-100)
}

export interface Evidence {
  id: string;
  company_id?: string;
  provenance: Provenance;
  evidence_origin: EvidenceOrigin;
  type?: EvidenceType;
  public_url: string;
  source_type: SourceType;
  source_url?: string;
  source_title?: string
  relationship_type?: any;
  retrieved_at: string;
  raw_observation?: string;
  normalized_observation?: string;
  scoring?: ScoreBreakdown;
  strength?: EvidenceStrength;
  confidence?: number;
  observation_type?: string;
  temporal_status?: TemporalStatus;
  relationship?: EvidenceRelationship;
  scoring_reasons?: Record<string, string>;
  supports?: string[];
  contradicts?: string[];
  method?: string;
  status?: number | null;
  observed_behavior: string;
  observed_fields?: string[];
  sensitive_fields?: string[];
  reproductions: number | null;
  repeatable: boolean | null;
  tested_without_auth: boolean | null;
  not_tested: string[];
  evidence_text: string;
  owner_source_link?: string;
  latency_ms?: number;
  latency_samples?: number[];
  baseline_latency_ms?: number;
  evidenceLevel?: EvidenceLevel;
}

export type ResearchMode = 'FREE_ONLY' | 'NORMAL' | 'PAID_AGGRESSIVE';
export type ProviderCostClass = 'FREE' | 'PAID';

export interface ResearchPolicy {
  mode: ResearchMode;
  allowPaidProviders: boolean;
  costBudget: number;
  freeFallback: boolean;
  paidFallback: boolean;
}

export type ProviderExecutionStatus =
  | 'SUCCESS' | 'EMPTY' | 'RATE_LIMITED' | 'UNAVAILABLE'
  | 'ERROR' | 'BLOCKED_BY_POLICY' | 'DEFERRED' | 'SKIPPED';

export interface ProviderExecutionResult<T> {
  status: ProviderExecutionStatus;
  provider: string;
  observations: T[];
  metadata?: {
    retryAfterMs?: number;
    requestsAttempted?: number;
    sourceCount?: number;
  }
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

export type HttpFetcher = (
  url: string,
  init: { method: string; headers: Record<string, string>; signal: AbortSignal }
) => Promise<Response>;

export type FindingType =
  | 'P0_CRITICAL'
  | 'P1_HIGH'
  | 'P2_MEDIUM'
  | 'P3_LOW'
  | 'UNKNOWN'
  | 'OBSERVED_AVAILABILITY_ISSUE'
  | 'REPEATED_ERRORS'
  | 'OBSERVED_LATENCY'
  | 'POSSIBLE_PUBLIC_EXPOSURE'
  | 'POSSIBLE_SENSITIVE_METADATA_EXPOSURE'
  | 'POSSIBLE_INFORMATION_DISCLOSURE'
  | 'DOCUMENTED_ENGINEERING_FAILURE'
  | 'DOCUMENTED_INCIDENT'
  | 'DOCUMENTED_SCALING_CONSTRAINT'
  | 'DOCUMENTED_SECURITY_POSTURE'
  | 'POSSIBLE_ACCESS_ISSUE'
  | 'GENERIC_ENGINEERING_ARTICLE'
  | 'CONFLICTING_EVIDENCE'
  | 'GITHUB_ACTIVE_ENGINEERING'
  | 'GITHUB_RELEASE_ACTIVITY'
  | 'GITHUB_HIGH_CHANGE_VELOCITY'
  | 'GITHUB_PROJECT_GROWTH'
  | 'GITHUB_MAINTENANCE_ACTIVITY'
  | 'GITHUB_ENGINEERING_CONCENTRATION'
  | 'GITHUB_TECHNOLOGY_CHANGE'
  | 'GITHUB_REPOSITORY_ACTIVITY_DECLINE'
  | 'UNEXPECTED_PUBLIC_BEHAVIOR';

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

export interface ResearchBudgetState {
  requestsUsed: number;
  queriesUsed: number;
  githubObservations: number;
  stoppedEarly: boolean;
  stopReason?: string;
}

export type InvestigationState =
  | 'IDLE'
  | 'DISCOVERING'
  | 'TECHNICAL_CONTEXT_FOUND'
  | 'COMPLEXITY_IDENTIFIED'
  | 'HYPOTHESIS_GENERATED'
  | 'VERIFICATION_REQUIRED'
  | 'VERIFICATION_INCONCLUSIVE'
  | 'VERIFIED_FINDING'
  | 'DIAGNOSTIC_ELIGIBLE'
  | 'OUTREACH_READY'
  | 'NO_ACTIONABLE_SIGNAL'
  | 'VERIFICATION_TARGET_UNAVAILABLE'
  | 'ADVISORY_NOTICE'
  | 'INVESTIGATION_CANDIDATE';

export interface CompanyIntelligenceProfile {
  identity: {
    companyName: string;
    domain: string;
    whatTheyDo: string;
    industry?: string;
  };
  product: {
    services: string[];
    technicalProduct: string;
    customerUseCases: string[];
  };
  technologyFootprint: {
    languages: string[];
    platforms: string[];
    infrastructureClues: string[];
  };
  surfaces: {
    apiDeveloper: string[];
    architectureEngineering: string[];
    statusReliability: string[];
    releasesChangelog: string[];
  };
  engineeringContext: {
    hiringSignals: string[];
    articles: string[];
    publicRepositories: string[];
  };
  operationalSignals: {
    incidentHistory: string[];
    infrastructureSignals: string[];
    liveObservations: string[];
  };
  unknowns: string[];
  researchGaps: string[];
}

export interface ComplexityNode {
  id: string;
  type: 'SERVICE' | 'DATABASE' | 'EXTERNAL_API' | 'USER_INTERFACE' | 'INFRA_COMPONENT';
  label: string;
  complexityScore: number;
  evidenceIds: string[];
  rationale: string;
  entityIds?: string[];
  sourceUrls?: string[];
  supportingEvidenceIds?: string[];
  contradictingEvidenceIds?: string[];
  uncertainty?: string;
  confidence?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface ComplexityEdge {
  from: string;
  to: string;
  relationship: 'DEPENDS_ON' | 'CALLS' | 'WRITES_TO' | 'ORCHESTRATES';
  criticality: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface ComplexityMap {
  nodes: ComplexityNode[];
  edges: ComplexityEdge[];
  bottlenecks: string[];
}

export interface InvestigationHypothesis {
  id: string;
  technicalArea: string;
  claim: string;
  rationale: string;
  evidenceIds: string[];
  supportingSources: string[];
  contradictingSources: string[];
  unknowns: string[];
  verificationTarget: string;
  requiredVerification: string;
  confidence: number;
  status: 'HYPOTHESIS' | 'VERIFIED' | 'REFUTED' | 'INCONCLUSIVE';
}

export interface IntelligenceCase {
  company: string;
  fit_status: FitStatus;
  budget_state?: ResearchBudgetState;
  evidence: Evidence[];
  resolved_evidence?: Evidence[];
  discovery_errors: number;
  finding_classification?: FindingClassification;
  finding_strength?: FindingStrength;
  technical_thesis?: TechnicalThesis;
  uncertainty_model?: UncertaintyModel;
  technical_owner?: TechnicalOwner;
  email_model?: FindingLedEmail;
  contradictions?: string[];
  prospect_decision: ProspectDecision;
  subject?: string;
  body?: string;
  claim_validation?: string;
  audit_trail?: string[];
  mode?: EngineMode;
  discovery_state?: DiscoveryState;
  discovery_metrics?: DiscoveryMetrics;
  owner_candidates?: OwnerCandidate[];
  company_surface?: CompanySurface;
  research_state?: any;
  source_graph?: any;
  research_history?: any[];
  source_coverage_matrix?: SourceCoverage[];
  pressure_classification?: string;
  signals?: any[];
  correlated_groups?: any[];
  opportunity_classification?: string;
  confidence?: {
    evidence_confidence: StrengthLevel;
    technical_confidence: StrengthLevel;
    same_surface_confidence: StrengthLevel;
    outreach_confidence: StrengthLevel;
  };
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH';
  human_review_required?: boolean;
  human_approval_status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_REQUIRED';
  human_review_audit?: any[];
  
  intelligenceProfile?: CompanyIntelligenceProfile;
  complexityMap?: ComplexityMap;
  hypotheses?: InvestigationHypothesis[];
  internalState?: InvestigationState;
}

export type DiscoveryState = 'IDLE' | 'DISCOVERING' | 'FOUND_CANDIDATE' | 'NOT_FOUND';

export const CANDIDATE_ROLES = [
  'CTO', 'CPO', 'CEO',
  'VP Engineering', 'VP of Engineering', 'VP Product',
  'Director of Engineering', 'Director of Platform', 'Director of Infrastructure',
  'Head of Engineering', 'Head of Platform', 'Head of Infrastructure',
  'Head of Security',
  'Platform Engineering Lead', 'Infrastructure Lead', 'SRE Lead',
  'Security Lead', 'Security Engineer',
  'Engineering Manager', 'Staff Engineer', 'Principal Engineer',
  'Technical Founder', 'Founder', 'Co-Founder', 'Co-founder'
] as const;

export type CandidateRole = (typeof CANDIDATE_ROLES)[number] | 'string';

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
  | 'Engineering' | 'blog' | 'docs' | 'security' | 'status_ops' | 'about' | 'hiring' | 'other';

export interface CompanySurface {
  company: string;
  origin: string;
  company_homepage: string;
  discovered_pages: DiscoveredPage[];
  page_categories: Record<string, string[]>;
}

export interface OperatorProgress {
  stage: 'company' | 'pages' | 'engineering' | 'findings' | 'owner' | 'evidence' | 'email';
  message: string;
  detail?: string;
}

export interface ProspectCandidate {
  organization: string;
  domain: string;
  industry?: string;
  publicFootprint: string[];
  signals: SignalType[];
  evidence: Evidence[];
  hypotheses: InvestigationHypothesis[];
  verificationTargets: any[];
  verificationState: InvestigationState;
  diagnosticFit: string;
  provenance: string[];
}
