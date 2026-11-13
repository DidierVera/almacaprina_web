// Admin authentication against Supabase Auth (email + password) using plain fetch.
// The session lives in localStorage; the access token is refreshed automatically before it expires.
import { SUPABASE_KEY, SUPABASE_URL } from '../supabase-config.js';
import { select, setTokenProvider } from '../supabase.js';

const STORAGE_KEY = 'ac:admin-session';
const nowSeconds = () => Math.floor(Date.now() / 1000);

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
let session = load();

function save(next) {
  session = next;
  try {
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); else localStorage.removeItem(STORAGE_KEY);
  } catch { /* private mode: session lasts for this page only */ }
}

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_code ?? data.error ?? `HTTP_${res.status}`);
  return data;
}

const toSession = (d) => ({
  accessToken: d.access_token,
  refreshToken: d.refresh_token,
  expiresAt: nowSeconds() + d.expires_in,
  email: d.user?.email ?? session?.email ?? null,
});

export async function signIn(email, password) {
  save(toSession(await authRequest('token?grant_type=password', { email, password })));
}

let refreshing = null;
function refresh() {
  refreshing ??= authRequest('token?grant_type=refresh_token', { refresh_token: session.refreshToken })
    .then((d) => save(toSession(d)))
    .catch(() => { save(null); throw new Error('SESSION_EXPIRED'); })
    .finally(() => { refreshing = null; });
  return refreshing;
}

/** Current access token, refreshed if it expires within a minute. Null when signed out. */
export async function accessToken() {
  if (!session) return null;
  if (session.expiresAt - nowSeconds() < 60) await refresh();
  return session.accessToken;
}

export const hasSession = () => session !== null;
export const currentEmail = () => session?.email ?? null;

export async function signOut() {
  try {
    if (session) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${session.accessToken}` },
      });
    }
  } catch { /* signing out locally is enough */ }
  save(null);
}

/** True when the signed-in user has a row in public.admins (RLS only lets users see their own row). */
export async function checkAdmin() {
  return (await select('admins', 'select=user_id')).length > 0;
}

setTokenProvider(accessToken);
