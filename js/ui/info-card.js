// Read-only product cards for the "Nuestros productos" page: photo, presentation, short description,
// flavors/sizes, and a "Ver más" part with the full description, uses, storage and nutrition facts.
// No prices and no cart controls: ordering happens in the order flow.

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
function nutritionTable(text) {
  const lines = String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  const list = el('dl', 'nutrition__list');
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i > 0) list.append(el('dt', '', line.slice(0, i).trim()), el('dd', '', line.slice(i + 1).trim()));
    else list.append(el('dd', 'nutrition__note', line));
  }
  return list;
}

/** The expandable part. `longTexts` is a list of { label?, text } (one per flavor when they differ). */
function moreBlock({ longTexts, ideal, storage, nutrition }) {
  const table = nutritionTable(nutrition);
  if (!longTexts.length && !ideal && !storage && !table) return null;
  const details = el('details', 'more');
  details.append(el('summary', '', 'Ver más'));
  const content = el('div', 'more__content');
  for (const { label, text } of longTexts) {
    const p = el('p', 'info-card__text');
    if (label) p.append(el('strong', '', `${label}: `));
    p.append(document.createTextNode(text));
    content.append(p);
  }
  if (ideal) { const p = el('p', 'more__row'); p.append(el('strong', '', 'Ideal para: '), document.createTextNode(ideal)); content.append(p); }
  if (storage) { const p = el('p', 'more__row'); p.append(el('strong', '', 'Conservación: '), document.createTextNode(storage)); content.append(p); }
  if (table) { content.append(el('p', 'more__row more__row--title', 'Información nutricional'), table); }
  details.append(content);
  return details;
}

function card({ image, name, detail, description, options, optionsLabel, more }) {
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
  const extra = moreBlock(more);
  if (extra) body.append(extra);
  li.append(photo(image, name), body);
  return li;
}

export const infoCard = (p) => card({
  image: p.image, name: p.name, detail: p.detail, description: p.description,
  more: { longTexts: p.long_description ? [{ text: p.long_description }] : [], ideal: p.ideal_for, storage: p.storage, nutrition: p.nutrition },
});

/**
 * A group (flavors, sizes, egg grades) shares one card. Full descriptions that are identical across
 * the group are shown once; when they differ (one text per flavor) each is labeled with its flavor.
 */
export function infoGroupCard(group) {
  const members = group.variants;
  const first = (key) => members.find((v) => v[key])?.[key];
  const withText = members.filter((v) => v.long_description);
  const identical = withText.length > 0 && withText.every((v) => v.long_description === withText[0].long_description);
  const longTexts = identical
    ? [{ text: withText[0].long_description }]
    : withText.map((v) => ({ label: v.variant_label, text: v.long_description }));
  return card({
    image: group.image, name: group.name, detail: group.detail, description: first('description'),
    options: members.map((v) => v.variant_label), optionsLabel: 'Disponible en',
    more: { longTexts, ideal: first('ideal_for'), storage: first('storage'), nutrition: first('nutrition') },
  });
}
