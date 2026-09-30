import { OrganizationCandidate } from './AutonomousOrganizationDiscoveryEngine';

export class CompanyNormalizer {
  normalize(candidate: OrganizationCandidate): OrganizationCandidate {
    return {
      ...candidate,
      domain: candidate.domain ? candidate.domain.toLowerCase() : undefined,
      organizationName: candidate.organizationName.trim()
    };
  }
}
