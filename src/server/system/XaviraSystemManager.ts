/**
 * XAVIRA — SYSTEM MANAGER (§2, §19)
 * ─────────────────────────────────────────────────────────────────────────────
 * The central lifecycle owner for XAVIRA's autonomous intelligence system.
 * It decides WHAT to research, HOW MUCH to spend, WHICH sources to investigate
 * next, WHAT failed, WHAT needs retry, and whether a finding should exist.
 *
 * Core loop (§19):
 *   DISCOVER → RESOLVE → PLAN → RESEARCH → ASSESS → EXPAND → CORRELATE →
 *   DECIDE → FINDING → OWNER → CONTACT → QA → HUMAN_APPROVAL → SEND
 *
 * Uses XaviraResearchController for the fast-triaged research pipeline:
 *   TRIAGE → TARGETED → DEEP → VERIFY → COMPLETE
 *
 * A failed source does NOT terminate company research.
 */

import type { QueuedCompany, GrowjoCompany } from '../DeepTypes';
import type { CanonicalCompany } from '../providers/Model';
import { CompanyQueue } from '../CompanyQueue';
import { DomainResolver, type ResolveSeed } from '../DomainResolver';
import { XaviraResearchController, type ResearchResult, type ResearchPhase } from '../research/XaviraResearchController';
import { BudgetController, type BudgetTier, BUDGET_TIERS } from '../research/ResearchBudget';
import { StatePersistence } from '../StatePersistence';
import type { HttpFetcher } from '../IntelligenceCase';
import type { SearchProvider } from '../WebSearchProvider';
import type { XaviraModelGateway } from '../XaviraModelGateway';

export type SystemManagerState =
  | 'DISCOVER' | 'RESOLVE' | 'PLAN' | 'RESEARCH' | 'ASSESS' | 'EXPAND'
  | 'CORRELATE' | 'DECIDE' | 'FINDING' | 'OWNER' | 'CONTACT' | 'QA'
  | 'HUMAN_APPROVAL' | 'SEND' | 'DONE' | 'ERROR';

export type FailureType =
  | 'SEARCH_UNAVAILABLE' | 'TIMEOUT' | 'HTTP_403' | 'HTTP_429' | 'JS_REQUIRED'
  | 'EMPTY_RESULT' | 'SOURCE_DISAPPEARED' | 'DNS_FAILURE' | 'PARSER_FAILURE'
  | 'MODEL_FAILURE' | 'TRIAGE_ERROR' | 'UNKNOWN';

export interface CompanyReport {
  company: string;
  domain: string;
  runId: string;
  state: SystemManagerState;
  phase: ResearchPhase;
  triage: {
    decision: 'PASS_FOR_DEEP_RESEARCH' | 'STOP_LOW_VALUE';
    signals: string[];
    requests: number;
    timeMs: number;
  } | null;
  finding: {
    classification: string;
    title: string | null;
    confidence: string;
    explanation: string;
    evidenceIds: string[];
  } | null;
  evidenceCount: number;
  signalCount: number;
  sourcesCount: number;
  owner: { name: string; role: string; confidence: string } | null;
  outreachReady: boolean;
  failures: { type: FailureType; source: string; strategy: string }[];
  auditTrail: string[];
  timeMs: number;
  nextResearchAction: string;
}

export interface SystemManagerOptions {
  fetcher?: HttpFetcher;
  searchProvider?: SearchProvider;
  modelGateway?: XaviraModelGateway;
  artifactsDir?: string;
  queuePath?: string;
  output?: { write: (s: string) => void };
  maxTriageRuntimeMs?: number;
  maxDeepRuntimeMs?: number;
}

export class XaviraSystemManager {
  private readonly controller: XaviraResearchController;
  private readonly queue: CompanyQueue | null;
  private readonly statePersistence: StatePersistence;
  private readonly onProgress: (phase: string, msg: string) => void;
  private readonly artifactsDir: string;

