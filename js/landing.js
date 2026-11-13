import { cart } from './cart.js';
import { getConfig, getProducts, getTopProducts } from './store.js';
import { upcomingDeliveryDates } from './delivery.js';
import { addDays, formatLong, formatShort, money } from './format.js';
import { bindSteppers, productCard } from './ui/product-card.js';

const $ = (id) => document.getElementById(id);

let config;
let products;
let topProducts;
try {
  [config, products, topProducts] = await Promise.all([getConfig(), getProducts(), getTopProducts(4)]);
} catch (err) {
  $('when').textContent = 'No pudimos cargar la información. Inténtalo de nuevo en un momento.';
  throw err;
}

// "Most ordered"
const topList = $('top-list');
topList.replaceChildren(...topProducts.map(productCard));
bindSteppers(topList);

// "When does it arrive?": computed from the real calendar the admin defines.
// An order placed up to the day before a delivery (and after the previous delivery) arrives on that delivery.
const when = $('when');
const dates = upcomingDeliveryDates(config.schedule, 3);
when.replaceChildren(...dates.map((date) => {
  const row = document.createElement('div');
  row.className = 'when__row';
  const left = document.createElement('span');
  left.textContent = `Pides hasta el ${formatShort(addDays(date, -1)).toLowerCase()}`;
  const right = document.createElement('span');
  right.className = 'when__day';
  right.textContent = formatLong(date);
  row.append(left, right);
  return row;
}));
if (!dates.length) when.textContent = 'Pronto publicaremos las próximas fechas de entrega.';

// Social links
const { whatsapp, instagram } = config.business;
const links = [];
if (whatsapp) links.push(['WhatsApp', `https://wa.me/${whatsapp.replace(/\D/g, '')}`]);
if (instagram) links.push(['Instagram', `https://www.instagram.com/${instagram}/`]);
$('social').replaceChildren(...links.map(([label, href]) => {
  const a = document.createElement('a');
  a.href = href; a.textContent = label; a.rel = 'noopener'; a.target = '_blank';
  return a;
}));

// Cart bar
const productsById = new Map(products.map((p) => [p.id, p]));
function renderCartBar() {
  const units = cart.units();
  $('cartBar').hidden = units === 0;
  if (!units) return;
  const total = cart.entries().reduce((sum, [id, qty]) => sum + (productsById.get(id)?.price ?? 0) * qty, 0);
  $('cartCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
  $('cartTotal').textContent = money(total);
}
cart.subscribe(renderCartBar);
renderCartBar();
