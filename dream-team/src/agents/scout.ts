// Lead Scout: ranks imported properties by how likely the owner is to sell at a discount.
import type { Lead } from '../types.ts';

const TAG_POINTS: Record<string, number> = {
  'pre-foreclosure': 30,
  'tax-delinquent': 25,
  probate: 25,
  'code-violation': 20,
  divorce: 20,
  vacant: 20,
  'tired-landlord': 15,
  absentee: 10,
  'free-and-clear': 10,
  'high-equity': 10,
};

export interface Score {
  score: number;
  reasons: string[];
  /** Equity too thin to wholesale: the seller can't sell at a discount and still pay off the loan. */
  noEquity: boolean;
}

export function scoreLead(lead: Lead, today = new Date()): Score {
  let score = 0;
  const reasons: string[] = [];

  for (const tag of lead.tags) {
    const pts = TAG_POINTS[tag];
    if (pts) { score += pts; reasons.push(`${tag} (+${pts})`); }
  }
  // Stacked distress signals are the strongest predictor of a motivated seller.
  const distress = lead.tags.filter((t) => TAG_POINTS[t]).length;
  if (distress >= 3) { score += 10; reasons.push(`${distress} stacked signals (+10)`); }

  let noEquity = false;
  if (lead.estimatedValue) {
    const equity = 1 - (lead.mortgageBalance ?? 0) / lead.estimatedValue;
    if (equity >= 0.5) { score += 15; reasons.push(`${Math.round(equity * 100)}% equity (+15)`); }
    else if (equity >= 0.3) { score += 8; reasons.push(`${Math.round(equity * 100)}% equity (+8)`); }
    else if (equity < 0.15) {
      score -= 25;
      noEquity = true;
      reasons.push(`only ${Math.round(equity * 100)}% equity (-25, likely a short sale or subject-to, not a wholesale)`);
    }
  }

  if (lead.lastSaleDate) {
    const years = (today.getTime() - new Date(lead.lastSaleDate).getTime()) / (365.25 * 864e5);
    if (years >= 15) { score += 10; reasons.push(`owned ${Math.floor(years)} years (+10)`); }
    else if (years >= 8) { score += 5; reasons.push(`owned ${Math.floor(years)} years (+5)`); }
  }

  if (lead.yearBuilt && lead.yearBuilt < 1960) { score += 5; reasons.push(`built ${lead.yearBuilt}, likely dated (+5)`); }

  // Atlas saw the house looking run down from the street.
  if (lead.visual?.usable && lead.visual.score >= 4) {
    const pts = lead.visual.score >= 8 ? 30 : lead.visual.score >= 6 ? 20 : 8;
    score += pts;
    reasons.push(`looks distressed from the street, ${lead.visual.score}/10 (+${pts})`);
  }

  if (!lead.ownerPhone && !lead.ownerEmail) {
    score -= 10;
    reasons.push('no phone or email yet, needs skip tracing (-10)');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons, noEquity };
}
