// Notifications: what the team needs you for. Always stored in the dashboard Inbox; also sent
// to your phone through a free Telegram bot when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
import type { Notification } from './types.ts';
import { newId, now, type Store } from './store.ts';

const TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const CHAT = () => process.env.TELEGRAM_CHAT_ID;

async function telegram(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export function notify(store: Store, n: Omit<Notification, 'id' | 'status' | 'createdAt'>): Notification {
  const note: Notification = { ...n, id: newId('n'), status: 'open', createdAt: now() };
  store.db.notifications.unshift(note);
  if (TOKEN() && CHAT()) {
    const buttons = n.kind === 'deal_agreed'
      ? { inline_keyboard: [[{ text: '✅ Send contract', callback_data: `approve:${note.id}` }, { text: '❌ Decline', callback_data: `decline:${note.id}` }]] }
      : undefined;
    telegram('sendMessage', { chat_id: CHAT(), text: `🏠 ${n.text}`, reply_markup: buttons })
      .catch((e) => console.warn(`[telegram] ${e.message}`));
  }
  return note;
}

/**
 * Long-polls Telegram for your button taps. Polling (not a webhook) means it works
 * on a laptop with no public address. Only taps from your own chat are accepted.
 */
export function startTelegramPolling(onDecision: (notificationId: string, approve: boolean) => Promise<string>): void {
  if (!TOKEN() || !CHAT()) return;
  let offset = 0;
  const loop = async () => {
    try {
      const r = await telegram('getUpdates', { offset, timeout: 30, allowed_updates: ['callback_query'] });
      for (const u of r.result ?? []) {
        offset = u.update_id + 1;
        const q = u.callback_query;
        if (!q || String(q.message?.chat?.id) !== String(CHAT())) continue;
        const [action, id] = String(q.data).split(':');
        const result = await onDecision(id, action === 'approve').catch((e) => `Error: ${e.message}`);
        await telegram('answerCallbackQuery', { callback_query_id: q.id, text: result.slice(0, 190) });
        await telegram('sendMessage', { chat_id: CHAT(), text: result });
      }
    } catch (e) {
      console.warn(`[telegram] ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    setImmediate(loop);
  };
  loop();
  console.log('Telegram notifications on.');
}
