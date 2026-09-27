import { IntelligenceCase, ResearchBudgetState } from './IntelligenceCase';

/** Safely access budget_state, returning a default if missing. */
function bs(cs?: IntelligenceCase): ResearchBudgetState {
  return cs?.budget_state || { requestsUsed: 0, queriesUsed: 0, githubObservations: 0, stoppedEarly: false };
}

export type ResearchStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface StageConfig {
  stage: ResearchStage;
  name: string;
  maxRequests: number;
  maxQueries: number;
  maxGitHubObservations: number;
  description: string;
}

export interface BudgetSummary {
  stage: ResearchStage;
  stageName: string;
  requests_used: number;
  requests_remaining: number;
  queries_used: number;
  queries_remaining: number;
  stopped_early: boolean;
  stop_reason?: string;
}

export interface StopReason {
  stop: boolean;
  reason: string;
  stage: ResearchStage;
}

export class ResearchBudget {
  public static readonly STAGES: StageConfig[] = [
    { stage: 1, name: 'dataset-qualification', maxRequests: 0, maxQueries: 0, maxGitHubObservations: 0, description: 'Cheap dataset qualification.' },
    { stage: 2, name: 'public-source-discovery', maxRequests: 8, maxQueries: 3, maxGitHubObservations: 2, description: 'Cheap public source discovery (homepage, sitemap, links).' },
    { stage: 3, name: 'live-technical-research', maxRequests: 12, maxQueries: 8, maxGitHubObservations: 5, description: 'Live technical research via search + direct observation.' },
    { stage: 4, name: 'signal-correlation', maxRequests: 6, maxQueries: 5, maxGitHubObservations: 3, description: 'Deeper signal correlation and evidence gathering.' },
    { stage: 5, name: 'safe-verification', maxRequests: 5, maxQueries: 3, maxGitHubObservations: 2, description: 'Safe read-only verification of technical signals.' },
    { stage: 6, name: 'owner-contact-refresh', maxRequests: 4, maxQueries: 3, maxGitHubObservations: 1, description: 'Owner and contact refresh via public sources.' },
  ];

  // ── Instance-level state (for standalone use without caseState) ──────
  private _isStopped: boolean = false;
  private _stopReason: string = '';
  private _currentStage: ResearchStage = 1;
  private _requestsUsed: number = 0;
  private _queriesUsed: number = 0;
  private _githubObservations: number = 0;

  /** Initialize a default budget state for a case. */
  static initializeState(): ResearchBudgetState {
    return {
      requestsUsed: 0,
      queriesUsed: 0,
      githubObservations: 0,
      stoppedEarly: false,
    };
  }

  /** Check if a research stage should be skipped due to early stopping. */
  static shouldStopEarly(reason: string): StopReason {
    const lowerReason = reason.toLowerCase();
    if (lowerReason.includes('irrelevant') || lowerReason.includes('no_go')) {
      return { stop: true, reason: 'Irrelevant company — stopping early.', stage: 1 };
    }
    if (lowerReason.includes('weak icp') || lowerReason.includes('poor')) {
      return { stop: true, reason: 'Weak ICP — stopping early.', stage: 2 };
    }
    if (lowerReason.includes('no meaningful technical surface') || lowerReason.includes('no technical surface')) {
      return { stop: true, reason: 'No meaningful technical surface — stopping early.', stage: 2 };
    }
    if (lowerReason.includes('repeatedly insufficient')) {
      return { stop: true, reason: 'Repeatedly insufficient evidence — stopping early.', stage: 3 };
    }
    return { stop: false, reason: '', stage: 1 };
  }

  /** Whether research is still active (not stopped early). */
  get isStopped(): boolean {
    return this._isStopped;
  }

  /** Whether a given stage should be attempted given the current budget. */
  shouldAttemptStage(stage: ResearchStage, caseState?: IntelligenceCase): boolean {
    // Instance-level check (standalone mode)
    if (!caseState) {
      if (this._isStopped) return false;
      if (stage === 1) return true;
      return stage <= this._currentStage + 1;
    }
    // Case-level check (integrated mode)
    if (bs(caseState).stoppedEarly) return false;
    if (stage === 1) return true;
    const currentStage = (caseState?.research_state as any)?.currentStage || 1;
    return stage <= currentStage + 1;
  }

  /** Check if the GitHub observation budget is exhausted for the current stage. */
  isGitHubBudgetExhausted(stage: ResearchStage = 1, caseState?: IntelligenceCase): boolean {
    const cfg = this.getStageConfig(stage);
    if (!cfg) return true;
    if (caseState) return bs(caseState).githubObservations >= cfg.maxGitHubObservations;
    return this._githubObservations >= cfg.maxGitHubObservations;
  }

