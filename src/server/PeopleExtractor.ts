/**
 * XAVIRA PEOPLE EXTRACTION (RESET)
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts publicly listed professional identities from discovered company
 * pages and produces evidence-backed OwnerCandidate objects.
 *
 * Architecture:
 * RAW_HTML -> Visible Text Pipeline -> Token-Bound Role Match -> Name Candidate
 */

import {
  CANDIDATE_ROLES,
  OwnerCandidate,
  DiscoveredPage,
  StrengthLevel,
  RawPerson,
  ExtractionMethod
} from './IntelligenceCase';

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
  'post','article','news','media','contents','content','sign','in','out',
  'pricing','plan'
]);;
const NON_NAME_PHRASES: ReadonlyArray<string> = [
  'use case','get started','sign in','sign up','log in','log out','lorem','case study',
  'open source','read more','see more','learn more','view all','contact us','no results',
  'search for','select an','choose a','choose your','clear all','load more','skip to',
  'toggle','expand','collapse','show more','sign in to','log into','create an account',
  'dont have','already have','sign up for','sign up to','subscribe now','subscribe today',
  'terms of','privacy policy','cookie policy','press contact','media contact','sign in',
  'log in','sign up','sign out','log out','new here','create account','make account',
  'ranked','shortlisted','best public','public sector','top','leading',
  'recognised','recognized','fastest growing','award winner','nominee',
  'tussell tech','ft1000','financial times','statista',
  'ecosystem','education sector','technology supplier','tech supplier',
];
const NAME_TOKEN_RE = /^[A-Z][a-z]{1,24}$/;

export interface PeopleExtractorOptions {
  company?: string;
  technicalAreaHints?: string[];
}

