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

async function validateCompany(name: string, url: string, evidence: Evidence[]) {
  console.log(`\n=== Validating ${name} (${url}) ===`);
  
  const provider = new CompanyMockProvider({ [new URL(url).hostname]: evidence });
  const result = await IntelligenceEngine.run(
    name, url, 'Owner Name', 'CTO', 'Owner is verified', [], 'PRODUCTION', undefined, provider
  );

  console.log(`Decision: ${result.prospect_decision}`);
  console.log(`Finding: ${result.finding_classification?.finding_type || 'NONE'}`);
  console.log(`Signals Count: ${result.signals?.length || 0}`);
  console.log(`Correlations Count: ${result.correlated_groups?.length || 0}`);
  console.log(`Opportunity: ${result.opportunity_classification}`);
  
  if (result.signals) {
    console.log('\n--- Signals ---');
    result.signals.forEach(s => {
      console.log(`ID: ${s.signal_id} | Type: ${s.type} | Prov: ${s.provenance} | URL: ${s.source_url}`);
    });
  }

  if (result.correlated_groups) {
    console.log('\n--- Correlations ---');
    result.correlated_groups.forEach(g => {
      console.log(`Theme: ${g.theme} | Strength: ${g.strength} | Explanation: ${g.explanation}`);
    });
  }
}

async function main() {
  const companies = [
    { 
      name: 'Vercel', url: 'https://vercel.com', 
      evidence: [
        { id: 'ev_v1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://vercel.com/api', source_type: 'API_REFERENCE', strength: 'MEDIUM', status: 200, observed_behavior: 'HTTP 200 observed', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_v2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://vercel.com/status', source_type: 'STATUS_PAGE', strength: 'MEDIUM', status: 200, observed_behavior: 'All systems operational', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
    { 
      name: 'Supabase', url: 'https://supabase.com', 
      evidence: [
        { id: 'ev_s1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://supabase.com/api', source_type: 'API_REFERENCE', strength: 'HIGH', status: 200, observed_behavior: 'Exposes internal storage_path in metadata via REST API endpoint', sensitive_fields: ['storage_path'], reproductions: 3, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_s2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://supabase.com/blog', source_type: 'ENGINEERING_ARTICLE', strength: 'MEDIUM', observed_behavior: 'We migrated to a sharded Postgres cluster for scalability', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
    { 
      name: 'Stripe', url: 'https://stripe.com', 
      evidence: [
        { id: 'ev_st1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://stripe.com/api', source_type: 'API_REFERENCE', strength: 'HIGH', status: 200, observed_behavior: 'Exposes internal trace_id in headers via REST API endpoint', sensitive_fields: ['trace_id'], reproductions: 3, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_st2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://stripe.com/eng', source_type: 'ENGINEERING_ARTICLE', strength: 'MEDIUM', observed_behavior: 'Handling millions of requests per second via distributed system', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
    { 
      name: 'Shopify', url: 'https://shopify.com', 
      evidence: [
        { id: 'ev_sh1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://shopify.com/api', source_type: 'API_REFERENCE', strength: 'HIGH', status: 200, observed_behavior: 'Exposes internal cluster_id in payload via REST API endpoint', sensitive_fields: ['cluster_id'], reproductions: 3, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_sh2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://shopify.com/eng', source_type: 'ENGINEERING_ARTICLE', strength: 'MEDIUM', observed_behavior: 'Migrated to a distributed event-driven architecture for scale', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
    { 
      name: 'GitLab', url: 'https://gitlab.com', 
      evidence: [
        { id: 'ev_gl1', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://gitlab.com/api', source_type: 'API_REFERENCE', strength: 'HIGH', status: 200, observed_behavior: 'Exposes internal node_id in response via REST API endpoint', sensitive_fields: ['node_id'], reproductions: 3, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' },
        { id: 'ev_gl2', evidence_origin: 'REAL_PUBLIC_OBSERVATION', public_url: 'https://gitlab.com/eng', source_type: 'ENGINEERING_ARTICLE', strength: 'MEDIUM', observed_behavior: 'Scaling GitLab to support millions of users on Kubernetes', reproductions: 1, repeatable: true, tested_without_auth: true, not_tested: [], retrieved_at: new Date().toISOString(), evidence_text: '', owner_source_link: 'verified' }
      ] 
    },
  ];

  for (const co of companies) {
    await validateCompany(co.name, co.url, co.evidence);
  }
}

main().catch(console.error);
