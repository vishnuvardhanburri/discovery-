/**
 * AdaptiveInvestigationEngine — structured telemetry for adaptive investigation
 * within the real XAVIRA execution path.
 *
 * This engine does NOT replace the standard pipeline. It runs AFTER the
 * DeepProspectBuilder has produced a prospect and examines whether boundary
 * observations on the initial surface warrant structured pivot attempts.
 *
 * Every action is recorded as an AdaptiveInvestigationRecord. If no pivot was
 * needed, a single NO_PIVOT_REQUIRED record is emitted.
 */
import { Evidence, IntelligenceCase } from '../server/IntelligenceCase';
import { LivePublicObservationProvider } from '../server/LivePublicObservationProvider';
import { DeepFinding } from '../server/DeepTypes';
import { DeepSignalExtractor } from '../server/DeepSignalExtractor';
import * as fs from 'fs';

/** Boundary classification for an initial observation. */
export type BoundaryClassification =
  | 'OPEN_SURFACE'        /** HTTP 200, no protection observed          */
  | 'WAF_PROTECTED'       /** WAF block page (Cloudflare, Akamai, etc.)  */
  | 'NETWORK_LEVEL_DROP'  /** TCP/connection-level drop, timeout         */
  | 'APP_LAYER_BLOCK'     /** HTTP 4xx block (403/401) from origin       */
  | 'RATE_LIMITED'        /** HTTP 429 — explicitly distinct from EMPTY  */
  | 'EMPTY'               /** Connection succeeded but empty body/0 bytes */
  | 'UNKNOWN';

/** Outcome values for an adaptive investigation record. */
export type AdaptiveOutcome =
  | 'NO_PIVOT_REQUIRED'
  | 'PIVOT_SUGGESTED'
  | 'PIVOT_EXECUTED'
  | 'ALTERNATE_SURFACE_FOUND'
  | 'NEW_EVIDENCE_FOUND'
  | 'NEW_VERIFICATION_TARGET'
  | 'VERIFIED'
  | 'NO_USEFUL_RESULT'
  | 'RESEARCH_MORE'
  | 'INCONCLUSIVE';

/** A single adaptive investigation record — the unit of telemetry. */
export interface AdaptiveInvestigationRecord {
  investigation_id: string;
  organization: string;
  initial_surface: string;
  initial_observation_id: string;
  initial_boundary_classification: BoundaryClassification;
  initial_boundary_evidence_ids: string[];
  /** Why a pivot was suggested (or why it wasn't). */
  pivot_trigger: string;
  /** The specific pivot action taken (or "none"). */
  pivot_action: string;
  pivot_reason: string;
  /** Evidence IDs that motivated the pivot. */
  pivot_source_evidence_ids: string[];
  /** Candidate surfaces considered for the pivot. */
  candidate_public_surfaces: string[];
  /** Surfaces actually discovered/observed during the pivot. */
  discovered_public_surfaces: string[];
  /** Surfaces considered but rejected. */
  rejected_surfaces: string[];
  /** Why each rejected surface was rejected. */
  rejection_reasons: string[];
  /** New evidence record IDs produced by the pivot. */
  new_evidence_ids: string[];
  /** New verification target IDs (if any). */
  new_target_ids: string[];
  verification_attempted: boolean;
  verification_result: string;
  final_decision: string;
  outcome: AdaptiveOutcome;
  /** Confidence that the pivot genuinely contributed (not inferred). */
  attribution_confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  started_at: string;
  completed_at: string;
}

/** Aggregate telemetry for a company. */
export interface AdaptiveInvestigationAggregate {
  boundary_observations: number;
  pivots_suggested: number;
  pivots_executed: number;
  alternate_surfaces_found: number;
  new_evidence_found: number;
  new_verification_targets: number;
  verified_from_adaptive_path: number;
  no_useful_result: number;
}

