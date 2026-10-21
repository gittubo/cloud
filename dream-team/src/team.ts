// The Dream Team: hands a lead from agent to agent. Every message an agent writes for a
// seller or buyer lands in the approval queue as a Draft; nothing is sent automatically.
import type { Lead, LeadStage } from './types.ts';
import { now, type Store } from './store.ts';
import { scoreLead } from './agents/scout.ts';
import { callScript, firstTouchSms, mergeQualification, nextQuestion, parseReply } from './agents/isa.ts';
import { analyzeDeal } from './agents/analyst.ts';
import { counterMessage, decideCounter, offerMessage } from './agents/negotiator.ts';
import { dealBlast, matchBuyers } from './agents/dispositions.ts';
import { closingChecklist } from './agents/coordinator.ts';
import { polish } from './llm.ts';

function setStage(lead: Lead, stage: LeadStage): void {
  lead.stage = stage;
  lead.updatedAt = now();
}

function context(lead: Lead): string {
  return JSON.stringify({
    address: `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}`,
    owner: lead.ownerName,
    tags: lead.tags,
    qualification: lead.qualification,
    analysis: lead.analysis && { arv: lead.analysis.arv, repairs: lead.analysis.repairEstimate, mao: lead.analysis.mao },
    negotiation: lead.negotiation?.history.slice(-4),
  });
}

/** Lead Scout: score every new lead. Returns how many were scored. */
export function scoutAll(store: Store): number {
  let n = 0;
  for (const lead of store.db.leads) {
    if (lead.stage !== 'new') continue;
    const s = scoreLead(lead);
    lead.motivationScore = s.score;
    lead.scoreReasons = s.reasons;
    setStage(lead, s.noEquity ? 'dead' : 'scored');
    if (s.noEquity) lead.notes.push('Scout: not enough equity to wholesale.');
    n++;
  }
  store.log('scout', `Scored ${n} new lead(s).`);
  return n;
}

/** ISA: first-touch text and a call script for one lead. */
export async function startOutreach(store: Store, leadId: string): Promise<void> {
  const lead = store.lead(leadId);
  const s = store.db.settings;
  if (lead.ownerPhone) {
    const body = await polish('Improve this first-touch text to a property owner. Keep it under 300 characters.', context(lead), firstTouchSms(lead, s));
    store.addDraft({ leadId, agent: 'isa', channel: 'sms', to: lead.ownerPhone, body });
  }
  store.addDraft({ leadId, agent: 'isa', channel: 'call-script', to: lead.ownerPhone, body: callScript(lead, s) });
  if (!lead.ownerPhone && !lead.ownerEmail) {
    store.addTask({ leadId, title: `Skip trace owner of ${lead.address} (find phone/email)` });
  }
  store.log('isa', 'Drafted first touch and call script.', leadId);
}

/** ISA: read a seller's reply, update what we know, and either ask the next question or hand off to the Analyst. */
export async function handleSellerReply(store: Store, leadId: string, text: string): Promise<void> {
  const lead = store.lead(leadId);
  lead.notes.push(`Seller: ${text}`);

  if (lead.stage === 'negotiating' && lead.negotiation) {
    return handleCounter(store, leadId, text);
  }

  const found = parseReply(text);
  lead.qualification = mergeQualification(lead.qualification, found);
  const q = lead.qualification;
  if (!['qualified', 'analyzed'].includes(lead.stage)) setStage(lead, 'contacted');
  const learned = Object.keys(found).join(', ') || 'nothing new';
  store.log('isa', `Seller replied; learned: ${learned}.`, leadId);

  // Price and condition are what the numbers need; the rest the ISA keeps asking for.
  if (q.askingPrice !== undefined && q.condition !== undefined) {
    setStage(lead, 'qualified');
    analyze(store, leadId);
  }
  if (q.missing.length > 0) {
    const body = await polish('Write the next qualifying text in this seller conversation.', context(lead) + `\nSeller just said: ${text}`, nextQuestion(lead, q));
    store.addDraft({ leadId, agent: 'isa', channel: 'sms', to: lead.ownerPhone, body });
  }
}

/** Deal Analyst: comps → ARV → repairs → MAO. */
export function analyze(store: Store, leadId: string): void {
  const lead = store.lead(leadId);
  lead.analysis = analyzeDeal(lead, store.db.comps, store.db.settings);
  if (['new', 'scored', 'contacted', 'qualified'].includes(lead.stage)) setStage(lead, 'analyzed');
  const a = lead.analysis;
  store.log('analyst', `ARV $${a.arv.toLocaleString()}, repairs $${a.repairEstimate.toLocaleString()}, MAO $${a.mao.toLocaleString()} → ${a.verdict}.`, leadId);
}

/** Negotiator: opening offer. */
export async function makeOffer(store: Store, leadId: string, amount?: number): Promise<void> {
  const lead = store.lead(leadId);
  if (!lead.analysis) analyze(store, leadId);
  const a = lead.analysis!;
  if (a.mao <= 0) throw new Error('No positive MAO: add comps or an estimated value first.');
  const offer = Math.min(amount ?? a.openingOffer, a.mao);
  lead.negotiation = { round: 1, ourLastOffer: offer, history: [{ at: now(), party: 'us', amount: offer, text: 'Opening offer' }] };
  setStage(lead, 'negotiating');
  const body = await polish('Improve this cash offer message to a property seller. Keep every number exactly as written.', context(lead), offerMessage(lead, offer));
  store.addDraft({ leadId, agent: 'negotiator', channel: 'sms', to: lead.ownerPhone, body });
  store.log('negotiator', `Opening offer $${offer.toLocaleString()} (MAO $${a.mao.toLocaleString()}).`, leadId);
}

