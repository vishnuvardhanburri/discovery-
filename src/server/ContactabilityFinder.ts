/**
 * XAVIRA — CONTACTABILITY FINDER (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures ONLY professional contact information that is publicly available on
 * the discovered company surface: public profile links (LinkedIn/Twitter/GitHub),
 * mailto: addresses, and contact/press pages.
 *
 * It NEVER guesses, constructs, or derives an email address. Contactability is
 * a hard gate for the deep funnel (an outreach angle needs a usable channel).
 */

import type { DeepContact, ContactConfidence } from './DeepTypes';
import type { DiscoveredPage } from './IntelligenceCase';

const PROFILE_HANDLE_RE = /href=["'](?:https?:)?\/\/(?:www\.)?(?:linkedin\.com\/in|twitter\.com|x\.com)\/([A-Za-z0-9._-]+)\/??[^"']*["']/i;
const MAIlTO_RE = /href=["']mailto:([^"']+)["']/i;
const CONTACT_PAGE_RE = /href=["']([^"']*(?:\/contact|\/press|\/media|\/contact-us)(?:\/|$|\?)["'])/i;

function confidenceFor(type: DeepContact['type'], value: string): ContactConfidence {
  if (type === 'PROFESSIONAL_EMAIL') return 'HIGH';
  if (type === 'PROFESSIONAL_PROFILE') {
    // A real handle /in/<handle> or @<handle> path is high; a share/intent link is medium.
    return /@|linkedIn\.com\/in\//i.test(value) ? 'HIGH' : 'MEDIUM';
  }
  if (type === 'PRESS_CONTACT') return 'MEDIUM';
  return 'LOW';
}

/** Extract href="…" values from HTML. */
function extractHrefs(html: string): string[] {
  const out: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** Heuristic: skip obviously non-personal / role accounts. */
function isRoleAccount(email: string): boolean {
  const local = email.split('@')[0].toLowerCase();
  return /(?:^info$|^sales$|^support$|^hello$|^team$|support-|helpdesk|noreply|no-reply)/.test(local);
}

export class ContactabilityFinder {
  static find(
    pages: DiscoveredPage[],
    htmlByUrl: Map<string, string>,
    onProgress?: (stage: string, message: string) => void
  ): DeepContact[] {
    const contacts: DeepContact[] = [];
    const seen = new Set<string>();

    const add = (c: DeepContact) => {
      const key = `${c.type}:${c.value}`;
      if (seen.has(key)) return;
      seen.add(key);
      contacts.push(c);
    };

    for (const page of pages) {
      const html = htmlByUrl.get(page.url);
      if (!html) continue;
      const hrefs = extractHrefs(html);

      for (const href of hrefs) {
        // Mailto links first — they are not URLs and must NOT be skipped by the
        // URL normalisation step (which returns '' for the mailto scheme).
        const mailto = MAIlTO_RE.exec(`href="${href}"`);
        if (mailto && mailto[1]) {
          const addr = mailto[1].split('?')[0];
          if (!isRoleAccount(addr) && looksProfessional(addr)) {
            add({ type: 'PROFESSIONAL_EMAIL', value: addr, source_url: page.url, confidence: 'HIGH', note: 'Public mailto: link on company page.' });
          }
          continue;
        }

        const abs = normalizeHref(href, page.url);
        if (!abs) continue;

        // Named public profile links (real handles, not share/buttons).
        const profile = PROFILE_HANDLE_RE.exec(`href="${href}"`);
        if (profile) {
          add({ type: 'PROFESSIONAL_PROFILE', value: abs, source_url: page.url, confidence: confidenceFor('PROFESSIONAL_PROFILE', abs), note: 'Public professional profile link.' });
          continue;
        }

        // Generic press / media contact page.
        if (CONTACT_PAGE_RE.test(`href="${href}"`)) {
          add({ type: 'CONTACT_PAGE', value: abs, source_url: page.url, confidence: 'MEDIUM', note: 'Public contact/press page link.' });
          continue;
        }
      }
    }

    onProgress?.('contactability', `Captured ${contacts.length} public professional contact channel(s).`);
    return contacts;
  }

  /** A usable professional contact path exists. */
  static hasUsableChannel(contacts: DeepContact[]): boolean {
    return contacts.some(c =>
      c.type === 'PROFESSIONAL_EMAIL' ||
      c.type === 'PROFESSIONAL_PROFILE' ||
      c.type === 'PRESS_CONTACT'
    );
  }
}

function normalizeHref(href: string, baseUrl: string): string {
  try {
    if (href.startsWith('mailto:')) return '';
    return new URL(href, baseUrl).href;
  } catch {
    return '';
  }
}

function looksProfessional(email: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email);
}
