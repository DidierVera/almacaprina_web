import { cart } from '../cart.js';
import { money } from '../format.js';

const STEPPER_HTML = `
  <button type="button" data-act="dec" aria-label="Quitar uno">−</button>
  <output aria-live="polite">0</output>
  <button type="button" data-act="inc" aria-label="Agregar uno">+</button>`;

/** Quantity stepper bound to one product id (found later through the closest [data-id]). */
function stepper(product) {
  const el = document.createElement('div');
  el.className = 'stepper';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', `Cantidad de ${product.name}`);
  el.innerHTML = STEPPER_HTML;
  return el;
}

function imageBox(src) {
  const box = document.createElement('div');
  box.className = 'product-card__img';
  if (src) {
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy';
    box.append(img);
  }
  return box;
}

const textEl = (tag, className, text) => {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = text;
  return el;
};

/** Builds the card with DOM APIs (no innerHTML for data) so names/details from the database can't inject HTML. */
export function productCard(product) {
  const li = document.createElement('li');
  li.className = 'product-card';
  li.dataset.id = product.id;

  const row = document.createElement('div');
  row.className = 'product-card__row';
  row.append(textEl('span', 'price', money(product.price)), stepper(product));

  const body = document.createElement('div');
  body.className = 'product-card__body';
  body.append(textEl('h3', 'product-card__name', product.name), textEl('p', 'product-card__detail', product.detail), row);

  li.append(imageBox(product.image), body);
  syncCard(li);
  return li;
}

/**
 * One card for a group of variants (e.g. "Yogur bebible" with one stepper per flavor).
 * `group` comes from groupProducts() in catalog.js.
 */
export function productGroupCard(group) {
  const li = document.createElement('li');
  li.className = 'product-card product-card--group';

  const priceText = group.minPrice === group.maxPrice ? money(group.minPrice) : `Desde ${money(group.minPrice)}`;

  const variants = document.createElement('ul');
  variants.className = 'variants';
  variants.setAttribute('aria-label', `Sabores de ${group.name}`);
  for (const variant of group.variants) {
    const item = document.createElement('li');
    item.className = 'variant-row';
    item.dataset.id = variant.id;
    const label = variant.price === group.minPrice || group.minPrice === group.maxPrice
      ? variant.variant_label
      : `${variant.variant_label} · ${money(variant.price)}`;
    item.append(textEl('span', 'variant-row__label', label), stepper(variant));
    variants.append(item);
  }

  const body = document.createElement('div');
  body.className = 'product-card__body';
  body.append(
    textEl('h3', 'product-card__name', group.name),
    textEl('p', 'product-card__detail', group.detail),
    textEl('span', 'price', priceText),
    variants,
  );

  li.append(imageBox(group.image), body);
  syncCard(li);
  return li;
}

/** Updates every stepper inside a card (one for a single product, one per flavor for a group). */
export function syncCard(card) {
  const holders = [...(card.dataset.id ? [card] : []), ...card.querySelectorAll('[data-id]')];
  for (const holder of holders) {
    const qty = cart.qty(holder.dataset.id);
    holder.querySelector('output').textContent = qty;
    holder.querySelector('[data-act="dec"]').disabled = qty === 0;
    holder.querySelector('[data-act="inc"]').disabled = qty >= cart.MAX_QTY;
  }
}

/** One listener per list; keeps every card in sync with the cart. */
export function bindSteppers(list) {
  list.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    const holder = button?.closest('[data-id]');
    if (!holder) return;
    cart[button.dataset.act](holder.dataset.id);
  });
  cart.subscribe(() => list.querySelectorAll('.product-card').forEach(syncCard));
}
