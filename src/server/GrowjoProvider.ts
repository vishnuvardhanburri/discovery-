// GrowjoProvider.ts
// -------------------
// Parses a legitimately-obtained Growjo CSV export (or rows from a licensed API)
// into a canonical, provenance-preserved GrowjoCompany list.
//
// IMPORTANT: Growjo is a DATA SOURCE ONLY. Xavira NEVER scrapes the Growjo website,
// bypasses login/CAPTCHA/rate-limits, or guesses platforms. Only CSV/API data
// explicitly supplied by the operator is accepted.

import type { GrowjoCompany } from './DeepTypes';

export interface GrowjoImportResult {
  companies: GrowjoCompany[];
  column_mapping: Record<string, string>;
  total_rows: number;
  duplicate_domains_dropped: number;
  warnings: string[];
}

/** Canonical target key -> list of accepted CSV header aliases (lowercased/trimmed). */
const COLUMN_ALIASES: Record<string, string[]> = {
  company: ['company', 'company_name', 'name'],
  domain: ['domain', 'website', 'url', 'homepage', 'site'],
  industry: ['industry', 'industry_vertical', 'vertical'],
  employee_count: ['employees', 'employee_count', 'num_employees', 'headcount'],
  employee_growth_pct: ['employee_growth_pct', 'employee_growth', 'growth_pct', 'employee_growth_percentage'],
  funding: ['funding', 'total_funding', 'funding_usd'],
  funding_currency: ['funding_currency', 'currency'],
  revenue: ['revenue', 'annual_revenue'],
  revenue_currency: ['revenue_currency'],
  valuation: ['valuation'],
  valuation_currency: ['valuation_currency'],
  primary_person_name: ['person_name', 'person', 'contact_name', 'full_name', 'name'],
  primary_title: ['person_title', 'title', 'contact_title', 'job_title'],
  primary_email: ['email', 'email_address', 'contact_email'],
  primary_phone: ['phone', 'phone_number', 'contact_phone'],
  linkedin_url: ['linkedin_url', 'linkedin', 'linkedin_profile'],
  growjo_url: ['growjo_url', 'source_url', 'lead_url', 'profile_url'],
  source_url: ['source_url', 'growjo_url', 'profile_url'],
};

export class GrowjoProvider {
  /** Parse raw CSV text into provenance-preserved companies. */
  static parseCsv(csvText: string, opts?: { retrievedAt?: string; source_url?: string }): GrowjoImportResult {
    const warnings: string[] = [];
    const rows = parseCsvRows(csvText);
    if (rows.length === 0) {
      return { companies: [], column_mapping: {}, total_rows: 0, duplicate_domains_dropped: 0, warnings: ['CSV had no data rows.'] };
    }
    const header = rows[0].map(h => h.trim().toLowerCase());
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim().length > 0));

    // Build alias -> canonical mapping (first header wins).
    const columnMapping: Record<string, string> = {};
    const canonicalToAlias = new Map<string, string>();
    for (const h of header) {
      let found = false;
      for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
        if (aliases.includes(h) && !canonicalToAlias.has(canonical)) {
          canonicalToAlias.set(canonical, h);
          columnMapping[h] = canonical;
          found = true;
          break;
        }
      }
      if (!found) warnings.push(`Unmapped column "${h}" ignored.`);
    }

    const retrievedAt = opts?.retrievedAt || new Date().toISOString();
    const companies: GrowjoCompany[] = [];
    let dupDropped = 0;
    const seenDomains = new Set<string>();

    for (const row of dataRows) {
      const raw: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) raw[header[i]] = row[i] ? row[i].trim() : '';
      const c = normalizeRow(raw, retrievedAt, opts?.source_url, columnMapping);
      if (!c) continue;
      // Dedupe by canonical domain when available.
      if (c.domain) {
        const canon = canonicalizeDomain(c.domain);
        if (seenDomains.has(canon)) { dupDropped++; continue; }
        seenDomains.add(canon);
      }
      companies.push(c);
    }

    return { companies, column_mapping: columnMapping, total_rows: dataRows.length, duplicate_domains_dropped: dupDropped, warnings };
  }
}

function normalizeRow(raw: Record<string, string>, retrievedAt: string, source_url: string | undefined, columnMapping: Record<string, string>): GrowjoCompany | null {
  const get = (canonical: string): string | null => {
    const alias = Object.keys(columnMapping).find(k => columnMapping[k] === canonical);
    const v = alias ? raw[alias] : null;
    return v && v.trim().length ? v.trim() : null;
  };

  const company = get('company');
  if (!company) return null;

  const domainRaw = get('domain');
  const domain = domainRaw ? canonicalizeDomain(domainRaw) : null;
  const website = domainRaw || null;

  const num = (rawVal: string | null): number | null => {
    if (!rawVal) return null;
    const cleaned = rawVal.replace(/[\$,]/g, '').trim();
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  };

  const personName = get('primary_person_name') || get('company') || null;
  const canonical_name = (get('company') || company || '').trim();

  return {
    source: 'GROWJO',
    company: canonical_name,
    canonical_name,
    domain,
    website,
    industry: get('industry'),
    employee_count: num(get('employee_count')),
    employee_growth_pct: num(get('employee_growth_pct')),
    funding: num(get('funding')),
    funding_currency: get('funding_currency') || 'USD',
    revenue: num(get('revenue')),
    revenue_currency: get('revenue_currency') || 'USD',
    valuation: num(get('valuation')),
    valuation_currency: get('valuation_currency') || 'USD',
    primary_person_name: personName,
    primary_title: get('primary_title'),
    primary_email: get('primary_email'),
    primary_phone: get('primary_phone'),
    linkedin_url: get('linkedin_url'),
    growjo_url: get('growjo_url') || get('source_url') || null,
    source_url: get('source_url') || get('growjo_url') || source_url || null,
    retrieved_at: retrievedAt,
    column_mapping: { ...columnMapping },
    raw,
  };
}

function canonicalizeDomain(input: string): string {
  let d = input.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  d = d.replace(/^www\./, '');
  return d || input;
}

/** Minimal RFC-4180-ish CSV parser (respects quoted fields; no deps). */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let cur = '';
  let field = '';
  let inQuotes = false;
  let row: string[] = [];
  const flushField = () => { row.push(field); field = ''; };
  const flushRow = () => { rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else if (ch === '"') { inQuotes = true; }
    else if (ch === ',') { flushField(); }
    else if (ch === '\n') { flushField(); flushRow(); }
    else if (ch === '\r') { /* tolerate CRLF */ }
    else { field += ch; }
  }
  // flush trailing
  if (field.length > 0 || row.length > 0) { flushField(); flushRow(); }
  return rows;
}
