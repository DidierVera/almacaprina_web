// Capa de datos. v1: localStorage (sin servidor). Todas las funciones son async y devuelven
// datos simples para poder cambiar a Supabase sin tocar la interfaz:
// bastará con reimplementar este archivo.
import { SEED_CONFIG, SEED_PRODUCTS } from './data/seed.js';
import { nextDeliveryDate } from './delivery.js';
import { feeForKm } from './shipping.js';

const K = { products: 'ac:products', config: 'ac:config', orders: 'ac:orders', seq: 'ac:orderSeq' };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export async function getProducts() {
  return read(K.products, SEED_PRODUCTS).filter((p) => p.active !== false);
}

export async function getConfig() {
  return { ...SEED_CONFIG, ...read(K.config, {}) };
}

/** "Lo más pedido": unidades vendidas en los últimos 90 días; si no hay historia, los destacados. */
export async function getTopProducts(limit = 4) {
  const products = await getProducts();
  const since = Date.now() - 90 * 24 * 3600 * 1000;
  const sold = new Map();
  for (const o of read(K.orders, [])) {
    if (Date.parse(o.createdAt) < since) continue;
    for (const it of o.items) sold.set(it.id, (sold.get(it.id) ?? 0) + it.qty);
  }
  const ranked = products
    .filter((p) => sold.has(p.id))
    .sort((a, b) => sold.get(b.id) - sold.get(a.id));
  const rest = products.filter((p) => !sold.has(p.id)).sort((a, b) => Number(b.featured) - Number(a.featured));
  return [...ranked, ...rest].slice(0, limit);
}

/**
 * Crea el pedido. Aquí (y luego en el servidor) se recalculan precios, domicilio y fecha de entrega:
 * nunca se confía en los valores que manda el navegador.
 */
export async function createOrder(input) {
  const [products, config] = await Promise.all([getProducts(), getConfig()]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const items = input.items.map(({ id, qty }) => {
    const p = byId.get(id);
    if (!p) throw new Error('Un producto de tu pedido ya no está disponible.');
    return { id, name: p.name, detail: p.detail, unitPrice: p.price, qty };
  });
  if (!items.length) throw new Error('El pedido está vacío.');

  const shipping = feeForKm(input.delivery.km, config.shipping);
  if (!shipping.covered) throw new Error('Tu dirección queda fuera de la zona de entrega.');

  const deliveryDate = nextDeliveryDate(config.schedule);
  if (!deliveryDate) throw new Error('No hay fechas de entrega disponibles por ahora.');

  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const seq = (read(K.seq, 0) | 0) + 1;

  const order = {
    number: `AC-${String(seq).padStart(4, '0')}`,
    createdAt: new Date().toISOString(),
    status: 'recibido',
    customer: input.customer,
    delivery: { ...input.delivery, fee: shipping.fee, date: deliveryDate },
    items,
    subtotal,
    total: subtotal + shipping.fee,
    payment: {
      method: input.payment.method,
      proof: input.payment.proof ? { name: input.payment.proof.name, size: input.payment.proof.size } : null,
      status: input.payment.method === 'transferencia' ? 'en_revision' : 'pendiente',
    },
  };

  const orders = read(K.orders, []);
  orders.push(order);
  if (!write(K.orders, orders) || !write(K.seq, seq)) {
    throw new Error('No pudimos guardar tu pedido en este dispositivo.');
  }
  // TODO (servidor): notificar por Telegram y correo, subir el comprobante a Storage.
  return order;
}
