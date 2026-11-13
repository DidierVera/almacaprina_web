// Orders: list by delivery day, stats, and a detail panel with payment proof and status actions.
import { addDays, bogotaNow, dayName, formatKm, formatLong, money } from '../../format.js';
import { listOrders, proofUrl, updateOrder } from '../api.js';
import { ADVANCE_LABEL, PAYMENT_METHOD, STATUS, STATUS_FLOW, paymentBadge } from '../labels.js';
import { badge, guarded, h, mapsLink, shortDay, toast, whatsappLink } from '../ui.js';

const REFRESH_MS = 60_000;
const PROOF_URL_TTL_MS = 9 * 60 * 1000; // signed URLs last 10 minutes

export async function mount(container) {
  const today = bogotaNow().iso;
  const state = { orders: [], selectedId: null, day: null, query: '', panelOpen: false };
  const proofCache = new Map(); // storage path -> { url, at }

  /* ---------- skeleton ---------- */
  const refreshBtn = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => refresh() }, 'Actualizar');
  const statsEl = h('div', { class: 'stats' });
  const tabsEl = h('div', { class: 'toolbar__tabs toolbar', style: 'margin:0' });
  const searchEl = h('input', { class: 'search', type: 'search', placeholder: 'Buscar por nombre, celular o #pedido', 'aria-label': 'Buscar pedidos',
    onInput: (e) => { state.query = e.target.value.trim().toLowerCase(); renderTable(); } });
  const thead = h('thead');
  const tbody = h('tbody', { onClick: (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) select(tr.dataset.id);
  } });
  const detailEl = h('aside', { class: 'detail', 'aria-label': 'Detalle del pedido' });

  container.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Pedidos'), refreshBtn),
    statsEl,
    h('div', { class: 'toolbar' }, tabsEl, h('span', { class: 'toolbar__spacer' }), searchEl),
    h('div', { class: 'orders' },
      h('div', { class: 'card table-card' }, h('table', { class: 'table' }, thead, tbody)),
      detailEl),
  );

  /* ---------- data ---------- */
  const selected = () => state.orders.find((o) => o.id === state.selectedId) ?? null;
  const deliveryDays = () => [...new Set(state.orders.map((o) => o.delivery_date))]
    .filter((d) => d >= addDays(today, -14)).sort();
  const defaultDay = () => { const days = deliveryDays(); return days.find((d) => d >= today) ?? days.at(-1) ?? 'all'; };

  function dayOrders() {
    return state.orders.filter((o) => state.day === 'all' || o.delivery_date === state.day);
  }
  function visibleOrders() {
    const q = state.query;
    return dayOrders()
      .filter((o) => !q || [o.number, o.customer_name, o.customer_phone, o.neighborhood].some((v) => String(v).toLowerCase().includes(q)))
      .sort((a, b) => (a.route_position ?? 1e9) - (b.route_position ?? 1e9) || a.created_at.localeCompare(b.created_at));
  }

  async function refresh(silent = false) {
    const rows = silent ? await listOrders().catch(() => null) : await guarded(listOrders, 'No pudimos actualizar los pedidos.');
    if (!rows) return;
    state.orders = rows;
    if (state.day === null || (state.day !== 'all' && !deliveryDays().includes(state.day) && !dayOrders().length)) state.day = defaultDay();
    render();
  }

  /* ---------- rendering ---------- */
  function renderTabs() {
    const days = deliveryDays();
    tabsEl.replaceChildren(
      ...days.map((d) => dayChip(d, shortDay(d, dayName))),
      dayChip('all', 'Todos'),
    );
  }
  const dayChip = (value, label) => h('button', { class: 'day-chip', type: 'button', 'aria-pressed': String(state.day === value),
    onClick: () => { state.day = value; render(); } }, label);

  function renderStats() {
    const active = dayOrders().filter((o) => o.status !== 'cancelled');
    const toReview = active.filter((o) => o.payment_status === 'under_review').length;
    const total = active.reduce((s, o) => s + o.total, 0);
    const cash = active.filter((o) => o.payment_method === 'cash_on_delivery' && o.status !== 'delivered');
    const when = state.day === 'all' ? 'todos los días' : formatLong(state.day).toLowerCase();
    const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value' }, value), h('span', { class: 'stat__sub' }, sub));
    statsEl.replaceChildren(
      stat('Pedidos', String(active.length), when),
      stat('Comprobantes por revisar', String(toReview), 'pago en revisión'),
      stat('Total', money(total), 'incluye domicilios'),
      stat('Por cobrar', money(cash.reduce((s, o) => s + o.total, 0)), `${cash.length} contraentrega`),
    );
  }

  function renderTable() {
    const showDate = state.day === 'all';
    const headers = [showDate && 'Entrega', 'Pedido', 'Cliente', 'Barrio', 'Total', 'Pago', 'Estado'].filter(Boolean);
    thead.replaceChildren(h('tr', {}, headers.map((t) => h('th', { scope: 'col' }, t))));
    const rows = visibleOrders();
    if (!rows.length) {
      tbody.replaceChildren(h('tr', { class: 'empty-row' }, h('td', { colSpan: headers.length }, 'No hay pedidos para mostrar.')));
      return;
    }
    tbody.replaceChildren(...rows.map((o) => {
      const pay = paymentBadge(o);
      const status = STATUS[o.status];
      return h('tr', { dataset: { id: o.id }, 'aria-selected': String(o.id === state.selectedId) },
        showDate && h('td', {}, shortDay(o.delivery_date, dayName)),
        h('td', {}, h('button', { class: 'link-btn', type: 'button' }, `#${o.number}`)),
        h('td', {}, o.customer_name),
        h('td', { class: 'muted' }, o.neighborhood),
        h('td', { class: 'money' }, money(o.total)),
        h('td', {}, badge(pay.tone, pay.label)),
        h('td', {}, badge(status.tone, status.label)));
    }));
  }

  function renderDetail() {
    const o = selected();
    detailEl.classList.toggle('is-open', state.panelOpen);
    const closeBtn = h('button', { class: 'btn btn--secondary btn--sm detail__close', type: 'button', onClick: closePanel }, 'Cerrar');
    if (!o) {
      detailEl.replaceChildren(closeBtn, h('p', { class: 'detail__empty' }, 'Selecciona un pedido para ver el detalle.'));
      return;
    }

    const section = (title, ...children) => h('section', {}, h('h3', {}, title), ...children);
    const line = (label, value, cls) => h('div', { class: cls }, h('dt', {}, label), h('dd', {}, value));
    const status = STATUS[o.status];
    const pay = paymentBadge(o);

    const next = nextStatus(o);
    const proofSlot = o.proof_path ? h('div', { class: 'proof' }, 'Cargando comprobante…') : null;

    detailEl.replaceChildren(
      closeBtn,
      h('div', { class: 'detail__head' }, h('h2', {}, `Pedido #${o.number}`), badge(status.tone, status.label)),

      section('Cliente',
        h('strong', {}, o.customer_name),
        h('a', { href: `tel:${o.customer_phone.replace(/\s/g, '')}` }, o.customer_phone),
        o.customer_email && h('a', { href: `mailto:${o.customer_email}` }, o.customer_email),
        h('span', {}, `${o.address}, ${o.neighborhood}`),
        o.notes && h('span', { class: 'muted' }, o.notes)),

      section('Entrega',
        h('span', {}, formatLong(o.delivery_date)),
        h('span', { class: 'muted' }, `${formatKm(Number(o.km))} km · Domicilio ${money(o.shipping_fee)}`),
        h('div', { class: 'row-actions' },
          h('a', { class: 'btn btn--secondary btn--sm', href: whatsappLink(o.customer_phone), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
          h('a', { class: 'btn btn--secondary btn--sm', href: mapsLink(o.lat, o.lng), target: '_blank', rel: 'noopener' }, 'Ver en mapa'))),

      section('Productos', h('dl', { class: 'lines' },
        ...(o.order_items ?? []).map((i) => line(`${i.qty} × ${i.name}`, money(i.unit_price * i.qty))),
        line('Domicilio', money(o.shipping_fee)),
        line('Total', money(o.total), 'total'))),

      section('Pago',
        h('div', { class: 'detail__head' }, h('span', { style: 'flex:1;font-weight:500' }, PAYMENT_METHOD[o.payment_method]), badge(pay.tone, pay.label)),
        proofSlot,
        paymentActions(o)),

      section('Estado del pedido', statusSteps(o)),

      h('div', { class: 'row-actions' },
        next && h('button', { class: 'btn btn--dark btn--sm', type: 'button', onClick: () => advance(o) }, ADVANCE_LABEL[next]),
        o.status !== 'cancelled' && o.status !== 'delivered'
          && h('button', { class: 'btn btn--danger btn--sm', type: 'button', onClick: () => cancelOrder(o) }, 'Cancelar pedido')),
    );
    if (proofSlot) loadProof(o, proofSlot);
  }

  function paymentActions(o) {
    if (o.payment_method !== 'transfer') return null;
    if (o.payment_status === 'under_review') {
      return h('div', { class: 'row-actions' },
        h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => confirmPayment(o) }, 'Confirmar pago'),
        h('button', { class: 'btn btn--danger btn--sm', type: 'button', onClick: () => rejectPayment(o) }, 'Rechazar'));
    }
    return h('div', { class: 'row-actions' },
      h('button', { class: 'btn--ghost btn', type: 'button', onClick: () => apply(o, { payment_status: 'under_review' }, 'Pago devuelto a revisión') }, 'Volver a revisión'));
  }

  function statusSteps(o) {
    if (o.status === 'cancelled') return h('div', { class: 'steps' }, badge('danger', 'Cancelado'));
    const current = STATUS_FLOW.indexOf(o.status);
    return h('div', { class: 'steps' }, STATUS_FLOW.map((s, i) => badge(i < current ? 'success' : i === current ? 'info' : 'neutral', STATUS[s].label)));
  }

  const render = () => { renderTabs(); renderStats(); renderTable(); renderDetail(); };

  /* ---------- actions ---------- */
  const nextStatus = (o) => {
    const i = STATUS_FLOW.indexOf(o.status);
    return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null;
  };

  async function apply(o, patch, message) {
    const row = await guarded(() => updateOrder(o.id, patch));
    if (!row) return;
    Object.assign(o, row); // the PATCH response has the columns only, order_items stays as loaded
    render();
    toast(message);
  }

  const advance = (o) => {
    const next = nextStatus(o);
    const patch = { status: next };
    // Cash on delivery is collected when the order is handed over.
    if (next === 'delivered' && o.payment_method === 'cash_on_delivery' && o.payment_status === 'pending') patch.payment_status = 'paid';
    return apply(o, patch, `#${o.number}: ${STATUS[next].label.toLowerCase()}`);
  };
  const confirmPayment = (o) => apply(o, { payment_status: 'paid', ...(o.status === 'received' ? { status: 'confirmed' } : {}) }, `Pago de #${o.number} confirmado`);
  const rejectPayment = (o) => confirm(`¿Rechazar el comprobante de #${o.number}? Quedará marcado como rechazado.`)
    && apply(o, { payment_status: 'rejected' }, `Comprobante de #${o.number} rechazado`);
  const cancelOrder = (o) => confirm(`¿Cancelar el pedido #${o.number}? Esta acción se puede deshacer solo desde la base de datos.`)
    && apply(o, { status: 'cancelled' }, `Pedido #${o.number} cancelado`);

  async function loadProof(o, slot) {
    const cached = proofCache.get(o.proof_path);
    let url = cached && Date.now() - cached.at < PROOF_URL_TTL_MS ? cached.url : null;
    if (!url) {
      try {
        url = await proofUrl(o.proof_path);
        proofCache.set(o.proof_path, { url, at: Date.now() });
      } catch {
        slot.textContent = 'No pudimos cargar el comprobante.';
        return;
      }
    }
    const isPdf = /\.pdf$/i.test(o.proof_path);
    slot.replaceChildren(isPdf
      ? h('a', { class: 'btn btn--secondary btn--sm', href: url, target: '_blank', rel: 'noopener' }, 'Abrir comprobante (PDF)')
      : h('a', { href: url, target: '_blank', rel: 'noopener' }, h('img', { src: url, alt: `Comprobante de pago del pedido ${o.number}` })));
  }

  function select(id) {
    state.selectedId = id;
    state.panelOpen = true;
    renderTable();
    renderDetail();
    if (window.matchMedia('(max-width: 1199px)').matches) detailEl.querySelector('.detail__close')?.focus();
  }
  function closePanel() { state.panelOpen = false; renderDetail(); }

  const onKey = (e) => { if (e.key === 'Escape' && state.panelOpen) closePanel(); };
  document.addEventListener('keydown', onKey);
  const timer = setInterval(() => { if (!document.hidden) refresh(true); }, REFRESH_MS);

  state.orders = await listOrders();
  state.day = defaultDay();
  render();

  return () => { clearInterval(timer); document.removeEventListener('keydown', onKey); };
}
