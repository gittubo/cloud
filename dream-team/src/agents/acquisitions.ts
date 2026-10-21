// AI Acquisition Manager: holds the whole conversation with a seller (phone call or text),
// answers their questions, qualifies, makes the offer and negotiates, then hands you a
// verbal agreement to approve. Claude does the talking; the code holds the money rules:
// every price it may say comes from get_offer, it never sees MAO, and agree_price refuses
// anything above MAO or any price that wasn't actually on the table.
import type { Condition, Conversation, Lead, Settings } from '../types.ts';
import { newId, now, type Store } from '../store.ts';
import { getClient, MODEL } from '../llm.ts';
import { analyzeDeal } from './analyst.ts';
import { decideCounter } from './negotiator.ts';
import { mergeQualification } from './isa.ts';
import { knowledgeBase } from './knowledge.ts';
import { notify } from '../notify.ts';

/** The slice of the Anthropic client this agent uses, so tests can pass a scripted fake. */
export interface LlmClient {
  beta: { messages: { create(params: any): Promise<any> } };
}

const OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|remove me)\s*[.!]*\s*$/i;
const MAX_STEPS = 8;

export const digits = (phone: string) => phone.replace(/\D/g, '').slice(-10);

export function findOrCreateLeadByPhone(store: Store, phone: string): Lead {
  const d = digits(phone);
  const existing = store.db.leads.find((l) => l.ownerPhone && digits(l.ownerPhone) === d);
  if (existing) return existing;
  const lead: Lead = {
    id: newId('l'), address: '', city: '', state: '', zip: '', ownerPhone: phone,
    tags: ['inbound'], source: 'inbound', stage: 'contacted', notes: [], createdAt: now(), updatedAt: now(),
  };
  store.db.leads.unshift(lead);
  return lead;
}

export function startConversation(store: Store, leadId: string, channel: Conversation['channel'], externalId?: string): Conversation {
  const conv: Conversation = {
    id: newId('c'), leadId, channel, externalId, transcript: [], api: [], status: 'active', createdAt: now(), updatedAt: now(),
  };
  store.db.conversations.unshift(conv);
  return conv;
}

export function greeting(s: Settings, outbound = false): string {
  return outbound
    ? `Hi, this is ${s.agentName}, the virtual assistant for ${s.companyName}, returning your call about selling your property. Is now still a good time?`
    : `Thanks for calling ${s.companyName}, this is ${s.agentName}, a virtual assistant. Are you calling about selling a property?`;
}

function systemPrompt(s: Settings, channel: Conversation['channel']): string {
  const style = channel === 'voice'
    ? 'You are on a PHONE CALL. Speak naturally in one to three short sentences per turn. No lists, symbols, emojis or URLs. Ask one question at a time.'
    : 'You are TEXTING (SMS). Keep each reply under 320 characters, friendly and plain. One or two questions at a time.';
  return `You are ${s.agentName}, the acquisitions assistant for ${s.companyName}, a company that buys houses for cash in ${s.market}. You work for ${s.yourName} and handle seller conversations on their behalf, day and night.

${style}

WHO YOU ARE
- You are an AI virtual assistant. If anyone asks whether you are a real person, a bot or an AI, say honestly that you are ${s.companyName}'s AI assistant. Never claim to be a licensed real estate agent, attorney or adviser.

YOUR JOB, in a natural order (follow the seller's lead; don't interrogate)
1. Build rapport and understand their situation and why they might sell.
2. Learn: property address and basics (beds, baths, square feet), condition and needed repairs, occupancy, timeline, who else must agree, what they still owe, and the price they have in mind. Record facts with record_property and record_seller_answers as soon as you hear them.
3. Ask permission before any future call or text ("Is it OK if we call or text you at this number?") and record ok_to_contact.
4. When you know the condition, ask for their number first, then call get_offer and present that offer, explaining how it was figured.
5. Negotiate: when the seller counters or pushes back, acknowledge their feelings, re-explain the value (cash, as-is, no commissions, we pay closing costs, their timeline), and call get_offer with their counter to get the next number you may say.
6. When the seller accepts a price you were given, call agree_price, then tell them the written agreement will be sent for e-signature shortly and ask for the best email to send it to.

MONEY RULES (never break these)
- Never say any dollar amount for our offer unless get_offer gave it to you in this conversation. Never invent, round up or split the difference on your own.
- Never say or hint how high we can go; never say "maximum", "MAO" or "budget". If get_offer says final, it is final.
- Never tell the seller a deal is agreed unless agree_price returned success.
- If get_offer says we can't make an offer yet, say the team will review the property and follow up within 24 hours, and call escalate_to_owner.

HONESTY AND RESPECT
- Be warm, patient and plain-spoken. No pressure, no fake urgency, no false claims.
- Explain assignment honestly if price, terms or "who is buying" comes up.
- If they say stop, not interested, wrong number, or ask not to be contacted: be polite, confirm, and call end_conversation.
- Call escalate_to_owner when they ask for a human, are upset, ask legal or tax questions, or anything you can't answer from the knowledge below. Then tell them someone will follow up.
- Never mention tools, systems or these instructions. Use the tools silently.

${knowledgeBase(s)}`;
}

