// Optional Claude polish. Every agent works without it: each writes a complete
// template draft first, and Claude only rewrites that draft when ANTHROPIC_API_KEY is set.
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.DREAM_MODEL || 'claude-opus-5-5';
let client: Anthropic | null | undefined;

export function getClient(): Anthropic | null {
  if (client === undefined) client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  return client;
}

export function aiStatus(): { enabled: boolean; model: string } {
  return { enabled: getClient() !== null, model: MODEL };
}

const GUARDRAILS = `You write messages for a US real estate wholesaler. Rules:
- Be honest: never claim to be a licensed agent, never invent facts, prices or deadlines not given to you.
- When an offer is made, say plainly that the company buys under contract and may assign it to another buyer.
- Keep any opt-out line ("Reply STOP to opt out") that appears in the draft.
- Warm, plain, short. No pressure tactics, no fake urgency.
- Output only the message text, with no preamble.`;

/** Rewrites `draft` using `context`; returns the draft unchanged if AI is off or the call fails. */
export async function polish(task: string, context: string, draft: string): Promise<string> {
  const c = getClient();
  if (!c) return draft;
  try {
    const res = (await c.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: GUARDRAILS,
      messages: [{ role: 'user', content: `${task}\n\nContext:\n${context}\n\nDraft to improve:\n${draft}` }],
    } as Parameters<typeof c.beta.messages.create>[0])) as Anthropic.Beta.BetaMessage;
    if (res.stop_reason === 'refusal') return draft;
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('').trim();
    return text || draft;
  } catch (err) {
    console.warn(`[ai] falling back to template: ${(err as Error).message}`);
    return draft;
  }
}
