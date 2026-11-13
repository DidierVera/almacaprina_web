// Shipping fee based on road km from the origin point.

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a, b) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Driving distance via OSRM (free public service, fine for low volume).
 * If it fails or times out, returns an estimate (straight line × roadFactor) flagged `estimated`.
 */
export async function roadKm(origin, dest, { roadFactor = 1.35, timeoutMs = 6000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = await res.json();
    const meters = data.routes?.[0]?.distance;
    if (typeof meters !== 'number') throw new Error('No route');
    return { km: meters / 1000, estimated: false };
  } catch {
    return { km: haversineKm(origin, dest) * roadFactor, estimated: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Fee for `km`. `covered: false` when beyond the coverage limit. */
export function feeForKm(km, shipping) {
  if (km > shipping.maxKm) return { covered: false, fee: null };
  const tier = shipping.tiers.find((t) => km <= t.upToKm) ?? shipping.tiers.at(-1);
  return { covered: true, fee: tier.fee };
}