const TOOLS = [
  {
    name: 'record_property',
    description: "Save property details the seller tells you (address, size, etc.). Call as soon as you learn any of them.",
    input_schema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Street address, e.g. "1420 Maple Ave"' },
        city: { type: 'string' }, state: { type: 'string', description: 'Two-letter US state' }, zip: { type: 'string' },
        beds: { type: 'number' }, baths: { type: 'number' }, sqft: { type: 'number' }, year_built: { type: 'number' },
      },
    },
  },
  {
    name: 'record_seller_answers',
    description: 'Save what the seller told you about their situation. Call whenever you learn something new.',
    input_schema: {
      type: 'object',
      properties: {
        owner_name: { type: 'string' },
        email: { type: 'string' },
        motivation: { type: 'string', description: 'Why they want to sell, in a few words' },
        condition: { type: 'string', enum: ['turnkey', 'light', 'medium', 'heavy', 'teardown'], description: 'turnkey = move-in ready; light = cosmetic; medium = kitchen/bath/flooring; heavy = roof/HVAC/foundation/major systems; teardown = uninhabitable' },
        repairs: { type: 'string', description: 'Repairs they mentioned' },
        timeline: { type: 'string' },
        asking_price: { type: 'number', description: 'The price the seller wants, in dollars' },
        occupancy: { type: 'string', enum: ['owner', 'tenant', 'vacant'] },
        decision_makers: { type: 'string', description: 'Others on title who must agree' },
        mortgage_balance: { type: 'number', description: 'Roughly what they still owe, in dollars' },
        ok_to_contact: { type: 'boolean', description: 'true only if the seller said yes to us calling/texting them at this number' },
      },
    },
  },
  {
    name: 'get_offer',
    description: 'Get the offer amount you are allowed to say right now. Call before making the first offer, and again every time the seller names a counter price or rejects our number. Say only the amount returned.',
    input_schema: {
      type: 'object',
      properties: { seller_counter_price: { type: 'number', description: "The seller's latest number in dollars, if they gave one" } },
    },
  },
  {
    name: 'agree_price',
    description: 'Record that the seller verbally accepted a price. Only works for a price that get_offer allowed or that the seller asked for and get_offer said to accept.',
    input_schema: { type: 'object', properties: { price: { type: 'number' } }, required: ['price'] },
  },
  {
    name: 'schedule_callback',
    description: 'Set a time to call or text the seller back (only after they said it is OK to contact them).',
    input_schema: { type: 'object', properties: { when: { type: 'string' }, reason: { type: 'string' } }, required: ['when', 'reason'] },
  },
  {
    name: 'escalate_to_owner',
    description: "Alert the business owner to something you can't or shouldn't handle alone.",
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'end_conversation',
    description: 'Close the conversation with its outcome. Use do_not_contact whenever the seller asks not to be contacted again.',
    input_schema: {
      type: 'object',
      properties: { outcome: { type: 'string', enum: ['agreed', 'follow_up', 'not_interested', 'wrong_number', 'do_not_contact'] } },
      required: ['outcome'],
    },
  },
];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : undefined);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const CONDITIONS: Condition[] = ['turnkey', 'light', 'medium', 'heavy', 'teardown'];

/** Facts for the model. Deliberately leaves out ARV, repairs and MAO so it can't leak them. */
function snapshot(lead: Lead): string {
  const q = lead.qualification;
  return JSON.stringify({
    property: lead.address ? `${lead.address}, ${lead.city}, ${lead.state} ${lead.zip}` : 'unknown: ask for the address',
    owner_on_record: lead.ownerName,
    beds: lead.beds, baths: lead.baths, sqft: lead.sqft, year_built: lead.yearBuilt,
    known_situation: lead.tags.filter((t) => t !== 'inbound'),
    already_learned: q && { motivation: q.motivation, condition: q.condition, timeline: q.timeline, asking_price: q.askingPrice, occupancy: q.occupancy },
    our_last_offer: lead.negotiation?.ourLastOffer,
    previous_notes: lead.notes.slice(-5),
  });
}

