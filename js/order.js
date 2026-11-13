import { cart } from './cart.js';
import { CATEGORIES } from './data/seed.js';
import { nextDeliveryDate } from './delivery.js';
import { bogotaNow, dayName, formatLong, formatShort, km1, money } from './format.js';
import { feeForKm, roadKm } from './shipping.js';
import { createOrder, getConfig, getProducts } from './store.js';
import { bindSteppers, productCard } from './ui/product-card.js';

const $ = (id) => document.getElementById(id);
const STEPS = ['productos', 'datos', 'pago', 'confirmacion'];
const TITLES = { productos: 'Elige tus productos', datos: '¿A dónde te lo llevamos?', pago: '¿Cómo quieres pagar?', confirmacion: '' };
const CUSTOMER_KEY = 'ac:customer';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

const [products, config] = await Promise.all([getProducts(), getConfig()]);
const byId = new Map(products.map((p) => [p.id, p]));
cart.entries().forEach(([id]) => { if (!byId.has(id)) cart.set(id, 0); }); // limpia productos que ya no existen

const state = {
  step: 'productos',
  filter: 'todo',
  loc: null,        // { lat, lng } elegido por el cliente
  delivery: null,   // { km, estimated, covered, fee }
  payment: 'transferencia',
  proof: null,
  order: null,
  geoSeq: 0,
};

const form = $('dataForm');

/* ---------------- utilidades ---------------- */
const lines = () => cart.entries().map(([id, q]) => ({ p: byId.get(id), q })).filter((l) => l.p);
const subtotal = () => lines().reduce((s, l) => s + l.p.price * l.q, 0);
const shippingFee = () => (state.delivery?.covered ? state.delivery.fee : 0);

function kvRow(label, value, className = '') {
  const row = document.createElement('div');
  if (className) row.className = className;
  const dt = document.createElement('dt'); dt.textContent = label;
  const dd = document.createElement('dd'); dd.textContent = value;
  row.append(dt, dd);
  return row;
}

function loadCustomer() {
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) ?? '{}'); } catch { return {}; }
}
function saveCustomer() {
  try {
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ ...Object.fromEntries(new FormData(form)), loc: state.loc }));
  } catch { /* opcional */ }
}

/* ---------------- navegación ---------------- */
function go(step) { location.hash = step; }

function resolveStep(requested) {
  let step = STEPS.includes(requested) ? requested : 'productos';
  if ((step === 'datos' || step === 'pago') && cart.units() === 0) step = 'productos';
  if (step === 'pago' && !(form.checkValidity() && state.delivery?.covered)) step = 'datos';
  if (step === 'confirmacion' && !state.order) step = 'productos';
  return step;
}

function show(requested) {
  const step = resolveStep(requested);
  if (step !== requested) history.replaceState(null, '', `#${step}`);
  state.step = step;
  const i = STEPS.indexOf(step);

  STEPS.forEach((s) => { $(`step-${s}`).hidden = s !== step; });
  const done = step === 'confirmacion';
  $('stepHeader').hidden = done;
  $('bottomBar').hidden = done;
  $('bottomBar').dataset.step = step;

  if (!done) {
    $('stepLabel').textContent = `Paso ${i + 1} de 3`;
    $('progressFill').style.width = `${((i + 1) / 3) * 100}%`;
    $('progress').setAttribute('aria-valuenow', String(i + 1));
    $('stepTitle').textContent = TITLES[step];
    $('nextBtn').textContent = step === 'pago' ? 'Confirmar pedido' : 'Continuar';
  }

  if (step === 'datos') { renderDelivery(); initMap(); }
  if (step === 'pago') renderPayment();
  if (step === 'confirmacion') renderDone();
  renderBar();

  window.scrollTo(0, 0);
  (done ? $('doneTitle') : $('stepTitle')).focus({ preventScroll: true });
}

