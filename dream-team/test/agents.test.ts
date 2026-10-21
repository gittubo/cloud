import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buyersFromCsv, compsFromCsv, leadsFromCsv, parseCsv } from '../src/csv.ts';
import { DEFAULT_SETTINGS, Store } from '../src/store.ts';
import { scoreLead } from '../src/agents/scout.ts';
import { analyzeDeal } from '../src/agents/analyst.ts';
import { mergeQualification, parseReply } from '../src/agents/isa.ts';
import { decideCounter } from '../src/agents/negotiator.ts';
import { matchBuyers } from '../src/agents/dispositions.ts';
import * as team from '../src/team.ts';

const TODAY = new Date('2026-10-21T00:00:00Z');
const sample = (f: string) => readFileSync(new URL(`../sample/${f}`, import.meta.url), 'utf8');

test('csv parser handles quotes, commas and CRLF', () => {
  const rows = parseCsv('Name,Note\r\n"Smith, Jo","said ""hi"""\r\n');
  assert.deepEqual(rows, [{ name: 'Smith, Jo', note: 'said "hi"' }]);
});

test('lead import maps list columns to distress tags and flags absentee owners', () => {
  const leads = leadsFromCsv(sample('leads.csv'), 'sample');
  assert.equal(leads.length, 6);
  assert.deepEqual(leads[0].tags.sort(), ['pre-foreclosure', 'vacant']);
  assert.ok(leads[1].tags.includes('absentee'));
  assert.ok(leads[1].tags.includes('free-and-clear'));
  assert.equal(leads[0].sqft, 1150);
});

test('scout ranks stacked distress above a thin-equity lead and kills no-equity leads', () => {
  const [maple, oak, , fictional] = leadsFromCsv(sample('leads.csv'), 'sample');
  const a = scoreLead(maple, TODAY), b = scoreLead(oak, TODAY), c = scoreLead(fictional, TODAY);
  assert.ok(a.score > c.score);
  assert.ok(b.score > c.score);
  assert.equal(c.noEquity, true, '160k value with 151k loan is not wholesaleable');
});

test('analyst: ARV from renovated comps, excludes distressed, MAO = 70% ARV - repairs - fee', () => {
  const [maple] = leadsFromCsv(sample('leads.csv'), 'sample');
  maple.qualification = { condition: 'heavy', askingPrice: 25000, missing: [] };
  const a = analyzeDeal(maple, compsFromCsv(sample('comps.csv')), DEFAULT_SETTINGS, TODAY);
  assert.ok(!a.compsUsed.some((c) => c.includes('Mockingbird')), 'distressed comp excluded');
  assert.equal(a.arvConfidence, 'high');
  assert.ok(a.arv > 140000 && a.arv < 160000, `ARV ${a.arv}`);
  const expected = Math.round((a.arv * 0.7 - a.repairEstimate - 10000) / 500) * 500;
  assert.equal(a.mao, expected);
  assert.ok(a.openingOffer < a.mao);
  assert.equal(a.verdict, 'strong');
});

test('isa extracts price, condition, timeline, occupancy and motivation from a reply', () => {
  const r = parseReply("Roof leaks and it needs everything. Tenant moved out so it's empty. Behind on payments. I'd take 85k if you close in 30 days.");
  assert.equal(r.askingPrice, 85000);
  assert.equal(r.condition, 'heavy');
  assert.equal(r.timeline, 'in 30 days');
  assert.equal(r.motivation, 'behind on payments');
  assert.equal(mergeQualification(undefined, r).missing.length, 0);
});

test('negotiator never offers above MAO and ends with best and final', () => {
  const mao = 60000;
  const state = { round: 1, ourLastOffer: 51000, history: [] };
  let d = decideCounter(state, 90000, mao);
  const offers: number[] = [];
  while (d.action === 'counter') {
    offers.push(d.amount);
    state.round++; state.ourLastOffer = d.amount;
    d = decideCounter(state, 90000, mao);
  }
  assert.ok(offers.length > 0 && offers.every((o) => o < mao), `offers ${offers}`);
  assert.ok(offers.every((o, i) => i === 0 || o > offers[i - 1]), 'offers rise each round');
  assert.equal(d.action, 'final');
  assert.equal(d.amount, mao);
  state.ourLastOffer = mao;
  assert.equal(decideCounter(state, 90000, mao).action, 'walk');
  assert.equal(decideCounter({ round: 1, ourLastOffer: 51000, history: [] }, 58000, mao).action, 'accept');
});

test('dispositions only matches buyers in the area and within budget', () => {
  const [maple] = leadsFromCsv(sample('leads.csv'), 'sample');
  const names = matchBuyers(maple, 80000, buyersFromCsv(sample('buyers.csv')), TODAY).map((m) => m.buyer.name);
  // Same zip ranks first; same metro (381xx) next; over-budget and out-of-state buyers are out.
  assert.deepEqual(names, ['Bluff City Flips LLC', 'Example Capital Partners']);
});

test('full pipeline: every outbound message waits for approval', async () => {
  const store = new Store(null);
  store.db.leads.push(...leadsFromCsv(sample('leads.csv'), 'sample'));
  store.db.comps.push(...compsFromCsv(sample('comps.csv')));
  store.db.buyers.push(...buyersFromCsv(sample('buyers.csv')));
  team.scoutAll(store);
  const lead = store.db.leads[0];

  await team.startOutreach(store, lead.id);
  const firstTouch = store.db.drafts.find((d) => d.channel === 'sms')!;
  assert.match(firstTouch.body, /Reply STOP/);
  team.approveDraft(store, firstTouch.id);
  assert.equal(lead.stage, 'contacted');

  await team.handleSellerReply(store, lead.id, "It needs everything, roof leaks. It's vacant. I'd want 90k, need to sell in 30 days because I'm behind on payments.");
  assert.equal(lead.stage, 'analyzed');
  const mao = lead.analysis!.mao;

  await team.makeOffer(store, lead.id);
  assert.equal(lead.stage, 'negotiating');
  assert.match(store.db.drafts[0].body, /assign/i, 'offer discloses assignment');

  await team.handleSellerReply(store, lead.id, 'That is way too low, Zillow says 150k. I need $90,000.');
  assert.ok(lead.negotiation!.ourLastOffer <= mao);
  assert.match(store.db.drafts[0].body, /online numbers/);

  await team.contractSigned(store, lead.id, lead.negotiation!.ourLastOffer, '2026-11-20');
  assert.equal(lead.stage, 'marketed');
  assert.ok(store.db.tasks.some((t) => /payoff/.test(t.title)), 'pre-foreclosure gets a payoff task');
  assert.ok(store.db.drafts.some((d) => d.agent === 'dispositions'));
  assert.ok(store.db.drafts.every((d) => d.status === 'pending' || d.id === firstTouch.id), 'nothing auto-approved');
});
