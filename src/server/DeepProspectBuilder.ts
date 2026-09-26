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
import type {
  DeepBuilderOptions, DeepBuilderResult, DeepProspect, DeepSignal,
  DeepOwner, DeepContact, IcpQualification, DeepDecision, DeepConfidence,
  DeepStage, DeepEmailDraft, DeepFinding, EvidenceProvenance,
  ProviderCompanyLike, GrowjoCompany, CompanyResolution, GithubRepoMeta, ActivityEvent
} from './DeepTypes';
import type {
  IntelligenceCase, Evidence, OwnerCandidate, CompanySurface, FindingClassification, FindingType, SeverityLevel, StrengthLevel, DiscoveredPage
} from './IntelligenceCase';
import { DeepSignalExtractor } from './DeepSignalExtractor';
import { ContactabilityFinder } from './ContactabilityFinder';
import { OwnerPipeline } from './OwnerPipeline';
import { GitHubDiscovery } from './GitHubDiscovery';
import { ActivityTimeline } from './ActivityTimeline';
import { IcpQualificationEngine, type IcpContext } from './IcpQualificationEngine';
import { DeepEmailGenerator } from './DeepEmailGenerator';

/**
 * Language cues that an observation is *exposed without authentication*.
 * Shared by the R7 public-exposure rule and the adversarial-corroboration
 * (conflict) check so the two paths never diverge on matching semantics.
 */
const EXPOSURE_LANGUAGE_RE = /\b(unauthenticated|without\s+auth|publicly\s+accessible|open\s+to|exposed|disclosed|accessible\s+without|directory\s+listing|backup\s+file|debug=|env|config\s+exposed)\b/i;
/**
 * Language cues that an observation reports an auth *denial* (401/403 boundary).
 * Shared by the R8 access-issue rule and the adversarial-corroboration check.
 */
