/**
 * XAVIRA INTELLIGENCE OPERATOR
 * ─────────────────────────────────────────────────────────────────────────────
 * The interactive terminal operator. Turns the script-driven intelligence
 * pipeline into a conversational, stage-by-stage operator.
 *
 * Reuses (does NOT replace):
 *   - IntelligenceEngine            (observation → evidence → finding → owner → email)
 *   - LivePublicObservationProvider (real PUBLIC observation, PRODUCTION mode)
 *   - PublicLinkDiscovery           (bounded same-origin professional page discovery)
 *   - PeopleExtractor               (public people/owner extraction)
 *   - OwnerSelector                 (evidence-backed owner selection)
 *
 * All network access is READ-ONLY, same-origin, bounded, and polite.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { IntelligenceCase } from './IntelligenceCase';
import { IntelligenceEngine } from './IntelligenceEngine';
import { LivePublicObservationProvider } from './LivePublicObservationProvider';
import { PublicLinkDiscovery } from './PublicLinkDiscovery';
import { PeopleExtractor } from './PeopleExtractor';
import { OwnerSelector } from './OwnerSelector';
import type {
  OwnerCandidate, CompanySurface, DiscoveredPage,
  PublicObservationProvider
} from './IntelligenceCase';
import type { Fetcher } from './PublicLinkDiscovery';
import { DeepProspectBuilder } from './DeepProspectBuilder';
import type { DeepProspect, DeepStage } from './DeepTypes';

export interface XaviraOperatorOptions {
  /** Injectable fetcher used by discovery + observation provider. */
  fetch?: Fetcher;
  /** Injectable artifact persistence (avoids touching the real filesystem in tests). */
  saveArtifact?: (filePath: string, data: string) => void;
  /** Inject a fixed list of input lines to drive the REPL in tests. */
  inputLines?: string[];
  /** Inject an output sink for capturing output in tests. */
  output?: { write: (s: string) => void };
  /** Bounded crawl tuning. */
  maxDiscoveryPages?: number;
  discoveryDelayMs?: number;
  discoveryTimeoutMs?: number;
  /** Delay between observation requests (default 200ms). */
  observationDelayMs?: number;
  /** Inject an observation provider (e.g. a mock) for testing the full pipeline. */
  observationProvider?: PublicObservationProvider;
  /** Override the base directory for persisted artifacts (defaults to cwd). */
  artifactsDir?: string;
}

export class XaviraOperator {
  private fetcher: Fetcher | undefined;
  private saveArtifact: ((filePath: string, data: string) => void) | undefined;
  private output: { write: (s: string) => void };
  private maxDiscoveryPages: number;
  private discoveryDelayMs: number;
  private discoveryTimeoutMs: number;
  private _options: XaviraOperatorOptions;

  // session state
  private currentCase: IntelligenceCase | null = null;
  private surface: CompanySurface | null = null;
  private htmlByUrl = new Map<string, string>();
  private ownerCandidates: OwnerCandidate[] = [];
  private selectedOwner: OwnerCandidate | null = null;
  private artifactPath: string | null = null;
  private lastTargetUrl: string | null = null;
  private sendingConfigured: boolean = this.checkSendingConfigured();
  private shouldExit = false;
  private observationDelayMs: number;
  private injectedProvider: PublicObservationProvider | undefined;

  // deep-intelligence session state (additive — does not affect `research`)
  private currentDeep: DeepProspect | null = null;
  private deepProspects: DeepProspect[] = [];
  private artifactsDir?: string;

  constructor(options: XaviraOperatorOptions = {}) {
    this._options = options;
    this.fetcher = options.fetch;
    this.saveArtifact = options.saveArtifact;
    this.output = options.output ?? { write: (s: string) => process.stdout.write(s) };
    this.maxDiscoveryPages = options.maxDiscoveryPages ?? 12;
    this.discoveryDelayMs = options.discoveryDelayMs ?? 250;
    this.discoveryTimeoutMs = options.discoveryTimeoutMs ?? 8000;
    this.observationDelayMs = options.observationDelayMs ?? 200;
    this.injectedProvider = options.observationProvider;
    this.artifactsDir = options.artifactsDir;
  }

  // ═════════════════════════ PUBLIC API ════════════════════════════════════

