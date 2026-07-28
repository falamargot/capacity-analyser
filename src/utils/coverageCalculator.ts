import { Coverage, SatelliteData } from '../types/satellites';
import { isPointInFootprint, TERMINAL_RF_RADIUS_KM, BACKHAUL_RADIUS_KM } from './leoFootprint';
import { EARTH_RADIUS_KM } from './capacityCalculator';

// Performance optimization: cache coverage calculations to prevent recomputation.
// LRU bounded to MAX_COVERAGE_CACHE entries so a long session cannot grow without limit.
//
// Sizing (corrected 2026-07-28 after browser heap measurement)
// -----------------------------------------------------------
// The working set is ONE entry per satellite, and the bundled constellation is
// 680 satellites (651 ONEWEB + ~29 EUTELSAT — `public/celestrak.txt`, 2040 TLE
// lines). The previous 200-entry bound was therefore about a third of the
// working set: every propagation tick touched all 680 satellites in sequence, so
// by the time satellite #1 was queried again, satellites #201..680 had already
// evicted it. The cache serviced essentially ZERO hits for the LEO population
// while still paying for key construction, Map.set and eviction on every call.
//
// Entries are small (ONEWEB stores two metadata-only Coverage objects with empty
// geometry), so covering the whole constellation with headroom costs a few
// hundred KB — far less than the per-tick garbage the thrashing produced.
const MAX_COVERAGE_CACHE = 1024;
const coverageCache = new Map<string, Coverage[]>();

export type CoverageClass = 'user' | 'backhaul' | 'gateway';

// Hit/miss/eviction counters. Cheap (three integers) and always on, so the
// cache's effectiveness is observable instead of assumed — the 200-entry
// undersizing above went unnoticed precisely because nothing measured it.
let cacheHits = 0;
let cacheMisses = 0;
let cacheEvictions = 0;

export interface CoverageCacheStats {
  entries: number;
  capacity: number;
  hits: number;
  misses: number;
  evictions: number;
  /** Fraction of lookups served from cache, 0..1. NaN before any lookup. */
  hitRate: number;
}

export function getCoverageCacheStats(): CoverageCacheStats {
  const lookups = cacheHits + cacheMisses;
  return {
    entries: coverageCache.size,
    capacity: MAX_COVERAGE_CACHE,
    hits: cacheHits,
    misses: cacheMisses,
    evictions: cacheEvictions,
    hitRate: lookups === 0 ? Number.NaN : cacheHits / lookups,
  };
}

export function resetCoverageCache(): void {
  coverageCache.clear();
  cacheHits = 0;
  cacheMisses = 0;
  cacheEvictions = 0;
}

function addToCache(key: string, value: Coverage[]): void {
  if (coverageCache.size >= MAX_COVERAGE_CACHE) {
    // Map preserves insertion order — delete the oldest entry
    const firstKey = coverageCache.keys().next().value;
    if (firstKey !== undefined) {
      coverageCache.delete(firstKey);
      cacheEvictions++;
    }
  }
  coverageCache.set(key, value);
}

// Fonction pour appliquer la projection azimutale équidistante
function projectPoint(lng: number, lat: number, centerLng: number, centerLat: number): [number, number] {
  return [centerLng + lng, centerLat + lat];
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function normalizeLng(lngDeg: number): number {
  // Normalize to [-180, 180]
  let x = ((lngDeg + 180) % 360 + 360) % 360 - 180;
  // Avoid -180 when we expect 180 for continuity
  if (x === -180) x = 180;
  return x;
}

export function destinationPoint(
  start: { lat: number; lng: number },
  bearingDeg: number,
  distanceKm: number
): { lat: number; lng: number } {
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lng);
  const θ = toRad(bearingDeg);
  const δ = distanceKm / EARTH_RADIUS_KM;

  const sinφ1 = Math.sin(φ1);
  const cosφ1 = Math.cos(φ1);
  const sinδ = Math.sin(δ);
  const cosδ = Math.cos(δ);

  const sinφ2 = sinφ1 * cosδ + cosφ1 * sinδ * Math.cos(θ);
  const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)));

  const y = Math.sin(θ) * sinδ * cosφ1;
  const x = cosδ - sinφ1 * Math.sin(φ2);
  const λ2 = λ1 + Math.atan2(y, x);

  return {
    lat: toDeg(φ2),
    lng: normalizeLng(toDeg(λ2)),
  };
}

