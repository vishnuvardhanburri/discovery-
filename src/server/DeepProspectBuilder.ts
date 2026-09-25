/**
 * XAVIRA — DEEP PROSPECT BUILDER (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * High-precision prospect research operator. Starting from a company URL it:
 *
 *   company → surface → engineering → signals → qualification(prelim)
 *   → people → owners → evidence → findings → contactability
 *   → qualification(final) → email → decision
 *
 * It REUSES the existing pipeline (PublicLinkDiscovery, PeopleExtractor,
 * OwnerSelector, LivePublicObservationProvider, IntelligenceEngine) and LAYERS
 * deep signals, ICP qualification, contactability, owner-graph and a finding-led
 * email on top. Evidence IDs are preserved end-to-end via the IntelligenceCase
 * reference carried in the dossier.
 */

import path from 'path';
import fs from 'fs';
import { IntelligenceEngine } from './IntelligenceEngine';
import { LivePublicObservationProvider } from './LivePublicObservationProvider';
import { PublicLinkDiscovery } from './PublicLinkDiscovery';
import { PeopleExtractor } from './PeopleExtractor';
import { OwnerSelector } from './OwnerSelector';
import type {
  DeepBuilderOptions, DeepBuilderResult, DeepProspect, DeepSignal,
  DeepOwner, DeepContact, IcpQualification, DeepDecision, DeepConfidence,
  DeepStage, DeepEmailDraft
} from './DeepTypes';
import type { IntelligenceCase, Evidence, OwnerCandidate, CompanySurface, FindingClassification } from './IntelligenceCase';
import { DeepSignalExtractor } from './DeepSignalExtractor';
import { ContactabilityFinder } from './ContactabilityFinder';
import { DeepOwnerResolver } from './DeepOwnerResolver';
import { IcpQualificationEngine } from './IcpQualificationEngine';
import { DeepEmailGenerator } from './DeepEmailGenerator';

function technicalAreaFromSurface(surface: CompanySurface): string {
  const paths = surface.discovered_pages.map(p => (p.path || '').toLowerCase()).filter(Boolean);
  if (paths.some(p => p.startsWith('/status') || p.includes('incident'))) return 'observability status';
  if (paths.some(p => p.startsWith('/security'))) return 'security trust';
  if (paths.some(p => p.startsWith('/api') || p.startsWith('/docs'))) return 'api surface';
  if (paths.some(p => p.startsWith('/blog'))) return 'engineering blog';
  return 'platform engineering';
}

function inferIndustry(surface: CompanySurface, signals: DeepSignal[]): string {
  const cats = surface.discovered_pages.map(p => p.category).filter(Boolean);
  const paths = surface.discovered_pages.map(p => (p.path || '').toLowerCase());
  const hasInfra = signals.some(s => /infra|platform|sre|security/i.test(s.excerpt));
  const hasApi = paths.some(p => p.startsWith('/api') || p.startsWith('/developers') || p.startsWith('/docs')) || signals.some(s => s.type === 'API_REFERENCE');
  const hasSecurity = cats.includes('security') || signals.some(s => s.type === 'SECURITY_PAGE');
  if (hasInfra && hasApi) return 'Infrastructure / Developer Platform';
  if (hasApi) return 'Developer Platform / SaaS';
  if (hasSecurity) return 'Security / Trust Engineering';
  if (cats.includes('blog') || cats.includes('engineering')) return 'Engineering-First SaaS';
  return 'SaaS';
}

function anglesFrom(signals: DeepSignal[], finding: FindingClassification | null): { primary: string; secondary: string | null } {
  const ordered = [...signals].sort((a, b) => (signalRank(b) - signalRank(a)));
  const top = ordered[0];
  let primary: string;
  if (finding && finding.finding_type !== 'GENERIC_ENGINEERING_ARTICLE') {
    primary = `Finding-led: ${finding.finding_type.replace(/_/g, ' ').toLowerCase()} (${finding.impact_severity})`;
  } else if (top) {
    primary = top.relevance;
  } else {
    primary = 'General technical surface observation.';
  }
  const secondary = ordered.slice(1, 3).map(s => s.relevance).join('; ') || null;
  return { primary, secondary };
}

function signalRank(s: DeepSignal): number {
  const order: Record<string, number> = {
    'PUBLIC_INCIDENT': 8, 'API_REFERENCE': 7, 'SECURITY_PAGE': 6,
    'ARCHITECTURE_DISCUSSION': 5, 'TECHNICAL_HIRING': 4,
    'STATUS_PAGE': 4, 'ENGINEERING_ARTICLE': 3, 'BLOG': 2
  };
  const strength = { HIGH: 3, MEDIUM: 2, LOW: 1 }[s.signal_strength];
  return (order[s.type] || 1) * strength;
}