/** Negotiator: seller countered. Text can include a number ("I need 95k") and/or an objection. */
export async function handleCounter(store: Store, leadId: string, text: string, amount?: number): Promise<void> {
  const lead = store.lead(leadId);
  const neg = lead.negotiation;
  const a = lead.analysis;
  if (!neg || !a) throw new Error('No offer has been made on this lead yet.');
  const ask = amount ?? parseReply(text).askingPrice;
  neg.history.push({ at: now(), party: 'seller', amount: ask, text });

  if (ask === undefined) {
    // An objection without a number: answer it and hold our price.
    const d = { action: 'counter' as const, amount: neg.ourLastOffer, reasoning: 'No number from the seller: address the objection and hold.' };
    const body = await polish('Reply to this seller objection. Keep every number exactly as written.', context(lead), counterMessage(lead, d, text, store.db.settings));
    store.addDraft({ leadId, agent: 'negotiator', channel: 'sms', to: lead.ownerPhone, body });
    store.log('negotiator', d.reasoning, leadId);
    return;
  }

  neg.sellerLastAsk = ask;
  const d = decideCounter(neg, ask, a.mao);
  if (d.action === 'counter' || d.action === 'final') {
    neg.round++;
    neg.ourLastOffer = d.amount;
  }
  neg.history.push({ at: now(), party: 'us', amount: d.amount, text: `${d.action}: ${d.reasoning}` });
  const body = await polish('Write the reply in this price negotiation with a seller. Keep every number exactly as written.', context(lead) + `\nSeller just said: ${text}`, counterMessage(lead, d, text, store.db.settings));
  store.addDraft({ leadId, agent: 'negotiator', channel: 'sms', to: lead.ownerPhone, body });
  if (d.action === 'walk') lead.notes.push(`Negotiator: walked at MAO; follow up in 30 days.`);
  store.log('negotiator', d.reasoning, leadId);
}

/** Transaction Coordinator: contract signed → closing tasks. Then Dispositions finds buyers. */
export async function contractSigned(store: Store, leadId: string, price: number, closingDate: string): Promise<void> {
  const lead = store.lead(leadId);
  const signedAt = now().slice(0, 10);
  lead.contractSignedAt = signedAt;
  lead.closingDate = closingDate;
  lead.negotiation ??= { round: 0, ourLastOffer: price, history: [] };
  lead.negotiation.ourLastOffer = price;
  setStage(lead, 'contract');
  for (const t of closingChecklist(lead, signedAt, closingDate)) store.addTask({ leadId, ...t });
  store.log('coordinator', `Contract at $${price.toLocaleString()}, closing ${closingDate}. Checklist created.`, leadId);
  await marketDeal(store, leadId);
}

/** Dispositions: blast the deal to matching cash buyers. */
export async function marketDeal(store: Store, leadId: string): Promise<void> {
  const lead = store.lead(leadId);
  const s = store.db.settings;
  const contractPrice = lead.negotiation?.ourLastOffer ?? lead.analysis?.mao ?? 0;
  const buyerPrice = contractPrice + (lead.analysis?.assignmentFee ?? s.defaultAssignmentFee);
  const matches = matchBuyers(lead, buyerPrice, store.db.buyers);
  const blast = await polish('Improve this off-market deal announcement for cash buyers. Keep every number exactly as written.', context(lead), dealBlast(lead, buyerPrice, s));
  for (const m of matches.slice(0, 25)) {
    store.addDraft({ leadId, agent: 'dispositions', channel: m.buyer.phone ? 'sms' : 'email', to: m.buyer.phone ?? m.buyer.email, subject: `Off-market deal in ${lead.city}`, body: blast });
  }
  if (matches.length === 0) store.addTask({ leadId, title: `No matching buyers for ${lead.zip}: find cash buyers who bought there recently (county records, Propwire "cash buyers" filter)` });
  setStage(lead, 'marketed');
  store.log('dispositions', `Matched ${matches.length} buyer(s) at $${buyerPrice.toLocaleString()}.`, leadId);
}

/** Approving a first-touch draft moves the lead into the conversation. */
export function approveDraft(store: Store, draftId: string, editedBody?: string): void {
  const d = store.db.drafts.find((x) => x.id === draftId);
  if (!d) throw new Error(`No draft ${draftId}`);
  if (editedBody) d.body = editedBody;
  d.status = 'approved';
  d.decidedAt = now();
  const lead = store.db.leads.find((l) => l.id === d.leadId);
  if (lead && d.agent === 'isa' && lead.stage === 'scored') setStage(lead, 'contacted');
  store.log('you', `Approved ${d.agent} ${d.channel}${d.to ? ` to ${d.to}` : ''}.`, d.leadId);
}

export function rejectDraft(store: Store, draftId: string): void {
  const d = store.db.drafts.find((x) => x.id === draftId);
  if (!d) throw new Error(`No draft ${draftId}`);
  d.status = 'rejected';
  d.decidedAt = now();
  store.log('you', `Rejected ${d.agent} ${d.channel}.`, d.leadId);
}
