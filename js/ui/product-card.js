import { cart } from '../cart.js';
import { money } from '../format.js';

/** Builds the card with DOM APIs (no innerHTML) so names/details from the database can't inject HTML. */
export function productCard(product) {
  const li = document.createElement('li');
  li.className = 'product-card';
  li.dataset.id = product.id;

  const image = document.createElement('div');
  image.className = 'product-card__img';
  if (product.image) {
    const img = document.createElement('img');
    img.src = product.image; img.alt = ''; img.loading = 'lazy';
    image.append(img);
  }

  const body = document.createElement('div');
  body.className = 'product-card__body';
  const name = document.createElement('h3');
  name.className = 'product-card__name';
  name.textContent = product.name;
  const detail = document.createElement('p');
  detail.className = 'product-card__detail';
  detail.textContent = product.detail;

  const row = document.createElement('div');
  row.className = 'product-card__row';
  const price = document.createElement('span');
  price.className = 'price';
  price.textContent = money(product.price);

  const stepper = document.createElement('div');
  stepper.className = 'stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', `Cantidad de ${product.name}`);
  stepper.innerHTML = `
    <button type="button" data-act="dec" aria-label="Quitar uno">−</button>
    <output aria-live="polite">0</output>
    <button type="button" data-act="inc" aria-label="Agregar uno">+</button>`;

  row.append(price, stepper);
  body.append(name, detail, row);
  li.append(image, body);
  syncCard(li);
  return li;
}

export function syncCard(li) {
  const qty = cart.qty(li.dataset.id);
  li.querySelector('output').textContent = qty;
  li.querySelector('[data-act="dec"]').disabled = qty === 0;
  li.querySelector('[data-act="inc"]').disabled = qty >= cart.MAX_QTY;
}

/** One listener per list; keeps every card in sync with the cart. */
export function bindSteppers(list) {
  list.addEventListener('click', (e) => {
    const button = e.target.closest('button[data-act]');
    const li = button?.closest('.product-card');
    if (!li) return;
    cart[button.dataset.act](li.dataset.id);
  });
  cart.subscribe(() => list.querySelectorAll('.product-card').forEach(syncCard));
}
