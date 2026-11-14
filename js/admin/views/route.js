// Delivery route: the day's stops on a map and in order, with Google Maps links for the driver.
import { addDays, bogotaNow, dayName, formatLong, money } from '../../format.js';
import { loadLeaflet, OSM_TILES } from '../../leaflet-loader.js';
import { haversineKm, hubsOf } from '../../shipping.js';
import { getSettings, listOrders, updateOrder } from '../api.js';
import { badge, guarded, h, mapsLink, shortDay, toast, whatsappLink } from '../ui.js';

const MAPS_LEG_STOPS = 10; // Google Maps accepts origin + 9 waypoints + destination per link

/** Greedy nearest-neighbor order starting from `origin`: a good-enough first draft the owner can reorder. */
function nearestOrder(origin, stops) {
  const left = [...stops];
  const result = [];
  let from = origin;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) {
      if (haversineKm(from, left[i]) < haversineKm(from, left[best])) best = i;
    }
    const [next] = left.splice(best, 1);
    result.push(next);
    from = next;
  }
  return result;
}

export async function mount(container) {
  const today = bogotaNow().iso;
  const [orders, settings] = await Promise.all([listOrders(), getSettings()]);
  const hubs = hubsOf(settings.shipping);
  const origin = hubs[0]; // where the draft route starts on the map
  const state = { orders, day: null, stops: [], dirty: false };

  const days = [...new Set(orders.filter((o) => o.status !== 'cancelled' && o.delivery_date >= addDays(today, -7)).map((o) => o.delivery_date))].sort();
  state.day = days.find((d) => d >= today) ?? days.at(-1) ?? null;

  const tabsEl = h('div', { class: 'toolbar', style: 'margin:0' });
  const summaryEl = h('div', { class: 'stats' });
  const actionsEl = h('div', { class: 'row-actions' });
  const linksEl = h('div', { class: 'row-actions' });
  const listEl = h('ol', { class: 'route-list' });
  const mapEl = h('div', { class: 'route-map', role: 'application', 'aria-label': 'Mapa de la ruta de entregas' });

  container.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Ruta de entregas')),
    h('div', { class: 'toolbar' }, tabsEl),
    summaryEl,
    h('div', { class: 'route' },
      h('div', { class: 'route__side' }, actionsEl, listEl, linksEl),
      mapEl));

  /* ---------- data for the selected day ---------- */
  function loadDay() {
    const dayOrders = state.orders.filter((o) => o.delivery_date === state.day && o.status !== 'cancelled');
    const placed = dayOrders.filter((o) => o.route_position != null).sort((a, b) => a.route_position - b.route_position);
    const unplaced = dayOrders.filter((o) => o.route_position == null);
    // Draft: stops grouped by starting point (in the order of the settings), nearest-first inside each group.
    const known = new Set(hubs.map((h) => h.label));
    const drafted = [
      ...hubs.flatMap((hub) => nearestOrder(placed.at(-1) ?? hub, unplaced.filter((o) => o.hub === hub.label))),
      ...nearestOrder(placed.at(-1) ?? origin, unplaced.filter((o) => !known.has(o.hub))),
    ];
    state.stops = [...placed, ...drafted];
    state.dirty = false; // nothing to save until the owner reorders (a first draft by proximity is still shown)
  }

  const pending = () => state.stops.filter((o) => o.status !== 'delivered');

  /* ---------- rendering ---------- */
  function renderTabs() {
    tabsEl.replaceChildren(...days.map((d) => h('button', { class: 'day-chip', type: 'button', 'aria-pressed': String(d === state.day),
      onClick: () => { if (state.dirty && !confirm('Tienes cambios sin guardar en el orden. ¿Descartarlos?')) return; state.day = d; refresh(); } }, shortDay(d, dayName))));
    if (!days.length) tabsEl.replaceChildren(h('p', { class: 'muted' }, 'No hay entregas programadas.'));
  }

  function renderSummary() {
    const stat = (label, value, sub) => h('div', { class: 'stat' }, h('span', { class: 'stat__label' }, label), h('span', { class: 'stat__value' }, value), h('span', { class: 'stat__sub' }, sub));
    const cash = state.stops.filter((o) => o.payment_method === 'cash_on_delivery' && o.payment_status !== 'paid' && o.status !== 'delivered');
    const kmTotal = state.stops.reduce((s, o) => s + Number(o.km), 0);
    summaryEl.replaceChildren(
      stat('Paradas', String(state.stops.length), state.day ? formatLong(state.day).toLowerCase() : '—'),
      stat('Por entregar', String(pending().length), `${state.stops.length - pending().length} entregadas`),
      stat('Por cobrar', money(cash.reduce((s, o) => s + o.total, 0)), `${cash.length} contraentrega`),
      stat('Distancia a domicilios', `${Math.round(kmTotal)} km`, 'suma de cada pedido desde el punto de origen'));
  }

  function renderActions() {
    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'button', disabled: !state.dirty, onClick: saveOrder }, 'Guardar orden');
    const auto = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', disabled: state.stops.length < 2, onClick: autoOrder }, 'Ordenar por cercanía');
    actionsEl.replaceChildren(...[auto, save, state.dirty ? h('span', { class: 'hint' }, 'Orden sin guardar') : null].filter(Boolean));
  }

  function renderList() {
    if (!state.stops.length) {
      listEl.replaceChildren(h('li', { class: 'route-empty muted' }, 'No hay paradas para este día.'));
      return;
    }
    listEl.replaceChildren(...state.stops.map((o, i) => {
      const done = o.status === 'delivered';
      const owes = o.payment_method === 'cash_on_delivery' && o.payment_status !== 'paid';
      const items = (o.order_items ?? []).map((it) => `${it.qty} × ${it.name}`).join(', ');
      return h('li', { class: `stop card${done ? ' stop--done' : ''}` },
        h('span', { class: 'stop__num', 'aria-hidden': 'true' }, String(i + 1)),
        h('div', { class: 'stop__body' },
          h('div', { class: 'stop__head' }, h('strong', {}, o.customer_name), o.number && h('span', { class: 'muted' }, `#${o.number}`),
            done ? badge('success', 'Entregado') : owes ? badge('warning', `Cobrar ${money(o.total)}`) : null),
          h('span', {}, `${o.address}, ${o.neighborhood}${o.city ? `, ${o.city}` : ''}`),
          o.hub && h('span', { class: 'muted' }, `Zona: ${o.hub}`),
          o.notes && h('span', { class: 'muted' }, o.notes),
          h('span', { class: 'muted' }, items),
          h('div', { class: 'row-actions' },
            h('a', { class: 'btn btn--secondary btn--sm', href: mapsLink(o.lat, o.lng), target: '_blank', rel: 'noopener' }, 'Mapa'),
            h('a', { class: 'btn btn--secondary btn--sm', href: whatsappLink(o.customer_phone), target: '_blank', rel: 'noopener' }, 'WhatsApp'),
            h('a', { class: 'btn btn--secondary btn--sm', href: `tel:${o.customer_phone.replace(/\s/g, '')}` }, 'Llamar'),
            !done && h('button', { class: 'btn btn--dark btn--sm', type: 'button', onClick: () => markDelivered(o) }, 'Entregado'))),
        h('div', { class: 'stop__move' },
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'aria-label': `Subir parada ${i + 1}`, disabled: i === 0, onClick: () => move(i, -1) }, '↑'),
          h('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'aria-label': `Bajar parada ${i + 1}`, disabled: i === state.stops.length - 1, onClick: () => move(i, 1) }, '↓')));
    }));
  }

  /** One Google Maps link per leg of up to 10 stops, so long days still open in the app. */
  function renderLinks() {
    const todo = pending();
    if (!todo.length) { linksEl.replaceChildren(); return; }
    const legs = [];
    for (let i = 0; i < todo.length; i += MAPS_LEG_STOPS) legs.push(todo.slice(i, i + MAPS_LEG_STOPS));
    linksEl.replaceChildren(...legs.map((leg, n) => {
      // The first leg has no fixed origin: Google Maps then starts from where the driver is.
      const start = n === 0 ? null : legs[n - 1].at(-1);
      const dest = leg.at(-1);
      const via = leg.slice(0, -1).map((o) => `${o.lat},${o.lng}`).join('|');
      const url = `https://www.google.com/maps/dir/?api=1${start ? `&origin=${start.lat},${start.lng}` : ''}&destination=${dest.lat},${dest.lng}&travelmode=driving${via ? `&waypoints=${encodeURIComponent(via)}` : ''}`;
      return h('a', { class: 'btn btn--primary btn--sm', href: url, target: '_blank', rel: 'noopener' },
        legs.length > 1 ? `Abrir tramo ${n + 1} en Google Maps` : 'Abrir ruta en Google Maps');
    }));
  }

  /* ---------- map ---------- */
  let L = null; let map = null; let layer = null;
  async function ensureMap() {
    if (map) return;
    try { L = await loadLeaflet(); } catch { mapEl.replaceChildren(h('p', { class: 'muted', style: 'padding:16px' }, 'No pudimos cargar el mapa. La lista de paradas sigue funcionando.')); return; }
    map = L.map(mapEl, { scrollWheelZoom: false }).setView([origin.lat, origin.lng], 12);
    L.tileLayer(OSM_TILES.url, OSM_TILES.options).addTo(map);
    layer = L.layerGroup().addTo(map);
  }

  async function renderMap() {
    await ensureMap();
    if (!map) return;
    layer.clearLayers();
    const points = [[origin.lat, origin.lng]];
    L.marker(points[0], { icon: L.divIcon({ className: 'route-pin route-pin--origin', html: '★', iconSize: [28, 28] }), title: origin.label ?? 'Origen' }).addTo(layer);
    state.stops.forEach((o, i) => {
      const p = [o.lat, o.lng];
      points.push(p);
      L.marker(p, { icon: L.divIcon({ className: `route-pin${o.status === 'delivered' ? ' route-pin--done' : ''}`, html: String(i + 1), iconSize: [28, 28] }), title: `${i + 1}. ${o.customer_name}` }).addTo(layer);
    });
    if (points.length > 1) {
      L.polyline(points, { color: '#5B6B3A', weight: 3, opacity: 0.8, dashArray: '6 6' }).addTo(layer);
      map.fitBounds(points, { padding: [32, 32], maxZoom: 15 });
    }
    setTimeout(() => map.invalidateSize(), 0);
  }

  /* ---------- actions ---------- */
  function render() { renderTabs(); renderSummary(); renderActions(); renderList(); renderLinks(); renderMap(); }
  function refresh() { loadDay(); render(); }

  function move(i, delta) {
    const j = i + delta;
    [state.stops[i], state.stops[j]] = [state.stops[j], state.stops[i]];
    state.dirty = true;
    render();
  }

  function autoOrder() {
    state.stops = nearestOrder(origin, state.stops);
    state.dirty = true;
    render();
  }

  async function saveOrder() {
    const ok = await guarded(() => Promise.all(state.stops.map((o, i) => updateOrder(o.id, { route_position: i + 1 }).then((row) => Object.assign(o, row)))),
      'No pudimos guardar el orden de la ruta.');
    if (!ok) return;
    state.dirty = false;
    render();
    toast('Orden de la ruta guardado');
  }

  async function markDelivered(o) {
    const patch = { status: 'delivered' };
    if (o.payment_method === 'cash_on_delivery' && o.payment_status === 'pending') patch.payment_status = 'paid';
    const row = await guarded(() => updateOrder(o.id, patch));
    if (!row) return;
    Object.assign(o, row);
    render();
    toast(`#${o.number} entregado`);
  }

  refresh();
  return () => { map?.remove(); map = null; };
}
