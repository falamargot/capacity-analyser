import type { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { GEO_GATEWAYS, type GeoGatewayData } from '../components/globe/GlobeConfig';
import type { CandidateCoverage } from '../types/analysis';
import type { Coverage, SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { analyzeGeoConnectivity, type GeoConnectivityResult } from './geoConnectivityModel';
import { isPointInPolygon } from './geoUtils';

interface Point {
  lat: number;
  lng: number;
}

export interface ResolvedCandidateCoverage {
  satellite: SatelliteData;
  beam: Coverage;
}

export interface GeoConnectivitySelectionResult {
  candidate: CandidateCoverage;
  satellite: SatelliteData;
  beam: Coverage;
  geometry: GeoConnectivityResult;
  elevation: number;
  distance: number;
  rtt: number | null;
}

const clamp = (value: number, min: number, max: number): number => {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
};

const toRadians = (value: number): number => value * (Math.PI / 180);

const haversineDistanceKm = (a: Point, b: Point): number => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const root = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(root), Math.sqrt(1 - root));
};

const getCoverageRing = (coverage: Coverage): number[][] | null => {
  if (coverage.feature?.geometry?.type !== 'Polygon') return null;
  return coverage.feature.geometry.coordinates[0] as unknown as number[][];
};

const getCoverageCentroid = (ring: number[][]): Point => {
  let twiceArea = 0;
  let centroidLng = 0;
  let centroidLat = 0;

  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    const cross = x1 * y2 - x2 * y1;
    twiceArea += cross;
    centroidLng += (x1 + x2) * cross;
    centroidLat += (y1 + y2) * cross;
  }

  if (Math.abs(twiceArea) < 1e-8) {
    const pointCount = ring.length || 1;
    const [lngSum, latSum] = ring.reduce<[number, number]>(
      (acc, [lng, lat]) => [acc[0] + lng, acc[1] + lat],
      [0, 0]
    );

    return {
      lng: lngSum / pointCount,
      lat: latSum / pointCount,
    };
  }

  return {
    lng: centroidLng / (3 * twiceArea),
    lat: centroidLat / (3 * twiceArea),
  };
};

const getCoverageProperties = (coverage: Coverage): Record<string, unknown> => (
  (coverage.feature?.properties as Record<string, unknown> | undefined) ?? {}
);

const getBeamIdFromParts = (rawName: string, mission?: string): string => (
  mission ? `${mission}::${rawName}` : rawName
);

export const getCoverageBeamId = (coverage: Coverage): string => {
  const properties = getCoverageProperties(coverage);
  const rawName = String(properties.name ?? coverage.name ?? '');
  const mission = typeof properties.mission === 'string' ? properties.mission : undefined;
  return getBeamIdFromParts(rawName, mission);
};

export const getCoverageBeamName = (coverage: Coverage): string => {
  const properties = getCoverageProperties(coverage);
  const rawName = String(properties.name ?? coverage.name ?? 'Unknown beam');
  const mission = typeof properties.mission === 'string' ? properties.mission.trim() : '';

  if (!mission) return rawName;
  return `${mission}-${rawName}`;
};

const getFeatureBeamId = (feature: Feature<Geometry, GeoJsonProperties>): string | null => {
  const properties = (feature.properties as Record<string, unknown> | undefined) ?? {};
  const rawName = properties.name;
  if (typeof rawName !== 'string' && typeof rawName !== 'number') {
    return null;
  }

  const mission = typeof properties.mission === 'string' ? properties.mission : undefined;
  return getBeamIdFromParts(String(rawName), mission);
};

export const getCandidateCoverageKey = (
  candidate: Pick<CandidateCoverage, 'satelliteName' | 'beamId'>
): string => `${candidate.satelliteName}::${candidate.beamId}`;

export const getFeatureCandidateCoverageKey = (
  feature: Feature<Geometry, GeoJsonProperties>
): string | null => {
  const satelliteName = feature.properties?.satelliteId;
  const beamId = getFeatureBeamId(feature);

  if (typeof satelliteName !== 'string' || !beamId) {
    return null;
  }

  return `${satelliteName}::${beamId}`;
};

