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
import type { Evidence, DiscoveredPage, CompanySurface, SourceRelationship } from './IntelligenceCase';

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

export interface SignalCandidate {
  id: string;
  type: SignalSourceType;
  source_url: string;
  raw_match: string;
  initial_strength: SignalStrength;
  evidence_ids: string[];
  qualification_gaps: string[];
  provenance: EvidenceProvenance;
  category: string | undefined;
}

export class DeepSignalExtractor {
  /**
   * Build structured signal candidates from a set of observations.
   * Stage 1: Evidence -> SignalCandidate
   */
  static extractCandidates(
    observations: any[],
    observationEvidence: Evidence[] = [],
    options: { onCandidate: (cand: SignalCandidate | null, obs: any, mapping: SignalSourceType | null) => void } = { onCandidate: () => {} }
  ): SignalCandidate[] {
    const candidates: SignalCandidate[] = [];
    const evidenceByUrl = new Map<string, Evidence[]>();
    for (const ev of observationEvidence) {
      if (!ev.public_url) continue;
      const k = ev.public_url.replace(/\/$/, '') || ev.public_url;
      const arr = evidenceByUrl.get(k) || [];
      arr.push(ev);
      evidenceByUrl.set(k, arr);
    }

    for (const obs of observations) {
      const mapped = this.mapObservationToSignalType(obs.type, obs.raw_text || obs.text || '');

      // PHASE 2: TRACE ACTUAL OBSERVATION
      console.log(`\n[OBSERVATION_TRACE]`);
      console.log(`company=${obs.company || 'UNKNOWN'}`);
      console.log(`source_url=${obs.url || 'UNKNOWN'}`);
      console.log(`observation_type=${obs.type}`);
      console.log(`observation_text="${(obs.raw_text || obs.text || '').slice(0, 500)}..."`);

      if (!mapped) {
        console.log(`[MAPPING_FAILURE] No signal type mapping for obs_type: ${obs.type}`);
        options.onCandidate(null, obs, null);
        continue;
      }

      const signalType = mapped.type;
      const detector = mapped.detector;

      console.log(`[MAPPING_SUCCESS] ${obs.type} -> ${signalType}`);

      const relatedEvidence = evidenceByUrl.get(obs.url || '') || [];

      // IDENTITY GUARD: Filter out unverified evidence (Quarantine)
      // Only quarantine when there IS evidence but it's all unverified.
      // When no evidence exists, the observation itself is the evidence.
      const verifiedEvidence = relatedEvidence.filter(e => e.relationship_type !== 'UNVERIFIED');
      if (relatedEvidence.length > 0 && verifiedEvidence.length === 0) {
        console.log(`[QUARANTINE] Skipping signal extraction for unverified source: ${obs.url}`);
        options.onCandidate(null, obs, signalType);
        continue;
      }

      const relatedIds = verifiedEvidence.map(e => e.id);

      // Initial strength based on evidence strength, or default based on detector
      let strength: SignalStrength = 'LOW';
      if (verifiedEvidence.length > 0) {
        if (verifiedEvidence.some(e => e.strength === 'CRITICAL')) strength = 'HIGH';
        else if (verifiedEvidence.some(e => e.strength === 'HIGH')) strength = 'MEDIUM';
        else if (verifiedEvidence.some(e => e.strength === 'MEDIUM')) strength = 'LOW';
      } else if (detector) {
        strength = detector.strength(obs.category);
      }

      // Provenance from detector, or default
      const provenance = detector ? detector.provenance(obs.category, false) : 'REAL_PUBLIC_OBSERVATION';

      const candidate: SignalCandidate = {
        id: `cand_${signalType}_${hash(obs.url || Math.random().toString())}`,
        type: signalType,
        source_url: obs.url || 'unknown',
        raw_match: obs.raw_text || obs.text || '',
        initial_strength: strength,
        evidence_ids: relatedIds,
        qualification_gaps: [],
        provenance: provenance as any,
        category: obs.category,
      };

      console.log(`[CANDIDATE_CREATED] ID: ${candidate.id} | Type: ${candidate.type} | Strength: ${candidate.initial_strength}`);
      candidates.push(candidate);
      options.onCandidate(candidate, obs, signalType);
    }

    return candidates;
  }