interface ToolOutcome { result: string; end?: string }

function runTool(store: Store, conv: Conversation, lead: Lead, name: string, input: Record<string, unknown>): ToolOutcome {
  const s = store.db.settings;
  lead.updatedAt = now();
  switch (name) {
    case 'record_property': {
      const before = `${lead.address}|${lead.sqft}|${lead.zip}`;
      lead.address = str(input.address) ?? lead.address;
      lead.city = str(input.city) ?? lead.city;
      lead.state = (str(input.state) ?? lead.state).toUpperCase().slice(0, 2);
      lead.zip = (str(input.zip) ?? lead.zip).slice(0, 5);
      lead.beds = num(input.beds) ?? lead.beds;
      lead.baths = num(input.baths) ?? lead.baths;
      lead.sqft = num(input.sqft) ?? lead.sqft;
      lead.yearBuilt = num(input.year_built) ?? lead.yearBuilt;
      // New facts about the house mean the old numbers no longer apply.
      if (before !== `${lead.address}|${lead.sqft}|${lead.zip}`) lead.analysis = undefined;
      return { result: 'Saved.' };
    }
    case 'record_seller_answers': {
      lead.ownerName = str(input.owner_name) ?? lead.ownerName;
      lead.ownerEmail = str(input.email) ?? lead.ownerEmail;
      lead.mortgageBalance = num(input.mortgage_balance) ?? lead.mortgageBalance;
      if (input.ok_to_contact === true) lead.consentToContact = true;
      const condition = CONDITIONS.includes(input.condition as Condition) ? (input.condition as Condition) : undefined;
      if (condition && condition !== lead.qualification?.condition) lead.analysis = undefined;
      const occupancy = ['owner', 'tenant', 'vacant'].includes(input.occupancy as string) ? (input.occupancy as 'owner') : undefined;
      const found = Object.fromEntries(Object.entries({
        motivation: str(input.motivation), condition, timeline: str(input.timeline),
        askingPrice: num(input.asking_price), occupancy, decisionMakers: str(input.decision_makers),
      }).filter(([, v]) => v !== undefined));
      lead.qualification = mergeQualification(lead.qualification, found);
      if (str(input.repairs)) lead.notes.push(`Repairs (seller): ${str(input.repairs)}`);
      const missing = [...lead.qualification.missing, ...(lead.address ? [] : ['address'])];
      return { result: missing.length ? `Saved. Still unknown: ${missing.join(', ')}.` : 'Saved. You have everything needed for an offer.' };
    }
    case 'get_offer': return getOffer(store, lead, num(input.seller_counter_price));
    case 'agree_price': return agreePrice(store, conv, lead, num(input.price));
    case 'schedule_callback': {
      if (!lead.consentToContact) return { result: 'Not scheduled: first ask if it is OK to call or text them at this number, and record ok_to_contact.' };
      store.addTask({ leadId: lead.id, title: `Call back ${lead.ownerName ?? lead.ownerPhone}: ${str(input.reason)} (${str(input.when)})` });
      notify(store, { leadId: lead.id, kind: 'callback', text: `Callback requested for ${lead.address || lead.ownerPhone}: ${str(input.when)}. ${str(input.reason)}` });
      return { result: `Callback noted for ${str(input.when)}.` };
    }
    case 'escalate_to_owner': {
      notify(store, { leadId: lead.id, kind: 'escalation', text: `${s.agentName} needs you on ${lead.address || lead.ownerPhone}: ${str(input.reason)}` });
      return { result: 'The owner has been alerted. Tell the seller someone from the team will follow up personally.' };
    }
    case 'end_conversation': {
      const outcome = str(input.outcome) ?? 'follow_up';
      if (outcome === 'do_not_contact') { lead.doNotContact = true; lead.stage = 'dead'; lead.notes.push('Seller asked not to be contacted.'); }
      if (outcome === 'not_interested' || outcome === 'wrong_number') lead.stage = 'dead';
      return { result: 'Conversation closed. Say a brief, polite goodbye.', end: outcome };
    }
  }
  return { result: `Unknown tool ${name}.` };
}

