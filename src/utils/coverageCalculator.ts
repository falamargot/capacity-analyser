import { Coverage, SatelliteData } from '../types/satellites';
import { isPointInFootprint, STANDARD_RADIUS_KM, BACKHAUL_RADIUS_KM } from './leoFootprint';
import { EARTH_RADIUS_KM } from './capacityCalculator';
import { calculateGSOAvoidanceAngle } from './oneWebComb';
import { JulianDate } from 'cesium';

// Performance optimization: Cache coverage calculations to prevent expensive recomputation
// LRU bounded to MAX_COVERAGE_CACHE entries to prevent memory leaks on long sessions.
// 200 entries covers ~20 EUTELSAT GEO satellites (static, 1 entry each) plus ~180 LEO
// positions (0.1° precision key → ~180 distinct positions per orbital pass). Reducing
// from 500 cuts worst-case Coverage[] object retention by 60% with no observable hit-rate
// impact on typical usage patterns.
const MAX_COVERAGE_CACHE = 200;
const coverageCache = new Map<string, Coverage[]>();

export type CoverageClass = 'user' | 'backhaul' | 'gateway';

function addToCache(key: string, value: Coverage[]): void {
  if (coverageCache.size >= MAX_COVERAGE_CACHE) {
    // Map preserves insertion order — delete the oldest entry
    const firstKey = coverageCache.keys().next().value;
    if (firstKey !== undefined) coverageCache.delete(firstKey);
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
  // LEO precision: 0.1° ≈ 11 km — aligns with the 0.01° epsilon gate in App.tsx
  // giving ~10× better cache hit rate vs the previous 0.001° (toFixed(3)) precision.
  // EUTELSAT (GEO) uses a static key since their coverages never change.
  const cacheKey = satellite.type === 'EUTELSAT'
    ? `${satellite.id}_geo_static`
    : `${satellite.id}_${satellite.position.lat.toFixed(1)}_${satellite.position.lng.toFixed(1)}_${satellite.position.alt.toFixed(1)}`;

  // Return cached result if available
  if (coverageCache.has(cacheKey)) {
    return coverageCache.get(cacheKey)!;
  }

  const newcoverages: Coverage[] = [];
  // ONEWEB: build three concentric geodesic circles for triple-zone footprint
  // This avoids polar distortions that happen when drawing circles in a flat lat/lng space.
  // ONEWEB: build metadata-only features for "The Comb" visualization
  // The actual geometry is dynamic and rendered via CesiumGlobe using CallbackProperty
  if (satellite.type === 'ONEWEB') {
    // 1. Service Zone (37° elevation)
    newcoverages.push({
      name: `Service Zone`,
      feature: {
        type: 'Feature',
        properties: {
          satelliteId: satellite.name,
          name: 'Service Zone',
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

  // Check if satellite is in GSO exclusion zone (blanking zone)
  // If in blanking zone, satellite cannot provide any connectivity
  if (satellite.type === 'ONEWEB' && satellite.satrec) {
    try {
      const now = new Date();
      const time = JulianDate.fromDate(now);
      const { isBlankingZone } = calculateGSOAvoidanceAngle(satellite.satrec, time);
      
      if (isBlankingZone) {
        return []; // Satellite in exclusion zone, no connectivity available
      }
    } catch (error) {
      console.warn('Error checking GSO exclusion zone:', error);
      // Continue with normal processing if error occurs
    }
  }

  // ONEWEB coverage uses double-zone footprint model (nadir LEO footprint), not the GeoJSON beam polygons.
  if (satellite.type === 'ONEWEB') {
    const coverageClasses: CoverageClass[] = [];

    // Check standard coverage (inner circle) - 55° elevation (OneWeb contractual minimum)
    if (isPointInFootprint(point, { lat: satellite.position.lat, lng: satellite.position.lng }, STANDARD_RADIUS_KM)) {
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
