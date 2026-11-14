import { cart } from './cart.js';
import { CATEGORIES } from './data/defaults.js';
import { nextDeliveryDate } from './delivery.js';
import { bogotaNow, dayName, formatKm, formatLong, formatShort, money } from './format.js';
import { errorMessage } from './messages.js';
import { loadLeaflet, OSM_TILES } from './leaflet-loader.js';
import { feeForKm, hubsOf, nearestHub, roadKm } from './shipping.js';
import { createOrder, getConfig, getProducts } from './store.js';
import { groupProducts } from './catalog.js';
import { bindSteppers, productCard, productGroupCard } from './ui/product-card.js';

const $ = (id) => document.getElementById(id);
const STEPS = ['products', 'details', 'payment', 'confirmation'];
const STEP_TITLES = { products: 'Elige tus productos', details: '¿A dónde te lo llevamos?', payment: '¿Cómo quieres pagar?', confirmation: '' };
const PAYMENT_LABELS = { transfer: 'Transferencia', cash_on_delivery: 'Contraentrega', online: 'Pago en línea' };
const CUSTOMER_KEY = 'ac:customer';
const MAX_PROOF_BYTES = 5 * 1024 * 1024;

let products;
let config;
try {
  [products, config] = await Promise.all([getProducts(), getConfig()]);
} catch (err) {
  // Without live prices and settings we must not let anyone order: show the problem instead.
  const li = document.createElement('li');
  li.className = 'notice notice--error';
  li.textContent = 'No pudimos cargar los productos. Revisa tu conexión e inténtalo de nuevo.';
  $('productList').replaceChildren(li);
  $('nextBtn').disabled = true;
  throw err;
}
const productsById = new Map(products.map((p) => [p.id, p]));
cart.entries().forEach(([id]) => { if (!productsById.has(id)) cart.set(id, 0); }); // drop products that no longer exist

const state = {
  step: 'products',
  filter: 'all',
  location: null,   // { lat, lng } chosen by the customer
  shipping: null,   // { km, estimated, covered, fee }
  payment: 'transfer',
  proof: null,
  order: null,
  geoRequestId: 0,
};

const form = $('detailsForm');

/* ---------------- helpers ---------------- */
const cartLines = () => cart.entries()
  .map(([id, qty]) => ({ product: productsById.get(id), qty }))
  .filter((line) => line.product);
const subtotal = () => cartLines().reduce((sum, l) => sum + l.product.price * l.qty, 0);
const shippingFee = () => (state.shipping?.covered ? state.shipping.fee : 0);

function keyValueRow(label, value, className = '') {
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
/** Saves the details only while "remember me" is checked; unchecking it erases them. */
function saveCustomer() {
  try {
    if (!$('rememberMe').checked) { localStorage.removeItem(CUSTOMER_KEY); return; }
    localStorage.setItem(CUSTOMER_KEY, JSON.stringify({ ...Object.fromEntries(new FormData(form)), location: state.location }));
  } catch { /* optional convenience */ }
  $('forgetBtn').hidden = !$('rememberMe').checked;
}

function forgetCustomer() {
  try { localStorage.removeItem(CUSTOMER_KEY); } catch { /* nothing to erase */ }
  form.reset();
  $('rememberMe').checked = false;
  $('forgetBtn').hidden = true;
  $('rememberNote').textContent = 'Listo, borramos tus datos de este dispositivo.';
}

/* ---------------- navigation ---------------- */
function go(step) { location.hash = step; }

function resolveStep(requested) {
  let step = STEPS.includes(requested) ? requested : 'products';
  if ((step === 'details' || step === 'payment') && cart.units() === 0) step = 'products';
  if (step === 'payment' && !(form.checkValidity() && state.shipping?.covered)) step = 'details';
  if (step === 'confirmation' && !state.order) step = 'products';
  return step;
}

function show(requested) {
  const step = resolveStep(requested);
  if (step !== requested) history.replaceState(null, '', `#${step}`);
  state.step = step;
  const index = STEPS.indexOf(step);

  STEPS.forEach((s) => { $(`step-${s}`).hidden = s !== step; });
  const isDone = step === 'confirmation';
  $('stepHeader').hidden = isDone;
  $('bottomBar').hidden = isDone;
  $('bottomBar').dataset.step = step;

  if (!isDone) {
    $('stepLabel').textContent = `Paso ${index + 1} de 3`;
    $('progressFill').style.width = `${((index + 1) / 3) * 100}%`;
    $('progress').setAttribute('aria-valuenow', String(index + 1));
    $('stepTitle').textContent = STEP_TITLES[step];
    $('nextBtn').textContent = step === 'payment' ? 'Confirmar pedido' : 'Continuar';
  }

  if (step === 'details') { renderDelivery(); initMap(); }
  if (step === 'payment') renderPayment();
  if (step === 'confirmation') renderConfirmation();
  renderBar();

  window.scrollTo(0, 0);
  (isDone ? $('doneTitle') : $('stepTitle')).focus({ preventScroll: true });
}

$('backBtn').addEventListener('click', () => {
  const index = STEPS.indexOf(state.step);
  if (index <= 0) location.href = './'; else go(STEPS[index - 1]);
});
window.addEventListener('hashchange', () => show(location.hash.slice(1)));

/* ---------------- step 1: products ---------------- */
const productList = $('productList');
bindSteppers(productList);

function renderChips() {
  const present = new Set(products.map((p) => p.category));
  const categories = CATEGORIES.filter((c) => c.id === 'all' || present.has(c.id));
  $('chips').replaceChildren(...categories.map((c) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'chip'; button.textContent = c.label;
    button.setAttribute('aria-pressed', String(c.id === state.filter));
    button.addEventListener('click', () => { state.filter = c.id; renderChips(); renderProducts(); });
    return button;
  }));
}

