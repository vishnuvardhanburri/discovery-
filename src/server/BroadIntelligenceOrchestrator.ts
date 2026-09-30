import { 
  CompanyIntelligenceProfile, 
  ComplexityMap, 
  InvestigationHypothesis, 
  InvestigationState, 
  IntelligenceCase,
  Evidence,
  ComplexityNode
} from './IntelligenceCase';
import { CompanyResearchContext } from './CompanyResearchContext';
import { XaviraSystemManager } from './system/XaviraSystemManager';
import { SpecialistResult } from './specialists/SpecialistTypes';
import { BaseSpecialist } from './specialists/BaseSpecialist';
import { CompanyUnderstandingSpecialist } from './specialists/CompanyUnderstandingSpecialist';
import { ProductUnderstandingSpecialist } from './specialists/ProductUnderstandingSpecialist';
import { TechFootprintSpecialist } from './specialists/TechFootprintSpecialist';
import { PublicSurfacesSpecialist } from './specialists/PublicSurfacesSpecialist';
import { EngineeringEvidenceSpecialist } from './specialists/EngineeringEvidenceSpecialist';
import { RecentChangesSpecialist } from './specialists/RecentChangesSpecialist';
import { IncidentReliabilitySpecialist } from './specialists/IncidentReliabilitySpecialist';
import { InfraArchitectureSpecialist } from './specialists/InfraArchitectureSpecialist';
import { DeveloperApiSpecialist } from './specialists/DeveloperApiSpecialist';
import { CommunityDiscussionSpecialist } from './specialists/CommunityDiscussionSpecialist';
import { VerificationTargetPlanner } from './VerificationTargetPlanner';
import { TechnicalEntityExtractor } from './TechnicalEntityExtractor';
import { ApiOperationParser } from './ApiOperationParser';
import { JSAssetInspector } from './JSAssetInspector';
import { SignalContextExpansionEngine } from './discovery/SignalContextExpansionEngine';
import { TrendAndChangeIntelligenceEngine } from './discovery/TrendAndChangeIntelligenceEngine';
import { AdvisoryEligibilityEngine } from './discovery/AdvisoryEligibilityEngine';
import { ExternalBoundaryCapabilityEngine } from './discovery/ExternalBoundaryCapabilityEngine';

export class BroadIntelligenceOrchestrator {
  private readonly specialists: BaseSpecialist[];
  private readonly targetPlanner: VerificationTargetPlanner;
  private readonly entityExtractor: TechnicalEntityExtractor;
  private readonly apiParser: ApiOperationParser;
  private readonly jsInspector: JSAssetInspector;
  private readonly expansionEngine: SignalContextExpansionEngine;
  private readonly trendEngine: TrendAndChangeIntelligenceEngine;
  private readonly advisoryEngine: AdvisoryEligibilityEngine;
  private readonly boundaryEngine: ExternalBoundaryCapabilityEngine;

  constructor(private manager: XaviraSystemManager) {
    this.specialists = [
      new CompanyUnderstandingSpecialist(),
      new ProductUnderstandingSpecialist(),
      new TechFootprintSpecialist(),
      new PublicSurfacesSpecialist(),
      new EngineeringEvidenceSpecialist(),
      new RecentChangesSpecialist(),
      new IncidentReliabilitySpecialist(),
      new InfraArchitectureSpecialist(),
      new DeveloperApiSpecialist(),
      new CommunityDiscussionSpecialist(),
    ];
    this.targetPlanner = new VerificationTargetPlanner();
    this.entityExtractor = new TechnicalEntityExtractor();
    this.apiParser = new ApiOperationParser();
    this.jsInspector = new JSAssetInspector();
    this.expansionEngine = new SignalContextExpansionEngine();
    this.trendEngine = new TrendAndChangeIntelligenceEngine();
    this.advisoryEngine = new AdvisoryEligibilityEngine();
    this.boundaryEngine = new ExternalBoundaryCapabilityEngine();
  }

