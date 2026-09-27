/**
 * XAVIRA — REPLY PACK BUILDER
 * ─────────────────────────────────────────────────────────────────────────────
 * Constructs a compact, high-fidelity evidence response for when a prospect
 * asks: "Can you send me what you found?".
 */

import { DeepProspect, EvidencePack } from './DeepTypes';

export class ReplyPackBuilder {
  static build(prospect: DeepProspect, pack: EvidencePack): string {
    const finding = pack.primary_finding;
    const evidence = pack.supporting_evidence;

    let output = `--- TECHNICAL EVIDENCE PACK ---\\n`;
    output += `OBSERVATION: ${finding.explanation}\\n`;
    output += `PRIMARY SOURCE: ${finding.source_urls[0] || 'Unavailable'}\\n`;
    output += `OBSERVED AT: ${new Date().toISOString()}\\n`;
    output += `TECHNICAL INTERPRETATION: ${finding.recommendation}\\n`;
    output += `\\nLIMITATIONS:\\n`;
    output += `- This was observed via public surface; internal configuration not verified.\\n`;

    if (evidence.length > 0) {
      output += `\\nSUPPORTING DATA:\\n`;
      evidence.forEach((ev, i) => {
        output += `[${i+1}] ${ev.public_url} -> ${ev.observed_behavior || 'Publicly accessible'}\\n`;
      });
    }

    return output;
  }
}
