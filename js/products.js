// "Nuestros productos": read-only catalog (photo, description, nutrition facts) grouped by category.
// Ordering happens in the order flow; this page only has one button that leads there.
import { groupProducts } from './catalog.js';
import { CATEGORIES } from './data/defaults.js';
import { initLayout } from './layout.js';
import { getProducts } from './store.js';
import { infoCard, infoGroupCard } from './ui/info-card.js';

initLayout('products');
const catalog = document.getElementById('catalog');

let products;
try {
  products = await getProducts();
} catch (err) {
  catalog.textContent = 'No pudimos cargar los productos. Inténtalo de nuevo en un momento.';
  throw err;
}

const items = groupProducts(products);
const categoryOf = (item) => (item.type === 'group' ? item.category : item.product.category);
const known = new Set(CATEGORIES.map((c) => c.id));
const sections = [];
for (const category of CATEGORIES.filter((c) => c.id !== 'all')) {
  // A product with an unexpected category still shows up, under "De la finca".
  const inCategory = items.filter((i) => categoryOf(i) === category.id || (category.id === 'other' && !known.has(categoryOf(i))));
  if (!inCategory.length) continue;
  const section = document.createElement('section');
  section.className = 'catalog__group';
  section.id = `cat-${category.id}`;
  const heading = document.createElement('h2');
  heading.textContent = category.label;
  const list = document.createElement('ul');
  list.className = 'info-grid';
  list.replaceChildren(...inCategory.map((i) => (i.type === 'group' ? infoGroupCard(i) : infoCard(i.product))));
  section.append(heading, list);
  sections.push(section);
}
catalog.replaceChildren(...sections);

// Category jump links (only for categories that have products)
document.getElementById('categoryNav').replaceChildren(...sections.map((section) => {
  const link = document.createElement('a');
  link.className = 'chip'; link.href = `#${section.id}`; link.textContent = section.querySelector('h2').textContent;
  return link;
}));
if (!sections.length) catalog.textContent = 'Pronto publicaremos nuestros productos.';
