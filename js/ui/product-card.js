import { cart } from '../cart.js';
import { money } from '../format.js';

/** Crea la tarjeta con DOM (sin innerHTML) para que nombres/detalles de la base de datos no inyecten HTML. */
export function productCard(p) {
  const li = document.createElement('li');
  li.className = 'product-card';
  li.dataset.id = p.id;

  const img = document.createElement('div');
  img.className = 'product-card__img';
  if (p.image) {
    const el = document.createElement('img');
    el.src = p.image; el.alt = ''; el.loading = 'lazy';
    img.append(el);
  }

  const body = document.createElement('div');
  body.className = 'product-card__body';
  const name = document.createElement('h3');
  name.className = 'product-card__name';
  name.textContent = p.name;
  const detail = document.createElement('p');
  detail.className = 'product-card__detail';
  detail.textContent = p.detail;

  const row = document.createElement('div');
  row.className = 'product-card__row';
  const price = document.createElement('span');
  price.className = 'price';
  price.textContent = money(p.price);

  const stepper = document.createElement('div');
  stepper.className = 'stepper';
  stepper.setAttribute('role', 'group');
  stepper.setAttribute('aria-label', `Cantidad de ${p.name}`);
  stepper.innerHTML = `
    <button type="button" data-act="dec" aria-label="Quitar uno">−</button>
    <output aria-live="polite">0</output>
    <button type="button" data-act="inc" aria-label="Agregar uno">+</button>`;

  row.append(price, stepper);
  body.append(name, detail, row);
  li.append(img, body);
  syncCard(li);
  return li;
}

export function syncCard(li) {
  const q = cart.qty(li.dataset.id);
  li.querySelector('output').textContent = q;
  li.querySelector('[data-act="dec"]').disabled = q === 0;
  li.querySelector('[data-act="inc"]').disabled = q >= cart.MAX_QTY;
}

/** Un solo listener por lista; mantiene todas las tarjetas sincronizadas con el carrito. */
export function bindSteppers(list) {
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    const li = btn?.closest('.product-card');
    if (!li) return;
    cart[btn.dataset.act](li.dataset.id);
  });
  cart.subscribe(() => list.querySelectorAll('.product-card').forEach(syncCard));
}
