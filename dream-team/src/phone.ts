// Phone line for the Acquisition Manager, through Twilio: answers calls and texts 24/7 and
// calls back sellers who said it's OK. Twilio turns speech to text, the agent replies, and
// Twilio reads the reply aloud.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Lead } from './types.ts';
import type { Store } from './store.ts';
import { converse, findOrCreateLeadByPhone, greeting, startConversation, type LlmClient } from './agents/acquisitions.ts';
import { getClient } from './llm.ts';

const VOICE = () => process.env.TWILIO_VOICE || 'Polly.Joanna-Neural';
const env = (k: string) => process.env[k];

/** Twilio signs every webhook; reject anything that isn't from your Twilio account. */
export function validTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = Buffer.from(createHmac('sha1', authToken).update(data).digest('base64'));
  const got = Buffer.from(signature);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

const xml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const twiml = (inner: string) => `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
const say = (text: string) => `<Say voice="${VOICE()}">${xml(text)}</Say>`;
const listen = (text: string) =>
  `<Gather input="speech" action="/twilio/voice/turn" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true" actionOnEmptyResult="true">${say(text)}</Gather>`;

const silentTurns = new Map<string, number>();

export function voiceStart(store: Store, params: Record<string, string>, outboundLeadId?: string): string {
  const s = store.db.settings;
  const lead = outboundLeadId ? store.lead(outboundLeadId) : findOrCreateLeadByPhone(store, params.From ?? '');
  if (lead.doNotContact) return twiml(`${say('Sorry, we can’t take this call. Goodbye.')}<Hangup/>`);
  const conv = startConversation(store, lead.id, 'voice', params.CallSid);
  const hello = greeting(s, Boolean(outboundLeadId));
  conv.transcript.push({ at: new Date().toISOString(), from: 'agent', text: hello });
  store.log('acquisitions', `${outboundLeadId ? 'Calling back' : 'Answered a call from'} ${lead.ownerPhone}.`, lead.id);
  return twiml(listen(hello));
}

export async function voiceTurn(store: Store, params: Record<string, string>, client: LlmClient | null = getClient()): Promise<string> {
  const conv = store.db.conversations.find((c) => c.externalId === params.CallSid);
  if (!conv || conv.status === 'ended') return twiml('<Hangup/>');
  const speech = (params.SpeechResult ?? '').trim();
  if (!speech) {
    const n = (silentTurns.get(conv.id) ?? 0) + 1;
    silentTurns.set(conv.id, n);
    if (n >= 3) { conv.status = 'ended'; return twiml(`${say("I'll let you go. Call us back any time. Goodbye.")}<Hangup/>`); }
    return twiml(listen("Sorry, I didn't catch that. Could you say that again?"));
  }
  silentTurns.delete(conv.id);
  const { reply, ended } = await converse(store, conv.id, speech, client);
  return twiml(ended ? `${say(reply)}<Hangup/>` : listen(reply));
}

export async function smsIn(store: Store, params: Record<string, string>, client: LlmClient | null = getClient()): Promise<string> {
  const lead = findOrCreateLeadByPhone(store, params.From ?? '');
  const conv = store.db.conversations.find((c) => c.leadId === lead.id && c.channel === 'sms' && c.status === 'active')
    ?? startConversation(store, lead.id, 'sms');
  const { reply } = await converse(store, conv.id, (params.Body ?? '').trim(), client);
  return twiml(`<Message>${xml(reply)}</Message>`);
}

// Rough main time zone per state, for the 8am–9pm calling window.
const TZ: Record<string, string> = Object.fromEntries([
  ...'CT DE DC FL GA IN KY ME MD MA MI NH NJ NY NC OH PA RI SC VT VA WV'.split(' ').map((s) => [s, 'America/New_York']),
  ...'AL AR IL IA KS LA MN MS MO NE ND OK SD TN TX WI'.split(' ').map((s) => [s, 'America/Chicago']),
  ...'AZ'.split(' ').map((s) => [s, 'America/Phoenix']),
  ...'CO ID MT NM UT WY'.split(' ').map((s) => [s, 'America/Denver']),
  ...'CA NV OR WA'.split(' ').map((s) => [s, 'America/Los_Angeles']),
  ['AK', 'America/Anchorage'], ['HI', 'Pacific/Honolulu'],
]);

export function withinCallingHours(state: string, at = new Date()): boolean {
  const zones = TZ[state] ? [TZ[state]] : ['America/New_York', 'America/Los_Angeles'];
  return zones.every((timeZone) => {
    const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(at));
    return hour >= 8 && hour < 21;
  });
}

/** Calls a seller back. Only for sellers who said it's OK, never for do-not-contact, and only 8am–9pm their time. */
export async function placeCallback(store: Store, lead: Lead): Promise<string> {
  if (!lead.consentToContact) throw new Error('This seller has not said it is OK to call them. The AI only calls people who gave permission.');
  if (lead.doNotContact) throw new Error('This seller asked not to be contacted.');
  if (!lead.ownerPhone) throw new Error('No phone number for this seller.');
  if (!withinCallingHours(lead.state)) throw new Error("Outside 8am–9pm in the seller's time zone. Try again later.");
  const sid = env('TWILIO_ACCOUNT_SID'), token = env('TWILIO_AUTH_TOKEN'), from = env('TWILIO_PHONE_NUMBER'), base = env('PUBLIC_URL');
  if (!sid || !token || !from || !base) throw new Error('Phone line not connected: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER and PUBLIC_URL.');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: lead.ownerPhone, From: from, Url: `${base}/twilio/voice?lead=${lead.id}` }),
  });
  const body = await res.json() as { sid?: string; message?: string };
  if (!res.ok) throw new Error(`Twilio: ${body.message ?? res.status}`);
  store.log('acquisitions', `Calling ${lead.ownerName ?? lead.ownerPhone} back.`, lead.id);
  return body.sid!;
}