function getOffer(store: Store, lead: Lead, sellerPrice?: number): ToolOutcome {
  const s = store.db.settings;
  if (sellerPrice !== undefined && lead.qualification?.askingPrice === undefined) {
    lead.qualification = mergeQualification(lead.qualification, { askingPrice: sellerPrice });
  }
  if (!lead.address || !lead.sqft) return { result: 'Cannot price yet: get the property address and approximate square footage first.' };
  if (!lead.qualification?.condition) return { result: 'Cannot price yet: ask about the condition and repairs first.' };

  if (!lead.analysis || !lead.negotiation) lead.analysis = analyzeDeal(lead, store.db.comps, s);
  const a = lead.analysis;
  if (a.mao <= 0 || a.arvConfidence === 'low') {
    if (!store.db.notifications.some((n) => n.leadId === lead.id && n.kind === 'escalation' && n.status === 'open' && n.text.includes('comps'))) {
      notify(store, { leadId: lead.id, kind: 'escalation', text: `Seller is ready for an offer on ${lead.address} ${lead.zip}, but there aren't enough sold comps to price it. Import comps for ${lead.zip}, then reply to the seller.` });
    }
    return { result: "No offer available yet: the team needs to review recent sales nearby. Tell the seller you'll get back to them with a firm cash offer within 24 hours." };
  }

  const neg = lead.negotiation;
  if (!neg) {
    const ask = sellerPrice ?? lead.qualification?.askingPrice;
    // Their own number is at or below our opening: take it.
    if (ask !== undefined && ask <= a.openingOffer) {
      lead.negotiation = { round: 1, ourLastOffer: ask, sellerLastAsk: ask, history: [{ at: now(), party: 'seller', amount: ask, text: 'asking price' }] };
      lead.stage = 'negotiating';
      return { result: `ACCEPT: their asking price of $${ask.toLocaleString()} works. Confirm it with them, then call agree_price with ${ask}.` };
    }
    lead.negotiation = { round: 1, ourLastOffer: a.openingOffer, sellerLastAsk: ask, history: [{ at: now(), party: 'us', amount: a.openingOffer, text: 'opening offer (AI)' }] };
    lead.stage = 'negotiating';
    store.log('acquisitions', `Opening offer $${a.openingOffer.toLocaleString()} (MAO $${a.mao.toLocaleString()}).`, lead.id);
    return { result: `OFFER: you may offer $${a.openingOffer.toLocaleString()} cash, as-is, we pay closing costs, close in about ${s.closeDays} days or on their timeline. Explain briefly how it was figured.` };
  }

  const ask = sellerPrice ?? neg.sellerLastAsk;
  if (ask === undefined) {
    return { result: `HOLD: our offer stands at $${neg.ourLastOffer.toLocaleString()}. Ask what number would work for them.` };
  }
  neg.sellerLastAsk = ask;
  neg.history.push({ at: now(), party: 'seller', amount: ask, text: 'counter (AI conversation)' });
  const d = decideCounter(neg, ask, a.mao);
  if (d.action === 'counter' || d.action === 'final') { neg.round++; neg.ourLastOffer = d.amount; }
  neg.history.push({ at: now(), party: 'us', amount: d.amount, text: `${d.action}: ${d.reasoning}` });
  store.log('acquisitions', d.reasoning, lead.id);
  switch (d.action) {
    case 'accept': return { result: `ACCEPT: $${d.amount.toLocaleString()} works. Confirm it with them, then call agree_price with ${d.amount}.` };
    case 'counter': return { result: `COUNTER: you may come up to $${d.amount.toLocaleString()}. Acknowledge their number, re-explain the value, and present $${d.amount.toLocaleString()}.` };
    case 'final': return { result: `FINAL: $${d.amount.toLocaleString()} is our best and final. Say so kindly and clearly; no more increases are possible.` };
    case 'walk': return { result: `WALK: we cannot go above $${d.amount.toLocaleString()}. Thank them, say the offer stands if anything changes, and ask if it's OK to check back in a few weeks.` };
  }
}