$('backBtn').addEventListener('click', () => {
  const i = STEPS.indexOf(state.step);
  if (i <= 0) location.href = './'; else go(STEPS[i - 1]);
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ---------------- paso 1: productos ---------------- */
const list = $('productList');
bindSteppers(list);

function renderChips() {
  const present = new Set(products.map((p) => p.category));
  const cats = CATEGORIES.filter((c) => c.id === 'todo' || present.has(c.id));
  $('chips').replaceChildren(...cats.map((c) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = c.label;
    b.setAttribute('aria-pressed', String(c.id === state.filter));
    b.addEventListener('click', () => { state.filter = c.id; renderChips(); renderProducts(); });
    return b;
  }));
}
function renderProducts() {
  const shown = products.filter((p) => state.filter === 'todo' || p.category === state.filter);
  list.replaceChildren(...shown.map(productCard));
  if (!shown.length) {
    const li = document.createElement('li'); li.className = 'empty muted'; li.textContent = 'Pronto habrá productos aquí.';
    list.append(li);
  }
}

function renderBar() {
  const units = cart.units();
  $('barCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
  $('barTotal').textContent = money(subtotal());
  if (state.step === 'productos') $('nextBtn').disabled = units === 0;
  else $('nextBtn').disabled = false;
}
cart.subscribe(renderBar);

/* ---------------- paso 2: datos, mapa y entrega ---------------- */
function renderDelivery() {
  const d = nextDeliveryDate(config.schedule);
  $('deliveryDate').textContent = d ? formatLong(d) : 'Por confirmar';
  $('deliveryNote').textContent = d
    ? `Pediste un ${dayName(bogotaNow().iso)}, así que entra en la ruta del ${dayName(d)}. Te avisamos por WhatsApp cuando salgamos.`
    : 'Te escribiremos para acordar la fecha de entrega.';
}

function setGeoStatus(text, { error = false } = {}) {
  const el = $('geoStatus');
  el.textContent = text;
  el.classList.toggle('notice--error', error);
}

let map = null;
let marker = null;
let mapStarted = false;

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.append(s);
  });
}

async function initMap() {
  if (mapStarted) { map?.invalidateSize(); return; }
  mapStarted = true;
  try {
    const L = await loadLeaflet();
    const { origin } = config.shipping;
    map = L.map('map', { scrollWheelZoom: false }).setView([origin.lat, origin.lng], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© colaboradores de OpenStreetMap',
    }).addTo(map);
    map.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng));
    if (state.loc) { putMarker(state.loc.lat, state.loc.lng); map.setView([state.loc.lat, state.loc.lng], 15); }
  } catch {
    setGeoStatus('No pudimos cargar el mapa. Usa el botón "Usar mi ubicación".', { error: true });
  }
}

function putMarker(lat, lng) {
  if (!map) return;
  if (marker) { marker.setLatLng([lat, lng]); return; }
  marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.on('dragend', () => { const p = marker.getLatLng(); setLocation(p.lat, p.lng); });
}

async function setLocation(lat, lng, { pan = false } = {}) {
  state.loc = { lat, lng };
  state.delivery = null;
  putMarker(lat, lng);
  if (pan && map) map.setView([lat, lng], 15);
  const seq = ++state.geoSeq;
  setGeoStatus('Calculando domicilio…');

  const { origin, roadFactor, maxKm } = config.shipping;
  const { km, estimated } = await roadKm(origin, state.loc, { roadFactor });
  if (seq !== state.geoSeq) return; // el cliente movió el pin mientras calculábamos

  const result = feeForKm(km, config.shipping);
  state.delivery = { km, estimated, ...result };
  if (result.covered) {
    setGeoStatus(`Domicilio: ${money(result.fee)} · ${estimated ? '≈ ' : ''}${km1(km)} km desde ${origin.label}`);
  } else {
    setGeoStatus(`Tu ubicación queda a ${estimated ? '≈ ' : ''}${km1(km)} km, fuera de nuestra zona de entrega (máximo ${maxKm} km). Escríbenos y vemos cómo ayudarte.`, { error: true });
  }
  saveCustomer();
}

