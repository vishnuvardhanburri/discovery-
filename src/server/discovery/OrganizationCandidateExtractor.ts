import { OrganizationCandidate } from './AutonomousOrganizationDiscoveryEngine';

export class OrganizationCandidateExtractor {
  async extractCandidates(result: any): Promise<OrganizationCandidate[]> {
    const candidates: OrganizationCandidate[] = [];
    const text = (result.snippet || '').toLowerCase();
    const url = result.url;

    if (!url) return [];

    try {
      const domain = new URL(url).hostname.replace('www.', '');
      
      // During broad discovery, any company publishing a technical footprint 
      // (engineering blog, docs, etc.) is a candidate.
      if (this.isTechnicalFootprint(text, url)) {
        candidates.push({
          organizationName: this.extractOrgName(text, url),
          domain: domain,
          sourceUrl: url,
          sourceType: 'SEARCH_RESULT',
          discoveryReason: 'Technical footprint detected in public content',
          rawIndicators: this.extractIndicators(text),
          evidenceIds: []
        } as any);
      }
    } catch (e) {
      return [];
    }

    return candidates;
  }

  private isTechnicalFootprint(text: string, url: string): boolean {
    // Broad discovery: look for the presence of technical surfaces
    const footprintKeywords = [
      'engineering', 'blog', 'docs', 'api', 'infrastructure', 
      'architecture', 'platform', 'developer', 'scaling', 'status'
    ];
    
    const hasKeyword = footprintKeywords.some(k => text.includes(k));
    const hasTechnicalUrl = /blog|docs|api|status|engineering/.test(url.toLowerCase());
    
    return hasKeyword || hasTechnicalUrl;
  }

  private extractOrgName(text: string, url: string): string {
    const domain = new URL(url).hostname.replace('www.', '');
    const parts = domain.split('.');
    if (parts.length < 2) return 'Unknown Org';
    
    // Use the first part of the domain and capitalize it
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  private extractIndicators(text: string): string[] {
    const indicators = [
      'engineering', 'blog', 'docs', 'api', 'infrastructure', 
      'architecture', 'platform', 'developer', 'scaling', 'status'
    ];
    return indicators.filter(s => text.includes(s));
  }
}
