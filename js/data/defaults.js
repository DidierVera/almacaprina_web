// Front-end constants and fallback defaults. Real data (products, prices, calendar, fees, accounts)
// lives in Supabase and is edited from the admin panel; DEFAULT_CONFIG only fills a setting that is missing.

export const CATEGORIES = [
  { id: 'all', label: 'Todo' },
  { id: 'cheese', label: 'Quesos' },
  { id: 'dairy', label: 'Lácteos' },
  { id: 'care', label: 'Cuidado' },
];

export const DEFAULT_CONFIG = {
  business: { name: 'Alma Caprina', whatsapp: '', instagram: 'almacaprina.co' },

  // Delivery days. 0 = Sunday … 6 = Saturday.
  // `weeks` is keyed by the MONDAY of each week ("2026-11-09": [1, 4]) and overrides `defaultDays`.
  // `blocked` = dates with no delivery (holidays); `extra` = special delivery dates.
  // `cutoffHour` = hour (0-23, Bogotá) from which an order counts as next day's; null = midnight.
  schedule: { defaultDays: [2, 4, 6], weeks: {}, blocked: [], extra: [], cutoffHour: null },

  shipping: {
    origin: { lat: 6.0911, lng: -75.6358, label: 'Caldas (Variante)' },
    maxKm: 40,
    roadFactor: 1.35, // only used when the routing service fails (straight-line distance × factor)
    tiers: [
      { upToKm: 5, fee: 5000 },
      { upToKm: 10, fee: 8000 },
      { upToKm: 20, fee: 12000 },
      { upToKm: 40, fee: 18000 },
    ],
  },

  payments: {
    transfer: { enabled: false, holder: '', accounts: [] },
    online: { enabled: false },
    cashOnDelivery: { enabled: false },
  },
};
