// Sticky "N products · total · Continue" bar, shown only while the cart has items.
import { cart } from './cart.js';
import { money } from './format.js';

export function initCartBar(products) {
  const bar = document.getElementById('cartBar');
  if (!bar) return;
  const byId = new Map(products.map((p) => [p.id, p]));
  function render() {
    const units = cart.units();
    bar.hidden = units === 0;
    if (!units) return;
    const total = cart.entries().reduce((sum, [id, qty]) => sum + (byId.get(id)?.price ?? 0) * qty, 0);
    document.getElementById('cartCount').textContent = `${units} ${units === 1 ? 'producto' : 'productos'}`;
    document.getElementById('cartTotal').textContent = money(total);
  }
  cart.subscribe(render);
  render();
}
