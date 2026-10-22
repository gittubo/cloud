import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leadsFromCsv } from '../src/csv.ts';
import { Store } from '../src/store.ts';
import { scan, type ScanJob, type StreetPhoto } from '../src/agents/atlas.ts';
import type { LlmClient } from '../src/agents/acquisitions.ts';
import { scoutAll } from '../src/team.ts';

const sample = (f: string) => readFileSync(new URL(`../sample/${f}`, import.meta.url), 'utf8');
const job = (): ScanJob => ({ id: 'a1', label: '38109', status: 'running', total: 0, scanned: 0, flagged: 0, noPhoto: 0, startedAt: '' });
const photo: StreetPhoto = { base64: Buffer.from('jpg').toString('base64'), mediaType: 'image/jpeg', date: '2025-06' };

/** Fake Claude vision: returns a rating chosen by the address in the prompt. */
function rater(byAddress: Record<string, object>): LlmClient & { calls: any[] } {
  const calls: any[] = [];
  return {
    calls,
    beta: { messages: { async create(params: any) {
      calls.push(params);
      const prompt: string = params.messages[0].content[1].text;
      const hit = Object.entries(byAddress).find(([a]) => prompt.includes(a));
      return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(hit?.[1] ?? { house_visible: true, distress_score: 1, signs: [], summary: 'Well kept.' }) }] };
    } } },
  };
}

test('atlas adds only distressed new addresses as leads, ranked high by the scout', async () => {
  const store = new Store(null);
  const ai = rater({
    '12 Run Down Rd': { house_visible: true, distress_score: 9, signs: ['boarded windows', 'overgrown yard'], summary: 'Looks abandoned.' },
    '14 Blurry Ln': { house_visible: false, distress_score: 8, signs: [], summary: 'Blocked by a truck.' },
  });
  const targets = [
    { address: '10 Nice St', city: 'Memphis', state: 'TN', zip: '38109' },
    { address: '12 Run Down Rd', city: 'Memphis', state: 'TN', zip: '38109' },
    { address: '14 Blurry Ln', city: 'Memphis', state: 'TN', zip: '38109' },
    { address: '16 No Photo Way', city: 'Memphis', state: 'TN', zip: '38109' },
  ];
  const j = job();
  await scan(store, j, targets, { photo: async (loc) => (loc.includes('No Photo') ? null : photo), client: ai, imageDir: null });

  assert.deepEqual([j.scanned, j.flagged, j.noPhoto], [4, 1, 1]);
  assert.equal(ai.calls.length, 3, 'no AI call when there is no photo');
  assert.equal(ai.calls[0].output_config.format.type, 'json_schema');
  assert.deepEqual(store.db.leads.map((l) => l.address), ['12 Run Down Rd'], 'only the distressed, clearly visible house becomes a lead');
  const lead = store.db.leads[0];
  assert.equal(lead.source, 'atlas:38109');
  assert.ok(lead.tags.includes('looks-distressed'));

  scoutAll(store);
  assert.equal(lead.stage, 'scored');
  assert.ok(lead.scoreReasons!.some((r) => /street, 9\/10 \(\+30\)/.test(r)));
});

test('scanning existing leads records the photo verdict and re-ranks them', async () => {
  const store = new Store(null);
  store.db.leads.push(...leadsFromCsv(sample('leads.csv'), 'sample'));
  scoutAll(store);
  const oak = store.db.leads[1];
  const before = oak.motivationScore!;
  const ai = rater({ [oak.address]: { house_visible: true, distress_score: 7, signs: ['peeling paint', 'roof tarp'], summary: 'Clearly run down.' } });
  const j = job();
  await scan(store, j, store.db.leads.filter((l) => l.stage !== 'dead'), { photo: async () => photo, client: ai, imageDir: null });
  scoutAll(store);
  assert.equal(oak.visual!.score, 7);
  assert.equal(oak.visual!.imageDate, '2025-06');
  assert.ok(oak.motivationScore! > before, `score rose from ${before} to ${oak.motivationScore}`);
  assert.equal(store.db.leads.length, 6, 'no duplicate leads created');
});

test('a bad Google key stops the scan instead of silently skipping every house', async () => {
  const store = new Store(null);
  const j = job();
  await assert.rejects(
    scan(store, j, [{ address: '1 A St', city: 'X', state: 'TN', zip: '38109' }, { address: '2 B St', city: 'X', state: 'TN', zip: '38109' }],
      { photo: async () => { throw new Error('Google Street View: The provided API key is invalid.'); }, client: rater({}), imageDir: null }),
    /API key/,
  );
  assert.equal(j.scanned, 0);
});
