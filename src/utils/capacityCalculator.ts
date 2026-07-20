import { SatelliteData } from '../types/satellites';
import type { GeoCapacityEstimate } from './geoCapacityModel';

// Earth radius constant
// Canonical constant lives in earthGeometry.ts (zero-dep leaf); re-exported here
// for the many existing import sites.
import { EARTH_RADIUS_KM } from './earthGeometry';
export { EARTH_RADIUS_KM } from './earthGeometry';

// Free-space propagation speed for electromagnetic waves (km/s).
// The 0.97 velocity factor applies to guided media (coaxial, fiber) — NOT to free-space radio.
export const SPEED_OF_LIGHT_RADIO_KM_S = 299792.458;

// Calculate one-way latency in milliseconds from distance in kilometers
export function computeOneWayLatencyMs(distanceKm: number): number {
  return Math.round((distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000);
}

// 2D distance calculation (surface distance)
export const computeDistanceKm = (point1: { lat: number; lng: number }, point2: { lat: number; lng: number }): number => {
  const R = EARTH_RADIUS_KM;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLon = (point2.lng - point1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// 3D distance calculation accounting for Earth's curvature
export const compute3DDistanceKm = (
  point1: { lat: number; lng: number; alt?: number },
  point2: { lat: number; lng: number; alt?: number }
): number => {
  // WGS‑84 constants (km)
  const A = 6378.137;
  const F = 1 / 298.257223563;
  const E2 = 2 * F - F * F;
  const DEG_TO_RAD = Math.PI / 180;

  function toECEF(p: { lat: number; lng: number; alt?: number }): [number, number, number] {
    const lat = p.lat * DEG_TO_RAD;
    const lon = p.lng * DEG_TO_RAD;
    const alt = p.alt ?? 0;

    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);

    const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);

    const x = (N + alt) * cosLat * Math.cos(lon);
    const y = (N + alt) * cosLat * Math.sin(lon);
    const z = (N * (1 - E2) + alt) * sinLat;

    return [x, y, z];
  }

  const [x1, y1, z1] = toECEF(point1);
  const [x2, y2, z2] = toECEF(point2);

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = z2 - z1;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export interface RealTimeCapacityData {
  /**
   * Gbps visible from this point.
   * For LEO: terminal peak throughput (≤ 0.2 Gbps), not satellite aggregate (7.2 Gbps).
   * For GEO: feasibility-level payload class capacity, not a transponder loading plan.
   * Do NOT display this as "network capacity" — it is a per-terminal estimate for LEO.
   */
  totalCapacity: number;
  coveredSatellites: SatelliteData[];
  geoCapacityEstimates?: GeoCapacityEstimate[];
  elevationAngle?: number;
  /**
   * True when the LEO contribution to totalCapacity is a terminal peak estimate
   * (not the satellite aggregate). Always true for OneWeb when a point is selected.
   */
  leoCapacityIsTerminalPeak: boolean;
  /** True when at least one OneWeb satellite currently covers this point. */
  hasLeoCoverage: boolean;
}

// Calculate elevation angle between ground point and satellite
export const calculateElevationAngle = (
  point: { lat: number; lng: number; altitude?: number },
  satellite: SatelliteData
): number => {
  // WGS-84 constants (km)
  const A = 6378.137;
  const F = 1 / 298.257223563;
  const E2 = 2 * F - F * F;

  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;

  const userAltKm = point.altitude ?? 0;

  const lat = point.lat * degToRad;
  const lon = point.lng * degToRad;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  const N = A / Math.sqrt(1 - E2 * sinLat * sinLat);

  const xg = (N + userAltKm) * cosLat * cosLon;
  const yg = (N + userAltKm) * cosLat * sinLon;
  const zg = (N * (1 - E2) + userAltKm) * sinLat;

  // Satellite position
  const satLat = satellite.position.lat * degToRad;
  const satLon = satellite.position.lng * degToRad;
  const satAlt = satellite.position.alt; // km

  const sinSatLat = Math.sin(satLat);
  const cosSatLat = Math.cos(satLat);
  const sinSatLon = Math.sin(satLon);
  const cosSatLon = Math.cos(satLon);

  const Ns = A / Math.sqrt(1 - E2 * sinSatLat * sinSatLat);

  const xs = (Ns + satAlt) * cosSatLat * cosSatLon;
  const ys = (Ns + satAlt) * cosSatLat * sinSatLon;
  const zs = (Ns * (1 - E2) + satAlt) * sinSatLat;

  // Line-of-sight vector (ECEF)
  const dx = xs - xg;
  const dy = ys - yg;
  const dz = zs - zg;

  // ECEF -> ENU
  const east  = -sinLon * dx + cosLon * dy;
  const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
  const up    =  cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

  // Elevation angle
  const elevationRad = Math.atan2(up, Math.sqrt(east * east + north * north));

  return elevationRad * radToDeg;
};

