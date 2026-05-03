import type { Feature, Geometry as GeoJsonGeometry, GeoJsonProperties } from 'geojson';
import { isPointInPolygon } from './geoUtils';

const DEFAULT_MAX_SEGMENT_DEGREES = 2.5;
const COVERAGE_LOD_NEAR_MAX_HEIGHT_M = 2_500_000;
const COVERAGE_LOD_MEDIUM_MAX_HEIGHT_M = 10_000_000;

export type CoverageGeometryLod = 'near' | 'medium' | 'far';

// ─── Great-circle interpolation helpers ──────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** Convert (lng°, lat°) → unit ECEF vector [x, y, z]. */
const llaToUnitXyz = (lngDeg: number, latDeg: number): [number, number, number] => {
  const lat = latDeg * DEG_TO_RAD;
  const lng = lngDeg * DEG_TO_RAD;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lng), cosLat * Math.sin(lng), Math.sin(lat)];
};

/** Convert unit ECEF vector → [lng°, lat°]. */
const unitXyzToLla = (x: number, y: number, z: number): [number, number] => {
  // Clamp z to [-1, 1] to guard floating-point overshoot at the poles.
  const lat = Math.asin(Math.max(-1, Math.min(1, z))) * RAD_TO_DEG;
  const lng = Math.atan2(y, x) * RAD_TO_DEG;
  return [lng, lat];
};

/**
 * Spherical linear interpolation (SLERP) between two unit vectors.
 * Produces the great-circle intermediate point at parameter t ∈ [0, 1].
 * Falls back to linear interpolation when the two points are coincident
 * (ω < 1 × 10⁻¹⁰ rad) to avoid division by zero.
 */
const slerpUnitXyz = (
  p1: [number, number, number],
  p2: [number, number, number],
  t: number,
): [number, number, number] => {
  const dot = Math.max(-1, Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
  const omega = Math.acos(dot);
  if (omega < 1e-10) {
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]), p1[2] + t * (p2[2] - p1[2])];
  }
  const sinOmega = Math.sin(omega);
  const k1 = Math.sin((1 - t) * omega) / sinOmega;
  const k2 = Math.sin(t * omega) / sinOmega;
  return [k1 * p1[0] + k2 * p2[0], k1 * p1[1] + k2 * p2[1], k1 * p1[2] + k2 * p2[2]];
};

// ─────────────────────────────────────────────────────────────────────────────

const normalizeLongitude = (lng: number): number => {
  if (!Number.isFinite(lng)) return lng;

  let normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180 && lng > 0) {
    normalized = 180;
  }

  return normalized;
};


export const densifyRingForGlobe = (
  ring: number[][],
  maxSegmentDegrees: number = DEFAULT_MAX_SEGMENT_DEGREES
): number[][] => {
  if (ring.length < 2 || !Number.isFinite(maxSegmentDegrees) || maxSegmentDegrees <= 0) {
    return ring;
  }

  const densified: number[][] = [];

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];

    if (!Array.isArray(current) || current.length < 2 || !Array.isArray(next) || next.length < 2) {
      continue;
    }

    const [currentLng, currentLat] = current;
    const [nextLng, nextLat] = next;

    densified.push([currentLng, currentLat]);

    const p1 = llaToUnitXyz(currentLng, currentLat);
    const p2 = llaToUnitXyz(nextLng, nextLat);
    const dot = Math.max(-1, Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
    const arcDegrees = Math.acos(dot) * RAD_TO_DEG;
    const segments = Math.ceil(arcDegrees / maxSegmentDegrees);

    if (segments > 1) {
      for (let step = 1; step < segments; step += 1) {
        const t = step / segments;
        const [intLng, intLat] = unitXyzToLla(...slerpUnitXyz(p1, p2, t));
        densified.push([normalizeLongitude(intLng), intLat]);
      }
    }
  }

  return densified;
};

export const getCoverageGeometryLod = (cameraHeightMeters: number | null | undefined): CoverageGeometryLod => {
  if (!Number.isFinite(cameraHeightMeters)) return 'medium';
  if (cameraHeightMeters <= COVERAGE_LOD_NEAR_MAX_HEIGHT_M) return 'near';
  if (cameraHeightMeters <= COVERAGE_LOD_MEDIUM_MAX_HEIGHT_M) return 'medium';
  return 'far';
};

export const getCoverageMaxSegmentDegreesForLod = (lod: CoverageGeometryLod): number => {
  if (lod === 'near') return 1.25;
  if (lod === 'far') return 3.75;
  return DEFAULT_MAX_SEGMENT_DEGREES;
};

export const getMaxWrappedRingStep = (ring: number[][]): number => {
  if (ring.length < 2) return 0;

  let maxStep = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!Array.isArray(current) || current.length < 2 || !Array.isArray(next) || next.length < 2) {
      continue;
    }

    const p1 = llaToUnitXyz(current[0], current[1]);
    const p2 = llaToUnitXyz(next[0], next[1]);
    const dot = Math.max(-1, Math.min(1, p1[0] * p2[0] + p1[1] * p2[1] + p1[2] * p2[2]));
    maxStep = Math.max(maxStep, Math.acos(dot) * RAD_TO_DEG);
  }

  return maxStep;
};

const getPolygonOuterRing = (
  feature: Feature<GeoJsonGeometry, GeoJsonProperties>
): number[][] | null => {
  if (feature.geometry?.type !== 'Polygon') return null;

  const ring = feature.geometry.coordinates?.[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;

  return ring
    .filter((coordinate): coordinate is number[] => (
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1])
    ))
    .map(([lng, lat]) => [lng, lat]);
};

const trimClosedRing = (ring: number[][]): number[][] => {
  if (ring.length < 2) return ring;

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) {
    return ring.slice(0, -1);
  }

  return ring;
};

const isRingContainedByRing = (innerRing: number[][], outerRing: number[][]): boolean => {
  const normalizedInner = trimClosedRing(innerRing);
  const normalizedOuter = trimClosedRing(outerRing);
  if (normalizedInner.length < 3 || normalizedOuter.length < 3) return false;

  return normalizedInner.every(([lng, lat]) => isPointInPolygon({ lat, lng }, normalizedOuter));
};

export const getOutermostCoverageFeatures = (
  features: Feature<GeoJsonGeometry, GeoJsonProperties>[]
): Feature<GeoJsonGeometry, GeoJsonProperties>[] => {
  if (features.length <= 1) return features;

  return features.filter((candidate, candidateIndex) => {
    const candidateRing = getPolygonOuterRing(candidate);
    if (!candidateRing) return false;

    return !features.some((other, otherIndex) => {
      if (candidateIndex === otherIndex) return false;

      const otherRing = getPolygonOuterRing(other);
      if (!otherRing) return false;

      return isRingContainedByRing(candidateRing, otherRing);
    });
  });
};
