/**
 * XAVIRA — DEEP SIGNAL EXTRACTOR (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts structured technical SIGNALS from the bounded public surface that
 * PublicLinkDiscovery already discovered. It does NOT perform any classification
 * that the core engine owns (finding/evidence/owner/email) — it produces
 * additional structured context used by the ICP qualification and email layers.
 *
 * Signals are conservative: a signal is only emitted when an explicit keyword
 * or structured public resource is observed on a page. Generic engineering
 * prose is never turned into an active problem here.
 */

import type { DeepSignal, SignalSourceType, EvidenceProvenance, SignalStrength, DeepStage } from './DeepTypes';
import type { Evidence, DiscoveredPage, CompanySurface } from './IntelligenceCase';

type SignalDetector = {
  type: SignalSourceType;
  provenance: (cat: string | undefined, isStatusPage: boolean) => EvidenceProvenance;
  strength: (cat: string | undefined) => SignalStrength;
  regex: RegExp;
  relevance: string;
};

const DETECTORS: SignalDetector[] = [
  {
    type: 'PUBLIC_INCIDENT',
    regex: /\b(?:major|partial|service)?\s*outage\b|\bindent report\b|\bindent\b|degraded service|service interruption|postmortem\b|post-mortem\b|downtime|\bresolved\s+(?:the\s+)?incident\b/i,
    provenance: (_cat, isStatus) => isStatus ? 'REAL_PUBLIC_OBSERVATION' : 'DOCUMENTED_FACT',
    strength: (cat) => (cat === 'status_ops' || cat === 'blog' || cat === 'engineering') ? 'HIGH' : 'MEDIUM',
    relevance: 'Publicly documented incident / outage / service degradation.'
  },
  {
    type: 'STATUS_PAGE',
    regex: /\ball systems (?:operational|normal)\b|status page|real-time status|system status|availability status|monitoring our services/i,
    provenance: (cat) => cat === 'status_ops' ? 'REAL_PUBLIC_OBSERVATION' : 'DOCUMENTED_FACT',
    strength: (cat) => (cat === 'status_ops') ? 'MEDIUM' : 'LOW',
    relevance: 'Public observability / status surface is published.'
  },
  {
    type: 'TECHNICAL_HIRING',
    regex: /\b(?:we'?re?\s*)?hiring\b|\bjoin (?:our|the) (?:engineering|platform|infra(?:structure)?|SRE|security)\b|\btechnical\s*(?:role|position|opening)\b|\bopen\s*(?:eng|sw|infra|platform|sre|security)\b/i,
    provenance: () => 'DOCUMENTED_FACT',
    strength: (cat) => (cat === 'hiring' || cat === 'engineering' || cat === 'careers') ? 'HIGH' : 'MEDIUM',
    relevance: 'Public technical hiring signal (engineer-facing organization).'
  },
  {
    type: 'API_REFERENCE',
    regex: /\bAPI\s*reference\b|\bREST\s*API\b|\bGraphQL\s*API\b|\bwebhooks?\b|\bOpenAPI\b|\bswagger\b|\bclient\s*library\b|\/v\d+\/|\bSDK\b|\bDeveloper\s*portal\b/i,
    provenance: () => 'DOCUMENTED_FACT',
    strength: (cat) => (cat === 'developers' || cat === 'docs' || cat === 'api') ? 'HIGH' : 'MEDIUM',
    relevance: 'Public API / developer platform surface.'
  },
  {
    type: 'ARCHITECTURE_DISCUSSION',
    regex: /\bmicroservices?\b|\bkubernetes\b|\bk8s\b|\bAWS\b|\bamazon web services\b|\bgoogle cloud\b|\bgcp\b|\bazure\b|\bcloud-native\b|\bcontainers?\b|\bdocker\b|\bterraform\b|\bre-platforming\b|\breplatformed\b|\barchitecture\b/i,
    provenance: (cat) => (cat === 'engineering' || cat === 'docs' || cat === 'technology') ? 'DOCUMENTED_FACT' : 'XAVIRA_INFERENCE',
    strength: (cat) => (cat === 'engineering' || cat === 'docs' || cat === 'technology') ? 'HIGH' : 'LOW',
    relevance: 'Publicly stated architecture / infrastructure stack.'
  },
  {
    type: 'SECURITY_PAGE',
    regex: /\bSOC\s*2\b|\bISO\s*27001\b|\bpci\s*dss\b|\bhipaa\b|\bpenetration\s*test\b|\bbug\s*bounty\b|\bvulnerability\s*disclosure\b|\bencryption\s*at\s*rest\b|\bprivacy\s*shield\b|\bCSA\s*STAR\b/i,
    provenance: (cat) => cat === 'security' ? 'DOCUMENTED_FACT' : 'XAVIRA_INFERENCE',
    strength: (cat) => (cat === 'security') ? 'HIGH' : 'LOW',
    relevance: 'Public security / compliance posture mention.'
  },
  {
    type: 'ENGINEERING_ARTICLE',
    regex: /\bscaling\b|\bsharded\b|\bpartitioned\b|\bmillions of\b|\bthroughput\b|\bhandle\s+\d{3,}\b|\breliability\b|\bplatform\b|\binfra\b/i,
    provenance: () => 'XAVIRA_INFERENCE',
    strength: () => 'LOW',
    relevance: 'Operational scale / reliability discussion (inferred).'
  },
  {
    type: 'BLOG',
    regex: /engineering blog|tech blog|inside (?:our|the) engineering|from the (?:engineering|platform)/i,
    provenance: () => 'DOCUMENTED_FACT',
    strength: (cat) => (cat === 'blog' || cat === 'engineering') ? 'MEDIUM' : 'LOW',
    relevance: 'Company maintains an engineering-facing blog.'
  }
];

/** Simple stable hash for signal IDs. */
function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Return the sentence/segment around the first match, length-capped. */
function sentenceAround(text: string, keyword: string, cap = 200): string {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase());
  if (idx < 0) return text.slice(0, cap);
  let start = text.lastIndexOf('.', idx - 1);
  start = start < 0 ? 0 : start + 1;
  let end = text.indexOf('.', idx + keyword.length);
  end = end < 0 ? text.length : end + 1;
  const seg = text.slice(start, end).trim();
  return seg.length > cap ? seg.slice(0, cap) + '…' : seg;
}

