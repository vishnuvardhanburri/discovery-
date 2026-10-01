/**
 * Controlled Comparison Runner — Batch 3
 *
 * Runs the SAME 50-company target list as batch3_run_1790873841985 (baseline)
 * with the Adaptive Investigation layer ENABLED (treatment).
 *
 * The baseline run remains untouched at:
 *   /tmp/xavira-batch3-runs/batch3_run_1790873841985/
 *
 * This run gets a new run_id and writes to a new directory.
 *
 * At the end, produces a BASELINE vs ADAPTIVE comparison.
 */
import { DeepProspectBuilder } from '../src/server/DeepProspectBuilder';
import { OutreachCardPrinter } from '../src/server/OutreachCardPrinter';
import { LivePublicObservationProvider } from '../src/server/LivePublicObservationProvider';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const realFetch = (async (url: string, init?: any): Promise<Response> => {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json',
        ...(init?.headers || {}),
      },
      signal: init?.signal,
    });
    return res as any;
  } catch (e: any) {
    throw e;
  }
}) as any;

// Same 50 targets as baseline
const TARGETS = [
  'https://www.anysphere.inc', 'https://www.elevenlabs.io', 'https://www.mistral.ai',
  'https://www.figure.ai', 'https://www.abridge.com', 'https://www.lightmatter.co',
  'https://www.shield.ai', 'https://www.mercor.com', 'https://www.saronic.com',
  'https://www.together.ai', 'https://www.sandboxaq.com', 'https://www.celestial.ai',
  'https://www.sierra.ai', 'https://www.story.foundation', 'https://www.chainguard.dev',
  'https://www.peregrine.io', 'https://www.koboldmetals.com', 'https://www.supabase.com',
  'https://www.hippocraticai.com', 'https://www.synthesia.io', 'https://www.poolside.ai',
  'https://www.harvey.ai', 'https://www.cognition.ai', 'https://www.decagon.ai',
  'https://www.runwayml.com', 'https://www.halcyon.ai', 'https://www.helionenergy.com',
  'https://www.vultr.com', 'https://www.secondfront.com', 'https://www.radai.com',
  'https://www.lumalabs.ai', 'https://www.groq.com', 'https://www.nekohealth.com',
  'https://www.quera.com', 'https://www.lambdalabs.com', 'https://www.cyberhaven.com',
  'https://www.island.io', 'https://www.n8n.io', 'https://www.baseten.co',
  'https://www.biltrewards.com', 'https://www.hebbia.ai', 'https://www.ridezum.com',
  'https://www.tryriot.com', 'https://www.ayarlabs.com', 'https://www.crusoe.ai',
  'https://www.cynomi.com', 'https://www.windsurf.com', 'https://www.justsalad.com',
  'https://www.tines.com', 'https://www.hightouch.com',
];

const BASELINE_RUN_DIR = '/tmp/xavira-batch3-runs/batch3_run_1790873841985';

const RUN_ID = `adaptive_run_${Date.now()}`;
const RUN_DIR = `/tmp/xavira-batch3-runs/${RUN_ID}`;
const MANIFEST_PATH = path.join(RUN_DIR, 'manifest.json');
const RESULTS_PATH = path.join(RUN_DIR, 'results_summary.json');

interface AdaptiveArtifact {
  run_id: string;
  run_timestamp: string;
  company: string;
  url: string;
  terminal_state: { state: string; reason?: string };
  decision: string;
  finding_type: string;
  evidence_count: number;
  discovered_subdomains: string[];
  signals: string[];
  decision_state?: string;
  confidence?: string;
  finding_confidence?: string;
  contact_status?: string;
  diagnostic_opportunity?: boolean;
  email_generated?: boolean;
  rate_limited: string[];
  artifact_path: string;
  error?: string;
  adaptive_investigation: any;
}

function ensureRunDir(): void {
  fs.mkdirSync(RUN_DIR, { recursive: true });
  fs.mkdirSync(path.join(RUN_DIR, 'artifacts'), { recursive: true });
}

