// Dispositions: matches a contracted deal to cash buyers and writes the deal blast.
import type { Buyer, Lead, Settings } from '../types.ts';

export interface BuyerMatch {
  buyer: Buyer;
  score: number;
  reasons: string[];
}

export function matchBuyers(lead: Lead, buyerPrice: number, buyers: Buyer[], today = new Date()): BuyerMatch[] {
  return buyers
    .map((buyer): BuyerMatch => {
      let score = 0;
      const reasons: string[] = [];
      if (buyer.zips.includes(lead.zip)) { score += 50; reasons.push(`buys in ${lead.zip}`); }
      else if (buyer.zips.some((z) => z.slice(0, 3) === lead.zip.slice(0, 3))) { score += 20; reasons.push('buys nearby'); }
      if (buyer.maxPrice !== undefined) {
        if (buyerPrice <= buyer.maxPrice) { score += 20; reasons.push(`within $${buyer.maxPrice.toLocaleString()} budget`); }
        else score -= 40;
      }
      if (buyer.minBeds !== undefined && lead.beds !== undefined) {
        if (lead.beds >= buyer.minBeds) score += 10;
        else score -= 20;
      }
      if (buyer.lastPurchase) {
        const days = (today.getTime() - new Date(buyer.lastPurchase).getTime()) / 864e5;
        if (days <= 90) { score += 20; reasons.push('bought in the last 90 days'); }
        else if (days <= 365) { score += 10; reasons.push('bought this year'); }
      }
      return { buyer, score, reasons };
    })
    // A buyer who doesn't buy in the area is never a match, whatever their budget.
    .filter((m) => m.reasons.some((r) => r.startsWith('buys')) && m.score >= 40)
    .sort((a, b) => b.score - a.score);
}

export function dealBlast(lead: Lead, buyerPrice: number, s: Settings): string {
  const a = lead.analysis;
  const facts = [
    lead.beds && `${lead.beds} bd`,
    lead.baths && `${lead.baths} ba`,
    lead.sqft && `${lead.sqft.toLocaleString()} sqft`,
    lead.yearBuilt && `built ${lead.yearBuilt}`,
  ].filter(Boolean).join(' · ');
  return [
    `🏠 OFF-MARKET: ${lead.city}, ${lead.state} ${lead.zip}`,
    facts,
    `Price: $${buyerPrice.toLocaleString()}${a ? ` | ARV ~$${a.arv.toLocaleString()} | Est. repairs ~$${a.repairEstimate.toLocaleString()}` : ''}`,
    lead.qualification?.occupancy ? `Occupancy: ${lead.qualification.occupancy}` : '',
    `Cash or hard money. Assignment of contract. EMD due at signing. Buyer does own due diligence.`,
    `Full address and access details on request: ${s.yourName}, ${s.companyName}, ${s.callbackNumber}`,
  ].filter(Boolean).join('\n');
}
