// Read-only product cards for the "Nuestros productos" page: photo, description and nutrition facts, no cart controls.
import { money } from '../format.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function photo(src) {
  const box = el('div', 'product-card__img');
  if (src) {
    const img = document.createElement('img');
    img.src = src; img.alt = ''; img.loading = 'lazy';
    box.append(img);
  }
  return box;
}

/** "Proteína: 3,4 g" lines become a small table; a line without ":" is shown as plain text. */
function nutritionBlock(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const details = el('details', 'nutrition');
  details.append(el('summary', '', 'Información nutricional'));
  const list = el('dl', 'nutrition__list');
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i > 0) {
      list.append(el('dt', '', line.slice(0, i).trim()), el('dd', '', line.slice(i + 1).trim()));
    } else {
      const note = el('dd', 'nutrition__note', line);
      list.append(note);
    }
  }
  details.append(list);
  return details;
}

function card({ image, name, detail, description, price, nutrition, flavors }) {
  const li = el('li', 'product-card product-card--info');
  const body = el('div', 'product-card__body');
  body.append(el('h3', 'product-card__name', name));
  if (detail) body.append(el('p', 'product-card__detail', detail));
  if (description) body.append(el('p', 'product-card__description', description));
  if (flavors?.length) {
    const chips = el('ul', 'flavors');
    chips.setAttribute('aria-label', `Sabores de ${name}`);
    chips.append(...flavors.map((f) => el('li', '', f)));
    body.append(chips);
  }
  body.append(el('span', 'price', price));
  const facts = nutritionBlock(nutrition);
  if (facts) body.append(facts);
  li.append(photo(image), body);
  return li;
}

export const infoCard = (p) => card({ ...p, price: money(p.price) });

/** A group of flavors shares one card; description and nutrition come from the first member that has them. */
export function infoGroupCard(group) {
  const first = group.variants.find((v) => v.description || v.nutrition) ?? group.variants[0];
  const price = group.minPrice === group.maxPrice ? money(group.minPrice) : `Desde ${money(group.minPrice)}`;
  return card({
    image: group.image, name: group.name, detail: group.detail, price,
    description: first.description, nutrition: first.nutrition,
    flavors: group.variants.map((v) => v.variant_label),
  });
}
