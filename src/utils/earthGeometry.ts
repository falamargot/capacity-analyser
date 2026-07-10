/**
 * earthGeometry.ts — zero-dependency spherical-Earth constants and helpers.
 *
 * Leaf module (no imports) so domain/data modules and Web Workers can use
 * great-circle math without dragging the satellite-service import graph
 * (which reaches browser APIs and the globe UI config) behind them.
 * capacityCalculator and leoFootprint re-export from here for their existing
 * import sites.
 */

/** Mean Earth radius (km) — spherical model used across the simulation. */
export const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lng points (km). */
export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lng);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_KM * c;
}
