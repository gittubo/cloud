// Negotiator (acquisitions manager): opening offer, a concession ladder that never
// crosses MAO, and objection handling.
import type { Lead, NegotiationState, Settings } from '../types.ts';
import { roundTo } from './analyst.ts';

export const MAX_ROUNDS = 4;

export interface CounterDecision {
  action: 'accept' | 'counter' | 'final' | 'walk';
  amount: number;
  reasoning: string;
}

/**
 * Concede a shrinking share of our remaining room under MAO each round (40%, 30%, 20%, then
 * best and final at MAO), so the seller sees movement without us ever paying more than MAO.
 */
export function decideCounter(state: NegotiationState, sellerAsk: number, mao: number): CounterDecision {
  if (sellerAsk <= state.ourLastOffer) {
    return { action: 'accept', amount: sellerAsk, reasoning: `Seller's $${sellerAsk.toLocaleString()} is at or below our last offer.` };
  }
  if (sellerAsk <= mao) {
    return { action: 'accept', amount: sellerAsk, reasoning: `Seller's $${sellerAsk.toLocaleString()} is within MAO ($${mao.toLocaleString()}). Lock it up.` };
  }
  if (state.ourLastOffer >= mao) {
    return { action: 'walk', amount: mao, reasoning: `We're already at MAO and the seller is $${(sellerAsk - mao).toLocaleString()} above it. Leave the door open and follow up in 30 days.` };
  }
  const shares = [0.4, 0.3, 0.2];
  const share = shares[state.round - 1];
  if (share === undefined || state.round >= MAX_ROUNDS) {
    return { action: 'final', amount: mao, reasoning: `Round ${state.round + 1}: best and final at MAO.` };
  }
  const next = roundTo(state.ourLastOffer + (mao - state.ourLastOffer) * share, 500);
  if (next >= mao || next <= state.ourLastOffer) return { action: 'final', amount: mao, reasoning: 'Little room left under MAO: make it best and final.' };
  return {
    action: 'counter',
    amount: next,
    reasoning: `Gave up ${Math.round(share * 100)}% of our room: $${state.ourLastOffer.toLocaleString()} → $${next.toLocaleString()} (MAO $${mao.toLocaleString()}, $${(mao - next).toLocaleString()} of room left).`,
  };
}

const OBJECTIONS: [RegExp, string][] = [
  [/zillow|zestimate|redfin|online (value|says)|worth more/i,
    "Those online numbers assume a house that's updated and listed with an agent. Our price is cash, as-is, no repairs, no commissions, no showings, and we cover closing costs, so what you see is what you walk away with."],
  [/too low|insult|lowball|joke/i,
    "I hear you, and I'm not trying to lowball you. Here's exactly how we got there: what fixed-up homes nearby sold for, minus the repairs and the costs to resell. I'm happy to walk through it line by line."],
  [/think about it|need time|talk to (my )?(wife|husband|family|kids)/i,
    "Of course, take the time you need. Is there anything about the offer itself I can clarify that would help that conversation?"],
  [/realtor|agent|list it|mls/i,
    "Listing is a great option if the house shows well and you can wait. With us there are no repairs, no commissions and no 60–90 days on market. Some sellers compare both. Want me to put our offer in writing so you can?"],
  [/repairs?|fix (it )?up|roof|foundation/i,
    "That's exactly why we buy as-is. You won't have to fix a thing; the repairs are already factored into our number."],
];

export function objectionReply(text: string): string | undefined {
  return OBJECTIONS.find(([re]) => re.test(text))?.[1];
}

const DISCLOSURE = 'Just so you know, we buy under contract and may assign the contract to one of our partner buyers, who would close on the same terms.';

export function offerMessage(lead: Lead, amount: number, closeDays = 21): string {
  return `Hi ${lead.ownerName?.split(' ')[0] ?? 'there'}, thanks for walking me through ${lead.address}. `
    + `Based on recent sales nearby and the repairs needed, we can offer $${amount.toLocaleString()} cash, as-is. `
    + `We cover the closing costs, there are no commissions, and we can close in about ${closeDays} days or on your timeline. `
    + `${DISCLOSURE} Want me to send the agreement over?`;
}

export function counterMessage(lead: Lead, d: CounterDecision, sellerText: string, s: Settings): string {
  const name = lead.ownerName?.split(' ')[0] ?? 'there';
  const objection = objectionReply(sellerText);
  const leadIn = objection ? `${objection} ` : `Thanks for getting back to me, ${name}. `;
  switch (d.action) {
    case 'accept':
      return `${leadIn}We can do $${d.amount.toLocaleString()}. I'll send the purchase agreement today for you to review. ${DISCLOSURE}`;
    case 'counter':
      return `${leadIn}I went back to my numbers and can come up to $${d.amount.toLocaleString()} cash, as-is, and we still cover closing costs. Does that work for you?`;
    case 'final':
      return `${leadIn}I've stretched as far as the numbers allow: $${d.amount.toLocaleString()} is my best and final. If that works, I'll send paperwork today. If not, no hard feelings at all.`;
    case 'walk':
      return `${leadIn}I'm not able to get to that number, and I don't want to waste your time. If anything changes, my offer of $${d.amount.toLocaleString()} stands; just text me at ${s.callbackNumber}.`;
  }
}