  /**
   * Promote candidates to qualified signals.
   * Stage 2: SignalCandidate -> QualifiedSignal (DeepSignal)
   */
  static qualify(
    candidates: SignalCandidate[],
    observationEvidence: Evidence[],
    options: { onQualification: (res: 'QUALIFIED' | 'REJECTED') => void } = { onQualification: () => {} }
  ): DeepSignal[] {
    const qualified: DeepSignal[] = [];

    for (const cand of candidates) {
      const evidence = observationEvidence.filter(e => cand.evidence_ids.includes(e.id));

      // QUALIFICATION RULES
      // 1. Must have evidence OR be from a direct HTML observation (no evidence required)
      if (evidence.length === 0 && cand.evidence_ids.length > 0) {
        // Candidates with evidence IDs but no matching evidence — quarantine
        console.log(`[QUALIFICATION_REJECTED] ${cand.id} | Reason: MISSING_PROVENANCE`);
        cand.qualification_gaps.push('MISSING_PROVENANCE');
        options.onQualification('REJECTED');
        continue;
      }

      // 2. Source strength check — only applies when evidence exists
      if (evidence.length > 0) {
        const hasHighStrength = evidence.some(e => e.strength === 'HIGH' || e.strength === 'CRITICAL');
        const hasMediumStrength = evidence.some(e => e.strength === 'MEDIUM');
        const hasMultipleSources = new Set(evidence.map(e => e.source_type)).size >= 2;

        if (!hasHighStrength && !hasMediumStrength && !hasMultipleSources) {
          console.log(`[QUALIFICATION_REJECTED] ${cand.id} | Reason: INSUFFICIENT_STRENGTH_OR_CORROBORATION`);
          cand.qualification_gaps.push('INSUFFICIENT_STRENGTH_OR_CORROBORATION');
          options.onQualification('REJECTED');
          continue;
        }
      }

      // Promote to DeepSignal
      console.log(`[QUALIFICATION_SUCCESS] ${cand.id} | Type: ${cand.type}`);
      qualified.push({
        signal_id: `sig_${cand.id}`,
        type: cand.type,
        source_url: cand.source_url,
        excerpt: cand.raw_match,
        provenance: cand.provenance as any,
        signal_strength: cand.initial_strength,
        relevance: `Qualified signal of type ${cand.type} based on verified evidence.`,
        related_evidence_ids: cand.evidence_ids
      });
      options.onQualification('QUALIFIED');
    }

    return qualified;
  }

  private static mapObservationToSignalType(obsType: string, text: string = ''): { type: SignalSourceType; detector: SignalDetector | null } | null {
    const mapping: Record<string, SignalSourceType> = {
      'incident': 'PUBLIC_INCIDENT',
      'system_health': 'STATUS_PAGE',
      'SRE_hiring': 'TECHNICAL_HIRING',
      'tech_stack_requirement': 'ARCHITECTURE_DISCUSSION',
      'ARCHITECTURE_SHIFT': 'ARCHITECTURE_DISCUSSION',
      'SCALING_PAIN': 'ARCHITECTURE_DISCUSSION',
      'RELIABILITY_HINT': 'PUBLIC_INCIDENT',
      'INFRA_LIMITATION': 'ARCHITECTURE_DISCUSSION',
    };

    if (mapping[obsType]) {
      const detector = DETECTORS.find(d => d.type === mapping[obsType]) || null;
      return { type: mapping[obsType], detector };
    }

    for (const detector of DETECTORS) {
      if (detector.regex.test(text)) return { type: detector.type, detector };
    }

    return null;
  }

  static extract(
    observations: any[],
    observationEvidence: Evidence[] | Map<string, string> = [],
    existingEvidence: Evidence[] = [],
    opts: { onProgress?: (stage: string, msg: string) => void } = {}
  ): DeepSignal[] {
    console.log(`\n[PROMOTION_FORENSICS] Starting promotion chain for ${observations.length} observations...`);

    // If the second arg is a Map (htmlByUrl), extract text from HTML and build observations
    let obsList: any[] = observations;
    if (observationEvidence instanceof Map) {
      obsList = [];
      for (const obs of observations) {
        const html = observationEvidence.get(obs.url);
        if (html) {
          const text = textOf(html);
          for (const detector of DETECTORS) {
            const m = detector.regex.exec(text);
            if (m) {
              obsList.push({
                url: obs.url,
                type: detector.type,
                raw_text: sentenceAround(text, m[0]),
                source_url: obs.url,
                category: obs.category,
              });
            }
          }
        }
      }
    }

    const evidenceArr = Array.isArray(observationEvidence) ? observationEvidence : [];
    evidenceArr.push(...existingEvidence);

    let observations_received = 0;
    let signal_mapping_success = 0;
    let candidates_created = 0;
    let candidates_rejected = 0;
    let candidates_qualified = 0;
    let signals_stored = 0;

    const candidates = this.extractCandidates(obsList, evidenceArr, {
      onCandidate: (cand, obs, mapping) => {
        observations_received++;
        if (mapping) signal_mapping_success++;
        if (cand) candidates_created++;
      }
    });

    const qualified = this.qualify(candidates, evidenceArr, {
      onQualification: (res) => {
        if (res === 'REJECTED') candidates_rejected++;
        else if (res === 'QUALIFIED') candidates_qualified++;
      }
    });

    signals_stored = qualified.length;

    console.log(`\n[PROMOTION_SUMMARY]`);
    console.log(`observations_received: ${observations_received}`);
    console.log(`signal_mapping_success: ${signal_mapping_success}`);
    console.log(`signal_candidates_created: ${candidates_created}`);
    console.log(`candidates_rejected: ${candidates_rejected}`);
    console.log(`candidates_qualified: ${candidates_qualified}`);
    console.log(`signals_stored: ${signals_stored}`);

    return qualified;
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
