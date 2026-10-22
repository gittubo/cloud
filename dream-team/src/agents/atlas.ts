// Atlas: virtual "driving for dollars". Give it a zip code (or scan your imported list) and it
// looks at the Google Street View photo of every house, has Claude rate how run down or
// abandoned it looks, and puts the distressed ones into your pipeline.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Lead, VisualScan } from '../types.ts';
import { newId, now, type Store } from '../store.ts';
import { MODEL } from '../llm.ts';
import type { LlmClient } from './acquisitions.ts';

/** Houses scoring this or higher (out of 10) are flagged as distressed. */
export const FLAG_SCORE = 6;
const STREET_VIEW = 'https://maps.googleapis.com/maps/api/streetview';
const OVERPASS = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';

export interface StreetPhoto { base64: string; mediaType: 'image/jpeg'; date?: string }
export interface AtlasDeps {
  photo: (location: string) => Promise<StreetPhoto | null>;
  client: LlmClient | null;
  imageDir: string | null;
}

export const fullAddress = (l: Pick<Lead, 'address' | 'city' | 'state' | 'zip'>) =>
  [l.address, l.city, [l.state, l.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');

/** Street View photo of an address, or null where Google has none. The metadata check is free. */
export function googleStreetView(key: string) {
  return async (location: string): Promise<StreetPhoto | null> => {
    const q = new URLSearchParams({ location, key, source: 'outdoor' });
    const meta = await (await fetch(`${STREET_VIEW}/metadata?${q}`)).json() as { status: string; date?: string; error_message?: string };
    if (meta.status === 'REQUEST_DENIED') throw new Error(`Google Street View: ${meta.error_message ?? 'request denied: check the API key'}`);
    if (meta.status !== 'OK') return null;
    q.set('size', '640x640');
    q.set('fov', '80');
    const res = await fetch(`${STREET_VIEW}?${q}`);
    if (!res.ok) throw new Error(`Google Street View: HTTP ${res.status}`);
    return { base64: Buffer.from(await res.arrayBuffer()).toString('base64'), mediaType: 'image/jpeg', date: meta.date };
  };
}

const NOT_HOMES = new Set(['commercial', 'industrial', 'retail', 'office', 'warehouse', 'church', 'school', 'hospital', 'garage', 'garages', 'shed', 'apartments', 'hotel', 'public', 'civic', 'government', 'university', 'college', 'supermarket', 'kindergarten', 'parking', 'service', 'barn', 'farm_auxiliary']);

/** Street addresses of homes in a zip code, from OpenStreetMap (free). Coverage varies by county. */
export async function discoverAddresses(zip: string, limit: number): Promise<Pick<Lead, 'address' | 'city' | 'state' | 'zip'>[]> {
  if (!/^\d{5}$/.test(zip)) throw new Error('Enter a 5-digit US zip code.');
  const query = `[out:json][timeout:90];nwr["addr:postcode"="${zip}"]["addr:housenumber"]["addr:street"];out tags ${Math.min(limit * 3, 3000)};`;
  const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (!res.ok) throw new Error(`OpenStreetMap lookup failed (HTTP ${res.status}). Try again later, or import a property list instead.`);
  const data = await res.json() as { elements: { tags: Record<string, string> }[] };
  const seen = new Set<string>();
  const out: Pick<Lead, 'address' | 'city' | 'state' | 'zip'>[] = [];
  for (const { tags } of data.elements) {
    if (tags.shop || tags.amenity || tags.office || tags.tourism || tags.craft || NOT_HOMES.has(tags.building ?? '')) continue;
    const address = `${tags['addr:housenumber']} ${tags['addr:street']}`;
    if (seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    out.push({ address, city: tags['addr:city'] ?? '', state: (tags['addr:state'] ?? '').toUpperCase().slice(0, 2), zip });
    if (out.length >= limit) break;
  }
  return out;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['house_visible', 'distress_score', 'signs', 'summary'],
  properties: {
    house_visible: { type: 'boolean', description: 'Is a single house clearly visible?' },
    distress_score: { type: 'integer', description: '0 = well kept, 10 = clearly abandoned or badly run down' },
    signs: { type: 'array', items: { type: 'string' }, description: 'Each visible sign of neglect, short phrases' },
    summary: { type: 'string', description: 'One sentence on the condition' },
  },
};

const PROMPT = `You are scouting houses for a real estate investor who buys run-down and abandoned homes. This is a street-level photo of the house at the address given.
Rate only what you can actually see. Signs of distress include: overgrown grass or weeds, boarded or broken windows or doors, roof damage, tarps or missing shingles, peeling paint or damaged siding, sagging porch or gutters, junk, debris or abandoned vehicles in the yard, fire or water damage, a notice posted on the door, or general signs nobody lives there.
An ordinary older house that is maintained is NOT distressed (score 0-3). Use 4-5 for noticeable neglect, 6-7 for clearly run down, 8-10 for likely vacant or abandoned.
If the photo shows no house, the wrong building, or is too blurry or blocked by trees/cars to judge, set house_visible to false.`;

export async function rateHouse(client: LlmClient, location: string, photo: StreetPhoto) {
  const res = await client.beta.messages.create({
    model: process.env.ATLAS_MODEL || MODEL,
    max_tokens: 2000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 } },
        { type: 'text', text: `${PROMPT}\n\nAddress: ${location}` },
      ],
    }],
  });
  if (res.stop_reason === 'refusal') throw new Error('the AI declined to rate this photo');
  const text = (res.content as any[]).find((b) => b.type === 'text')?.text ?? '';
  const r = JSON.parse(text) as { house_visible: boolean; distress_score: number; signs: string[]; summary: string };
  return { ...r, distress_score: Math.max(0, Math.min(10, Math.round(r.distress_score))) };
}

