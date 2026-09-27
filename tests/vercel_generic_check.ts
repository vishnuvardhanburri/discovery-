import { DeepSignalExtractor } from '../src/server/DeepSignalExtractor.js';
import { Evidence } from '../src/server/IntelligenceCase.js';

const evidence = [
  { 
    id: 'ev_v2', 
    evidence_origin: 'REAL_PUBLIC_OBSERVATION', 
    public_url: 'https://vercel.com/status', 
    source_type: 'STATUS_PAGE', 
    strength: 'MEDIUM', 
    status: 200, 
    observed_behavior: 'All systems operational', 
    reproductions: 1, 
    repeatable: true, 
    tested_without_auth: true, 
    not_tested: [], 
    retrieved_at: new Date().toISOString(), 
    evidence_text: '', 
    owner_source_link: 'verified' 
  }
];

const observations = [
  { url: 'https://vercel.com/status', type: 'STATUS_PAGE', raw_text: 'All systems operational', category: 'status_ops' }
];

console.log('Testing Vercel Generic Signal Qualification...');
const signals = DeepSignalExtractor.extract(observations, evidence);
console.log(`Qualified Signals: ${signals.length}`);
if (signals.length > 0) {
  console.log(`Signal 0: ${JSON.stringify(signals[0], null, 2)}`);
}

if (signals.length > 0) {
  console.log('FAILED: "All systems operational" should not be a qualified technical signal.');
  process.exit(1);
} else {
  console.log('PASSED: Generic status behavior rejected.');
  process.exit(0);
}
