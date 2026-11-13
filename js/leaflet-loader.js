// Lazy-loads Leaflet (maps) from cdnjs only when a page actually needs a map.
const VERSION = '1.9.4';
let loading = null;

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${VERSION}/leaflet.min.css`;
    document.head.append(css);
    const script = document.createElement('script');
    script.src = `https://cdnjs.cloudflare.com/ajax/libs/leaflet/${VERSION}/leaflet.min.js`;
    script.onload = () => resolve(window.L);
    script.onerror = () => { loading = null; reject(new Error('MAP_LOAD_FAILED')); };
    document.head.append(script);
  });
  return loading;
}

export const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: { maxZoom: 19, attribution: '© colaboradores de OpenStreetMap' },
};