  /** Record a GitHub observation. */
  consumeGitHubObservation(caseState?: IntelligenceCase): void {
    if (caseState) { bs(caseState).githubObservations++; }
    else { this._githubObservations++; }
  }

  /** Get the config for a stage. */
  getStageConfig(stage: ResearchStage): StageConfig | undefined {
    return ResearchBudget.STAGES.find(s => s.stage === stage);
  }

  /** Record a request used in the current stage. Returns false if budget exhausted. */
  recordRequest(stage: ResearchStage = 1, caseState?: IntelligenceCase): boolean {
    const cfg = this.getStageConfig(stage);
    if (!cfg) return false;
    if (cfg.maxRequests === 0) {
      // Stage 1 has 0 max requests — still record but always succeed
      if (caseState) { bs(caseState).requestsUsed++; }
      else { this._requestsUsed++; }
      return true;
    }
    if (caseState) {
      if (bs(caseState).requestsUsed >= cfg.maxRequests) return false;
      bs(caseState).requestsUsed++;
    } else {
      if (this._requestsUsed >= cfg.maxRequests) return false;
      this._requestsUsed++;
    }
    return true;
  }

  /** Record a query used in the current stage. Returns false if budget exhausted. */
  recordQuery(stage: ResearchStage = 1, caseState?: IntelligenceCase): boolean {
    const cfg = this.getStageConfig(stage);
    if (!cfg) return false;
    if (caseState) {
      if (bs(caseState).queriesUsed >= cfg.maxQueries) return false;
      bs(caseState).queriesUsed++;
    } else {
      if (this._queriesUsed >= cfg.maxQueries) return false;
      this._queriesUsed++;
    }
    return true;
  }

  /** Advance to the next stage. */
  advanceStage(caseState?: IntelligenceCase): ResearchStage {
    if (caseState) {
      let currentStage = (caseState?.research_state as any)?.currentStage || 1;
      if (currentStage < 6) currentStage++;
      (caseState.research_state as any).currentStage = currentStage;
      bs(caseState).requestsUsed = 0;
      bs(caseState).queriesUsed = 0;
      return currentStage;
    } else {
      if (this._currentStage < 6) this._currentStage++;
      this._requestsUsed = 0;
      this._queriesUsed = 0;
      return this._currentStage;
    }
  }

  /** Mark research as stopped early. Accepts either a reason string or (caseState, reason). */
  stopEarly(caseStateOrReason?: IntelligenceCase | string, reason: string = ''): void {
    if (typeof caseStateOrReason === 'string') {
      // Standalone mode: stopEarly('some reason')
      this._isStopped = true;
      this._stopReason = caseStateOrReason;
    } else if (caseStateOrReason) {
      // Case-integrated mode: stopEarly(caseState, 'reason')
      bs(caseStateOrReason).stoppedEarly = true;
      bs(caseStateOrReason).stopReason = reason;
    } else {
      // Default: set instance-level stop
      this._isStopped = true;
      this._stopReason = reason;
    }
  }

  /** Get a summary of the budget usage for the current stage. */
  getSummary(caseState?: IntelligenceCase, stage: ResearchStage = 2): BudgetSummary {
    const cfg = this.getStageConfig(stage) ?? this.getStageConfig(2)!;
    if (caseState) {
      const budget = bs(caseState);
      return {
        stage,
        stageName: cfg.name,
        requests_used: budget.requestsUsed,
        requests_remaining: Math.max(0, cfg.maxRequests - budget.requestsUsed),
        queries_used: budget.queriesUsed,
        queries_remaining: Math.max(0, cfg.maxQueries - budget.queriesUsed),
        stopped_early: budget.stoppedEarly,
        stop_reason: budget.stopReason,
      };
    } else {
      return {
        stage,
        stageName: cfg.name,
        requests_used: this._requestsUsed,
        requests_remaining: Math.max(0, cfg.maxRequests - this._requestsUsed),
        queries_used: this._queriesUsed,
        queries_remaining: Math.max(0, cfg.maxQueries - this._queriesUsed),
        stopped_early: this._isStopped,
        stop_reason: this._stopReason,
      };
    }
  }

  /** Current stage. */
  getCurrentStageNum(caseState?: IntelligenceCase): ResearchStage {
    if (caseState) return (caseState?.research_state as any)?.currentStage || 1;
    return this._currentStage;
  }
}