  async orchestrate(caseData: IntelligenceCase, context: CompanyResearchContext): Promise<IntelligenceCase> {
    console.log(`[BroadIntel] Starting Phase A: Broad Collection for ${caseData.company}`);
    caseData.internalState = 'DISCOVERING';

    const results = await Promise.all(
      this.specialists.map(spec => 
        spec.execute({
          companyId: caseData.company,
          companyName: caseData.company,
          domain: (caseData as any).domain || '',
        }, context)
      )
    );

    for (const res of results) {
      caseData.evidence.push(...res.evidence);
    }

    const supportedSignals = (caseData as any).supportedSignals || [];
    if (supportedSignals.length > 0) {
      console.log(`[BroadIntel] Signal detected. Starting Context Expansion...`);
      for (const signalType of supportedSignals) {
        const expansionQueries = this.expansionEngine.generateExpansionQueries(
          caseData.company,
          (caseData as any).domain || '',
          signalType,
          caseData.evidence
        );
        for (const eq of expansionQueries) {
          const searchResults = await this.manager.search(eq.query);
          for (const res of searchResults) {
            caseData.evidence.push({
              id: `ev_exp_${Math.random().toString(36).substr(2, 9)}`,
              provenance: {
                source_url: res.url,
                canonical_url: res.url,
                source_type: 'SEARCH_RESULT' as any,
                discovery_mechanism: 'SEARCH',
                retrieval_timestamp: new Date().toISOString(),
                provider: 'SignalExpansion',
                attribution: `Context Expansion: ${eq.category}`,
                classification: 'DOCUMENT'
              },
              evidence_origin: 'DISCOVERY',
              public_url: res.url,
              source_type: 'SEARCH_RESULT' as any,
              retrieved_at: new Date().toISOString(),
              observed_behavior: res.snippet,
              evidence_text: res.snippet,
            } as any);
          }
        }
      }
    }

    console.log(`[BroadIntel] Synthesizing intelligence for ${caseData.company}`);
    caseData.internalState = 'TECHNICAL_CONTEXT_FOUND';
    caseData.intelligenceProfile = this.synthesizeProfile(caseData);
    
    const entities = this.entityExtractor.extractEntities(caseData.evidence);
    const relationships = this.entityExtractor.extractRelationships(entities, caseData.evidence);
    
    caseData.internalState = 'COMPLEXITY_IDENTIFIED';
    caseData.complexityMap = this.mapComplexity(caseData, entities, relationships);

    caseData.internalState = 'HYPOTHESIS_GENERATED';
    caseData.hypotheses = this.generateHypotheses(caseData, entities, relationships);

    if (caseData.hypotheses && caseData.hypotheses.length > 0) {
      console.log(`[BroadIntel] Starting Phase B: Targeted Verification for ${caseData.company}`);
      
      const documentedOps = await this.apiParser.extractOperations(caseData.evidence);
      const jsEndpoints: any[] = [];
      for (const e of caseData.evidence) {
        if (e.classification === 'SURFACE' && e.public_url.endsWith('.js')) {
          const assets = [e.public_url];
          const found = await this.jsInspector.inspectAssets(caseData.company, assets, caseData.evidence);
          jsEndpoints.push(...found);
        }
      }

      documentedOps.forEach(op => {
        caseData.evidence.push({
          id: `ev_op_${op.operationId}`,
          provenance: {
            source_url: op.documentationUrl,
            canonical_url: op.documentationUrl,
            source_type: 'API_REFERENCE' as any,
            discovery_mechanism: 'API_DISCOVERY',
            retrieval_timestamp: new Date().toISOString(),
            provider: 'ApiOperationParser',
            attribution: 'API Operation Discovery',
            classification: 'SURFACE'
          },
          evidence_origin: 'DISCOVERY',
          public_url: op.fullUrl,
          source_type: 'API_ENDPOINT' as any,
          retrieved_at: new Date().toISOString(),
          observed_behavior: "Documented executable operation: " + op.method + " " + op.endpoint + ". Auth: " + op.authRequirement + ".",
          evidence_text: "Documented executable operation: " + op.method + " " + op.endpoint + ".",
        } as any);
      });

      jsEndpoints.forEach(op => {
        caseData.evidence.push({
          id: `ev_js_${op.operationId || 'op'}`,
          provenance: {
            source_url: op.assetUrl,
            canonical_url: op.assetUrl,
            source_type: 'JS_BUNDLE' as any,
            discovery_mechanism: 'API_DISCOVERY',
            retrieval_timestamp: new Date().toISOString(),
            provider: 'JSAssetInspector',
            attribution: 'JS Asset Discovery',
            classification: 'SURFACE'
          },
          evidence_origin: 'DISCOVERY',
          public_url: op.fullUrl || op.endpoint,
          source_type: 'API_ENDPOINT' as any,
          retrieved_at: new Date().toISOString(),
          observed_behavior: "JS-discovered executable operation: " + op.method + " " + op.endpoint + ". Snippet: " + op.snippet,
          evidence_text: "JS-discovered executable operation: " + op.method + " " + op.endpoint + ".",
        } as any);
      });

      let verifiedAny = false;
      for (const hypothesis of caseData.hypotheses) {
        const target = await this.targetPlanner.planTarget(hypothesis, caseData, context);
        if (!target) {
          console.log(`[BroadIntel] No executable target for hypothesis ${hypothesis.id}`);
          hypothesis.status = 'VERIFICATION_INCONCLUSIVE';
          continue;
        }
        console.log(`[BroadIntel] Verifying ${hypothesis.id} at ${target.url}`);
        const result = await this.manager.verifyHypothesis(hypothesis, context);
        hypothesis.status = result.status;
        if (result.verified) verifiedAny = true;
      }

      if (verifiedAny) {
        caseData.internalState = 'VERIFIED_FINDING';
      } else {
        const hadAnyTarget = caseData.hypotheses.some(h => h.status !== 'VERIFICATION_INCONCLUSIVE');
        caseData.internalState = hadAnyTarget ? 'VERIFICATION_INCONCLUSIVE' : 'VERIFICATION_TARGET_UNAVAILABLE';
      }
    } else {
      caseData.internalState = caseData.complexityMap?.nodes.length ? 'VERIFICATION_TARGET_UNAVAILABLE' : 'NO_ACTIONABLE_SIGNAL';
    }

    if (caseData.internalState !== 'VERIFIED_FINDING') {
      const trends = await this.trendEngine.analyzeTrends(caseData.evidence);
      const advisory = await this.advisoryEngine.evaluate(caseData, trends);
      if (advisory.eligible) {
        console.log(`[BroadIntel] Eligible for Advisory Notice: ${advisory.type}`);
        caseData.internalState = 'ADVISORY_NOTICE';
      }
    }

    return caseData;
  }

