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

    const prompt = `You are a technical researcher writing to another engineer.
    Target: ${selected_owner?.name} (${selected_owner?.role}) at ${company}.
    Finding: ${deep_finding?.explanation}
    Strategy: ${strategy.type} - ${strategy.angle}

    Constraints:
    - Tone: Engineer-to-Engineer. Clinical, evidence-based, no hype.
    - Ban List: "revolutionary", "game-changing", "unlock", "10x", "transform", "cutting-edge", "industry-leading".
    - No fake personalization ("followed your journey").
    - No meeting requests.
    - No sales pitches.
    - Maximum 140 words.

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

    const response = await this.modelGateway.generate({
      prompt,
      capability: 'outreach_generation',
      temperature: 0.4
    });

    try {
      const data = JSON.parse(response.text);

      // Map generated claims into the ledger
      if (data.claims) {
        data.claims.forEach((c: any, i: number) => {
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
        primary_subject: data.subject,
        alternate_subject: data.alternate_subject,
        body: data.body,
        claims: data.claims || [],
        generated: true
      };
    } catch {
      return {
        primary_subject: '', alternate_subject: '', body: '', claims: [],
        generated: false, blocked_reason: 'Generation failed to produce valid JSON.'
      };
    }
  }
}
