// Sends the owner a Telegram message when a new order is complete.
// Called by a database trigger (see supabase/notifications.sql) with a shared secret.
// Secrets (set in Supabase, never in git): TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, WEBHOOK_SECRET, SITE_URL.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => Deno.env.get(name) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n: number) => '$' + Math.round(n).toLocaleString('es-CO');
const METHODS: Record<string, string> = {
  transfer: 'Transferencia (comprobante adjunto)',
  cash_on_delivery: 'Contra entrega',
  online: 'Pago en línea',
};

async function telegram(method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_CHAT_ID'), ...body }),
  });
  if (!res.ok) throw new Error(`Telegram ${method} failed: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET') || !env('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const { order_id } = await req.json().catch(() => ({}));
  if (!order_id) return new Response('missing order_id', { status: 400 });

  const { data: order, error } = await db.from('orders').select('*, order_items(*)').eq('id', order_id).single();
  if (error || !order) return new Response('order not found', { status: 404 });

  const lines = (order.order_items ?? []).map((i: any) => `${i.qty} × ${esc(i.name)}`).join('\n');
  const text = [
    `🛒 <b>Nuevo pedido ${esc(order.number)}</b>`,
    `${esc(order.customer_name)} · ${esc(order.customer_phone)}`,
    `${esc(order.address)}, ${esc(order.neighborhood)}`,
    order.notes ? `📝 ${esc(order.notes)}` : '',
    '',
    lines,
    '',
    `Envío: ${money(order.shipping_fee)} (${order.km} km${order.hub ? ` desde ${esc(order.hub)}` : ''})`,
    `<b>Total: ${money(order.total)}</b>`,
    `Pago: ${METHODS[order.payment_method] ?? order.payment_method}`,
    `Entrega: ${esc(order.delivery_date)}`,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');

  const site = env('SITE_URL').replace(/\/$/, '');
  const buttons = [
    ...(site ? [{ text: 'Abrir en el panel', url: `${site}/admin/` }] : []),
    { text: 'Ver en mapa', url: `https://www.google.com/maps?q=${order.lat},${order.lng}` },
    { text: 'WhatsApp', url: `https://wa.me/${order.customer_phone.replace(/\D/g, '').replace(/^(\d{10})$/, '57$1')}` },
  ];

  try {
    await telegram('sendMessage', { text, parse_mode: 'HTML', reply_markup: { inline_keyboard: [buttons] } });
    if (order.proof_path) {
      const { data } = await db.storage.from('proofs').createSignedUrl(order.proof_path, 3600);
      if (data?.signedUrl) await telegram('sendPhoto', { photo: data.signedUrl, caption: `Comprobante ${order.number}` });
    }
  } catch (err) {
    console.error(err);
    return new Response('telegram error', { status: 502 });
  }
  return new Response('ok');
});
