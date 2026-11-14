// Products page: the full catalog grouped by category (flavor variants share one card).
import { groupProducts } from './catalog.js';
import { initCartBar } from './cart-bar.js';
import { CATEGORIES } from './data/defaults.js';
import { initLayout } from './layout.js';
import { getProducts } from './store.js';
import { bindSteppers, productCard, productGroupCard } from './ui/product-card.js';

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
const sections = [];
for (const category of CATEGORIES.filter((c) => c.id !== 'all')) {
  const inCategory = items.filter((i) => (i.type === 'group' ? i.category : i.product.category) === category.id);
  if (!inCategory.length) continue;
  const section = document.createElement('section');
  section.className = 'catalog__group';
  const heading = document.createElement('h2');
  heading.textContent = category.label;
  const list = document.createElement('ul');
  list.className = 'product-list product-list--grid';
  list.replaceChildren(...inCategory.map((i) => (i.type === 'group' ? productGroupCard(i) : productCard(i.product))));
  bindSteppers(list);
  section.append(heading, list);
  sections.push(section);
}
catalog.replaceChildren(...sections);
if (!sections.length) catalog.textContent = 'Pronto publicaremos nuestros productos.';

initCartBar(products);
