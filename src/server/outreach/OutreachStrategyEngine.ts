/**
 * XAVIRA — OUTREACH STRATEGY ENGINE
 * ─────────────────────────────────────────────────────────────────────────────
 * Determines the communication strategy based on the evidence.
 * The strategy is the "Angle of Attack" for the generator.
 */

import { DeepProspect, OutreachStrategy, OutreachStrategyType } from './DeepTypes';
import { XaviraModelGateway } from '../XaviraModelGateway';

export class OutreachStrategyEngine {
  constructor(private modelGateway: XaviraModelGateway) {}

  async determineStrategy(prospect: DeepProspect): Promise<OutreachStrategy> {
    const finding = prospect.deep_finding;
    if (!finding) {
      throw new Error('No deep finding available to derive strategy.');
    }

    const prompt = `Analyze the following technical finding and owner role to determine the best outreach strategy.
    Finding: ${finding.explanation}
    Owner Role: ${prospect.selected_owner?.role}
    Company: ${prospect.company}

    Select one strategy:
    - EVIDENCE_FIRST: Lead with the most shocking/specific evidence.
    - TECHNICAL_OBSERVATION: Lead with a neutral observation of a public surface.
    - QUESTION_LED: Start with a technical question about the observed behavior.
    - CURIOSITY_LED: Frame the outreach as "I'm curious how you solve X".
    - PEER_TO_PEER: Frame as a technical peer sharing a discovery.
    - DIAGNOSTIC_CONTEXT: Provide a brief diagnostic of why the observation matters.

    Output JSON: { "type": "STRATEGY_NAME", "justification": "...", "angle": "..." }`;

    const response = await this.modelGateway.generate({
      prompt,
      capability: 'outreach_strategy',
      temperature: 0.3
    });

    try {
      const data = JSON.parse(response.text);
      return {
        type: data.type as OutreachStrategyType,
        justification: data.justification,
        angle: data.angle,
        tone_constraints: ['engineer-to-engineer', 'no-hype', 'evidence-bound']
      };
    } catch {
      // Fallback to a safe default
      return {
        type: 'TECHNICAL_OBSERVATION',
        justification: 'Fallback due to model failure',
        angle: 'Neutral observation of public surface',
        tone_constraints: ['engineer-to-engineer', 'no-hype']
      };
    }
  }
}
