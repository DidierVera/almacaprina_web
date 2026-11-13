// Settings: contact, shipping (origin point on a map + fee tiers) and payment methods.
import { loadLeaflet, OSM_TILES } from '../../leaflet-loader.js';
import { getSettings, saveSetting } from '../api.js';
import { guarded, h, switchInput, toast } from '../ui.js';

/** Editable list of rows (e.g. fee tiers, bank accounts). */
function rowsEditor({ rows, columns, addLabel, minRows = 0, blank }) {
  const data = rows.map((r) => ({ ...r }));
  const list = h('div', { class: 'rows' });
  const render = () => {
    list.replaceChildren(
      h('div', { class: 'rows__head' }, ...columns.map((c) => h('span', {}, c.label)), h('span')),
      ...data.map((row, i) => h('div', { class: 'rows__row' },
        ...columns.map((c) => h('input', {
          type: c.type ?? 'text', value: String(row[c.key] ?? ''), placeholder: c.placeholder, min: c.min, step: c.step,
          'aria-label': `${c.label} ${i + 1}`,
          onInput: (e) => { row[c.key] = c.type === 'number' ? e.target.valueAsNumber : e.target.value; },
        })),
        h('button', { class: 'btn btn--ghost', type: 'button', disabled: data.length <= minRows, onClick: () => { data.splice(i, 1); render(); } }, 'Quitar'))));
  };
  render();
  const element = h('div', {}, list,
    h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => { data.push({ ...blank }); render(); } }, addLabel));
  return { element, rows: () => data };
}

const field = (id, label, control, hint) => h('div', { class: 'field' },
  h('label', { htmlFor: id }, label, hint && h('span', { class: 'hint' }, ` ${hint}`)), control);

async function saveSection(button, key, build, successMessage) {
  button.disabled = true;
  const ok = await guarded(async () => saveSetting(key, await build()), 'No pudimos guardar. Revisa los datos e inténtalo de nuevo.');
  button.disabled = false;
  if (ok) toast(successMessage);
  return ok;
}

