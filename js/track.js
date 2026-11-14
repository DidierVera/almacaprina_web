// Order tracking: the customer opens the private link (track.html?t=<token>) and sees where the order is.
// The server returns only non-personal data (no address, phone or name).
import { addDays, formatLong, money } from './format.js';
import { initLayout } from './layout.js';
import { rpc } from './supabase.js';
import { getConfig } from './store.js';

const REFRESH_MS = 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STEPS = [
  { id: 'received', label: 'Pedido recibido', hint: 'Ya lo tenemos y lo estamos revisando.' },
  { id: 'confirmed', label: 'Pedido confirmado', hint: 'Está confirmado para su día de entrega.' },
  { id: 'preparing', label: 'Preparando tu pedido', hint: 'Estamos alistando tus productos.' },
  { id: 'out_for_delivery', label: 'En camino', hint: 'Va de camino a tu dirección.' },
  { id: 'delivered', label: 'Entregado', hint: '¡Que lo disfrutes!' },
];

const PAYMENT_TEXT = {
  under_review: 'Estamos revisando tu comprobante.',
  paid: 'Pago confirmado. ¡Gracias!',
  rejected: 'No pudimos validar tu comprobante. Escríbenos por WhatsApp para resolverlo.',
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

initLayout('track');
const root = document.getElementById('track');
const token = new URLSearchParams(location.search).get('t') ?? '';
let whatsapp = '';
getConfig().then((c) => { whatsapp = (c.business.whatsapp ?? '').replace(/\D/g, ''); }).catch(() => {});

function notFound(message) {
  root.replaceChildren(el('p', 'notice', message), el('a', 'btn btn--secondary', 'Ir al inicio'));
  root.lastChild.href = './';
}

function paymentLine(order) {
  if (order.paymentStatus === 'pending') {
    return order.paymentMethod === 'cash_on_delivery' ? 'Pagas al recibir tu pedido.' : 'Estamos esperando tu pago.';
  }
  return PAYMENT_TEXT[order.paymentStatus] ?? '';
}

function render(order) {
  document.getElementById('trackNumber').textContent = `Pedido ${order.number}`;
  const nodes = [];

  if (order.status === 'cancelled') {
    nodes.push(el('p', 'notice notice--error', 'Este pedido fue cancelado. Si crees que es un error, escríbenos por WhatsApp.'));
  } else {
    const current = STEPS.findIndex((s) => s.id === order.status);
    const list = el('ol', 'timeline');
    STEPS.forEach((step, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'todo';
      const item = el('li', `timeline__item timeline__item--${state}`);
      const dot = el('span', 'timeline__dot', i < current ? '✓' : String(i + 1));
      dot.setAttribute('aria-hidden', 'true');
      const body = el('div', 'timeline__body');
      body.append(el('strong', '', step.label));
      if (state === 'current') { body.append(el('span', 'muted', step.hint)); item.setAttribute('aria-current', 'step'); }
      item.append(dot, body);
      list.append(item);
    });
    nodes.push(list);
  }

  const info = el('dl', 'card kv track__info');
  const row = (label, value) => {
    const div = document.createElement('div');
    div.append(el('dt', '', label), el('dd', '', value));
    return div;
  };
  if (order.status !== 'cancelled' && order.status !== 'delivered') info.append(row('Entrega', formatLong(order.deliveryDate)));
  else if (order.status === 'delivered') info.append(row('Entregado el día', formatLong(order.deliveryDate)));
  const pay = paymentLine(order);
  if (pay) info.append(row('Pago', pay));
  nodes.push(info);

  const lines = el('dl', 'card kv track__items');
  for (const it of order.items ?? []) lines.append(row(`${it.qty} × ${it.name}`, money(it.qty * it.unitPrice)));
  if (order.shippingFee != null) lines.append(row('Domicilio', money(order.shippingFee)));
  const total = row('Total', money(order.total));
  total.className = 'total';
  lines.append(total);
  nodes.push(el('h2', 'track__h', 'Tu pedido'), lines);

  if (whatsapp) {
    const a = el('a', 'btn btn--secondary btn--block', 'Escribirnos por WhatsApp');
    a.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, quiero consultar mi pedido ${order.number}.`)}`;
    a.target = '_blank'; a.rel = 'noopener';
    nodes.push(a);
  }
  nodes.push(el('p', 'muted track__note', 'Esta página se actualiza sola. Guarda este enlace para volver a ver tu pedido.'));
  root.replaceChildren(...nodes);
}

async function load(first) {
  try {
    const order = await rpc('get_order_status', { p_token: token });
    if (!order) { if (first) notFound('No encontramos este pedido. Revisa que el enlace esté completo.'); return; }
    render(order);
  } catch {
    if (first) notFound('No pudimos cargar tu pedido. Inténtalo de nuevo en un momento.');
  }
}

if (!UUID.test(token)) {
  notFound('Este enlace no es válido. Pídenos de nuevo el enlace de seguimiento de tu pedido.');
} else {
  await load(true);
  setInterval(() => { if (!document.hidden) load(false); }, REFRESH_MS);
}
