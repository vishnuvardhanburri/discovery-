/**
 * XAVIRA — CONTACTABILITY FINDER (additive)
 * ─────────────────────────────────────────────────────────────────────────────
 * Captures ONLY professional contact information from two provenance-trusted
 * channels:
 *
 *   1. Growjo licensed lead data — PROFESSIONAL_EMAIL / LINKEDIN / PHONE / PROFILE
 *      channels are extracted from the operator-supplied GrowjoCompany record
 *      via GrowjoProvider.extractContacts. Only fields explicitly present in
 *      the licensed record are captured.
 *   2. Public company surface — mailto: addresses, tel: links, public
 *      profile links (LinkedIn/Twitter/GitHub), and contact/press pages
 *      discovered on the company's own domain.
 *
 * Channel types produced: PROFESSIONAL_EMAIL, PROFILE, PHONE, LINKEDIN,
 * PROFESSIONAL_PROFILE, PRESS_CONTACT, CONTACT_PAGE.
 *
 * It NEVER guesses, constructs, or derives an email address. A contact value
 * must be explicitly published (mailto:/tel: on a page) or explicitly licensed
 * (Growjo). Role accounts (info@, sales@, …) are always filtered out.
 */

import type { DeepContact, ContactConfidence, GrowjoCompany } from './DeepTypes';
import type { DiscoveredPage } from './IntelligenceCase';
import { GrowjoProvider } from './GrowjoProvider';

const PROFILE_HANDLE_RE = /href=["'](?:https?:)?\/\/(?:www\.)?(?:linkedin\.com\/in|twitter\.com|x\.com)\/([A-Za-z0-9._-]+)\/??[^"']*["']/i;
const MAIlTO_RE = /href=["']mailto:([^"']+)["']/i;
const TEL_RE = /^tel:(.+)/i;
const CONTACT_PAGE_RE = /\/(?:contact|press|media|contact-us)(?:[\/?#"'-]|$)/i;

function confidenceFor(type: DeepContact['type'], value: string): ContactConfidence {
  if (type === 'PROFESSIONAL_EMAIL') return 'HIGH';
  if (type === 'PROFESSIONAL_PROFILE' || type === 'PROFILE') {
    // A real handle /in/<handle> or @<handle> path is high; a share/intent link is medium.
    return /@|linkedin\.com\/in\//i.test(value) ? 'HIGH' : 'MEDIUM';
  }
  if (type === 'LINKEDIN') return 'HIGH';
  if (type === 'PHONE') return 'HIGH';
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
    onProgress?: (stage: string, message: string) => void,
    growjoData?: GrowjoCompany | null
  ): DeepContact[] {
    const contacts: DeepContact[] = [];
    const seen = new Set<string>();

    const add = (c: DeepContact) => {
      const key = `${c.type}:${c.value}`;
      if (seen.has(key)) return;
      seen.add(key);
      contacts.push(c);
    };

    // ── Growjo-licensed contact channels (never guessed — only licensed data) ──
    // PROFESSIONAL_EMAIL / LINKEDIN / PHONE / PROFILE are captured ONLY when the
    // Growjo lead record explicitly provides them. Role accounts are filtered out.
    if (growjoData) {
      const growjoContact = GrowjoProvider.extractContacts(growjoData);
      const gSrc = resolveGrowjoSource(growjoData);
      for (const channel of growjoContact.channels) {
        if (channel.type === 'PROFESSIONAL_EMAIL') {
          if (!isRoleAccount(channel.value) && looksProfessional(channel.value)) {
            add({ type: 'PROFESSIONAL_EMAIL', value: channel.value, source_url: gSrc, confidence: 'HIGH', note: `Growjo licensed email (${channel.confidence_source}).` });
          }
        } else {
          add({ type: channel.type, value: channel.value, source_url: gSrc, confidence: 'HIGH', note: `Growjo licensed contact (${channel.confidence_source}).` });
        }
      }
    }

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

        // tel: links — public phone numbers published on the company page.
        const telMatch = TEL_RE.exec(href);
        if (telMatch && telMatch[1]) {
          const phone = telMatch[1].trim();
          if (/\d/.test(phone)) {
            add({ type: 'PHONE', value: phone, source_url: page.url, confidence: confidenceFor('PHONE', phone), note: 'Public phone number link (tel:) on company page.' });
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
        if (CONTACT_PAGE_RE.test(href)) {
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
      c.type === 'PROFILE' ||
      c.type === 'LINKEDIN' ||
      c.type === 'PHONE'
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

/** Resolve the attributable public source URL for a Growjo lead record. */
function resolveGrowjoSource(company: GrowjoCompany): string {
  return company.source_url || company.growjo_url || company.website || '';
}
