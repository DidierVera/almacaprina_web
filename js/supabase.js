// Minimal Supabase client using plain fetch (no dependencies).
// Only the public "publishable" key is used here; with the new key format it goes in the
// `apikey` header only (it is not a JWT, so it must NOT be sent as a Bearer token).
// What each visitor can do is limited by the RLS rules in supabase/schema.sql.
import { SUPABASE_KEY, SUPABASE_URL } from './supabase-config.js';

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, ...headers },
    body,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    // PostgREST puts our `raise exception 'CODE'` in `message`.
    const error = new Error(detail?.message ?? `HTTP_${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.status === 204 ? null : res.json();
}

/** GET /rest/v1/<table>?<query> */
export const select = (table, query) => request(`/rest/v1/${table}?${query}`);

/** Calls a Postgres function: POST /rest/v1/rpc/<fn> */
export const rpc = (fn, args = {}) => request(`/rest/v1/rpc/${fn}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(args),
});

/** Uploads a File to a Storage bucket. Never overwrites an existing object. */
export const uploadFile = (bucket, path, file) => request(`/storage/v1/object/${bucket}/${path}`, {
  method: 'POST',
  headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
  body: file,
});
