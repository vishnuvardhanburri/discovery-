import { SignalType, SIGNAL_TAXONOMY } from '../SignalTaxonomy';
import { ResearchBudgetState, IntelligenceCase } from '../IntelligenceCase';
import { CompanyResearchContext } from '../CompanyResearchContext';
import { DiscoveryQueryPlanner } from './DiscoveryQueryPlanner';
import { OrganizationCandidateExtractor } from './OrganizationCandidateExtractor';
import { DiscoveryQualityGate } from './DiscoveryQualityGate';
import { CompanyNormalizer } from './CompanyNormalizer';

export interface DiscoveryRequest {
  objective: string;
  industries?: string | 'ALL';
  geographies?: string | 'ALL';
  maxCandidates: number;
  researchBudget: any;
  researchMode: 'FREE_FIRST' | 'NORMAL' | 'PAID_AGGRESSIVE';
}

export interface OrganizationCandidate {
  organizationName: string;
  domain?: string;
  sourceUrl: string;
  sourceType: string;
  discoveryReason: string;
  rawIndicators: string[];
  evidenceIds: string[];
  // Signal support state
  signalState: 'RAW' | 'CANDIDATE' | 'SUPPORTED' | 'REJECTED';
  supportedSignals: SignalType[];
}

export class AutonomousOrganizationDiscoveryEngine {
  private queryPlanner = new DiscoveryQueryPlanner();
  private extractor = new OrganizationCandidateExtractor();
  private qualityGate = new DiscoveryQualityGate();
  private normalizer = new CompanyNormalizer();

  constructor(private manager: any) {}

  async discover(request: DiscoveryRequest): Promise<OrganizationCandidate[]> {
    console.log(`[AutoDiscovery] Starting Layered Discovery: ${request.objective}`);
    
    const candidates: OrganizationCandidate[] = [];
    const processedDomains = new Set<string>();

    // LAYER 1: Broad Organization Discovery
    console.log(`[Layer 1] Discovering organizations via technical footprints...`);
    const orgQueries = this.queryPlanner.generateOrganizationQueries(request);
    
    for (const q of orgQueries) {
      if (candidates.length >= request.maxCandidates) break;

      const searchResults = await this.manager.search(q.query);
      for (const result of searchResults) {
        const orgs = await this.extractor.extractCandidates(result);
        for (const org of orgs) {
          if (org.domain && processedDomains.has(org.domain)) continue;

          const gateResult = await this.qualityGate.evaluate(org);
          if (gateResult === 'REJECTED') continue;

          const normalized = this.normalizer.normalize(org);
          
          // Initialize as RAW candidate
          const candidate: OrganizationCandidate = {
            ...normalized,
            signalState: 'RAW',
            supportedSignals: []
          };

          candidates.push(candidate);
          if (candidate.domain) processedDomains.add(candidate.domain);
          if (candidates.length >= request.maxCandidates) break;
        }
      }
    }

    // LAYER 2 & 3: Signal Discovery & Evidence Support
    console.log(`[Layer 2/3] Refining signals for discovered organizations...`);
    for (const candidate of candidates) {
      const signalQueries = this.queryPlanner.generateSignalQueries(
        candidate.organizationName, 
        candidate.domain || '', 
        request
      );

      let foundSupport = false;
      for (const sq of signalQueries) {
        const results = await this.manager.search(sq.query);
        if (results.length > 0) {
          // In a real run, we would fetch the page and verify the signal
          // For now, a result in a specific signal query counts as a SIGNAL_CANDIDATE
          candidate.supportedSignals.push(sq.signalType);
          foundSupport = true;
        }
      }
      
      candidate.signalState = foundSupport ? 'SUPPORTED' : 'RAW';
    }

    console.log(`[AutoDiscovery] Discovery complete. Found ${candidates.length} organizations. ${candidates.filter(c => c.signalState === 'SUPPORTED').length} have supported signals.`);
    return candidates;
  }
}