export async function mount(container) {
  const config = await getSettings();
  let map = null;
  container.append(h('div', { class: 'view-head' }, h('h1', {}, 'Ajustes')));

  /* ---------- contact ---------- */
  {
    const whatsapp = h('input', { id: 's-wa', value: config.business.whatsapp ?? '', inputMode: 'tel', placeholder: '573001234567' });
    const instagram = h('input', { id: 's-ig', value: config.business.instagram ?? '', placeholder: 'almacaprina.co' });
    const email = h('input', { id: 's-email', type: 'email', value: config.business.email ?? '', placeholder: 'correo@ejemplo.com' });
    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar contacto');
    container.append(h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      let digits = whatsapp.value.replace(/\D/g, '');
      if (digits.length === 10) digits = `57${digits}`;
      if (digits && (digits.length < 11 || digits.length > 15)) { toast('El WhatsApp debe tener el código de país, por ejemplo 573001234567.', { error: true }); return; }
      const ig = instagram.value.trim().replace(/^@/, '');
      if (await saveSection(save, 'business', () => ({ ...config.business, whatsapp: digits, instagram: ig, email: email.value.trim() }), 'Contacto guardado.')) {
        config.business = { ...config.business, whatsapp: digits, instagram: ig, email: email.value.trim() }; whatsapp.value = digits;
      }
    } },
    h('h2', {}, 'Contacto'),
    h('p', { class: 'hint' }, 'Aparece en la landing y en el botón de WhatsApp de la confirmación.'),
    h('div', { class: 'form-grid' }, field('s-wa', 'WhatsApp', whatsapp, '(con código de país)'), field('s-ig', 'Instagram', instagram, '(sin @)')),
    h('div', { class: 'form-grid' }, field('s-email', 'Correo de contacto', email, '(opcional, se muestra en la landing)')),
    h('div', { class: 'panel__actions' }, save)));
  }

  /* ---------- shipping ---------- */
  {
    const ship = config.shipping;
    const label = h('input', { id: 's-olabel', value: ship.origin.label ?? '' });
    const lat = h('input', { id: 's-lat', type: 'number', step: 'any', value: String(ship.origin.lat) });
    const lng = h('input', { id: 's-lng', type: 'number', step: 'any', value: String(ship.origin.lng) });
    const maxKm = h('input', { id: 's-max', type: 'number', min: '1', step: '1', value: String(ship.maxKm) });
    const tiers = rowsEditor({
      rows: ship.tiers, minRows: 1, blank: { upToKm: '', fee: '' }, addLabel: 'Agregar tramo',
      columns: [{ key: 'upToKm', label: 'Hasta (km)', type: 'number', min: '0', step: '0.5' }, { key: 'fee', label: 'Domicilio (COP)', type: 'number', min: '0', step: '500' }],
    });
    const mapEl = h('div', { class: 'admin-map', role: 'application', 'aria-label': 'Mapa para fijar el punto de partida' });

    const syncMarker = (() => {
      let marker = null;
      return (la, lo, pan = false) => {
        if (!map || !Number.isFinite(la) || !Number.isFinite(lo)) return;
        if (marker) marker.setLatLng([la, lo]);
        else {
          marker = window.L.marker([la, lo], { draggable: true }).addTo(map);
          marker.on('dragend', () => { const p = marker.getLatLng(); lat.value = p.lat.toFixed(6); lng.value = p.lng.toFixed(6); });
        }
        if (pan) map.setView([la, lo], map.getZoom());
      };
    })();
    [lat, lng].forEach((input) => input.addEventListener('change', () => syncMarker(lat.valueAsNumber, lng.valueAsNumber, true)));

    loadLeaflet().then((L) => {
      map = L.map(mapEl, { scrollWheelZoom: false }).setView([ship.origin.lat, ship.origin.lng], 12);
      L.tileLayer(OSM_TILES.url, OSM_TILES.options).addTo(map);
      map.on('click', (e) => { lat.value = e.latlng.lat.toFixed(6); lng.value = e.latlng.lng.toFixed(6); syncMarker(e.latlng.lat, e.latlng.lng); });
      syncMarker(ship.origin.lat, ship.origin.lng);
    }).catch(() => { mapEl.textContent = 'No pudimos cargar el mapa. Puedes escribir las coordenadas a mano.'; });

    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar domicilio');
    container.append(h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      const rows = tiers.rows().map((r) => ({ upToKm: r.upToKm, fee: r.fee })).sort((a, b) => a.upToKm - b.upToKm);
      const valid = rows.every((r) => Number.isFinite(r.upToKm) && r.upToKm > 0 && Number.isInteger(r.fee) && r.fee >= 0)
        && new Set(rows.map((r) => r.upToKm)).size === rows.length;
      if (!valid) { toast('Revisa los tramos: cada distancia debe ser mayor que 0 y no repetirse, y el valor debe ser un número entero.', { error: true }); return; }
      if (!Number.isFinite(lat.valueAsNumber) || !Number.isFinite(lng.valueAsNumber) || !(maxKm.valueAsNumber >= 1)) { toast('Revisa el punto de partida y la distancia máxima.', { error: true }); return; }
      await saveSection(save, 'shipping', () => ({
        ...ship,
        origin: { lat: lat.valueAsNumber, lng: lng.valueAsNumber, label: label.value.trim() },
        maxKm: maxKm.valueAsNumber,
        tiers: rows,
      }), 'Domicilio guardado.');
    } },
    h('h2', {}, 'Domicilio'),
    h('p', { class: 'hint' }, 'El valor se calcula con los kilómetros de ruta desde tu punto de partida hasta la ubicación del cliente. Toca el mapa o arrastra el pin para cambiarlo.'),
    mapEl,
    h('div', { class: 'form-grid' }, field('s-olabel', 'Nombre del punto', label), field('s-lat', 'Latitud', lat), field('s-lng', 'Longitud', lng)),
    h('h3', { style: 'font-family:var(--font-body);font-size:1rem;margin-top:8px' }, 'Tarifas por distancia'),
    tiers.element,
    h('div', { class: 'form-grid', style: 'margin-top:8px' }, field('s-max', 'Distancia máxima de entrega (km)', maxKm, '(más lejos no se puede pedir)')),
    h('div', { class: 'panel__actions' }, save)));
  }

  /* ---------- payments ---------- */
  {
    const pay = config.payments;
    let transferOn = !!pay.transfer?.enabled;
    let codOn = !!pay.cashOnDelivery?.enabled;
    const holder = h('input', { id: 's-holder', value: pay.transfer?.holder ?? '' });
    const accounts = rowsEditor({
      rows: pay.transfer?.accounts ?? [], blank: { label: '', value: '' }, addLabel: 'Agregar cuenta',
      columns: [{ key: 'label', label: 'Banco o app', placeholder: 'Nequi' }, { key: 'value', label: 'Número', placeholder: '300 000 0000' }],
    });
    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar pagos');
    container.append(h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      const rows = accounts.rows().map((r) => ({ label: String(r.label).trim(), value: String(r.value).trim() })).filter((r) => r.label || r.value);
      if (transferOn && (!rows.length || rows.some((r) => !r.label || !r.value))) { toast('Para recibir transferencias agrega al menos una cuenta completa (banco y número).', { error: true }); return; }
      if (!transferOn && !codOn) { toast('Deja activo al menos un método de pago; si no, nadie podrá pedir.', { error: true }); return; }
      await saveSection(save, 'payments', () => ({
        ...pay,
        transfer: { ...pay.transfer, enabled: transferOn, holder: holder.value.trim(), accounts: rows },
        cashOnDelivery: { ...pay.cashOnDelivery, enabled: codOn },
      }), 'Pagos guardados.');
    } },
    h('h2', {}, 'Métodos de pago'),
    h('div', { class: 'field--inline' }, switchInput({ checked: transferOn, label: 'Transferencia', onChange: (v) => { transferOn = v; } }), h('span', {}, 'Transferencia con comprobante')),
    h('div', { class: 'form-grid' }, field('s-holder', 'Titular de las cuentas', holder)),
    accounts.element,
    h('div', { class: 'field--inline', style: 'margin-top:12px' }, switchInput({ checked: codOn, label: 'Contraentrega', onChange: (v) => { codOn = v; } }), h('span', {}, 'Contraentrega (efectivo o transferencia al recibir)')),
    h('p', { class: 'hint' }, 'Pago en línea (Wompi): disponible en una versión futura.'),
    h('div', { class: 'panel__actions' }, save)));
  }

  return () => { map?.remove(); map = null; };
}
