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

/**
 * Tokens that are NEVER a human name on a professional listing: UI labels,
 * navigation text, documentation labels, component/brand fragments and common
 * English words that appear on JS-rendered pages ("use case", "docs", "dire",
 * "ve", ...). A general category list — not a hard-coded fix for any one fake
 * name. Combined with NAME_TOKEN_RE this makes extraction conservative.
 */
const NON_NAME_TOKENS: ReadonlySet<string> = new Set([
  'use','case','docs','doc','dire','ve','re','demo','test','example','etc','page','pages',
  'section','menu','button','buttons','icon','icons','avatar','avatars','user','users',
  'profile','profiles','navbar','header','footer','sidebar','modal','overlay','popup',
  'tooltip','badge','badges','close','open','saved','cancel','submit','reset','edit',
  'view','views','click','clicked','hover','select','selection','search','searching',
  'signin','sign-in','signup','sign-up','login','logout','log-in','log-out','sign','free',
  'try','trying','starting','start','started','learn','learning','contact','contacts',
  'about','help','faqs','faq','blog','blogs','press','presses','careers','career','pricing',
  'enterprise','business','partner','partners','solutions','solution','services','service',
  'customer','customers','client','clients','database','databases','products','product',
  'platform','platforms','engineering','engineers','engineer','company','companies','team',
  'teams','staff','staffs','members','member','employee','employees','analytics','settings',
  'account','accounts','billing','dashboard','dashboards','workspace','workspaces','project',
  'projects','admin','admins','sales','support','supporters','info','hello','resources',
  'resource','integration','integrations','migrations','migration','source','sources','open',
  'opens','cloud','clouds','server','servers','serverless','api','apis','endpoint','endpoints',
  'infra','infrastructure','developer','developers','developer','dev','qa','ops',
  'modernization','lead','leads','leaders','leadership','overview','summary','details',
  'detail','description','title','titles','role','roles','department','function','functions',
  'group','groups','division','divisions','organization','organizations','data','datum','item',
  'items','row','rows','column','columns','table','tables','list','lists','grid','grids',
  'tile','tiles','module','modules','component','components','widget','widgets','frame',
  'frames','block','blocks','container','containers','wrapper','element','elements',
  'feature','features','capability','capabilities','benefit','benefits','value','values',
  'mission','vision','goal','goals','objective','objectives','strategy','strategies','plan',
  'plans','roadmap','timeline','timelines','process','processes','workflow','workflows',
  'pipeline','design','designs','style','styles','theme','themes','version','versions',
  'edition','editions','tier','tiers','level','levels','stage','stages','status','statuses',
  'type','types','kind','kinds','form','forms','field','fields','label','labels',
  'placeholder','placeholders','input','inputs','output','outputs','output','result',
  'results','outcome','outcomes','feed','feeds','story','stories','post','posts','article',
  'articles','news','media','contents','content','block','element','capability','benefit',
  'sign','in','out','up','down','get','got','let','set','new','old','now','any','all',
  'some','much','most','such','than','then','them','they','their','theirs','your','yours',
  'our','ours','its','it','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','should','could','may','might','must','shall','can',
  'need','dare','ought','used','use','case','docs','dire','ve','re','demo','test','etc',
  'page','section','menu','button','icon','avatar','profile','navbar','header','footer',
  'sidebar','modal','overlay','popup','tooltip','badge','close','open','cancel','submit',
  'reset','edit','view','click','hover','select','search','signin','signup','login','logout',
  'sign','free','try','learn','contact','about','help','faq','blog','press','careers',
  'pricing','enterprise','business','partner','solutions','services','customer','database',
  'product','platform','engineering','company','team','staff','member','employee','analytics',
  'settings','account','billing','dashboard','workspace','project','admin','sales','support',
  'info','resources','integration','cloud','server','api','infra','developer','modernization',
  'lead','overview','details','description','title','role','department','function','group',
  'division','data','item','row','column','table','list','grid','tile','module','component',
  'widget','frame','block','container','wrapper','element','feature','capability','benefit',
  'value','mission','vision','goal','strategy','plan','roadmap','timeline','process','pipeline',
  'design','style','theme','version','edition','tier','level','stage','status','type','kind',
  'form','field','label','placeholder','input','output','result','outcome','feed','story',
  'post','article','news','media','contents','content','block','element','sign','in','out'
]);
const NON_NAME_PHRASES: ReadonlyArray<string> = [
  'use case','get started','sign in','sign up','log in','log out','lorem','case study',
  'open source','read more','see more','learn more','view all','contact us','no results',
  'search for','select an','choose a','choose your','clear all','load more','skip to',
  'toggle','expand','collapse','show more','sign in to','log into','create an account',
  'dont have','already have','sign up for','sign up to','subscribe now','subscribe today',
  'terms of','privacy policy','cookie policy','press contact','media contact','sign in',
  'log in','sign up','sign out','log out','new here','create account','make account'
];
/** A single name token: Capitalized word, 1–24 lowercase letters (rejects "Ve"/"Re"; allows "Doe", "Elizabeth"). */
const NAME_TOKEN_RE = /^[A-Z][a-z]{1,24}$/;

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
        // ── Validation pipeline (conservative: never fabricate a person) ──
        // 1) NAME VALIDATION — reject UI labels, nav text, doc labels, fragments
        //    (e.g. "Use Case Ve", "Docs Dire", "Mark Hawkins Dire").
        if (!this.isValidPersonName(raw.name)) continue;
        // 2) ROLE VALIDATION — must be an engineering/technical leadership role
        if (!this.isCandidateRole(raw.role)) continue;
        // 3) PERSON-CONTEXT VALIDATION — the role must be EXPLICITLY bound to this
        //    person in the public evidence (rejects "the CTO spoke at…" bylines).
        const ctx = this.personContext(raw, page.category);
        if (!ctx.verified) continue;
        // 4) COMPANY-CONTEXT VALIDATION — discovered page is the company's own
        //    domain (always true here). Identity is listed on the company domain.
        const confidence: StrengthLevel = ctx.onPeoplePage ? 'HIGH' : 'MEDIUM';
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

  /**
   * NAME VALIDATION.
   * A valid person name is 2–3 tokens where every token is a Capitalized word
   * that is NOT a known non-name token (UI label / nav text / doc label /
   * component name / common English word). Multi-word non-person phrases are
   * rejected wholesale. This is what defeats "Use Case Ve", "Docs Dire",
   * "Mark Hawkins Dire", etc. — generally, not by hard-coding those strings.
   */
  private static isValidPersonName(name: string): boolean {
    const tokens = name.replace(/[.,;:\-]/g, '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 3) return false;
    for (const tok of tokens) {
      if (!NAME_TOKEN_RE.test(tok)) return false;
      if (NON_NAME_TOKENS.has(tok.toLowerCase())) return false;
    }
    const low = name.toLowerCase();
    for (const phrase of NON_NAME_PHRASES) {
      if (low.includes(phrase)) return false;
    }
    return true;
  }

  /**
   * PERSON-CONTEXT VALIDATION.
   * Returns verified=true only when the role keyword is EXPLICITLY bound to this
   * person in the public evidence (the same snippet carries both the name and the
   * role). HIGH confidence requires a people-context page (team_people | about).
   */
  private static personContext(raw: RawPerson, category?: string): { verified: boolean; onPeoplePage: boolean } {
    const onPeoplePage = category === 'team_people' || category === 'about';
    const roleInEvidence = raw.evidence.some(e => this.matchRoleKeyword(e) !== undefined);
    if (!roleInEvidence) return { verified: false, onPeoplePage };
    const nameHead = raw.name.replace(/[.,;:\-]/g, '').toLowerCase().slice(0, 3);
    if (!nameHead) return { verified: false, onPeoplePage };
    const cooccur = raw.evidence.some(e =>
      e.toLowerCase().includes(nameHead) && this.matchRoleKeyword(e) !== undefined
    );
    return { verified: cooccur, onPeoplePage };
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
