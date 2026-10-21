import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { compsFromCsv, leadsFromCsv } from '../src/csv.ts';
import { Store } from '../src/store.ts';
import { converse, startConversation, type LlmClient } from '../src/agents/acquisitions.ts';
import { validTwilioSignature, withinCallingHours } from '../src/phone.ts';
import * as team from '../src/team.ts';

const sample = (f: string) => readFileSync(new URL(`../sample/${f}`, import.meta.url), 'utf8');

function setup() {
  const store = new Store(null);
  store.db.leads.push(...leadsFromCsv(sample('leads.csv'), 'sample'));
  store.db.comps.push(...compsFromCsv(sample('comps.csv')));
  const lead = store.db.leads[0];
  const conv = startConversation(store, lead.id, 'sms');
  return { store, lead, conv };
}

/** A stand-in for Claude: plays back scripted turns and records every request it receives. */
function scripted(turns: any[][]): LlmClient & { requests: any[]; toolResults: () => string[] } {
  const requests: any[] = [];
  let i = 0;
  let id = 0;
  return {
    requests,
    toolResults: () => requests.flatMap((r) => r.messages.flatMap((m: any) =>
      Array.isArray(m.content) ? m.content.filter((b: any) => b.type === 'tool_result').map((b: any) => b.content) : [])),
    beta: {
      messages: {
        async create(params: any) {
          requests.push(structuredClone(params));
          const blocks = turns[i++] ?? [{ type: 'text', text: '(script ended)' }];
          const content = blocks.map((b) => (b.type === 'tool_use' ? { id: `tu_${++id}`, ...b } : b));
          return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn' };
        },
      },
    },
  };
}
const tool = (name: string, input: object) => ({ type: 'tool_use', name, input });
const text = (t: string) => ({ type: 'text', text: t });

test('acquisition manager qualifies, offers, negotiates within MAO and blocks agreements above it', async () => {
  const { store, lead, conv } = setup();
  const ai = scripted([
    [tool('record_seller_answers', { condition: 'heavy', occupancy: 'vacant', motivation: 'behind on payments', timeline: '30 days', asking_price: 40000, ok_to_contact: true })],
    [tool('get_offer', {})],
    [text('We could do $24,000 cash, as-is.')],
    [tool('get_offer', { seller_counter_price: 40000 })],
    [text('I can come up a bit.')],
    // The model tries to agree above what it was given: must be refused.
    [tool('agree_price', { price: 40000 })],
    [text("I can't do that number.")],
  ]);
  await converse(store, conv.id, "Roof leaks, it's vacant, I want 40k, behind on payments", ai);
  assert.equal(lead.stage, 'negotiating');
  assert.equal(lead.consentToContact, true);
  const opening = lead.negotiation!.ourLastOffer;
  const mao = lead.analysis!.mao;
  assert.ok(opening < mao);

  await converse(store, conv.id, 'That is way too low, I need 40,000', ai);
  const counter = lead.negotiation!.ourLastOffer;
  assert.ok(counter > opening && counter <= mao, `counter ${counter} within (${opening}, ${mao}]`);

  await converse(store, conv.id, 'Fine, 40k and we have a deal', ai);
  assert.equal(lead.agreedPrice, undefined, 'agreement above MAO was blocked');
  assert.ok(ai.toolResults().some((r) => r.startsWith('REFUSED')));
  assert.equal(store.db.notifications.filter((n) => n.kind === 'deal_agreed').length, 0);

  // MAO and ARV never reach the model.
  const sent = JSON.stringify(ai.requests);
  assert.ok(!sent.includes(mao.toLocaleString()) && !sent.includes(lead.analysis!.arv.toLocaleString()), 'MAO/ARV leaked to the model');
  // Every request carries the full history unchanged (append-only).
  for (let k = 1; k < ai.requests.length; k++) {
    assert.deepEqual(ai.requests[k].messages.slice(0, ai.requests[k - 1].messages.length), ai.requests[k - 1].messages);
  }
});

test('an accepted on-the-table price becomes a deal you approve with one tap', async () => {
  const { store, lead, conv } = setup();
  const ai = scripted([
    [tool('record_seller_answers', { condition: 'heavy', asking_price: 20000, email: 'seller@example.com' })],
    [tool('get_offer', {})],
    [tool('agree_price', { price: 20000 })],
    [text("Great, we're agreed at $20,000. I'll send the agreement to seller@example.com.")],
  ]);
  await converse(store, conv.id, 'Needs a new roof. I just want 20k for it.', ai);
  assert.equal(lead.agreedPrice, 20000);
  const n = store.db.notifications.find((x) => x.kind === 'deal_agreed')!;
  assert.match(n.text, /\$20,000/);
  const msg = await team.decideDeal(store, n.id, true);
  assert.match(msg, /Approved/);
  assert.equal(n.status, 'approved');
  assert.ok(store.db.tasks.some((t) => /purchase agreement/.test(t.title)));
  assert.equal(await team.decideDeal(store, n.id, true), 'Already approved.');
});

test('no comps means no autonomous offer: it escalates to you instead', async () => {
  const { store, lead, conv } = setup();
  store.db.comps = [];
  lead.estimatedValue = undefined;
  const ai = scripted([[tool('record_seller_answers', { condition: 'medium' })], [tool('get_offer', {})], [text("I'll get back to you within 24 hours.")]]);
  await converse(store, conv.id, 'Needs some work.', ai);
  assert.equal(lead.negotiation, undefined);
  assert.ok(ai.toolResults().some((r) => r.startsWith('No offer available')));
  assert.ok(store.db.notifications.some((n) => n.kind === 'escalation' && /comps/.test(n.text)));
});

test('STOP opts the seller out without calling the AI, and blocks them for good', async () => {
  const { store, lead, conv } = setup();
  const ai = scripted([]);
  const r = await converse(store, conv.id, 'STOP', ai);
  assert.equal(ai.requests.length, 0);
  assert.equal(lead.doNotContact, true);
  assert.equal(r.ended, true);
  await converse(store, conv.id, 'hello again', ai);
  assert.equal(ai.requests.length, 0, 'never talks to an opted-out seller');
});

test('a failed AI turn is rolled back whole and handed to you', async () => {
  const { store, conv } = setup();
  const ai: LlmClient = { beta: { messages: { create: async () => { throw new Error('network down'); } } } };
  const r = await converse(store, conv.id, 'hi', ai);
  assert.equal(conv.api.length, 0);
  assert.match(r.reply, /follow up/);
  assert.ok(store.db.notifications.some((n) => /network down/.test(n.text)));
});

test('twilio signature check accepts Twilio-signed requests only', () => {
  const url = 'https://example.com/twilio/sms';
  const params = { From: '+15550100101', Body: 'hi' };
  const sig = createHmac('sha1', 'secret').update(url + 'Bodyhi' + 'From+15550100101').digest('base64');
  assert.equal(validTwilioSignature('secret', url, params, sig), true);
  assert.equal(validTwilioSignature('secret', url, { ...params, Body: 'tampered' }, sig), false);
  assert.equal(validTwilioSignature('other', url, params, sig), false);
});

test('callbacks only within 8am-9pm in the seller time zone', () => {
  assert.equal(withinCallingHours('TN', new Date('2026-10-21T15:00:00Z')), true); // 10am Central
  assert.equal(withinCallingHours('TN', new Date('2026-10-21T03:00:00Z')), false); // 10pm Central
  assert.equal(withinCallingHours('CA', new Date('2026-10-21T14:00:00Z')), false); // 7am Pacific
});
