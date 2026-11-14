// Receives the button presses from the Telegram order messages ("Confirmar pago" / "Rechazar")
// and updates the order. Telegram calls this function (see scripts/set-telegram-webhook.mjs).
// Secrets (set in Supabase, never in git): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => Deno.env.get(name) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`Telegram ${method} failed: ${res.status} ${await res.text()}`);
}

const answer = (id: string, text: string) => telegram('answerCallbackQuery', { callback_query_id: id, text, show_alert: false });

Deno.serve(async (req) => {
  // Only Telegram knows this secret (it is sent back on every call, see setWebhook's secret_token).
  const secret = env('TELEGRAM_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('forbidden', { status: 403 });

  const update = await req.json().catch(() => null);
  const cb = update?.callback_query;
  if (!cb) return new Response('ok'); // ignore everything except button presses

  // Always answer 200 so Telegram does not retry; problems are reported to the person who pressed.
  const chatId = String(cb.message?.chat?.id ?? '');
  if (chatId !== env('TELEGRAM_CHAT_ID')) { await answer(cb.id, 'No autorizado.'); return new Response('ok'); }

  const [action, orderId] = String(cb.data ?? '').split(':');
  if (!['pay', 'reject'].includes(action) || !UUID.test(orderId ?? '')) { await answer(cb.id, 'Botón no válido.'); return new Response('ok'); }

  const { data: order } = await db.from('orders')
    .select('id, number, status, payment_method, payment_status').eq('id', orderId).maybeSingle();
  if (!order) { await answer(cb.id, 'No encontré ese pedido.'); return new Response('ok'); }
  if (order.status === 'cancelled') { await answer(cb.id, `${order.number} está cancelado.`); return new Response('ok'); }

  const target = action === 'pay' ? 'paid' : 'rejected';
  if (order.payment_status === target) { await answer(cb.id, 'Ya estaba así.'); return new Response('ok'); }
  if (!['under_review', 'pending'].includes(order.payment_status)) {
    // Never silently reverse a decision already made: that is done from the panel.
    await answer(cb.id, 'Este pago ya fue resuelto. Cámbialo desde el panel.');
    return new Response('ok');
  }

  const patch: Record<string, string> = { payment_status: target };
  if (action === 'pay' && order.status === 'received') patch.status = 'confirmed';
  const { data: updated, error } = await db.from('orders').update(patch)
    .eq('id', order.id).eq('payment_status', order.payment_status).select('id'); // guards against a double press
  if (error || !updated?.length) { await answer(cb.id, 'No pude actualizar el pedido. Inténtalo desde el panel.'); return new Response('ok'); }

  const who = cb.from?.first_name ?? 'alguien';
  const label = action === 'pay' ? `✅ Pago confirmado por ${who}` : `❌ Comprobante rechazado por ${who}`;
  await answer(cb.id, action === 'pay' ? `Pago de ${order.number} confirmado.` : `Comprobante de ${order.number} rechazado.`);
  // Replace the buttons with the result, so the message shows what was decided.
  const original = String(cb.message?.caption ?? cb.message?.text ?? '');
  const edit = cb.message?.caption !== undefined
    ? { method: 'editMessageCaption', field: 'caption' }
    : { method: 'editMessageText', field: 'text' };
  await telegram(edit.method, {
    chat_id: chatId, message_id: cb.message.message_id, [edit.field]: `${original}\n\n${label}`,
  });
  return new Response('ok');
});
