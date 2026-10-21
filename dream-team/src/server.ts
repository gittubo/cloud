// Dashboard + JSON API + Twilio phone webhooks. Start with `npm start`, open http://localhost:4321
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Store } from './store.ts';
import { buyersFromCsv, compsFromCsv, leadsFromCsv } from './csv.ts';
import { aiStatus } from './llm.ts';
import * as team from './team.ts';
import { seed } from './seed.ts';
import { converse, findOrCreateLeadByPhone, greeting, startConversation } from './agents/acquisitions.ts';
import { placeCallback, smsIn, validTwilioSignature, voiceStart, voiceTurn } from './phone.ts';
import { purchaseAgreementHtml } from './contract.ts';
import { startTelegramPolling } from './notify.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const store = new Store(process.env.DREAM_DB || join(root, 'data', 'db.json'));
const PORT = Number(process.env.PORT || 4321);
const HOST = process.env.HOST || '127.0.0.1';
const PASSWORD = process.env.DASHBOARD_PASSWORD;
const PUBLIC_URL = process.env.PUBLIC_URL?.replace(/\/$/, '');

// Once the app is reachable from the internet (for Twilio), the dashboard must have a password.
if ((PUBLIC_URL || HOST !== '127.0.0.1') && !PASSWORD) {
  console.error('Refusing to start: set DASHBOARD_PASSWORD when PUBLIC_URL or HOST exposes the app to the internet.');
  process.exit(1);
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function send(res: ServerResponse, status: number, data: unknown, type = 'application/json'): void {
  res.writeHead(status, { 'content-type': type });
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function authorized(req: IncomingMessage): boolean {
  if (!PASSWORD) return true;
  const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const given = Buffer.from(Buffer.from(encoded, 'base64').toString('utf8').split(':').slice(1).join(':'));
  const want = Buffer.from(PASSWORD);
  return given.length === want.length && timingSafeEqual(given, want);
}

type Handler = (p: string[], b: string, q: URLSearchParams) => unknown;
const json = (b: string) => (b ? JSON.parse(b) : {});

const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/state$/, () => ({ ...store.db, ai: aiStatus(), phone: Boolean(process.env.TWILIO_AUTH_TOKEN && PUBLIC_URL) })],
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
  ['POST', /^\/api\/leads\/(\w+)\/call$/, async (p) => ({ callSid: await placeCallback(store, store.lead(p[1])) })],
  // Talk to the Acquisition Manager from the browser (test calls/texts) without a phone line.
  ['POST', /^\/api\/converse\/start$/, (_p, b) => {
    const { leadId, channel } = json(b);
    const lead = leadId ? store.lead(leadId) : findOrCreateLeadByPhone(store, `(555) 555-${String(Math.floor(Math.random() * 9000) + 1000)}`);
    const conv = startConversation(store, lead.id, channel === 'sms' ? 'sms' : 'voice', 'test');
    const hello = conv.channel === 'voice' ? greeting(store.db.settings) : undefined;
    if (hello) conv.transcript.push({ at: new Date().toISOString(), from: 'agent', text: hello });
    return { conversationId: conv.id, leadId: lead.id, greeting: hello };
  }],
  ['POST', /^\/api\/converse$/, (_p, b) => {
    const { conversationId, text } = json(b);
    return converse(store, conversationId, String(text ?? ''));
  }],
  ['POST', /^\/api\/notifications\/(\w+)\/(approve|decline)$/, async (p) => ({ message: await team.decideDeal(store, p[1], p[2] === 'approve') })],
  ['POST', /^\/api\/notifications\/(\w+)\/done$/, (p) => {
    const n = store.db.notifications.find((x) => x.id === p[1]);
    if (n) n.status = 'done';
  }],
  ['POST', /^\/api\/drafts\/(\w+)\/approve$/, (p, b) => team.approveDraft(store, p[1], json(b).body)],
  ['POST', /^\/api\/drafts\/(\w+)\/reject$/, (p) => team.rejectDraft(store, p[1])],
  ['POST', /^\/api\/tasks\/(\w+)\/toggle$/, (p) => {
    const t = store.db.tasks.find((x) => x.id === p[1]);
    if (t) t.done = !t.done;
  }],
  ['POST', /^\/api\/settings$/, (_p, b) => { store.db.settings = { ...store.db.settings, ...json(b) }; }],
];

async function twilio(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !PUBLIC_URL) return send(res, 403, 'Phone line not configured', 'text/plain');
  const params = Object.fromEntries(new URLSearchParams(await body(req)));
  if (!validTwilioSignature(token, PUBLIC_URL + (req.url ?? ''), params, String(req.headers['x-twilio-signature'] ?? ''))) {
    return send(res, 403, 'Bad signature', 'text/plain');
  }
  let out: string;
  if (url.pathname === '/twilio/voice') out = voiceStart(store, params, url.searchParams.get('lead') ?? undefined);
  else if (url.pathname === '/twilio/voice/turn') out = await voiceTurn(store, params);
  else if (url.pathname === '/twilio/sms') out = await smsIn(store, params);
  else return send(res, 404, 'Not found', 'text/plain');
  store.save();
  send(res, 200, out, 'text/xml');
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname.startsWith('/twilio/') && req.method === 'POST') return await twilio(req, res, url);
    if (!authorized(req)) {
      res.writeHead(401, { 'www-authenticate': 'Basic realm="AI Dream Team"' });
      return res.end('Password required');
    }
    if (req.method === 'GET') {
      const page = { '/': 'index.html', '/index.html': 'index.html', '/call': 'call.html' }[url.pathname];
      if (page) return send(res, 200, readFileSync(join(root, 'public', page), 'utf8'), 'text/html; charset=utf-8');
      const contract = url.pathname.match(/^\/contracts\/(\w+)$/);
      if (contract) {
        const lead = store.lead(contract[1]);
        const price = lead.agreedPrice ?? lead.negotiation?.ourLastOffer;
        if (!price) throw new Error('No agreed price for this lead yet.');
        return send(res, 200, purchaseAgreementHtml(lead, price, store.db.settings), 'text/html; charset=utf-8');
      }
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
}).listen(PORT, HOST, () => {
  const ai = aiStatus();
  console.log(`AI Dream Team running at http://localhost:${PORT}`);
  console.log(ai.enabled ? `Claude enabled (${ai.model}).` : 'Claude off (no ANTHROPIC_API_KEY): the Acquisition Manager can\'t hold conversations; other agents use templates.');
  console.log(process.env.TWILIO_AUTH_TOKEN && PUBLIC_URL ? `Phone line on: point your Twilio number at ${PUBLIC_URL}/twilio/voice and ${PUBLIC_URL}/twilio/sms` : 'Phone line off. Test the Acquisition Manager at /call');
});

startTelegramPolling(async (id, approve) => {
  const msg = await team.decideDeal(store, id, approve);
  store.save();
  return msg;
});