export class PeopleExtractor {
  static extractFromPages(pages: any[], htmlByUrl: Map<string, string>, options: PeopleExtractorOptions = {}): any[] {
    const candidates: any[] = [];
    const company = options.company ?? '';

    for (const page of pages) {
      if (!page.category || page.category === 'other' || page.category === 'homepage') continue;
      const shouldExtract = this.shouldExtractFromCategory(page.category);
      if (!shouldExtract) continue;

      const html = htmlByUrl.get(page.url);
      if (!html) continue;
      const raws = this.extractPeopleFromHtml(html, page.url, page.category);
      for (const raw of raws) {
        if (!this.isValidPersonName(raw.name)) continue;
        if (!this.isCandidateRole(raw.role)) continue;
        const ctx = this.personContext(raw, page.category);
        if (!ctx.verified) continue;
        const confidence: any = this.confidenceForCategory(page.category);
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
    return this.dedupe(candidates);
  }

  static prepareVisibleText(html: string): string {
    // 1. Remove non-text elements strictly
    let text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                   .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                   .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
                   .replace(/<!--[\s\S]*?-->/gi, ' ');

    // 2. Inject structural breaks
    const structuralTags = /<(div|li|article|section|header|footer|p|tr|br)[^>]*>/gi;
    text = text.replace(structuralTags, ' [BREAK] ');

    // 3. Strip all remaining tags (this removes attributes, class names, etc)
    text = text.replace(/<[^>]+>/g, ' ');

    // 4. Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
  }

  static extractPeopleFromHtml(html: string, sourceUrl: string, category?: string): RawPerson[] {
    const results: RawPerson[] = [];

    // LAYER 2: JSON-LD
    const ldPeople = this.extractFromJsonLd(html);
    for (const p of ldPeople) {
      results.push({ ...p, extraction_method: 'JSON_LD' });
    }

    // LAYER 3: Embedded JSON
    const embeddedPeople = this.extractFromEmbeddedJson(html);
    for (const p of embeddedPeople) {
      results.push({ ...p, extraction_method: 'EMBEDDED_JSON' });
    }

    // LAYER 1: Visible HTML (Proximity-based)
    const visibleText = this.prepareVisibleText(html);
    const tokens = visibleText.split(/\s+/).filter(Boolean);

    for (let i = 0; i < tokens.length; i++) {
      const roleMatch = this.matchRoleKeyword(tokens.slice(i, i + 5).join(' '));
      if (!roleMatch) continue;

      // We search in a window around the role.
      // To handle structural breaks, we include [BREAK] tokens in the window
      const windowStart = Math.max(0, i - 10);
      const windowEnd = Math.min(tokens.length, i + 15);
      const contextWindow = tokens.slice(windowStart, windowEnd).join(' ');

      // IMPORTANT: We must treat [BREAK] as a delimiter when extracting name tokens,
      // but we allow it to exist in the window for proximity search.
      const name = this.extractNameFromContext(contextWindow, roleMatch);
      if (name) {
        const evidence = this.sentenceAround(html, contextWindow);
        results.push({
          name,
          role: roleMatch,
          source_url: sourceUrl,
          evidence: [evidence],
          extraction_method: 'STATIC_HTML'
        });
      }
    }

    // Deduplicate results to prevent multiple matches for the same person/role
    return results.filter((p, index) =>
      index === results.findIndex(r => r.name === p.name && r.role === p.role)
    );
  }

  static extractNameFromContext(context: string, role: string): string | undefined {
    // Remove the matched role AND common expanded variants to prevent "Officer Jane Doe"
    const roleVariants = [
      role,
      'Chief Technology Officer', 'Chief Product Officer',
      'VP of Engineering', 'VP of Product',
      'Director of Engineering', 'Director of Platform', 'Director of Infrastructure',
      'Head of Engineering', 'Head of Platform', 'Head of Infrastructure', 'Head of Security'
    ];

    let cleanedContext = context;
    for (const variant of roleVariants) {
      cleanedContext = cleanedContext.replace(new RegExp(`\\b${variant}\\b`, 'gi'), ' ');
    }

    const tokens = cleanedContext.split(/[\s,;\-]+|\[BREAK\]/).map(t => t.trim()).filter(Boolean);
    return this.grabNameTokens(tokens);
  }

  static extractFromEmbeddedJson(html: string): RawPerson[] {
    const results: RawPerson[] = [];
    const patterns = [
      { name: 'Next.js', regex: /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/gi },
      { name: 'InitialState', regex: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/gi },
      { name: 'AppStore', regex: /window\.__APP_STATE__\s*=\s*({[\s\S]*?});/gi },
    ];

    for (const { name, regex } of patterns) {
      let m: RegExpExecArray | null;
      while ((m = regex.exec(html)) !== null) {
        try {
          const json = JSON.parse(m[1]);
          this.searchJsonForPeople(json, (person) => {
            // Humanity Heuristic: Validate name before promoting
            if (this.isValidPersonName(person.name)) {
              results.push({
                name: person.name,
                role: person.role || 'Employee',
                source_url: '',
                evidence: [`Embedded ${name} data: ${person.name} is listed as ${person.role || 'Employee'}`],
              });
            }
          });
        } catch { /* ignore malformed JSON */ }
      }
    }
    return results;
  }

  private static searchJsonForPeople(obj: any, callback: (p: { name: string; role: string }) => void): void {
    if (!obj || typeof obj !== 'object') return;

    if (obj.name && (obj.role || obj.jobTitle || obj.position)) {
      callback({
        name: obj.name,
        role: obj.role || obj.jobTitle || obj.position,
      });
    }

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (typeof val === 'object' && val !== null) {
          this.searchJsonForPeople(val, callback);
        }
      }
    }
  }

