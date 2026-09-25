/**
 * XAVIRA PEOPLE EXTRACTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts publicly listed professional identities from discovered company
 * pages and produces evidence-backed OwnerCandidate objects.
 *
 * Heuristics (deliberately conservative — never fabricate):
 *   - Only people whose role is explicitly matched against the candidate-role
 *     list on a professional/team/leadership/about page are emitted.
 *   - A name is required; pages that merely mention "the CTO spoke at ..."
 *     without a listed person are not fabricated into a candidate.
 *   - Confidence reflects the strength of PUBLIC evidence:
 *       HIGH   = person + role explicitly listed on a team/leadership/about page
 *       MEDIUM = role keyword + plausible name on another public page
 *       LOW    = role keyword only, no name
 *   - every candidate carries source_urls and verbatim evidence excerpts so the
 *     claim is fully traceable.
 */

import {
  CANDIDATE_ROLES,
  OwnerCandidate,
  DiscoveredPage,
  StrengthLevel
} from './IntelligenceCase';

export interface PeopleExtractorOptions {
  company?: string;
  /** Role keywords that map to a technical area context (e.g. security, infra). */
  technicalAreaHints?: string[];
}

/** A single raw person mention extracted from HTML. */
export interface RawPerson {
  name: string;
  role: string;
  source_url: string;
  evidence: string[];
}

export class PeopleExtractor {
  /** Extract owner candidates across a set of discovered pages. */
  static extractFromPages(pages: DiscoveredPage[], htmlByUrl: Map<string, string>, options: PeopleExtractorOptions = {}): OwnerCandidate[] {
    const candidates: OwnerCandidate[] = [];
    const company = options.company ?? '';

    for (const page of pages) {
      const html = htmlByUrl.get(page.url);
      if (!html) continue;
      const raws = this.extractPeopleFromHtml(html, page.url, page.category);
      for (const raw of raws) {
        if (!this.isCandidateRole(raw.role)) continue;
        const confidence = this.confidenceFor(raw, page.category);
        const relationship = this.relationshipToArea(raw.role, options.technicalAreaHints);
        candidates.push({
          name: this.cleanName(raw.name),
          role: raw.role,
          company: company || this.inferCompanyFromUrl(page.url),
          source_urls: Array.from(new Set(raw.evidence.map(e => page.url))),
          evidence: raw.evidence,
          relationship_to_area: relationship,
          confidence,
          explicit_evidence: confidence === 'HIGH'
        });
      }
    }

    // de-dupe by name+role, keeping the highest-confidence entry.
    return this.dedupe(candidates);
  }

  /**
   * Extract people mentions from a single HTML document.
   * Returns raw mentions (name + role + evidence) that the caller can further
   * filter against the candidate-role list.
   */
  static extractPeopleFromHtml(html: string, sourceUrl: string, category?: string): RawPerson[] {
    const cleaned = this.stripScripts(html);
    const results: RawPerson[] = [];

    // Strategy 1: explicit "Name —/Title" / "Name, Title" pairs in lines that
    // also contain a candidate role keyword.
    for (const line of this.textLines(cleaned)) {
      const role = this.matchRoleKeyword(line);
      if (!role) continue;
      const name = this.extractNameFromLine(line, role);
      if (!name) continue;
      results.push({ name, role, source_url: sourceUrl, evidence: [this.sentenceAround(cleaned, line)] });
    }

    // Strategy 2: team/leadership cards. Look for blocks that contain both an
    // <img alt="Name ..."> and a role keyword nearby.
    if (results.length === 0) {
      const cards = this.extractCards(cleaned);
      for (const card of cards) {
        const role = this.matchRoleKeyword(card);
        if (!role) continue;
        const name = this.extractNameFromCard(card);
        if (!name) continue;
        results.push({ name, role, source_url: sourceUrl, evidence: [this.sentenceAround(cleaned, card)] });
      }
    }

    // Strategy 3: byline / author links (e.g. <a rel="author">Name</a> ... title)
    if (results.length === 0) {
      const authors = this.extractAuthorBylines(cleaned, sourceUrl);
      results.push(...authors);
    }

    return results;
  }

