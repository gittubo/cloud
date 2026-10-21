// Transaction Coordinator: turns a signed contract into dated closing tasks.
import type { Lead } from '../types.ts';

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function closingChecklist(lead: Lead, signedAt: string, closingDate: string): { title: string; due: string }[] {
  const tasks = [
    { title: 'Send signed purchase agreement to an investor-friendly title company and open escrow', due: addDays(signedAt, 1) },
    { title: 'Deposit earnest money (EMD) with title', due: addDays(signedAt, 3) },
    { title: 'Order title search; check for liens, judgments and unpaid taxes', due: addDays(signedAt, 3) },
    { title: 'Get photos/video and a walkthrough access plan for buyers', due: addDays(signedAt, 4) },
    { title: 'Inspection period ends: assign or cancel before this date', due: addDays(signedAt, 10) },
    { title: 'Sign assignment agreement with end buyer and collect their non-refundable EMD', due: addDays(signedAt, 12) },
    { title: 'Send assignment to title; confirm the fee appears on the settlement statement', due: addDays(signedAt, 13) },
    { title: 'Confirm closing time and remind the seller what to bring (ID, keys, payoff info)', due: addDays(closingDate, -2) },
    { title: 'Closing day: confirm funds wired and assignment fee received', due: closingDate },
  ];
  if (lead.tags.includes('probate')) tasks.push({ title: 'Get letters of administration / executor authority to sell', due: addDays(signedAt, 5) });
  if (lead.tags.includes('pre-foreclosure')) tasks.push({ title: 'Request lender payoff statement and confirm auction date is after closing', due: addDays(signedAt, 2) });
  if (lead.qualification?.occupancy === 'tenant') tasks.push({ title: 'Collect leases, deposits and estoppel letters from tenants', due: addDays(signedAt, 7) });
  return tasks.sort((a, b) => a.due.localeCompare(b.due));
}