  static extractFromJsonLd(html: string): RawPerson[] {
    const results: RawPerson[] = [];
    const ldRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;

    while ((m = ldRe.exec(html)) !== null) {
      try {
        const json = JSON.parse(m[1]);
        const data = this.flattenJsonLd(json);

        for (const item of data) {
          if (item['@type'] === 'Person') {
            const name = item['name'];
            const role = item['jobTitle'] || item['position'];
            if (name && role) {
              results.push({
                name,
                role,
                source_url: '',
                evidence: [`JSON-LD: ${name} is listed as ${role}`],
              });
            }
          } else if (item['@type'] === 'Organization' && item['employee']) {
            const employees = Array.isArray(item['employee']) ? item['employee'] : [item['employee']];
            for (const emp of employees) {
              const name = typeof emp === 'string' ? emp : emp['name'];
              const role = emp['jobTitle'] || emp['position'];
              // Strictly require role for Organization employees to avoid broadness
              if (name && role) {
                results.push({
                  name,
                  role,
                  source_url: '',
                  evidence: [`JSON-LD: ${name} listed as ${role} of ${item['name']}`],
                });
              }
            }
          }
        }
      } catch { /* ignore malformed JSON */ }
    }
    return results;
  }

  private static flattenJsonLd(json: any): any[] {
    if (Array.isArray(json)) return json;
    if (json['@graph'] && Array.isArray(json['@graph'])) return json['@graph'];
    return [json];
  }