$('locateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) { setGeoStatus('Tu navegador no permite ubicarte. Toca el mapa.', { error: true }); return; }
  setGeoStatus('Buscando tu ubicación…');
  navigator.geolocation.getCurrentPosition(
    (pos) => setLocation(pos.coords.latitude, pos.coords.longitude, { pan: true }),
    () => setGeoStatus('No pudimos obtener tu ubicación. Toca el mapa para marcarla.', { error: true }),
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

form.addEventListener('input', saveCustomer);

/* ---------------- paso 3: pago ---------------- */
function renderPayment() {
  const sub = subtotal();
  const fee = shippingFee();
  const total = sub + fee;

  $('summaryLines').replaceChildren(
    ...lines().map((l) => kvRow(`${l.q} × ${l.p.name}`, money(l.p.price * l.q))),
    kvRow('Domicilio', money(fee)),
    kvRow('Total', money(total), 'total'),
  );

  const tr = config.payments.transfer;
  $('transferTitle').textContent = `Transfiere ${money(total)} a:`;
  $('transferSub').textContent = tr.accounts.map((a) => a.label.split(' ')[0]).join(' · ');
  $('transferAccounts').replaceChildren(
    ...tr.accounts.map((a) => kvRow(a.label, a.value)),
    kvRow('Titular', tr.holder),
  );
  $('codOption').hidden = !config.payments.cod.enabled;
  syncPaymentUi();
}

function syncPaymentUi() {
  $('transferDetail').hidden = state.payment !== 'transferencia';
  $('submitError').hidden = true;
}

document.querySelectorAll('input[name="payment"]').forEach((r) => r.addEventListener('change', () => {
  state.payment = r.value;
  syncPaymentUi();
}));

$('proofInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const ok = file && (file.type.startsWith('image/') || file.type === 'application/pdf') && file.size <= MAX_PROOF_BYTES;
  if (file && !ok) {
    e.target.value = '';
    state.proof = null;
    showError('El comprobante debe ser una imagen o un PDF de máximo 5 MB.');
  } else {
    state.proof = file ?? null;
    $('submitError').hidden = true;
  }
  $('proofMain').textContent = state.proof ? `✓ ${state.proof.name}` : '＋ Adjuntar comprobante';
  $('proofSub').textContent = state.proof ? 'Toca para cambiarlo' : 'Foto o PDF de la transferencia';
});

function showError(msg) {
  const el = $('submitError');
  el.textContent = msg;
  el.hidden = false;
}

async function submit() {
  $('submitError').hidden = true;
  if (state.payment === 'transferencia' && !state.proof) {
    showError('Adjunta el comprobante de la transferencia para continuar.');
    return;
  }
  const btn = $('nextBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    const f = Object.fromEntries(new FormData(form));
    state.order = await createOrder({
      items: cart.entries().map(([id, qty]) => ({ id, qty })),
      customer: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), address: f.address.trim(), neighborhood: f.neighborhood.trim(), notes: f.notes.trim() },
      delivery: { km: state.delivery.km, lat: state.loc.lat, lng: state.loc.lng },
      payment: { method: state.payment, proof: state.proof },
    });
    cart.clear();
    go('confirmacion');
  } catch (err) {
    showError(err.message || 'No pudimos enviar tu pedido. Inténtalo de nuevo.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar pedido';
  }
}

/* ---------------- confirmación ---------------- */
const PAY_LABEL = { transferencia: 'Transferencia', contraentrega: 'Contraentrega', online: 'Pago en línea' };

function renderDone() {
  const o = state.order;
  $('doneSub').textContent = `Pedido #${o.number} · Gracias, ${o.customer.name.split(' ')[0]}`;
  const rows = [
    kvRow('Entrega', formatShort(o.delivery.date)),
    kvRow('Pago', PAY_LABEL[o.payment.method]),
  ];
  if (o.payment.method === 'transferencia') rows.push(kvRow('Comprobante', 'En revisión'));
  rows.push(kvRow('Total', money(o.total), 'total'));
  $('doneDetail').replaceChildren(...rows);

  const wa = config.business.whatsapp.replace(/\D/g, '');
  const btn = $('whatsBtn');
  btn.hidden = !wa;
  if (wa) btn.href = `https://wa.me/${wa}?text=${encodeURIComponent(`Hola, hice el pedido ${o.number}.`)}`;
}

/* ---------------- botón principal ---------------- */
$('nextBtn').addEventListener('click', () => {
  if (state.step === 'productos') { go('datos'); return; }

  if (state.step === 'datos') {
    if (!form.reportValidity()) return;
    if (!state.loc) { setGeoStatus('Marca tu ubicación en el mapa para calcular el domicilio.', { error: true }); $('locateBtn').focus(); return; }
    if (!state.delivery) { setGeoStatus('Estamos calculando tu domicilio, un momento…'); return; }
    if (!state.delivery.covered) return;
    saveCustomer();
    go('pago');
    return;
  }
  if (state.step === 'pago') submit();
});

/* ---------------- arranque ---------------- */
const saved = loadCustomer();
for (const [name, value] of Object.entries(saved)) {
  if (name !== 'loc' && form.elements[name]) form.elements[name].value = value;
}
if (saved.loc && Number.isFinite(saved.loc.lat) && Number.isFinite(saved.loc.lng)) {
  setLocation(saved.loc.lat, saved.loc.lng);
}

renderChips();
renderProducts();
show(location.hash.slice(1));
