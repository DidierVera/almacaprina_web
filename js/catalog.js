// Turns the flat product list into what the catalog shows: standalone products plus
// groups (e.g. "Yogur bebible" with flavors). Each variant stays a real product with its own
// id, stock and price history; only the presentation is grouped.

/**
 * @returns {Array<{type:'single', product}|{type:'group', name, detail, image, category, minPrice, maxPrice, variants}>}
 *   in the position of the first member of each group. A group with a single active variant
 *   is shown as a normal product.
 */
/** Sizes like "5 libras" … "8 libras" read best in numeric order; flavors keep the order set in the panel. */
function sortVariants(group) {
  if (group.every((v) => /^[0-9]/.test(v.variant_label ?? ''))) {
    group.sort((a, b) => parseFloat(a.variant_label.replace(',', '.')) - parseFloat(b.variant_label.replace(',', '.')));
  }
}

export function groupProducts(products) {
  const members = new Map(); // group name -> products
  for (const p of products) {
    if (p.variant_group) members.set(p.variant_group, [...(members.get(p.variant_group) ?? []), p]);
  }

  const items = [];
  const emitted = new Set();
  for (const p of products) {
    const group = p.variant_group ? members.get(p.variant_group) : null;
    if (!group || group.length < 2) { items.push({ type: 'single', product: p }); continue; }
    if (emitted.has(p.variant_group)) continue;
    emitted.add(p.variant_group);
    sortVariants(group);
    const prices = group.map((v) => v.price);
    items.push({
      type: 'group',
      name: p.variant_group,
      detail: group[0].detail,
      image: group.find((v) => v.image)?.image ?? null,
      category: group[0].category,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      variants: group,
    });
  }
  return items;
}