export interface ScanJob {
  id: string;
  label: string;
  status: 'running' | 'done' | 'failed';
  total: number;
  scanned: number;
  flagged: number;
  noPhoto: number;
  error?: string;
  startedAt: string;
}

/**
 * Scans `targets` (existing leads, or new addresses to look at). Distressed houses become leads;
 * new addresses that look fine are not added, so your pipeline only holds real prospects.
 */
export async function scan(
  store: Store, job: ScanJob, targets: (Lead | Pick<Lead, 'address' | 'city' | 'state' | 'zip'>)[], deps: AtlasDeps,
): Promise<void> {
  if (!deps.client) throw new Error('Atlas needs Claude: start the app with ANTHROPIC_API_KEY set.');
  job.total = targets.length;
  if (deps.imageDir) mkdirSync(deps.imageDir, { recursive: true });
  for (const t of targets) {
    const location = fullAddress(t);
    try {
      const photo = await deps.photo(location);
      const visual: VisualScan = { score: 0, signs: [], summary: '', usable: false, hasImage: Boolean(photo), imageDate: photo?.date, scannedAt: now() };
      if (photo) {
        const r = await rateHouse(deps.client, location, photo);
        Object.assign(visual, { score: r.distress_score, signs: r.signs, summary: r.summary, usable: r.house_visible });
      } else job.noPhoto++;

      const flagged = visual.usable && visual.score >= FLAG_SCORE;
      let lead = 'id' in t ? t : undefined;
      if (!lead && flagged) {
        lead = { id: newId('l'), ...t, tags: [], source: `atlas:${job.label}`, stage: 'new', notes: [], createdAt: now(), updatedAt: now() };
        store.db.leads.push(lead);
      }
      if (lead) {
        lead.visual = visual;
        if (flagged && !lead.tags.includes('looks-distressed')) lead.tags.push('looks-distressed');
        // Re-rank already-scored leads now that we've seen the house.
        if (lead.stage === 'scored') lead.stage = 'new';
        lead.updatedAt = now();
        if (photo && deps.imageDir) writeFileSync(join(deps.imageDir, `${lead.id}.jpg`), Buffer.from(photo.base64, 'base64'));
      }
      if (flagged) job.flagged++;
    } catch (err) {
      const msg = (err as Error).message;
      // A bad key or quota stops the whole scan; one odd address doesn't.
      if (/Street View|API key|credit|rate limit|authentication/i.test(msg)) throw err;
      console.warn(`[atlas] ${location}: ${msg}`);
    }
    job.scanned++;
    if (job.scanned % 10 === 0) store.save();
  }
}
