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

// Minimum operational elevation for a GEO terminal.
// Below this threshold the atmospheric path length (∝ 1/sin(elevation)) degrades
// the link budget beyond any practical margin, even in clear-sky conditions.
const MIN_ELEVATION_DEG = 5;

// ─── Bounding-Box Cache ────────────────────────────────────────────────────────
// Keyed by the GeoJSON Feature object, which is stable for GEO (EUTELSAT) satellites
// across renders. The cache converts the O(n) ray-cast in isPointInPolygon into an
// O(1) AABB check that rejects the vast majority of beams before the ray-cast runs.
interface BBox { minLat: number; maxLat: number; minLng: number; maxLng: number; }
const bboxCache = new WeakMap<object, BBox>();

const computeRingBBox = (ring: number[][]): BBox => {
  let minLat = Infinity, maxLat = -Infinity;
  let minLng = Infinity, maxLng = -Infinity;
  for (const [lng, lat] of ring) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return { minLat, maxLat, minLng, maxLng };
};

const getFeatureBBox = (feature: object, ring: number[][]): BBox => {
  const cached = bboxCache.get(feature);
  if (cached) return cached;
  const bbox = computeRingBBox(ring);
  bboxCache.set(feature, bbox);
  return bbox;
};

const isPointInBBox = (point: Point, bbox: BBox): boolean => (
  point.lat >= bbox.minLat &&
  point.lat <= bbox.maxLat &&
  point.lng >= bbox.minLng &&
  point.lng <= bbox.maxLng
);

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

const getCoverageApproximateArea = (ring: number[][]): number => {
  if (ring.length < 3) return 0;

  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    area += (xj + xi) * (yj - yi);
  }

  return Math.abs(area) * 0.5;
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

export const getCandidateBeamKey = (
  candidate: Pick<CandidateCoverage, 'satelliteName' | 'beamId'>
): string => `${candidate.satelliteName}::${candidate.beamId}`;

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
    if (elevation < MIN_ELEVATION_DEG) continue;

    const candidatesByCoverageKey = new Map<string, CandidateCoverage & {
      _approximateArea: number;
      _normalizedDistance: number;
    }>();

    for (const coverage of satellite.coverages) {
      const ring = getCoverageRing(coverage);
      if (!ring) continue;

      // Fast AABB reject before the O(n) ray-cast. The bbox is cached on the
      // feature object (stable reference for GEO satellites) so subsequent calls
      // cost only a WeakMap lookup + 4 comparisons instead of a full polygon scan.
      const feature = coverage.feature;
      if (feature) {
        const bbox = getFeatureBBox(feature, ring);
        // Skip antimeridian-spanning polygons (maxLng - minLng > 180) — their
        // bbox wraps incorrectly; let them fall through to the full ray-cast.
        if (bbox.maxLng - bbox.minLng <= 180 && !isPointInBBox(userPoint, bbox)) continue;
      }

      if (!isPointInPolygon(userPoint, ring)) continue;

      const beamMetrics = getBeamDistanceMetrics(userPoint, coverage);
      if (!beamMetrics) continue;

      const coverageKey = getCoverageGroupId(coverage);
      const approximateArea = getCoverageApproximateArea(ring);
      const throughputEstimate = satellite.capacity.maxThroughput * (0.35 + (0.65 * (1 - beamMetrics.normalizedDistance)));
      const properties = getCoverageProperties(coverage);
      const level = typeof properties.level === 'number' ? properties.level : null;
      const isUplink = properties.isUplink === true;
      const nextCandidate: CandidateCoverage & {
        _approximateArea: number;
        _normalizedDistance: number;
      } = {
        satelliteId: satellite.id,
        satelliteName: satellite.name,
        missionName: getCoverageMissionName(coverage),
        coverageKey,
        coverageName: getCoverageDisplayName(coverage),
        beamId: getCoverageBeamId(coverage),
        beamName: getCoverageBeamName(coverage),
        elevation,
        distanceFromBeamCenter: beamMetrics.distanceKm,
        throughputEstimate,
        level,
        isUplink,
        latencyMs: null,
        status: 'available',
        scoreBreakdown: {
          elevation: 0,
          throughput: 0,
          latency: 0,
          total: 0,
        },
        score: 0,
        _approximateArea: approximateArea,
        _normalizedDistance: beamMetrics.normalizedDistance,
      };

      const currentCandidate = candidatesByCoverageKey.get(coverageKey);
      if (!currentCandidate) {
        candidatesByCoverageKey.set(coverageKey, nextCandidate);
        continue;
      }

      const shouldReplace =
        approximateArea < currentCandidate._approximateArea ||
        (
          approximateArea === currentCandidate._approximateArea &&
          beamMetrics.normalizedDistance < currentCandidate._normalizedDistance
        ) ||
        (
          approximateArea === currentCandidate._approximateArea &&
          beamMetrics.normalizedDistance === currentCandidate._normalizedDistance &&
          beamMetrics.distanceKm < currentCandidate.distanceFromBeamCenter
        );

      if (shouldReplace) {
        candidatesByCoverageKey.set(coverageKey, nextCandidate);
      }
    }

    candidates.push(
      ...Array.from(candidatesByCoverageKey.values()).map(({ _approximateArea, _normalizedDistance, ...candidate }) => candidate)
    );
  }

  return candidates;
};