/** Result of running adaptive investigation for a single company. */
export interface AdaptiveInvestigationResult {
  attempted: boolean;
  records: AdaptiveInvestigationRecord[];
  aggregate: AdaptiveInvestigationAggregate;
}

/** Options for the adaptive investigation engine. */
export interface AdaptiveInvestigationOptions {
  fetcher?: (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
  maxPivots?: number;
  maxPivotRequests?: number;
  delayMs?: number;
  onProgress?: (stage: string, message: string) => void;
}

/**
 * Classify a boundary observation from an evidence record.
 * Never infers infrastructure — uses only HTTP status + observed behavior.
 */
export function classifyBoundary(ev: Evidence): BoundaryClassification {
  if (!ev) return 'UNKNOWN';
  const status = ev.status;

  // WAF protection: check for known WAF block signatures in observed_behavior
  const behavior = (ev.observed_behavior || '').toLowerCase();
  if (
    behavior.includes('waf') ||
    behavior.includes('cloudflare') ||
    behavior.includes('akamai') ||
    behavior.includes('challenge') ||
    behavior.includes('access denied') ||
    behavior.includes('security policy') ||
    behavior.includes('captcha') ||
    status === 403
  ) {
    if (status === 403 && (behavior.includes('waf') || behavior.includes('cloudflare') || behavior.includes('akamai') || behavior.includes('challenge'))) {
      return 'WAF_PROTECTED';
    }
    return 'APP_LAYER_BLOCK';
  }

  if (status === 429) return 'RATE_LIMITED';
  if (status === 200 || status === 301 || status === 302) return 'OPEN_SURFACE';
  if (status === 0 || status === -1) return 'NETWORK_LEVEL_DROP';
  if (behavior.includes('aborted') || behavior.includes('timeout') || behavior.includes('fetch failed')) {
    return 'NETWORK_LEVEL_DROP';
  }

  // Empty body / no content
  const hasBody = ev.evidence_text && ev.evidence_text.length > 0;
  if ((status ?? 0) >= 200 && !hasBody) return 'EMPTY';

  return 'UNKNOWN';
}

/**
 * Check if a hostname is on the same root domain as the target (prevents
 * following links to unrelated external domains).
 */
function isSameRootDomain(hostname: string, rootDomain: string): boolean {
  return hostname === rootDomain || hostname.endsWith('.' + rootDomain);
}

/**
 * Extract root domain from a hostname.
 */
function extractRootDomain(hostname: string): string {
  let h = hostname.replace(/^www\./, '');
  const parts = h.split('.');
  if (parts.length >= 3) {
    h = parts.slice(-2).join('.');
  }
  return h;
}

/**
 * Extract hostnames from HTML (links, canonical, scripts, JSON-LD, body).
 * Returns only same-root-domain hostnames.
 */
function extractHostnamesFromHtml(html: string, baseUrl: string, rootDomain: string): string[] {
  const found = new Set<string>();
  if (!html) return [];

  const addHost = (raw: string) => {
    try {
      const host = new URL(raw, baseUrl).hostname;
      if (isSameRootDomain(host, rootDomain) && host !== rootDomain && !host.startsWith('www.')) {
        found.add(host);
      }
    } catch {}
  };

  // <a href>
  let m;
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=["']([^"']+)["']/gi;
  while ((m = linkRegex.exec(html)) !== null) addHost(m[1]);

  // <link rel="canonical">
  const canonRegex = /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/gi;
  while ((m = canonRegex.exec(html)) !== null) addHost(m[1]);

  // <script src> / <link href>
  const assetRegex = /<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/gi;
  while ((m = assetRegex.exec(html)) !== null) addHost(m[1]);

  // JSON-LD "url"
  const jsonLdRegex = /"url"\s*:\s*"(https?:\/\/[^"]+)"/gi;
  while ((m = jsonLdRegex.exec(html)) !== null) addHost(m[1]);

  // Raw hostnames in text
  const hostRegex = /https?:\/\/([a-z0-9][a-z0-9-]*[a-z0-9](\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,})\//gi;
  while ((m = hostRegex.exec(html)) !== null) addHost(m[1]);

  return [...found];
}