export class DeepProspectBuilder {
  private readonly fetcher?: (url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => Promise<Response>;
  private readonly saveArtifact?: (path: string, data: string) => void;
  private readonly onProgress?: (stage: DeepStage, message: string) => void;
  private readonly logger?: (msg: string) => void;
  private readonly maxDiscoveryPages: number;
  private readonly discoveryDelayMs: number;
  private readonly discoveryTimeoutMs: number;
  private readonly observationDelayMs: number;
  private readonly injectedProvider: any;
  private readonly artifactsBaseDir?: string;

  constructor(options: DeepBuilderOptions = {}) {
    this.fetcher = options.fetcher;
    this.saveArtifact = options.saveArtifact;
    this.onProgress = options.onProgress;
    this.logger = options.logger;
    this.maxDiscoveryPages = options.maxDiscoveryPages ?? 12;
    this.discoveryDelayMs = options.discoveryDelayMs ?? 250;
    this.discoveryTimeoutMs = options.discoveryTimeoutMs ?? 8000;
    this.observationDelayMs = options.observationDelayMs ?? 200;
    this.injectedProvider = options.observationProvider;
    this.artifactsBaseDir = options.artifactsBaseDir;
  }

  async build(targetUrl: string): Promise<DeepBuilderResult> {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl.startsWith('http') ? targetUrl : `https://${targetUrl}`);
    } catch (e: any) {
      throw new Error(`Invalid company URL: ${targetUrl} (${e?.message || e})`);
    }

    const htmlByUrl = new Map<string, string>();
    const auditTrail: string[] = [];

    this.onProgress?.('company', `${parsed.hostname} — deep intelligence run starting.`);
    auditTrail.push(`Deep run initiated for ${parsed.hostname}`);

    // 1) SURFACE DISCOVERY (bounded, same-origin, read-only) — reuse existing infra
    this.onProgress?.('surface', `discovering public company surface for ${parsed.hostname}`);
    let surface: CompanySurface;
    try {
      surface = await PublicLinkDiscovery.discover(parsed.href, {
        maxPages: this.maxDiscoveryPages,
        delayMs: this.discoveryDelayMs,
        timeoutMs: this.discoveryTimeoutMs,
        fetcher: this.fetcher,
        logger: (m) => { this.logger?.(m); auditTrail.push(m); },
        onProgress: (page) => this.onProgress?.('surface', `[pages] ${page.category}  ${page.path}  (HTTP ${page.status ?? '?'})`),
        onHtml: (url, html) => { htmlByUrl.set(url, html); }
      });
    } catch (e: any) {
      this.onProgress?.('surface', `Discovery failed: ${e?.message || String(e)}`);
      return this.failProspect(parsed, htmlByUrl, auditTrail, `Discovery failed: ${e?.message || String(e)}`);
    }
    auditTrail.push(`Surface discovered: ${surface.discovered_pages.length} public page(s).`);

    // 2) ENGINEERING / TECH PAGE FOCUS
    const engPages = surface.discovered_pages.filter(p =>
      p.category === 'engineering' || p.category === 'docs' || p.category === 'security' ||
      p.category === 'status_ops' || p.path.startsWith('/api') || p.path.startsWith('/developers')
    );
    this.onProgress?.('engineering', `Found ${engPages.length} engineering/technical page(s).`);
    for (const p of engPages) this.onProgress?.('engineering', `  ${p.url}`);

    const technicalArea = technicalAreaFromSurface(surface);
    const industry = inferIndustry(surface, []);

    // 3) DEEP SIGNAL DISCOVERY
    let signals = DeepSignalExtractor.extract(surface.discovered_pages, htmlByUrl, [], {
      onProgress: (stage, msg) => this.onProgress?.('signals', msg)
    });
    this.onProgress?.('signals', `${signals.length} technical signal(s) extracted (documented facts / observations / inferences).`);

    // Preliminary qualification from surface + signals only
    const prelimCtx = {
      company: surface.company, domain: parsed.hostname, surface,
      signals, people: [] as OwnerCandidate[], owner: null as DeepOwner | null,
      contacts: [] as DeepContact[], finding: null as FindingClassification | null,
      evidence: [] as Evidence[]
    };
    const prelim = IcpQualificationEngine.qualify(prelimCtx);
    this.onProgress?.('qualification', `Preliminary ICP: ${prelim.overall} (fit: ${prelim.fit}). Dimensions: ${prelim.dimensions.map(d => `${d.name}=${d.score}`).join(', ')}.`);

