// CSV import. Column names vary by list provider (Propwire, PropStream, DealMachine,
// county exports), so each field accepts several header spellings.
import type { Buyer, Comp, Lead } from './types.ts';
import { newId, now } from './store.ts';

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((v) => v.trim() !== '')) rows.push(row);

  const [header, ...body] = rows;
  if (!header) return [];
  const keys = header.map(normalize);
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

function normalize(h: string): string {
  return h.replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pick(r: Record<string, string>, ...names: string[]): string | undefined {
  for (const n of names) {
    const v = r[normalize(n)];
    if (v) return v;
  }
  return undefined;
}

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

const TAG_COLUMNS: [string, string[]][] = [
  ['pre-foreclosure', ['preforeclosure', 'foreclosure', 'lispendens', 'nod']],
  ['tax-delinquent', ['taxdelinquent', 'taxlien']],
  ['vacant', ['vacant']],
  ['probate', ['probate', 'inherited', 'deceased']],
  ['absentee', ['absentee', 'absenteeowner', 'outofstate']],
  ['free-and-clear', ['freeandclear']],
  ['high-equity', ['highequity']],
  ['code-violation', ['codeviolation']],
  ['tired-landlord', ['tiredlandlord']],
  ['divorce', ['divorce']],
];

const TRUTHY = new Set(['y', 'yes', 'true', '1', 'x']);

function tagsFor(r: Record<string, string>): string[] {
  const tags = new Set<string>();
  for (const [tag, cols] of TAG_COLUMNS) {
    if (cols.some((c) => TRUTHY.has((r[c] ?? '').toLowerCase()))) tags.add(tag);
  }
  // Free-text tag columns, e.g. "Lists: Pre-Foreclosure; Vacant"
  const free = pick(r, 'tags', 'lists', 'list', 'leadtype', 'distress') ?? '';
  for (const part of free.split(/[;|,]/)) {
    const p = normalize(part);
    if (!p) continue;
    const hit = TAG_COLUMNS.find(([tag, cols]) => normalize(tag) === p || cols.includes(p));
    tags.add(hit ? hit[0] : part.trim().toLowerCase());
  }
  return [...tags];
}

export function leadsFromCsv(text: string, source: string): Lead[] {
  return parseCsv(text)
    .map((r): Lead | null => {
      const address = pick(r, 'address', 'propertyaddress', 'siteaddress', 'street');
      if (!address) return null;
      const first = pick(r, 'ownerfirstname', 'owner1firstname', 'firstname');
      const last = pick(r, 'ownerlastname', 'owner1lastname', 'lastname');
      const mailing = pick(r, 'mailingaddress', 'owneraddress', 'mailaddress');
      const lead: Lead = {
        id: newId('l'),
        address,
        city: pick(r, 'city', 'propertycity', 'sitecity') ?? '',
        state: (pick(r, 'state', 'propertystate', 'sitestate') ?? '').toUpperCase(),
        zip: (pick(r, 'zip', 'zipcode', 'propertyzip', 'sitezip', 'postalcode') ?? '').slice(0, 5),
        ownerName: pick(r, 'ownername', 'owner', 'owner1fullname') ?? ([first, last].filter(Boolean).join(' ') || undefined),
        ownerPhone: pick(r, 'phone', 'ownerphone', 'phone1', 'mobile', 'cell'),
        ownerEmail: pick(r, 'email', 'owneremail', 'email1'),
        mailingAddress: mailing,
        beds: num(pick(r, 'beds', 'bedrooms', 'bed')),
        baths: num(pick(r, 'baths', 'bathrooms', 'bath')),
        sqft: num(pick(r, 'sqft', 'squarefeet', 'livingarea', 'buildingsqft', 'livingsqft')),
        yearBuilt: num(pick(r, 'yearbuilt', 'year')),
        estimatedValue: num(pick(r, 'estimatedvalue', 'avm', 'marketvalue', 'estvalue', 'value')),
        mortgageBalance: num(pick(r, 'mortgagebalance', 'openmortgagebalance', 'loanbalance', 'estimatedmortgagebalance')),
        lastSaleDate: pick(r, 'lastsaledate', 'saledate'),
        lastSalePrice: num(pick(r, 'lastsaleprice', 'saleprice', 'lastsaleamount')),
        tags: tagsFor(r),
        source,
        stage: 'new',
        notes: [],
        createdAt: now(),
        updatedAt: now(),
      };
      // An owner who gets mail somewhere else doesn't live there.
      if (mailing && !lead.tags.includes('absentee') && !normalize(mailing).startsWith(normalize(address))) {
        lead.tags.push('absentee');
      }
      return lead;
    })
    .filter((l): l is Lead => l !== null);
}

export function compsFromCsv(text: string): Comp[] {
  return parseCsv(text)
    .map((r): Comp | null => {
      const soldPrice = num(pick(r, 'soldprice', 'saleprice', 'price', 'lastsaleprice'));
      const sqft = num(pick(r, 'sqft', 'squarefeet', 'livingarea'));
      const address = pick(r, 'address', 'propertyaddress');
      if (!soldPrice || !sqft || !address) return null;
      const cond = pick(r, 'condition')?.toLowerCase();
      return {
        address,
        zip: (pick(r, 'zip', 'zipcode') ?? '').slice(0, 5),
        soldPrice,
        soldDate: pick(r, 'solddate', 'saledate', 'date') ?? '',
        sqft,
        beds: num(pick(r, 'beds', 'bedrooms')),
        baths: num(pick(r, 'baths', 'bathrooms')),
        condition: cond === 'renovated' || cond === 'average' || cond === 'distressed' ? cond : undefined,
      };
    })
    .filter((c): c is Comp => c !== null);
}

export function buyersFromCsv(text: string): Buyer[] {
  return parseCsv(text)
    .map((r): Buyer | null => {
      const name = pick(r, 'name', 'buyer', 'buyername', 'company', 'ownername');
      if (!name) return null;
      const list = (v?: string) => (v ?? '').split(/[;|, ]+/).map((s) => s.trim()).filter(Boolean);
      return {
        id: newId('b'),
        name,
        phone: pick(r, 'phone', 'mobile'),
        email: pick(r, 'email'),
        zips: list(pick(r, 'zips', 'zip', 'areas', 'zipcodes')).map((z) => z.slice(0, 5)),
        maxPrice: num(pick(r, 'maxprice', 'budget', 'max')),
        minBeds: num(pick(r, 'minbeds', 'beds')),
        strategies: list(pick(r, 'strategies', 'strategy', 'buybox')).map((s) => s.toLowerCase()),
        lastPurchase: pick(r, 'lastpurchase', 'lastpurchasedate', 'lastsaledate'),
      };
    })
    .filter((b): b is Buyer => b !== null);
}