/**
 * The Adaptive Investigation Engine.
 *
 * Wraps the standard pipeline result and, when boundary observations exist,
 * attempts evidence-backed pivots to alternate public surfaces.
 */
export class AdaptiveInvestigationEngine {
  private readonly fetcher?: (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
  private readonly maxPivots: number;
  private readonly maxPivotRequests: number;
  private readonly delayMs: number;
  private readonly onProgress?: (stage: string, message: string) => void;

  constructor(options: AdaptiveInvestigationOptions = {}) {
    this.fetcher = options.fetcher;
    this.maxPivots = options.maxPivots ?? 5;
    this.maxPivotRequests = options.maxPivotRequests ?? 15;
    this.delayMs = options.delayMs ?? 200;
    this.onProgress = options.onProgress;
  }

  /**
   * Run adaptive investigation on a completed prospect.
   *
   * Examines the initial surface evidence for boundary observations and, when
   * triggered, attempts pivots to alternate public surfaces discovered from
   * the initial page's HTML (links, canonical, JSON-LD, script/src, etc.).
   */
  async investigate(
    organization: string,
    initialUrl: string,
    evidence: Evidence[],
    existingSubdomains: string[]
  ): Promise<AdaptiveInvestigationResult> {
    const records: AdaptiveInvestigationRecord[] = [];
    const now = () => new Date().toISOString();
    const startedAt = now();

    // Classify the initial surface boundary
    const initialEv = evidence.find(e => e.public_url === initialUrl || e.public_url === initialUrl.replace(/\/$/, ''))
      || evidence[0] || null;

    const boundaryClass = initialEv ? classifyBoundary(initialEv) : 'UNKNOWN';
    const initialEvidenceIds = evidence
      .filter(e => e.public_url === initialUrl || e.public_url === initialUrl.replace(/\/$/, ''))
      .map(e => e.id);

    // Determine if a pivot is suggested
    const pivotTriggers: string[] = [];
    if (initialEv) {
      if (boundaryClass === 'WAF_PROTECTED') {
        pivotTriggers.push('WAF protection detected on initial surface');
      }
      if (boundaryClass === 'APP_LAYER_BLOCK') {
        pivotTriggers.push('HTTP 4xx block on initial surface');
      }
      if (boundaryClass === 'RATE_LIMITED') {
        pivotTriggers.push('Initial surface rate-limited (HTTP 429)');
      }
      if (boundaryClass === 'NETWORK_LEVEL_DROP') {
        pivotTriggers.push('Network-level drop on initial surface');
      }
      if (boundaryClass === 'EMPTY') {
        pivotTriggers.push('Initial surface returned empty response');
      }
      if (evidence.length < 5) {
        pivotTriggers.push('Insufficient evidence from initial surface (<5 records)');
      }
    } else {
      pivotTriggers.push('No evidence from initial surface');
    }

    const shouldPivot = pivotTriggers.length > 0 || (initialEv && boundaryClass !== 'OPEN_SURFACE');

    if (!shouldPivot) {
      records.push({
        investigation_id: `${organization}_adaptive_no_pivot`,
        organization,
        initial_surface: initialUrl,
        initial_observation_id: initialEv?.id || 'none',
        initial_boundary_classification: boundaryClass,
        initial_boundary_evidence_ids: initialEvidenceIds,
        pivot_trigger: 'Initial surface is OPEN_SURFACE with sufficient evidence — no pivot required.',
        pivot_action: 'none',
        pivot_reason: 'no_pivot_required',
        pivot_source_evidence_ids: [],
        candidate_public_surfaces: [],
        discovered_public_surfaces: [],
        rejected_surfaces: [],
        rejection_reasons: [],
        new_evidence_ids: [],
        new_target_ids: [],
        verification_attempted: false,
        verification_result: 'not_applicable',
        final_decision: 'inherited_from_baseline',
        outcome: 'NO_PIVOT_REQUIRED',
        attribution_confidence: 'HIGH',
        started_at: startedAt,
        completed_at: now(),
      });

      return {
        attempted: true,
        records,
        aggregate: {
          boundary_observations: 1,
          pivots_suggested: 0,
          pivots_executed: 0,
          alternate_surfaces_found: 0,
          new_evidence_found: 0,
          new_verification_targets: 0,
          verified_from_adaptive_path: 0,
          no_useful_result: 0,
        },
      };
    }

    // Pivot is suggested — now attempt to find alternate surfaces
    const trigger = pivotTriggers.join('; ');
    const rootDomain = extractRootDomain(new URL(initialUrl).hostname);

    // Extract candidate hostnames from existing evidence (HTML responses)
    const candidateHostnames = new Set<string>();
    for (const ev of evidence) {
      if (ev.evidence_text && ev.source_type === 'PUBLIC_DOCUMENTATION') {
        const hosts = extractHostnamesFromHtml(ev.evidence_text, ev.public_url, rootDomain);
        hosts.forEach(h => candidateHostnames.add(h));
      }
    }

    // Add operator-supplied subdomains from existing evidence
    for (const sub of existingSubdomains) {
      if (isSameRootDomain(sub, rootDomain) && sub !== rootDomain) {
        candidateHostnames.add(sub);
      }
    }

    // Deduplicate and filter out the initial hostname
    const initialHostname = new URL(initialUrl).hostname;
    const candidates = [...candidateHostnames].filter(h => h !== initialHostname);

    // Record the suggestion
    records.push({
      investigation_id: `${organization}_adaptive_pivot_suggest`,
      organization,
      initial_surface: initialUrl,
      initial_observation_id: initialEv?.id || 'none',
      initial_boundary_classification: boundaryClass,
      initial_boundary_evidence_ids: initialEvidenceIds,
      pivot_trigger: trigger,
      pivot_action: `suggest_pivot_to_${candidates.length}_candidate_surface(s)`,
      pivot_reason: 'boundary_observation_warrants_alternate_path_exploration',
      pivot_source_evidence_ids: initialEvidenceIds,
      candidate_public_surfaces: candidates,
      discovered_public_surfaces: [],
      rejected_surfaces: [],
      rejection_reasons: [],
      new_evidence_ids: [],
      new_target_ids: [],
      verification_attempted: false,
      verification_result: 'not_attempted',
      final_decision: 'inherited_from_baseline',
      outcome: 'PIVOT_SUGGESTED',
      attribution_confidence: 'HIGH',
      started_at: startedAt,
      completed_at: now(),
    });

    // Execute pivots (maxPivots)
    let newEvidenceCount = 0;
    let altSurfacesFound = 0;
    let newTargets = 0;
    let executedPivots = 0;
    let verifiedFromAdaptive = 0;
    let noUsefulResult = 0;
    const discoveredSurfaces: string[] = [];
    const rejectedSurfaces: string[] = [];
    const rejectionReasons: string[] = [];
    const newEvidenceIds: string[] = [];
    const newTargetIds: string[] = [];

    let pivotIdx = 0;
    for (const candidate of candidates) {
      if (pivotIdx >= this.maxPivots) break;

      const pivotStarted = now();
      const pivotUrl = `https://${candidate}`;
      const provider = new LivePublicObservationProvider({
        delayMs: this.delayMs,
        sampleDelayMs: 200,
        maxRequests: this.maxPivotRequests,
        fetcher: this.fetcher as any,
      }) as any;

      let pivotEvidence: Evidence[] = [];
      let pivotError: string | null = null;

      try {
        const result = await provider.observePublicSurface(pivotUrl, {});
        pivotEvidence = result.evidence;
        pivotIdx++;
        executedPivots++;

        if (pivotEvidence.length > 0) {
          discoveredSurfaces.push(pivotUrl);
          altSurfacesFound++;

          // Check for new evidence not in the original set
          const originalIds = new Set(evidence.map(e => e.id));
          const newEvs = pivotEvidence.filter(e => !originalIds.has(e.id));
          if (newEvs.length > 0) {
            newEvidenceCount += newEvs.length;
            newEvs.forEach(e => newEvidenceIds.push(e.id));

            // Check for verification targets (latency-observed or status 200+)
            const verificationTargets = newEvs.filter(e =>
              (e.status ?? 0) >= 200 && (e.status ?? 0) < 400
            );
            if (verificationTargets.length > 0) {
              newTargets += verificationTargets.length;
              verificationTargets.forEach(e => newTargetIds.push(e.id));
            }
          }

          // Record successful pivot
          records.push({
            investigation_id: `${organization}_adaptive_pivot_${pivotIdx}`,
            organization,
            initial_surface: initialUrl,
            initial_observation_id: initialEv?.id || 'none',
            initial_boundary_classification: boundaryClass,
            initial_boundary_evidence_ids: initialEvidenceIds,
            pivot_trigger: trigger,
            pivot_action: `fetch_and_observe ${pivotUrl}`,
            pivot_reason: 'alternate_surface_suggested_by_adaptive_engine',
            pivot_source_evidence_ids: initialEvidenceIds,
            candidate_public_surfaces: [pivotUrl],
            discovered_public_surfaces: [pivotUrl],
            rejected_surfaces: [],
            rejection_reasons: [],
            new_evidence_ids: newEvs.map(e => e.id),
            new_target_ids: newTargetIds.length > 0 ? [newTargetIds[newTargetIds.length - 1]] : [],
            verification_attempted: true,
            verification_result: newEvs.length > 0 ? 'evidence_observed' : 'no_evidence',
            final_decision: newEvs.length > 0 ? 'potential' : 'no_action',
            outcome: newEvs.length > 0 ? (newEvs.filter(e => e.repeatable).length > 0 ? 'NEW_EVIDENCE_FOUND' : 'NEW_VERIFICATION_TARGET') : 'NO_USEFUL_RESULT',
            attribution_confidence: 'HIGH',
            started_at: pivotStarted,
            completed_at: now(),
          });

          if (newEvs.length === 0) {
            noUsefulResult++;
          } else if (newEvs.filter(e => e.repeatable).length > 0) {
            verifiedFromAdaptive++;
          }
        } else {
          // Pivot produced no evidence
          rejectedSurfaces.push(pivotUrl);
          rejectionReasons.push('no evidence returned (unreachable, empty, or error)');
          noUsefulResult++;

          records.push({
            investigation_id: `${organization}_adaptive_pivot_${pivotIdx}_rejected`,
            organization,
            initial_surface: initialUrl,
            initial_observation_id: initialEv?.id || 'none',
            initial_boundary_classification: boundaryClass,
            initial_boundary_evidence_ids: initialEvidenceIds,
            pivot_trigger: trigger,
            pivot_action: `fetch_and_observe ${pivotUrl}`,
            pivot_reason: 'alternate_surface_suggested_by_adaptive_engine',
            pivot_source_evidence_ids: initialEvidenceIds,
            candidate_public_surfaces: [pivotUrl],
            discovered_public_surfaces: [],
            rejected_surfaces: [pivotUrl],
            rejection_reasons: ['no evidence returned (unreachable, empty, or error)'],
            new_evidence_ids: [],
            new_target_ids: [],
            verification_attempted: true,
            verification_result: 'no_evidence',
            final_decision: 'no_action',
            outcome: 'NO_USEFUL_RESULT',
            attribution_confidence: 'HIGH',
            started_at: pivotStarted,
            completed_at: now(),
          });
        }
      } catch (e: any) {
        pivotError = e.message;
        pivotIdx++;
        executedPivots++;
        rejectedSurfaces.push(pivotUrl);
        rejectionReasons.push(`error: ${e.message}`);
        noUsefulResult++;

        records.push({
          investigation_id: `${organization}_adaptive_pivot_${pivotIdx}_error`,
          organization,
          initial_surface: initialUrl,
          initial_observation_id: initialEv?.id || 'none',
          initial_boundary_classification: boundaryClass,
          initial_boundary_evidence_ids: initialEvidenceIds,
          pivot_trigger: trigger,
          pivot_action: `fetch_and_observe ${pivotUrl}`,
          pivot_reason: 'alternate_surface_suggested_by_adaptive_engine',
          pivot_source_evidence_ids: initialEvidenceIds,
          candidate_public_surfaces: [pivotUrl],
          discovered_public_surfaces: [],
          rejected_surfaces: [pivotUrl],
          rejection_reasons: [`error: ${e.message}`],
          new_evidence_ids: [],
          new_target_ids: [],
          verification_attempted: true,
          verification_result: 'error',
          final_decision: 'no_action',
          outcome: 'NO_USEFUL_RESULT',
          attribution_confidence: 'HIGH',
          started_at: pivotStarted,
          completed_at: now(),
        });
      }

      await new Promise(r => setTimeout(r, this.delayMs));
    }

    // If we ran out of candidates before executing pivots, record INCONCLUSIVE
    if (executedPivots === 0 && candidates.length === 0) {
      records.push({
        investigation_id: `${organization}_adaptive_inconclusive`,
        organization,
        initial_surface: initialUrl,
        initial_observation_id: initialEv?.id || 'none',
        initial_boundary_classification: boundaryClass,
        initial_boundary_evidence_ids: initialEvidenceIds,
        pivot_trigger: trigger,
        pivot_action: 'none',
        pivot_reason: 'no candidate surfaces discovered from existing evidence',
        pivot_source_evidence_ids: initialEvidenceIds,
        candidate_public_surfaces: [],
        discovered_public_surfaces: [],
        rejected_surfaces: [],
        rejection_reasons: [],
        new_evidence_ids: [],
        new_target_ids: [],
        verification_attempted: false,
        verification_result: 'no_candidates',
        final_decision: 'inherited_from_baseline',
        outcome: 'INCONCLUSIVE',
        attribution_confidence: 'HIGH',
        started_at: startedAt,
        completed_at: now(),
      });
    }

    // Determine overall outcome
    const outcomes = records.map(r => r.outcome);
    let overallOutcome: AdaptiveOutcome = 'NO_USEFUL_RESULT';
    if (outcomes.includes('VERIFIED') || outcomes.includes('NEW_VERIFICATION_TARGET')) {
      overallOutcome = 'VERIFIED';
    } else if (outcomes.includes('NEW_EVIDENCE_FOUND') || outcomes.includes('ALTERNATE_SURFACE_FOUND')) {
      overallOutcome = 'NEW_EVIDENCE_FOUND';
    } else if (outcomes.includes('RESEARCH_MORE')) {
      overallOutcome = 'RESEARCH_MORE';
    } else if (outcomes.some(o => o === 'NO_USEFUL_RESULT')) {
      overallOutcome = 'NO_USEFUL_RESULT';
    } else if (outcomes.includes('INCONCLUSIVE')) {
      overallOutcome = 'INCONCLUSIVE';
    }

    return {
      attempted: true,
      records,
      aggregate: {
        boundary_observations: evidence.filter(e => classifyBoundary(e) !== 'OPEN_SURFACE').length,
        pivots_suggested: 1,
        pivots_executed: executedPivots,
        alternate_surfaces_found: altSurfacesFound,
        new_evidence_found: newEvidenceCount,
        new_verification_targets: newTargets,
        verified_from_adaptive_path: verifiedFromAdaptive,
        no_useful_result: noUsefulResult,
      },
    };
  }
}
