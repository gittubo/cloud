// Loads the synthetic sample lists so you can try the whole pipeline without any data.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Store } from './store.ts';
import { buyersFromCsv, compsFromCsv, leadsFromCsv } from './csv.ts';
import { scoutAll } from './team.ts';

export function seed(store: Store, root: string) {
  const read = (f: string) => readFileSync(join(root, 'sample', f), 'utf8');
  const leads = leadsFromCsv(read('leads.csv'), 'sample');
  const comps = compsFromCsv(read('comps.csv'));
  const buyers = buyersFromCsv(read('buyers.csv'));
  store.db.leads.push(...leads);
  store.db.comps.push(...comps);
  store.db.buyers.push(...buyers);
  store.log('you', `Loaded sample data: ${leads.length} leads, ${comps.length} comps, ${buyers.length} buyers.`);
  return { leads: leads.length, comps: comps.length, buyers: buyers.length, scored: scoutAll(store) };
}
