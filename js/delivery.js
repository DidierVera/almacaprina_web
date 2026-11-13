// Lógica pura de fechas de entrega (sin DOM, sin red). Se reutiliza en el servidor más adelante.
import { addDays, bogotaNow, mondayOf, weekday } from './format.js';

/** Días de la semana (0-6) con entrega en la semana que empieza en `monday`. */
export function daysForWeek(monday, schedule) {
  return schedule.weeks?.[monday] ?? schedule.defaultDays;
}

export function isDeliveryDate(iso, schedule) {
  if (schedule.blocked?.includes(iso)) return false;
  if (schedule.extra?.includes(iso)) return true;
  return daysForWeek(mondayOf(iso), schedule).includes(weekday(iso));
}

/**
 * Primer día de entrega ESTRICTAMENTE posterior al día del pedido
 * (nunca el mismo día). Si hay hora de corte y ya pasó, el pedido cuenta como del día siguiente.
 */
export function nextDeliveryDate(schedule, now = new Date()) {
  const { iso, hour } = bogotaNow(now);
  const start = schedule.cutoffHour != null && hour >= schedule.cutoffHour ? addDays(iso, 1) : iso;
  for (let i = 1; i <= 60; i++) {
    const candidate = addDays(start, i);
    if (isDeliveryDate(candidate, schedule)) return candidate;
  }
  return null;
}

/** Próximas `count` fechas de entrega (para mostrar "¿Cuándo llega?"). */
export function upcomingDeliveryDates(schedule, count = 3, now = new Date()) {
  const dates = [];
  let cursor = bogotaNow(now).iso;
  for (let i = 0; i < 90 && dates.length < count; i++) {
    cursor = addDays(cursor, 1);
    if (isDeliveryDate(cursor, schedule)) dates.push(cursor);
  }
  return dates;
}
