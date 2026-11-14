// Home page: "most ordered" and the upcoming delivery dates.
import { initCartBar } from './cart-bar.js';
import { upcomingDeliveryDates } from './delivery.js';
import { addDays, formatLong, formatShort } from './format.js';
import { initLayout } from './layout.js';
import { getConfig, getProducts, getTopProducts } from './store.js';
import { bindSteppers, productCard } from './ui/product-card.js';

const $ = (id) => document.getElementById(id);
initLayout('home');

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

initCartBar(products);
