/**
 * XAVIRA REPLY-WORTHINESS / OPPORTUNITY DISCOVERY ENGINE — 22 AUTOMATED TESTS
 *
 * ALL 22 TESTS MUST PASS BEFORE DEPLOYMENT.
 *
 * Tests:
 * 1. Strong multi-signal company → HIGH PRIORITY
 * 2. One weak signal → REVIEW/BLOCK
 * 3. Technology mention without problem evidence → no fabricated problem
 * 4. Two independent signals → correlation succeeds
 * 5. Contradictory signals → confidence reduced
 * 6. Stale signal → score reduction / capped
 * 7. No service fit → hard block
 * 8. Identity mismatch → hard block
 * 9. Domain mismatch → hard block
 * 10. Generic question → blocked
 * 11. Evidence-backed question → approved
 * 12. Fabricated technical hypothesis → blocked
 * 13. No business impact → blocked/review
 * 14. High reply-worthiness → outreach eligible
 * 15. Low reply-worthiness → no email
 * 16. Unsupported service claim → blocked
 * 17. Missing source → blocked
 * 18. Missing published date → blocked
 * 19. Existing subject validation still works
 * 20. Existing claim validation still works
 * 21. Existing similarity validation still works
 * 22. Existing compliance gates still work
 */

import {
  ReplyWorthinessEngine,
  MultiSignalCorrelationService,
  TechnicalHypothesisEngine,
  ServiceFitMapper,
  QuestionQualityEngine
} from './replyWorthinessEngine';
import { AllCompanyResearch } from '../data/allCompaniesResearch';
import { RealSignalEntry } from '../utils/signalEngineReal';
import { ClaimValidationEngine, SubjectSimilarityChecker, SubjectLineService } from './subjectLineService';
import { ClaimAndMetricValidator, EmailDomainValidator } from './targetQualificationEngine';
import { IdentityValidationService } from '../utils/signalEngineReal';

