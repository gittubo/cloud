// Deal Analyst: ARV from sold comps, a repair estimate, and the Maximum Allowable Offer.
import type { Comp, Condition, DealAnalysis, Lead, Settings } from '../types.ts';

const MONTHS_BACK = 12;
const SQFT_BAND = 0.25;

export function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function selectComps(lead: Lead, comps: Comp[], today = new Date()): Comp[] {
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - MONTHS_BACK);
  return comps.filter((c) => {
    if (c.zip !== lead.zip) return false;
    if (c.soldDate && new Date(c.soldDate) < cutoff) return false;
    // ARV is what the house is worth fixed up, so distressed sales don't count.
    if (c.condition === 'distressed') return false;
    if (lead.sqft && Math.abs(c.sqft - lead.sqft) / lead.sqft > SQFT_BAND) return false;
    if (lead.beds && c.beds && Math.abs(c.beds - lead.beds) > 1) return false;
    return true;
  });
}

export function analyzeDeal(lead: Lead, comps: Comp[], settings: Settings, today = new Date()): DealAnalysis {
  const explanation: string[] = [];
  const used = selectComps(lead, comps, today);
  const sqft = lead.sqft ?? 0;

  let arv: number;
  let pricePerSqft = 0;
  let arvConfidence: DealAnalysis['arvConfidence'];
  if (used.length > 0 && sqft > 0) {
    // Renovated comps set the ceiling; weight them double.
    const ppsf = used.flatMap((c) => {
      const v = c.soldPrice / c.sqft;
      return c.condition === 'renovated' ? [v, v] : [v];
    });
    pricePerSqft = median(ppsf);
    arv = roundTo(pricePerSqft * sqft, 1000);
    arvConfidence = used.length >= 3 ? 'high' : 'medium';
    explanation.push(`ARV $${arv.toLocaleString()} = median $${pricePerSqft.toFixed(0)}/sqft from ${used.length} comp(s) × ${sqft} sqft.`);
  } else if (lead.estimatedValue) {
    arv = roundTo(lead.estimatedValue * 1.1, 1000);
    arvConfidence = 'low';
    explanation.push(`No usable comps in ${lead.zip}; ARV estimated at the list's value + 10% ($${arv.toLocaleString()}). Pull sold comps before making an offer.`);
  } else {
    arv = 0;
    arvConfidence = 'low';
    explanation.push('No comps and no estimated value: cannot price this deal yet.');
  }

  const condition: Condition = lead.qualification?.condition ?? 'medium';
  let repairEstimate = roundTo(sqft * settings.repairCostPerSqft[condition], 500);
  if (lead.yearBuilt && lead.yearBuilt < 1960 && condition !== 'turnkey') {
    repairEstimate = roundTo(repairEstimate * 1.1, 500);
    explanation.push(`Built ${lead.yearBuilt}: +10% repairs for older systems (electrical, plumbing, lead paint).`);
  }
  explanation.push(`Repairs $${repairEstimate.toLocaleString()} = ${sqft} sqft × $${settings.repairCostPerSqft[condition]}/sqft (${condition}${lead.qualification?.condition ? '' : ', assumed until the seller confirms'}).`);

  const assignmentFee = settings.defaultAssignmentFee;
  const mao = Math.max(0, roundTo(arv * settings.arvPercent - repairEstimate - assignmentFee, 500));
  explanation.push(`MAO $${mao.toLocaleString()} = ${Math.round(settings.arvPercent * 100)}% of ARV − repairs − $${assignmentFee.toLocaleString()} fee.`);
  // Leave room to come up during negotiation.
  const openingOffer = roundTo(mao * 0.85, 500);

  const ask = lead.qualification?.askingPrice;
  let verdict: DealAnalysis['verdict'];
  if (mao <= 0) verdict = 'pass';
  else if (ask === undefined) verdict = arvConfidence === 'low' ? 'workable' : 'strong';
  else if (ask <= mao) verdict = 'strong';
  else if (ask <= mao * 1.15) verdict = 'workable';
  else verdict = 'pass';
  if (ask !== undefined) {
    explanation.push(ask <= mao
      ? `Seller's ask $${ask.toLocaleString()} is at or under MAO.`
      : `Seller's ask $${ask.toLocaleString()} is $${(ask - mao).toLocaleString()} over MAO.`);
  }
  if (lead.mortgageBalance && lead.mortgageBalance > mao) {
    explanation.push(`Mortgage balance ~$${lead.mortgageBalance.toLocaleString()} exceeds MAO: the seller would have to bring cash to close.`);
    if (verdict === 'strong') verdict = 'workable';
  }

  return {
    arv,
    arvConfidence,
    compsUsed: used.map((c) => `${c.address}: $${c.soldPrice.toLocaleString()} (${c.sqft} sqft, ${c.soldDate})`),
    pricePerSqft: Math.round(pricePerSqft),
    repairEstimate,
    assignmentFee,
    mao,
    openingOffer,
    verdict,
    explanation,
  };
}