  private synthesizeProfile(caseData: IntelligenceCase): CompanyIntelligenceProfile {
    const evidence = caseData.evidence;
    const profile: CompanyIntelligenceProfile = {
      identity: { companyName: caseData.company, domain: (caseData as any).domain || '', whatTheyDo: 'Unknown', confidence: 'LOW', evidenceIds: [] },
      product: { services: [], technicalProduct: 'Unknown', workloads: [], users: [], evidenceIds: [] },
      technologyFootprint: { languages: [], frameworks: [], cloud: [], databases: [], compute: [], orchestration: [], apis: [], evidenceIds: [] },
      surfaces: { apiDeveloper: [], docs: [], engineering: [], status: [], changelog: [], repositories: [], architecture: [], evidenceIds: [] },
      engineeringContext: { articles: [], migrations: [], launches: [], architectureChanges: [], scaling: [], recentChanges: [], evidenceIds: [] },
      operationalSignals: { incidentHistory: [], reliabilitySignals: [], liveObservations: [], evidenceIds: [] },
      unknowns: [],
      researchGaps: []
    } as any;

    evidence.forEach(e => {
      const text = (e.factualObservation || e.observed_behavior || '').toLowerCase();
      if (/scales with your business|enterprise-grade|high performance|ai-powered platform/i.test(text)) return;
      if (e.provenance.attribution === 'Official Homepage') {
        profile.identity.whatTheyDo = e.factualObservation || 'Company identity found on homepage';
        profile.identity.evidenceIds.push(e.id);
      }
      if (e.provenance.attribution === 'Product Understanding') {
        profile.product.technicalProduct = e.factualObservation || 'Technical product description found';
        profile.product.evidenceIds.push(e.id);
      }
      if (e.provenance.attribution === 'Infrastructure Clue') {
        if (text.includes('aws')) profile.technologyFootprint.cloud.push('AWS');
        if (text.includes('gcp')) profile.technologyFootprint.cloud.push('GCP');
        if (text.includes('azure')) profile.technologyFootprint.cloud.push('Azure');
        if (text.includes('kubernetes')) profile.technologyFootprint.orchestration.push('Kubernetes');
        profile.technologyFootprint.evidenceIds.push(e.id);
      }
      if (e.classification === 'SURFACE') {
        if (e.public_url.includes('/api')) profile.surfaces.apiDeveloper.push(e.public_url);
        if (e.public_url.includes('/docs')) profile.surfaces.docs.push(e.public_url);
        if (e.public_url.includes('/blog')) profile.surfaces.engineering.push(e.public_url);
        if (e.public_url.includes('/status')) profile.surfaces.status.push(e.public_url);
        if (e.public_url.includes('/changelog') || e.public_url.includes('/releases')) profile.surfaces.changelog.push(e.public_url);
        profile.surfaces.evidenceIds.push(e.id);
      }
      if (e.provenance.attribution === 'Engineering Evidence') {
        profile.engineeringContext.scaling.push(e.factualObservation || 'Scaling evidence found');
        profile.engineeringContext.evidenceIds.push(e.id);
      }
      if (e.provenance.attribution === 'Reliability Evidence') {
        profile.operationalSignals.incidentHistory.push(e.factualObservation || 'Incident reported');
        profile.operationalSignals.infrastructureSignals.push(e.factualObservation || 'Reliability signal found');
        profile.operationalSignals.evidenceIds.push(e.id);
      }
    });

    if (profile.surfaces.apiDeveloper.length === 0) profile.researchGaps.push('Developer API not found');
    if (profile.technologyFootprint.compute.length === 0) profile.researchGaps.push('Compute infrastructure unknown');

    return profile;
  }

