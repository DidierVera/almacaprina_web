// Tiny DOM helpers for the admin panel. Everything is built with DOM APIs (textContent),
// never innerHTML, so values coming from the database cannot inject markup.

/**
 * h('button', { class: 'btn', onClick: fn, disabled: true }, 'Label', childNode)
 * Props: `class`, `dataset`, `onXxx` listeners, DOM properties (value, checked, type…), anything else as attribute.
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  let deferredValue;
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'value') deferredValue = value; // set after children so <select> finds its <option>
    else if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && key !== 'list' && key !== 'form') node[key] = value; // `list` and `form` are read-only properties
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  if (deferredValue !== undefined) node.value = deferredValue;
  return node;
}

export const badge = (tone, label) => h('span', { class: `badge badge--${tone}` }, label);

export function toast(message, { error = false } = {}) {
  const el = h('div', { class: `toast${error ? ' toast--error' : ''}` }, message);
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), error ? 6000 : 3500);
}

/** wa.me link for a Colombian phone number typed with or without the country code. */
export function whatsappLink(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}`;
}

export const mapsLink = (lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`;

export const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Sáb 14" */
export function shortDay(iso, dayNameFn) {
  return `${capitalize(dayNameFn(iso).slice(0, 3))} ${Number(iso.slice(8))}`;
}

/** Lowercase slug usable as a product id: "Queso Crema!" → "queso-crema". */
export function slugify(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** Switch (checkbox with role=switch) with an accessible name. */
export function switchInput({ checked, label, onChange }) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked: !!checked, 'aria-label': label, onChange: (e) => onChange?.(e.target.checked, e.target) });
  return h('label', { class: 'switch' }, input, h('span', { class: 'switch__track', 'aria-hidden': 'true' }));
}

/** Runs `fn`, shows a toast on failure. Returns the result or undefined. */
export async function guarded(fn, failureMessage = 'No pudimos guardar el cambio. Inténtalo de nuevo.') {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(err?.status === 401 || err?.message === 'SESSION_EXPIRED'
      ? 'Tu sesión expiró. Vuelve a ingresar.' : failureMessage, { error: true });
    return undefined;
  }
}