    // 4) PEOPLE DISCOVERY (publicly listed professionals)
    const pagesForPeople = surface.discovered_pages.filter(p =>
      p.category === 'team_people' || p.category === 'about' || p.category === 'engineering'
    );
    const people = PeopleExtractor.extractFromPages(pagesForPeople, htmlByUrl, {
      company: surface.company,
      technicalAreaHints: ['api', 'backend', 'infrastructure', 'platform', 'security']
    });
    this.onProgress?.('people', `${people.length} owner candidate(s) extracted.`);
    for (const c of people) this.onProgress?.('people', `  [people] ${c.name} — ${c.role}  (${c.confidence})  @ ${c.source_urls[0]}`);

    // 5) OWNER RESOLUTION (graph: finding-area → responsibility → candidate → evidence)
    const selectedOwner = DeepOwnerResolver.resolve(people, technicalArea, null, [], (stage, msg) => this.onProgress?.('owners', msg));
    this.onProgress?.('owners', selectedOwner
      ? `Selected owner: ${selectedOwner.name} (${selectedOwner.role}) — ${selectedOwner.confidence} (responsibility: ${selectedOwner.finding_link}).`
      : 'Owner graph: no evidence-backed owner discovered.');

    // Select owner evidence string for the engine (must contain "is listed as" for HIGH)
    const sel = people.length > 0 ? OwnerSelector.select(people, technicalArea) : { candidate: null, ownerEvidenceString: '', reason: 'No candidates.' };

    // 6) INTELLIGENCE PIPELINE (real public observation — PRODUCTION mode)
    const provider = this.injectedProvider ?? new LivePublicObservationProvider({
      onPage: (url: string, status: number, latency: number) => this.onProgress?.('evidence', `observed ${new URL(url).pathname} → HTTP ${status} (${latency}ms)`),
      fetcher: this.fetcher,
      delayMs: this.observationDelayMs
    });
    this.onProgress?.('evidence', 'observing public surface (bounded crawl)...');
    let caseRef: IntelligenceCase;
    try {
      caseRef = await IntelligenceEngine.run(
        surface.company,
        surface.homepage,
        sel.candidate?.name || '',
        sel.candidate?.role || '',
        sel.ownerEvidenceString,
        [],
        'PRODUCTION',
        undefined,
        provider,
        (stage, message) => {
          if (stage === 'evidence') this.onProgress?.('evidence', message);
          else if (stage === 'findings') this.onProgress?.('findings', message);
          else if (stage === 'owner') this.onProgress?.('owners', message);
          else if (stage === 'email') this.onProgress?.('email', message);
        }
      );
    } catch (e: any) {
      auditTrail.push(`Pipeline error: ${e?.message || String(e)}`);
      return this.failProspect(parsed, htmlByUrl, auditTrail, `Pipeline error: ${e?.message || String(e)}`);
    }
    auditTrail.push(`Engine decision: ${caseRef.prospect_decision}; finding: ${caseRef.finding_classification?.finding_type || 'NONE'}`);
    this.onProgress?.('findings', `finding: ${caseRef.finding_classification?.finding_type || 'NONE'} (${caseRef.finding_classification?.impact_severity || 'UNKNOWN'}); decision: ${caseRef.prospect_decision}`);

    // Backfill signal → observation evidence links (by URL).
    const evByUrl = new Map<string, string[]>();
    for (const ev of caseRef.evidence) {
      const k = (ev.public_url || '').replace(/\/$/, '');
      const arr = evByUrl.get(k) || [];
      arr.push(ev.id);
      evByUrl.set(k, arr);
    }
    for (const sig of signals) {
      const k = sig.source_url.replace(/\/$/, '');
      const ids = evByUrl.get(k);
      if (ids && ids.length) {
        sig.related_evidence_ids = Array.from(new Set([...(sig.related_evidence_ids || []), ...ids]));
      }
    }

    // 7) CONTACTABILITY (public professional contact channels only)
    const contacts = ContactabilityFinder.find(surface.discovered_pages, htmlByUrl, (stage, message) => this.onProgress?.('contactability', message));

    // 8) FINAL ICP QUALIFICATION (all data)
    const ctx = {
      company: surface.company, domain: parsed.hostname, surface, signals, people,
      owner: selectedOwner, contacts, finding: caseRef.finding_classification || null,
      evidence: caseRef.evidence
    };
    const icp = IcpQualificationEngine.qualify(ctx);
    this.onProgress?.('qualification', `Final ICP: ${icp.overall} (fit: ${icp.fit}). ${icp.gated_reason ? icp.gated_reason : 'All gates satisfied.'}`);

    // 9) ANGLES
    const { primary: primaryAngle, secondary: secondaryAngle } = anglesFrom(signals, caseRef.finding_classification || null);

