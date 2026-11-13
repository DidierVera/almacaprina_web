// Minimal Supabase client using plain fetch (no dependencies).
// Only the public "publishable" key is used here; with the new key format it goes in the
// `apikey` header only (it is not a JWT, so it must NOT be sent as a Bearer token).
// The admin panel registers a token provider (see admin/auth.js): once an admin is signed in,
// every request also carries the user's own JWT as `Authorization: Bearer`.
// What each visitor can do is limited by the RLS rules in supabase/schema.sql.
import { SUPABASE_KEY, SUPABASE_URL } from './supabase-config.js';

let tokenProvider = null;
export const setTokenProvider = (provider) => { tokenProvider = provider; };

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const token = tokenProvider ? await tokenProvider() : null;
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: { apikey: SUPABASE_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    // PostgREST puts our `raise exception 'CODE'` in `message`.
    const error = new Error(detail?.message ?? `HTTP_${res.status}`);
    error.status = res.status;
    throw error;
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** GET /rest/v1/<table>?<query> */
export const select = (table, query) => request(`/rest/v1/${table}?${query}`);

/** Calls a Postgres function: POST /rest/v1/rpc/<fn> */
export const rpc = (fn, args = {}) => request(`/rest/v1/rpc/${fn}`, {
  method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(args),
});

/** POST rows; returns the inserted rows. */
export const insert = (table, rows) => request(`/rest/v1/${table}`, {
  method: 'POST', headers: { ...JSON_HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(rows),
});

/** PATCH rows matching a PostgREST filter such as `id=eq.5`; returns the updated rows. */
export const update = (table, filter, patch) => request(`/rest/v1/${table}?${filter}`, {
  method: 'PATCH', headers: { ...JSON_HEADERS, Prefer: 'return=representation' }, body: JSON.stringify(patch),
});

/** Insert-or-update by a unique column. */
export const upsert = (table, rows, onConflict) => request(`/rest/v1/${table}?on_conflict=${onConflict}`, {
  method: 'POST',
  headers: { ...JSON_HEADERS, Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify(rows),
});

/** Uploads a File to a Storage bucket. Never overwrites an existing object. */
export const uploadFile = (bucket, path, file) => request(`/storage/v1/object/${bucket}/${path}`, {
  method: 'POST',
  headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' },
  body: file,
});

/** Short-lived URL for an object in a private bucket (requires an admin session). */
export async function signedUrl(bucket, path, expiresIn = 600) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const { signedURL } = await request(`/storage/v1/object/sign/${bucket}/${encoded}`, {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ expiresIn }),
  });
  return `${SUPABASE_URL}/storage/v1${signedURL}`;
}

export const publicUrl = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
