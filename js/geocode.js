// Finds the map point for a typed address using OpenStreetMap's Nominatim service (free, no key).
// Usage rules we follow: one request per second at most, only when the customer asks (no search-as-you-type),
// and the browser's own Referer identifies the site.
// Colombian house numbers are rarely mapped in OpenStreetMap, so the usual result is the street or the
// neighborhood: the customer then drags the pin to the door. When nothing matches, nearby places are offered.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const VIEWBOX = '-76.4,6.9,-74.9,5.4'; // left,top,right,bottom: the Antioquia area we deliver to
const GAP_MS = 1100;

const ABBREVIATIONS = [
  [/\b(?:cra|cr|kr|kra|carr)\b\.?/gi, 'Carrera'],
  [/\b(?:cll|cl|clle)\b\.?/gi, 'Calle'],
  [/\b(?:dg|diag)\b\.?/gi, 'Diagonal'],
  [/\b(?:tv|trv|transv)\b\.?/gi, 'Transversal'],
  [/\bcirc\b\.?/gi, 'Circular'],
  [/\bav\b\.?/gi, 'Avenida'],
];

/** "Cra 70 # 44-12" → "Carrera 70 # 44-12" */
export function normalizeStreet(text) {
  return ABBREVIATIONS.reduce((s, [pattern, full]) => s.replace(pattern, full), String(text).trim()).replace(/\s+/g, ' ');
}

/** The street without its house number: "Carrera 70 # 44-12" → "Carrera 70". */
export function streetOnly(text) {
  return normalizeStreet(text).replace(/\s*(?:#|n[o°º]\.?|nro\.?).*$/i, '').replace(/\s*-\s*\d.*$/, '').trim();
}

/** How precise a result is, from the OpenStreetMap category. */
function levelOf(item) {
  if (item.category === 'highway' || item.class === 'highway') return 'street'; // roads come first: "residential" is a road type too
  if (item.address?.house_number || ['house', 'building', 'apartments'].includes(item.type)) return 'address';
  if (['suburb', 'neighbourhood', 'quarter', 'hamlet', 'village', 'city_block'].includes(item.type)) return 'neighborhood';
  return 'area';
}

const shortLabel = (item) => {
  const parts = String(item.display_name ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  // Drop the country, postcode and department noise at the end: keep the most specific four parts.
  return parts.filter((p) => !/^\d+$/.test(p) && !/^(Colombia|Antioquia)$/i.test(p)).slice(0, 4).join(', ');
};

async function search(query, { signal } = {}) {
  const params = new URLSearchParams({
    q: query, format: 'jsonv2', countrycodes: 'co', limit: '5', addressdetails: '1',
    'accept-language': 'es', viewbox: VIEWBOX, bounded: '1',
  });
  const res = await fetch(`${ENDPOINT}?${params}`, { signal });
  if (!res.ok) throw new Error(`NOMINATIM_${res.status}`);
  const rows = await res.json();
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lon), label: shortLabel(r), level: levelOf(r), full: String(r.display_name ?? '') }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

const plain = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** A street name repeats across a city: results that mention the customer's neighborhood go first. */
function rankByNeighborhood(results, neighborhood) {
  const wanted = plain(neighborhood).trim();
  if (!wanted) return results;
  return [...results].sort((a, b) => Number(plain(b.full).includes(wanted)) - Number(plain(a.full).includes(wanted)));
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tries the most specific search first and relaxes it step by step.
 * @returns {{ level: 'address'|'street'|'multiple'|'area'|'none', results: Array<{lat,lng,label,level}> }}
 *   `address`/`street`: good enough to place the pin; `multiple`/`area`: only references to choose from; `none`: nothing found.
 */
export async function findPlaces({ address, neighborhood, city }, { signal } = {}) {
  const full = normalizeStreet(address);
  const street = streetOnly(address);
  const where = [city, 'Antioquia'].filter(Boolean).join(', ');
  const queries = [
    `${full}, ${neighborhood}, ${where}`,
    `${full}, ${where}`,
    street && street !== full ? `${street}, ${where}` : null,
    `${neighborhood}, ${where}`,
    city ? `${city}, Antioquia` : null,
  ].filter(Boolean);

  const tried = new Set();
  let first = true;
  for (const query of queries) {
    if (tried.has(query)) continue;
    tried.add(query);
    if (!first) await wait(GAP_MS);
    first = false;
    const results = await search(query, { signal });
    if (!results.length) continue;
    const ranked = dedupe(rankByNeighborhood(results, neighborhood));
    return { level: classify(ranked, { street, neighborhood }), results: ranked };
  }
  return { level: 'none', results: [] };
}

/**
 * Decides how far the top result can be trusted:
 *  - address: a mapped house/building;
 *  - street: the right street, in the customer's neighborhood (or the only one found);
 *  - multiple: the right street name, but it exists in several sectors;
 *  - area: nothing that matches the street, only places nearby.
 */
function classify(ranked, { street, neighborhood }) {
  const top = ranked[0];
  if (top.level === 'address') return 'address';
  if (top.level !== 'street') return 'area';
  // Nominatim is fuzzy ("Calle 999" can return "Calle 19"): the street number must appear in the result.
  const token = (street.match(/[0-9]+ ?[a-z]?(?![a-z0-9])/i)?.[0] ?? '').replace(/ /g, '').toLowerCase();
  if (token && !new RegExp(`(^|[^0-9a-z])${token}($|[^0-9a-z])`).test(plain(top.full))) return 'area';
  const inNeighborhood = neighborhood && plain(top.full).includes(plain(neighborhood).trim());
  const streets = ranked.filter((r) => r.level === 'street').length;
  return inNeighborhood || streets === 1 ? 'street' : 'multiple';
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => { const key = `${r.lat.toFixed(4)},${r.lng.toFixed(4)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}
