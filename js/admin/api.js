// Admin data access. Every call carries the signed-in admin's token (see auth.js);
// the database rules (RLS) decide what is allowed.
import { DEFAULT_CONFIG } from '../data/defaults.js';
import { publicUrl, select, signedUrl, update, uploadFile, upsert } from '../supabase.js';

/* ---------- orders ---------- */
export const listOrders = () => select('orders',
  'select=*,order_items(*)&order=delivery_date.desc,created_at.desc&limit=500');

export const updateOrder = async (id, patch) => (await update('orders', `id=eq.${id}`, patch))[0];

export const proofUrl = (path) => signedUrl('proofs', path);

/* ---------- products ---------- */
export const listProducts = () => select('products', 'select=*&order=sort.asc,created_at.asc');

export const patchProduct = async (id, patch) => (await update('products', `id=eq.${encodeURIComponent(id)}`, patch))[0];

export const saveProduct = async (product) => (await upsert('products', product, 'id'))[0];

/** Sets the same price on every product of a variant group (e.g. all flavors of a yogurt). */
export const patchGroupPrice = (group, price) => update('products', `variant_group=eq.${encodeURIComponent(group)}`, { price });

export const priceHistory = (id) => select('price_history',
  `select=old_price,new_price,changed_at&product_id=eq.${encodeURIComponent(id)}&order=changed_at.desc&limit=6`);

/** Uploads a product photo to the public bucket and returns its public URL. */
export async function uploadProductImage(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${crypto.randomUUID()}.${ext}`;
  await uploadFile('products', path, file);
  return publicUrl('products', path);
}

/* ---------- settings ---------- */
export async function getSettings() {
  const rows = await select('settings', 'select=key,value');
  return { ...DEFAULT_CONFIG, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export const saveSetting = (key, value) => upsert('settings',
  { key, value, updated_at: new Date().toISOString() }, 'key');
