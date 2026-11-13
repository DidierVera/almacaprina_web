// Formato de dinero y fechas. Las fechas viajan como "YYYY-MM-DD" (hora de Bogotá)
// para evitar errores de zona horaria.

export const TZ = 'America/Bogota';

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const cop = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
export const money = (n) => cop.format(n).replace(/\s/g, '');

export const km1 = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const utc = (iso) => new Date(`${iso}T00:00:00Z`);

export const weekday = (iso) => utc(iso).getUTCDay();
export const dayName = (iso) => DAYS[weekday(iso)];

export function addDays(iso, n) {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Lunes de la semana (lunes–domingo) a la que pertenece `iso`. */
export function mondayOf(iso) {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

/** Fecha y hora actuales en Bogotá. */
export function bogotaNow(now = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((x) => [x.type, x.value]),
  );
  return { iso: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

/** "Sábado 14 de noviembre" */
export function formatLong(iso) {
  const d = utc(iso);
  return `${cap(DAYS[d.getUTCDay()])} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sábado 14 nov" */
export function formatShort(iso) {
  const d = utc(iso);
  return `${cap(DAYS[d.getUTCDay()])} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}
