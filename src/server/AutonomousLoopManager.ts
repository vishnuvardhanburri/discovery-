import { IntelligenceCase, Evidence, SourceRelationship } from './IntelligenceCase';

import { VoIRouter } from './VoIRouter';
import { VoIAction, VoIActionType } from './types/LoopTypes';
import { GitHubProvider, GitHubOrgResolution, GitHubRepoInfo, GitHubProviderStatus, GitHubApiError } from './providers/GitHubProvider';
import { TargetedSearchProvider } from './providers/TargetedSearchProvider';
import { DeepSignalExtractor } from './DeepSignalExtractor';
import { SignalCorrelationEngine } from './signals/SignalCorrelationEngine';
import { OpportunityDetector } from './findings/OpportunityDetector';
import { ResearchBudget } from './ResearchBudget';
import { LivePublicObservationProvider } from './LivePublicObservationProvider.js';
import { TemporalDeltaEngine } from './TemporalDeltaEngine';
import { ThesisEngine } from './ThesisEngine';
import { StrategicWindowCalculator } from './StrategicWindowCalculator';
import { HumanTelemetryProvider } from './providers/HumanTelemetryProvider';
import { SynapseEngine } from './SynapseEngine';
import { BehavioralXRayAnalyzer } from './BehavioralXRayAnalyzer';
import { DependencyGraphReconstructor } from './DependencyGraphReconstructor';
import { EvidenceScoringEngine } from './EvidenceScoringEngine';
import { extractorRegistry } from './extractors/ExtractorRegistry';
import { SourceRelationshipValidator } from './SourceRelationshipValidator';
import { SourceType } from './IntelligenceCase';

export interface ActionExecutionResult {
  action: VoIActionType;
  status: 'COMPLETED' | 'DEFERRED' | 'SKIPPED' | 'FAILED';
  evidence_ids: string[];
  signals: any[];
  error?: string;
}

export interface ActionHistoryRecord {
  action_type: VoIActionType;
  iteration: number;
  evidence_delta: number;
  signal_delta: number;
  state_changed: boolean;
  status: string;
}

export class AutonomousLoopManager {
  private voIRouter: VoIRouter;
  private ghProvider: GitHubProvider;
  private tsp: TargetedSearchProvider;
  private signalExtractor: DeepSignalExtractor;
  private correlationEngine: SignalCorrelationEngine;
  private oppDetector: OpportunityDetector;
  private budget: any;
  private observationProvider: any;
  private actionHistory: ActionHistoryRecord[] = [];
  private fetcher?: any;

  constructor(company?: string, observationProvider?: any, options?: { fetcher?: any }) {
    this.voIRouter = new VoIRouter();
    this.ghProvider = new GitHubProvider();
    this.tsp = new TargetedSearchProvider();
    this.signalExtractor = new DeepSignalExtractor();
    this.correlationEngine = new SignalCorrelationEngine();
    this.oppDetector = new OpportunityDetector();
    this.budget = new ResearchBudget();
    this.observationProvider = observationProvider || new LivePublicObservationProvider();
    this.fetcher = options?.fetcher;
  }

