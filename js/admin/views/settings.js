// Settings: contact, shipping (starting points on a map + fee tiers) and payment methods.
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
    const phone = h('input', { id: 's-phone', type: 'tel', value: config.business.phone ?? '', placeholder: '312 825 6069' });
    const email = h('input', { id: 's-email', type: 'email', value: config.business.email ?? '', placeholder: 'correo@ejemplo.com' });
    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar contacto');
    container.append(h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      let digits = whatsapp.value.replace(/\D/g, '');
      if (digits.length === 10) digits = `57${digits}`;
      if (digits && (digits.length < 11 || digits.length > 15)) { toast('El WhatsApp debe tener el código de país, por ejemplo 573001234567.', { error: true }); return; }
      const ig = instagram.value.trim().replace(/^@/, '');
      if (await saveSection(save, 'business', () => ({ ...config.business, whatsapp: digits, instagram: ig, email: email.value.trim(), phone: phone.value.trim() }), 'Contacto guardado.')) {
        config.business = { ...config.business, whatsapp: digits, instagram: ig, email: email.value.trim(), phone: phone.value.trim() }; whatsapp.value = digits;
      }
    } },
    h('h2', {}, 'Contacto'),
    h('p', { class: 'hint' }, 'Aparece en la landing y en el botón de WhatsApp de la confirmación.'),
    h('div', { class: 'form-grid' }, field('s-wa', 'WhatsApp', whatsapp, '(con código de país)'), field('s-ig', 'Instagram', instagram, '(sin @)')),
    h('div', { class: 'form-grid' }, field('s-phone', 'Teléfono para llamadas', phone, '(opcional)'), field('s-email', 'Correo de contacto', email, '(opcional)')),
    h('div', { class: 'panel__actions' }, save)));
  }

  /* ---------- shipping ---------- */
  {
    const ship = config.shipping;
    // Older settings only have `origin`: it becomes the first starting point.
    const hubs = (ship.hubs?.length ? ship.hubs : [ship.origin]).map((x) => ({ label: x.label ?? '', lat: Number(x.lat), lng: Number(x.lng), surcharge: Number(x.surcharge) || 0 }));
    const maxKm = h('input', { id: 's-max', type: 'number', min: '1', step: '1', value: String(ship.maxKm) });
    const tiers = rowsEditor({
      rows: ship.tiers, minRows: 1, blank: { upToKm: '', fee: '' }, addLabel: 'Agregar tramo',
      columns: [{ key: 'upToKm', label: 'Hasta (km)', type: 'number', min: '0', step: '0.5' }, { key: 'fee', label: 'Domicilio (COP)', type: 'number', min: '0', step: '500' }],
    });
    const mapEl = h('div', { class: 'admin-map', role: 'application', 'aria-label': 'Mapa de los puntos de partida' });
    const hubList = h('div', { class: 'hubs' });
    const markers = new Map(); // hub object -> Leaflet marker

    function syncMarkers() {
      if (!map) return;
      for (const [hub, marker] of markers) if (!hubs.includes(hub)) { marker.remove(); markers.delete(hub); }
      hubs.forEach((hub, i) => {
        if (!Number.isFinite(hub.lat) || !Number.isFinite(hub.lng)) return;
        let marker = markers.get(hub);
        if (!marker) {
          marker = window.L.marker([hub.lat, hub.lng], { draggable: true });
          marker.on('dragend', () => { const p = marker.getLatLng(); hub.lat = Number(p.lat.toFixed(6)); hub.lng = Number(p.lng.toFixed(6)); renderHubs(); });
          marker.addTo(map);
          markers.set(hub, marker);
        } else marker.setLatLng([hub.lat, hub.lng]);
        marker.bindTooltip(`${i + 1}. ${hub.label || 'Sin nombre'}`);
      });
    }

    function renderHubs() {
      hubList.replaceChildren(...hubs.map((hub, i) => {
        const num = (key, label, extra = {}) => h('div', { class: 'field' }, h('label', {}, label),
          h('input', { type: 'number', step: 'any', value: Number.isFinite(hub[key]) ? String(hub[key]) : '', 'aria-label': `${label} del punto ${i + 1}`, ...extra,
            onChange: (e) => { hub[key] = e.target.valueAsNumber; syncMarkers(); if (key !== 'surcharge' && map) map.panTo([hub.lat, hub.lng]); } }));
        return h('fieldset', { class: 'hub-row' },
          h('legend', {}, `Punto ${i + 1}`),
          h('div', { class: 'form-grid' },
            h('div', { class: 'field' }, h('label', {}, 'Nombre'),
              h('input', { value: hub.label, placeholder: 'Caldas', maxLength: 80, 'aria-label': `Nombre del punto ${i + 1}`, onInput: (e) => { hub.label = e.target.value; syncMarkers(); } })),
            num('lat', 'Latitud'), num('lng', 'Longitud'),
            num('surcharge', 'Recargo (COP)', { step: '500', min: '0' })),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', disabled: hubs.length <= 1, onClick: () => { hubs.splice(i, 1); renderHubs(); syncMarkers(); } }, 'Quitar este punto'));
      }));
    }
    renderHubs();

    loadLeaflet().then((L) => {
      map = L.map(mapEl, { scrollWheelZoom: false }).setView([hubs[0].lat, hubs[0].lng], 10);
      L.tileLayer(OSM_TILES.url, OSM_TILES.options).addTo(map);
      syncMarkers();
      const points = hubs.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)).map((x) => [x.lat, x.lng]);
      if (points.length > 1) map.fitBounds(points, { padding: [40, 40] });
    }).catch(() => { mapEl.textContent = 'No pudimos cargar el mapa. Puedes escribir las coordenadas a mano.'; });

    const addHub = h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
      const c = map?.getCenter();
      hubs.push({ label: '', lat: c ? Number(c.lat.toFixed(6)) : NaN, lng: c ? Number(c.lng.toFixed(6)) : NaN, surcharge: 0 });
      renderHubs(); syncMarkers();
    } }, 'Agregar punto de partida');

    const save = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar domicilio');
    container.append(h('form', { class: 'panel', onSubmit: async (e) => {
      e.preventDefault();
      const rows = tiers.rows().map((r) => ({ upToKm: r.upToKm, fee: r.fee })).sort((a, b) => a.upToKm - b.upToKm);
      const valid = rows.every((r) => Number.isFinite(r.upToKm) && r.upToKm > 0 && Number.isInteger(r.fee) && r.fee >= 0)
        && new Set(rows.map((r) => r.upToKm)).size === rows.length;
      if (!valid) { toast('Revisa los tramos: cada distancia debe ser mayor que 0 y no repetirse, y el valor debe ser un número entero.', { error: true }); return; }
      const names = hubs.map((x) => x.label.trim());
      if (hubs.some((x, i) => !names[i] || !Number.isFinite(x.lat) || !Number.isFinite(x.lng) || !Number.isInteger(x.surcharge) || x.surcharge < 0)
        || new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
        toast('Revisa los puntos de partida: cada uno necesita un nombre distinto, su ubicación y un recargo entero (0 si no aplica).', { error: true }); return;
      }
      if (!(maxKm.valueAsNumber >= 1)) { toast('Revisa la distancia máxima.', { error: true }); return; }
      const clean = hubs.map((x, i) => ({ label: names[i], lat: x.lat, lng: x.lng, surcharge: x.surcharge }));
      await saveSection(save, 'shipping', () => ({
        ...ship,
        hubs: clean,
        origin: { lat: clean[0].lat, lng: clean[0].lng, label: clean[0].label }, // kept equal to the first point for older code
        maxKm: maxKm.valueAsNumber,
        tiers: rows,
      }), 'Domicilio guardado.');
    } },
    h('h2', {}, 'Domicilio'),
    h('p', { class: 'hint' }, 'El valor se calcula con los kilómetros de ruta desde el punto de partida más cercano a la ubicación del cliente; el cliente no elige. Arrastra cada pin en el mapa para ajustarlo.'),
    mapEl,
    hubList,
    addHub,
    h('h3', { style: 'font-family:var(--font-body);font-size:1rem;margin-top:12px' }, 'Tarifas por distancia'),
    h('p', { class: 'hint' }, 'Las mismas para todos los puntos. El recargo de cada punto se suma a la tarifa.'),
    tiers.element,
    h('div', { class: 'form-grid', style: 'margin-top:8px' }, field('s-max', 'Distancia máxima de entrega (km)', maxKm, '(medida desde el punto más cercano)')),
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