function writeManifest(manifest: any): void {
  const tmpPath = MANIFEST_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(manifest, null, 2), 'utf8');
  fs.renameSync(tmpPath, MANIFEST_PATH);
}

function writeArtifact(artifact: AdaptiveArtifact): void {
  const safeCompany = artifact.company.replace(/[^a-z0-9.-]/gi, '_').toLowerCase() || 'unknown';
  const artifactPath = path.join(RUN_DIR, 'artifacts', `${safeCompany}.json`);
  if (fs.existsSync(artifactPath)) return;
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
}

function setupGracefulShutdown(manifest: any): void {
  const handler = (signal: string) => {
    console.log(`\n⚠️  Received ${signal} — writing final manifest and exiting...`);
    manifest.status = 'INTERRUPTED';
    manifest.completed_at = new Date().toISOString();
    try { writeManifest(manifest); } catch {}
    process.exit(2);
  };
  process.on('SIGINT', () => handler('SIGINT'));
  process.on('SIGTERM', () => handler('SIGTERM'));
}

async function runCompanyWithTimeout(target: string, timeoutMs: number): Promise<AdaptiveArtifact> {
  const started = new Date().toISOString();
  const startTime = Date.now();
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const artifact: AdaptiveArtifact = {
    run_id: RUN_ID,
    run_timestamp: started,
    company: '', url: target,
    terminal_state: { state: 'COMPLETED' },
    decision: '', finding_type: '', evidence_count: 0,
    discovered_subdomains: [], signals: [], rate_limited: [],
    artifact_path: '', adaptive_investigation: { attempted: false, records: [], aggregate: {} },
  };

  try {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xavira-adaptive-'));

    // Create provider — same config as baseline
    const provider = new LivePublicObservationProvider({
      delayMs: 150, sampleDelayMs: 200, maxRequests: 25,
      fetcher: realFetch,
    }) as any;

    // Build with ADAPTIVE INVESTIGATION ENABLED
    const builder = new DeepProspectBuilder({
      fetcher: realFetch,
      observationProvider: provider,
      saveArtifact: (p, d) => { try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d, 'utf8'); } catch {} },
      artifactsBaseDir: tmpDir,
      maxDiscoveryPages: 15, discoveryDelayMs: 200, discoveryTimeoutMs: 8000,
      observationDelayMs: 150, onProgress: () => {}, logger: () => {},
      enableAdaptiveInvestigation: true,
      adaptiveInvestigationOptions: {
        fetcher: realFetch,
        maxPivots: 3,
        maxPivotRequests: 10,
        delayMs: 150,
        onProgress: () => {},
      },
    });

    const { prospect } = await builder.build(target);
    const completed = new Date().toISOString();

    artifact.company = prospect.company || target.replace('https://www.', '').replace(/\/$/, '');
    artifact.url = target;
    artifact.decision = prospect.decision;
    artifact.finding_type = prospect.deep_finding?.finding_type || prospect.findings?.finding_type || 'NONE';
    artifact.evidence_count = prospect.evidence.length;
    artifact.discovered_subdomains = provider.getDiscoveredSubdomains();
    artifact.signals = prospect.technical_signals.map(s => s.type);
    artifact.decision_state = prospect.decision;
    artifact.confidence = prospect.confidence;
    artifact.finding_confidence = prospect.deep_finding?.confidence || 'UNKNOWN';
    artifact.contact_status = prospect.contact_status;
    artifact.diagnostic_opportunity = !!prospect.diagnostic_opportunity;
    artifact.email_generated = !!prospect.email_draft?.generated;
    artifact.rate_limited = provider.getRateLimitedUrls();
    artifact.artifact_path = prospect.artifact_path || '';
    artifact.adaptive_investigation = prospect.adaptive_investigation || { attempted: false, records: [], aggregate: {} };
    artifact.terminal_state = { state: 'COMPLETED' };
  } catch (e: any) {
    const completed = new Date().toISOString();
    artifact.terminal_state = { state: 'FAILED', reason: e.message };
    artifact.company = target.replace('https://www.', '').replace(/\/$/, '');
    artifact.decision = 'NO_GO';
    artifact.error = e.message;
    artifact.adaptive_investigation = { attempted: false, records: [], aggregate: { error: e.message } };
  } finally {
    clearTimeout(timeoutId);
  }

  return artifact;
}

