import { cart } from './cart.js';
import { getConfig, getProducts, getTopProducts } from './store.js';
import { upcomingDeliveryDates } from './delivery.js';
import { addDays, formatLong, formatShort, money } from './format.js';
import { bindSteppers, productCard } from './ui/product-card.js';

const $ = (id) => document.getElementById(id);

const [config, products, top] = await Promise.all([getConfig(), getProducts(), getTopProducts(4)]);

// "Lo más pedido"
const list = $('top-list');
list.replaceChildren(...top.map(productCard));
bindSteppers(list);

// "¿Cuándo llega?": calculado con el calendario real que defina el administrador.
// Un pedido hecho hasta el día anterior a una entrega (y después de la entrega anterior) llega en esa entrega.
const when = $('when');
const dates = upcomingDeliveryDates(config.schedule, 3);
when.replaceChildren(...dates.map((d) => {
  const row = document.createElement('div');
  row.className = 'when__row';
  const left = document.createElement('span');
  left.textContent = `Pides hasta el ${formatShort(addDays(d, -1)).toLowerCase()}`;
  const right = document.createElement('span');
  right.className = 'when__day';
  right.textContent = formatLong(d);
  row.append(left, right);
  return row;
}));
if (!dates.length) when.textContent = 'Pronto publicaremos las próximas fechas de entrega.';

// Redes
const social = $('social');
const { whatsapp, instagram } = config.business;
const links = [];
if (whatsapp) links.push(['WhatsApp', `https://wa.me/${whatsapp.replace(/\D/g, '')}`]);
if (instagram) links.push(['Instagram', `https://www.instagram.com/${instagram}/`]);
social.replaceChildren(...links.map(([label, href]) => {
  const a = document.createElement('a');
  a.href = href; a.textContent = label; a.rel = 'noopener'; a.target = '_blank';
  return a;
}));

// Barra de carrito
const byId = new Map(products.map((p) => [p.id, p]));
function renderBar() {
  const units = cart.units();
  $('cartBar').hidden = units === 0;
  if (!units) return;
  const total = cart.entries().reduce((s, [id, q]) => s + (byId.get(id)?.price ?? 0) * q, 0);
  $('cartCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
  $('cartTotal').textContent = money(total);
}
cart.subscribe(renderBar);
renderBar();