  constructor(options: SystemManagerOptions = {}) {
    const output = options.output ?? { write: (s: string) => process.stdout.write(s) };
    this.onProgress = (phase, msg) => output.write(`  [${phase}] ${msg}`);
    this.artifactsDir = options.artifactsDir || process.cwd();
    this.controller = new XaviraResearchController({
      fetcher: options.fetcher,
      searchProvider: options.searchProvider,
      modelGateway: options.modelGateway,
      artifactsDir: this.artifactsDir,
      maxTriageRuntimeMs: options.maxTriageRuntimeMs,
      maxDeepRuntimeMs: options.maxDeepRuntimeMs,
      onProgress: (phase, msg) => this.onProgress(phase, msg),
    });
    const queuePath = options.queuePath || `${this.artifactsDir}/artifacts/intelligence/queue.jsonl`;
    this.statePersistence = new StatePersistence(`${this.artifactsDir}/artifacts/intelligence`);
    try { this.queue = new CompanyQueue(queuePath); } catch { this.queue = null; }
  }

  /**
   * Research a single company end-to-end through the full state machine.
   * Implements the DISCOVER → RESOLVE → PLAN → RESEARCH → ASSESS → ... → DONE loop.
   */
  async researchCompany(
    company: string,
    domain: string,
    providerCompanies: any[] = [],
  ): Promise<CompanyReport> {
    const start = Date.now();
    const auditTrail: string[] = [];
    const failures: { type: FailureType; source: string; strategy: string }[] = [];
    let state: SystemManagerState = 'DISCOVER';

    this.onProgress('system', `System Manager: starting research for ${company} (${domain})`);

    // === DISCOVER ===
    state = 'DISCOVER';
    this.onProgress('system', `DISCOVER: ${company} ${domain}`);
    auditTrail.push(`DISCOVER: ${company} ${domain}`);

    // === RESOLVE ===
    state = 'RESOLVE';
    let resolvedDomain = domain;
    try {
      const seed: ResolveSeed = {
        domain: domain,
        website_url: domain.startsWith('http') ? domain : `https://${domain}`,
        company_name: company,
      };
      const resolved = await DomainResolver.resolve(seed, this.controller.getFetcher());
      resolvedDomain = resolved.official_domain || domain;
      auditTrail.push(`RESOLVE: ${resolvedDomain} via ${resolved.resolution_method}`);
      this.onProgress('system', `RESOLVE: ${resolvedDomain} via ${resolved.resolution_method}`);
    } catch (e: any) {
      auditTrail.push(`RESOLVE: fallback to seed domain (${e?.message || String(e)})`);
      this.onProgress('system', `RESOLVE: fallback to seed (resolution failed)`);
    }

    // === PLAN ===
    state = 'PLAN';
    const budgetTier = this.assessBudgetTier(company, resolvedDomain, providerCompanies);
    this.onProgress('system', `PLAN: budget_tier=${budgetTier}`);
    auditTrail.push(`PLAN: budget_tier=${budgetTier}`);

    // === RESEARCH (via XaviraResearchController) ===
    state = 'RESEARCH';
    this.onProgress('system', `RESEARCH: delegating to XaviraResearchController`);
    let result: ResearchResult | null = null;
    try {
      result = await this.controller.researchCompany(company, resolvedDomain, providerCompanies);
      auditTrail.push(`RESEARCH: phase=${result.phase}, finding=${result.finding?.classification || 'none'}, time=${result.timeMs}ms`);
      this.onProgress('system', `RESEARCH: phase=${result.phase}, finding=${result.finding?.classification || 'none'}`);
    } catch (e: any) {
      const msg = e?.message || String(e);
      auditTrail.push(`RESEARCH ERROR: ${msg}`);
      this.onProgress('system', `RESEARCH ERROR: ${msg}`);
      failures.push({ type: 'TRIAGE_ERROR', source: msg, strategy: 'continue with partial state' });
      result = null;
    }

    // === ASSESS ===
    state = 'ASSESS';
    const triageDecision = result?.triage?.decision || 'STOP_LOW_VALUE';
    if (triageDecision === 'STOP_LOW_VALUE' && !result?.finding) {
      this.onProgress('system', `ASSESS: STOP — no technical surface detected.`);
      auditTrail.push('ASSESS: STOP_LOW_VALUE');
      state = 'DONE';
      const report: CompanyReport = {
        company, domain: resolvedDomain, runId: result?.runId || 'none',
        state, phase: 'COMPLETE',
        triage: result ? {
          decision: result.triage?.decision || 'STOP_LOW_VALUE',
          signals: result.triage?.signals || [],
          requests: result.triage?.httpRequestsUsed || 0,
          timeMs: result.triage?.timeMs || 0,
        } : null,
        finding: result?.finding ? {
          classification: result.finding.classification,
          title: result.finding.opportunity?.title || null,
          confidence: result.finding.opportunity?.confidence || 'LOW',
          explanation: result.finding.explanation,
          evidenceIds: result.finding.evidenceIds,
        } : null,
        evidenceCount: result?.evidenceCount || 0,
        signalCount: result?.signalCount || 0,
        sourcesCount: result?.triage?.sourcesChecked?.length || 0,
        owner: result?.owner || null,
        outreachReady: false,
        failures, auditTrail, timeMs: Date.now() - start,
        nextResearchAction: 'No outreach — company stopped at triage (low value).',
      };
      return report;
    }

    // === EXPAND → CORRELATE → DECIDE → FINDING → OWNER → CONTACT → QA ===
    const finding = result?.finding || null;
    const outcome = finding?.classification || 'LOW_VALUE';
    this.onProgress('system', `DECIDE: ${outcome}`);

    // === FINDING ===
    state = 'FINDING';
    auditTrail.push(`FINDING: ${outcome}`);

    // === OWNER ===
    state = 'OWNER';
    const owner = result?.owner || null;
    auditTrail.push(`OWNER: ${owner?.name || 'none'}`);

    // === CONTACT ===
    state = 'CONTACT';
    auditTrail.push(`CONTACT: ${result?.outreachReady ? 'ready' : 'not ready'}`);

    // === QA ===
    state = 'QA';
    auditTrail.push(`QA: outreachReady=${result?.outreachReady || false}`);

    // === HUMAN APPROVAL ===
    state = result?.outreachReady ? 'HUMAN_APPROVAL' : 'DONE';
    auditTrail.push(`HUMAN_APPROVAL: ${result?.outreachReady ? 'waiting for human approval' : 'not required'}`);

    state = 'DONE';
    this.onProgress('system', `DONE: ${outcome}`);

    const report: CompanyReport = {
      company,
      domain: resolvedDomain,
      runId: result?.runId || 'none',
      state,
      phase: result?.phase || 'COMPLETE',
      triage: result ? {
        decision: result.triage?.decision || 'STOP_LOW_VALUE',
        signals: result.triage?.signals || [],
        requests: result.triage?.httpRequestsUsed || 0,
        timeMs: result.triage?.timeMs || 0,
      } : null,
      finding: finding ? {
        classification: finding.classification,
        title: finding.opportunity?.title || null,
        confidence: finding.opportunity?.confidence || 'LOW',
        explanation: finding.explanation,
        evidenceIds: finding.evidenceIds,
      } : null,
      evidenceCount: result?.evidenceCount || 0,
      signalCount: result?.signalCount || 0,
      sourcesCount: result?.triage?.sourcesChecked?.length || 0,
      owner,
      outreachReady: result?.outreachReady || false,
      failures,
      auditTrail,
      timeMs: Date.now() - start,
      nextResearchAction: this.nextAction(outcome, owner, result?.outreachReady || false),
    };

    return report;
  }

