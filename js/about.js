// About page: gallery viewer and the Instagram link.
import { initLayout } from './layout.js';
import { getConfig } from './store.js';
import { initLightbox } from './ui/lightbox.js';

initLayout('about');
initLightbox(document.getElementById('gallery'));

try {
  const { instagram } = (await getConfig()).business;
  if (instagram) {
    document.getElementById('galleryLink').href = `https://www.instagram.com/${instagram}/`;
    document.getElementById('galleryMore').hidden = false;
  }
} catch { /* the gallery works without the Instagram link */ }
