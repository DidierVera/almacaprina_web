import { cart } from './cart.js';
import { CATEGORIES } from './data/defaults.js';
import { chooseableDeliveryDates } from './delivery.js';
import { bogotaNow, formatKm, formatLong, formatShort, mondayOf, money } from './format.js';
import { errorMessage } from './messages.js';
import { loadLeaflet, OSM_TILES } from './leaflet-loader.js';
import { findPlaces, normalizeStreet, reversePlace } from './geocode.js';
import { POLICY_VERSION } from './legal.js';
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
  deliveryDate: null, // the date the customer picked (ISO)
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

  if (step === 'details') renderDelivery();
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
  $('clearBtn').hidden = units === 0;
}
$('clearBtn').addEventListener('click', () => {
  if (confirm('¿Quitar todos los productos de tu pedido?')) cart.clear();
});
cart.subscribe(renderBar);

/* ---------------- step 2: details, map and delivery ---------------- */
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const WEEK_TITLES = ['Esta semana', 'La próxima semana', 'En dos semanas', 'En tres semanas', 'En cuatro semanas', 'En cinco semanas', 'En seis semanas'];

/** The customer picks the delivery day among the next delivery dates (the first one is preselected). */
function renderDelivery() {
  const dates = chooseableDeliveryDates(config.schedule);
  const box = $('deliveryOptions');
  if (!dates.length) {
    box.replaceChildren();
    state.deliveryDate = null;
    $('deliveryNote').textContent = 'Te escribiremos para acordar la fecha de entrega.';
    return;
  }
  if (!dates.includes(state.deliveryDate)) state.deliveryDate = dates[0];

  const thisMonday = mondayOf(bogotaNow().iso);
  const groups = new Map();
  for (const date of dates) {
    const offset = Math.round(daysBetween(thisMonday, mondayOf(date)) / 7);
    groups.set(offset, [...(groups.get(offset) ?? []), date]);
  }

  box.replaceChildren(...[...groups].map(([offset, list]) => {
    const group = document.createElement('div');
    group.className = 'delivery-pick__group';
    const title = document.createElement('p');
    title.className = 'delivery-pick__week';
    title.textContent = WEEK_TITLES[offset] ?? `En ${offset} semanas`;
    group.append(title);
    for (const date of list) {
      const label = document.createElement('label');
      label.className = 'delivery-option';
      const input = document.createElement('input');
      input.type = 'radio'; input.name = 'deliveryDate'; input.value = date; input.checked = date === state.deliveryDate;
      input.addEventListener('change', () => { state.deliveryDate = date; renderDeliveryNote(); });
      const text = document.createElement('span');
      text.className = 'delivery-option__day';
      text.textContent = formatLong(date);
      label.append(input, text);
      if (date === dates[0]) {
        const tag = document.createElement('small');
        tag.className = 'delivery-option__tag';
        tag.textContent = 'Lo más pronto';
        label.append(tag);
      }
      group.append(label);
    }
    return group;
  }));
  renderDeliveryNote();
}

function renderDeliveryNote() {
  $('deliveryNote').textContent = state.deliveryDate
    ? `Tu pedido llega el ${formatLong(state.deliveryDate)}. Te avisamos por WhatsApp cuando salgamos.`
    : '';
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
    setGeoStatus('No pudimos cargar el mapa. Usa el botón "Usar mi ubicación actual".', { error: true });
  }
}

function placeMarker(lat, lng) {
  if (!map) return;
  if (marker) { marker.setLatLng([lat, lng]); return; }
  marker = window.L.marker([lat, lng], { draggable: true }).addTo(map);
  marker.on('dragend', () => { const p = marker.getLatLng(); setLocation(p.lat, p.lng); });
}

async function setLocation(lat, lng, { pan = false, reverse = true } = {}) {
  state.location = { lat, lng };
  state.shipping = null;
  renderLocationCard();
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
  renderLocationCard();
  saveCustomer();
  if (reverse) suggestAddressFromPin(requestId);
}