// Performance optimization: Memoize coverage calculations with caching
export function calculateCoverages(satellite: SatelliteData): Coverage[] {
  // Cache keys must encode exactly what the RESULT depends on — no more.
  //
  // EUTELSAT (GEO): coverages never change → static key.
  //
  // ONEWEB: the branch below emits two metadata-only Coverage objects whose
  // geometry is deliberately empty (`coordinates: []`) because the real comb
  // geometry is generated per-frame by CesiumGlobe via CallbackProperty. The
  // only satellite field it reads is `name`. The result is therefore entirely
  // POSITION-INDEPENDENT, yet this key used to encode lat/lng/alt at 0.1°
  // precision — which a LEO satellite crosses every 1-2 seconds. That
  // manufactured a fresh cache key, a guaranteed miss and a fresh allocation
  // for all 651 ONEWEB satellites on every propagation tick, for a value that
  // was identical every time. Keying on identity alone makes it a hit.
  //
  // Any other type still keys on position, since those results do shift with it.
  const cacheKey = satellite.type === 'EUTELSAT'
    ? `${satellite.id}_geo_static`
    : satellite.type === 'ONEWEB'
      ? `${satellite.id}_oneweb_static`
      : `${satellite.id}_${satellite.position.lat.toFixed(1)}_${satellite.position.lng.toFixed(1)}_${satellite.position.alt.toFixed(1)}`;

  // Return cached result if available
  const cached = coverageCache.get(cacheKey);
  if (cached !== undefined) {
    cacheHits++;
    return cached;
  }
  cacheMisses++;

  const newcoverages: Coverage[] = [];
  // ONEWEB: build three concentric geodesic circles for triple-zone footprint
  // This avoids polar distortions that happen when drawing circles in a flat lat/lng space.
  // ONEWEB: build metadata-only features for "The Comb" visualization
  // The actual geometry is dynamic and rendered via CesiumGlobe using CallbackProperty
  if (satellite.type === 'ONEWEB') {
    // 1. Guaranteed service zone (55° elevation marker)
    newcoverages.push({
      name: `Guaranteed service zone`,
      feature: {
        type: 'Feature',
        properties: {
          satelliteId: satellite.name,
          name: 'Guaranteed service zone',
          type: 'ONEWEB_SERVICE_ZONE',
          coverageType: 'service'
        } as any,
        geometry: {
          type: 'Polygon',
          coordinates: [], // Empty, handled dynamically
        },
      },
    });

    // 2. Backhaul area (Outer beams)
    newcoverages.push({
      name: `Backhaul area`,
      feature: {
        type: 'Feature',
        properties: {
          satelliteId: satellite.name,
          name: 'Backhaul area',
          type: 'ONEWEB_SWATH',
          coverageType: 'standard'
        } as any,
        geometry: {
          type: 'Polygon',
          coordinates: [], // Empty, handled dynamically
        },
      },
    });

    // Performance optimization: Cache the result (LRU bounded to MAX_COVERAGE_CACHE)
    addToCache(cacheKey, newcoverages);

    return newcoverages;
  }

  // Update each coverage's geometry based on the new satellite position
  if (satellite.referenced_coverages) {
    satellite.referenced_coverages.features.forEach((feature) => {
      if (!feature.geometry || feature.geometry.type !== 'Polygon') return;

      const ring = feature.geometry.coordinates[0] as unknown as [number, number][];
      const shiftedCoordinates = satellite.type === 'EUTELSAT'
        ? ring
        : ring.map((coord) => {
          const [lng, lat] = coord;
          return projectPoint(lng, lat, satellite.position.lng, satellite.position.lat);
        });

      const properties = {
        ...(feature.properties ?? {}),
        satelliteId: satellite.name,
      } as any;

      // Create a new coverage object with shifted coordinates
      newcoverages.push({
        name: satellite.name + ' - ' + (properties as any).name,
        feature: {
          type: 'Feature',
          properties,
          geometry: {
            type: 'Polygon',
            coordinates: [shiftedCoordinates]
          }
        }
      });
    });
  }
  if (satellite.type === 'EUTELSAT') {
    addToCache(cacheKey, newcoverages);
  }
  return newcoverages;
}

function isPointInPolygon(point: { lat: number; lng: number }, polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

export function isPointInCoverage(
  point: { lat: number; lng: number; } | null,
  satellite: SatelliteData,
  satellitePosition: { lat: number; lng: number; alt: number; isPositionValid?: boolean } | null
): CoverageClass[] {
  if (!point) return [];

  // A satellite whose SGP4 propagation failed must not contribute any coverage.
  // isPositionValid === false means the position is (0,0,0) — the Gulf of Guinea — not real.
  if (satellite.position.isPositionValid === false) return [];
  if (satellitePosition !== null && satellitePosition.isPositionValid === false) return [];

  // ONEWEB coverage uses double-zone footprint model (nadir LEO footprint), not the GeoJSON beam polygons.
  if (satellite.type === 'ONEWEB') {
    const coverageClasses: CoverageClass[] = [];

    // Check user RF eligibility (40° elevation). 55° remains the guaranteed-zone marker.
    if (isPointInFootprint(point, { lat: satellite.position.lat, lng: satellite.position.lng }, TERMINAL_RF_RADIUS_KM)) {
      coverageClasses.push('user', 'backhaul');
    }
    // Check backhaul coverage (outer circle) - 15° elevation
    else if (isPointInFootprint(point, { lat: satellite.position.lat, lng: satellite.position.lng }, BACKHAUL_RADIUS_KM)) {
      coverageClasses.push('backhaul');
    }

    return coverageClasses;
  }

  // Calculate relative position of the point with respect to satellite position
  const relativePoint = {
    lat: point.lat + satellite.position.lat - (satellitePosition?.lat ?? satellite.position.lat),
    lng: point.lng + satellite.position.lng - (satellitePosition?.lng ?? satellite.position.lng)
  };

  const coverageClasses: CoverageClass[] = [];
  satellite.coverages.forEach((coverage) => {
    const geometry = coverage.feature?.geometry;
    if (geometry && geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0] as unknown as number[][];
      if (isPointInPolygon(relativePoint, ring)) {
        coverageClasses.push('user');
      }
    }
  });
  return coverageClasses;
}
