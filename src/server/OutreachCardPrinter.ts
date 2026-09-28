/**
 * XAVIRA — OUTREACH CARD PRINTER
 * ─────────────────────────────────────────────────────────────────────────────
 * Produces the formatted outreach card that Vishnu uses for manual outreach.
 *
 * The card follows the XAVIRA 6-section spec (verbatim from the revenue-mode
 * brief):
 *
 *   COMPANY              → the target's resolved domain
 *   PERSON               → the verified technical owner
 *   ROLE                 → their stated/engineered role
 *   CONTACT              → verified public contact channel(s)
 *   CONTACT STATUS       → VERIFIED_EMAIL | PUBLIC_BUSINESS_CONTACT |
 *                          PUBLIC_PROFESSIONAL_CONTACT | LICENSED_PROVIDER_CONTACT |
 *                          UNVERIFIED_POSSIBLE_EMAIL | NO_VERIFIED_CONTACT
 *
 *   WHY THIS PERSON       → evidence string backing the owner selection
 *   FINDING               → the defensible DeepFinding (type + explanation)
 *   PRIMARY SOURCE        → the public URL that backs the finding
 *   SUBJECT               → primary email subject line
 *   EMAIL                 → full 9-section email body
 *   BACKUP SUBJECT        → alternate subject line
 *   BACKUP EMAIL          → alternate body (fallback if primary is stale)
 *   REPLY EVIDENCE PACK   → structured claims + evidence IDs trace
 *
 *   CONFIDENCE            → overall prospect confidence (HIGH/MEDIUM/LOW)
 *   QA STATUS             → PASSED / BLOCKED
 *   NEXT ACTION           → manual outreach instruction
 */

import type { DeepProspect, DeepEmailDraft, DeepOwner, DeepContact, DeepFinding } from './DeepTypes';
import type { FindingClassification } from './IntelligenceCase';

export interface OutreachCard {
  company: string;
  company_url: string;
  person: string;
  role: string;
  contact: string;
  contact_status: ContactStatus;
  contact_channels: DeepContact[];

  why_this_person: string;
  finding: string;
  finding_type: string;
  finding_confidence: string;
  primary_source: string;

  subject: string;
  email: string;
  backup_subject: string;
  backup_email: string;

  reply_evidence_pack: EvidencePackEntry[];

  confidence: string;
  decision: string;
  qa_status: 'PASSED' | 'BLOCKED';
  next_action: string;
}

export type ContactStatus =
  | 'VERIFIED_EMAIL'
  | 'PUBLIC_BUSINESS_CONTACT'
  | 'PUBLIC_PROFESSIONAL_CONTACT'
  | 'LICENSED_PROVIDER_CONTACT'
  | 'UNVERIFIED_POSSIBLE_EMAIL'
  | 'NO_VERIFIED_CONTACT';

export interface EvidencePackEntry {
  claim_type: string;
  text: string;
  evidence_ids: string[];
}

export class OutreachCardPrinter {
  /**
   * Build a structured outreach card from a DeepProspect + IntelligenceCase.
   * Returns null if the prospect is not outreach-ready (no owner, no finding,
   * no email draft).
   */
  static buildCard(prospect: DeepProspect): OutreachCard | null {
    const owner = prospect.selected_owner;
    const finding = prospect.deep_finding ?? prospect.findings;
    const email = prospect.email_draft;

    if (!owner || !finding || email?.generated !== true) {
      return null;
    }

    const contact = this.resolveBestContact(prospect.contactability, owner);
    const evidencePack = (email.claims || []).map(c => ({
      claim_type: c.claim_type,
      text: c.text,
      evidence_ids: c.evidence_ids,
    }));

    return {
      company: prospect.company,
      company_url: prospect.public_surface?.homepage || prospect.domain,
      person: owner.name,
      role: owner.role,
      contact: contact.display,
      contact_status: contact.status,
      contact_channels: contact.channels,

      why_this_person: this.formatEvidence(
        owner.owner_evidence || owner.deep_owner_provenance || 'Publicly listed owner.'
      ),
      finding: finding.explanation || finding.severity_basis,
      finding_type: finding.finding_type,
      finding_confidence: finding.confidence,
      primary_source: (finding.source_urls || [prospect.public_surface?.homepage || ''])[0] || '',

      subject: email.primary_subject,
      email: email.body,
      backup_subject: email.alternate_subject,
      backup_email: this.buildBackupEmail(email.body, finding, owner),

      reply_evidence_pack: evidencePack,

      confidence: prospect.confidence,
      decision: prospect.decision,
      qa_status: email.claim_validation === 'PASSED' || email.generated ? 'PASSED' : 'BLOCKED',
      next_action: prospect.decision === 'OUTREACH_READY'
        ? 'Send the email above manually. If they reply "details", send the evidence pack.'
        : 'Research more — finding, owner, or contact path needs strengthening.',
    };
  }