/* Address from the map pin: fills what is empty, and offers to replace what differs. */
const plainText = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
let hintPlace = null;

/** A typed street number ("# 44-12") is kept when the street name is replaced by the map's. */
const numberSuffix = (typed) => typed.match(/\s*(?:#|n[o°º]\.?|nro\.?)\s*.+$/i)?.[0] ?? '';

function applyPlace(place) {
  const typed = $('f-address').value.trim();
  const road = place.road ? `${place.road}${place.houseNumber ? ` # ${place.houseNumber}` : numberSuffix(typed)}` : typed;
  const cityChanged = place.city && $('f-city').value.trim() && plainText(place.city) !== plainText($('f-city').value);
  // A neighborhood from another municipality would be wrong: leave it empty for the customer to fill in.
  const neighborhood = place.neighborhood || (cityChanged ? '' : $('f-neighborhood').value.trim());
  const values = { 'f-address': road, 'f-neighborhood': neighborhood, 'f-city': place.city || $('f-city').value.trim() };
  for (const [id, value] of Object.entries(values)) {
    const control = $(id);
    control.value = value;
    clearFieldError(control);
  }
  saveCustomer();
}

async function suggestAddressFromPin(requestId) {
  $('addressHint').hidden = true;
  let place = null;
  try { place = await reversePlace(state.location.lat, state.location.lng); } catch { return; }
  if (!place || requestId !== state.geoRequestId) return; // the pin moved again meanwhile

  const typed = { address: $('f-address').value.trim(), neighborhood: $('f-neighborhood').value.trim(), city: $('f-city').value.trim() };
  const empty = !typed.address && !typed.city;
  if (empty) {
    applyPlace(place);
    $('addressHintText').textContent = `Completamos tu dirección con el mapa: ${place.label}. Revísala y agrega el número si falta.`;
    $('addressHintBtn').hidden = true;
    $('addressHint').hidden = false;
    return;
  }
  const sameStreet = place.road && plainText(normalizeStreet(typed.address)).includes(plainText(place.road));
  const sameCity = !place.city || !typed.city || plainText(place.city) === plainText(typed.city);
  if (sameStreet && sameCity) return; // what is typed already matches the map
  hintPlace = place;
  $('addressHintText').textContent = `Según el mapa, este punto está en: ${place.label}.`;
  $('addressHintBtn').hidden = false;
  $('addressHint').hidden = false;
}
$('addressHintBtn').addEventListener('click', () => {
  if (hintPlace) applyPlace(hintPlace);
  $('addressHintText').textContent = 'Listo, actualizamos tu dirección con la del mapa.';
  $('addressHintBtn').hidden = true;
});

/* The card under the address: shows whether the delivery point is set, and opens the map dialog. */
function renderLocationCard() {
  const card = $('locationCard');
  const s = state.shipping;
  card.classList.remove('location-card--set', 'location-card--bad', 'is-invalid');
  const button = $('locationBtn');
  button.className = 'btn btn--primary';
  if (!state.location) {
    $('locationText').textContent = 'Marca en el mapa el punto exacto donde recibirás tu pedido. Con eso calculamos el domicilio.';
    button.textContent = 'Marcar en el mapa';
  } else if (!s) {
    $('locationText').textContent = 'Calculando el domicilio…';
    button.textContent = 'Cambiar ubicación'; button.className = 'btn btn--secondary';
  } else if (s.covered) {
    card.classList.add('location-card--set');
    $('locationText').textContent = `✓ Ubicación marcada · Domicilio ${money(s.fee)} (${s.estimated ? '≈ ' : ''}${formatKm(s.km)} km desde ${s.hub})`;
    button.textContent = 'Cambiar ubicación'; button.className = 'btn btn--secondary';
  } else {
    card.classList.add('location-card--bad');
    $('locationText').textContent = `Esta ubicación queda fuera de nuestra zona de entrega (máximo ${config.shipping.maxKm} km). Cámbiala o escríbenos y vemos cómo ayudarte.`;
    button.textContent = 'Cambiar ubicación'; button.className = 'btn btn--secondary';
  }
  $('mapConfirm').disabled = !s?.covered;
}

/** Opens the map dialog. It needs the municipality and the address to search; otherwise it points at what is missing. */
async function openMapDialog() {
  const where = ['f-address', 'f-neighborhood', 'f-city'].map((id) => $(id).value.trim()).filter(Boolean).join(', ');
  const canSearch = !!($('f-address').value.trim() && $('f-city').value.trim());
  $('mapQuery').textContent = where || 'Aún no escribiste tu dirección. Toca el mapa y la completamos por ti.';
  placesBox.hidden = true;
  $('addressHint').hidden = true;
  $('mapDialog').showModal();
  await initMap();
  setTimeout(() => map?.invalidateSize(), 150);
  if (state.location) { if (map) map.setView([state.location.lat, state.location.lng], 16); }
  else if (canSearch) searchAddress();
  else setGeoStatus('Toca el mapa donde recibirás tu pedido, o usa tu ubicación actual.');
}
$('pinBtn').addEventListener('click', openMapDialog);
$('locationBtn').addEventListener('click', openMapDialog);
$('mapClose').addEventListener('click', () => $('mapDialog').close());
$('mapConfirm').addEventListener('click', () => { $('mapDialog').close(); $('locationCard').scrollIntoView({ block: 'center', behavior: 'smooth' }); });

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

/* Address search: finds the map point for the typed address, or offers nearby references. */
let searchId = 0;
const placesBox = $('places');

function showPlaces(title, results, { skipFirst = false } = {}) {
  const list = skipFirst ? results.slice(1) : results;
  $('placesTitle').textContent = title;
  $('placeList').replaceChildren(...list.map((r) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'places__item'; button.textContent = r.label || 'Punto en el mapa';
    button.addEventListener('click', () => {
      setLocation(r.lat, r.lng, { pan: true });
      $('placeList').querySelectorAll('.places__item').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    });
    li.append(button);
    return li;
  }));
  placesBox.hidden = !title;
}

async function searchAddress() {
  const address = $('f-address').value.trim();
  const neighborhood = $('f-neighborhood').value.trim();
  const city = $('f-city').value.trim();
  if (!address || !city) {
    setGeoStatus('Para buscar, escribe tu municipio y tu dirección en el formulario. O toca el mapa y la completamos por ti.', { error: true });
    return;
  }
  const id = ++searchId;
  const button = $('findBtn');
  button.disabled = true; button.textContent = 'Buscando…';
  placesBox.hidden = true;
  setGeoStatus('Buscando tu dirección…');
  try {
    const { level, results } = await findPlaces({ address, neighborhood, city });
    if (id !== searchId) return; // a newer search replaced this one
    if (level === 'none') {
      setGeoStatus('No encontramos esa dirección. Toca el mapa para marcarla o usa tu ubicación actual.', { error: true });
    } else if (level === 'multiple') {
      setGeoStatus('Esa calle existe en varios sectores. Elige el tuyo o toca el mapa.', { error: true });
      showPlaces('Encontramos esa calle en varios sectores. Elige el tuyo y arrastra el pin hasta tu puerta:', results);
    } else if (level === 'area') {
      if (map) map.setView([results[0].lat, results[0].lng], 14);
      setGeoStatus('No encontramos esa dirección exacta. Elige un punto de referencia cercano o toca el mapa.', { error: true });
      showPlaces('Puntos cercanos como referencia. Elige uno y arrastra el pin hasta tu puerta:', results);
    } else {
      await setLocation(results[0].lat, results[0].lng, { pan: true, reverse: false }); // it already matches what was typed
      const exact = level === 'address';
      showPlaces(exact
        ? 'Encontramos tu dirección. Revisa que el pin esté en tu puerta y arrástralo si hace falta.'
        : 'Encontramos la calle, pero no el número exacto. Arrastra el pin hasta tu puerta.',
      results, { skipFirst: true });
      if (results.length > 1) $('placesTitle').textContent += ' ¿Es otro lugar? Elige aquí:';
    }
  } catch {
    if (id === searchId) setGeoStatus('No pudimos buscar la dirección ahora. Toca el mapa para marcarla.', { error: true });
  } finally {
    if (id === searchId) { button.disabled = false; button.textContent = 'Buscar mi dirección'; }
  }
}
$('findBtn').addEventListener('click', searchAddress);

/* Visible validation: a red outline and a message next to each missing or wrong field. */
const FIELD_ERRORS = {
  consent: 'Debes autorizar el tratamiento de tus datos para continuar.',
  phone: 'Escribe un celular válido, por ejemplo 300 123 4567.',
  email: 'Escribe un correo válido o déjalo vacío.',
};
const fieldError = (control) => FIELD_ERRORS[control.id.replace(/^f-/, '')] ?? 'Este campo es obligatorio.';

function clearFieldError(control) {
  const holder = control.closest('.field, .consent');
  holder?.classList.remove('is-invalid');
  holder?.querySelector('.field-error')?.remove();
  control.removeAttribute('aria-invalid');
}

/** Marks one control as wrong, with a red outline and a message next to it. */
function markInvalid(control, text) {
  const holder = control.closest('.field, .consent');
  clearFieldError(control);
  holder.classList.add('is-invalid');
  control.setAttribute('aria-invalid', 'true');
  const message = document.createElement('p');
  message.className = 'field-error';
  message.id = `err-${control.id}`;
  message.setAttribute('role', 'alert');
  message.textContent = text;
  holder.append(message);
  control.setAttribute('aria-describedby', message.id);
}

/** Returns true when the form is valid; otherwise marks every problem and focuses the first one. */
function showFormErrors() {
  const invalid = [...form.elements].filter((c) => c.willValidate && !c.validity.valid);
  [...form.elements].forEach((c) => { if (c.willValidate && c.validity.valid) clearFieldError(c); });
  for (const control of invalid) markInvalid(control, fieldError(control));
  if (invalid.length) {
    invalid[0].focus();
    invalid[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return invalid.length === 0;
}
form.addEventListener('input', (e) => { if (e.target.validity?.valid) clearFieldError(e.target); });
form.addEventListener('change', (e) => { if (e.target.validity?.valid) clearFieldError(e.target); });

/* ---------------- step 3: payment ---------------- */
function renderPayment() {
  const fee = shippingFee();
  const total = subtotal() + fee;

  $('summaryLines').replaceChildren(
    ...cartLines().map((l) => keyValueRow(`${l.qty} × ${l.product.name}`, money(l.product.price * l.qty))),
    keyValueRow('Domicilio', money(fee)),
    ...(state.deliveryDate ? [keyValueRow('Entrega', formatLong(state.deliveryDate))] : []),
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
        address: f.address.trim(), neighborhood: f.neighborhood.trim(), city: f.city.trim(), notes: f.notes.trim(),
      },
      delivery: { km: state.shipping.km, lat: state.location.lat, lng: state.location.lng, date: state.deliveryDate },
      payment: { method: state.payment, proof: state.proof },
      consent: { accepted: $('consent').checked, version: POLICY_VERSION },
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
  if (order.token) { $('trackBtn').href = `track.html?t=${order.token}`; $('trackBtn').hidden = false; }
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
    if (!showFormErrors()) return;
    if (!state.location || !state.shipping?.covered) {
      const card = $('locationCard');
      card.classList.add('is-invalid');
      if (!state.location) $('locationText').textContent = 'Falta marcar en el mapa el punto donde recibirás tu pedido.';
      else if (!state.shipping) $('locationText').textContent = 'Estamos calculando tu domicilio, un momento…';
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('locationBtn').focus({ preventScroll: true });
      return;
    }
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
