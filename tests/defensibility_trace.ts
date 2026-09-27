import { IntelligenceEngine } from '../src/server/IntelligenceEngine.js';
import { Evidence, PublicObservationProvider, ObservationResult } from '../src/server/IntelligenceCase.js';

class CompanyMockProvider implements PublicObservationProvider {
  private data: Record<string, Evidence[]>;
  constructor(data: Record<string, Evidence[]>) {
    this.data = data;
  }
  async observePublicSurface(url: string): Promise<ObservationResult> {
    const domain = new URL(url).hostname;
    const evidence = this.data[domain] || [];
    return { evidence, discovery_errors: 0 };
  }
}

async function traceCompany(name: string, url: string, evidence: Evidence[]) {
  console.log(`\n=== DEFENSIBILITY TRACE: ${name} ===`);
  const provider = new CompanyMockProvider({ [new URL(url).hostname]: evidence });
  const result = await IntelligenceEngine.run(
    name, url, 'Owner Name', 'CTO', 'Owner is verified', [], 'PRODUCTION', undefined, provider
  );

  console.log(`1. Evidence IDs: ${result.evidence.map(e => e.id).join(', ')}`);
  console.log(`2. Qualified Signal IDs: ${result.signals?.map(s => s.signal_id).join(', ') || 'NONE'}`);
  console.log(`3. Correlation Groups: ${result.correlated_groups?.map(g => g.theme).join(', ') || 'NONE'}`);
  console.log(`4. Opportunity: ${result.opportunity_classification}`);
  console.log(`5. Decision: ${result.prospect_decision}`);
}

async function main() {
  const companies = [
    { 
      name: 'Supabase', url: 'https://supabase.com', 
      evidence: [
        { id: 'ev_s1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://supabase.com/api', source_type: 'API_REFERENCE', strength: 'HIGH', status: 200, observed_behavior: 'Exposes internal storage_path in metadata via REST API endpoint', sensitive_fields: ['storage_path'], reproductions: 3, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_s2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://supabase.com/blog', source_type: 'ENGINEERING_ARTICLE', strength: 'MEDIUM', observed_behavior: 'We migrated to a sharded Postgres cluster for scalability', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
  ];
  for (const co of companies) {
    await traceCompany(co.name, co.url, co.evidence);
  }
}
main().catch(console.error);
