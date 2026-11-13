// Cart persisted in localStorage and shared between the landing page and the order flow.
const STORAGE_KEY = 'ac:cart';
const MAX_QTY = 20;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return Object.fromEntries(Object.entries(raw).filter(([, q]) => Number.isInteger(q) && q > 0));
  } catch {
    return {};
  }
}

let items = load();
const listeners = new Set();

function commit() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* no storage: stays in memory */ }
  listeners.forEach((fn) => fn(items));
}

export const cart = {
  qty: (id) => items[id] ?? 0,
  set(id, q) {
    const n = Math.max(0, Math.min(MAX_QTY, q | 0));
    if (n === 0) delete items[id]; else items[id] = n;
    commit();
  },
  inc(id) { this.set(id, this.qty(id) + 1); },
  dec(id) { this.set(id, this.qty(id) - 1); },
  clear() { items = {}; commit(); },
  entries: () => Object.entries(items),
  units: () => Object.values(items).reduce((a, b) => a + b, 0),
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  MAX_QTY,
};

// Keep several open tabs in sync.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) { items = load(); listeners.forEach((fn) => fn(items)); }
});