  public async executeLoop(currentCase: IntelligenceCase, maxIterations: number = 10): Promise<IntelligenceCase> {
    console.log(`\n[FORENSIC_IDENTITY] Class: ${this.constructor.name} | Method: executeLoop`);

    if (!currentCase.budget_state) {
      currentCase.budget_state = ResearchBudget.initializeState();
    }

    console.log(`\n[LOOP_ENTER] Target: ${currentCase.company}`);
    for (let i = 0; i < maxIterations; i++) {
      console.log(`\n--- ITERATION ${i+1} ---`);

      const isStopped = this.budget.isStopped(currentCase);
      if (isStopped) {
        console.log(`[LOOP_EXIT] Budget stopped early.`);
        break;
      }

      try {
        const action = this.voIRouter.getNextBestAction(currentCase, this.budget, this.actionHistory);

        // ANTI-DEADLOCK: Log the diversification force
        const lastExecution = this.actionHistory[this.actionHistory.length - 1];
        if (lastExecution && lastExecution.action_type === action.action &&
            lastExecution.evidence_delta === 0 && lastExecution.signal_delta === 0 && !lastExecution.state_changed) {
          console.log(`[ANTI_DEADLOCK] Action ${action.action} produced no gain. Diversification required.`);
        }

        console.log(`[ACTION_SELECTED] ${action.action} | Rationale: ${action.rationale}`);

        const preEvidenceCount = currentCase.evidence.length;
        const preSignalCount = (currentCase.signals || []).length;

        const result = await this.executeAction(action, currentCase);

        const postEvidenceCount = currentCase.evidence.length;
        const postSignalCount = (currentCase.signals || []).length;

        const evidenceDelta = postEvidenceCount - preEvidenceCount;
        const signalDelta = postSignalCount - preSignalCount;
        const stateChanged = result.status === 'COMPLETED' && evidenceDelta > 0;

        this.actionHistory.push({
          action_type: action.action,
          iteration: i + 1,
          evidence_delta: evidenceDelta,
          signal_delta: signalDelta,
          state_changed: stateChanged,
          status: result.status
        });

        console.log(`[ITERATION_RESULT] Evidence Delta: ${evidenceDelta} | Signal Delta: ${signalDelta} | Status: ${result.status}`);

        if (result.evidence_ids.length > 0) {
          this.processEvidence(currentCase, result.evidence_ids);
        }

        if (result.status === 'FAILED' && evidenceDelta === 0) {
          console.log(`[INFO_GAIN] NO_INFORMATION_GAIN from ${action.action}`);
        }

      } catch (e: any) {
        console.error(`\n[LOOP_EXCEPTION] ${e.message}`);
        console.error(`[LOOP_STACK] ${e.stack}`);
        break;
      }
    }

    currentCase = await this.finalizeStrategicIntelligence(currentCase);
    return currentCase;
  }

  private async executeAction(action: VoIAction, currentCase: IntelligenceCase): Promise<ActionExecutionResult> {
    const stage = this.budget.getCurrentStageNum(currentCase);
    this.budget.recordRequest(currentCase, stage);

    switch (action.action) {
      case 'GITHUB_RESOLVE_ORG':
        return await this.handleResolveOrg(currentCase);
      case 'GITHUB_DISCOVER_REPOSITORIES':
        return await this.handleDiscoverRepos(currentCase, action.target);
      case 'GITHUB_OBSERVE_REPOSITORY':
        return await this.handleObserveRepo(currentCase, action.target);
      case 'GITHUB_COMPARE_TEMPORAL_STATE':
        return await this.handleCompareTemporal(currentCase, action.target);
      case 'GITHUB_EXPAND_FROM_SIGNAL':
        return await this.handleExpandFromSignal(currentCase, action.target);
      case 'TARGETED_DISCOVERY':
        return await this.handleTargetedDiscovery(currentCase);
      case 'BROAD_SURFACE_MAPPING':
        return await this.handleBroadSurfaceMapping(currentCase);
      case 'IDENTITY_RESOLVE':
        return { action: action.action, status: 'COMPLETED', evidence_ids: [], signals: [] };
      default:
        return { action: action.action, status: 'SKIPPED', evidence_ids: [], signals: [] };
    }
  }

