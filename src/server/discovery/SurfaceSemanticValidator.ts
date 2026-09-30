import { ExternalSurface } from './SurfaceTypes';
import { Evidence } from '../IntelligenceCase';
import { OrganizationIdentityGraph } from './OrganizationIdentityGraph';
import { SurfaceSemanticAssessment, FunctionalRole, AuthExpectation } from './SemanticTypes';

export class SurfaceSemanticValidator {
  async validate(
    surface: ExternalSurface, 
    evidenceStore: Evidence[], 
    identityGraph: OrganizationIdentityGraph
  ): Promise<SurfaceSemanticAssessment> {
    const surfaceEvidence = evidenceStore.filter(e => e.public_url === surface.url);
    const allText = surfaceEvidence.map(e => e.observed_behavior || '').join(' ').toLowerCase();

    // RULE: Hostname labels are hints, NOT proof.
    // We start with UNKNOWN and only promote if evidence exists.
    let role: FunctionalRole = 'UNKNOWN';
    let authExpectation: AuthExpectation = 'AUTH_UNKNOWN';

    // 1. Functional Role Classification based on evidence
    if (allText.includes('api') || allText.includes('endpoint') || allText.includes('json')) {
      role = 'API';
    } else if (allText.includes('login') || allText.includes('sign-in') || allText.includes('auth')) {
      role = 'AUTHENTICATION';
    } else if (allText.includes('status') || allText.includes('health')) {
      role = 'STATUS';
    } else if (allText.includes('admin') || allText.includes('dashboard')) {
      role = 'ADMINISTRATION';
    } else if (allText.includes('documentation') || allText.includes('guide')) {
      role = 'DOCUMENTATION';
    } else if (allText.includes('legacy') || allText.includes('deprecated')) {
      role = 'LEGACY';
    }

    // 2. Expectation Establishment
    if (allText.includes('requires authentication') || allText.includes('protected')) {
      authExpectation = 'AUTH_EXPECTED';
    } else if (allText.includes('public endpoint') || allText.includes('unauthenticated')) {
      authExpectation = 'AUTH_NOT_EXPECTED';
    }

    return {
      surfaceId: surface.id,
      surfaceType: surface.type,
      functionalRole: role,
      organizationAttribution: surface.provenance,
      ownershipEvidence: surfaceEvidence.map(e => e.id),
      currentState: 'DISCOVERED',
      recency: new Date().toISOString(),
      expectedBehavior: `Expected ${role} behavior with ${authExpectation} authentication.`,
      authExpectation: authExpectation,
      boundaryType: 'UNKNOWN',
      evidenceIds: surfaceEvidence.map(e => e.id),
      confidence: 0.6,
      unknowns: authExpectation === 'AUTH_UNKNOWN' ? ['Actual authentication requirement'] : []
    };
  }
}