const DENIAL_LANGUAGE_RE = /\b(unauthorized|forbidden|denied|access denied|requires? authentication|authentication required)\b/i;

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
  private readonly growjoData?: GrowjoCompany | null;
  private readonly providerCompanies?: ProviderCompanyLike[] | null;
  private readonly resolution?: CompanyResolution | null;

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
    this.growjoData = options.growjo;
    this.providerCompanies = options.providerCompanies;
    this.resolution = options.resolution;
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

    // 1b) BROAD DISCOVERY — robots.txt (sitemap hints), sitemap.xml (URL list),
    // and JSON-LD sameAs (provenance-tracked public links). Bounded + same-origin.
    await this.broadenSurface(parsed, surface, htmlByUrl);
    auditTrail.push(`Broad discovery complete: ${surface.discovered_pages.length} public page(s) after robots/sitemap/JSON-LD.`);

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

    // 4) PEOPLE DISCOVERY (publicly listed professionals — people pages only)
    const pagesForPeople = surface.discovered_pages.filter(p =>
      p.category === 'team_people' || p.category === 'about'
    );
    const people = PeopleExtractor.extractFromPages(pagesForPeople, htmlByUrl, {
      company: surface.company,
      technicalAreaHints: ['api', 'backend', 'infrastructure', 'platform', 'security']
    });
    this.onProgress?.('people', `${people.length} owner candidate(s) extracted.`);
    for (const c of people) this.onProgress?.('people', `  [people] ${c.name} — ${c.role}  (${c.confidence})  @ ${c.source_urls[0]}`);

    // 5) OWNER RESOLUTION — Growjo people PRIMARY (role match → company
    // identity match → public corroboration → confidence). The HIGH-only gate
    // is enforced by DeepOwnerResolver (unchanged); we never invent owners and
    // never promote LOW/MEDIUM. Public candidates from PeopleExtractor provide
    // optional corroboration (a Growjo-identified person need NOT appear on the
    // company's own team/leadership page).
    const op = OwnerPipeline.resolve({
      company: surface.company,
      targetDomain: this.resolution?.official_domain || parsed.hostname,
      technicalArea,
      classification: null, // deep finding detected later; responsibility uses surface technical area
      resolvedEvidence: [],
      growjoData: this.growjoData ?? null,
      providerCompanies: this.providerCompanies ?? null,
      publicCandidates: people,
      onProgress: (stage, message) => this.onProgress?.('owners', message),
    });
    const selectedOwner = op.selected;
    const sel = { candidate: op.selectedCandidate, ownerEvidenceString: op.ownerEvidenceString, reason: op.reason };
    this.onProgress?.('owners', selectedOwner
      ? `Selected owner: ${selectedOwner.name} (${selectedOwner.role}) — ${selectedOwner.confidence} (responsibility: ${selectedOwner.finding_link}, provenance: ${op.provenance}).`
      : 'Owner graph: no evidence-backed owner discovered.');

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

    // Deep finding discovery: map structured signals + public observations into a
    // defensible DeepFinding. Never collapses every signal to NONE; never invents.
    const deepFinding = this.detectDeepFinding(signals, caseRef.evidence);
    if (deepFinding) {
      this.onProgress?.('findings', `deep finding: ${deepFinding.finding_type} (${deepFinding.confidence}) — ${deepFinding.explanation.slice(0, 90)}`);
    } else {
      this.onProgress?.('findings', 'No defensible deep finding assembled (not fabricated).');
    }

    // 7) CONTACTABILITY (public professional contact channels only)
    const contacts = ContactabilityFinder.find(surface.discovered_pages, htmlByUrl, (stage, message) => this.onProgress?.('contactability', message));

    // 8) FINAL ICP QUALIFICATION (all data; finding = deep finding when present)
    const authoritativeFinding = deepFinding ?? (caseRef.finding_classification || null);
    const ctx = {
      company: surface.company, domain: parsed.hostname, surface, signals, people,
      owner: selectedOwner, contacts, finding: authoritativeFinding,
      evidence: caseRef.evidence
    };
    const icp = IcpQualificationEngine.qualify(ctx);
    this.onProgress?.('qualification', `Final ICP: ${icp.overall} (fit: ${icp.fit}). ${icp.gated_reason ? icp.gated_reason : 'All gates satisfied.'}`);

    // 9) ANGLES (deep finding drives the primary angle when present)
    const { primary: primaryAngle, secondary: secondaryAngle } = anglesFrom(signals, authoritativeFinding);

    // 10) EMAIL (gated: real finding + evidence + verified owner + relevant relationship + CLAIM QA)
    const draftInput = {
      company: surface.company, domain: parsed.hostname, industry, fit: icp.fit,
      qualification_reasons: icp.reasons, public_surface: surface, technical_signals: signals,
      documented_facts: [], public_observations: [], inferences: [], people,
      owner_candidates: people, selected_owner: selectedOwner, owner_evidence: selectedOwner?.owner_evidence || [],
      contactability: contacts, findings: authoritativeFinding, deep_finding: deepFinding,
      evidence: caseRef.evidence, primary_angle: primaryAngle, secondary_angle: secondaryAngle,
      recommended_subjects: [], decision: 'NO_GO' as DeepDecision, confidence: 'LOW' as DeepConfidence,
      artifact_path: '', audit_trail: auditTrail
    } as Omit<DeepProspect, 'email_draft'>;
    const email = DeepEmailGenerator.generate({ prospect: draftInput, caseRef }, (stage, message) => this.onProgress?.('email', message));

    // 11) FINAL DECISION + CONFIDENCE
    // Strict ownership (Part E): no verified HIGH owner => RESEARCH_MORE, never OUTREACH_READY.
    const ownerHigh = !!selectedOwner && selectedOwner.confidence === 'HIGH';
    const hasProfChannel = contacts.some(c => c.type === 'PROFESSIONAL_EMAIL' || c.type === 'PROFESSIONAL_PROFILE');
    const findingDefensible = !!deepFinding && deepFinding.confidence !== 'LOW'
      && !['GENERIC_ENGINEERING_ARTICLE', 'UNEXPECTED_PUBLIC_BEHAVIOR', 'CONFLICTING_EVIDENCE'].includes(deepFinding.finding_type);

    let decision: DeepDecision;
    if (icp.overall === 'NO_GO') {
      decision = 'NO_GO';
    } else if (findingDefensible && ownerHigh && hasProfChannel && email.generated) {
      decision = 'OUTREACH_READY';
    } else {
      decision = 'RESEARCH_MORE';
    }

    let confidence: DeepConfidence;
    if (decision === 'OUTREACH_READY') confidence = 'HIGH';
    else if (signals.length > 0 || !!selectedOwner || contacts.length > 0) confidence = 'MEDIUM';
    else confidence = 'LOW';

    const { documented_facts, public_observations, inferences } = DeepSignalExtractor.splitByProvenance(signals);

    // Broad GitHub discovery: only orgs/repos linked from the company's own pages.
    const githubPages = Array.from(htmlByUrl.entries()).map(([url, html]) => ({ url, html }));
    let githubRepos: GithubRepoMeta[] = [];
    try {
      const gh = await GitHubDiscovery.discover({
        fetcher: this.fetcher || (globalThis.fetch as any),
        pages: githubPages,
        companyDomain: parsed.hostname,
        onProgress: (stage, msg) => this.onProgress?.('engineering', msg),
      });
      githubRepos = gh.repos;
      if (gh.rate_limited) auditTrail.push('GitHub API rate-limited during discovery.');
    } catch (e: any) {
      auditTrail.push(`GitHub discovery error: ${e?.message || String(e)}`);
    }

    // Activity timeline: signals + evidence + GitHub, provenance-tracked.
    const timeline = ActivityTimeline.synthesize({
      company: surface.company, domain: parsed.hostname, signals,
      evidence: caseRef.evidence, github: githubRepos,
      finding: deepFinding ?? (caseRef.finding_classification || null),
    });

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
      owner_candidates: op.candidates,
      selected_owner: selectedOwner ? { ...selectedOwner, deep_owner_provenance: op.provenance } : null,
      owner_evidence: selectedOwner?.owner_evidence || [],
      contactability: contacts,
      findings: caseRef.finding_classification || null,
      deep_finding: deepFinding,
      evidence: caseRef.evidence,
      primary_angle: primaryAngle,
      secondary_angle: secondaryAngle,
      recommended_subjects: [email.primary_subject, email.alternate_subject].filter(Boolean),
      email_draft: email,
      decision,
      confidence,
      growjo_data: this.growjoData ?? null,
      provider_data: this.providerCompanies ?? null,
      resolution: this.resolution ?? null,
      github_activity: githubRepos,
      activity_timeline: timeline,
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
      findings: null, deep_finding: null, evidence: [], primary_angle: 'No surface discovered.', secondary_angle: null,
      recommended_subjects: [], email_draft: email as any, decision: 'NO_GO', confidence: 'LOW',
      growjo_data: this.growjoData ?? null, provider_data: this.providerCompanies ?? null, resolution: this.resolution ?? null,
      github_activity: [], activity_timeline: [],
      artifact_path: '', audit_trail: audit, case_ref: undefined
    };
    prospect.artifact_path = this.persistArtifact(prospect, parsed.hostname);
    this.onProgress?.('decision', `Deep decision: NO_GO (confidence LOW). ${reason}`);
    return { prospect, case_ref: undefined };
  }

  /**
   * BROAD DISCOVERY (robots.txt, sitemap.xml, JSON-LD sameAs). Read-only, bounded,
   * same-origin. Enriches the page graph + htmlByUrl used by signal/people/contact
   * discovery. 404s / non-2xx are silently skipped (logged, not recorded).
   */
  private async broadenSurface(parsed: URL, surface: CompanySurface, htmlByUrl: Map<string, string>): Promise<void> {
    const fetcher = this.fetcher || ((url: string, init: { method: string; headers: Record<string, string>; signal: AbortSignal }) => (globalThis.fetch as any)(url, { method: init.method, headers: init.headers, signal: init.signal })) as unknown as import('./IntelligenceCase').HttpFetcher;
    const origin = `${parsed.protocol}//${parsed.host}`;
    const addPage = (url: string, html: string, category: DiscoveredPage['category']) => {
      const norm = url.replace(/\/$/, '');
      if (htmlByUrl.has(norm)) return;
      if (!norm.startsWith(origin)) return; // same-origin only
      try {
        const u = new URL(norm);
        const existing = surface.discovered_pages.find(p => p.url === norm || p.url === url);
        if (existing) return;
      } catch { return; }
      htmlByUrl.set(norm, html);
      surface.discovered_pages.push({ url: norm, path: new URL(norm).pathname, category, status: 200 });
    };

    // robots.txt -> <sitemap> hints.
    try {
      const res = await fetcher(`${origin}/robots.txt`, { method: 'GET', headers: { accept: 'text/plain' }, signal: AbortSignal.timeout(8000) });
      if (res && res.ok) {
        const txt = await res.text();
        const sitemapRe = /sitemap:\s*(https?:\/\/[^\s]+)/gi;
        let m: RegExpExecArray | null;
        let count = 0;
        while ((m = sitemapRe.exec(txt)) !== null && count < this.maxDiscoveryPages) {
          const loc = m[1].trim();
          if (loc.startsWith(origin)) { /* recorded as sitemap page hint, fetched separately below */ }
          count++;
        }
      }
    } catch { /* 404 / network — skip */ }

    // sitemap.xml -> <loc> URLs (bounded, same-origin).
    try {
      const res = await fetcher(`${origin}/sitemap.xml`, { method: 'GET', headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(8000) });
      if (res && res.ok) {
        const xml = await res.text();
        const locRe = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        let m: RegExpExecArray | null;
        let count = 0;
        const toFetch: string[] = [];
        while ((m = locRe.exec(xml)) !== null && count < this.maxDiscoveryPages) {
          const loc = m[1].trim();
          if (loc.startsWith(origin) && !htmlByUrl.has(loc.replace(/\/$/, ''))) toFetch.push(loc);
          count++;
        }
        // Boundedly fetch a few sitemap URLs to populate htmlByUrl.
        for (const loc of toFetch.slice(0, this.maxDiscoveryPages)) {
          try {
            const r = await fetcher(loc, { method: 'GET', headers: { accept: 'text/html' }, signal: AbortSignal.timeout(6000) });
            if (r && r.ok) { const h = await r.text(); addPage(loc, h, 'other'); }
          } catch { /* skip */ }
        }
      }
    } catch { /* 404 / network — skip */ }

    // JSON-LD sameAs links (provenance: documented public contact/social links).
    for (const [url, html] of Array.from(htmlByUrl.entries())) {
      try {
        const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let m: RegExpExecArray | null;
        while ((m = ldRe.exec(html)) !== null) {
          let json: any;
          try { json = JSON.parse(m[1]); } catch { continue; }
          const block: any = Array.isArray(json) ? json[0] : json;
          const sameAs: string[] = block?.sameAs || [];
          for (const link of sameAs) {
            if (!link || typeof link !== 'string') continue;
            // sameAs links (incl. github.com/<org>) are already present in htmlByUrl
            // and will be scanned by GitHubDiscovery; nothing to fabricate here.
            if (link.includes('github.com')) this.onProgress?.('engineering', `[json-ld] sameAs GitHub link found on ${url}`);
          }
        }
      } catch { /* ignore malformed JSON-LD */ }
    }
  }

  /**
   * Deep finding engine (Part B / C): assembles a defensible DeepFinding from
   * structured signals + real public observations. Correlation over multiple
   * pieces of evidence is required; a single generic engineering article never
   * becomes a finding. Returns null when nothing defensible is demonstrated.
   */
  private detectDeepFinding(signals: DeepSignal[], observations: Evidence[]): DeepFinding | null {
    const found: DeepFinding[] = [];
    const src: Evidence[] = Array.isArray(observations) ? observations : [];

    // Adversarial corroboration (Part E): when the SAME public resource carries
    // contradictory security postures — both "exposed without auth" AND
    // "denied / 401-403" — the observation substrate is internally unreliable,
    // so no defensible exposure/access finding can stand. Weaken to a LOW-
    // confidence CONFLICTING_EVIDENCE finding. The build gate maps this to
    // RESEARCH_MORE (never OUTREACH_READY). Checked FIRST so the contradiction
    // short-circuits the normal exposure/access rules.
    const conflict = this.detectConflictingEvidence(src);
    if (conflict) return conflict;

    const sensitive = src.filter(e => (e.sensitive_fields || []).length > 0);
    if (sensitive.length > 0) {
      found.push(this.deepFinding(
        'POSSIBLE_SENSITIVE_METADATA_EXPOSURE', 'MEDIUM',
        `${sensitive.length} public observation(s) documented sensitive metadata field(s).`,
        sensitive.filter(e => (e.sensitive_fields || []).length > 0),
        sensitive.map(e => e.public_url),
        'A public response carries documented sensitive metadata fields — verifiable public behavior, not a vulnerability claim.',
        'Treat the field as intentionally public only if it is part of the product data model; otherwise remove it.',
        sensitive.length >= 2 ? 'HIGH' : 'MEDIUM',
        sensitive.length >= 2 ? 'MEDIUM' : 'LOW', 'HIGH', 'HIGH', 'MEDIUM', 'MEDIUM'
      ));
    }

    // Repeated 5xx -> availability issue (correlation of >= 2 occurrences).
    const fiveXx = src.filter(e => (e.status || 0) >= 500 && (e.status || 0) < 600 && e.repeatable);
    if (fiveXx.length >= 2) {
      found.push(this.deepFinding(
        'OBSERVED_AVAILABILITY_ISSUE', 'HIGH',
        `Repeated ${fiveXx.length} public 5xx responses on repeatable requests without auth.`,
        fiveXx, fiveXx.map(e => e.public_url),
        `Repeated HTTP ${fiveXx.map(e => e.status).join(', ')} responses on publicly reachable endpoints across repeatable read-only requests.`,
        'Investigate server-side error handling for the affected public endpoints.',
        fiveXx.length >= 3 ? 'HIGH' : 'MEDIUM',
        'HIGH', 'HIGH', 'HIGH', 'HIGH', 'HIGH'
      ));
    } else if (fiveXx.length === 1) {
      found.push(this.deepFinding(
        'OBSERVED_AVAILABILITY_ISSUE', 'LOW',
        `Single observed HTTP ${fiveXx[0].status} on a public endpoint (not yet repeated).`,
        fiveXx, fiveXx.map(e => e.public_url),
        `A single HTTP ${fiveXx[0].status} response was observed on a publicly reachable endpoint; not yet reproduced repeatedly.`,
        'Verify whether the error is transient before treating as available.',
        'LOW', 'LOW', 'LOW', 'MEDIUM', 'LOW', 'LOW'
      ));
    }

    // Documented incident (status page / PUBLIC_INCIDENT signal with incident language).
    const incidentSig = signals.find(s => s.type === 'PUBLIC_INCIDENT' || (s.type === 'STATUS_PAGE' && /outage|incident|degrad|interruption|disrupt/i.test(s.excerpt)));
    if (incidentSig) {
      found.push(this.deepFinding(
        'DOCUMENTED_INCIDENT', 'MEDIUM',
        `Publicly documented incident/degradation on ${incidentSig.source_url}.`,
        this.sigEvidence(incidentSig, src),
        this.signalUrls(incidentSig),
        `A status/observability page documents a past incident or degradation (${incidentSig.excerpt.slice(0, 120)}). This is a documented public record, not an active attack vector.`,
        'Corroborate against current behavior before acting on a past incident.',
        'MEDIUM', 'LOW', 'HIGH', 'MEDIUM', 'HIGH', 'MEDIUM'
      ));
    }

    // Documented engineering failure (article/blog with failure/incident language).
    const failureSig = signals.find(s =>
      (s.type === 'ENGINEERING_ARTICLE' || s.type === 'BLOG') &&
      /postmortem|post-mortem|root cause|outage|incident|failure|rollback|mitigation|degraded|bug|incident/i.test(s.excerpt)
    );
    if (failureSig) {
      found.push(this.deepFinding(
        'DOCUMENTED_ENGINEERING_FAILURE', 'LOW',
        `Engineering write-up documents a failure/incident on ${failureSig.source_url}.`,
        this.sigEvidence(failureSig, src),
        this.signalUrls(failureSig),
        `An engineering article documents a failure or postmortem (${failureSig.excerpt.slice(0, 120)}).`,
        'Treat as a resolved historical failure unless current recurrence is observed.',
        'LOW', 'LOW', 'LOW', 'LOW', 'LOW', 'LOW'
      ));
    }

    // Scaling constraint (architecture/scale discussion with capacity/rate-limit language).
    const scaleSig = signals.find(s =>
      (s.type === 'ARCHITECTURE_DISCUSSION' || s.type === 'ENGINEERING_ARTICLE') &&
      /scaling|sharded|partition|throughput|capacity|rate[- ]?limit|throttl|constraint|back.?pressure|queue|shard/i.test(s.excerpt)
    );
    if (scaleSig) {
      found.push(this.deepFinding(
        'DOCUMENTED_SCALING_CONSTRAINT', 'LOW',
        `Public documentation describes scaling/rate-limit behavior on ${scaleSig.source_url}.`,
        this.sigEvidence(scaleSig, src),
        this.signalUrls(scaleSig),
        `Public technical material describes scaling, rate limits, or capacity constraints (${scaleSig.excerpt.slice(0, 120)}).`,
        'These constraints are publicly documented product behavior, not a defect.',
        'LOW', 'LOW', 'LOW', 'LOW', 'LOW', 'LOW'
      ));
    }

    // Observed latency: >= 3 observations, slow and reproducible.
    const slowObs = src.filter(e => (e.latency_ms || 0) > 0 && ((e.baseline_latency_ms && e.latency_ms! > e.baseline_latency_ms * 2) || (e.latency_ms! > 1000)) && e.repeatable);
    if (slowObs.length >= 3) {
      const p95 = slowObs.map(e => e.latency_ms!).sort((a, b) => a - b);
      const med = p95[Math.floor(p95.length / 2)];
      found.push(this.deepFinding(
        'OBSERVED_LATENCY', 'MEDIUM',
        `Repeated slow public responses (median observed ${med}ms across ${slowObs.length} sample(s)).`,
        slowObs, slowObs.map(e => e.public_url),
        `Read-only requests to ${slowObs.length} public endpoint(s) returned with elevated latency (median ${med}ms), reproducible across requests.`,
        'Re-measure latency at time of outreach; treat as a performance signal, not an outage.',
        'MEDIUM', 'MEDIUM', 'HIGH', 'MEDIUM', 'HIGH', 'MEDIUM'
      ));
    }

    // Public exposure: repeatable unauthenticated behavior with explicit exposure language.
    const exposed = src.filter(e =>
      e.repeatable && e.tested_without_auth &&
      EXPOSURE_LANGUAGE_RE.test(e.observed_behavior)
    );
    if (exposed.length > 0) {
      found.push(this.deepFinding(
        'POSSIBLE_PUBLIC_EXPOSURE', 'MEDIUM',
        `${exposed.length} repeatable unauthenticated observation(s) with explicit exposure language.`,
        exposed, exposed.map(e => e.public_url),
        'A publicly reachable resource exhibited behavior explicitly described as accessible without authentication or exposing data.',
        'Verify the resource is intentionally public and within the documented product surface.',
        exposed.length >= 2 ? 'HIGH' : 'MEDIUM',
        exposed.length >= 2 ? 'MEDIUM' : 'LOW', 'HIGH', 'MEDIUM', 'HIGH', 'MEDIUM'
      ));
    }

    // R8: access issue — repeatable 401/403 on a public resource with explicit
    // denied/forbidden language. LOW/LOW confidence (weak signal; never alone
    // drives OUTREACH_READY — requires a corroborating defensible finding).
    const denied = src.filter(e =>
      e.repeatable && (e.status === 401 || e.status === 403) &&
      DENIAL_LANGUAGE_RE.test(e.observed_behavior)
    );
    if (denied.length > 0) {
      found.push(this.deepFinding(
        'POSSIBLE_ACCESS_ISSUE', 'LOW',
        `${denied.length} repeatable 401/403 observation(s) with explicit denial language.`,
        denied, denied.map(e => e.public_url),
        'A publicly reachable resource returned a repeatable 401/403 with explicit denial language. This is the expected auth boundary, not a bypass.',
        'Confirm the boundary is intentional and documented before outreach.',
        'LOW', 'LOW', 'LOW', 'MEDIUM', 'LOW', 'LOW'
      ));
    }

    // Pick the most defensible: highest severity, then most evidence.
    const SEV: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, UNKNOWN: 1 };
    // Every finding must carry concrete evidence IDs (never a signal-only claim).
    const valid = found.filter(f => f.evidence_ids.length > 0);
    valid.sort((a, b) => SEV[b.impact_severity] - SEV[a.impact_severity] || b.evidence_ids.length - a.evidence_ids.length);
    return valid.length ? valid[0] : null;
  }

  /**
   * Adversarial corroboration (Part E): resolve contradictions among
   * observations BEFORE they can be minted into a finding. When the same
   * public resource is observed both as exposed-without-auth and as an
   * auth-denied (401/403) boundary, the evidence is internally inconsistent —
   * the "corroboration" an exposure/access finding would lean on is actually
   * adversarial to its own claim. In that case we weaken to a LOW-confidence
   * CONFLICTING_EVIDENCE finding (which the build gate maps to RESEARCH_MORE).
   * Returns null when observations are consistent (no same-URL conflict).
   */
  private detectConflictingEvidence(src: Evidence[]): DeepFinding | null {
    // Bucket observations by normalized public URL so a contradiction is scoped
    // to the SAME resource (different resources may legitimately differ).
    const byUrl = new Map<string, Evidence[]>();
    for (const e of src) {
      const k = (e.public_url || '').replace(/\/$/, '');
      if (!k) continue;
      const bucket = byUrl.get(k) || [];
      bucket.push(e);
      byUrl.set(k, bucket);
    }

    for (const [, bucket] of byUrl) {
      if (bucket.length < 2) continue;
      const exposed = bucket.filter(e =>
        e.repeatable && e.tested_without_auth && EXPOSURE_LANGUAGE_RE.test(e.observed_behavior)
      );
      const denied = bucket.filter(e =>
        e.repeatable && (e.status === 401 || e.status === 403) && DENIAL_LANGUAGE_RE.test(e.observed_behavior)
      );
      if (exposed.length > 0 && denied.length > 0) {
        const both = [...exposed, ...denied];
        const url = both[0].public_url || 'the resource';
        return this.deepFinding(
          'CONFLICTING_EVIDENCE', 'LOW',
          `Conflicting public observations on ${url}: both unauthenticated-exposure and auth-denied (401/403) postures were recorded for the same resource.`,
          both,
          Array.from(new Set(both.map(e => e.public_url))),
          'Repeated observations of the same public resource contradict each other — one indicates unauthenticated exposure, another a 401/403 authentication boundary. The observation substrate is therefore unreliable for any exposure/access claim.',
          'Re-observe the resource under a controlled, identical request sequence to resolve the contradiction. Do not treat exposure or access claims as defensible until the conflict is resolved.',
          'LOW', 'LOW', 'LOW', 'LOW', 'LOW', 'LOW'
        );
      }
    }
    return null;
  }

  private deepFinding(
    type: FindingType, severity: SeverityLevel, basis: string,
    evidence: Evidence[], source_urls: string[], explanation: string, recommendation: string,
    confidence: 'LOW' | 'MEDIUM' | 'HIGH',
    evidenceS: StrengthLevel, reproS: StrengthLevel, sourceS: StrengthLevel, techS: StrengthLevel, ownerS: StrengthLevel
  ): DeepFinding {
    return {
      finding_type: type,
      impact_severity: severity,
      severity_basis: basis,
      evidence_ids: evidence.map(e => e.id),
      source_urls: Array.from(new Set(source_urls.filter(Boolean))),
      provenance: this.provenanceOfObs(evidence),
      confidence,
      strength: { evidence_strength: evidenceS, reproducibility: reproS, source_quality: sourceS, technical_specificity: techS, owner_confidence: ownerS },
      explanation,
      recommendation
    };
  }

  private provenanceOfObs(evidence: Evidence[]): EvidenceProvenance {
    if (evidence.some(e => e.evidence_origin === 'REAL_PUBLIC_OBSERVATION' || e.evidence_origin === 'MOCK_TEST')) return 'REAL_PUBLIC_OBSERVATION';
    if (evidence.some(e => e.evidence_origin === 'DOCUMENTED_SOURCE')) return 'DOCUMENTED_FACT';
    return 'REAL_PUBLIC_OBSERVATION';
  }

  private signalUrls(sig: DeepSignal): string[] {
    return sig.source_url ? [sig.source_url] : [];
  }

  private sigEvidence(sig: DeepSignal, observations: Evidence[]): Evidence[] {
    if (sig.related_evidence_ids && sig.related_evidence_ids.length) {
      return observations.filter(e => sig.related_evidence_ids!.includes(e.id));
    }
    return observations.filter(e => (e.public_url || '').replace(/\/$/, '') === (sig.source_url || '').replace(/\/$/, ''));
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
