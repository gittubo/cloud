// ISA (inside sales agent): first touch, then works through the four things every
// acquisitions call needs before an offer: motivation, condition, timeline, price.
import type { Condition, Lead, Qualification, Settings } from '../types.ts';

export const REQUIRED: (keyof Omit<Qualification, 'missing' | 'decisionMakers'>)[] = [
  'motivation', 'condition', 'timeline', 'askingPrice', 'occupancy',
];

const QUESTIONS: Record<string, string> = {
  motivation: 'What has you thinking about selling?',
  condition: 'How would you describe the condition? Anything that needs fixing, like the roof, HVAC, foundation or plumbing?',
  timeline: 'If the numbers work, how soon would you want to close?',
  askingPrice: 'Do you have a number in mind that would make this worth it for you?',
  occupancy: 'Is anyone living there right now: you, a tenant, or is it empty?',
};

function firstName(lead: Lead): string {
  const n = lead.ownerName?.split(/\s+/)[0];
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : 'there';
}

export function firstTouchSms(lead: Lead, s: Settings): string {
  return `Hi ${firstName(lead)}, this is ${s.yourName} with ${s.companyName}. Are you the owner of ${lead.address}? `
    + `We buy houses as-is for cash and wanted to see if you'd consider an offer. Reply STOP to opt out.`;
}

export function callScript(lead: Lead, s: Settings): string {
  return [
    `Opening: "Hi, is this ${firstName(lead)}? This is ${s.yourName} with ${s.companyName}. I'm calling about ${lead.address}. Did I catch you at an OK time?"`,
    `Permission: "We buy houses in ${lead.city || 'your area'} as-is. Would you be open to an offer if the price made sense?"`,
    ...REQUIRED.map((k) => `${k}: "${QUESTIONS[k]}"`),
    `Decision makers: "Is anyone else on the title who'd need to be part of the decision?"`,
    `Close: "Great. Let me run the numbers and I'll get back to you by tomorrow with a firm offer."`,
    lead.tags.includes('pre-foreclosure') ? `Note: pre-foreclosure. Be gentle, and ask whether they know the auction date.` : '',
    lead.tags.includes('probate') ? `Note: probate. Offer condolences and confirm who the executor is.` : '',
  ].filter(Boolean).join('\n');
}

const CONDITION_WORDS: [Condition, RegExp][] = [
  ['teardown', /tear ?down|condemned|fire damage|uninhabitable|foundation (is )?(cracked|shot|bad)/i],
  ['heavy', /gut|needs everything|major|roof (leaks|is bad|needs)|mold|water damage|no (hvac|heat|ac)/i],
  ['medium', /needs (some )?work|dated|old kitchen|some repairs|carpet|paint and/i],
  ['light', /cosmetic|just paint|minor|small repairs|light/i],
  ['turnkey', /great (shape|condition)|updated|renovated|move.?in ready|perfect/i],
];

/** Pulls whatever qualification facts a seller reply contains. Keyword rules: Claude is not needed. */
export function parseReply(text: string): Partial<Qualification> {
  const out: Partial<Qualification> = {};

  const money = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k|K)?|(\d[\d,]*(?:\.\d+)?)\s*(k|K|thousand)\b/);
  if (money) {
    const raw = Number((money[1] ?? money[3]).replace(/,/g, ''));
    const k = money[2] || money[4];
    const v = k ? raw * 1000 : raw;
    if (v >= 5000) out.askingPrice = v;
  }

  for (const [cond, re] of CONDITION_WORDS) {
    if (re.test(text)) { out.condition = cond; break; }
  }

  const timeline = text.match(/\b(asap|right away|immediately|this month|next month|(?:in |within )?\d+\s*(?:days?|weeks?|months?)|no rush|whenever|before (?:the )?(?:auction|foreclosure))\b/i);
  if (timeline) out.timeline = timeline[0];

  if (/\btenant|rent(ed|ing)? (it )?out|renter/i.test(text)) out.occupancy = 'tenant';
  else if (/\bvacant|empty|nobody lives|no one lives/i.test(text)) out.occupancy = 'vacant';
  else if (/\bi live|we live|living (in|there)|my home/i.test(text)) out.occupancy = 'owner';

  const motive = text.match(/\b(divorce|passed away|inherit\w*|behind on (?:payments|taxes)|foreclos\w*|relocat\w*|moving|job|retir\w*|tired of (?:tenants|landlording|it)|can'?t afford|repairs are too|medical|downsiz\w*)\b/i);
  if (motive) out.motivation = motive[0].toLowerCase();

  return out;
}

export function mergeQualification(prev: Qualification | undefined, found: Partial<Qualification>): Qualification {
  const q: Qualification = { ...(prev ?? { missing: [] }), ...found, missing: [] };
  q.missing = REQUIRED.filter((k) => q[k] === undefined);
  return q;
}

export function nextQuestion(lead: Lead, q: Qualification): string {
  const ask = q.missing.slice(0, 2).map((k) => QUESTIONS[k]);
  return `Thanks, ${firstName(lead)}, that helps. ${ask.join(' ')}`;
}