// ─── Scoring weights ──────────────────────────────────────────────────────────
//
// Score formula (implemented in rankPool below):
//
//   score = W_ELEVATION × elevationScore
//         + W_THROUGHPUT × throughputScore
//         - W_LATENCY × latencyPenalty
//
// The spec requires elevation, throughput, and latency. We normalize all three
// terms to keep the score dimensionless and deterministic across different GEO
// fleets and contour files:
//   • elevationScore  = elevation / 90
//   • throughputScore = candidate throughput normalized within the pool
//   • latencyPenalty  = candidate RTT normalized within the pool
//
// Weight rationale:
//   • Elevation 0.45: strongest factor because low-elevation GEO links have the
//     worst atmospheric path length and the weakest engineering margin.
//   • Throughput 0.40: second strongest factor because beam-center proximity and
//     contour strength directly affect usable service capacity.
//   • Latency 0.15: still important, but GEO RTT varies in a narrower envelope
//     than throughput/headroom across eligible beams.

export const TARGET_SELECTION_WEIGHTS = {
  elevation: 0.45,
  throughput: 0.40,
  latency: 0.15,
} as const;

const GEO_LATENCY_FALLBACK_MS = 800;

const normalizeMetric = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) return 1;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
};

const getCandidateLatencyMs = (
  candidate: CandidateCoverage,
  satellites: SatelliteData[],
  userPoint: { lat: number; lng: number; altitude?: number },
  gateways: GeoGatewayData[]
): { latencyMs: number | null; status: CandidateCoverage['status'] } => {
  const connectivity = computeGeoConnectivity(candidate, userPoint, satellites, gateways);
  if (!connectivity?.geometry) {
    return { latencyMs: null, status: 'gateway_unavailable' };
  }

  if (!connectivity.geometry.satelliteToGateway.gateway) {
    return {
      latencyMs: connectivity.geometry.rttPropagationMs ?? null,
      status: 'gateway_unavailable',
    };
  }

  if (connectivity.geometry.isUserLinkUnstable) {
    return {
      latencyMs: connectivity.geometry.rttTotalMs ?? connectivity.geometry.rttPropagationMs ?? null,
      status: 'unstable',
    };
  }

  return {
    latencyMs: connectivity.geometry.rttTotalMs ?? connectivity.geometry.rttPropagationMs ?? null,
    status: 'available',
  };
};

// Rank a homogeneous pool of candidates (all DL or all UL).
// Each pool is scored independently so downlink and uplink contours are never
// mixed in the same throughput/latency normalisation window.
const rankPool = (
  pool: CandidateCoverage[],
  satellites: SatelliteData[],
  userPoint: { lat: number; lng: number; altitude?: number },
  gateways: GeoGatewayData[]
): CandidateCoverage[] => {
  if (pool.length === 0) return [];

  const hydratedPool = pool.map((candidate) => {
    const latency = getCandidateLatencyMs(candidate, satellites, userPoint, gateways);
    return {
      ...candidate,
      latencyMs: latency.latencyMs,
      status: latency.status,
    };
  });

  let minThroughput = Infinity;
  let maxThroughput = -Infinity;
  let minLatency = Infinity;
  let maxLatency = -Infinity;

  for (const candidate of hydratedPool) {
    if (candidate.throughputEstimate < minThroughput) minThroughput = candidate.throughputEstimate;
    if (candidate.throughputEstimate > maxThroughput) maxThroughput = candidate.throughputEstimate;

    const latencyMs = candidate.latencyMs ?? GEO_LATENCY_FALLBACK_MS;
    if (latencyMs < minLatency) minLatency = latencyMs;
    if (latencyMs > maxLatency) maxLatency = latencyMs;
  }

  return hydratedPool
    .map((candidate) => {
      const elevationScore = clamp(candidate.elevation / 90, 0, 1);
      const throughputScore = normalizeMetric(
        candidate.throughputEstimate,
        minThroughput,
        maxThroughput
      );
      const latencyPenalty = normalizeMetric(
        candidate.latencyMs ?? GEO_LATENCY_FALLBACK_MS,
        minLatency,
        maxLatency
      );
      const total =
        (TARGET_SELECTION_WEIGHTS.elevation * elevationScore) +
        (TARGET_SELECTION_WEIGHTS.throughput * throughputScore) -
        (TARGET_SELECTION_WEIGHTS.latency * latencyPenalty);

      return {
        ...candidate,
        score: total,
        scoreBreakdown: {
          elevation: TARGET_SELECTION_WEIGHTS.elevation * elevationScore,
          throughput: TARGET_SELECTION_WEIGHTS.throughput * throughputScore,
          latency: TARGET_SELECTION_WEIGHTS.latency * latencyPenalty,
          total,
        },
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const rankCandidateCoverages = (
  candidates: CandidateCoverage[],
  satellites: SatelliteData[],
  userPoint: { lat: number; lng: number; altitude?: number },
  gateways: GeoGatewayData[] = GEO_GATEWAYS
): CandidateCoverage[] => {
  if (candidates.length === 0) return [];

  // Split by direction before ranking so that IPFD (dBW for DL) and G/T (dB/K
  // for UL) are normalised within their own pool and never compared against each
  // other. Downlink candidates are returned first — they are the primary selection
  // dimension for a receiving terminal.
  const dlCandidates = candidates.filter((c) => !c.isUplink);
  const ulCandidates = candidates.filter((c) => c.isUplink);

  return [
    ...rankPool(dlCandidates, satellites, userPoint, gateways),
    ...rankPool(ulCandidates, satellites, userPoint, gateways),
  ];
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
