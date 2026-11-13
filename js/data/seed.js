// Datos iniciales (v1 sin servidor). TODO: reemplazar por la lista real de productos,
// precios, cuentas y punto de partida. Todo lo marcado "EJEMPLO" es inventado.

export const SEED_PRODUCTS = [
  { id: 'queso-fresco', name: 'Queso de cabra fresco', detail: '250 g · artesanal', price: 18000, category: 'quesos', image: null, active: true, featured: true },       // EJEMPLO
  { id: 'queso-madurado', name: 'Queso de cabra madurado', detail: '250 g · 60 días', price: 24000, category: 'quesos', image: null, active: true, featured: false }, // EJEMPLO
  { id: 'leche', name: 'Leche de cabra', detail: '1 litro · pasteurizada', price: 9000, category: 'lacteos', image: null, active: true, featured: false },              // EJEMPLO
  { id: 'yogur-griego', name: 'Yogur griego de cabra', detail: '500 g · sin azúcar', price: 12000, category: 'lacteos', image: null, active: true, featured: true },     // producto real (Instagram); precio EJEMPLO
  { id: 'arequipe', name: 'Arequipe de cabra', detail: '250 g · tradicional', price: 14000, category: 'lacteos', image: null, active: true, featured: false },            // EJEMPLO
  { id: 'jabon', name: 'Jabón de leche de cabra', detail: '120 g · avena y miel', price: 10000, category: 'cuidado', image: null, active: true, featured: false },       // EJEMPLO
];

export const CATEGORIES = [
  { id: 'todo', label: 'Todo' },
  { id: 'quesos', label: 'Quesos' },
  { id: 'lacteos', label: 'Lácteos' },
  { id: 'cuidado', label: 'Cuidado' },
];

export const SEED_CONFIG = {
  business: { name: 'Alma Caprina', whatsapp: '', instagram: 'almacaprina.co' },

  // Días de entrega. 0=domingo … 6=sábado.
  // `weeks` se indexa por el LUNES de cada semana ("2026-11-09": [1, 4]) y manda sobre `defaultDays`.
  // `blocked` = fechas sin entrega (festivos); `extra` = fechas de entrega especiales.
  // `cutoffHour` = hora (0-23, Bogotá) desde la cual el pedido cuenta como del día siguiente; null = medianoche.
  schedule: { defaultDays: [2, 4, 6], weeks: {}, blocked: [], extra: [], cutoffHour: null },

  // Domicilio por kilómetros de ruta desde el punto de partida. EJEMPLO: ajustar punto y tarifas.
  shipping: {
    origin: { lat: 6.0911, lng: -75.6358, label: 'Caldas (Variante)' },
    maxKm: 40,
    roadFactor: 1.35, // solo se usa si el servicio de rutas no responde (distancia recta × factor)
    tiers: [
      { upToKm: 5, fee: 5000 },
      { upToKm: 10, fee: 8000 },
      { upToKm: 20, fee: 12000 },
      { upToKm: 40, fee: 18000 },
    ],
  },

  payments: {
    transfer: {
      enabled: true,
      holder: 'Alma Caprina', // EJEMPLO
      accounts: [
        { label: 'Nequi', value: '300 000 0000' },                  // EJEMPLO
        { label: 'Bancolombia ahorros', value: '000-000000-00' },    // EJEMPLO
      ],
    },
    online: { enabled: false }, // Wompi: versión futura
    cod: { enabled: true },
  },
};