  private mapComplexity(caseData: IntelligenceCase, entities: TechnicalEntity[], relationships: TechnicalRelationship[]): ComplexityMap {
    const nodes: ComplexityNode[] = [];
    const hasGPU = entities.some(e => ['GPU', 'ACCELERATOR', 'GPU_CLUSTER'].includes(e.canonicalLabel));
    const hasWorkload = entities.some(e => ['INFERENCE', 'TRAINING'].includes(e.canonicalLabel));
    const hasControl = entities.some(e => ['ORCHESTRATOR', 'SCHEDULER', 'ROUTER', 'AUTOSCALER'].includes(e.canonicalLabel));

    if (hasGPU && (hasWorkload || hasControl)) {
      const relevantEntities = entities.filter(e => 
        ['GPU', 'ACCELERATOR', 'GPU_CLUSTER', 'INFERENCE', 'TRAINING', 'ORCHESTRATOR', 'SCHEDULER', 'ROUTER', 'AUTOSCALER'].includes(e.canonicalLabel)
      );
      nodes.push({
        id: 'GPU_ORCHESTRATION',
        type: 'INFRA_COMPONENT' as any,
        label: 'GPU / Inference Orchestration Complexity',
        description: 'Evidence of specialized compute (GPU/Accelerator) combined with inference workloads or orchestration control.',
        entityIds: relevantEntities.map(e => e.entityId),
        evidenceIds: relevantEntities.flatMap(e => e.evidenceIds),
        rationale: "Correlation of lapped compute, workload, and control entities.",
        uncertainty: 'Hypothesized architectural pressure.'
      } as any);
    }

    const hasData = entities.some(e => e.entityType === 'DATA');
    const hasRegional = entities.some(e => ['MULTI_REGION', 'REGIONAL_ROUTING', 'EDGE'].includes(e.canonicalLabel));

    if (hasData && hasRegional) {
      const relevantEntities = entities.filter(e => e.entityType === 'DATA' || ['MULTI_REGION', 'REGIONAL_ROUTING', 'EDGE'].includes(e.canonicalLabel));
      nodes.push({
        id: 'REGIONAL_DATA_ARCHITECTURE',
        type: 'INFRA_COMPONENT' as any,
        label: 'Regional Data Architecture Complexity',
        description: 'Evidence of distributed regional data planes.',
        entityIds: relevantEntities.map(e => e.entityId),
        evidenceIds: relevantEntities.flatMap(e => e.evidenceIds),
        rationale: "Correlation of data and regional network entities.",
        uncertainty: 'Hypothesized architectural pressure.'
      } as any);
    }

    return { nodes, edges: [], bottlenecks: nodes.map(n => n.id) };
  }

  private generateHypotheses(caseData: IntelligenceCase, entities: TechnicalEntity[], relationships: TechnicalRelationship[]): InvestigationHypothesis[] {
    const hypotheses: InvestigationHypothesis[] = [];
    const map = caseData.complexityMap;
    if (!map || !map.nodes) return [];

    for (const node of map.nodes) {
      const hypothesis: InvestigationHypothesis = {
        id: `hyp_${node.id}`,
        technicalArea: node.label,
        claim: `Public evidence suggests ${node.label.toLowerCase()} is an architectural boundary worth testing.`,
        evidenceIds: node.evidenceIds,
        supportingSources: node.evidenceIds.map(id => caseData.evidence.find(e => e.id === id)?.public_url || 'Unknown'),
        contradictingSources: [],
        unknowns: 'Specific production failure state not established publicly',
        verificationTarget: 'TBD',
        requiredVerification: `Safe observation of ${node.label} behavior under load or specific state.`,
        confidence: 0.6,
        status: 'HYPOTHESIS'
      } as any;
      (hypothesis as any).entityIds = node.entityIds;
      hypotheses.push(hypothesis);
    }
    return hypotheses;
  }
}
