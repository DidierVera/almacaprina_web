// Products: inline price/active/featured editing, plus a drawer to create or edit a product with its photo.
import { money } from '../../format.js';
import { listProducts, patchGroupPrice, patchProduct, priceHistory, saveProduct, uploadProductImage } from '../api.js';
import { CATEGORY_OPTIONS } from '../labels.js';
import { guarded, h, slugify, switchInput, toast } from '../ui.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const categoryLabel = (id) => CATEGORY_OPTIONS.find((c) => c.id === id)?.label ?? id;

export async function mount(container) {
  let products = await listProducts();
  let openDialog = null;

  const tbody = h('tbody');
  container.append(
    h('div', { class: 'view-head' },
      h('h1', {}, 'Productos'),
      h('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: () => openEditor(null) }, 'Nuevo producto')),
    h('p', { class: 'hint', style: 'margin:-12px 0 16px' }, 'Los cambios de precio, "Destacado" y "Activo" se guardan al instante y los ve el cliente en su próxima visita.'),
    h('div', { class: 'card table-card' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, ['Foto', 'Producto', 'Categoría', 'Precio', 'Destacado', 'Activo', ''].map((t) => h('th', { scope: 'col' }, t)))),
      tbody)),
  );

  function render() {
    if (!products.length) {
      tbody.replaceChildren(h('tr', { class: 'empty-row' }, h('td', { colSpan: 7 }, 'Aún no hay productos. Crea el primero.')));
      return;
    }
    tbody.replaceChildren(...products.map(productRow));
  }

  function productRow(p) {
    const priceInput = h('input', { class: 'price-input', type: 'number', min: '0', step: '100', value: String(p.price), 'aria-label': `Precio de ${p.name}`,
      onChange: async (e) => {
        const value = Number(e.target.value);
        if (!Number.isInteger(value) || value < 0) { e.target.value = String(p.price); toast('El precio debe ser un número entero, sin decimales.', { error: true }); return; }
        if (value === p.price) return;
        const row = await guarded(() => patchProduct(p.id, { price: value }));
        if (!row) { e.target.value = String(p.price); return; }
        p.price = row.price;
        toast(`${p.name}: ${money(p.price)}`);
        if (await offerGroupPrice(p, value)) { products = await listProducts(); render(); }
      } });

    const toggle = (field, label) => switchInput({ checked: p[field], label: `${label}: ${p.name}`, onChange: async (checked, input) => {
      const row = await guarded(() => patchProduct(p.id, { [field]: checked }));
      if (row) { p[field] = row[field]; if (field === 'active') render(); } else input.checked = !checked;
    } });

    return h('tr', { class: p.active ? '' : 'inactive' },
      h('td', {}, p.image_url ? h('img', { class: 'thumb', src: p.image_url, alt: '', loading: 'lazy' }) : h('span', { class: 'thumb', role: 'img', 'aria-label': 'Sin foto' })),
      h('td', {}, h('div', { class: 'cell-stack' }, h('strong', {}, p.name), h('small', {}, p.detail),
        p.variant_group && h('small', {}, `Grupo: ${p.variant_group} · ${p.variant_label}`))),
      h('td', {}, categoryLabel(p.category)),
      h('td', {}, priceInput),
      h('td', {}, toggle('featured', 'Destacado')),
      h('td', {}, toggle('active', 'Activo')),
      h('td', {}, h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => openEditor(p) }, 'Editar')));
  }

  /** After changing one product's price, offers to apply it to the other products of its group. */
  async function offerGroupPrice(product, price) {
    const group = product.variant_group;
    if (!group) return false;
    const others = products.filter((o) => o.variant_group === group && o.id !== product.id && o.price !== price);
    if (!others.length) return false;
    if (!confirm(`¿Aplicar ${money(price)} también a los otros ${others.length} productos de «${group}»?`)) return false;
    const rows = await guarded(() => patchGroupPrice(group, price));
    if (rows) toast(`Precio actualizado en todo «${group}».`);
    return !!rows;
  }

  /* ---------- editor drawer ---------- */
  function uniqueId(name) {
    const base = slugify(name) || 'product';
    const taken = new Set(products.map((p) => p.id));
    let id = base; let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  }

  function openEditor(product) {
    const isNew = !product;
    const draft = product ? { ...product } : {
      name: '', detail: '', price: 0, category: 'cheese', image_url: null, active: true, featured: false,
      sort: Math.max(0, ...products.map((p) => p.sort)) + 1,
    };
    let imageFile = null;

    const field = (label, control, hint) => h('div', { class: 'field' }, h('label', {}, label, hint && h('span', { class: 'hint' }, ` ${hint}`)), control);
    const text = (name, extra = {}) => h('input', { name, value: String(draft[name] ?? ''), ...extra });

    const nameInput = text('name', { required: true, maxLength: 120 });
    const detailInput = text('detail', { maxLength: 160, placeholder: '250 g · artesanal' });
    const descriptionInput = h('textarea', { name: 'description', rows: '3', maxLength: 500, placeholder: 'Cremoso y suave, ideal para untar…', value: draft.description ?? '' });
    const nutritionInput = h('textarea', { name: 'nutrition', rows: '5', maxLength: 800, placeholder: 'Porción: 100 g\nProteína: 3,4 g\nGrasa: 4 g', value: draft.nutrition ?? '' });
    const priceInput = text('price', { type: 'number', min: '0', step: '100', required: true });
    const sortInput = text('sort', { type: 'number', step: '1' });
    const groupInput = h('input', { name: 'variant_group', value: draft.variant_group ?? '', list: 'variant-groups', maxLength: 80, placeholder: 'Yogur bebible' });
    const labelInput = h('input', { name: 'variant_label', value: draft.variant_label ?? '', maxLength: 60, placeholder: 'Mora' });
    const groupNames = [...new Set(products.map((p) => p.variant_group).filter(Boolean))];
    const categorySelect = h('select', { name: 'category', value: draft.category }, CATEGORY_OPTIONS.map((c) => h('option', { value: c.id }, c.label)));
    let activeValue = draft.active; let featuredValue = draft.featured;

    const preview = h('div', { class: 'thumb', style: 'width:84px;height:84px' });
    const showPreview = (src) => preview.replaceChildren(...(src ? [h('img', { class: 'thumb', style: 'width:84px;height:84px', src, alt: 'Foto del producto' })] : []));
    showPreview(draft.image_url);
    const fileInput = h('input', { type: 'file', accept: IMAGE_TYPES.join(','), 'aria-label': 'Foto del producto', onChange: (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
        e.target.value = ''; toast('La foto debe ser JPG, PNG o WebP de máximo 2 MB.', { error: true }); return;
      }
      imageFile = file; showPreview(URL.createObjectURL(file));
    } });

    const historyBox = h('div', { class: 'hint' });
    if (!isNew) {
      priceHistory(product.id).then((rows) => {
        if (rows.length < 2) return;
        historyBox.replaceChildren(h('strong', {}, 'Historial de precios'), ...rows.map((r) => h('div', {},
          `${new Date(r.changed_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}: ${r.old_price == null ? 'creado en' : `${money(r.old_price)} →`} ${money(r.new_price)}`)));
      }).catch(() => {});
    }

    const saveBtn = h('button', { class: 'btn btn--primary btn--sm', type: 'submit' }, 'Guardar');
    const dialog = h('dialog', { class: 'drawer', 'aria-label': isNew ? 'Nuevo producto' : `Editar ${product.name}` });
    const form = h('form', { class: 'drawer__inner', onSubmit: async (e) => {
      e.preventDefault();
      const price = Number(priceInput.value);
      if (!Number.isInteger(price) || price < 0) { toast('El precio debe ser un número entero, sin decimales.', { error: true }); return; }
      const variantGroup = groupInput.value.trim();
      const variantLabel = labelInput.value.trim();
      if (!!variantGroup !== !!variantLabel) {
        toast('Para agrupar un producto escribe el grupo y el sabor (o deja ambos vacíos).', { error: true });
        return;
      }
      saveBtn.disabled = true; saveBtn.textContent = 'Guardando…';
      const saved = await guarded(async () => {
        const image_url = imageFile ? await uploadProductImage(imageFile) : draft.image_url;
        return saveProduct({
          id: isNew ? uniqueId(nameInput.value) : product.id,
          name: nameInput.value.trim(), detail: detailInput.value.trim(), price,
          description: descriptionInput.value.trim() || null, nutrition: nutritionInput.value.trim() || null,
          category: categorySelect.value, image_url, active: activeValue, featured: featuredValue,
          sort: Number(sortInput.value) || 0,
          variant_group: variantGroup || null, variant_label: variantLabel || null,
        });
      }, 'No pudimos guardar el producto. Revisa los datos e inténtalo de nuevo.');
      saveBtn.disabled = false; saveBtn.textContent = 'Guardar';
      if (!saved) return;
      products = await listProducts();
      if (saved.price !== (product?.price ?? saved.price)) { // price changed on an existing product
        if (await offerGroupPrice(saved, saved.price)) products = await listProducts();
      } else if (isNew && saved.variant_group) {
        // A new flavor joins its group at the group's price, so the customer never sees mixed prices by accident.
        const sibling = products.find((o) => o.variant_group === saved.variant_group && o.id !== saved.id);
        if (sibling && sibling.price !== saved.price) await offerGroupPrice(saved, saved.price) && (products = await listProducts());
      }
      render();
      dialog.close();
      toast(isNew ? `Producto creado: ${saved.name}` : `Guardado: ${saved.name}`);
    } },
      h('div', { class: 'drawer__head' }, h('h2', {}, isNew ? 'Nuevo producto' : 'Editar producto'),
        h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => dialog.close() }, 'Cerrar')),
      h('div', { class: 'drawer__img' }, preview, fileInput),
      field('Nombre', nameInput),
      field('Descripción corta', detailInput, '(presentación)'),
      field('Descripción del producto', descriptionInput, '(opcional, se ve en "Nuestros productos")'),
      field('Información nutricional', nutritionInput, '(opcional, una línea por dato: «Proteína: 3,4 g»)'),
      h('div', { class: 'form-grid' }, field('Categoría', categorySelect), field('Precio (COP)', priceInput)),
      field('Orden en la lista', sortInput, '(menor = primero)'),
      h('fieldset', { class: 'variant-fieldset' },
        h('legend', {}, 'Agrupar sabores (opcional)'),
        h('p', { class: 'hint' }, 'Los productos con el mismo grupo se muestran en una sola tarjeta con un selector de sabor. Deja ambos campos vacíos si el producto va solo.'),
        h('div', { class: 'form-grid' }, field('Grupo', groupInput), field('Sabor', labelInput)),
        h('datalist', { id: 'variant-groups' }, groupNames.map((g) => h('option', { value: g })))),
      h('div', { class: 'field--inline' }, switchInput({ checked: draft.active, label: 'Activo', onChange: (v) => { activeValue = v; } }), h('span', {}, 'Activo (visible para los clientes)')),
      h('div', { class: 'field--inline' }, switchInput({ checked: draft.featured, label: 'Destacado', onChange: (v) => { featuredValue = v; } }), h('span', {}, 'Destacado (aparece en "Lo más pedido" si hay pocas ventas)')),
      historyBox,
      h('div', { class: 'drawer__foot' }, saveBtn));

    dialog.append(form);
    dialog.addEventListener('close', () => { dialog.remove(); if (openDialog === dialog) openDialog = null; });
    document.body.append(dialog);
    openDialog = dialog;
    dialog.showModal();
    nameInput.focus();
  }

  render();
  return () => { openDialog?.close(); };
}
