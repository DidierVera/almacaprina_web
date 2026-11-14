// Data layer backed by Supabase. Every function is async and returns plain objects,
// so the pages never know where the data comes from.
// Errors are English codes (see messages.js for the customer-facing text).
import { DEFAULT_CONFIG } from './data/defaults.js';
import { rpc, select, uploadFile } from './supabase.js';

/** Memoizes a loader for the lifetime of the page; a failure is not cached. */
function memoize(load) {
  let cached = null;
  return () => {
    cached ??= load().catch((err) => { cached = null; throw err; });
    return cached;
  };
}

const PRODUCT_COLUMNS = 'id,name,detail,price,category,image_url,featured,sort,variant_group,variant_label';

export const getProducts = memoize(async () => {
  // The text columns are newer: if the database was not upgraded yet, the store still works with fewer columns.
  const query = (columns) => select('products', `select=${columns}&active=eq.true&order=sort.asc`);
  const TEXT = 'description,nutrition,long_description,ideal_for,storage';
  const rows = await query(`${PRODUCT_COLUMNS},${TEXT}`)
    .catch(() => query(`${PRODUCT_COLUMNS},description,nutrition`))
    .catch(() => query(PRODUCT_COLUMNS));
  return rows.map(({ image_url: image, ...p }) => ({ ...p, image }));
});

export const getConfig = memoize(async () => {
  const rows = await select('settings', 'select=key,value');
  return { ...DEFAULT_CONFIG, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
});

/** "Most ordered": units sold in the last 90 days; falls back to featured products when there is no history. */
export async function getTopProducts(limit = 4) {
  const [products, ranking] = await Promise.all([
    getProducts(),
    rpc('top_products', { p_limit: limit }).catch(() => []), // ranking is optional: never block the page
  ]);
  const unitsById = new Map(ranking.map((r) => [r.product_id, r.units]));
  const ranked = products
    .filter((p) => unitsById.has(p.id))
    .sort((a, b) => unitsById.get(b.id) - unitsById.get(a.id));
  const rest = products.filter((p) => !unitsById.has(p.id)).sort((a, b) => Number(b.featured) - Number(a.featured));
  return [...ranked, ...rest].slice(0, limit);
}

/**
 * Creates the order on the server. Prices, shipping fee and delivery date are recomputed there
 * (create_order in supabase/schema.sql): values sent by the browser are never trusted.
 * input = { items: [{id, qty}], customer, delivery: {km, lat, lng}, payment: {method, proof: File|null} }
 */
export async function createOrder(input) {
  const { method, proof } = input.payment;

  let proofPath = null;
  if (method === 'transfer' && proof) {
    const safeName = proof.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(-100) || 'proof';
    proofPath = `${crypto.randomUUID()}/${safeName}`;
    try {
      await uploadFile('proofs', proofPath, proof);
    } catch {
      throw new Error('UPLOAD_FAILED');
    }
  }

  const result = await rpc('create_order', {
    payload: {
      customer: input.customer,
      items: input.items,
      delivery: input.delivery,
      payment: { method, proofPath },
      consent: input.consent, // { accepted, version }: the customer's authorization to process personal data
    },
  });

  return {
    number: result.number,
    token: result.token,
    customer: input.customer,
    delivery: { ...input.delivery, date: result.deliveryDate, fee: result.shippingFee, km: result.km },
    subtotal: result.subtotal,
    total: result.total,
    payment: { method, status: result.paymentStatus },
  };
}
