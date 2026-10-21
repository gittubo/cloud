// What the Acquisition Manager knows about buying houses, so it can answer sellers'
// questions without you. Plain facts about how a cash/assignment purchase works.
import type { Settings } from '../types.ts';

export function knowledgeBase(s: Settings): string {
  return `HOW WE BUY (answer seller questions from this; never invent other facts)
- ${s.companyName} buys houses in ${s.market} for cash, as-is. The seller does no repairs, no cleaning, no showings.
- No agent commissions. We pay normal closing costs. The seller pays off their own mortgage/liens from the sale proceeds.
- Closing usually takes about ${s.closeDays} days, or later if the seller needs more time. Closing happens at a licensed title company or closing attorney, who holds the money and makes sure the title is clear. The seller can sign remotely in many cases.
- How the offer is figured: what fixed-up homes nearby recently sold for, minus the repairs needed, minus the costs and risk of fixing and reselling. That is why a cash as-is offer is below retail/Zillow value; in exchange the seller gets speed, certainty and no repair or commission costs.
- Assignment: we sign a purchase agreement and may assign it to one of our partner investors, who closes on the same terms and price. The seller's price and terms don't change. Always be upfront about this.
- Earnest money: a deposit is held by the title company after signing.
- Inspection period: after signing there is a short period for a walkthrough/inspection. If something major and unknown turns up, the price may need to be revisited, and the seller can say no.
- After the agreement is signed, the title company contacts the seller to schedule closing.
- Occupied houses: tenants can stay (the buyer takes over the lease) or the seller can choose a move-out date. Owners can often get a few extra days after closing to move.
- Behind on payments / foreclosure: selling before the auction can protect their credit and let them keep any equity. We are not lawyers or financial advisers. For legal or tax questions, suggest they speak to an attorney or accountant.
- Inherited/probate property: the executor or administrator signs. The title company helps with the paperwork.
- Is this a scam? Answer honestly: nothing is paid upfront, the seller never pays us anything, the title company handles the money, and they can look the title company up independently.
- Sellers can say no at any time before signing, and there's no obligation.`;
}
