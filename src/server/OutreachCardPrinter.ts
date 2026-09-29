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

import type { DeepProspect, DeepEmailDraft, DeepOwner, DeepContact, DeepFinding, DiagnosticOpportunity } from './DeepTypes';
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

  technical_area: string;
  recommended_responsibility: string;
  role_search_hints: string[];
  why_it_matters: string;
  search_hints: string[];
  diagnostic_questions: string[];
  diagnostic_scope: string[];
  implementation_hypothesis: string[];
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

/** Generate a list of possible £45K Scale/Pod implementation areas from the
 * diagnostic opportunity. These are HYPOTHESES, not certainties — they become
 * actionable only AFTER the £15K diagnostic establishes actual scope. */
function diagnosticImplementationHypothesis(diag: DiagnosticOpportunity): string[] {
  return [
    'Subsystem rearchitecture based on diagnostic findings',
    'Queue/caching improvements validated by diagnostic',
    'Database query/structure optimization per scope',
    'Service decomposition where diagnostic identifies boundary issues',
    'Reliability engineering (SRE practices) for repeated failure modes',
    'Infrastructure tuning aligned to diagnostic recommendations',
    'Performance remediation targeting measured bottlenecks',
    'Observability implementation in gaps identified by diagnostic',
  ];
}

export class OutreachCardPrinter {
  /**
   * Build a structured outreach card from a DeepProspect + IntelligenceCase.
   *
   * COMMERCIAL-INTELLIGENCE MODEL: The card is PROBLEM-FIRST.
   * A person/email is NOT required — the human operator handles contact manually.
   * The card is produced whenever a defensible finding exists, regardless of
   * whether an owner or contact was identified.
   */
  static buildCard(prospect: DeepProspect): OutreachCard | null {
    const finding = prospect.deep_finding;
    const email = prospect.email_draft;
    const diag = prospect.diagnostic_opportunity;
    const owner = prospect.selected_owner;

    // Card is produced when there is a defensible deep finding (commercial opportunity ready).
    // Contactability is optional — the human handles it manually.
    // Non-defensible findings (DOCUMENTED_*, GENERIC_*) don't produce cards.
    if (!finding) {
      return null;
    }
    const isDefensible = finding.confidence !== 'LOW'
      && !['DOCUMENTED_SECURITY_POSTURE', 'DOCUMENTED_SCALING_CONSTRAINT', 'DOCUMENTED_INCIDENT',
          'DOCUMENTED_ENGINEERING_FAILURE', 'GENERIC_ENGINEERING_ARTICLE',
          'UNEXPECTED_PUBLIC_BEHAVIOR', 'CONFLICTING_EVIDENCE'].includes(finding.finding_type);
    if (!isDefensible) {
      return null;
    }

    const contact = this.resolveBestContact(prospect.contactability, owner);
    const evidencePack = (email?.claims || []).map(c => ({
      claim_type: c.claim_type,
      text: c.text,
      evidence_ids: c.evidence_ids,
    }));

    return {
      company: prospect.company,
      company_url: prospect.public_surface?.homepage || prospect.domain,
      person: owner?.name || '',
      role: owner?.role || '',
      contact: contact.display,
      contact_status: contact.status,
      contact_channels: contact.channels,

      why_this_person: owner?.owner_evidence?.[0] || owner?.deep_owner_provenance ||
        'No verified owner identified — human operator to handle contact.',
      finding: finding.explanation || finding.severity_basis,
      finding_type: finding.finding_type,
      finding_confidence: (finding as DeepFinding).confidence || 'UNKNOWN',
      primary_source: (finding.source_urls || [prospect.public_surface?.homepage || ''])[0] || '',

      subject: email?.primary_subject || '',
      email: email?.body || '',
      backup_subject: email?.alternate_subject || '',
      backup_email: email?.body || '',

      reply_evidence_pack: evidencePack,

      confidence: prospect.confidence,
      decision: prospect.decision,
      qa_status: email?.generated ? 'PASSED' : 'BLOCKED',
      next_action: prospect.decision === 'OUTREACH_READY'
        ? `Diagnostic opportunity ready for ${prospect.company}. ` +
          (email?.generated
            ? 'Email drafted — review and send manually. If they reply "details", send the evidence pack.'
            : 'No person-specific email generated — use search hints to identify the responsible team manually.')
        : 'Research more — no defensible public finding assembled.',

      // Commercial-intelligence fields (from diagnostic opportunity / outreach_card)
      technical_area: diag?.technical_area || prospect.outreach_card?.technical_area || '',
      recommended_responsibility: diag?.recommended_responsibility || prospect.outreach_card?.recommended_responsibility || '',
      role_search_hints: diag?.role_keywords || prospect.outreach_card?.role_search_hints || [],
      why_it_matters: diag?.why_it_matters || '',
      search_hints: diag?.search_hints || prospect.outreach_card?.role_search_hints || [],
      diagnostic_questions: diag?.diagnostic_questions || [],
      diagnostic_scope: diag?.diagnostic_scope || [],
      implementation_hypothesis: diag ? diagnosticImplementationHypothesis(diag) : [],
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
    if (card.person) {
      lines.push(`PERSON             → ${card.person}`);
      lines.push(`ROLE               → ${card.role}`);
    } else {
      lines.push(`PERSON             → (to be identified manually)`);
      lines.push(`ROLE               → (use search hints below)`);
    }
    lines.push(`CONTACT            → ${card.contact || '(none found — use search hints)'}`);
    lines.push(`CONTACT STATUS       ${card.contact_status}`);
    lines.push('');
    lines.push('PROBLEM:');
    lines.push(`  ${card.finding}`);
    lines.push('');
    lines.push(`FINDING TYPE        ${card.finding_type}`);
    lines.push(`PRIMARY SOURCE      ${card.primary_source}`);
    lines.push('');
    if (card.person) {
      lines.push('WHY THIS PERSON:');
      lines.push(`  ${card.why_this_person}`);
      lines.push('');
    }
    lines.push('SUPPORTING EVIDENCE:');
    if (card.reply_evidence_pack.length === 0) {
      lines.push('  (see evidence pack below)');
    } else {
      for (const entry of card.reply_evidence_pack) {
        if (entry.evidence_ids.length === 0) continue;
        lines.push(`  [${entry.claim_type}] (${entry.evidence_ids.join(', ')})`);
        lines.push(`    ${entry.text.slice(0, 200)}`);
      }
    }
    lines.push('');
    lines.push('TECHNICAL AREA:');
    lines.push(`  ${card.technical_area || '(general platform engineering)'}`);
    lines.push('');
    lines.push('WHY IT MATTERS:');
    lines.push(`  ${card.why_it_matters || card.finding}`);
    lines.push('');
    lines.push(`DIAGNOSTIC ANGLE:`);
    lines.push(`  ${card.finding}`);
    lines.push('');
    if (card.recommended_responsibility) {
      lines.push('RECOMMENDED RESPONSIBILITY:');
      lines.push(`  ${card.recommended_responsibility}`);
      lines.push('');
    }
    if (card.role_search_hints && card.role_search_hints.length > 0) {
      lines.push('ROLE SEARCH HINTS:');
      card.role_search_hints.forEach(h => lines.push(`  • ${h}`));
      lines.push('');
    } else {
      lines.push('ROLE SEARCH HINTS: (none — identify team manually via LinkedIn)');
      lines.push('');
    }
    if (card.diagnostic_questions && card.diagnostic_questions.length > 0) {
      lines.push('DIAGNOSTIC QUESTIONS:');
      card.diagnostic_questions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`));
      lines.push('');
    }
    if (card.diagnostic_scope && card.diagnostic_scope.length > 0) {
      lines.push('RECOMMENDED DIAGNOSTIC SCOPE (£15K):');
      card.diagnostic_scope.forEach(s => lines.push(`  • ${s}`));
      lines.push('');
    }
    if (card.implementation_hypothesis && card.implementation_hypothesis.length > 0) {
      lines.push('IMPLEMENTATION HYPOTHESIS (£45K SCALE/POD — POST-DIAGNOSTIC):');
      card.implementation_hypothesis.forEach(h => lines.push(`  • ${h}`));
      lines.push('');
    }
    if (card.email) {
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
    } else {
      lines.push('EMAIL: (not drafted — contact to be handled manually)');
      lines.push('');
    }
    lines.push('REPLY EVIDENCE PACK:');
    for (const entry of card.reply_evidence_pack) {
      if (entry.evidence_ids.length === 0) continue;
      lines.push(`  [${entry.claim_type}] (${entry.evidence_ids.join(', ')})`);
      lines.push(`    ${entry.text.slice(0, 200)}`);
    }
    lines.push('');
    lines.push(`${sep}`);
    lines.push(`  CONFIDENCE:       ${card.confidence}`);
    lines.push(`  QA STATUS:        ${card.qa_status}`);
    lines.push(`  DECISION:         ${card.decision}`);
    lines.push(`  NEXT ACTION:      ${card.next_action}`);
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
    owner: DeepOwner | null
  ): { display: string; status: ContactStatus; channels: DeepContact[] } {
    // 1. Owner-verified email (preferred — linked to a specific person)
    const ownerEmail = contacts.find(c => c.type === 'OWNER_VERIFIED_EMAIL');
    if (ownerEmail) {
      return { display: ownerEmail.value, status: 'VERIFIED_EMAIL', channels: contacts };
    }

    // 2. Professional email for a specific person (not necessarily linked yet)
    const profEmail = contacts.find(c => c.type === 'PROFESSIONAL_EMAIL');
    if (profEmail) {
      return { display: profEmail.value, status: 'UNVERIFIED_POSSIBLE_EMAIL', channels: contacts };
    }

    // 3. Company/business email (role account — informational only)
    const companyEmail = contacts.find(c => c.type === 'COMPANY_BUSINESS_EMAIL');
    if (companyEmail) {
      return { display: companyEmail.value, status: 'PUBLIC_BUSINESS_CONTACT', channels: contacts };
    }

    // 4. Public professional profile (LinkedIn, etc.)
    const profile = contacts.find(c => c.type === 'PUBLIC_PROFESSIONAL_CONTACT' || c.type === 'PROFESSIONAL_PROFILE');
    if (profile) {
      return { display: profile.value, status: 'PUBLIC_PROFESSIONAL_CONTACT', channels: contacts };
    }

    // 5. Generic profile link
    const genericProfile = contacts.find(c => c.type === 'PROFILE');
    if (genericProfile) {
      return { display: genericProfile.value, status: 'PUBLIC_PROFESSIONAL_CONTACT', channels: contacts };
    }

    // 6. Contact page (directory)
    const contactPage = contacts.find(c => c.type === 'CONTACT_PAGE');
    if (contactPage) {
      return { display: contactPage.value, status: 'PUBLIC_BUSINESS_CONTACT', channels: contacts };
    }

    // 7. Owner's source URL as last-resort professional contact
    const ownerUrl = owner?.source_urls?.[0];
    if (ownerUrl && /https?:\/\/(www\.)?linkedin\.com\/in\//.test(ownerUrl)) {
      return { display: ownerUrl, status: 'PUBLIC_PROFESSIONAL_CONTACT', channels: contacts };
    }

    // No verified contact — surface the owner's profile URL as unverified
    const unverified = ownerUrl || '';
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
  private static buildBackupEmail(body: string, finding: DeepFinding | FindingClassification | null, owner: DeepOwner | null): string {
    // If the primary email already uses the safe generic structure (no specific
    // finding claims), it serves as its own backup.
    const firstName = owner ? owner.name.split(' ')[0] || 'there' : 'there';
    const company = (owner as any)?.company || '';
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
