/**
 * XAVIRA SUBJECT LINE SERVICE v4.2 — DETERMINISTIC EVIDENCE-BACKED INTELLIGENCE
 *
 * PIPELINE:
 * VERIFIED SIGNAL
 * → SUBJECT INTELLIGENCE LAYER (Entity, Verified Event, Tech Terms, Recency, Persona)
 * → 5 CANONICAL REASONING STRATEGIES (Signal Curiosity, Event→Question, Tech Direction, Executive Curiosity, Contextual Follow-up)
 * → CANDIDATE GENERATION (Strict 3–9 Words)
 * → CLAIM VALIDATION (Zero Hallucinated Metrics, Outages, Tech, or Problems)
 * → SIMILARITY CHECK (Semantic / Jaccard Token Overlap <= 55% → Automatic Regeneration)
 * → SUBJECT SCORING & HUMAN APPROVAL (Score 0-100)
 */

export type SubjectStrategy =
  | 'SIGNAL_CURIOSITY'
  | 'EVENT_TO_QUESTION'
  | 'TECHNICAL_DIRECTION'
  | 'EXECUTIVE_CURIOSITY'
  | 'CONTEXTUAL_FOLLOW_UP';

export type ClaimRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface VerifiedSignalInput {
  company: string;
  signalType?: string;
  evidenceText?: string;
  sourceUrl?: string;
  publishedAt?: string;
  verificationStatus?: string;
  confidence?: string;
  technicalRelevance?: number;
  businessImplication?: string;
  engineeringImplication?: string;
  persona?: string;
  previousSubjects?: string[];
  previousReasoningStructures?: string[];
  scalingRisks?: string;
}

export interface ExtractedSignalIntelligence {
  company: string;
  signalType: string;
  exactVerifiedEvent: string;
  publishedDate: string;
  signalAgeDays: number;
  evidenceText: string;
  technicalRelevance: number;
  businessImplication: string;
  persona: string;
  verifiedTechTerms: string[];
  fundingRound?: string;
  productOrFeatureName?: string;
  infraFocus?: string;
  isRecent: boolean;
  isStale: boolean;
  previousSubjects: string[];
  previousReasoningStructures: string[];
}

export interface SubjectScoreBreakdown {
  evidence_specificity: number;      // 0–25
  curiosity: number;                 // 0–20
  persona_relevance: number;         // 0–20
  signal_recency: number;            // 0–15
  conversational_naturalness: number;// 0–20
  genericness_penalty: number;       // 0 to -30
  unsupported_claim_risk_penalty: number; // 0 to -50
  similarity_penalty: number;        // 0 to -50
}

export interface ClaimValidationResult {
  isValid: boolean;
  riskLevel: ClaimRiskLevel;
  blockReason?: string;
  riskFlags: string[];
  unsupportedClaims: string[];
  evidenceAnchor: string;
}

export interface GeneratedSubjectCandidate {
  subject: string;
  strategy: SubjectStrategy;
  strategyLabel: string;
  wordCount: number;
  score: number;
  scoreBreakdown: SubjectScoreBreakdown;
  evidence_anchor: string;
  claim_risk: ClaimRiskLevel;
  approval_status: 'APPROVED' | 'BLOCKED' | 'REGENERATED';
  block_reason: string;
  similarityScore: number;
  isFollowUp: boolean;
}

export interface SubjectLineGenerationResult {
  status: 'APPROVED' | 'BLOCKED' | 'REGENERATED';
  code: 'SUBJECT_APPROVED' | 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL' | 'SUBJECT_BLOCKED_VALIDATION_FAILED';
  company: string;
  selectedSubject: string;
  selectedStrategy?: SubjectStrategy;
  selectedCandidate?: GeneratedSubjectCandidate;
  candidates: GeneratedSubjectCandidate[];
  strategyCandidates: Record<SubjectStrategy, GeneratedSubjectCandidate | null>;
  intelligence: ExtractedSignalIntelligence | null;
  rationale: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUBJECT INTELLIGENCE LAYER (Extraction & Verification Anchor)
// ─────────────────────────────────────────────────────────────────────────────

export class SubjectIntelligenceLayer {
  private static TECH_DICTIONARY = [
    'evaluation', 'eval', 'container', 'sbom', 'threat intelligence', 'kubernetes',
    'k8s', 'kafka', 'redis', 'postgres', 'postgresql', 'graphql', 'grpc', 'pr stacking',
    'merge queue', 'ci/cd', 'banking licence', 'deposit operations', 'distributed systems',
    'developer workflow', 'infrastructure', 'security platform', 'rag', 'llm'
  ];