function publishedAt(html: string): string | undefined {
  const time = /<time[^>]+datetime=["']([^"']+)["']/i.exec(html);
  if (time) return time[1];
  const meta = /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i.exec(html);
  if (meta) return meta[1];
  return undefined;
}

export interface SignalExtractorOptions {
  onProgress?: (stage: DeepStage, message: string) => void;
}

export class DeepSignalExtractor {
  /**
   * Build structured signals from the bounded public surface HTML plus any
   * observation evidence the engine produced (signals may link to evidence ids).
   */
  static extract(
    pages: DiscoveredPage[],
    htmlByUrl: Map<string, string>,
    observationEvidence: Evidence[] = [],
    options: SignalExtractorOptions = {}
  ): DeepSignal[] {
    const signals: DeepSignal[] = [];
    const evidenceByUrl = new Map<string, Evidence[]>();
    for (const ev of observationEvidence) {
      if (!ev.public_url) continue;
      const k = ev.public_url.replace(/\/$/, '') || ev.public_url;
      const arr = evidenceByUrl.get(k) || [];
      arr.push(ev);
      evidenceByUrl.set(k, arr);
    }

    for (const page of pages) {
      const key = page.url.replace(/\/$/, '') || page.url;
      const html = htmlByUrl.get(page.url) || htmlByUrl.get(key);
      if (!html) continue; // signals only from pages we actually fetched
      const text = textOf(html);
      const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
      const title = titleMatch ? titleMatch[1].trim() : undefined;
      const pub = publishedAt(html);
      const isStatus = page.category === 'status_ops';

      const seen = new Set<SignalSourceType>();
      for (const det of DETECTORS) {
        const m = det.regex.exec(text);
        if (!m) continue;
        if (seen.has(det.type)) continue;
        seen.add(det.type);

        const provenance: EvidenceProvenance = det.provenance(page.category, isStatus);
        const strength: SignalStrength = det.strength(page.category);
        const excerpt = sentenceAround(text, m[0]);
        const related = (evidenceByUrl.get(key) || []).filter(e => e.public_url === page.url).map(e => e.id);

        signals.push({
          signal_id: `sig_${det.type}_${hash(page.url)}`,
          type: det.type,
          source_url: page.url,
          source_title: title,
          published_at: pub,
          excerpt,
          provenance,
          signal_strength: strength,
          relevance: det.relevance,
          related_evidence_ids: related.length ? related : undefined
        });
      }
    }

    options.onProgress?.('signals', `Extracted ${signals.length} technical signal(s) from public surface.`);
    return signals;
  }

  static splitByProvenance(signals: DeepSignal[]): {
    documented_facts: DeepSignal[];
    public_observations: DeepSignal[];
    inferences: DeepSignal[];
  } {
    const out = { documented_facts: [] as DeepSignal[], public_observations: [] as DeepSignal[], inferences: [] as DeepSignal[] };
    for (const s of signals) {
      if (s.provenance === 'DOCUMENTED_FACT') out.documented_facts.push(s);
      else if (s.provenance === 'REAL_PUBLIC_OBSERVATION') out.public_observations.push(s);
      else out.inferences.push(s);
    }
    return out;
  }
}
