// Money and date formatting. Dates travel as "YYYY-MM-DD" strings (Bogotá time)
// to avoid time-zone bugs. Day/month names are customer-facing Spanish copy.

export const TZ = 'America/Bogota';

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const copFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = (n) => copFormatter.format(n).replace(/\s/g, '');

export const formatKm = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const toUtcDate = (iso) => new Date(`${iso}T00:00:00Z`);

export const weekday = (iso) => toUtcDate(iso).getUTCDay();
export const dayName = (iso) => DAY_NAMES[weekday(iso)];

export function addDays(iso, n) {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week (Monday–Sunday) that `iso` belongs to. */
export function mondayOf(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

/** Current date and hour in Bogotá. */
export function bogotaNow(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

/** "Sábado 14 de noviembre" */
export function formatLong(iso) {
  const d = toUtcDate(iso);
  return `${capitalize(DAY_NAMES[d.getUTCDay()])} ${d.getUTCDate()} de ${MONTH_NAMES[d.getUTCMonth()]}`;
}

/** "Sábado 14 nov" */
export function formatShort(iso) {
  const d = toUtcDate(iso);
  return `${capitalize(DAY_NAMES[d.getUTCDay()])} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
}