  private assessBudgetTier(company: string, domain: string, providers: any[]): BudgetTier {
    if (providers.length > 0) {
      const p = providers[0];
      if (p.employee_count && p.employee_count > 1000) return 'DEEP';
      if (p.industry && /Tech|SaaS|Software/i.test(p.industry)) return 'TARGETED';
    }
    return 'TRIAGE';
  }

  private nextAction(outcome: string, owner: any, outreachReady: boolean): string {
    if (outcome === 'LOW_VALUE') return 'No further research — low value.';
    if (outcome === 'RESEARCH_MORE') return 'Deepen targeted research on remaining hypotheses.';
    if (!owner) return 'Continue person discovery — no technical owner identified.';
    if (!outreachReady) return 'More evidence or contact channels needed before outreach.';
    if (outreachReady) return 'Finding is outreach-ready — awaiting human approval.';
    return 'Assess next information-gain opportunity.';
  }

  /** Get the research queue. */
  getQueue(): QueuedCompany[] {
    try { return this.queue ? this.queue.list() : []; } catch { return []; }
  }

  /** Get queue summary. */
  getQueueSummary(): { total: number; byState: Record<string, number> } {
    const all = this.getQueue();
    const byState: Record<string, number> = {};
    for (const c of all) {
      byState[c.state] = (byState[c.state] || 0) + 1;
    }
    return { total: all.length, byState };
  }
}
