// Pure delivery-date logic (no DOM, no network). Mirrored by next_delivery_date() in supabase/schema.sql.
import { addDays, bogotaNow, mondayOf, weekday } from './format.js';

/** Weekdays (0-6) with delivery in the week starting on `monday`. */
export function daysForWeek(monday, schedule) {
  return schedule.weeks?.[monday] ?? schedule.defaultDays;
}

export function isDeliveryDate(iso, schedule) {
  if (schedule.blocked?.includes(iso)) return false;
  if (schedule.extra?.includes(iso)) return true;
  return daysForWeek(mondayOf(iso), schedule).includes(weekday(iso));
}

/**
 * First delivery date STRICTLY after the order day (never the same day).
 * If a cutoff hour is set and has passed, the order counts as next day's.
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

/** Next `count` delivery dates (for the "when does it arrive?" section). */
export function upcomingDeliveryDates(schedule, count = 3, now = new Date()) {
  const dates = [];
  let cursor = bogotaNow(now).iso;
  for (let i = 0; i < 90 && dates.length < count; i++) {
    cursor = addDays(cursor, 1);
    if (isDeliveryDate(cursor, schedule)) dates.push(cursor);
  }
  return dates;
}