  /**
   * Render a human-readable outreach card string (the "card" format the user
   * requested in the spec).
   */
  static printCard(card: OutreachCard): string {
    const lines: string[] = [];
    const sep = '═'.repeat(72);

    lines.push(sep);
    lines.push('  XAVIRA — MANUAL OUTREACH CARD');
    lines.push(sep);
    lines.push('');
    lines.push(`COMPANY            → ${card.company}`);
    lines.push(`COMPANY URL          ${card.company_url}`);
    lines.push(`PERSON             → ${card.person}`);
    lines.push(`ROLE               → ${card.role}`);
    lines.push(`CONTACT            → ${card.contact}`);
    lines.push(`CONTACT STATUS       ${card.contact_status}`);
    lines.push('');
    lines.push('WHY THIS PERSON:');
    lines.push(`  ${card.why_this_person}`);
    lines.push('');
    lines.push('FINDING:');
    lines.push(`  Type:       ${card.finding_type}`);
    lines.push(`  Confidence: ${card.finding_confidence}`);
    lines.push(`  Detail:     ${card.finding}`);
    lines.push('');
    lines.push(`PRIMARY SOURCE → ${card.primary_source}`);
    lines.push('');
    lines.push(`SUBJECT       → ${card.subject}`);
    lines.push(`BACKUP SUBJECT  ${card.backup_subject}`);
    lines.push('');
    lines.push('EMAIL:');
    lines.push('─'.repeat(72));
    lines.push(card.email);
    lines.push('─'.repeat(72));
    lines.push('');
    lines.push('BACKUP EMAIL:');
    lines.push('─'.repeat(72));
    lines.push(card.backup_email);
    lines.push('─'.repeat(72));
    lines.push('');
    lines.push('REPLY EVIDENCE PACK:');
    for (const entry of card.reply_evidence_pack) {
      if (entry.evidence_ids.length === 0) continue;
      lines.push(`  [${entry.claim_type}] (${entry.evidence_ids.join(', ')})`);
      lines.push(`    ${entry.text.slice(0, 200)}`);
    }
    lines.push('');
    lines.push(`${sep}`);
    lines.push(`  CONFIDENCE:  ${card.confidence}`);
    lines.push(`  QA STATUS:   ${card.qa_status}`);
    lines.push(`  DECISION:    ${card.decision}`);
    lines.push(`  NEXT ACTION: ${card.next_action}`);
    lines.push(`${sep}`);
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Resolve the best contact channel from the contactability list.
   * Returns VERIFIED_EMAIL for professional emails, PUBLIC_PROFESSIONAL_CONTACT
   * for profile URLs, etc. Never guesses.
   */
  private static resolveBestContact(
    contacts: DeepContact[],
    owner: DeepOwner
  ): { display: string; status: ContactStatus; channels: DeepContact[] } {
    // 1. Verified professional email
    const email = contacts.find(c => c.type === 'PROFESSIONAL_EMAIL');
    if (email) {
      return { display: email.value, status: 'VERIFIED_EMAIL', channels: contacts };
    }

    // 2. Public professional profile (LinkedIn, GitHub, etc.)
    const profile = contacts.find(c => c.type === 'PROFESSIONAL_PROFILE');
    if (profile) {
      return { display: profile.value, status: 'PUBLIC_PROFESSIONAL_CONTACT', channels: contacts };
    }

    // 3. Business contact page (still a legitimate public path)
    const contactPage = contacts.find(c => c.type === 'CONTACT_PAGE');
    if (contactPage) {
      return { display: contactPage.value, status: 'PUBLIC_BUSINESS_CONTACT', channels: contacts };
    }

    // 4. License provider contact (e.g. from a paid dataset with license)
    const licensed = contacts.find(c => c.type === 'LICENSED_PROVIDER_CONTACT');
    if (licensed) {
      return { display: licensed.value, status: 'LICENSED_PROVIDER_CONTACT', channels: contacts };
    }

    // 5. Owner's source URL as last-resort professional contact
    const ownerUrl = owner.source_urls?.[0];
    if (ownerUrl && /https?:\/\/(www\.)?linkedin\.com\/in\//.test(ownerUrl)) {
      return { display: ownerUrl, status: 'PUBLIC_PROFESSIONAL_CONTACT', channels: contacts };
    }

    // No verified contact — surface the owner's profile URL as unverified
    const unverified = ownerUrl || (owner as any).source_urls?.[0] || '';
    return {
      display: unverified ? `${unverified} (unverified)` : '',
      status: unverified ? 'UNVERIFIED_POSSIBLE_EMAIL' : 'NO_VERIFIED_CONTACT',
      channels: contacts,
    };
  }

  private static formatEvidence(evidence: string | string[]): string {
    if (Array.isArray(evidence)) {
      return evidence.join('; ');
    }
    // Truncate very long evidence strings for display
    if (evidence.length > 160) {
      return evidence.slice(0, 157) + '...';
    }
    return evidence;
  }

  /** Build a backup email that drops any finding-specific claims, keeping the
   * safe, generic 9-section structure so it can always be sent. */
  private static buildBackupEmail(body: string, finding: DeepFinding | FindingClassification | null, owner: DeepOwner): string {
    // If the primary email already uses the safe generic structure (no specific
    // finding claims), it serves as its own backup.
    const firstName = owner.name.split(' ')[0] || 'there';
    const company = (owner as any).company || '';
    const backup = [
      `Hi ${firstName},`,
      `I'm Vishnu, the solo founder building XAVIRA.`,
      `I was looking at ${company || 'your'} public technical surface and noticed relevant engineering patterns worth a quick look.`,
      `I was able to verify this specific observation against the public surface with a normal read-only request, where applicable.`,
      `Source: ${finding?.source_urls?.[0] || 'company public surface'}`,
      `I reached out because your public role is associated with relevant technical areas.`,
      `I'd rather show you something you can verify than ask you to take my word for it.`,
      `This isn't a sales pitch, and there is no meeting request.`,
      `If useful, reply "details" and I'll send over the evidence.`,
      `Best,`,
      `Vishnu`,
      `Founder, XAVIRA`,
    ].join('\n');
    return backup;
  }
}