const getBeamDistanceMetrics = (
  userPoint: Point,
  coverage: Coverage
): { distanceKm: number; normalizedDistance: number } | null => {
  const ring = getCoverageRing(coverage);
  if (!ring || ring.length === 0) return null;

  const centroid = getCoverageCentroid(ring);
  const distanceKm = haversineDistanceKm(userPoint, centroid);
  const maxDistanceKm = Math.max(
    ...ring.map(([lng, lat]) => haversineDistanceKm(centroid, { lat, lng })),
    1
  );

  return {
    distanceKm,
    normalizedDistance: clamp(distanceKm / maxDistanceKm, 0, 1),
  };
};

export const findCandidateCoverages = (
  userPoint: Point,
  satellites: SatelliteData[]
): CandidateCoverage[] => {
  const candidates: CandidateCoverage[] = [];

  for (const satellite of satellites) {
    if (satellite.orbitType !== 'GEO' || !satellite.coverages?.length) continue;

    const elevation = calculateElevationAngle(userPoint, satellite);
    if (elevation <= 0) continue;

    for (const coverage of satellite.coverages) {
      const ring = getCoverageRing(coverage);
      if (!ring || !isPointInPolygon(userPoint, ring)) continue;

      const beamMetrics = getBeamDistanceMetrics(userPoint, coverage);
      if (!beamMetrics) continue;

      const throughputEstimate = satellite.capacity.maxThroughput * (0.35 + (0.65 * (1 - beamMetrics.normalizedDistance)));

      candidates.push({
        satelliteId: satellite.id,
        satelliteName: satellite.name,
        beamId: getCoverageBeamId(coverage),
        beamName: getCoverageBeamName(coverage),
        elevation,
        distanceFromBeamCenter: beamMetrics.distanceKm,
        throughputEstimate,
        score: 0,
      });
    }
  }

  return candidates;
};

export const rankCandidateCoverages = (
  candidates: CandidateCoverage[]
): CandidateCoverage[] => {
  if (candidates.length === 0) return [];

  const maxDistance = Math.max(...candidates.map((candidate) => candidate.distanceFromBeamCenter), 0);
  const maxThroughput = Math.max(...candidates.map((candidate) => candidate.throughputEstimate), 0);

  return candidates
    .map((candidate) => {
      const elevationScore = clamp(candidate.elevation / 90, 0, 1);
      const normalizedDistance = maxDistance > 0
        ? clamp(candidate.distanceFromBeamCenter / maxDistance, 0, 1)
        : 0;
      const beamCenterScore = clamp(1 - normalizedDistance, 0, 1);
      const throughputScore = maxThroughput > 0
        ? clamp(candidate.throughputEstimate / maxThroughput, 0, 1)
        : 0;

      return {
        ...candidate,
        score: (0.4 * elevationScore) + (0.3 * beamCenterScore) + (0.3 * throughputScore),
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const resolveCandidateCoverage = (
  candidate: CandidateCoverage | null,
  satellites: SatelliteData[]
): ResolvedCandidateCoverage | null => {
  if (!candidate) return null;

  const satellite = satellites.find((entry) => entry.id === candidate.satelliteId);
  if (!satellite) return null;

  const beam = satellite.coverages.find((coverage) => getCoverageBeamId(coverage) === candidate.beamId);
  if (!beam) return null;

  return { satellite, beam };
};

export const computeGeoConnectivity = (
  selectedCoverage: CandidateCoverage | null,
  userPoint: { lat: number; lng: number; altitude?: number },
  satellites: SatelliteData[],
  gateways: GeoGatewayData[] = GEO_GATEWAYS
): GeoConnectivitySelectionResult | null => {
  const resolved = resolveCandidateCoverage(selectedCoverage, satellites);
  if (!resolved) return null;

  const geometry = analyzeGeoConnectivity({
    userPoint,
    satellite: resolved.satellite,
    gateways,
  });

  return {
    candidate: selectedCoverage!,
    satellite: resolved.satellite,
    beam: resolved.beam,
    geometry,
    elevation: geometry.userToSatellite.elevationDeg,
    distance: geometry.userToSatellite.slantRangeKm,
    rtt: geometry.rttTotalMs ?? null,
  };
};
