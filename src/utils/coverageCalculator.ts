import { Coverage, SatelliteData } from '../types/satellites';
import { isPointInFootprint, STANDARD_RADIUS_KM, BACKHAUL_RADIUS_KM } from './leoFootprint';
import { EARTH_RADIUS_KM } from './capacityCalculator';

// Performance optimization: Cache coverage calculations to prevent expensive recomputation
const coverageCache = new Map<string, Coverage[]>();

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
  // Performance optimization: Create cache key based on satellite state
  const cacheKey = `${satellite.id}_${satellite.position.lat.toFixed(3)}_${satellite.position.lng.toFixed(3)}_${satellite.position.alt.toFixed(3)}`;

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
    // 1. Service area (Center beams)
    newcoverages.push({
      name: `Service area`,
      feature: {
        type: 'Feature',
        properties: {
          satelliteId: satellite.name,
          name: 'Service area',
          type: 'ONEWEB_PREMIUM',
          coverageType: 'premium'
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

    // Performance optimization: Cache the result
    coverageCache.set(cacheKey, newcoverages);

    // Performance optimization: Limit cache size to prevent memory leaks
    if (coverageCache.size > 100) {
      const firstKey = coverageCache.keys().next().value;
      if (firstKey) {
        coverageCache.delete(firstKey);
      }
    }

    return newcoverages;
  }

  // Update each coverage's geometry based on the new satellite position
  if (satellite.referenced_coverages) {
    satellite.referenced_coverages.features.forEach((feature) => {
      if (!feature.geometry || feature.geometry.type !== 'Polygon') return;

      const ring = feature.geometry.coordinates[0] as unknown as [number, number][];
      const shiftedCoordinates = ring.map((coord) => {
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
  satellitePosition: { lat: number; lng: number; alt: number; } | null
): number[] {
  if (!point) return [];

  // ONEWEB coverage uses double-zone footprint model (nadir LEO footprint), not the GeoJSON beam polygons.
  if (satellite.type === 'ONEWEB') {
    const indices = [];

    // Check standard coverage (inner circle) - 37° elevation
    if (isPointInFootprint(point, { lat: satellite.position.lat, lng: satellite.position.lng }, STANDARD_RADIUS_KM)) {
      indices.push(0); // Standard coverage index
    }
    // Check backhaul coverage (outer circle) - 15° elevation
    else if (isPointInFootprint(point, { lat: satellite.position.lat, lng: satellite.position.lng }, BACKHAUL_RADIUS_KM)) {
      indices.push(1); // Backhaul coverage index
    }

    return indices;
  }

  // Calculate relative position of the point with respect to satellite position
  const relativePoint = {
    lat: point.lat + satellite.position.lat - (satellitePosition?.lat ?? satellite.position.lat),
    lng: point.lng + satellite.position.lng - (satellitePosition?.lng ?? satellite.position.lng)
  };

  const index = [] as number[];
  satellite.coverages.forEach((coverage, idx) => {
    const geometry = coverage.feature?.geometry;
    if (geometry && geometry.type === 'Polygon') {
      const ring = geometry.coordinates[0] as unknown as number[][];
      if (isPointInPolygon(relativePoint, ring)) {
        index.push(idx);
      }
    }
  });
  return index;
}
