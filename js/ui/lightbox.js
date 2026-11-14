// Image viewer for the gallery: click a thumbnail to open it large; arrows, swipe and Esc work.
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}

/** @param {HTMLElement} gallery container whose `[data-full]` buttons open the viewer */
export function initLightbox(gallery) {
  const items = [...gallery.querySelectorAll('button[data-full]')];
  if (!items.length) return;
  let index = 0;
  let opener = null;

  const img = el('img', { className: 'viewer__img', alt: '' });
  const caption = el('p', { className: 'viewer__caption' });
  const count = el('span', { className: 'viewer__count' });
  const close = el('button', { className: 'viewer__btn', type: 'button', ariaLabel: 'Cerrar', textContent: '✕' });
  const prev = el('button', { className: 'viewer__btn viewer__nav viewer__nav--prev', type: 'button', ariaLabel: 'Foto anterior', textContent: '‹' });
  const next = el('button', { className: 'viewer__btn viewer__nav viewer__nav--next', type: 'button', ariaLabel: 'Foto siguiente', textContent: '›' });
  const dialog = el('dialog', { className: 'viewer', ariaLabel: 'Visor de fotos' },
    el('div', { className: 'viewer__inner' },
      el('div', { className: 'viewer__bar' }, count, close),
      el('div', { className: 'viewer__stage' }, prev, img, next),
      caption));
  document.body.append(dialog);

  function show(i) {
    index = (i + items.length) % items.length;
    const item = items[index];
    img.src = item.dataset.full;
    img.alt = item.dataset.alt ?? '';
    caption.textContent = item.dataset.alt ?? '';
    count.textContent = `${index + 1} / ${items.length}`;
    prev.hidden = next.hidden = items.length < 2;
  }

  items.forEach((item, i) => item.addEventListener('click', () => {
    opener = item;
    show(i);
    dialog.showModal();
    close.focus();
  }));
  close.addEventListener('click', () => dialog.close());
  prev.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  dialog.addEventListener('close', () => opener?.focus());
  dialog.addEventListener('click', (e) => { if (e.target === dialog || e.target.classList.contains('viewer__stage')) dialog.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  let startX = null;
  dialog.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  }, { passive: true });
}
