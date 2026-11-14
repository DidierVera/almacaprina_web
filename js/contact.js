// Contact page: cards built from the contact data the owner keeps in the admin settings.
import { initLayout } from './layout.js';
import { hubsOf } from './shipping.js';
import { getConfig } from './store.js';

initLayout('contact');
const list = document.getElementById('contactList');

let config;
try {
  config = await getConfig();
} catch (err) {
  list.textContent = 'No pudimos cargar la información de contacto. Inténtalo de nuevo en un momento.';
  throw err;
}

const { whatsapp, phone, instagram, email } = config.business;
const cards = [];
if (whatsapp) cards.push(['WhatsApp', 'Escríbenos para dudas o pedidos especiales', `https://wa.me/${whatsapp.replace(/\D/g, '')}`]);
if (phone) cards.push(['Llámanos', phone, `tel:${phone.replace(/[^\d+]/g, '')}`]);
if (instagram) cards.push(['Instagram', `@${instagram}`, `https://www.instagram.com/${instagram}/`]);
if (email) cards.push(['Correo', email, `mailto:${email}`]);

list.replaceChildren(...cards.map(([title, sub, href]) => {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href; a.rel = 'noopener';
  if (!href.startsWith('mailto:') && !href.startsWith('tel:')) a.target = '_blank';
  const strong = document.createElement('strong'); strong.textContent = title;
  const span = document.createElement('span'); span.className = 'muted'; span.textContent = sub;
  a.append(strong, span); li.append(a);
  return li;
}));
if (!cards.length) list.textContent = 'Pronto publicaremos nuestros datos de contacto.';

const labels = hubsOf(config.shipping).map((h) => h.label).filter(Boolean);
const places = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} y ${labels.at(-1)}` : labels[0];
document.getElementById('contactArea').textContent = `Entregamos a domicilio hasta ${config.shipping.maxKm} km desde ${places}. Mira las próximas fechas de entrega en la página de inicio.`;
