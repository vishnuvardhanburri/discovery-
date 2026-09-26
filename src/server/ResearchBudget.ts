/**
 * XAVIRA — RESEARCH BUDGET (§17)
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages staged research with early stopping. Each stage has a budget
 * (requests/pages/queries) and can decide to stop early for irrelevant
 * companies.
 *
 * Stages:
 *   1. cheap dataset qualification
 *   2. cheap public source discovery
 *   3. live technical research
 *   4. deeper signal correlation
 *   5. safe verification
 *   6. owner/contact refresh
 */

export type ResearchStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface StageConfig {
  stage: ResearchStage;
  name: string;
  maxRequests: number;
  maxQueries: number;
  /** Description of what this stage does. */
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
  private static readonly STAGES: StageConfig[] = [
    { stage: 1, name: 'dataset-qualification', maxRequests: 0, maxQueries: 0, description: 'Cheap dataset qualification.' },
    { stage: 2, name: 'public-source-discovery', maxRequests: 8, maxQueries: 3, description: 'Cheap public source discovery (homepage, sitemap, links).' },
    { stage: 3, name: 'live-technical-research', maxRequests: 12, maxQueries: 8, description: 'Live technical research via search + direct observation.' },
    { stage: 4, name: 'signal-correlation', maxRequests: 6, maxQueries: 5, description: 'Deeper signal correlation and evidence gathering.' },
    { stage: 5, name: 'safe-verification', maxRequests: 5, maxQueries: 3, description: 'Safe read-only verification of technical signals.' },
    { stage: 6, name: 'owner-contact-refresh', maxRequests: 4, maxQueries: 3, description: 'Owner and contact refresh via public sources.' },
  ];

  private currentStage: ResearchStage = 1;
  private requestsUsed: number = 0;
  private queriesUsed: number = 0;
  private stoppedEarly: boolean = false;
  private stopReason: string | undefined;

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

  /** Whether a given stage should be attempted given the current budget. */
  shouldAttemptStage(stage: ResearchStage): boolean {
    if (this.stoppedEarly) return false;
    // Stage 1 is always available (it's the initial qualification).
    // Stages 2+ are available until we've advanced past them.
    if (stage === 1) return true;
    return stage <= this.currentStage + 1;
  }

  /** Get the config for a stage. */
  getStageConfig(stage: ResearchStage): StageConfig | undefined {
    return ResearchBudget.STAGES.find(s => s.stage === stage);
  }

  /** Record a request used in the current stage. Returns false if budget exhausted. */
  recordRequest(stage: ResearchStage): boolean {
    const cfg = this.getStageConfig(stage);
    if (!cfg) return false;
    if (this.requestsUsed >= cfg.maxRequests) return false;
    this.requestsUsed++;
    return true;
  }

  /** Record a query used in the current stage. Returns false if budget exhausted. */
  recordQuery(stage: ResearchStage): boolean {
    const cfg = this.getStageConfig(stage);
    if (!cfg) return false;
    if (this.queriesUsed >= cfg.maxQueries) return false;
    this.queriesUsed++;
    return true;
  }

  /** Advance to the next stage. Resets per-stage counters. */
  advanceStage(): ResearchStage {
    if (this.currentStage < 6) this.currentStage++;
    this.requestsUsed = 0;
    this.queriesUsed = 0;
    return this.currentStage;
  }

  /** Mark research as stopped early (for irrelevant companies). */
  stopEarly(reason: string): void {
    this.stoppedEarly = true;
    this.stopReason = reason;
  }

  /** Get a summary of the budget usage for the current stage. */
  getSummary(stage: ResearchStage): BudgetSummary {
    const cfg = this.getStageConfig(stage) ?? this.getStageConfig(1)!;
    return {
      stage,
      stageName: cfg.name,
      requests_used: this.requestsUsed,
      requests_remaining: Math.max(0, cfg.maxRequests - this.requestsUsed),
      queries_used: this.queriesUsed,
      queries_remaining: Math.max(0, cfg.maxQueries - this.queriesUsed),
      stopped_early: this.stoppedEarly,
      stop_reason: this.stopReason,
    };
  }

  /** Whether research is still active (not stopped early). */
  get isStopped(): boolean {
    return this.stoppedEarly;
  }

  /** Current stage. */
  get currentStageNum(): ResearchStage {
    return this.currentStage;
  }
}