  // ── strategy helpers ─────────────────────────────────────────────────────
  private static stripScripts(html: string): string {
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  }

  private static textLines(html: string): string[] {
    // Convert block tags to newlines so each person block is its own line.
    const block = html.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|article|tr)[^>]*>/gi, '\n');
    const noTags = this.stripTags(block);
    return noTags.split(/\n+/).map(s => s.trim()).filter(s => s.length > 3);
  }

  private static stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private static sentences(html: string): string[] {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  /** Return the full sentence that best contains `snippet`. */
  private static sentenceAround(_html: string, snippet: string): string {
    const lines = this.sentences(_html);
    const found = lines.find(l => l.toLowerCase().includes(snippet.toLowerCase().slice(0, 20)));
    return (found || snippet).slice(0, 300);
  }

  private static matchRoleKeyword(text: string): string | undefined {
    const t = text.toLowerCase();
    // Order matters: check multi-word first.
    const ordered = [
      'vp engineering', 'vp of engineering', 'vp product', 'vp of product',
      'director of engineering', 'director of platform', 'director of infrastructure',
      'head of engineering', 'head of platform', 'head of infrastructure', 'head of security',
      'platform engineering lead', 'infrastructure lead', 'sre lead',
      'security lead', 'engineering manager', 'staff engineer', 'principal engineer',
      'cto', 'cpo', 'technical founder', 'co-founder', 'cofounder'
    ];
    for (const kw of ordered) {
      if (t.includes(kw)) return this.normaliseRole(kw);
    }
    return undefined;
  }

  private static normaliseRole(kw: string): string {
    const map: Record<string, string> = {
      'vp engineering': 'VP Engineering', 'vp of engineering': 'VP Engineering',
      'vp product': 'VP Product', 'vp of product': 'VP Product',
      'director of engineering': 'Director of Engineering',
      'director of platform': 'Director of Platform',
      'director of infrastructure': 'Director of Infrastructure',
      'head of engineering': 'Head of Engineering', 'head of platform': 'Head of Platform',
      'head of infrastructure': 'Head of Infrastructure', 'head of security': 'Head of Security',
      'platform engineering lead': 'Platform Engineering Lead',
      'infrastructure lead': 'Infrastructure Lead', 'sre lead': 'SRE Lead',
      'security lead': 'Security Lead', 'engineering manager': 'Engineering Manager',
      'staff engineer': 'Staff Engineer', 'principal engineer': 'Principal Engineer',
      'cto': 'CTO', 'cpo': 'CPO',
      'technical founder': 'Technical Founder', 'co-founder': 'Co-Founder', 'cofounder': 'Co-Founder'
    };
    return map[kw] || kw;
  }

  private static isCandidateRole(role: string): boolean {
    return CANDIDATE_ROLES.some(r => r.toLowerCase() === role.toLowerCase());
  }

  /** Extract a plausible person name (2-3 Capitalised words) preceding the role. */
  private static extractNameFromLine(line: string, role: string): string | undefined {
    // Remove the role keyword from the line, then look for a name before it.
    const idx = line.toLowerCase().indexOf(role.toLowerCase());
    if (idx < 0) return undefined;
    const before = line.slice(0, idx);
    // name is the trailing capitalised words of `before` (e.g. "... Jane Doe Head of ...")
    const tokens = before.trim().split(/[\s,;\-]+/).map(t => t.trim()).filter(Boolean);
    const name = this.grabNameTokens(tokens);
    return name;
  }

  private static grabNameTokens(tokens: string[]): string | undefined {
    // Walk backwards collecting Capitalized words (2-3 tokens).
    const picked: string[] = [];
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i].replace(/[.,;:\-]/g, '');
      if (/^[A-Z][a-z]+$/.test(t)) {
        picked.unshift(t);
      } else {
        break;
      }
      if (picked.length >= 3) break;
    }
    if (picked.length >= 2 && picked.length <= 3) {
      return picked.join(' ');
    }
    // Fall back: a token containing a dot, e.g. "Jane.Doe" or "J. Doe"
    const joined = picked.join(' ');
    if (joined && /^[A-Z]/.test(joined) && joined.includes('.')) return joined;
    return undefined;
  }

  private static extractNameFromCard(card: string): string | undefined {
    // img alt text often carries the name; or first capitalized line segment.
    const alt = /alt=["']([^"']*)["']/i.exec(card);
    if (alt) {
      const name = this.grabNameTokens(alt[1].split(/\s+/).map(t => t.replace(/[.,;]/g, '')));
      if (name) return name;
    }
    const tokens = this.stripTags(card).split(/[\s,;\-]+/).filter(Boolean);
    return this.grabNameTokens(tokens);
  }

  private static extractCards(html: string): string[] {
    // Grab blocks inside common team-card containers.
    const regex = /<(div|li)[^>]*class=["'][^"']*(team|member|staff|leadership|person|people-profile|profile)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      out.push(m[0]);
    }
    return out;
  }

  private static extractAuthorBylines(html: string, sourceUrl: string): RawPerson[] {
    const out: RawPerson[] = [];
    const bylineRe = /<a[^>]*rel=["']author["'][^>]*>(.*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = bylineRe.exec(html)) !== null) {
      const name = this.grabNameTokens(this.stripTags(m[1]).split(/\s+/).map(t => t.replace(/[.,;]/g, '')));
      // Try to find a role keyword in the surrounding sentence.
      const surrounding = this.sentenceAround(html, m[1]);
      const role = this.matchRoleKeyword(surrounding) || 'Author';
      if (name) {
        out.push({ name, role, source_url: sourceUrl, evidence: [surrounding] });
      }
    }
    return out;
  }

  private static cleanName(name: string): string {
    return name.replace(/\s+/g, ' ').trim();
  }

  private static inferCompanyFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }

  private static confidenceFor(raw: RawPerson, category?: string): StrengthLevel {
    const onPeoplePage = category === 'team_people' || category === 'about' || category === 'engineering';
    if (onPeoplePage && raw.evidence.length > 0) return 'HIGH';
    if (raw.evidence.length > 0) return 'MEDIUM';
    return 'LOW';
  }

  private static relationshipToArea(role: string, hints: string[] = []): string {
    const r = role.toLowerCase();
    const hint = (hints || []).map(h => h.toLowerCase()).filter(Boolean);

    const area =
      r.includes('security') ? 'security & trust boundary' :
      r.includes('infrastructure') || r.includes('sre') || r.includes('platform') ? 'platform, infrastructure & reliability' :
      r.includes('product') ? 'product & technical direction' :
      'engineering & technical leadership';

    // If we know the finding area, state relevance explicitly.
    if (hint.length > 0) {
      const matched = hint.filter(h => area.includes(h) || r.includes(h));
      if (matched.length > 0) {
        return `Role '${role}' explicitly covers ${area} (matched: ${matched.join(', ')}).`;
      }
      return `Role '${role}' covers ${area}; relevance to the observed technical area is not explicitly stated on the public page.`;
    }
    return `Role '${role}' covers ${area}. Specific ownership must be verified against the finding.`;
  }

  private static dedupe(candidates: OwnerCandidate[]): OwnerCandidate[] {
    const best = new Map<string, OwnerCandidate>();
    const rank = { LOW: 0, MEDIUM: 1, HIGH: 2, NOT_APPLICABLE: 0 };
    for (const c of candidates) {
      const key = `${c.name.toLowerCase()}|${c.role.toLowerCase()}`;
      const existing = best.get(key);
      if (!existing || rank[c.confidence] > rank[existing.confidence]) {
        best.set(key, c);
      }
    }
    return Array.from(best.values());
  }
}