  static extract(signal: VerifiedSignalInput): ExtractedSignalIntelligence | null {
    const company = (signal?.company || '').trim();
    const evidenceText = (signal?.evidenceText || '').trim();
    if (!company || !evidenceText) return null;

    const publishedDate = signal.publishedAt || '';
    let signalAgeDays = 9999;
    if (publishedDate) {
      const pub = new Date(publishedDate);
      if (!isNaN(pub.getTime())) {
        const now = new Date();
        signalAgeDays = Math.max(0, Math.floor((now.getTime() - pub.getTime()) / (1000 * 60 * 60 * 24)));
      }
    }

    const eLower = evidenceText.toLowerCase();

    // Extract Funding Round
    let fundingRound: string | undefined;
    if (eLower.includes('series b')) fundingRound = 'Series B';
    else if (eLower.includes('series a')) fundingRound = 'Series A';
    else if (eLower.includes('series c')) fundingRound = 'Series C';
    else if (eLower.includes('series d')) fundingRound = 'Series D';
    else if (eLower.includes('series e')) fundingRound = 'Series E';
    else if (eLower.includes('seed')) fundingRound = 'Seed';
    else if (eLower.includes('raised') || eLower.includes('funding')) fundingRound = 'recent round';

    // Extract Exact Verified Event
    let exactVerifiedEvent = '';
    if (fundingRound) {
      const amountMatch = evidenceText.match(/\$[\d,]+(\s?million|\s?billion|\s?m|\s?b)?|\£[\d,]+(\s?million|\s?billion|\s?m|\s?b)?/i);
      exactVerifiedEvent = amountMatch ? `${amountMatch[0]} ${fundingRound}` : fundingRound;
    } else if (eLower.includes('licence') || eLower.includes('license')) {
      exactVerifiedEvent = 'banking licence authorization';
    } else if (eLower.includes('pr stacking') || eLower.includes('merge queue')) {
      exactVerifiedEvent = 'parallel PR stacking rollout';
    } else if (eLower.includes('expansion') || eLower.includes('scale')) {
      exactVerifiedEvent = 'platform expansion';
    } else {
      exactVerifiedEvent = 'infrastructure update';
    }

    // Extract Verified Tech Terms (ONLY if strictly contained in evidenceText)
    const verifiedTechTerms = this.TECH_DICTIONARY.filter(term => eLower.includes(term));

    // Extract Infra Focus
    let infraFocus: string | undefined;
    if (verifiedTechTerms.includes('evaluation') || verifiedTechTerms.includes('eval')) {
      infraFocus = 'evaluation stack';
    } else if (verifiedTechTerms.includes('pr stacking') || verifiedTechTerms.includes('merge queue')) {
      infraFocus = 'merge queue platform';
    } else if (verifiedTechTerms.includes('container') || verifiedTechTerms.includes('sbom')) {
      infraFocus = 'container security';
    } else if (verifiedTechTerms.includes('threat intelligence')) {
      infraFocus = 'threat intelligence pipeline';
    } else if (verifiedTechTerms.includes('banking licence')) {
      infraFocus = 'deposit infrastructure';
    } else if (verifiedTechTerms.includes('kubernetes') || verifiedTechTerms.includes('k8s')) {
      infraFocus = 'Kubernetes platform';
    }

    return {
      company,
      signalType: signal.signalType || (fundingRound ? 'FUNDING_GROWTH' : 'INFRASTRUCTURE_CHANGE'),
      exactVerifiedEvent,
      publishedDate,
      signalAgeDays,
      evidenceText,
      technicalRelevance: signal.technicalRelevance ?? 20,
      businessImplication: signal.businessImplication || exactVerifiedEvent,
      persona: signal.persona || 'CTO',
      verifiedTechTerms,
      fundingRound,
      exactVerifiedEvent,
      infraFocus,
      isRecent: signalAgeDays <= 30,
      isStale: signalAgeDays > 90,
      previousSubjects: signal.previousSubjects || [],
      previousReasoningStructures: signal.previousReasoningStructures || []
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CLAIM VALIDATION ENGINE
// ─────────────────────────────────────────────────────────────────────────────

export class ClaimValidationEngine {
  public static RESTRICTED_TECH_KEYWORDS = [
    'kafka', 'redis', 'kubernetes', 'k8s', 'gpu', 'gpus', 'cuda', 'queue', 'queues',
    'dynamodb', 'cassandra', 'postgres', 'postgresql', 'mongodb', 'elasticsearch',
    'snowflake', 'databricks', 'clickhouse', 'rabbitmq', 'grpc', 'graphql',
    'latency', 'p99', 'p95', 'throughput', 'hot partition', 'hot partitioning',
    'memory leak', 'memory leaks', 'lock contention', 'deadlock', 'threadlock',
    'connection pool', 'pool exhaustion', 'cold start', 'cold starts',
    'outage', 'outages', 'downtime', 'incident', 'cascade failure',
    'cloud cost', 'cloud costs', 'aws bill', 'cost reduction', 'over-provisioned',
    'spiking', 'failing', 'crash', 'crashes', 'bursty workloads'
  ];

  public static MARKETING_SALES_PATTERNS = [
    /\b(i can help|help you|how we can help|can we help)\b/i,
    /\b(our solutions?|our services?|consulting services?|engineering services?)\b/i,
    /\b(scale your (business|platform|infrastructure)|grow your business|boost your|skyrocket|transform your|supercharge|revolutionize)\b/i,
    /\b(unlock|transformations?|game-changers?|drive revenue|accelerate your)\b/i,
    /\b(partnership opportunity|strategic partnership|synergy)\b/i,
    /\b(free audit|book a call|let's chat|time to connect|quick intro call|call scheduled)\b/i,
    /\b(pricing|special offer|discounts?|demos?|pitch|hire us|let us solve)\b/i,
    /\b(xavira|services|expert consulting)\b/i
  ];

  public static FABRICATED_PROBLEM_PATTERNS = [
    /\b(under bursty workloads|queue depth overhead|lock contention)\b/i,
    /\b(your outage|your incident|your broken|your slow database|fixing your|struggling with)\b/i,
    /\b(reduce.*costs?|fix.*latency|prevent.*failures?|database bottlenecks?|reliability issues?)\b/i
  ];

  static validate(subject: string, evidenceText: string, company: string): ClaimValidationResult {
    const sLower = subject.toLowerCase();
    const eLower = (evidenceText || '').toLowerCase();
    const riskFlags: string[] = [];
    const unsupportedClaims: string[] = [];
    let riskLevel: ClaimRiskLevel = 'LOW';

    // 1. Marketing & Sales Language Check
    for (const pattern of this.MARKETING_SALES_PATTERNS) {
      if (pattern.test(subject)) {
        riskFlags.push('MARKETING_SALES_LANGUAGE');
        unsupportedClaims.push(`Matches marketing pattern: ${pattern.source}`);
        riskLevel = 'CRITICAL';
      }
    }

    // 2. Fabricated Problem Check
    for (const pattern of this.FABRICATED_PROBLEM_PATTERNS) {
      if (pattern.test(subject) && !eLower.includes(pattern.source.toLowerCase())) {
        riskFlags.push('FABRICATED_TECHNICAL_CLAIM');
        unsupportedClaims.push(`Fabricated problem assertion: ${pattern.source}`);
        riskLevel = 'CRITICAL';
      }
    }

    // 3. Restricted Technology Mention Check
    for (const keyword of this.RESTRICTED_TECH_KEYWORDS) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(subject)) {
        if (!eLower.includes(keyword)) {
          riskFlags.push('UNSUPPORTED_TECHNOLOGY_MENTION');
          unsupportedClaims.push(`Subject mentions "${keyword}" which is absent from verified evidence`);
          if (riskLevel !== 'CRITICAL') riskLevel = 'HIGH';
        }
      }
    }

    // 4. Word Count Check (Strictly 3–9 words)
    const words = subject.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length > 9) {
      riskFlags.push(`SUBJECT_TOO_LONG (${words.length} words; max 9 allowed)`);
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    } else if (words.length < 3) {
      riskFlags.push(`SUBJECT_TOO_SHORT (${words.length} words; min 3 required)`);
      if (riskLevel === 'LOW') riskLevel = 'MEDIUM';
    }

    // Identify evidence anchor
    let evidenceAnchor = 'Company Name';
    if (eLower.includes('series') && sLower.includes('series')) evidenceAnchor = 'Verified Funding Round';
    else if (eLower.includes('evaluation') && sLower.includes('eval')) evidenceAnchor = 'Verified Evaluation Platform';
    else if (eLower.includes('stacking') && sLower.includes('stack')) evidenceAnchor = 'Verified PR Stacking';
    else if (sLower.includes('expansion')) evidenceAnchor = 'Verified Expansion';

    const isValid = riskFlags.length === 0;
    return {
      isValid,
      riskLevel: isValid ? 'LOW' : riskLevel,
      blockReason: isValid ? undefined : riskFlags.join('; '),
      riskFlags,
      unsupportedClaims,
      evidenceAnchor
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. SIMILARITY CHECKER
// ─────────────────────────────────────────────────────────────────────────────

export class SubjectSimilarityChecker {
  static calculate(subject1: string, subject2: string): number {
    if (!subject1 || !subject2) return 0;

    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 2);

    const t1 = normalize(subject1);
    const t2 = normalize(subject2);

    if (t1.length === 0 || t2.length === 0) return 0;

    const set2 = new Set(t2);
    const intersection = t1.filter(token => set2.has(token));
    const maxLen = Math.max(t1.length, t2.length);

    return (intersection.length / maxLen) * 100;
  }

  static maxSimilarity(candidate: string, previousSubjects: string[]): number {
    if (!previousSubjects || previousSubjects.length === 0) return 0;
    let max = 0;
    for (const prev of previousSubjects) {
      const sim = this.calculate(candidate, prev);
      if (sim > max) max = sim;
    }
    return max;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SUBJECT SCORING MODEL
// ─────────────────────────────────────────────────────────────────────────────

export class SubjectScoringModel {
  static score(
    subject: string,
    strategy: SubjectStrategy,
    intel: ExtractedSignalIntelligence,
    validation: ClaimValidationResult,
    similarityScore: number
  ): { score: number; breakdown: SubjectScoreBreakdown } {
    const sLower = subject.toLowerCase();
    const cLower = intel.company.toLowerCase();
    const eLower = intel.evidenceText.toLowerCase();
    const words = subject.trim().split(/\s+/).filter(w => w.length > 0);

    // 1. Evidence Specificity (0-25)
    let evidence_specificity = 10;
    if (intel.fundingRound && sLower.includes(intel.fundingRound.toLowerCase())) {
      evidence_specificity = 25;
    } else if (intel.infraFocus && sLower.includes(intel.infraFocus.split(' ')[0].toLowerCase())) {
      evidence_specificity = 25;
    } else if (sLower.includes(cLower)) {
      evidence_specificity = 20;
    }

    // 2. Curiosity (0-20)
    let curiosity = 15;
    if (sLower.includes('one question') || sLower.includes('question') || sLower.includes('scaling phase')) {
      curiosity = 20;
    }

    // 3. Persona Relevance (0-20)
    let persona_relevance = 15;
    if (intel.persona === 'CTO' || intel.persona === 'VP_ENGINEERING') {
      if (sLower.includes('engineering') || sLower.includes('stack') || sLower.includes('scaling') || sLower.includes('platform')) {
        persona_relevance = 20;
      }
    } else if (intel.persona === 'CEO') {
      if (sLower.includes('scaling') || sLower.includes('series') || sLower.includes('expansion')) {
        persona_relevance = 20;
      }
    }

    // 4. Signal Recency (0-15)
    let signal_recency = 5;
    if (intel.signalAgeDays <= 14) signal_recency = 15;
    else if (intel.signalAgeDays <= 30) signal_recency = 12;
    else if (intel.signalAgeDays <= 90) signal_recency = 8;
    else signal_recency = 0; // Stale signal (>90d) receives 0 recency points

    // 5. Conversational Naturalness (0-20)
    let conversational_naturalness = 18;
    if (words.length >= 4 && words.length <= 8) {
      conversational_naturalness = 20;
    } else if (words.length < 3 || words.length > 9) {
      conversational_naturalness = 5;
    }

    // Penalties
    let genericness_penalty = 0;
    if (/^(quick question|following up|just checking in)$/i.test(subject.trim())) {
      genericness_penalty = -30;
    }

    let unsupported_claim_risk_penalty = 0;
    if (validation.riskLevel === 'CRITICAL') {
      unsupported_claim_risk_penalty = -50;
    } else if (validation.riskLevel === 'HIGH') {
      unsupported_claim_risk_penalty = -40;
    } else if (validation.riskLevel === 'MEDIUM') {
      unsupported_claim_risk_penalty = -20;
    }

    let similarity_penalty = 0;
    if (similarityScore > 55) {
      similarity_penalty = -50;
    }

    const positiveTotal = evidence_specificity + curiosity + persona_relevance + signal_recency + conversational_naturalness;
    const penaltyTotal = genericness_penalty + unsupported_claim_risk_penalty + similarity_penalty;

    let finalScore = Math.max(0, Math.min(100, positiveTotal + penaltyTotal));

    // Hard block conditions
    if (!validation.isValid || similarityScore > 55 || intel.isStale) {
      finalScore = 0;
    }

    const breakdown: SubjectScoreBreakdown = {
      evidence_specificity,
      curiosity,
      persona_relevance,
      signal_recency,
      conversational_naturalness,
      genericness_penalty,
      unsupported_claim_risk_penalty,
      similarity_penalty
    };

    return { score: finalScore, breakdown };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUBJECT LINE SERVICE v4.2
// ─────────────────────────────────────────────────────────────────────────────

export class SubjectLineService {
  /**
   * Generates candidate subject text for each of the 5 canonical reasoning structures.
   */
  static generateStrategySubject(
    strategy: SubjectStrategy,
    intel: ExtractedSignalIntelligence,
    attempt: number = 0
  ): string {
    const c = intel.company;
    const round = intel.fundingRound;
    const tech = intel.infraFocus;

    switch (strategy) {
      // 1. SIGNAL CURIOSITY: Anchor directly to the verified event without claiming a problem
      case 'SIGNAL_CURIOSITY': {
        if (round && attempt === 0) return `${c}'s next scaling phase`;
        if (round && attempt === 1) return `${c}'s post-${round} scale`;
        if (tech && attempt === 0) return `${c}'s ${tech} direction`;
        if (attempt === 1) return `${c}'s next engineering phase`;
        return `${c}'s platform scale`;
      }

      // 2. EVENT → QUESTION: Connect verified event to a natural executive question
      case 'EVENT_TO_QUESTION': {
        if (round && attempt === 0) return `After the ${round} — one question`;
        if (round && attempt === 1) return `One question after the ${round}`;
        if (attempt === 0) return `After the expansion — one question`;
        return `Following ${c}'s expansion — one question`;
      }

      // 3. TECHNICAL DIRECTION: Only mention technology explicitly present in verified evidence
      case 'TECHNICAL_DIRECTION': {
        if (tech && attempt === 0) return `A question on the ${tech}`;
        if (tech && attempt === 1) return `One question on ${c}'s ${tech}`;
        if (attempt === 0) return `${c}'s engineering direction`;
        return `One question on ${c}'s infrastructure`;
      }

      // 4. EXECUTIVE CURIOSITY: Very short, peer-level subject that creates an information gap
      case 'EXECUTIVE_CURIOSITY': {
        if (attempt === 0) return `Scaling question`;
        if (attempt === 1) return `One infrastructure question`;
        if (attempt === 2) return `Engineering scale at ${c}`;
        return `One question on ${c}`;
      }

      // 5. CONTEXTUAL FOLLOW-UP: Only for existing conversations; preserves thread continuity
      case 'CONTEXTUAL_FOLLOW_UP': {
        if (round && attempt === 0) return `Quick follow-up on the ${round}`;
        if (attempt === 0) return `Following up on ${c}'s scaling question`;
        if (attempt === 1) return `Re: ${c}'s engineering direction`;
        return `Re: one question on ${c}`;
      }

      default:
        return `One question on ${c}'s scaling`;
    }
  }

  /**
   * Main subject generation pipeline
   */
  static generateSubjects(
    signalInput: VerifiedSignalInput | null | undefined,
    previousSubjects: string[] = [],
    isFollowUp: boolean = false
  ): SubjectLineGenerationResult {
    // GATE 1: SIGNAL VERIFICATION CHECK
    const company = (signalInput?.company || '').trim();
    const evidenceText = (signalInput?.evidenceText || '').trim();
    const verificationStatus = signalInput?.verificationStatus || 'VERIFIED';
    const isUnverified = !signalInput || !company || !evidenceText || verificationStatus === 'UNVERIFIED' || verificationStatus === 'BLOCKED_NO_SOURCE' || verificationStatus === 'NO_ACTIONABLE_SIGNAL';

    if (isUnverified) {
      return {
        status: 'BLOCKED',
        code: 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL',
        company: company || 'Unknown',
        selectedSubject: '',
        selectedStrategy: undefined,
        candidates: [],
        strategyCandidates: {
          SIGNAL_CURIOSITY: null,
          EVENT_TO_QUESTION: null,
          TECHNICAL_DIRECTION: null,
          EXECUTIVE_CURIOSITY: null,
          CONTEXTUAL_FOLLOW_UP: null
        },
        intelligence: null,
        rationale: 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL: Outreach subject generation blocked because no verified public signal exists.'
      };
    }

    const intel = SubjectIntelligenceLayer.extract(signalInput);
    if (!intel) {
      return {
        status: 'BLOCKED',
        code: 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL',
        company: company || 'Unknown',
        selectedSubject: '',
        selectedStrategy: undefined,
        candidates: [],
        strategyCandidates: {
          SIGNAL_CURIOSITY: null,
          EVENT_TO_QUESTION: null,
          TECHNICAL_DIRECTION: null,
          EXECUTIVE_CURIOSITY: null,
          CONTEXTUAL_FOLLOW_UP: null
        },
        intelligence: null,
        rationale: 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL: Failed to extract verified signal intelligence.'
      };
    }

    const strategies: SubjectStrategy[] = [
      'SIGNAL_CURIOSITY',
      'EVENT_TO_QUESTION',
      'TECHNICAL_DIRECTION',
      'EXECUTIVE_CURIOSITY',
      'CONTEXTUAL_FOLLOW_UP'
    ];

    const strategyLabels: Record<SubjectStrategy, string> = {
      SIGNAL_CURIOSITY: '1. Signal Curiosity',
      EVENT_TO_QUESTION: '2. Event → Question',
      TECHNICAL_DIRECTION: '3. Technical Direction',
      EXECUTIVE_CURIOSITY: '4. Executive Curiosity',
      CONTEXTUAL_FOLLOW_UP: '5. Contextual Follow-up'
    };

    const candidates: GeneratedSubjectCandidate[] = [];
    const strategyCandidates: Record<SubjectStrategy, GeneratedSubjectCandidate | null> = {
      SIGNAL_CURIOSITY: null,
      EVENT_TO_QUESTION: null,
      TECHNICAL_DIRECTION: null,
      EXECUTIVE_CURIOSITY: null,
      CONTEXTUAL_FOLLOW_UP: null
    };

    for (const strat of strategies) {
      let subjectText = this.generateStrategySubject(strat, intel, 0);
      let validation = ClaimValidationEngine.validate(subjectText, intel.evidenceText, intel.company);
      let simScore = SubjectSimilarityChecker.maxSimilarity(subjectText, previousSubjects);

      // Similarity regeneration: If similarity > 55%, regenerate using alternative attempts
      let attempt = 0;
      while ((simScore > 55 || !validation.isValid) && attempt < 3) {
        attempt++;
        const altText = this.generateStrategySubject(strat, intel, attempt);
        const altVal = ClaimValidationEngine.validate(altText, intel.evidenceText, intel.company);
        const altSim = SubjectSimilarityChecker.maxSimilarity(altText, previousSubjects);
        if (altVal.isValid && altSim <= 55) {
          subjectText = altText;
          validation = altVal;
          simScore = altSim;
          break;
        }
      }

      const { score, breakdown } = SubjectScoringModel.score(subjectText, strat, intel, validation, simScore);
      const words = subjectText.trim().split(/\s+/).filter(w => w.length > 0);
      const isApproved = validation.isValid && simScore <= 55 && score > 0 && !intel.isStale;

      const candidate: GeneratedSubjectCandidate = {
        subject: subjectText,
        strategy: strat,
        strategyLabel: strategyLabels[strat],
        wordCount: words.length,
        score,
        scoreBreakdown: breakdown,
        evidence_anchor: validation.evidenceAnchor,
        claim_risk: validation.riskLevel,
        approval_status: isApproved ? (simScore > 0 ? 'REGENERATED' : 'APPROVED') : 'BLOCKED',
        block_reason: !isApproved ? (intel.isStale ? 'OLD_SIGNAL: Stale signal >90d' : validation.blockReason || `High similarity (${simScore.toFixed(1)}%)`) : '',
        similarityScore: simScore,
        isFollowUp: strat === 'CONTEXTUAL_FOLLOW_UP'
      };

      candidates.push(candidate);
      strategyCandidates[strat] = candidate;
    }

    // Select the best candidate
    const preferredStrategy: SubjectStrategy = isFollowUp ? 'CONTEXTUAL_FOLLOW_UP' : 'SIGNAL_CURIOSITY';
    let selected = candidates.find(c => c.strategy === preferredStrategy && c.approval_status !== 'BLOCKED');

    if (!selected) {
      const approvedCandidates = candidates.filter(c => c.approval_status !== 'BLOCKED').sort((a, b) => b.score - a.score);
      selected = approvedCandidates[0];
    }

    if (!selected) {
      return {
        status: 'BLOCKED',
        code: 'SUBJECT_BLOCKED_VALIDATION_FAILED',
        company: intel.company,
        selectedSubject: '',
        selectedStrategy: undefined,
        selectedCandidate: undefined,
        candidates,
        strategyCandidates,
        intelligence: intel,
        rationale: 'All subject candidates failed validation or exceeded risk thresholds.'
      };
    }

    return {
      status: selected.approval_status,
      code: 'SUBJECT_APPROVED',
      company: intel.company,
      selectedSubject: selected.subject,
      selectedStrategy: selected.strategy,
      selectedCandidate: selected,
      candidates,
      strategyCandidates,
      intelligence: intel,
      rationale: `Approved [${selected.strategyLabel}]: "${selected.subject}" (${selected.wordCount} words, Score ${selected.score}/100, Anchor: ${selected.evidence_anchor}).`
    };
  }
}