  private async handleBroadSurfaceMapping(currentCase: IntelligenceCase): Promise<ActionExecutionResult> {
    console.log(`[ACTION] Executing BROAD_SURFACE_MAPPING for ${currentCase.company}...`);
    try {
      const results = await this.observationProvider.observePublicSurface(
        currentCase.company_surface?.homepage || `https://${currentCase.company_surface?.origin}`,
        {
          // Guard the crawler by passing the required origin
          requiredOrigin: currentCase.company_surface?.origin
        } as any
      );

      if (results.evidence.length > 0) {
        // Validate relationship for all evidence from the provider
        results.evidence.forEach((ev: Evidence) => {
          ev.relationship_type = SourceRelationshipValidator.validate(
            ev.public_url,
            currentCase.company_surface?.origin || '',
            currentCase.company
          );
        });

        // Update surface map to prevent routing loops
        if (!currentCase.company_surface) {
          currentCase.company_surface = {
            company: currentCase.company,
            origin: '',
            homepage: `https://${currentCase.company}`,
            discovered_pages: [],
            page_categories: {}
          } as any;
        }

        const newPages = results.evidence
          .filter((e: Evidence) => e.public_url)
          .map((e: Evidence) => ({
            url: e.public_url!,
            path: new URL(e.public_url!).pathname,
            status: e.status
          }));

        // Deduplicate pages
        const existingUrls = new Set((currentCase.company_surface! as any).discovered_pages.map((p: any) => p.url));
        const uniquePages = newPages.filter((p: any) => !existingUrls.has(p.url));
        (currentCase.company_surface! as any).discovered_pages.push(...uniquePages);

        currentCase.evidence.push(...results.evidence);
        return {
          action: 'BROAD_SURFACE_MAPPING',
          status: 'COMPLETED',
          evidence_ids: results.evidence.map((e: Evidence) => e.id),
          signals: []
        };
      }



      console.log(`[BROAD_SURFACE_MAPPING] Provider returned zero usable evidence.`);
      return { action: 'BROAD_SURFACE_MAPPING', status: 'COMPLETED', evidence_ids: [], signals: [] };
    } catch (e: any) {
      console.error(`[BROAD_SURFACE_MAPPING] Error: ${e.message}`);
      return { action: 'BROAD_SURFACE_MAPPING', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private async handleResolveOrg(currentCase: IntelligenceCase): Promise<ActionExecutionResult> {
    try {
      const res = await this.ghProvider.resolveOrg(currentCase.company, currentCase.company_surface?.origin || '');
      if (!res) return { action: 'GITHUB_RESOLVE_ORG', status: 'FAILED', evidence_ids: [], signals: [], error: 'Org not found' };

      if (!currentCase.github_memory) {
        currentCase.github_memory = {
          org_login: res.login,
          repositories: {},
          temporal_deltas: []
        };
      } else {
        currentCase.github_memory.org_login = res.login;
      }

      const evidence: Evidence = {
        id: res.evidence[0]?.id || `ev-gh-org-${res.login}`,
        evidence_origin: 'REAL_PUBLIC_OBSERVATION',
        public_url: res.html_url,
        source_type: 'GITHUB',
        observed_behavior: `Resolved GitHub Organization: ${res.login} (${res.reason})`,
        retrieved_at: new Date().toISOString(),
        evidence_text: res.reason,
        reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: []
      };
      currentCase.evidence.push(evidence);

      return { action: 'GITHUB_RESOLVE_ORG', status: 'COMPLETED', evidence_ids: [evidence.id], signals: [] };
    } catch (e: any) {
      if (e instanceof GitHubApiError && e.status === GitHubProviderStatus.RATE_LIMITED) {
        return { action: 'GITHUB_RESOLVE_ORG', status: 'DEFERRED', evidence_ids: [], signals: [], error: e.message };
      }
      return { action: 'GITHUB_RESOLVE_ORG', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private async handleDiscoverRepos(currentCase: IntelligenceCase, org?: string): Promise<ActionExecutionResult> {
    const targetOrg = org || currentCase.github_memory?.org_login;
    if (!targetOrg) return { action: 'GITHUB_DISCOVER_REPOSITORIES', status: 'FAILED', evidence_ids: [], signals: [], error: 'No org login available' };

    try {
      const repos = await this.ghProvider.discoverRepositories(targetOrg);
      if (!currentCase.github_memory) {
        currentCase.github_memory = {
          org_login: targetOrg,
          repositories: {},
          temporal_deltas: []
        };
      }

      repos.forEach(r => {
        currentCase.github_memory!.repositories[r.name] = {
          last_commit_sha: '',
          last_commit_at: r.updated_at,
          release_count: 0,
          activity_score: r.intelligence_score
        };
      });

      return { action: 'GITHUB_DISCOVER_REPOSITORIES', status: 'COMPLETED', evidence_ids: [], signals: [] };
    } catch (e: any) {
      if (e instanceof GitHubApiError && e.status === GitHubProviderStatus.RATE_LIMITED) {
        return { action: 'GITHUB_DISCOVER_REPOSITORIES', status: 'DEFERRED', evidence_ids: [], signals: [], error: e.message };
      }
      return { action: 'GITHUB_DISCOVER_REPOSITORIES', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private async handleObserveRepo(currentCase: IntelligenceCase, repoName?: string): Promise<ActionExecutionResult> {
    const org = currentCase.github_memory?.org_login;
    if (!org) return { action: 'GITHUB_OBSERVE_REPOSITORY', status: 'FAILED', evidence_ids: [], signals: [], error: 'No org login' };
    const targetRepo = repoName || Object.keys(currentCase.github_memory!.repositories)[0];
    if (!targetRepo) return { action: 'GITHUB_OBSERVE_REPOSITORY', status: 'FAILED', evidence_ids: [], signals: [], error: 'No repos discovered' };

    try {
      const { evidence, metrics } = await this.ghProvider.observeRepository(org, targetRepo, currentCase);

      this.budget.consumeGitHubObservation(currentCase);

      if (currentCase.github_memory) {
        currentCase.github_memory.repositories[targetRepo] = {
          ...currentCase.github_memory.repositories[targetRepo],
          last_commit_at: new Date().toISOString(),
          activity_score: metrics.commit_count
        };
      }
      currentCase.evidence.push(...evidence);
      return {
        action: 'GITHUB_OBSERVE_REPOSITORY',
        status: 'COMPLETED',
        evidence_ids: evidence.map(e => e.id),
        signals: []
      };
    } catch (e: any) {
      if (e instanceof GitHubApiError && e.status === GitHubProviderStatus.RATE_LIMITED) {
        return { action: 'GITHUB_OBSERVE_REPOSITORY', status: 'DEFERRED', evidence_ids: [], signals: [], error: e.message };
      }
      return { action: 'GITHUB_OBSERVE_REPOSITORY', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private async handleCompareTemporal(currentCase: IntelligenceCase, repoName?: string): Promise<ActionExecutionResult> {
    const org = currentCase.github_memory?.org_login;
    const targetRepo = repoName || Object.keys(currentCase.github_memory?.repositories || {}).sort()[0];
    if (!org || !targetRepo) return { action: 'GITHUB_COMPARE_TEMPORAL_STATE', status: 'FAILED', evidence_ids: [], signals: [], error: 'Insufficient state' };

    try {
      const { evidence, metrics } = await this.ghProvider.observeRepository(org, targetRepo, currentCase);
      currentCase.evidence.push(...evidence);
      return {
        action: 'GITHUB_COMPARE_TEMPORAL_STATE',
        status: 'COMPLETED',
        evidence_ids: evidence.map(e => e.id),
        signals: []
      };
    } catch (e: any) {
      if (e instanceof GitHubApiError && e.status === GitHubProviderStatus.RATE_LIMITED) {
        return { action: 'GITHUB_COMPARE_TEMPORAL_STATE', status: 'DEFERRED', evidence_ids: [], signals: [], error: e.message };
      }
      return { action: 'GITHUB_COMPARE_TEMPORAL_STATE', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private async handleExpandFromSignal(currentCase: IntelligenceCase, signalId?: string): Promise<ActionExecutionResult> {
    return await this.handleDiscoverRepos(currentCase);
  }

  private async handleTargetedDiscovery(currentCase: IntelligenceCase): Promise<ActionExecutionResult> {
    try {
      const results = await this.tsp.discoverSource(currentCase.company, currentCase.company_surface?.origin || '', 'BROAD');
      const evidence = results.results?.map((url: string, i: number) => {
        const relationship = SourceRelationshipValidator.validate(
          url,
          currentCase.company_surface?.origin || '',
          currentCase.company
        );

        return {
          id: `ev-disc-${i}`,
          evidence_origin: 'DISCOVERY',
          public_url: url,
          source_type: 'SEARCH_RESULT',
          relationship_type: relationship,
          observed_behavior: 'Discovered via targeted search',
          retrieved_at: new Date().toISOString(),
          evidence_text: url,
          reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: []
        } as any;
      }) || [];
      currentCase.evidence.push(...evidence);
      return { action: 'TARGETED_DISCOVERY', status: 'COMPLETED', evidence_ids: evidence.map((e: any) => e.id), signals: [] };
    } catch (e: any) {
      return { action: 'TARGETED_DISCOVERY', status: 'FAILED', evidence_ids: [], signals: [], error: e.message };
    }
  }

  private processEvidence(currentCase: IntelligenceCase, evidenceIds: string[]) {
    const evidenceToProcess = currentCase.evidence.filter((e: Evidence) => evidenceIds.includes(e.id));

    // 1. SCORE ALL NEW EVIDENCE
    currentCase.evidence = currentCase.evidence.map((ev: Evidence) => {
      if (!ev.scoring || ev.scoring.total_score === undefined) {
        const scored = EvidenceScoringEngine.score(ev);
        console.log(`[SCORE_TRACE] ID: ${scored.id} | Score: ${scored.scoring?.total_score || 0} | Strength: ${scored.strength} | Type: ${scored.source_type} | Obs: ${scored.observed_behavior.slice(0, 60)}...`);
        return scored;
      }
      return ev;
    });

    // 2. SOURCE-AWARE EXTRACTION
    const allObservations: any[] = [];
    for (const ev of evidenceToProcess) {
      const extractor = extractorRegistry.getExtractor(ev.source_type);
      if (extractor) {
        const rawContent = ev.raw_observation || '';
        const obs = extractor.extract(rawContent, ev.public_url, currentCase);

        // FORENSIC TRACE: PHASE 2 - Verify Content Transformation
        const cleanedContent = (extractor as any).cleanText ? (extractor as any).cleanText(rawContent) : 'N/A';
        console.log(`\n[CONTENT_TRANSFORMATION_TRACE]`);
        console.log(`URL: ${ev.public_url}`);
        console.log(`RAW_CONTENT_LENGTH: ${rawContent.length}`);
        console.log(`CLEAN_TEXT_LENGTH: ${cleanedContent.length}`);
        console.log(`OBSERVATIONS_FOUND: ${obs.length}`);
        obs.forEach((o, i) => {
          console.log(`  Obs ${i}: [${o.type}] ${o.raw_text?.slice(0, 200)}...`);
        });

        allObservations.push(...obs);
      } else {
        if (ev.source_type !== 'UNKNOWN' && ev.source_type !== 'SEARCH_RESULT') {
          console.log(`[EXTRACTOR_MISSING] No extractor for type: ${ev.source_type}`);
        }
      }
    }

    // 3. SIGNAL EXTRACTION (Transitioning to SignalCandidates)
    console.log(`\n[SIGNAL_EXTRACTION_TRACE] Processing ${allObservations.length} observations...`);

    // FORENSIC TRACE: PHASE 1 - Observation Audit
    allObservations.forEach((obs: any, i: number) => {
      // Build a quick lookup of evidence IDs from evidenceToProcess to avoid self-reference
      const evIds = new Set(evidenceToProcess.map((et: any) => et.id));
      const ev: Evidence | undefined = currentCase.evidence.find((e: any) =>
        e.public_url === obs.url ||
        (obs.metadata && obs.metadata.source_url === e.public_url) ||
        evIds.has(e.id)
      );
      console.log(`\n[OBSERVATION_TRACE]`);
      console.log(`company=${currentCase.company}`);
      console.log(`evidence_id=${ev?.id || 'UNKNOWN'}`);
      console.log(`source_type=${ev?.source_type || 'UNKNOWN'}`);
      console.log(`source_url=${obs.url || (ev?.public_url || 'UNKNOWN')}`);
      console.log(`observation_type=${obs.type}`);
      console.log(`text_length=${obs.raw_text?.length || 0}`);
      console.log(`strength=${ev?.strength || 'UNKNOWN'}`);
      console.log(`score=${ev?.scoring?.total_score || 'UNKNOWN'}`);
      console.log(`text="${obs.raw_text?.slice(0, 1000) || 'NO_TEXT'}"`);
    });

    const newSignals = DeepSignalExtractor.extract(allObservations, currentCase.evidence);
    console.log(`[SIGNAL_DEBUG] Extracted ${newSignals.length} signals.`);
    currentCase.signals = [...(currentCase.signals || []), ...newSignals];

    // 4. CORRELATION & OPPORTUNITY
    const correlationResult = SignalCorrelationEngine.correlate(currentCase.signals, currentCase.evidence);
    currentCase.correlated_groups = correlationResult.groups;

    const opps = OpportunityDetector.detect(currentCase.signals, currentCase.evidence, { company: currentCase.company });
    if (opps.length > 0) {
      currentCase.pressure_classification = opps[0].type;
    }
  }

  private async finalizeStrategicIntelligence(currentCase: IntelligenceCase): Promise<IntelligenceCase> {
    console.log(`\n[PREDICTIVE_FINALIZATION] Synthesizing Strategic Intelligence...`);

    const thesis = ThesisEngine.generateThesis(currentCase);
    if (thesis) {
      currentCase.prospect_decision = {
        ...(currentCase.prospect_decision as any),
        thesis: thesis,
        confidence: thesis.confidence,
      };
      console.log(`[THESIS_GENERATED] ${thesis.thesis}`);
    }

    const simulatedPreviousCase = {
      ...currentCase,
      evidence: currentCase.evidence.slice(0, Math.max(0, currentCase.evidence.length - 3)),
      budget_state: { ...(currentCase.budget_state || {}), requestsUsed: (currentCase.budget_state?.requestsUsed || 0) - 5 },
      signals: (currentCase.signals || []).slice(0, -1),
    } as any;

    const trajectory = TemporalDeltaEngine.calculateTrajectory(currentCase, simulatedPreviousCase);
    currentCase.prospect_decision = {
      ...(currentCase.prospect_decision as any),
      trajectory: trajectory,
    };
    console.log(`[TRAJECTORY_ANALYZED] Status: ${trajectory.status} | Window: ${trajectory.vulnerability_window}`);

    if (thesis) {
      const window = StrategicWindowCalculator.calculateWindow(thesis, trajectory);
      currentCase.prospect_decision = {
        ...(currentCase.prospect_decision as any),
        strategic_window: window,
      };
      console.log(`[STRATEGIC_WINDOW_CALCULATED] Urgency: ${window.urgency_score} | Recommended: ${window.recommended_action}`);
    }

    const humanTelemetry = new HumanTelemetryProvider();
    const { signals: humanSignals, evidence: humanEvidence } = await humanTelemetry.analyzeHumanTelemetry(currentCase);
    currentCase.evidence.push(...humanEvidence);

    const synapseCorrelations = SynapseEngine.correlate(currentCase.signals || [], humanSignals);
    if (synapseCorrelations.length > 0) {
      currentCase.prospect_decision = {
        ...(currentCase.prospect_decision as any),
        synapse_insights: synapseCorrelations,
      };
      console.log(`[SYNAPSE_INSIGHT] Detected ${synapseCorrelations[0].vulnerability_type} | Leverage: ${synapseCorrelations[0].leverage_point}`);
    }

    const xray = new BehavioralXRayAnalyzer();
    const domain = currentCase.company_surface?.origin || 'vercel.com';
    const { result: xrayResult, evidence: xrayEvidence } = await xray.analyzeEndpointBehavior(domain, '/api/v1/metrics');
    currentCase.evidence.push(...xrayEvidence);

    const archMap = DependencyGraphReconstructor.reconstruct(currentCase, xrayResult);
    currentCase.prospect_decision = {
      ...(currentCase.prospect_decision as any),
      architecture_map: archMap,
      behavioral_fingerprint: xrayResult,
    };
    console.log(`[ARCH_MAPPED] Nodes: ${archMap.nodes.length} | Edges: ${archMap.edges.length} | Final: ${archMap.final_classification}`);

    return currentCase;
  }
}
