// Delivery calendar: default weekdays, per-week overrides, blocked dates (holidays) and extra dates.
import { upcomingDeliveryDates } from '../../delivery.js';
import { addDays, bogotaNow, formatLong, formatShort, mondayOf } from '../../format.js';
import { getSettings, saveSetting } from '../api.js';
import { WEEKDAYS } from '../labels.js';
import { guarded, h, toast } from '../ui.js';

const WEEKS_AHEAD = 8;
const EMPTY_SCHEDULE = { defaultDays: [2, 4, 6], weeks: {}, blocked: [], extra: [], cutoffHour: null };

const sortDays = (days) => [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
const sameDays = (a, b) => sortDays(a).join() === sortDays(b).join();
const dayMonth = (iso) => formatShort(iso).split(' ').slice(1).join(' '); // "Sábado 14 nov" → "14 nov"
const dateOf = (monday, day) => addDays(monday, (day + 6) % 7);

export async function mount(container) {
  const today = bogotaNow().iso;
  const tomorrow = addDays(today, 1);
  const thisMonday = mondayOf(today);

  let saved = { ...EMPTY_SCHEDULE, ...(await getSettings()).schedule };
  let schedule = structuredClone(saved);
  let dirty = false;
  let focusKey = null;

  /* ---------- containers ---------- */
  const defaultsEl = h('section', { class: 'panel' });
  const weeksEl = h('section', { class: 'panel' });
  const datesEl = h('section', { class: 'panel' });
  const previewEl = h('section', { class: 'panel' });
  const barEl = h('div', { class: 'unsaved', hidden: true });
  container.append(
    h('div', { class: 'view-head' }, h('h1', {}, 'Entregas')),
    h('p', { class: 'hint', style: 'margin:-12px 0 20px;max-width:70ch' },
      'Define qué días entregas. Un pedido siempre sale en el primer día de entrega posterior al día en que se hace. Los pedidos que ya existen conservan su fecha.'),
    defaultsEl, weeksEl, datesEl, previewEl, barEl);

  const markDirty = () => { dirty = true; renderPreview(); renderBar(); };

  const weekdayButton = (day, label, pressed, key, onToggle, disabled = false) => h('button', {
    class: 'weekday', type: 'button', 'aria-pressed': String(pressed), disabled, dataset: { key }, onClick: () => { focusKey = key; onToggle(); },
  }, label);

  function restoreFocus() {
    if (!focusKey) return;
    container.querySelector(`[data-key="${focusKey}"]`)?.focus();
    focusKey = null;
  }

  /* ---------- default weekdays + cutoff ---------- */
  function renderDefaults() {
    const cutoff = h('select', { id: 'cutoff', value: schedule.cutoffHour == null ? '' : String(schedule.cutoffHour), onChange: (e) => {
      schedule.cutoffHour = e.target.value === '' ? null : Number(e.target.value); markDirty();
    } }, h('option', { value: '' }, 'Sin hora de corte (cuenta todo el día)'),
    ...Array.from({ length: 24 }, (_, hour) => h('option', { value: String(hour) }, `Desde las ${String(hour).padStart(2, '0')}:00 cuenta como del día siguiente`)));

    defaultsEl.replaceChildren(
      h('h2', {}, 'Días de entrega habituales'),
      h('p', { class: 'hint' }, 'Se aplican a todas las semanas que no personalices abajo.'),
      h('div', { class: 'chips' }, WEEKDAYS.map(({ day, label }) => weekdayButton(day, label, schedule.defaultDays.includes(day), `d:${day}`, () => {
        const set = new Set(schedule.defaultDays);
        if (set.has(day)) set.delete(day); else set.add(day);
        schedule.defaultDays = sortDays(set);
        markDirty(); renderDefaults(); renderWeeks();
      }))),
      h('div', { class: 'field', style: 'margin-top:16px;max-width:460px' }, h('label', { htmlFor: 'cutoff' }, 'Hora de corte (hora de Bogotá)'), cutoff));
    restoreFocus();
  }

  /* ---------- per-week overrides ---------- */
  function renderWeeks() {
    const rows = Array.from({ length: WEEKS_AHEAD }, (_, i) => {
      const monday = addDays(thisMonday, 7 * i);
      const override = schedule.weeks[monday];
      const days = override ?? schedule.defaultDays;
      return h('div', { class: 'week' },
        h('div', { class: 'week__label' }, `${dayMonth(monday)} – ${dayMonth(addDays(monday, 6))}`,
          h('small', {}, i === 0 ? 'Esta semana' : i === 1 ? 'Próxima semana' : ' ')),
        h('div', { class: 'chips' }, WEEKDAYS.map(({ day, label }) => {
          const date = dateOf(monday, day);
          return weekdayButton(day, label, days.includes(day), `w:${monday}:${day}`, () => {
            const set = new Set(days);
            if (set.has(day)) set.delete(day); else set.add(day);
            const next = sortDays(set);
            if (sameDays(next, schedule.defaultDays)) delete schedule.weeks[monday]; else schedule.weeks[monday] = next;
            markDirty(); renderWeeks();
          }, date <= today); // a delivery must be after today
        })),
        override && h('span', { class: 'tag' }, 'Personalizada'),
        override && h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => { delete schedule.weeks[monday]; markDirty(); renderWeeks(); } }, 'Restablecer'));
    });
    weeksEl.replaceChildren(
      h('h2', {}, 'Semana por semana'),
      h('p', { class: 'hint' }, 'Toca los días para cambiar solo esa semana (por ejemplo, una semana con festivo).'),
      ...rows);
    restoreFocus();
  }

  /* ---------- blocked / extra dates ---------- */
  function dateEditor(key, title, hint, addLabel) {
    const list = schedule[key].filter((d) => d >= today).sort();
    const input = h('input', { type: 'date', min: tomorrow, 'aria-label': title });
    return h('div', { style: 'margin-bottom:20px' },
      h('h3', { style: 'font-family:var(--font-body);font-size:1rem' }, title),
      h('p', { class: 'hint' }, hint),
      list.length ? h('ul', { class: 'date-list' }, list.map((d) => h('li', { class: 'date-pill' }, formatLong(d),
        h('button', { type: 'button', 'aria-label': `Quitar ${formatLong(d)}`, onClick: () => { schedule[key] = schedule[key].filter((x) => x !== d); markDirty(); renderDates(); } }, '×'))))
        : h('p', { class: 'hint' }, 'Ninguna por ahora.'),
      h('div', { class: 'toolbar', style: 'margin:0' }, input,
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => {
          if (!input.value || input.value < tomorrow) { toast('Elige una fecha futura.', { error: true }); return; }
          if (!schedule[key].includes(input.value)) schedule[key] = [...schedule[key], input.value];
          markDirty(); renderDates();
        } }, addLabel)));
  }
  function renderDates() {
    datesEl.replaceChildren(
      h('h2', {}, 'Fechas especiales'),
      dateEditor('blocked', 'Sin entregas (festivos, eventos)', 'Aunque sea un día de entrega, ese día no se entrega.', 'Bloquear fecha'),
      dateEditor('extra', 'Entregas extra', 'Un día adicional que normalmente no entregas.', 'Agregar fecha'));
  }

  /* ---------- preview + save bar ---------- */
  function renderPreview() {
    const dates = upcomingDeliveryDates(schedule, 6);
    previewEl.replaceChildren(
      h('h2', {}, 'Así lo verán tus clientes'),
      h('p', { class: 'hint' }, 'Próximas fechas de entrega con la configuración actual:'),
      dates.length
        ? h('ol', { class: 'preview' }, dates.map((d) => h('li', {}, formatLong(d))))
        : h('p', { class: 'notice notice--error' }, 'No hay ninguna fecha de entrega: nadie podrá hacer pedidos hasta que elijas al menos un día.'));
  }

  function renderBar() {
    barEl.hidden = !dirty;
    if (!dirty) return;
    barEl.replaceChildren(
      h('p', {}, 'Tienes cambios sin guardar.'),
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => { schedule = structuredClone(saved); dirty = false; renderAll(); } }, 'Descartar'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: save }, 'Guardar cambios'));
  }

  async function save() {
    if (!upcomingDeliveryDates(schedule, 1).length && !confirm('Con esta configuración no hay fechas de entrega y nadie podrá hacer pedidos. ¿Guardar de todos modos?')) return;
    const cleaned = {
      ...schedule,
      weeks: Object.fromEntries(Object.entries(schedule.weeks).filter(([monday]) => monday >= thisMonday)),
      blocked: schedule.blocked.filter((d) => d >= today).sort(),
      extra: schedule.extra.filter((d) => d >= today).sort(),
    };
    const ok = await guarded(() => saveSetting('schedule', cleaned), 'No pudimos guardar el calendario. Inténtalo de nuevo.');
    if (!ok) return;
    saved = structuredClone(cleaned); schedule = structuredClone(cleaned); dirty = false;
    renderAll();
    toast('Calendario de entregas guardado.');
  }

  function renderAll() { renderDefaults(); renderWeeks(); renderDates(); renderPreview(); renderBar(); }

  const warnUnsaved = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', warnUnsaved);

  renderAll();
  return () => window.removeEventListener('beforeunload', warnUnsaved);
}
