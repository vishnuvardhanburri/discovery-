/**
 * XAVIRA SUBJECT LINE SERVICE v4.2 — 12 DETERMINISTIC TEST VERIFICATION SUITE
 *
 * ALL 12 TESTS MUST PASS:
 * 1. Strong recent signal → specific subject
 * 2. Weak signal → generic-safe subject or block
 * 3. Unsupported technical term → block
 * 4. Fabricated problem → block
 * 5. Same subject structure → regenerate
 * 6. Same reasoning structure with different words → regenerate
 * 7. Follow-up continuity
 * 8. No verified signal → block
 * 9. 3–9 word enforcement
 * 10. Sales language → block
 * 11. Recent signal outranks old signal
 * 12. Subject must be traceable to evidence
 */

import {
  SubjectLineService,
  ClaimValidationEngine,
  SubjectSimilarityChecker,
  SubjectScoringModel,
  SubjectIntelligenceLayer,
  SubjectStrategy,
  VerifiedSignalInput
} from './subjectLineService';
import { SubjectIntelligenceEngine } from './subjectIntelligenceEngine';

export function runSubjectLineTestSuite(): { total: number; passed: number; failed: number } {
  console.log('\n' + '═'.repeat(74));
  console.log('   XAVIRA SUBJECT LINE SERVICE v4.2 — DETERMINISTIC VERIFICATION SUITE');
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
  // TEST 1: Strong Recent Signal → Specific Subject
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('1. Strong recent signal → specific evidence-anchored subject (Score >= 75)', () => {
    const signal: VerifiedSignalInput = {
      company: 'Patronus AI',
      signalType: 'FUNDING_GROWTH',
      evidenceText: 'Patronus AI raised $50 million Series B for automated evaluation infrastructure for LLMs.',
      sourceUrl: 'https://techcrunch.com/patronus-ai-series-b',
      publishedAt: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0], // 5 days old
      verificationStatus: 'VERIFIED',
      persona: 'CTO'
    };

    const result = SubjectLineService.generateSubjects(signal);
    if (result.status !== 'APPROVED') {
      throw new Error(`Expected APPROVED status, got ${result.status} (${result.code})`);
    }
    if (!result.selectedSubject || result.selectedSubject.trim().length === 0) {
      throw new Error('Selected subject is empty');
    }

    const sLower = result.selectedSubject.toLowerCase();
    const isSpecific = sLower.includes('patronus') || sLower.includes('series b') || sLower.includes('eval');
    if (!isSpecific) {
      throw new Error(`Subject is not anchored to verified signal: "${result.selectedSubject}"`);
    }
    if ((result.selectedCandidate?.score ?? 0) < 75) {
      throw new Error(`Expected high score (>=75) for strong recent signal, got ${result.selectedCandidate?.score}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 2: Weak Signal → Generic-Safe Subject or Block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('2. Weak or unverified signal is blocked or constrained to minimal safe anchor', () => {
    const weakSignal: VerifiedSignalInput = {
      company: 'UnknownCorp',
      evidenceText: 'General internet company',
      verificationStatus: 'UNVERIFIED'
    };

    const result = SubjectLineService.generateSubjects(weakSignal);
    if (result.status !== 'BLOCKED' || result.code !== 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL') {
      throw new Error(`Expected SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL for weak unverified signal, got ${result.code}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 3: Unsupported Technical Term → Block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('3. Unsupported technical terms (Kafka, Redis, GPU) absent in evidence → Blocked', () => {
    const evidence = 'Patronus AI announced Series B funding to scale its team.';
    
    // Subject mentions Kafka & Kubernetes (absent from evidence)
    const unsupportedSubject = 'Kafka stream orchestration at Patronus AI';
    const val = ClaimValidationEngine.validate(unsupportedSubject, evidence, 'Patronus AI');
    
    if (val.isValid) {
      throw new Error(`Failed to block unsupported technology term in: "${unsupportedSubject}"`);
    }
    if (!val.riskFlags.includes('UNSUPPORTED_TECHNOLOGY_MENTION')) {
      throw new Error(`Expected UNSUPPORTED_TECHNOLOGY_MENTION flag, got: ${val.riskFlags.join(', ')}`);
    }
    if (val.riskLevel !== 'HIGH' && val.riskLevel !== 'CRITICAL') {
      throw new Error(`Expected HIGH or CRITICAL risk level, got ${val.riskLevel}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 4: Fabricated Problem → Block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('4. Fabricated technical problems (outages, queue latency, lock contention) → Blocked', () => {
    const evidence = 'Graphite released parallel PR merge queue platform.';
    
    const badSubject = 'Python queue architecture under bursty workloads at Graphite';
    const val = ClaimValidationEngine.validate(badSubject, evidence, 'Graphite');
    
    if (val.isValid) {
      throw new Error(`Failed to block fabricated problem claim: "${badSubject}"`);
    }
    if (!val.riskFlags.includes('FABRICATED_TECHNICAL_CLAIM') && !val.riskFlags.includes('UNSUPPORTED_TECHNOLOGY_MENTION')) {
      throw new Error(`Expected FABRICATED_TECHNICAL_CLAIM risk flag, got: ${val.riskFlags.join(', ')}`);
    }
    if (val.riskLevel !== 'CRITICAL') {
      throw new Error(`Expected CRITICAL risk level for fabricated problems, got ${val.riskLevel}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 5: Same Subject Structure → Regenerate
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('5. Identical prior subject structure triggers automatic regeneration', () => {
    const signal: VerifiedSignalInput = {
      company: 'Patronus AI',
      evidenceText: 'Patronus AI raised $50 million Series B for LLM evaluation platform.',
      publishedAt: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      verificationStatus: 'VERIFIED'
    };

    const previousHistory = ["Patronus AI's next scaling phase"];
    const result = SubjectLineService.generateSubjects(signal, previousHistory);

    if (result.selectedSubject === previousHistory[0]) {
      throw new Error(`Failed to regenerate away from identical previous subject: "${result.selectedSubject}"`);
    }
    const sim = SubjectSimilarityChecker.calculate(result.selectedSubject, previousHistory[0]);
    if (sim > 55) {
      throw new Error(`Regenerated subject still has ${sim.toFixed(1)}% similarity (>55%): "${result.selectedSubject}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 6: Same Reasoning Structure with Different Words → Regenerate (>55% similarity)
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('6. High semantic token similarity (>55%) across different words triggers regeneration', () => {
    const signal: VerifiedSignalInput = {
      company: 'Patronus AI',
      evidenceText: 'Patronus AI raised $50 million Series B for LLM evaluation platform.',
      publishedAt: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      verificationStatus: 'VERIFIED'
    };

    const previousHistory = ["A question on Patronus AI's scaling phase"];
    const result = SubjectLineService.generateSubjects(signal, previousHistory);

    const maxSim = SubjectSimilarityChecker.maxSimilarity(result.selectedSubject, previousHistory);
    if (maxSim > 55) {
      throw new Error(`Regenerated subject exceeds 55% similarity threshold (${maxSim.toFixed(1)}%): "${result.selectedSubject}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 7: Follow-up Continuity
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('7. Contextual follow-up strategy preserves thread continuity', () => {
    const signal: VerifiedSignalInput = {
      company: 'Graphite',
      evidenceText: 'Graphite raised $72M Series B for developer workflow tools.',
      publishedAt: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0],
      verificationStatus: 'VERIFIED'
    };

    const result = SubjectLineService.generateSubjects(signal, [], true); // isFollowUp = true
    if (result.status !== 'APPROVED') {
      throw new Error(`Expected APPROVED status for follow-up, got ${result.status}`);
    }

    const s = result.selectedSubject;
    const isContinuity = s.startsWith('Following up') || s.startsWith('Quick follow-up') || s.startsWith('Re:');
    if (!isContinuity) {
      throw new Error(`Follow-up subject does not maintain continuity: "${s}"`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 8: No Verified Signal → Hard Block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('8. Missing or null signal returns SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL', () => {
    const nullRes = SubjectLineService.generateSubjects(null);
    if (nullRes.status !== 'BLOCKED' || nullRes.code !== 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL') {
      throw new Error(`Expected SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL for null input, got ${nullRes.code}`);
    }

    const emptyRes = SubjectLineService.generateSubjects({ company: 'Acme', evidenceText: '', verificationStatus: 'UNVERIFIED' });
    if (emptyRes.status !== 'BLOCKED' || emptyRes.code !== 'SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL') {
      throw new Error(`Expected SUBJECT_BLOCKED_NO_VERIFIED_SIGNAL for empty input, got ${emptyRes.code}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 9: 3–9 Word Count Enforcement
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('9. Strict 3–9 word count limits enforced on all candidates', () => {
    // 9a: Too long (>9 words)
    const longSub = 'A deeply technical and comprehensive question regarding how your engineering team manages architecture and scale';
    const valLong = ClaimValidationEngine.validate(longSub, 'scale and architecture', 'Acme');
    if (valLong.isValid) {
      throw new Error('Failed to reject subject >9 words');
    }
    if (!valLong.riskFlags.some(f => f.includes('SUBJECT_TOO_LONG'))) {
      throw new Error('Expected SUBJECT_TOO_LONG risk flag');
    }

    // 9b: Too short (<3 words)
    const shortSub = 'Scaling';
    const valShort = ClaimValidationEngine.validate(shortSub, 'scale and architecture', 'Acme');
    if (valShort.isValid) {
      throw new Error('Failed to reject subject <3 words');
    }
    if (!valShort.riskFlags.some(f => f.includes('SUBJECT_TOO_SHORT'))) {
      throw new Error('Expected SUBJECT_TOO_SHORT risk flag');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 10: Sales Language → Block
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('10. Generic sales, pitch, and marketing language strictly blocked', () => {
    const salesSubjects = [
      'I can help transform your business and boost engineering ROI',
      'Our solutions scale your platform for Series B growth',
      'Book a call for free audit of your architecture',
      'Special partnership opportunity with XAVIRA'
    ];

    for (const sub of salesSubjects) {
      const val = ClaimValidationEngine.validate(sub, 'Series B growth', 'Acme');
      if (val.isValid) {
        throw new Error(`Failed to reject sales subject: "${sub}"`);
      }
      if (!val.riskFlags.includes('MARKETING_SALES_LANGUAGE')) {
        throw new Error(`Expected MARKETING_SALES_LANGUAGE flag for: "${sub}"`);
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 11: Recent Signal Outranks Old Signal
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('11. Recent signal (<=14d) achieves higher score than stale signal (>90d)', () => {
    const recentSignal: VerifiedSignalInput = {
      company: 'Graphite',
      evidenceText: 'Graphite announced $72M Series B funding for developer workflow tools.',
      publishedAt: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0], // 7 days old
      verificationStatus: 'VERIFIED'
    };

    const staleSignal: VerifiedSignalInput = {
      company: 'Graphite',
      evidenceText: 'Graphite announced $72M Series B funding for developer workflow tools.',
      publishedAt: '2023-01-15', // Stale >90 days
      verificationStatus: 'VERIFIED'
    };

    const recentRes = SubjectLineService.generateSubjects(recentSignal);
    const staleRes = SubjectLineService.generateSubjects(staleSignal);

    const recentScore = recentRes.selectedCandidate?.score ?? 0;
    const staleScore = staleRes.selectedCandidate?.score ?? 0;

    if (recentScore <= staleScore) {
      throw new Error(`Recent score (${recentScore}) did not outrank stale score (${staleScore})`);
    }
    if (staleRes.status !== 'BLOCKED' && staleRes.selectedCandidate?.approval_status !== 'BLOCKED') {
      throw new Error('Stale signal (>90d) was not blocked');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TEST 12: Subject Must Be Traceable to Evidence
  // ───────────────────────────────────────────────────────────────────────────
  assertTest('12. Subject technical anchors are directly traceable to verified evidence text', () => {
    const signal: VerifiedSignalInput = {
      company: 'Patronus AI',
      evidenceText: 'Patronus AI raised $50 million Series B for automated evaluation infrastructure for LLMs.',
      publishedAt: new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0],
      verificationStatus: 'VERIFIED'
    };

    const result = SubjectLineService.generateSubjects(signal);
    const techCandidate = result.strategyCandidates['TECHNICAL_DIRECTION'];
    if (!techCandidate) {
      throw new Error('TECHNICAL_DIRECTION candidate missing');
    }

    // Must anchor to evaluation stack (present in evidence)
    if (!techCandidate.subject.toLowerCase().includes('evaluation') && !techCandidate.subject.toLowerCase().includes('patronus')) {
      throw new Error(`Technical direction subject "${techCandidate.subject}" is not traceable to evidence`);
    }
    if (techCandidate.claim_risk !== 'LOW') {
      throw new Error(`Expected LOW claim risk for verified tech anchor, got ${techCandidate.claim_risk}`);
    }
  });

  console.log('\n' + '─'.repeat(74));
  if (failed === 0) {
    console.log(`🏆 ALL ${passed}/${passed} TESTS PASSED! SubjectLineService v4.2 is fully verified.`);
  } else {
    console.error(`💥 ${failed} TESTS FAILED out of ${passed + failed}`);
  }
  console.log('═'.repeat(74) + '\n');

  return { total: passed + failed, passed, failed };
}

if (typeof process !== 'undefined') {
  const res = runSubjectLineTestSuite();
  if (res.failed > 0) {
    process.exit(1);
  }
}
