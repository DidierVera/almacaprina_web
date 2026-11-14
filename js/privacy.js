// Personal-data policy page: the controller's contact details come from the admin settings.
import { POLICY_DATE_LABEL } from './legal.js';
import { initLayout } from './layout.js';
import { getConfig } from './store.js';

initLayout('privacy');
document.getElementById('policyDate').textContent = POLICY_DATE_LABEL;

const list = document.getElementById('controller');
let business = {};
try { ({ business } = await getConfig()); } catch { /* the policy text is static; only the contact list needs the settings */ }

const rows = [
  ['Nombre o razón social', business.legalName],
  ['NIT o cédula', business.taxId],
  ['Dirección', business.address],
  ['Correo', business.email],
  ['Teléfono', business.phone],
  ['WhatsApp', business.whatsapp ? `+${business.whatsapp}` : ''],
].filter(([, value]) => value);

list.replaceChildren(...rows.map(([label, value]) => {
  const li = document.createElement('li');
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  li.append(strong, document.createTextNode(value));
  return li;
}));
