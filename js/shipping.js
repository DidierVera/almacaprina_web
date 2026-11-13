// Domicilio según los km de ruta desde el punto de partida.

const R = 6371; // radio terrestre, km

export function haversineKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Distancia por carretera con OSRM (servicio público y gratuito, apto para bajo volumen).
 * Si falla o tarda, devuelve una estimación (distancia recta × roadFactor) marcada como `estimated`.
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
    if (typeof meters !== 'number') throw new Error('Sin ruta');
    return { km: meters / 1000, estimated: false };
  } catch {
    return { km: haversineKm(origin, dest) * roadFactor, estimated: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Tarifa para `km`. `covered:false` si excede la cobertura. */
export function feeForKm(km, shipping) {
  if (km > shipping.maxKm) return { covered: false, fee: null };
  const tier = shipping.tiers.find((t) => km <= t.upToKm) ?? shipping.tiers.at(-1);
  return { covered: true, fee: tier.fee };
}
