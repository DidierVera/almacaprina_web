// Admin panel shell: login, sidebar navigation and hash routing.
import { checkAdmin, currentEmail, hasSession, signIn, signOut } from './auth.js';
import { h } from './ui.js';

const VIEWS = [
  { id: 'orders', label: 'Pedidos', load: () => import('./views/orders.js') },
  { id: 'products', label: 'Productos', load: () => import('./views/products.js') },
  { id: 'delivery', label: 'Entregas', load: () => import('./views/delivery.js') },
  { id: 'settings', label: 'Ajustes', load: () => import('./views/settings.js') },
];

const app = document.getElementById('app');
let unmountCurrent = null;
let routeToken = 0;

/* ---------------- login ---------------- */
const LOGIN_ERRORS = {
  invalid_credentials: 'Correo o contraseña incorrectos.',
  NOT_ADMIN: 'Ese usuario no tiene permiso de administrador.',
};

function showLogin(errorCode = null) {
  unmountCurrent?.(); unmountCurrent = null;
  const error = h('p', { class: 'notice notice--error', role: 'alert', hidden: !errorCode }, LOGIN_ERRORS[errorCode] ?? '');
  const email = h('input', { id: 'login-email', type: 'email', autocomplete: 'username', required: true });
  const password = h('input', { id: 'login-password', type: 'password', autocomplete: 'current-password', required: true });
  const submit = h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, 'Ingresar');

  const form = h('form', { class: 'login__card', onSubmit: async (e) => {
    e.preventDefault();
    submit.disabled = true; submit.textContent = 'Ingresando…';
    try {
      await signIn(email.value.trim(), password.value);
      await boot();
    } catch (err) {
      error.hidden = false;
      error.textContent = LOGIN_ERRORS[err.message] ?? 'No pudimos iniciar sesión. Inténtalo de nuevo.';
      submit.disabled = false; submit.textContent = 'Ingresar';
    }
  } },
  h('p', { class: 'brand' }, 'Alma Caprina'),
  h('h1', {}, 'Panel de administración'),
  error,
  h('div', { class: 'field' }, h('label', { htmlFor: 'login-email' }, 'Correo'), email),
  h('div', { class: 'field' }, h('label', { htmlFor: 'login-password' }, 'Contraseña'), password),
  submit);

  app.replaceChildren(h('main', { class: 'login' }, form));
  email.focus();
}

/* ---------------- shell ---------------- */
function showShell() {
  const nav = h('nav', { class: 'sidebar__nav', 'aria-label': 'Secciones' },
    VIEWS.map((v) => h('a', { class: 'nav-item', href: `#${v.id}`, dataset: { view: v.id } }, v.label)));

  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'sidebar__brand' }, h('p', { class: 'brand' }, 'Alma Caprina'), h('p', { class: 'muted' }, 'Panel de administración')),
    nav,
    h('div', { class: 'sidebar__foot' },
      h('p', { class: 'muted sidebar__email' }, currentEmail() ?? ''),
      h('button', { class: 'nav-item', type: 'button', onClick: async () => { await signOut(); showLogin(); } }, 'Cerrar sesión')));

  app.replaceChildren(h('div', { class: 'shell' }, sidebar, h('main', { class: 'view', id: 'view', tabIndex: -1 })));
  route();
}

async function route() {
  const view = VIEWS.find((v) => v.id === location.hash.slice(1)) ?? VIEWS[0];
  const container = document.getElementById('view');
  if (!container) return;
  const token = ++routeToken;

  document.querySelectorAll('.sidebar .nav-item[data-view]').forEach((a) => {
    if (a.dataset.view === view.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${view.label} · Alma Caprina`;

  unmountCurrent?.(); unmountCurrent = null;
  container.replaceChildren(h('p', { class: 'muted' }, 'Cargando…'));
  try {
    const mod = await view.load();
    if (token !== routeToken) return; // the user navigated elsewhere meanwhile
    container.replaceChildren();
    unmountCurrent = (await mod.mount(container)) ?? null;
  } catch (err) {
    console.error(err);
    if (token !== routeToken) return;
    if (err.message === 'SESSION_EXPIRED' || err.status === 401) { showLogin(); return; }
    container.replaceChildren(h('p', { class: 'notice notice--error' }, 'No pudimos cargar esta sección. Revisa tu conexión e inténtalo de nuevo.'));
  }
}
window.addEventListener('hashchange', route);

/* ---------------- boot ---------------- */
async function boot() {
  if (!hasSession()) { showLogin(); return; }
  try {
    if (!(await checkAdmin())) { await signOut(); showLogin('NOT_ADMIN'); return; }
  } catch (err) {
    if (err.message === 'SESSION_EXPIRED' || err.status === 401) { showLogin(); return; }
    app.replaceChildren(h('main', { class: 'login' }, h('div', { class: 'login__card' },
      h('p', { class: 'notice notice--error' }, 'No pudimos conectar con el servidor.'),
      h('button', { class: 'btn btn--primary btn--block', type: 'button', onClick: boot }, 'Reintentar'))));
    return;
  }
  showShell();
}

boot();