  /** Run the interactive REPL. */
  async start(): Promise<void> {
    this.printBanner();

    if (this._options?.inputLines) {
      // test mode: drive from injected lines
      await this.runLines(this._options.inputLines);
      this.println('');
      return;
    }

    // real mode: readline over stdin
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout as any,
      prompt: 'xavira> '
    });
    rl.prompt();
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length > 0) await this.dispatch(trimmed);
      if (this.shouldExit) { rl.close(); break; }
      rl.prompt();
    }
  }

  async dispatch(line: string): Promise<void> {
    const [cmd, ...rest] = line.split(/\s+/);
    const args = rest.join(' ').trim();
    const command = (cmd || '').toLowerCase();

    try {
      switch (command) {
        case 'research':  await this.cmdResearch(args); break;
        case 'deep':      await this.cmdDeep(args); break;
        case 'status':    this.cmdStatus(); break;
        case 'show':      this.cmdShow(args); break;
        case 'why':       args.toLowerCase() === 'owner' ? this.cmdWhyOwner() : this.println('Unknown "why" subcommand. Use "why owner".'); break;
        case 'draft':     args.toLowerCase() === 'email' ? this.cmdDraftEmail() : this.println('Unknown "draft" subcommand. Use "draft email".'); break;
        case 'export':    this.cmdExport(); break;
        case 'help':      this.cmdHelp(); break;
        case 'send':      await this.cmdSend(args); break;
        case 'exit':
        case 'quit':      this.shouldExit = true; this.println('Operator session ended. Goodbye.'); break;
        default:          this.println(`Unknown command: "${command}". Type "help" for available commands.`); break;
      }
    } catch (e: any) {
      this.println(`[${command}] Error: ${e?.message || String(e)}`);
    }
  }

  // ═════════════════════════ COMMANDS ══════════════════════════════════════

  /** research <url> | research again */
  async cmdResearch(target: string): Promise<IntelligenceCase | null> {
    let urlToUse = target;
    if (!target || target.toLowerCase() === 'again') {
      if (target.toLowerCase() === 'again') {
        if (!this.surface) { this.println('No previous target. Run "research <url>" first.'); return null; }
        urlToUse = this.surface.homepage;
        this.println(`Re-running research for previous target: ${urlToUse}`);
      } else {
        this.println('Usage: research <company-url>   (or "research again")');
        return null;
      }
    }

    let parsed: URL;
    try { parsed = new URL(urlToUse.startsWith('http') ? urlToUse : `https://${urlToUse}`); }
    catch { this.println(`Invalid URL: ${urlToUse}`); return null; }
    this.lastTargetUrl = parsed.href;

    this.println(`\n=== XAVIRA RESEARCH: ${parsed.hostname} ===`);
    this.progress('company', 'discovering public company surface', parsed.hostname);

    // reset session state
    this.currentCase = null;
    this.surface = null;
    this.htmlByUrl.clear();
    this.ownerCandidates = [];
    this.selectedOwner = null;
    this.artifactPath = null;

    // 1) PUBLIC-LINK DISCOVERY (bounded, same-origin, read-only)
    this.progress('pages', 'crawling bounded same-origin professional links...', '');
    let surface: CompanySurface;
    try {
      surface = await PublicLinkDiscovery.discover(parsed.href, {
        maxPages: this.maxDiscoveryPages,
        delayMs: this.discoveryDelayMs,
        timeoutMs: this.discoveryTimeoutMs,
        fetcher: this.fetcher,
        logger: (m) => this.println(`  ${m}`),
        onProgress: (page) => this.println(`  [pages] ${page.category}  ${page.path}  (HTTP ${page.status ?? '?'})`),
        onHtml: (url, html) => { this.htmlByUrl.set(url, html); }
      });
    } catch (e: any) {
      this.println(`Discovery failed: ${e?.message || String(e)}`);
      return null;
    }
    this.surface = surface;
    this.println('\nDiscovered pages:');
    for (const p of surface.discovered_pages) this.println(`  • ${(p.category ?? 'unknown').padEnd(14)} ${p.url}`);

    // 2) ENGINEERING / TECH PAGE FOCUS
    const engPages = surface.discovered_pages.filter(p =>
      p.category === 'engineering' || p.category === 'docs' || p.category === 'security' || p.category === 'status_ops'
    );
    this.progress('engineering', `Found ${engPages.length} engineering/technical pages`, '');
    for (const p of engPages) this.println(`  [engineering] ${p.url}`);

    // 3) PEOPLE EXTRACTION (publicly listed professionals)
    const pagesForPeople = surface.discovered_pages.filter(p =>
      p.category === 'team_people' || p.category === 'about' || p.category === 'engineering'
    );
    const candidates = PeopleExtractor.extractFromPages(pagesForPeople, this.htmlByUrl, {
      company: surface.company,
      technicalAreaHints: ['api', 'backend', 'infrastructure', 'platform', 'security']
    });
    this.ownerCandidates = this.dedupeCandidates(candidates);
    this.progress('people', `${this.ownerCandidates.length} owner candidate(s) extracted`, '');
    for (const c of this.ownerCandidates) this.println(`  [people] ${c.name} — ${c.role}  (confidence: ${c.confidence})  @ ${c.source_urls[0]}`);

    // 4) OWNER SELECTION
    const findingArea = this.guessFindingType(engPages);
    const sel = OwnerSelector.select(this.ownerCandidates, findingArea);
    this.selectedOwner = sel.candidate;
    this.progress('owner', sel.candidate ? `${sel.candidate.name} (${sel.candidate.role})` : '(no evidence-backed owner)', '');
    if (sel.candidate) this.println(`  ${sel.reason}`);
    else this.println(`  ${sel.reason}`);

    // 5) INTELLIGENCE PIPELINE (real public observation — PRODUCTION mode)
    const provider: PublicObservationProvider = this.injectedProvider ?? new LivePublicObservationProvider({
      onPage: (url, status, latency) => this.progress('evidence', `observed ${new URL(url).pathname} → HTTP ${status} (${latency}ms)`, ''),
      fetcher: this.fetcher,
      delayMs: this.observationDelayMs
    });

    this.progress('evidence', 'observing public surface (bounded crawl)...', '');
    let caseResult: IntelligenceCase;
    try {
      caseResult = await IntelligenceEngine.run(
        surface.company,
        surface.homepage,
        sel.candidate?.name || '',
        sel.candidate?.role || '',
        sel.ownerEvidenceString,
        [],
        'PRODUCTION',
        undefined,
        provider,
        (stage, message) => this.progress(stage, message, '')
      );
    } catch (e: any) {
      this.println(`Pipeline error: ${e?.message || String(e)}`);
      return null;
    }

    // attach operator-level artifacts (additive, backward compatible)
    caseResult.owner_candidates = this.ownerCandidates;
    caseResult.company_surface = surface;
    this.currentCase = caseResult;

    this.progress('findings', `finding: ${caseResult.finding_classification?.finding_type || 'NONE'}`, '');
    this.progress('owner', `engine owner: ${caseResult.technical_owner?.name || '(none)'} — ${caseResult.technical_owner?.owner_confidence || 'LOW'}`, '');
    this.progress('email', `decision: ${caseResult.prospect_decision}`, '');

    // 6) PERSIST ARTIFACT
    this.artifactPath = this.persistArtifact(caseResult, surface.company);

    this.println('\n--- Research complete ---');
    this.println(`Decision:       ${caseResult.prospect_decision}`);
    this.println(`Finding:        ${caseResult.finding_classification?.finding_type || 'NONE'}`);
    this.println(`Owner:          ${caseResult.technical_owner?.name || '(none)'} [${caseResult.technical_owner?.owner_confidence || 'LOW'}]`);
    this.println(`Evidence count: ${caseResult.evidence.length}`);
    this.println(`Artifact:       ${this.artifactPath}`);
    this.println('\nCommands: status | show findings | show evidence | show people | why owner | draft email | export | help | exit\n');
    return caseResult;
  }

  cmdStatus(): void {
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;
    this.println(`\n=== STATUS: ${c.company} ===`);
    this.println(`Mode:            ${c.mode}`);
    this.println(`Decision:        ${c.prospect_decision}`);
    this.println(`Fit:             ${c.fit_status}`);
    this.println(`Finding:         ${c.finding_classification?.finding_type || 'NONE'} (${c.finding_classification?.impact_severity || 'UNKNOWN'})`);
    this.println(`Evidence:        ${c.evidence.length} observations, ${c.discovery_errors} discovery errors`);
    this.println(`Owner:           ${c.technical_owner?.name || '(none)'} [${c.technical_owner?.owner_confidence || 'LOW'}]`);
    this.println(`Owner candidates:${c.owner_candidates?.length || 0}`);
    this.println(`Claim validation:${c.claim_validation}`);
    if (c.contradictions.length > 0) {
      this.println('Contradictions:');
      c.contradictions.forEach(x => this.println(`  - ${x}`));
    }
    this.println(`Audit trail:     ${c.audit_trail.length} entries`);
  }

  cmdShow(args: string): void {
    const sub = args.toLowerCase();
    // `show all` routes to the deep dossier and should not be blocked by the
    // basic-case guard (a deep run may exist without a classic `research` case).
    if (sub === 'all') { this.cmdShowAll(); return; }
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;


    if (sub.startsWith('findings')) {
      this.println(`\n=== FINDINGS ===`);
      this.println(`Type:        ${c.finding_classification?.finding_type || 'NONE'}`);
      this.println(`Severity:    ${c.finding_classification?.impact_severity || 'UNKNOWN'}`);
      this.println(`Basis:       ${c.finding_classification?.severity_basis || ''}`);
      const s = c.finding_strength;
      if (s) {
        this.println(`Strength:`);
        this.println(`  evidence_strength:     ${s.evidence_strength}`);
        this.println(`  reproducibility:        ${s.reproducibility}`);
        this.println(`  source_quality:         ${s.source_quality}`);
        this.println(`  technical_specificity:  ${s.technical_specificity}`);
        this.println(`  owner_confidence:       ${s.owner_confidence}`);
      }
      if (c.technical_thesis) {
        this.println(`Thesis:`);
        this.println(`  fact:        ${c.technical_thesis.source_fact}`);
        this.println(`  observation: ${c.technical_thesis.xavira_observation}`);
        this.println(`  inference:   ${c.technical_thesis.xavira_inference}`);
      }
      if (c.uncertainty_model) {
        this.println(`Uncertainty:`);
        this.println(`  know:      ${c.uncertainty_model.what_we_know}`);
        this.println(`  observed:  ${c.uncertainty_model.what_we_observed}`);
        this.println(`  infer:     ${c.uncertainty_model.what_we_infer}`);
        this.println(`  unknown:   ${c.uncertainty_model.what_we_do_not_know}`);
      }
      return;
    }

    if (sub.startsWith('evidence')) {
      this.println(`\n=== EVIDENCE (${c.evidence.length}) ===`);
      for (const e of c.evidence) {
        this.println(`\n[id]      ${e.id}`);
        this.println(`  url:           ${e.public_url}`);
        this.println(`  origin:        ${e.evidence_origin}`);
        this.println(`  type:          ${e.source_type}`);
        this.println(`  status:        ${e.status ?? 'n/a'}`);
        this.println(`  behavior:      ${e.observed_behavior}`);
        this.println(`  latency:       ${e.latency_ms ?? 'n/a'}ms`);
        this.println(`  reproductions: ${e.reproductions} (repeatable: ${e.repeatable})`);
        this.println(`  tested_no_auth:${e.tested_without_auth}`);
        if (e.sensitive_fields?.length) this.println(`  sensitive:     ${e.sensitive_fields.join(', ')}`);
        if (e.owner_source_link) this.println(`  owner source:  ${e.owner_source_link}`);
      }
      return;
    }

    if (sub.startsWith('people')) { this.cmdShowPeople(); return; }

    this.println(`Unknown "show" subcommand. Use: show findings | show evidence | show people | show all`);
  }

  cmdShowPeople(): void {
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;
    this.println(`\n=== PEOPLE / OWNER CANDIDATES ===`);
    if (!c.owner_candidates || c.owner_candidates.length === 0) {
      this.println('No publicly listed persons matched candidate technical roles.');
    } else {
      for (const cand of c.owner_candidates) {
        this.println(`\n- ${cand.name} — ${cand.role}  [${cand.confidence}]`);
        this.println(`  company:  ${cand.company}`);
        this.println(`  sources:  ${cand.source_urls.join(', ')}`);
        this.println(`  relation: ${cand.relationship_to_area}`);
        this.println(`  evidence:`);
        for (const ev of cand.evidence) this.println(`    • ${ev.slice(0, 200)}`);
      }
    }
    this.println('\nEngine-verified technical owner:');
    const o = c.technical_owner;
    if (o && o.name) {
      this.println(`  name:        ${o.name}`);
      this.println(`  role:        ${o.role}`);
      this.println(`  source:      ${o.owner_source}`);
      this.println(`  evidence:    ${o.owner_evidence}`);
      this.println(`  confidence:  ${o.owner_confidence}`);
      this.println(`  verified:    ${o.verified_relevance}`);
    } else {
      this.println('  (no evidence-backed owner — confidence LOW)');
    }
  }

  cmdWhyOwner(): void {
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;
    const o = c.technical_owner;
    this.println(`\n=== WHY OWNER ===`);
    if (!this.selectedOwner) {
      this.println('No candidate was selected because no publicly listed person matched a candidate role.');
      if (this.ownerCandidates.length === 0) this.println('No people were discovered on the company public pages.');
    } else {
      this.println(`Selected candidate: ${this.selectedOwner.name} — ${this.selectedOwner.role}`);
      this.println(`Confidence:        ${this.selectedOwner.confidence}`);
      this.println(`Explicit evidence: ${this.selectedOwner.explicit_evidence}`);
      this.println(`Relationship:      ${this.selectedOwner.relationship_to_area}`);
      this.println(`Source URLs:`);
      this.selectedOwner.source_urls.forEach(u => this.println(`  • ${u}`));
      this.println(`Evidence excerpts:`);
      this.selectedOwner.evidence.forEach(e => this.println(`  • ${e.slice(0, 200)}`));
    }
    this.println('\nEngine decision:');
    this.println(`  owner name:     ${o?.name || '(none)'}`);
    this.println(`  owner source:   ${o?.owner_source || 'NONE'}`);
    this.println(`  verified:       ${o?.verified_relevance}`);
    this.println(`  owner evidence: ${o?.owner_evidence}`);
    this.println(`  confidence:     ${o?.owner_confidence || 'LOW'}`);
    this.println('\nRule: owner confidence HIGH is required for an email GO. It requires explicit');
    this.println('public listing evidence (a person + role on a team/leadership/about page).');
  }

  cmdDraftEmail(): void {
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;
    if (c.prospect_decision !== 'GO') {
      this.println('\n=== EMAIL DRAFT BLOCKED ===');
      this.println(`Decision: ${c.prospect_decision} (email only drafted on GO)`);
      if (c.contradictions.length > 0) {
        this.println('Blocking contradictions:');
        c.contradictions.forEach(x => this.println(`  - ${x}`));
      }
      if (!c.finding_classification || c.finding_classification.finding_type === 'GENERIC_ENGINEERING_ARTICLE') {
        this.println('Reason: No defensible technical finding (generic engineering content alone is not a finding).');
      }
      if (!c.technical_owner || c.technical_owner.owner_confidence !== 'HIGH') {
        this.println('Reason: No evidence-backed technical owner (HIGH confidence required).');
      }
      this.println('\nUse "why owner" to inspect owner reasoning, or "research again" with a stronger target.');
      return;
    }
    if (c.claim_validation !== 'PASSED') {
      this.println(`Email not drafted: claim QA = ${c.claim_validation}`);
      return;
    }
    this.println('\n=== EMAIL DRAFT (NOT SENT) ===');
    this.println(`To:    ${c.technical_owner?.name || 'technical owner'}`);
    this.println(`Role:  ${c.technical_owner?.role || ''}`);
    this.println(`From:  Vishnu (solo founder, XAVIRA)`);
    this.println(`Subject: ${c.subject}\n`);
    this.println('--- body ---');
    this.println(c.body);
    this.println('--- end ---\n');
    this.println('NEVER AUTO-SENT. Use "send" (requires explicit confirmation + configured transport).');
  }

  cmdExport(): void {
    if (!this.currentCase) { this.println('No active research to export.'); return; }
    if (!this.artifactPath) this.artifactPath = this.persistArtifact(this.currentCase, this.currentCase.company);
    this.println(`Artifact persisted at: ${this.artifactPath}`);
  }

  cmdHelp(): void {
    this.println(`\nXAVIRA INTELLIGENCE OPERATOR — commands`);
    this.println(`  research <url>     Start a public-surface research run for a company URL.`);
    this.println(`                       Use "research again" to re-run the previous target.`);
    this.println(`  status                  Show the current intelligence case status.`);
    this.println(`  show findings           Show finding classification, strength, thesis, uncertainty.`);
    this.println(`  show evidence           List all evidence observations with lineage.`);
    this.println(`  show people             List owner candidates + engine-verified owner.`);
    this.println(`  why owner               Explain owner selection and confidence rationale.`);
    this.println(`  draft email             Show the finding-led draft email (if decision is GO).`);
    this.println(`  export                  Persist/rewrite the intelligence artifact to disk.`);
    this.println(`  send [--confirm]        Record send intent (only if transport configured + confirmed).`);
    this.println(`  deep <url>              Deep-research a company (high-precision prospect dossier).`);
    this.println(`      deep research <url>  Same as above (explicit verb).`);
    this.println(`      deep file <csv>      Batch deep-research a CSV of companies.`);
    this.println(`      deep prospects       List persisted deep-prospect dossiers.`);
    this.println(`  show all               Show the complete current deep-prospect dossier.`);
    this.println(`  help                    Show this help.`);
    this.println(`  exit | quit             Leave the operator.`);
    this.println(`\nAll observation is READ-ONLY and strictly bounded to the target company domain.`);
  }

  async cmdSend(args: string): Promise<void> {
    if (!this.currentCase) { this.println('No active research. Run "research <url>" first.'); return; }
    const c = this.currentCase;
    // Human approval gate comes FIRST: even without a configured transport, the
    // operator must refuse any send that lacks explicit confirmation.
    const confirm = args.includes('--confirm') || args.toLowerCase().includes('confirm');
    if (!confirm) {
      this.println(`Send requires explicit confirmation. Re-run as: send --confirm`);
      return;
    }
    if (c.prospect_decision !== 'GO' || c.claim_validation !== 'PASSED') {
      this.println('Send blocked: decision is not GO or claim QA did not PASS.');
      return;
    }
    if (!this.sendingConfigured) {
      this.println('Sending is NOT configured. To enable, set XAVIRA_SMTP_HOST / XAVIRA_SMTP_USER /');
      this.println('XAVIRA_SMTP_PASS / XAVIRA_FROM / XAVIRA_SMTP_PORT in the environment.');
      this.println('No email will be sent until a transport is explicitly configured.');
      return;
    }
    // Sending is intentionally NOT implemented as an auto-send path. Even when a
    // transport exists, the operator only records intent; actual delivery always
    // requires a final human confirmation in the interactive terminal. This stub
    // preserves that contract and never auto-delivers.
    this.println('Intent recorded: send requested with --confirm. Operator would deliver via the');
    this.println(`configured SMTP transport to ${c.technical_owner?.name || ''}. Review and confirm`);
    this.println('delivery in the interactive terminal before any actual send occurs.');
  }

  // ═════════════════════════ DEEP INTELLIGENCE COMMANDS ═══════════════════════
  // High-precision prospect research layered ADDITIVELY on the existing engine.
  // Reuses PublicLinkDiscovery / PeopleExtractor / OwnerSelector /
  // LivePublicObservationProvider / IntelligenceEngine; adds deep signals, ICP
  // qualification, contactability, owner graph, and finding-led email.

  /** deep <url> | deep research <url> | deep file <csv> | deep prospects | deep help */
  async cmdDeep(args: string): Promise<void> {
    const toks = args.trim().split(/\s+/);
    const head = (toks[0] || '').toLowerCase();
    if (!head) { this.printDeepHelp(); return; }
    if (head === 'research') { await this.cmdDeepResearch(toks.slice(1).join(' ')); return; }
    if (head === 'file')   { await this.cmdDeepFile(toks.slice(1).join(' ')); return; }
    if (head === 'prospects' || head === 'list') { this.cmdDeepProspects(); return; }
    if (head === 'help')   { this.printDeepHelp(); return; }
    // bare URL -> treat the whole arg string as the target
    await this.cmdDeepResearch(args);
  }

  private printDeepHelp(): void {
    this.println(`\nXAVIRA DEEP INTELLIGENCE — commands`);
    this.println(`  deep <url>          Deep-research a single company URL (full prospect dossier).`);
    this.println(`  deep research <url> Same as above (explicit verb).`);
    this.println(`  deep file <csv>     Batch deep-research every URL/company in a CSV file.`);
    this.println(`  deep prospects      List previously persisted deep-prospect dossiers.`);
    this.println(`  show all            Show the complete current deep-prospect dossier.`);
    this.println(`\nDeep research is READ-ONLY and strictly bounded to the target public surface.`);
  }

  private deepBuilder(verbose: boolean) {
    return new DeepProspectBuilder({
      fetcher: this.fetcher,
      saveArtifact: this.saveArtifact,
      maxDiscoveryPages: this.maxDiscoveryPages,
      discoveryDelayMs: this.discoveryDelayMs,
      discoveryTimeoutMs: this.discoveryTimeoutMs,
      observationDelayMs: this.observationDelayMs,
      observationProvider: this.injectedProvider ?? null,
      artifactsBaseDir: this.artifactsDir,
      onProgress: (stage: DeepStage, message: string) => this.progress(stage, message),
      logger: verbose ? (m: string) => this.println(`  ${m}`) : undefined
    });
  }

  private async cmdDeepResearch(target: string): Promise<void> {
    let parsed: URL;
    try { parsed = new URL(target.startsWith('http') ? target : `https://${target}`); }
    catch { this.println(`Invalid URL: ${target}`); return; }
    this.println(`\n=== XAVIRA DEEP INTELLIGENCE: ${parsed.hostname} ===`);
    this.currentDeep = null;
    const builder = this.deepBuilder(true);
    const { prospect, case_ref } = await builder.build(parsed.href);
    this.currentDeep = prospect;
    this.deepProspects.push(prospect);
    if (case_ref) {
      case_ref.owner_candidates = prospect.owner_candidates;
      case_ref.company_surface = prospect.public_surface;
      this.currentCase = case_ref; // keep existing show/status commands working
    }
    this.println('\n--- Deep research complete ---');
    this.println(`Decision:        ${prospect.decision} (confidence ${prospect.confidence})`);
    this.println(`Fit:             ${prospect.fit}`);
    this.println(`Industry:        ${prospect.industry}`);
    this.println(`Signals:         ${prospect.technical_signals.length} (${prospect.documented_facts.length} documented facts, ${prospect.public_observations.length} observations, ${prospect.inferences.length} inferred)`);
    this.println(`People:          ${prospect.people.length}`);
    this.println(`Owner:           ${prospect.selected_owner ? `${prospect.selected_owner.name} (${prospect.selected_owner.role}) — ${prospect.selected_owner.confidence}` : '(none)'}`);
    this.println(`Contacts:        ${prospect.contactability.length}`);
    this.println(`Finding:         ${prospect.findings ? prospect.findings.finding_type : 'NONE'}`);
    this.println(`Email draft:     ${prospect.email_draft.generated ? 'YES' : 'NO — ' + (prospect.email_draft.blocked_reason || '')}`);
    this.println(`Artifact:        ${prospect.artifact_path}`);
    this.println(`Stages: status | show findings | show evidence | show people | show all | why owner | draft email | deep prospects | help | exit\n`);
  }

  private async cmdDeepFile(csvPath: string): Promise<void> {
    if (!csvPath) { this.println('Usage: deep file <csv-path>'); return; }
    let rows: string[];
    try {
      const content = fs.readFileSync(csvPath, 'utf8');
      rows = content.split(/\r?\n/).filter(r => r.trim().length > 0);
    } catch (e: any) {
      this.println(`Could not read CSV: ${e?.message || String(e)}`);
      return;
    }
    if (rows.length < 2) { this.println('CSV must have a header row plus at least one prospect row.'); return; }
    const header = rows[0].split(',').map(h => h.trim().toLowerCase());
    // Prefer a URL-like column over a bare company name column.
    const columnPriority = ['url', 'domain', 'website', 'homepage', 'company', 'name'];
    let idx = -1;
    for (const col of columnPriority) {
      const i = header.indexOf(col);
      if (i >= 0) { idx = i; break; }
    }
    if (idx < 0) { this.println('CSV header must contain a company/url/domain/website column.'); return; }
    const dataRows = rows.slice(1)
      .map(r => (r.split(',')[idx] || '').trim())
      .filter(Boolean);
    if (dataRows.length === 0) { this.println('No prospect rows found in CSV.'); return; }

    this.println(`\n=== XAVIRA DEEP BATCH: ${dataRows.length} prospect(s) ===`);
    const results: Array<{ company: string; decision: string; finding: string; owner: string; artifact_path: string }> = [];
    const reasons: string[] = [];
    for (const r of dataRows) {
      try {
        const builder = this.deepBuilder(false);
        const { prospect } = await builder.build(r.startsWith('http') ? r : `https://${r}`);
        results.push({
          company: prospect.company,
          decision: prospect.decision,
          finding: prospect.findings?.finding_type || 'NONE',
          owner: prospect.selected_owner ? prospect.selected_owner.name : '(none)',
          artifact_path: prospect.artifact_path
        });
        if (!prospect.email_draft.generated) reasons.push(...(prospect.qualification_reasons || []));
        this.println(`  • ${prospect.company} → ${prospect.decision} (finding: ${prospect.findings?.finding_type || 'NONE'}, owner: ${prospect.selected_owner ? prospect.selected_owner.name : '(none)'})`);
      } catch (e: any) {
        results.push({ company: r, decision: 'NO_GO', finding: 'ERROR', owner: '(none)', artifact_path: '' });
        reasons.push(`Error researching ${r}: ${e?.message || String(e)}`);
        this.println(`  • ${r} → ERROR: ${e?.message || String(e)}`);
      }
    }

    const total = results.length;
    const ready = results.filter(x => x.decision === 'READY').length;
    const research_more = results.filter(x => x.decision === 'RESEARCH_MORE').length;
    const no_go = results.filter(x => x.decision === 'NO_GO').length;

    const dir = path.join(this.artifactsDir || process.cwd(), 'artifacts', 'intelligence', 'deep');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const summaryPath = path.join(dir, `_batch_${ts}.json`);
    const summary = {
      total, ready, research_more, no_go,
      generated: new Date().toISOString(),
      results,
      top_reasons_for_rejection: Array.from(new Set(reasons)).slice(0, 10)
    };
    const data = JSON.stringify(summary, null, 2);
    if (this.saveArtifact) this.saveArtifact(summaryPath, data);
    else { try { fs.mkdirSync(dir, { recursive: true }); } catch { /* exists */ } fs.writeFileSync(summaryPath, data, 'utf8'); }
    this.println(`\nBatch summary: ${total} total → ${ready} READY, ${research_more} RESEARCH_MORE, ${no_go} NO_GO`);
    this.println(`Summary artifact: ${summaryPath}`);
  }

  private cmdDeepProspects(): void {
    const dir = path.join(this.artifactsDir || process.cwd(), 'artifacts', 'intelligence', 'deep');
    if (!fs.existsSync(dir)) { this.println('No deep-prospect artifacts found yet.'); return; }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_batch_')).sort().reverse();
    if (files.length === 0) { this.println('No deep-prospect artifacts found yet.'); return; }
    this.println(`\n=== DEEP PROSPECTS (${files.length}) ===`);
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        this.println(`  • ${(d.company ?? f).padEnd(28)} ${(d.decision ?? '?').padEnd(14)} fit=${d.fit ?? '?'}  finding=${(d.findings && d.findings.finding_type) || 'NONE'}  owner=${d.selected_owner?.name || '(none)'}  [${f}]`);
      } catch {
        this.println(`  • ${f} (unreadable)`);
      }
    }
  }

  private cmdShowAll(): void {
    const p = this.currentDeep;
    if (!p) { this.println('No deep research. Run "deep <url>" first.'); return; }
    this.println('\n══════════════════════════════════════════════════════════════');
    this.println('                  DEEP PROSPECT DOSSIER                          ');
    this.println('══════════════════════════════════════════════════════════════');
    this.println(`\n── COMPANY ──`);
    this.println(`  company:  ${p.company}`);
    this.println(`  domain:   ${p.domain}`);
    this.println(`  industry: ${p.industry}`);
    this.println(`  fit:      ${p.fit}`);
    this.println(`  decision: ${p.decision} (confidence ${p.confidence})`);
    if (p.qualification_reasons.length) {
      this.println(`  qualification reasons:`);
      p.qualification_reasons.forEach(r => this.println(`    - ${r}`));
    }
    this.println(`\n── PUBLIC SURFACE (${p.public_surface.discovered_pages.length} pages) ──`);
    for (const pg of p.public_surface.discovered_pages) {
      this.println(`  • ${(pg.category ?? 'other').padEnd(12)} ${pg.url}`);
    }
    this.println(`\n── TECHNICAL SIGNALS (${p.technical_signals.length}) ──`);
    for (const s of p.technical_signals) {
      this.println(`  • [${s.provenance}] ${s.type} / ${s.signal_strength} — ${s.source_url}`);
      this.println(`    excerpt: ${s.excerpt.slice(0, 180)}`);
    }
    this.println(`\n── PEOPLE / OWNER CANDIDATES (${p.owner_candidates.length}) ──`);
    if (p.owner_candidates.length === 0) this.println(`  (no publicly listed persons matched candidate technical roles)`);
    for (const c of p.owner_candidates) {
      this.println(`  • ${c.name} — ${c.role}  [${c.confidence}] @ ${c.source_urls[0]}`);
    }
    this.println(`\n── SELECTED OWNER ──`);
    if (p.selected_owner) {
      this.println(`  name:            ${p.selected_owner.name}`);
      this.println(`  role:            ${p.selected_owner.role}`);
      this.println(`  confidence:      ${p.selected_owner.confidence}`);
      this.println(`  responsibility:  ${p.selected_owner.responsibility_match}`);
      this.println(`  finding_link:    ${p.selected_owner.finding_link}`);
      this.println(`  source_urls:`);
      p.selected_owner.source_urls.forEach(u => this.println(`    • ${u}`));
      this.println(`  owner_evidence:`);
      p.selected_owner.owner_evidence.forEach(e => this.println(`    • ${e.slice(0, 180)}`));
    } else {
      this.println(`  (no evidence-backed owner)`);
    }
    this.println(`\n── EVIDENCE (${p.evidence.length}) / FINDINGS ──`);
    this.println(`  finding: ${p.findings ? p.findings.finding_type : 'NONE'}`);
    for (const e of p.evidence) {
      this.println(`  • [${e.evidence_origin}] ${e.source_type}  ${e.public_url  }  (HTTP ${e.status ?? '?'}, ${e.latency_ms ?? '?'}ms)`);
    }
    this.println(`\n── CONTACTABILITY (${p.contactability.length}) ──`);
    if (p.contactability.length === 0) this.println(`  (no usable public professional contact channel discovered — emails are never guessed)`);
    for (const ct of p.contactability) {
      this.println(`  • [${ct.confidence}] ${ct.type} — ${ct.value} @ ${ct.source_url}`);
    }
    this.println(`\n── ANGLES ──`);
    this.println(`  primary:   ${p.primary_angle}`);
    this.println(`  secondary: ${p.secondary_angle || '(none)'}`);
    this.println(`  subjects:  ${p.recommended_subjects.join(' | ')}`);
    this.println(`\n── EMAIL DRAFT ──`);
    if (p.email_draft.generated) {
      this.println(`  TO:    ${p.selected_owner ? p.selected_owner.name : ''}`);
      this.println(`  FROM:  Vishnu (solo founder, XAVIRA)`);
      this.println(`  SUBJECT (primary):    ${p.email_draft.primary_subject}`);
      this.println(`  SUBJECT (alternate):  ${p.email_draft.alternate_subject}`);
      const eb = p.email_draft.claims.filter(cl => cl.evidence_ids.length > 0).length;
      this.println(`  claims (evidence-backed): ${eb}/${p.email_draft.claims.length}`);
      this.println(`  --- body ---`);
      this.println(p.email_draft.body);
      this.println(`  --- end ---`);
      this.println(`  NEVER AUTO-SENT. Use "send --confirm" (requires configured transport).`);
    } else {
      this.println(`  NOT generated: ${p.email_draft.blocked_reason || 'gates not satisfied'}`);
    }
    this.println(`\n── ARTIFACT ──`);
    this.println(`  ${p.artifact_path}`);
    this.println(`  audit trail (${p.audit_trail.length} entries):`);
    p.audit_trail.slice(0, 14).forEach(a => this.println(`    - ${a}`));
    if (p.audit_trail.length > 14) this.println(`    ... (${p.audit_trail.length - 14} more)`);
  }

  // ═════════════════════════ INTERNALS ═══════════════════════════════════════

  private printBanner(): void {
    this.println('\n╔══════════════════════════════════════════════════════════╗');
    this.println('║              XAVIRA INTELLIGENCE OPERATOR                ║');
    this.println('║  Interactive terminal for public-surface outreach intel  ║');
    this.println('╚══════════════════════════════════════════════════════════╝');
    this.println('Type "help" for commands, "exit" to quit.\n');
  }

  private println(s: string = ''): void { this.output.write(s + '\n'); }

  private progress(stage: string, message: string, _detail = ''): void {
    this.println(`[${stage}] ${message}`);
  }

  private persistArtifact(caseResult: IntelligenceCase, company: string): string {
    const dir = path.join(process.cwd(), 'artifacts', 'intelligence');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const p = path.join(dir, `${ts}-${company.replace(/\s+/g, '_')}.json`);
    const data = JSON.stringify(caseResult, null, 2);
    if (this.saveArtifact) { this.saveArtifact(p, data); return p; }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, data, 'utf8');
    return p;
  }

  private dedupeCandidates(cands: OwnerCandidate[]): OwnerCandidate[] {
    const seen = new Map<string, OwnerCandidate>();
    for (const c of cands) {
      const key = `${c.name.toLowerCase()}|${c.role.toLowerCase()}`;
      const existing = seen.get(key);
      if (!existing || c.confidence === 'HIGH') seen.set(key, c);
    }
    return Array.from(seen.values());
  }

  /** Guess the technical area from discovered engineering/tech pages (best-effort). */
  private guessFindingType(pages: DiscoveredPage[]): string {
    const paths = pages.map(p => p.path.toLowerCase()).filter(Boolean);
    if (paths.some(p => p.startsWith('/status') || p.includes('incident'))) return 'observability status';
    if (paths.some(p => p.startsWith('/security'))) return 'security trust';
    if (paths.some(p => p.startsWith('/api') || p.startsWith('/docs'))) return 'api surface';
    if (paths.some(p => p.startsWith('/blog'))) return 'engineering blog';
    return 'platform engineering';
  }

  private checkSendingConfigured(): boolean {
    return Boolean(process.env.XAVIRA_SMTP_HOST) &&
      Boolean(process.env.XAVIRA_SMTP_USER) &&
      Boolean(process.env.XAVIRA_SMTP_PASS);
  }

  // ── input handling ───────────────────────────────────────────────────────
  private async runLines(lines: string[]): Promise<void> {
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length > 0) {
        const [cmd] = line.split(/\s+/);
        if (cmd?.toLowerCase() === 'exit' || cmd?.toLowerCase() === 'quit') {
          this.shouldExit = true;
          await this.dispatch(line);
          break;
        }
        await this.dispatch(line);
      }
      if (this.shouldExit) break;
    }
  }
}
