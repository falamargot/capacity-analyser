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

export interface ResolvedCoverageSelection {
  satellite: SatelliteData;
  beams: Coverage[];
  primaryBeam: Coverage;
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

const getRawCoverageValue = (properties: Record<string, unknown>, fallbackName?: string): string => {
  const name = properties.name;
  if (typeof name === 'string' || typeof name === 'number') {
    const value = String(name).trim();
    if (value) return value;
  }

  const contour = properties.contour;
  if (typeof contour === 'string' || typeof contour === 'number') {
    const value = String(contour).trim();
    if (value) return value;
  }

  return fallbackName?.trim() || 'Unknown coverage';
};

const getRawBeamValue = (properties: Record<string, unknown>, fallbackName?: string): string => {
  const contour = properties.contour;
  if (typeof contour === 'string' || typeof contour === 'number') {
    const value = String(contour).trim();
    if (value) return value;
  }

  const name = properties.name;
  if (typeof name === 'string' || typeof name === 'number') {
    const value = String(name).trim();
    if (value) return value;
  }

  return fallbackName?.trim() || 'Unknown beam';
};

export const getCoverageMissionName = (coverage: Coverage): string => {
  const properties = getCoverageProperties(coverage);
  return typeof properties.mission === 'string' ? properties.mission.trim() : '';
};

export const getCoverageDisplayName = (coverage: Coverage): string => {
  const properties = getCoverageProperties(coverage);
  return getRawCoverageValue(properties, coverage.name);
};

export const getCoverageBeamName = (coverage: Coverage): string => {
  const properties = getCoverageProperties(coverage);
  return getRawBeamValue(properties, coverage.name);
};

const getIdFromParts = (rawName: string, mission?: string): string => (
  mission ? `${mission}::${rawName}` : rawName
);

export const getCoverageGroupId = (coverage: Coverage): string => {
  const rawName = getCoverageDisplayName(coverage);
  const mission = getCoverageMissionName(coverage) || undefined;
  return getIdFromParts(rawName, mission);
};

export const getCoverageBeamId = (coverage: Coverage): string => {
  const rawName = getCoverageBeamName(coverage);
  const mission = getCoverageMissionName(coverage) || undefined;
  return getIdFromParts(rawName, mission);
};

const getFeatureMissionName = (properties: Record<string, unknown>): string | undefined => {
  const mission = properties.mission;
  if (typeof mission !== 'string') return undefined;
  const value = mission.trim();
  return value || undefined;
};

const getFeatureCoverageGroupId = (feature: Feature<Geometry, GeoJsonProperties>): string | null => {
  const properties = (feature.properties as Record<string, unknown> | undefined) ?? {};
  const rawName = getRawCoverageValue(properties);
  if (!rawName) return null;

  return getIdFromParts(rawName, getFeatureMissionName(properties));
};

const getFeatureBeamId = (feature: Feature<Geometry, GeoJsonProperties>): string | null => {
  const properties = (feature.properties as Record<string, unknown> | undefined) ?? {};
  const rawName = getRawBeamValue(properties);
  if (!rawName) return null;

  return getIdFromParts(rawName, getFeatureMissionName(properties));
};

export const getFeatureBeamCoverageKey = (
  feature: Feature<Geometry, GeoJsonProperties>
): string | null => {
  const satelliteName = feature.properties?.satelliteId;
  const beamId = getFeatureBeamId(feature);

  if (typeof satelliteName !== 'string' || !beamId) {
    return null;
  }

  return `${satelliteName}::${beamId}`;
};

export const getCandidateCoverageKey = (
  candidate: Pick<CandidateCoverage, 'satelliteName' | 'coverageKey'>
): string => `${candidate.satelliteName}::${candidate.coverageKey}`;

export const getFeatureCandidateCoverageKey = (
  feature: Feature<Geometry, GeoJsonProperties>
): string | null => {
  const satelliteName = feature.properties?.satelliteId;
  const coverageKey = getFeatureCoverageGroupId(feature);

  if (typeof satelliteName !== 'string' || !coverageKey) {
    return null;
  }

  return `${satelliteName}::${coverageKey}`;
};

const getBeamDistanceMetrics = (
  userPoint: Point,
  coverage: Coverage
): { distanceKm: number; normalizedDistance: number } | null => {
  const ring = getCoverageRing(coverage);
  if (!ring || ring.length === 0) return null;

  const centroid = getCoverageCentroid(ring);
  const distanceKm = haversineDistanceKm(userPoint, centroid);

  // Loop instead of Math.max(...ring.map(...)) to avoid:
  //   1. O(n) temporary array allocation per candidate
  //   2. Potential call-stack overflow on large rings (spread of 500+ args)
  let maxDistanceKm = 1;
  for (const [lng, lat] of ring) {
    const d = haversineDistanceKm(centroid, { lat, lng });
    if (d > maxDistanceKm) maxDistanceKm = d;
  }

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
        missionName: getCoverageMissionName(coverage),
        coverageKey: getCoverageGroupId(coverage),
        coverageName: getCoverageDisplayName(coverage),
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

export const resolveCoverageSelection = (
  candidate: CandidateCoverage | null,
  satellites: SatelliteData[]
): ResolvedCoverageSelection | null => {
  if (!candidate) return null;

  const satellite = satellites.find((entry) => entry.id === candidate.satelliteId);
  if (!satellite) return null;

  const beams = satellite.coverages.filter((coverage) => getCoverageGroupId(coverage) === candidate.coverageKey);
  if (beams.length === 0) return null;

  const primaryBeam = beams.find((coverage) => getCoverageBeamId(coverage) === candidate.beamId) ?? beams[0];
  return { satellite, beams, primaryBeam };
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