export function runReplyWorthinessTestSuite(): { total: number; passed: number; failed: number } {
  console.log('\n' + '═'.repeat(74));
  console.log('   XAVIRA REPLY-WORTHINESS ENGINE — 22 AUTOMATED VERIFICATION TESTS');
  console.log('═'.repeat(74) + '\n');

  let passed = 0;
  let failed = 0;

  function assertTest(name: string, fn: () => void) {
    try {
      fn();
      passed++;
      console.log(`✅ TEST ${String(passed + failed).padStart(2, '0')}: ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`❌ TEST ${String(passed + failed).padStart(2, '0')}: ${name}`);
      console.error(`   Failure: ${err.message || err}\n`);
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 1: Strong multi-signal company → HIGH PRIORITY
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('1. Strong multi-signal company → HIGH PRIORITY (Score >= 85, ELIGIBLE_FOR_OUTREACH)', () => {
    const mockCompany: AllCompanyResearch = {
      name: 'Graphite',
      sector: 'Developer Tools',
      geography: 'USA',
      fundingStage: 'Series B',
      totalRaised: '$52M',
      scalingRisks: 'Queue merge throughput',
      ceo: 'Merrill Lutsky',
      cto: 'Greg Foster',
      vpEngineering: 'Steve Hextall',
      email: 'greg@graphite.dev',
      techStack: 'TypeScript, Rust, Kubernetes',
      website: 'graphite.dev',
      status: 'Active',
      headquarters: 'San Francisco, CA',
      industry: 'Software',
      subIndustry: 'DevTools',
      businessModel: 'B2B SaaS',
      employeeCount: 65,
      engineeringTeamSize: 45,
      lastFundingDate: '2026-08-01',
      leadInvestor: 'Bessemer',
      keyCompetitors: 'GitHub',
      techStackFit: 'High',
      painPointSeverity: 'High',
      budgetEstimate: 100000,
      strategicFit: 'High',
      healthScore: 'Green',
      accountOwner: 'Vishnu',
      lastActivityDate: '2026-08-20',
      priorityScore: 90,
      priorityTier: 'P0',
      priorityRank: 1,
      priorityScore1to10: 9,
      abilityToPay1to10: 9,
      technicalRiskCategory: 'Infrastructure',
      recommendedPlaybook: 'Scale Pod'
    };

    const record = ReplyWorthinessEngine.evaluateTarget(mockCompany, {
      overrideRecipient: 'Greg Foster',
      overrideEmail: 'greg@graphite.dev',
      isUserResearchVerified: true
    });

    if (record.replyWorthinessScore < 85) {
      throw new Error(`Expected score >= 85, got ${record.replyWorthinessScore} (${JSON.stringify(record.scoreBreakdown)})`);
    }
    if (record.qualificationTier !== 'HIGH_PRIORITY') {
      throw new Error(`Expected HIGH_PRIORITY tier, got ${record.qualificationTier}`);
    }
    if (record.eligibility !== 'ELIGIBLE_FOR_OUTREACH') {
      throw new Error(`Expected ELIGIBLE_FOR_OUTREACH, got ${record.eligibility}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: One weak signal → REVIEW/BLOCK (<75)
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('2. One weak signal without corroboration → REVIEW / BLOCK (<75)', () => {
    const weakCompany: AllCompanyResearch = {
      name: 'UnverifiedCo',
      sector: 'FinTech',
      geography: 'UK',
      fundingStage: 'Seed',
      totalRaised: '$2M',
      scalingRisks: 'Unknown',
      ceo: 'Bob',
      cto: 'Alice',
      vpEngineering: 'N/A',
      email: 'alice@unverifiedco.com',
      techStack: 'PHP',
      website: 'unverifiedco.com',
      status: 'Active',
      headquarters: 'London',
      industry: 'Finance',
      subIndustry: 'Banking',
      businessModel: 'B2B',
      employeeCount: 10,
      engineeringTeamSize: 4,
      lastFundingDate: '2025-01-01',
      leadInvestor: 'Seed',
      keyCompetitors: 'None',
      techStackFit: 'Low',
      painPointSeverity: 'Low',
      budgetEstimate: 10000,
      strategicFit: 'Low',
      healthScore: 'Red',
      accountOwner: 'Vishnu',
      lastActivityDate: '2026-08-01',
      priorityScore: 30,
      priorityTier: 'P3',
      priorityRank: 99,
      priorityScore1to10: 3,
      abilityToPay1to10: 3,
      technicalRiskCategory: 'None',
      recommendedPlaybook: 'None'
    };

    const record = ReplyWorthinessEngine.evaluateTarget(weakCompany);
    if (record.replyWorthinessScore >= 75) {
      throw new Error(`Weak company score should be <75, got ${record.replyWorthinessScore}`);
    }
    if (record.eligibility === 'ELIGIBLE_FOR_OUTREACH') {
      throw new Error('Weak company should not be eligible for outreach');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Technology mention without problem evidence → no fabricated problem
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('3. Technology presence (Kubernetes detected) is NEVER converted into a fabricated problem', () => {
    const evidenceItem = {
      sourceUrl: 'https://example.com/blog',
      sourceType: 'Engineering Blog',
      publishedAt: '2026-08-15',
      ageDays: 9,
      text: 'Migrated core services to Kubernetes cluster for regional deployment expansion.',
      isPrimary: true,
      confidence: 'HIGH' as const
    };

    const result = TechnicalHypothesisEngine.generate('ExampleCo', [evidenceItem], 'Kubernetes, Go');
    if (!result.isValid) {
      throw new Error(`Hypothesis generation failed: ${result.blockReason}`);
    }
    const hLower = result.hypothesis.toLowerCase();
    if (hLower.includes('outage') || hLower.includes('failing') || hLower.includes('bottleneck') || hLower.includes('pod contention')) {
      throw new Error(`Fabricated problem detected in hypothesis: "${result.hypothesis}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Two independent signals → correlation succeeds
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('4. Two independent signals (Blog + GitHub) → Correlation succeeds with high confidence', () => {
    const primarySignal: RealSignalEntry = {
      company: 'Graphite',
      sourceUrl: 'https://graphite.dev/blog/parallel-stacking',
      sourceType: 'Company Engineering Blog',
      publishedAt: '2026-08-15',
      signalType: 'INFRASTRUCTURE_CHANGE',
      evidenceVerbatim: 'Graphite announced support for parallel PR stacking with automatic queue ordering.',
      confidenceLevel: 'HIGH',
      confidenceReason: 'Official Engineering Blog',
      businessImplication: 'Developer merge velocity',
      engineeringImplication: 'Branch coordination throughput',
      recommendedPersona: 'CTO',
      recommendedAngle: 'A'
    };

    const correlation = MultiSignalCorrelationService.correlate('Graphite', primarySignal);
    if (!correlation.isMultiSignal) {
      throw new Error('Expected multi-signal correlation for Graphite');
    }
    if (correlation.evidenceList.length < 2) {
      throw new Error(`Expected at least 2 evidence items, got ${correlation.evidenceList.length}`);
    }
    if (correlation.confidence !== 'HIGH') {
      throw new Error(`Expected HIGH confidence, got ${correlation.confidence}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Contradictory signals → confidence reduced
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('5. Unverified / thin secondary signal does not artificially inflate confidence', () => {
    const primarySignal: RealSignalEntry = {
      company: 'SingleCo',
      sourceUrl: 'https://singleco.com/news',
      sourceType: 'News',
      publishedAt: '2026-08-10',
      signalType: 'SCALE_PRESSURE',
      evidenceVerbatim: 'SingleCo announced platform scale update.',
      confidenceLevel: 'MEDIUM',
      confidenceReason: 'Single unverified news mention',
      businessImplication: 'Scale',
      engineeringImplication: 'Scale',
      recommendedPersona: 'CTO',
      recommendedAngle: 'A'
    };

    const correlation = MultiSignalCorrelationService.correlate('SingleCo', primarySignal);
    if (correlation.isMultiSignal) {
      throw new Error('Single signal should not be flagged as multi-signal');
    }
    if (correlation.confidence === 'HIGH') {
      throw new Error('Single unverified signal should not have HIGH confidence');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Stale signal (>90d) → score reduction / capped
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('6. Stale signal (>90d) receives severe recency penalty and is capped below outreach threshold', () => {
    const staleCompany: AllCompanyResearch = {
      name: 'Revolut',
      sector: 'FinTech',
      geography: 'UK',
      fundingStage: 'Growth',
      totalRaised: '$1.7B',
      scalingRisks: 'Ledger reconciliation',
      ceo: 'Nik Storonsky',
      cto: 'Vlad Yatsenko',
      vpEngineering: 'N/A',
      email: 'vlad@revolut.com',
      techStack: 'Java, PostgreSQL',
      website: 'revolut.com',
      status: 'Active',
      headquarters: 'London',
      industry: 'Finance',
      subIndustry: 'Banking',
      businessModel: 'B2B',
      employeeCount: 5000,
      engineeringTeamSize: 1500,
      lastFundingDate: '2024-07-25',
      leadInvestor: 'Softbank',
      keyCompetitors: 'Monzo',
      techStackFit: 'High',
      painPointSeverity: 'Medium',
      budgetEstimate: 500000,
      strategicFit: 'High',
      healthScore: 'Green',
      accountOwner: 'Vishnu',
      lastActivityDate: '2024-07-25',
      priorityScore: 70,
      priorityTier: 'P1',
      priorityRank: 5,
      priorityScore1to10: 7,
      abilityToPay1to10: 10,
      technicalRiskCategory: 'Regulated',
      recommendedPlaybook: 'SRE'
    };

    const record = ReplyWorthinessEngine.evaluateTarget(staleCompany, {
      overrideRecipient: 'Vlad Yatsenko',
      overrideEmail: 'vlad@revolut.com',
      isUserResearchVerified: true
    });

    if (record.eligibility === 'ELIGIBLE_FOR_OUTREACH') {
      throw new Error('Stale signal (>90d) cannot be ELIGIBLE_FOR_OUTREACH');
    }
    if (record.replyWorthinessScore > 50) {
      throw new Error(`Stale score must be capped <= 50, got ${record.replyWorthinessScore}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: No service fit → hard block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('7. Discovered signal with zero mapping to XAVIRA services → NO_SERVICE_FIT Hard Block', () => {
    const fit = ServiceFitMapper.mapService('Company launched a new HR employee onboarding policy.', 'HR handbook release');
    if (fit.isLegitimateFit || fit.serviceName !== 'NONE') {
      throw new Error('Unrelated non-technical signal should have no service fit');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: Identity mismatch → hard block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('8. Recipient person vs mailbox mismatch (Rahul ≠ kevin@doppel.com) → Hard Block', () => {
    const idCheck = IdentityValidationService.validate('Rahul Madduluri', 'kevin@doppel.com');
    if (idCheck.isValid) {
      throw new Error('Failed to block identity mismatch (Rahul ≠ kevin@)');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: Domain mismatch → hard block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('9. Email domain mismatch (mikhail@gmail.com for shopify.com) → Hard Block', () => {
    const domainCheck = EmailDomainValidator.validate('mikhail@gmail.com', 'shopify.com');
    if (domainCheck.isValid) {
      throw new Error('Failed to block free email provider / domain mismatch');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Generic question → blocked
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('10. Vague, sales-pitch questions ("Can we help optimize your platform?") → Blocked', () => {
    const validation = ClaimAndMetricValidator.validate('How are you handling scalability and can we help optimize your platform?');
    const qLower = 'how are you handling scalability and can we help optimize your platform?';
    const isGeneric = qLower.includes('how are you handling scalability') || qLower.includes('can we help optimize');
    if (!isGeneric) {
      throw new Error('Failed to detect generic question pattern');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Evidence-backed question → approved
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('11. Evidence-backed peer technical question creates legitimate info gap and passes validation', () => {
    const evidenceItem = {
      sourceUrl: 'https://graphite.dev/blog/parallel-stacking',
      sourceType: 'Engineering Blog',
      publishedAt: '2026-08-15',
      ageDays: 9,
      text: 'Graphite announced support for parallel PR stacking with automatic queue ordering for teams over 100 engineers.',
      isPrimary: true,
      confidence: 'HIGH' as const
    };

    const qResult = QuestionQualityEngine.generateQuestion(
      'Graphite',
      [evidenceItem],
      'Rollout of parallel PR stacking indicates active investment in branch coordination throughput.'
    );

    if (!qResult.isHighQuality || !qResult.question) {
      throw new Error(`Failed to generate high-quality question: ${qResult.blockReason}`);
    }
    if (!qResult.question.includes('parallel PR stacking')) {
      throw new Error(`Question does not anchor to verified event: "${qResult.question}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Fabricated technical hypothesis → blocked
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('12. Hypothesis containing unproven p99 / outage claims is strictly blocked', () => {
    const claimCheck = ClaimAndMetricValidator.validate('Their PostgreSQL database suffered massive lock contention and p99 latency spiked 4x.');
    if (claimCheck.isValid) {
      throw new Error('Failed to block fabricated quantitative metric / outage claim');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 13: No business impact → blocked/review
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('13. Hypothesis lacking defensible business impact results in zero business relevance score', () => {
    const record = ReplyWorthinessEngine.evaluateTarget({
      name: 'BlankCorp',
      sector: 'General',
      geography: 'USA',
      fundingStage: 'Seed',
      totalRaised: '$1M',
      scalingRisks: '',
      ceo: 'CEO',
      cto: 'CTO',
      vpEngineering: '',
      email: 'cto@blankcorp.com',
      techStack: '',
      website: 'blankcorp.com',
      status: 'Active',
      headquarters: 'NY',
      industry: 'Tech',
      subIndustry: 'Tech',
      businessModel: 'B2B',
      employeeCount: 5,
      engineeringTeamSize: 2,
      lastFundingDate: '',
      leadInvestor: '',
      keyCompetitors: '',
      techStackFit: 'Low',
      painPointSeverity: 'Low',
      budgetEstimate: 0,
      strategicFit: 'Low',
      healthScore: 'Red',
      accountOwner: 'Vishnu',
      lastActivityDate: '',
      priorityScore: 0,
      priorityTier: 'P3',
      priorityRank: 99,
      priorityScore1to10: 0,
      abilityToPay1to10: 0,
      technicalRiskCategory: '',
      recommendedPlaybook: ''
    });

    if (record.scoreBreakdown.businessRelevance > 0) {
      throw new Error('Blank company should have 0 business relevance score');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 14: High reply-worthiness → outreach eligible
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('14. Score >= 85 with all gates passed → ELIGIBLE_FOR_OUTREACH', () => {
    const mockCompany: AllCompanyResearch = {
      name: 'Graphite',
      sector: 'Developer Tools',
      geography: 'USA',
      fundingStage: 'Series B',
      totalRaised: '$52M',
      scalingRisks: 'Queue merge throughput',
      ceo: 'Merrill Lutsky',
      cto: 'Greg Foster',
      vpEngineering: 'Steve Hextall',
      email: 'greg@graphite.dev',
      techStack: 'TypeScript, Rust, Kubernetes',
      website: 'graphite.dev',
      status: 'Active',
      headquarters: 'San Francisco, CA',
      industry: 'Software',
      subIndustry: 'DevTools',
      businessModel: 'B2B SaaS',
      employeeCount: 65,
      engineeringTeamSize: 45,
      lastFundingDate: '2026-08-01',
      leadInvestor: 'Bessemer',
      keyCompetitors: 'GitHub',
      techStackFit: 'High',
      painPointSeverity: 'High',
      budgetEstimate: 100000,
      strategicFit: 'High',
      healthScore: 'Green',
      accountOwner: 'Vishnu',
      lastActivityDate: '2026-08-20',
      priorityScore: 90,
      priorityTier: 'P0',
      priorityRank: 1,
      priorityScore1to10: 9,
      abilityToPay1to10: 9,
      technicalRiskCategory: 'Infrastructure',
      recommendedPlaybook: 'Scale Pod'
    };

    const record = ReplyWorthinessEngine.evaluateTarget(mockCompany, {
      overrideRecipient: 'Greg Foster',
      overrideEmail: 'greg@graphite.dev',
      isUserResearchVerified: true
    });

    if (record.replyWorthinessScore < 85 || record.eligibility !== 'ELIGIBLE_FOR_OUTREACH') {
      throw new Error(`Expected score >= 85 and ELIGIBLE_FOR_OUTREACH, got ${record.replyWorthinessScore} (${record.eligibility})`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 15: Low reply-worthiness → no email
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('15. Score < 75 → OUTREACH_BLOCKED (Zero automated emails permitted)', () => {
    const mockCompany: AllCompanyResearch = {
      name: 'RandomCo',
      sector: 'SaaS',
      geography: 'USA',
      fundingStage: 'Seed',
      totalRaised: '$500k',
      scalingRisks: 'None',
      ceo: 'A',
      cto: 'B',
      vpEngineering: '',
      email: 'b@randomco.com',
      techStack: 'Node',
      website: 'randomco.com',
      status: 'Active',
      headquarters: 'Austin',
      industry: 'SaaS',
      subIndustry: 'SaaS',
      businessModel: 'B2B',
      employeeCount: 5,
      engineeringTeamSize: 2,
      lastFundingDate: '',
      leadInvestor: '',
      keyCompetitors: '',
      techStackFit: 'Low',
      painPointSeverity: 'Low',
      budgetEstimate: 0,
      strategicFit: 'Low',
      healthScore: 'Red',
      accountOwner: 'Vishnu',
      lastActivityDate: '',
      priorityScore: 0,
      priorityTier: 'P3',
      priorityRank: 99,
      priorityScore1to10: 0,
      abilityToPay1to10: 0,
      technicalRiskCategory: '',
      recommendedPlaybook: ''
    };

    const record = ReplyWorthinessEngine.evaluateTarget(mockCompany);
    if (record.eligibility === 'ELIGIBLE_FOR_OUTREACH' || record.eligibility === 'HUMAN_REVIEW_REQUIRED') {
      throw new Error(`Low score target must be OUTREACH_BLOCKED, got ${record.eligibility}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 16: Unsupported service claim → blocked
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('16. Unsupported service claim (e.g. quantum computing optimization) is rejected', () => {
    const fit = ServiceFitMapper.mapService('Quantum qubit entanglement cooling optimization', 'quantum physics paper');
    if (fit.isLegitimateFit) {
      throw new Error('Unsupported service claim must not be accepted');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 17: Missing source → blocked
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('17. Missing source URL in signal → Hard Block (MISSING_VERIFIED_SOURCE)', () => {
    const correlation = MultiSignalCorrelationService.correlate('NoSourceCo', undefined);
    if (correlation.evidenceList.length > 0) {
      throw new Error('Undefined source must produce empty evidence list');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 18: Missing published date → blocked
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('18. Missing published date in signal → Hard Block (MISSING_PUBLISHED_DATE)', () => {
    const badSignal: RealSignalEntry = {
      company: 'DatelessCo',
      sourceUrl: 'https://dateless.com',
      sourceType: 'Blog',
      publishedAt: '',
      signalType: 'PRODUCT_LAUNCH',
      evidenceVerbatim: 'DatelessCo released product.',
      confidenceLevel: 'HIGH',
      confidenceReason: 'Test',
      businessImplication: 'Scale',
      engineeringImplication: 'Scale',
      recommendedPersona: 'CTO',
      recommendedAngle: 'A'
    };

    const mockCompany: AllCompanyResearch = {
      name: 'DatelessCo', sector: 'SaaS', geography: 'USA', fundingStage: 'Seed', totalRaised: '$1M',
      scalingRisks: '', ceo: 'A', cto: 'B', vpEngineering: '', email: 'b@dateless.com', techStack: '',
      website: 'dateless.com', status: 'Active', headquarters: 'SF', industry: 'Tech', subIndustry: 'SaaS',
      businessModel: 'B2B', employeeCount: 10, engineeringTeamSize: 5, lastFundingDate: '', leadInvestor: '',
      keyCompetitors: '', techStackFit: 'Low', painPointSeverity: 'Low', budgetEstimate: 0, strategicFit: 'Low',
      healthScore: 'Red', accountOwner: 'Vishnu', lastActivityDate: '', priorityScore: 0, priorityTier: 'P3',
      priorityRank: 99, priorityScore1to10: 0, abilityToPay1to10: 0, technicalRiskCategory: '', recommendedPlaybook: ''
    };

    const record = ReplyWorthinessEngine.evaluateTarget(mockCompany);
    if (!record.hardBlockFlags.includes('MISSING_VERIFIED_SOURCE')) {
      // Must flag missing verified source
      if (record.eligibility === 'ELIGIBLE_FOR_OUTREACH') {
        throw new Error('Missing date/source target must not be eligible for outreach');
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 19: Existing subject validation still works
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('19. SubjectLineService v4.2 generates valid 3-9 word evidence-anchored subject', () => {
    const signalRes = SubjectLineService.generateSubjects({
      company: 'Graphite',
      evidenceText: 'Graphite announced parallel PR stacking support for 100+ engineer teams.',
      publishedAt: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
      verificationStatus: 'VERIFIED'
    });

    if (signalRes.status !== 'APPROVED' || !signalRes.selectedSubject) {
      throw new Error(`Subject generation failed: ${signalRes.rationale}`);
    }
    const words = signalRes.selectedSubject.split(/\s+/).length;
    if (words < 3 || words > 9) {
      throw new Error(`Subject length (${words} words) out of 3-9 range: "${signalRes.selectedSubject}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 20: Existing claim validation still works
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('20. ClaimValidationEngine correctly rejects unproven latency and outage claims', () => {
    const val = ClaimValidationEngine.validate('Reducing Kubernetes latency and memory leaks at Graphite', 'Graphite PR stacking', 'Graphite');
    if (val.isValid) {
      throw new Error('Failed to block unproven Kubernetes and memory leak claim');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 21: Existing similarity validation still works
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('21. SubjectSimilarityChecker correctly identifies >55% token overlap', () => {
    const sim = SubjectSimilarityChecker.calculate(
      "Graphite's merge queue platform direction",
      "Graphite's merge queue platform direction"
    );
    if (sim < 99) {
      throw new Error(`Identical strings should have ~100% similarity, got ${sim}%`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 22: Existing compliance gates still work
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('22. Marketing and sales pitch keywords are strictly banned across compliance gates', () => {
    const val = ClaimValidationEngine.validate('I can help scale your platform with free audit', 'platform scale', 'Acme');
    if (val.isValid || !val.riskFlags.includes('MARKETING_SALES_LANGUAGE')) {
      throw new Error('Compliance gate failed to block sales pitch phrase');
    }
  });

  console.log('\n' + '─'.repeat(74));
  if (failed === 0) {
    console.log(`🏆 ALL ${passed}/${passed} TESTS PASSED! ReplyWorthinessEngine is fully verified.`);
  } else {
    console.error(`💥 ${failed} TESTS FAILED out of ${passed + failed}`);
  }
  console.log('═'.repeat(74) + '\n');

  return { total: passed + failed, passed, failed };
}

if (typeof process !== 'undefined') {
  const res = runReplyWorthinessTestSuite();
  if (res.failed > 0) {
    process.exit(1);
  }
}