  static targetedExtract(html: string, keywords: string[]): RawPerson[] {
    const cleaned = this.prepareVisibleText(html);
    const results: RawPerson[] = [];
    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      const lines = this.textLines(cleaned);
      for (const line of lines) {
        if (line.toLowerCase().includes(kwLower)) {
          const role = this.matchRoleKeyword(line);
          if (!role) continue;
          const name = this.extractNameFromLine(line, role);
          if (!name) continue;
          if (!results.some(r => r.name === name && r.role === role)) {
            results.push({
              name,
              role,
              source_url: '',
              evidence: [line],
              extraction_method: 'STATIC_HTML'
            });
          }
        }
      }
    }
    return results;
  }

  static shouldExtractFromCategory(category?: string): boolean {
    return ['team_people', 'about', 'engineering', 'blog', 'docs', 'careers', 'hiring'].includes(category || '');
  }

  static confidenceForCategory(category?: string): any {
    if (category === 'team_people' || category === 'about') return 'HIGH';
    if (category === 'engineering' || category === 'blog' || category === 'docs') return 'MEDIUM';
    return 'LOW';
  }

  static isCandidateRole(role: string): boolean {
    return (CANDIDATE_ROLES as any).some(r => r.toLowerCase() === role.toLowerCase());
  }

  static matchRoleKeyword(text: string): string | undefined {
    const t = text.toLowerCase();
    const ordered = [
      'vp engineering', 'vp of engineering', 'vp product', 'vp of product',
      'director of engineering', 'director of platform', 'director of infrastructure',
      'head of engineering', 'head of platform', 'head of infrastructure', 'head of security',
      'platform engineering lead', 'infrastructure lead', 'sre lead',
      'security lead', 'engineering manager', 'staff engineer', 'principal engineer',
      'cto', 'cpo', 'technical founder', 'co-founder', 'cofounder',
      'chief technology officer', 'chief product officer'
    ];
    for (const kw of ordered) {
      // Use word boundaries to prevent substring matches (e.g. "customer" -> "CTO")
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(t)) return this.normaliseRole(kw);
    }
    return undefined;
  }

  static normaliseRole(kw: string): string {
    const map: Record<string, string> = {
      'vp engineering': 'VP Engineering', 'vp of engineering': 'VP Engineering',
      'vp product': 'VP Product', 'vp of product': 'VP Product',
      'director of engineering': 'Director of Engineering',
      'director of platform': 'Director of Platform',
      'director of infrastructure': 'Director of Infrastructure',
      'head of engineering': 'Head of Engineering', 'head of platform': 'Head of Platform',
      'head of infrastructure': 'Head of Infrastructure', 'head of security': 'Head of Security',
      'platform engineering lead': 'Platform Engineering Lead',
      'infrastructure lead': 'Infrastructure Lead',
      'sre lead': 'SRE Lead',
      'security lead': 'Security Lead', 'engineering manager': 'Engineering Manager',
      'staff engineer': 'Staff Engineer', 'principal engineer': 'Principal Engineer',
      'cto': 'CTO', 'cpo': 'CPO', 'chief technology officer': 'CTO', 'chief product officer': 'CPO',
      'technical founder': 'Technical Founder', 'co-founder': 'Co-Founder', 'cofounder': 'Co-Founder'
    };
    return map[kw] || kw;
  }

  static isValidPersonName(name: string): boolean {
    const tokens = name.replace(/[.,;:\-]/g, '').trim().split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.length > 4) return false;
    for (const tok of tokens) {
      if (!/^[A-Z][a-zA-ZÀ-ſ'-]{0,24}$/.test(tok)) return false;
      if (NON_NAME_TOKENS.has(tok.toLowerCase())) return false;
    }
    const low = name.toLowerCase();
    for (const phrase of NON_NAME_PHRASES) {
      if (low.includes(phrase)) return false;
    }
    return true;
  }

  static extractNameFromLine(line: string, role: string): string | undefined {
    const normalised = line.replace(/[—–−‐‑]/g, ' ');
    const idx = normalised.toLowerCase().indexOf(role.toLowerCase());
    if (idx < 0) return undefined;
    const before = normalised.slice(0, idx);
    const tokens = before.trim().split(/[\s,;\-]+/).map(t => t.trim()).filter(Boolean);
    const name = this.grabNameTokens(tokens);
    return name;
  }

  static grabNameTokens(tokens: string[]): string | undefined {
    const picked: string[] = [];
    for (let i = tokens.length - 1; i >= 0; i--) {
      const t = tokens[i].replace(/[.,;:\-]/g, '');
      if (!t) continue;

      const lowT = t.toLowerCase();
      if (NON_NAME_TOKENS.has(lowT)) {
        return undefined; // Hard reject if we hit a known non-name token
      }

      if (!/^[A-Z][a-zA-ZÀ-ſ'-]+$/.test(t)) {
        break;
      }
      picked.unshift(t);
      if (picked.length >= 3) break;
    }
    if (picked.length >= 2 && picked.length <= 4) {
      return picked.join(' ');
    }
    return undefined;
  }

  static extractNameFromCard(card: string): string | undefined {
    const alt = /alt=["']([^"']*)["']/i.exec(card);
    if (alt) {
      const name = this.grabNameTokens(alt[1].split(/\s+/).map(t => t.replace(/[.,;]/g, '')));
      if (name) return name;
    }
    const tokens = this.stripTags(card).split(/[\s,;\-]+/).filter(Boolean);
    return this.grabNameTokens(tokens);
  }

  static extractCards(html: string): string[] {
    const regex = /<(div|li)[^>]*class=["'][^"']*(team|member|staff|leadership|person|people-profile|profile)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(html)) !== null) {
      out.push(m[0]);
    }
    return out;
  }

  static extractAuthorBylines(html: string, sourceUrl: string): RawPerson[] {
    const out: RawPerson[] = [];
    const bylineRe = /<a[^>]*rel=["']author["'][^>]*>(.*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = bylineRe.exec(html)) !== null) {
      const name = this.grabNameTokens(this.stripTags(m[1]).split(/\s+/).map(t => t.replace(/[.,;]/g, '')));
      if (name) {
        const surrounding = this.sentenceAround(html, m[1]);
        const role = this.matchRoleKeyword(surrounding) || 'Author';
        out.push({ name, role, source_url: sourceUrl, evidence: [surrounding] });
      }
    }
    return out;
  }

  static extractGithubIdentities(html: string, sourceUrl: string, category?: string): RawPerson[] {
    const out: RawPerson[] = [];
    const githubRe = /github\.com\/([A-Za-z0-9][A-Za-z0-9_-]{1,38})(?:\/|$|[?"'\s])/gi;
    let m: RegExpExecArray | null;
    while ((m = githubRe.exec(html)) !== null) {
      const username = m[1];
      if (!username) continue;
      const start = Math.max(0, m.index - 200);
      const end = Math.min(html.length, m.index + username.length + 200);
      const surrounding = this.stripTags(html.slice(start, end));
      const role = this.matchRoleKeyword(surrounding);
      if (role && this.isCandidateRole(role)) {
        out.push({
          name: this.githubDisplayName(username, surrounding),
          role,
          source_url: sourceUrl,
          evidence: [surrounding.slice(0, 300)]
        });
      }
    }
    return out;
  }

  static githubDisplayName(username: string, context: string): string {
    const normalised = context.replace(/[—–−‐‑]/g, ' ');
    const tokens = normalised.replace(/[.,;:\-]/g, '').trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i <= tokens.length - 2; i++) {
      const window = tokens.slice(i, i + 3);
      if (window.length >= 3) {
        const three = window.slice(0, 3).join(' ');
        if (this.isValidPersonName(three)) return three;
      }
      if (window.length >= 2) {
        const two = window.slice(0, 2).join(' ');
        if (this.isValidPersonName(two)) return two;
      }
    }
    const display = username.replace(/[_-]/g, ' ');
    const tokens2 = display.split(/\s+/);
    if (tokens2.length >= 2) {
      const capitalised = tokens2.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(' ');
      if (this.isValidPersonName(capitalised)) return capitalised;
    }
    return username;
  }

  static stripScripts(html: string): string {
    return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  }

  static textLines(html: string): string {
    const block = html.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|section|article|tr)[^>]*>/gi, '\n');
    const noTags = block.replace(/<[^>]+>/g, ' ');
    return noTags.split(/\n+/).map(s => s.trim()).filter(s => s.length > 3);
  }

  static stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  static sentences(html: string): string[] {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  static sentenceAround(_html: string, snippet: string): string {
    const lines = this.sentences(_html);
    const found = lines.find(l => l.toLowerCase().includes(snippet.toLowerCase().slice(0, 20)));
    return this.stripTags(found || snippet).slice(0, 300);
  }

  static personContext(raw: RawPerson, category?: string): { verified: boolean; onPeoplePage: boolean } {
    const onPeoplePage = category === 'team_people' || category === 'about';
    const nameTokens = raw.name.replace(/[.,;:\-]/g, '').split(/\s+/).filter(Boolean);
    if (nameTokens.length < 2) return { verified: false, onPeoplePage };
    const nameHead = nameTokens[0].toLowerCase().slice(0, 3);
    if (!nameHead) return { verified: false, onPeoplePage };

    const cooccur = raw.evidence.some(e => {
      const text = e.toLowerCase();
      const nameIdx = text.indexOf(nameHead);
      if (nameIdx === -1) return false;
      const roleKwNorm = this.matchRoleKeyword(e);
      if (!roleKwNorm) return false;
      const roleLower = roleKwNorm.toLowerCase();
      let roleIdx = text.indexOf(roleLower);
      if (roleIdx === -1) {
        const rawMatch = CANDIDATE_ROLES.find(r => text.includes(r.toLowerCase()));
        if (!rawMatch) return false;
        roleIdx = text.indexOf(rawMatch.toLowerCase());
      }
      const lo = Math.min(nameIdx, roleIdx);
      const hi = Math.max(nameIdx, roleIdx) + (roleIdx >= 0 ? roleLower.length : 0);
      const between = text.slice(lo, hi).split(/\s+/).filter(Boolean);
      return between.length <= 12;
    });
    return { verified: cooccur, onPeoplePage };
  }

  static cleanName(name: string): string {
    return name.trim().replace(/\s+/g, ' ');
  }

  static dedupe(candidates: any[]): any[] {
    const best = new Map<string, any>();
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

  static relationshipToArea(role: string, hints: string[] = []): string {
    if (!hints.length) return 'General Engineering';
    const roleLower = role.toLowerCase();
    for (const hint of hints) {
      if (roleLower.includes(hint.toLowerCase())) return `Specialist: ${hint}`;
    }
    return 'Adjacent Engineering';
  }
}