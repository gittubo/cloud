// Local web dashboard + JSON API. Start with `npm start`, open http://localhost:4321
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Store } from './store.ts';
import { buyersFromCsv, compsFromCsv, leadsFromCsv } from './csv.ts';
import { aiStatus } from './llm.ts';
import * as team from './team.ts';
import { seed } from './seed.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = new Store(process.env.DREAM_DB || join(root, 'data', 'db.json'));
const PORT = Number(process.env.PORT || 4321);

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, data: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

type Handler = (p: string[], b: string, q: URLSearchParams) => unknown;
const json = (b: string) => (b ? JSON.parse(b) : {});

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/state$/, () => ({ ...store.db, ai: aiStatus() })],
  ['POST', /^\/api\/seed$/, () => seed(store, root)],
  ['POST', /^\/api\/import\/leads$/, (_p, b, q) => {
    const leads = leadsFromCsv(b, q.get('source') || 'csv');
    store.db.leads.push(...leads);
    store.log('you', `Imported ${leads.length} lead(s) from ${q.get('source') || 'csv'}.`);
    return { imported: leads.length, scored: team.scoutAll(store) };
  }],
  ['POST', /^\/api\/import\/comps$/, (_p, b) => {
    const comps = compsFromCsv(b);
    store.db.comps.push(...comps);
    return { imported: comps.length };
  }],
  ['POST', /^\/api\/import\/buyers$/, (_p, b) => {
    const buyers = buyersFromCsv(b);
    store.db.buyers.push(...buyers);
    return { imported: buyers.length };
  }],
  ['POST', /^\/api\/scout$/, () => ({ scored: team.scoutAll(store) })],
  ['POST', /^\/api\/leads\/(\w+)\/outreach$/, (p) => team.startOutreach(store, p[1])],
  ['POST', /^\/api\/leads\/(\w+)\/reply$/, (p, b) => team.handleSellerReply(store, p[1], json(b).text)],
  ['POST', /^\/api\/leads\/(\w+)\/analyze$/, (p) => team.analyze(store, p[1])],
  ['POST', /^\/api\/leads\/(\w+)\/offer$/, (p, b) => team.makeOffer(store, p[1], json(b).amount || undefined)],
  ['POST', /^\/api\/leads\/(\w+)\/contract$/, (p, b) => {
    const { price, closingDate } = json(b);
    return team.contractSigned(store, p[1], Number(price), closingDate);
  }],
  ['POST', /^\/api\/leads\/(\w+)\/qualification$/, (p, b) => {
    const lead = store.lead(p[1]);
    lead.qualification = { ...(lead.qualification ?? { missing: [] }), ...json(b) };
    team.analyze(store, p[1]);
  }],
  ['POST', /^\/api\/leads\/(\w+)\/stage$/, (p, b) => {
    const lead = store.lead(p[1]);
    lead.stage = json(b).stage;
    store.log('you', `Moved to ${lead.stage}.`, lead.id);
  }],
  ['POST', /^\/api\/drafts\/(\w+)\/approve$/, (p, b) => team.approveDraft(store, p[1], json(b).body)],
  ['POST', /^\/api\/drafts\/(\w+)\/reject$/, (p) => team.rejectDraft(store, p[1])],
  ['POST', /^\/api\/tasks\/(\w+)\/toggle$/, (p) => {
    const t = store.db.tasks.find((x) => x.id === p[1]);
    if (t) t.done = !t.done;
  }],
  ['POST', /^\/api\/settings$/, (_p, b) => { store.db.settings = { ...store.db.settings, ...json(b) }; }],
];

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return send(res, 200, readFileSync(join(root, 'public', 'index.html'), 'utf8'), 'text/html; charset=utf-8');
    }
    for (const [method, re, handler] of routes) {
      const m = url.pathname.match(re);
      if (m && req.method === method) {
        const result = await handler([...m], await body(req), url.searchParams);
        if (method === 'POST') store.save();
        return send(res, 200, result ?? { ok: true });
      }
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    send(res, 400, { error: (err as Error).message });
  }
}).listen(PORT, '127.0.0.1', () => {
  const ai = aiStatus();
  console.log(`AI Dream Team running at http://localhost:${PORT}`);
  console.log(ai.enabled ? `Claude writing enabled (${ai.model}).` : 'Claude writing off (no ANTHROPIC_API_KEY): agents use their built-in templates.');
});
