// Shared header navigation and footer for the public pages (one source of truth, no build step).
import { getConfig } from './store.js';

const LINKS = [
  { id: 'products', href: 'products.html', label: 'Productos' },
  { id: 'about', href: 'about.html', label: 'Nosotros' },
  { id: 'contact', href: 'contact.html', label: 'Contacto' },
];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    node.setAttribute(k, v === true ? '' : v);
  }
  node.append(...children);
  return node;
}

function logoLink() {
  const img = el('img', { src: 'images/logo.png', alt: 'Alma Caprina · Del campo a tu mesa', width: '76', height: '60' });
  return el('a', { class: 'brand brand--logo', href: './', 'aria-label': 'Alma Caprina, inicio' }, img);
}

/** Fills `<nav id="siteNav">`; `page` is the id of the current page ('home' for the index). */
export function renderNav(page) {
  const nav = document.getElementById('siteNav');
  if (!nav) return;
  nav.className = 'nav';
  nav.setAttribute('aria-label', 'Principal');
  const links = el('div', { class: 'nav__links' },
    ...LINKS.map((l) => el('a', { class: 'nav__link', href: l.href, 'aria-current': l.id === page ? 'page' : null }, l.label)));
  nav.replaceChildren(logoLink(), el('a', { class: 'nav__link nav__link--cta', href: 'order.html' }, 'Haz tu pedido'), links);
}

/** Fills `<footer id="siteFooter">` with the brand, the order button and the social links. */
export async function renderFooter() {
  const footer = document.getElementById('siteFooter');
  if (!footer) return;
  footer.className = 'footer';
  let business = {};
  try { ({ business } = await getConfig()); } catch { /* the footer still works without social links */ }
  const social = el('p', { class: 'footer__links' });
  if (business.whatsapp) social.append(el('a', { href: `https://wa.me/${business.whatsapp.replace(/\D/g, '')}`, target: '_blank', rel: 'noopener' }, 'WhatsApp'));
  if (business.instagram) social.append(el('a', { href: `https://www.instagram.com/${business.instagram}/`, target: '_blank', rel: 'noopener' }, 'Instagram'));
  footer.replaceChildren(el('div', { class: 'container footer__inner' },
    el('div', {}, el('p', { class: 'brand' }, 'Alma Caprina'), el('p', { class: 'footer__tag' }, 'Productos de cabra de granja, con alma.')),
    el('a', { class: 'btn btn--primary', href: 'order.html' }, 'Haz tu pedido'),
    social));
}

export function initLayout(page) {
  renderNav(page);
  return renderFooter();
}
