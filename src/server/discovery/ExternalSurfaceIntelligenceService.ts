import { ExternalSurface, ExternalSurfaceProfile } from './SurfaceTypes';
import { 
  SurfaceSemanticAssessment, 
  ExposureAssessment 
} from './SemanticTypes';
import { SurfaceSemanticValidator } from './SurfaceSemanticValidator';
import { ExposureCorrelationEngine } from './ExposureCorrelationEngine';
import { ExternalExposureGraphEngine, ExposureGraph } from './ExternalExposureGraphEngine';
import { ExposureNarrativeGenerator } from './ExposureNarrativeGenerator';
import { Evidence } from '../IntelligenceCase';
import { XaviraSystemManager } from '../system/XaviraSystemManager';

export class ExternalSurfaceIntelligenceService {
  private validator = new SurfaceSemanticValidator();
  private correlator = new ExposureCorrelationEngine();
  private graphEngine = new ExternalExposureGraphEngine();
  private narrativeGen = new ExposureNarrativeGenerator();

  constructor(private manager: XaviraSystemManager) {}

  async generateSurfaceProfile(orgName: string, domain: string): Promise<ExternalSurfaceProfile> {
    // 1. Initial Surface Discovery (simplified for this flow)
    const surfaces: ExternalSurface[] = [
      { id: 's1', url: `https://api.${domain}`, type: 'API' },
      { id: 's2', url: `https://login.${domain}`, type: 'AUTH' },
      { id: 's3', url: `https://admin.${domain}`, type: 'ADMIN' },
      { id: 's4', url: `https://status.${domain}`, type: 'STATUS' },
    ];

    const evidence: Evidence[] = []; // In real flow, this comes from search/fetch

    // 2. Semantic Validation
    const assessments: SurfaceSemanticAssessment[] = [];
    for (const s of surfaces) {
      const assessment = await this.validator.validate(s, evidence, (this.manager as any).identityGraph || new Map());
      assessments.push(assessment);
    }

    // 3. Exposure Correlation
    const exposures = await this.correlator.correlate(assessments, [], [], []);

    // 4. Graph Construction
    const graph = await this.graphEngine.buildGraph(surfaces, assessments, evidence);

    // 5. Narrative Synthesis
    const narrative = this.narrativeGen.generateNarrative(orgName, graph, exposures);

    return {
      organizationName: orgName,
      domain,
      surfaces,
      assessments,
      exposures,
      narrative,
      evidence,
    };
  }
}