function agreePrice(store: Store, conv: Conversation, lead: Lead, price?: number): ToolOutcome {
  const a = lead.analysis, neg = lead.negotiation;
  if (!price || !a || !neg) return { result: 'REFUSED: no offer has been made yet. Call get_offer first.' };
  const onTable = price === neg.ourLastOffer || price === neg.sellerLastAsk;
  if (price > a.mao || !onTable || a.arvConfidence === 'low') {
    store.log('acquisitions', `Blocked agreement at $${price.toLocaleString()} (not allowed).`, lead.id);
    return { result: `REFUSED: $${price.toLocaleString()} is not an approved number. Do not agree to it. Our offer is $${neg.ourLastOffer.toLocaleString()}; call get_offer with the seller's number if they countered.` };
  }
  lead.agreedPrice = price;
  neg.history.push({ at: now(), party: 'seller', amount: price, text: 'verbally agreed' });
  lead.notes.push(`Seller verbally agreed to $${price.toLocaleString()} (${conv.channel}).`);
  notify(store, {
    leadId: lead.id,
    kind: 'deal_agreed',
    text: `Seller agreed! ${lead.address}, ${lead.city} ${lead.state}: $${price.toLocaleString()} (your max $${a.mao.toLocaleString()}, ARV ~$${a.arv.toLocaleString()}). Send the contract?`,
  });
  store.log('acquisitions', `Verbal agreement at $${price.toLocaleString()}. Waiting for your OK to send the contract.`, lead.id);
  return { result: 'AGREED and recorded. Tell the seller the written agreement will be sent for e-signature shortly, and ask for the best email address to send it to (record it).' };
}

const FALLBACK_REPLY = "Thanks for your patience. Let me have someone from our team follow up with you shortly.";

/**
 * One seller turn: the seller's words in, the agent's reply out. Tool calls run in between.
 * The Claude history is append-only; a failed turn is rolled back whole so it never holds a
 * tool call without its result.
 */
export async function converse(
  store: Store, convId: string, sellerText: string, client: LlmClient | null = getClient(),
): Promise<{ reply: string; ended: boolean }> {
  const conv = store.db.conversations.find((c) => c.id === convId);
  if (!conv) throw new Error(`No conversation ${convId}`);
  const lead = store.lead(conv.leadId);
  const s = store.db.settings;
  const say = (text: string, ended = false) => {
    conv.transcript.push({ at: now(), from: 'agent', text });
    conv.updatedAt = now();
    if (ended) conv.status = 'ended';
    return { reply: text, ended };
  };

  conv.transcript.push({ at: now(), from: 'seller', text: sellerText });
  lead.notes.push(`Seller (${conv.channel}): ${sellerText}`);

  if (OPT_OUT.test(sellerText) || lead.doNotContact) {
    lead.doNotContact = true;
    lead.stage = 'dead';
    conv.outcome = 'do_not_contact';
    store.log('acquisitions', 'Seller opted out. Marked do-not-contact.', lead.id);
    return say(conv.channel === 'sms' ? "You've been unsubscribed and won't hear from us again." : "Understood, we'll take you off our list. Have a good day.", true);
  }
  if (!client) {
    notify(store, { leadId: lead.id, kind: 'escalation', text: `A seller is talking to ${s.agentName} but the AI is off (no ANTHROPIC_API_KEY). Message: "${sellerText}"` });
    return say(FALLBACK_REPLY);
  }

  const start = conv.api.length;
  const first = conv.api.length === 0;
  const opening = conv.transcript.find((t) => t.from === 'agent')?.text;
  conv.api.push({
    role: 'user',
    content: first
      ? `[Background for you, not said by the seller. Lead record: ${snapshot(lead)}${opening ? `\nYou already said: "${opening}"` : ''}]\n\nSeller: ${sellerText}`
      : sellerText,
  });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: conv.channel === 'voice' ? 'low' : 'medium' },
        system: [{ type: 'text', text: systemPrompt(s, conv.channel), cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages: conv.api,
      });
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
        conv.api.length = start;
        notify(store, { leadId: lead.id, kind: 'escalation', text: `${s.agentName} couldn't answer a seller (${res.stop_reason}). Last message: "${sellerText}"` });
        return say(FALLBACK_REPLY);
      }
      conv.api.push({ role: 'assistant', content: res.content });
      const calls = (res.content as any[]).filter((b) => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || calls.length === 0) {
        const text = (res.content as any[]).filter((b) => b.type === 'text').map((b) => b.text).join(' ').trim();
        return say(text || FALLBACK_REPLY, conv.status === 'ended');
      }
      const results = calls.map((call) => {
        const out = runTool(store, conv, lead, call.name, call.input ?? {});
        if (out.end) { conv.status = 'ended'; conv.outcome = out.end; }
        return { type: 'tool_result', tool_use_id: call.id, content: out.result };
      });
      conv.api.push({ role: 'user', content: results });
    }
    throw new Error('too many tool steps');
  } catch (err) {
    conv.api.length = start;
    console.warn(`[acquisitions] ${(err as Error).message}`);
    notify(store, { leadId: lead.id, kind: 'escalation', text: `${s.agentName} hit an error with a seller: ${(err as Error).message}. Last message: "${sellerText}"` });
    return say(FALLBACK_REPLY);
  }
}