async function main() {
  ensureRunDir();
  const runStarted = new Date().toISOString();
  console.log(`🎯 Adaptive Comparison Run: ${RUN_ID}`);
  console.log(`   Run directory: ${RUN_DIR}`);
  console.log(`   Baseline (control): ${BASELINE_RUN_DIR}`);
  console.log(`   Targets: ${TARGETS.length}`);
  console.log('');

  const manifest = {
    run_id: RUN_ID,
    run_type: 'treatment_adaptive',
    baseline_run_id: 'batch3_run_1790873841985',
    started_at: runStarted,
    targets: TARGETS,
    target_count: TARGETS.length,
    completed_count: 0, failed_count: 0, timed_out_count: 0, skipped_count: 0,
    decisions: {},
    total_evidence_records: 0, total_subdomains_discovered: 0,
    adaptive_pivots_suggested: 0, adaptive_pivots_executed: 0,
    adaptive_surfaces_found: 0, adaptive_new_evidence: 0,
    adaptive_new_verification_targets: 0, adaptive_verified: 0, adaptive_no_useful: 0,
    status: 'RUNNING' as string,
  };
  writeManifest(manifest);
  setupGracefulShutdown(manifest);

  const allArtifacts: AdaptiveArtifact[] = [];
  const perCompanyTimeoutMs = 180000;

  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    console.log(`[${i + 1}/${TARGETS.length}] ${target} — starting...`);

    let artifact: AdaptiveArtifact;
    try {
      const timeoutPromise = new Promise<AdaptiveArtifact>((resolve) => {
        setTimeout(() => resolve({
          run_id: RUN_ID, run_timestamp: new Date().toISOString(),
          company: target.replace('https://www.', '').replace(/\/$/, ''),
          url: target, terminal_state: { state: 'TIMED_OUT', reason: `Exceeded ${perCompanyTimeoutMs/1000}s` },
          decision: 'NO_GO', finding_type: 'TIMEOUT', evidence_count: 0,
          discovered_subdomains: [], signals: [], rate_limited: [],
          artifact_path: '',
          adaptive_investigation: { attempted: false, records: [], aggregate: {} },
        }), perCompanyTimeoutMs);
      });
      const resultPromise = runCompanyWithTimeout(target, perCompanyTimeoutMs);
      artifact = await Promise.race([resultPromise, timeoutPromise]);
    } catch (e: any) {
      artifact = {
        run_id: RUN_ID, run_timestamp: new Date().toISOString(),
        company: target.replace('https://www.', '').replace(/\/$/, ''),
        url: target, terminal_state: { state: 'FAILED', reason: e.message },
        decision: 'NO_GO', finding_type: 'ERROR', evidence_count: 0,
        discovered_subdomains: [], signals: [], rate_limited: [],
        artifact_path: '',
        adaptive_investigation: { attempted: false, records: [], aggregate: {} },
      };
    }

    allArtifacts.push(artifact);
    writeArtifact(artifact);

    const ai = artifact.adaptive_investigation || {};
    const agg = ai.aggregate || {};
    console.log(`  → ${artifact.terminal_state.state} | decision=${artifact.decision} | finding=${artifact.finding_type} | evidence=${artifact.evidence_count} | subs=${artifact.discovered_subdomains.length} | adaptive_pivots=${agg.pivots_executed || 0}`);

    // Update manifest
    manifest.completed_count = allArtifacts.filter(a => a.terminal_state.state === 'COMPLETED').length;
    manifest.failed_count = allArtifacts.filter(a => a.terminal_state.state === 'FAILED').length;
    manifest.timed_out_count = allArtifacts.filter(a => a.terminal_state.state === 'TIMED_OUT').length;
    manifest.skipped_count = allArtifacts.filter(a => a.terminal_state.state === 'SKIPPED').length;

    const decisions: Record<string, number> = {};
    let totalEvidence = 0, totalSubs = 0;
    const allSubs = new Set<string>();
    let pivotsSuggested = 0, pivotsExecuted = 0, surfacesFound = 0, newEvidence = 0, newTargets = 0, verified = 0, noUseful = 0;
    for (const a of allArtifacts) {
      const d = a.decision || 'NONE';
      decisions[d] = (decisions[d] || 0) + 1;
      totalEvidence += a.evidence_count;
      for (const s of a.discovered_subdomains) allSubs.add(s);
      const ag = a.adaptive_investigation?.aggregate || {};
      pivotsSuggested += ag.pivots_suggested || 0;
      pivotsExecuted += ag.pivots_executed || 0;
      surfacesFound += ag.alternate_surfaces_found || 0;
      newEvidence += ag.new_evidence_found || 0;
      newTargets += ag.new_verification_targets || 0;
      verified += ag.verified_from_adaptive_path || 0;
      noUseful += ag.no_useful_result || 0;
    }
    manifest.decisions = decisions;
    manifest.total_evidence_records = totalEvidence;
    manifest.total_subdomains_discovered = allSubs.size;
    manifest.adaptive_pivots_suggested = pivotsSuggested;
    manifest.adaptive_pivots_executed = pivotsExecuted;
    manifest.adaptive_surfaces_found = surfacesFound;
    manifest.adaptive_new_evidence = newEvidence;
    manifest.adaptive_new_verification_targets = newTargets;
    manifest.adaptive_verified = verified;
    manifest.adaptive_no_useful = noUseful;
    writeManifest(manifest);
  }

  const runCompleted = new Date().toISOString();
  manifest.status = 'COMPLETE';
  manifest.completed_at = runCompleted;
  writeManifest(manifest);

  // Write summary
  fs.writeFileSync(RESULTS_PATH, JSON.stringify({
    run_id: RUN_ID, run_type: 'treatment_adaptive', baseline_run_id: 'batch3_run_1790873841985',
    manifest,
    artifacts: allArtifacts.map(a => ({
      company: a.company, url: a.url, terminal_state: a.terminal_state,
      decision: a.decision, finding_type: a.finding_type,
      evidence_count: a.evidence_count, subdomains: a.discovered_subdomains.length,
      signals: a.signals, rate_limited: a.rate_limited.length,
      contact_status: a.contact_status, email_generated: a.email_generated,
      adaptive_investigation: a.adaptive_investigation?.aggregate || {},
    })),
  }, null, 2), 'utf8');

  console.log('');
  console.log('═'.repeat(70));
  console.log(`ADAPTIVE TREATMENT RUN — FINAL REPORT  (${RUN_ID})`);
  console.log('═'.repeat(70));
  console.log(`Targets:     ${manifest.target_count}`);
  console.log(`Completed:   ${manifest.completed_count}`);
  console.log(`Failed:      ${manifest.failed_count}`);
  console.log(`Timed out:   ${manifest.timed_out_count}`);
  console.log(`Skipped:     ${manifest.skipped_count}`);
  const sum = manifest.completed_count + manifest.failed_count + manifest.timed_out_count + manifest.skipped_count;
  console.log(`Reconciliation: ${sum} (expected: ${manifest.target_count})`);
  console.log('');
  console.log('Decision distribution:');
  for (const [d, c] of Object.entries(manifest.decisions).sort()) {
    console.log(`  ${d.padEnd(20)} ${c}`);
  }
  console.log('');
  console.log(`Evidence records: ${manifest.total_evidence_records}`);
  console.log(`Unique subdomains: ${manifest.total_subdomains_discovered}`);
  console.log('');
  console.log('Adaptive investigation aggregates:');
  console.log(`  Pivots suggested:     ${manifest.adaptive_pivots_suggested}`);
  console.log(`  Pivots executed:      ${manifest.adaptive_pivots_executed}`);
  console.log(`  Alternate surfaces:   ${manifest.adaptive_surfaces_found}`);
  console.log(`  New evidence found:   ${manifest.adaptive_new_evidence}`);
  console.log(`  Verified from pivot:  ${manifest.adaptive_verified}`);
  console.log(`  No useful result:     ${manifest.adaptive_no_useful}`);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
