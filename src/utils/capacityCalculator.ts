import { SatelliteData } from '../types/satellites';
import type { GeoCapacityEstimate } from './geoCapacityModel';

// Earth radius constant
// Canonical constant lives in earthGeometry.ts (zero-dep leaf); re-exported here
// for the many existing import sites.
import { EARTH_RADIUS_KM } from './earthGeometry';
import { elevationAngleDeg, slantRangeKm } from './wgs84Geometry';
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

/**
 * 3-D straight-line distance between two points, on the WGS84 ellipsoid.
 *
 * `alt` is kilometres above the ELLIPSOID — the convention `eciToGeodetic`
 * returns. Delegates to the shared model (Phase 3); this used to carry its own
 * copy of the ellipsoid constants and conversion.
 *
 * Verified against NASA GMAT R2026a to 0.6 m over 1197-3146 km slant ranges:
 * `__tests__/engGmatSiteGeometry.test.ts`.
 */
export const compute3DDistanceKm = (
  point1: { lat: number; lng: number; alt?: number },
  point2: { lat: number; lng: number; alt?: number }
): number => slantRangeKm(
  { latDeg: point1.lat, lonDeg: point1.lng, altKm: point1.alt ?? 0 },
  { latDeg: point2.lat, lonDeg: point2.lng, altKm: point2.alt ?? 0 },
);

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

/**
 * Topocentric elevation angle from a ground point to a satellite, degrees.
 *
 * `satellite.position.alt` is kilometres above the WGS84 ellipsoid, which is
 * what `eciToGeodetic` returns — so the ellipsoid, not the 6371 km coverage
 * sphere, is the correct model here. Delegates to the shared model (Phase 3);
 * this used to carry its own copy of the constants, the ECEF conversion and the
 * ENU rotation.
 *
 * Verified against NASA GMAT R2026a to 7.2e-6 deg across three latitudes from
 * the equator to 78 N: `__tests__/engGmatSiteGeometry.test.ts`.
 */
export const calculateElevationAngle = (
  point: { lat: number; lng: number; altitude?: number },
  satellite: SatelliteData
): number => elevationAngleDeg(
  { latDeg: point.lat, lonDeg: point.lng, altKm: point.altitude ?? 0 },
  {
    latDeg: satellite.position.lat,
    lonDeg: satellite.position.lng,
    altKm: satellite.position.alt,
  },
);