    // 10) EMAIL (gated)
    const draftInput = {
      company: surface.company, domain: parsed.hostname, industry, fit: icp.fit,
      qualification_reasons: icp.reasons, public_surface: surface, technical_signals: signals,
      documented_facts: [], public_observations: [], inferences: [], people,
      owner_candidates: people, selected_owner: selectedOwner, owner_evidence: selectedOwner?.owner_evidence || [],
      contactability: contacts, findings: caseRef.finding_classification || null,
      evidence: caseRef.evidence, primary_angle: primaryAngle, secondary_angle: secondaryAngle,
      recommended_subjects: [], decision: 'NO_GO' as DeepDecision, confidence: 'LOW' as DeepConfidence,
      artifact_path: '', audit_trail: auditTrail
    };
    const email = DeepEmailGenerator.generate({ prospect: draftInput, caseRef }, (stage, message) => this.onProgress?.('email', message));

    // 11) FINAL DECISION + CONFIDENCE
    let decision: DeepDecision;
    if (icp.overall === 'NO_GO' || caseRef.prospect_decision === 'NO_GO') {
      decision = 'NO_GO';
    } else if (icp.overall === 'PASS' && caseRef.prospect_decision === 'GO' && email.generated) {
      decision = 'READY';
    } else {
      decision = 'RESEARCH_MORE';
    }
    let confidence: DeepConfidence;
    if (decision === 'READY') confidence = 'HIGH';
    else if (caseRef.prospect_decision === 'GO' || icp.overall === 'PASS') confidence = 'MEDIUM';
    else confidence = 'LOW';

    const { documented_facts, public_observations, inferences } = DeepSignalExtractor.splitByProvenance(signals);

    const prospect: DeepProspect = {
      company: surface.company,
      domain: parsed.hostname,
      industry,
      fit: icp.fit,
      qualification_reasons: icp.reasons.length ? icp.reasons : icp.dimensions.map(d => `${d.name}: ${d.score}`),
      public_surface: surface,
      technical_signals: signals,
      documented_facts,
      public_observations,
      inferences,
      people,
      owner_candidates: people,
      selected_owner: selectedOwner,
      owner_evidence: selectedOwner?.owner_evidence || [],
      contactability: contacts,
      findings: caseRef.finding_classification || null,
      evidence: caseRef.evidence,
      primary_angle: primaryAngle,
      secondary_angle: secondaryAngle,
      recommended_subjects: [email.primary_subject, email.alternate_subject].filter(Boolean),
      email_draft: email,
      decision,
      confidence,
      artifact_path: '',
      audit_trail: auditTrail,
      case_ref: caseRef
    };

    prospect.artifact_path = this.persistArtifact(prospect, parsed.hostname);
    this.onProgress?.('decision', `Deep decision: ${decision} (confidence ${confidence}). Artifact: ${prospect.artifact_path}`);
    return { prospect, case_ref: caseRef };
  }

  /** Build a minimal NO_GO prospect when discovery/pipeline fails outright. */
  private failProspect(parsed: URL, htmlByUrl: Map<string, string>, audit: string[], reason: string): DeepBuilderResult {
    const surface: CompanySurface = {
      company: parsed.hostname, origin: parsed.origin, homepage: parsed.href,
      discovered_pages: [], page_categories: {}
    };
    const email: DeepEmailDraft = {
      primary_subject: '', alternate_subject: '', body: '', claims: [], generated: false, blocked_reason: reason
    };
    const prospect: DeepProspect = {
      company: parsed.hostname, domain: parsed.hostname, industry: 'Unknown', fit: 'POOR',
      qualification_reasons: [reason], public_surface: surface, technical_signals: [],
      documented_facts: [], public_observations: [], inferences: [], people: [],
      owner_candidates: [], selected_owner: null, owner_evidence: [], contactability: [],
      findings: null, evidence: [], primary_angle: 'No surface discovered.', secondary_angle: null,
      recommended_subjects: [], email_draft: email as any, decision: 'NO_GO', confidence: 'LOW',
      artifact_path: '', audit_trail: audit, case_ref: undefined
    };
    prospect.artifact_path = this.persistArtifact(prospect, parsed.hostname);
    this.onProgress?.('decision', `Deep decision: NO_GO (confidence LOW). ${reason}`);
    return { prospect, case_ref: undefined };
  }

  private persistArtifact(prospect: DeepProspect, company: string): string {
    const dir = path.join(this.artifactsBaseDir || process.cwd(), 'artifacts', 'intelligence', 'deep');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const p = path.join(dir, `${ts}-${company.replace(/\s+/g, '_')}.json`);
    const data = JSON.stringify(prospect, (k, v) => (k === 'case_ref' ? undefined : v), 2);
    if (this.saveArtifact) { this.saveArtifact(p, data); return p; }
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* reuse existing */ }
    fs.writeFileSync(p, data, 'utf8');
    return p;
  }
}

// failProspect types its local email object as DeepEmailDraft (imported above).
