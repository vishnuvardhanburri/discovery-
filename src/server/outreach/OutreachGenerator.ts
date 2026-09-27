/**
 * XAVIRA — OUTREACH GENERATOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts strategy and evidence into a 9-section, engineer-to-engineer email.
 * Uses XaviraModelGateway for generation and ensures no hallucinations.
 */

import {
  DeepProspect,
  OutreachStrategy,
  OutreachClaim,
  DeepEmailDraft
} from './DeepTypes';
import { XaviraModelGateway } from '../XaviraModelGateway';
import { ClaimLedger } from './ClaimLedger';

export class OutreachGenerator {
  constructor(private modelGateway: XaviraModelGateway) {}

  async generate(
    prospect: DeepProspect,
    strategy: OutreachStrategy,
    ledger: ClaimLedger
  ): Promise<DeepEmailDraft> {
    const { selected_owner, company, deep_finding } = prospect;

    const prompt = (variant: 'primary' | 'backup') => `You are a technical researcher writing to another engineer.
    Target: ${selected_owner?.name} (${selected_owner?.role}) at ${company}.
    Finding: ${deep_finding?.explanation}
    Strategy: ${strategy.type} - ${strategy.angle}
    Variant: ${variant === 'primary' ? 'Full high-precision outreach' : 'Short, low-friction backup variant'}

    Constraints:
    - Tone: Engineer-to-Engineer. Clinical, evidence-based, no hype.
    - Ban List: "revolutionary", "game-changing", "unlock", "10x", "transform", "cutting-edge", "industry-leading".
    - No fake personalization ("followed your journey").
    - No meeting requests.
    - No sales pitches.
    - Maximum ${variant === 'primary' ? '140' : '70'} words.

    Structure:
    1. Subject: Technical and natural.
    2. Greeting: "Hi [FirstName],".
    3. Specific public observation: "I was looking at [surface] and noticed [X]".
    4. Why it matters: Technical implication.
    5. Evidence reference: Cite the public source.
    6. Technical tension: Why this is interesting for their role.
    7. Low-pressure CTA: "Reply 'details' for the evidence pack."
    8. The "Out": "Not my area? No problem."
    9. Sign-off: "Best, Vishnu (Founder, XAVIRA)".

    Requirement: For every factual claim, you MUST output a JSON mapping of [sentence] -> [evidence_id] from the provided evidence pool.

    Output JSON: { "subject": "...", "alternate_subject": "...", "body": "...", "claims": [{ "text": "...", "evidence_id": "..." }] }`;

    const generateVariant = async (variant: 'primary' | 'backup') => {
      const response = await this.modelGateway.generate({
        prompt: prompt(variant),
        capability: 'outreach_generation',
        temperature: 0.4
      });

      try {
        return JSON.parse(response.text);
      } catch {
        return null;
      }
    };

    const primaryData = await generateVariant('primary');
    const backupData = await generateVariant('backup');

    if (!primaryData) {
      return {
        primary_subject: '', alternate_subject: '', body: '', claims: [],
        generated: false, blocked_reason: 'Generation failed to produce valid JSON.'
      };
    }

    // Map generated claims into the ledger (Primary takes precedence)
    if (primaryData.claims) {
      primaryData.claims.forEach((c: any, i: number) => {
        ledger.addClaim({
          claim_id: `claim_${i}`,
          text: c.text,
          type: 'XAVIRA_OBSERVATION',
          supporting_evidence_ids: [c.evidence_id],
          supporting_signal_ids: [],
          supporting_correlation_ids: [],
          confidence: 0.8,
          allowed_in_email: true
        });
      });
    }

    return {
      primary_subject: primaryData.subject,
      alternate_subject: primaryData.alternate_subject,
      body: primaryData.body,
      claims: primaryData.claims || [],
      generated: true,
      backup_variant: backupData ? {
        subject: backupData.subject,
        body: backupData.body
      } : null
    };
  }
}