function renderProducts() {
  const shown = products.filter((p) => state.filter === 'all' || p.category === state.filter);
  productList.replaceChildren(...groupProducts(shown).map((item) => (item.type === 'group'
    ? productGroupCard(item)
    : productCard(item.product))));
  if (!shown.length) {
    const li = document.createElement('li'); li.className = 'empty muted'; li.textContent = 'Pronto habrá productos aquí.';
    productList.append(li);
  }
}

function renderBar() {
  const units = cart.units();
  $('barCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
  $('barTotal').textContent = money(subtotal());
  $('nextBtn').disabled = state.step === 'products' && units === 0;
}
cart.subscribe(renderBar);

/* ---------------- step 2: details, map and delivery ---------------- */
function renderDelivery() {
  const date = nextDeliveryDate(config.schedule);
  $('deliveryDate').textContent = date ? formatLong(date) : 'Por confirmar';
  $('deliveryNote').textContent = date
    ? `Pediste un ${dayName(bogotaNow().iso)}, así que entra en la ruta del ${dayName(date)}. Te avisamos por WhatsApp cuando salgamos.`
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

async function initMap() {
  if (mapStarted) { map?.invalidateSize(); return; }
  mapStarted = true;
  try {
    const L = await loadLeaflet();
    const [first] = hubsOf(config.shipping);
    map = L.map('map', { scrollWheelZoom: false }).setView([first.lat, first.lng], 11);
    L.tileLayer(OSM_TILES.url, OSM_TILES.options).addTo(map);
    map.on('click', (e) => setLocation(e.latlng.lat, e.latlng.lng));
    if (state.location) { placeMarker(state.location.lat, state.location.lng); map.setView([state.location.lat, state.location.lng], 15); }
  } catch {
    setGeoStatus('No pudimos cargar el mapa. Usa el botón "Usar mi ubicación".', { error: true });
  }
}

function placeMarker(lat, lng) {
  if (!map) return;
  if (marker) { marker.setLatLng([lat, lng]); return; }
  marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.on('dragend', () => { const p = marker.getLatLng(); setLocation(p.lat, p.lng); });
}

async function setLocation(lat, lng, { pan = false } = {}) {
  state.location = { lat, lng };
  state.shipping = null;
  placeMarker(lat, lng);
  if (pan && map) map.setView([lat, lng], 15);
  const requestId = ++state.geoRequestId;
  setGeoStatus('Calculando domicilio…');

  const { roadFactor, maxKm } = config.shipping;
  const hub = nearestHub(state.location, config.shipping); // the customer never picks a starting point
  const { km, estimated } = await roadKm(hub, state.location, { roadFactor });
  if (requestId !== state.geoRequestId) return; // the customer moved the pin while we were calculating

  const result = feeForKm(km, config.shipping, hub);
  state.shipping = { km, estimated, hub: hub.label, ...result };
  if (result.covered) {
    setGeoStatus(`Domicilio: ${money(result.fee)} · ${estimated ? '≈ ' : ''}${formatKm(km)} km desde ${hub.label}`);
  } else {
    setGeoStatus(`Tu ubicación queda a ${estimated ? '≈ ' : ''}${formatKm(km)} km, fuera de nuestra zona de entrega (máximo ${maxKm} km). Escríbenos y vemos cómo ayudarte.`, { error: true });
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

/* ---------------- step 3: payment ---------------- */
function renderPayment() {
  const fee = shippingFee();
  const total = subtotal() + fee;

  $('summaryLines').replaceChildren(
    ...cartLines().map((l) => keyValueRow(`${l.qty} × ${l.product.name}`, money(l.product.price * l.qty))),
    keyValueRow('Domicilio', money(fee)),
    keyValueRow('Total', money(total), 'total'),
  );

  const { transfer, cashOnDelivery } = config.payments;
  $('transferTitle').textContent = `Transfiere ${money(total)} a:`;
  $('transferSub').textContent = transfer.accounts.map((a) => a.label.split(' ')[0]).join(' · ');
  $('transferAccounts').replaceChildren(
    ...transfer.accounts.map((a) => keyValueRow(a.label, a.value)),
    keyValueRow('Titular', transfer.holder),
  );
  $('transferOption').hidden = !transfer.enabled;
  $('cashOption').hidden = !cashOnDelivery.enabled;

  // Fall back to an enabled method if the selected one is not available.
  const available = [transfer.enabled && 'transfer', cashOnDelivery.enabled && 'cash_on_delivery'].filter(Boolean);
  if (!available.includes(state.payment)) state.payment = available[0] ?? 'transfer';
  document.querySelector(`input[name="payment"][value="${state.payment}"]`).checked = true;
  syncPaymentUi();
}

function syncPaymentUi() {
  $('transferDetail').hidden = state.payment !== 'transfer' || !config.payments.transfer.enabled;
  $('submitError').hidden = true;
}

document.querySelectorAll('input[name="payment"]').forEach((radio) => radio.addEventListener('change', () => {
  state.payment = radio.value;
  syncPaymentUi();
}));

$('proofInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  const valid = file && (file.type.startsWith('image/') || file.type === 'application/pdf') && file.size <= MAX_PROOF_BYTES;
  if (file && !valid) {
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

function showError(message) {
  const el = $('submitError');
  el.textContent = message;
  el.hidden = false;
}

async function submitOrder() {
  $('submitError').hidden = true;
  if (state.payment === 'transfer' && !state.proof) {
    showError('Adjunta el comprobante de la transferencia para continuar.');
    return;
  }
  const button = $('nextBtn');
  button.disabled = true;
  button.textContent = 'Enviando…';
  try {
    const f = Object.fromEntries(new FormData(form));
    state.order = await createOrder({
      items: cart.entries().map(([id, qty]) => ({ id, qty })),
      customer: {
        name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(),
        address: f.address.trim(), neighborhood: f.neighborhood.trim(), notes: f.notes.trim(),
      },
      delivery: { km: state.shipping.km, lat: state.location.lat, lng: state.location.lng },
      payment: { method: state.payment, proof: state.proof },
    });
    cart.clear();
    go('confirmation');
  } catch (err) {
    showError(errorMessage(err));
  } finally {
    button.disabled = false;
    button.textContent = 'Confirmar pedido';
  }
}

/* ---------------- confirmation ---------------- */
function renderConfirmation() {
  const order = state.order;
  $('doneSub').textContent = `Pedido #${order.number} · Gracias, ${order.customer.name.split(' ')[0]}`;
  const rows = [
    keyValueRow('Entrega', formatShort(order.delivery.date)),
    keyValueRow('Pago', PAYMENT_LABELS[order.payment.method]),
  ];
  if (order.payment.method === 'transfer') rows.push(keyValueRow('Comprobante', 'En revisión'));
  rows.push(keyValueRow('Total', money(order.total), 'total'));
  $('doneDetail').replaceChildren(...rows);

  const whatsapp = config.business.whatsapp.replace(/\D/g, '');
  const button = $('whatsBtn');
  button.hidden = !whatsapp;
  if (whatsapp) button.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, hice el pedido ${order.number}.`)}`;
}

/* ---------------- primary button ---------------- */
/** Asks the customer to confirm the selection (with the products total, no shipping) before the details step. */
function openConfirmDialog() {
  $('confirmLines').replaceChildren(...cartLines().map((l) => keyValueRow(`${l.qty} × ${l.product.name}`, money(l.product.price * l.qty))));
  $('confirmTotal').textContent = money(subtotal());
  const dialog = $('confirmDialog');
  dialog.showModal();
  $('confirmOk').focus();
}
$('confirmBack').addEventListener('click', () => $('confirmDialog').close());
$('confirmOk').addEventListener('click', () => { $('confirmDialog').close(); go('details'); });
$('confirmDialog').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }); // click on the backdrop

$('nextBtn').addEventListener('click', () => {
  if (state.step === 'products') { openConfirmDialog(); return; }

  if (state.step === 'details') {
    if (!form.reportValidity()) return;
    if (!state.location) { setGeoStatus('Marca tu ubicación en el mapa para calcular el domicilio.', { error: true }); $('locateBtn').focus(); return; }
    if (!state.shipping) { setGeoStatus('Estamos calculando tu domicilio, un momento…'); return; }
    if (!state.shipping.covered) return;
    saveCustomer();
    go('payment');
    return;
  }
  if (state.step === 'payment') submitOrder();
});

/* ---------------- startup ---------------- */
const saved = loadCustomer();
const hasSaved = Object.keys(saved).length > 0;
$('rememberMe').checked = hasSaved;
$('forgetBtn').hidden = !hasSaved;
$('rememberMe').addEventListener('change', saveCustomer);
$('forgetBtn').addEventListener('click', forgetCustomer);
for (const [name, value] of Object.entries(saved)) {
  if (name !== 'location' && form.elements[name]) form.elements[name].value = value;
}
if (saved.location && Number.isFinite(saved.location.lat) && Number.isFinite(saved.location.lng)) {
  setLocation(saved.location.lat, saved.location.lng);
}

renderChips();
renderProducts();
show(location.hash.slice(1));
