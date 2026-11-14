// Read-only product cards for the "Nuestros productos" page: photo, presentation, description,
// flavors/sizes and nutrition facts. No prices and no cart controls: ordering happens in the order flow.

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

function photo(src, alt) {
  const box = el('div', 'info-card__img');
  if (src) {
    const img = document.createElement('img');
    img.src = src; img.alt = alt; img.loading = 'lazy';
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
    if (i > 0) list.append(el('dt', '', line.slice(0, i).trim()), el('dd', '', line.slice(i + 1).trim()));
    else list.append(el('dd', 'nutrition__note', line));
  }
  details.append(list);
  return details;
}

function card({ image, name, detail, description, nutrition, options, optionsLabel }) {
  const li = el('li', 'info-card');
  const body = el('div', 'info-card__body');
  body.append(el('h3', 'info-card__name', name));
  if (detail) body.append(el('p', 'info-card__pill', detail));
  if (description) body.append(el('p', 'info-card__text', description));
  if (options?.length) {
    body.append(el('p', 'info-card__label', optionsLabel));
    const chips = el('ul', 'flavors');
    chips.setAttribute('aria-label', `${optionsLabel} de ${name}`);
    chips.append(...options.map((f) => el('li', '', f)));
    body.append(chips);
  }
  const facts = nutritionBlock(nutrition);
  if (facts) body.append(facts);
  li.append(photo(image, name), body);
  return li;
}

export const infoCard = (p) => card(p);

/** A group (flavors, sizes, egg grades) shares one card; description and nutrition come from the first member that has them. */
export function infoGroupCard(group) {
  const first = group.variants.find((v) => v.description || v.nutrition) ?? group.variants[0];
  return card({
    image: group.image, name: group.name, detail: group.detail,
    description: first.description, nutrition: first.nutrition,
    options: group.variants.map((v) => v.variant_label),
    optionsLabel: 'Disponible en',
  });
}
