import { Feature, Polygon } from 'geojson';
import { SNPS_DATA } from '../components/globe/GlobeConfig';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { SatelliteData } from '../types/satellites';
import { haversineDistanceKm, MIN_SNP_GATEWAY_ELEVATION_DEG } from '../utils/leoFootprint';
import { EARTH_RADIUS_KM, SPEED_OF_LIGHT_RADIO_KM_S, calculateElevationAngle, compute3DDistanceKm } from '../utils/capacityCalculator';
import type { SNPData } from '../components/globe/GlobeConfig';
import { log } from '../utils/logger';

const POINTS_IN_CIRCLE = 16; // Increased number of points for smoother circles

export interface CoverageData {
  type: string;
  features: Feature[];
}

// ─── Coverage file format ──────────────────────────────────────────────────────

interface RawFootprint {
  id: number;
  level: number;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
}

interface RawCoverageEntry {
  id: number;
  name: string;
  commercialName?: string;
  up: boolean;
  footprints: RawFootprint[];
}

interface RawCoverageFile {
  coverages: RawCoverageEntry[];
}

export interface PrebuiltCoverageMesh {
  vertexFormat: 'cartesian3';
  fillMode: 'simple' | 'banded';
  positionCount: number;
  triangleCount: number;
  positions: Float64Array;
  indices: Uint32Array;
  boundingSphere: {
    center: [number, number, number];
    radius: number;
  } | null;
}

interface PrebuiltCoverageManifestFeatureV3 {
  key: string;
  name: string;
  level: number;
  coverageGeometryKey: string;
  fillMode: 'simple' | 'banded';
  positionCount: number;
  positionByteOffset: number;
  indexCount: number;
  indexByteOffset: number;
  triangleCount: number;
  boundingSphere: {
    center: [number, number, number];
    radius: number;
  } | null;
}

interface PrebuiltCoverageManifestV5 {
  format: 'geo-coverage-prebuilt-v5';
  satelliteId: string;
  meshFile: string;
  meshEncoding: {
    vertexFormat: 'cartesian3';
    positionComponentType: 'float64';
    positionComponents: 3;
    indexComponentType: 'uint32';
  };
  features: PrebuiltCoverageManifestFeatureV3[];
}

const isCoverageFileFormat = (data: unknown): data is RawCoverageFile =>
  typeof data === 'object' &&
  data !== null &&
  'coverages' in data;

const isPrebuiltCoverageManifestV5Format = (data: unknown): data is PrebuiltCoverageManifestV5 =>
  typeof data === 'object' &&
  data !== null &&
  'format' in data &&
  (data as { format?: unknown }).format === 'geo-coverage-prebuilt-v5' &&
  'meshFile' in data &&
  typeof (data as { meshFile?: unknown }).meshFile === 'string' &&
  'features' in data &&
  Array.isArray((data as { features?: unknown }).features);

// ─── Shared geometry helpers ──────────────────────────────────────────────────

const attachCoverageGeometryMetadata = (
  feature: Feature,
  geometry: Polygon,
  featureIndex: number,
  polygonIndex: number
): Feature => ({
  ...feature,
  properties: {
    ...(feature.properties ?? {}),
    coverageGeometryKey: `${featureIndex}:${polygonIndex}`,
    coveragePartIndex: polygonIndex,
    coverageSourceFeatureIndex: featureIndex,
  },
  geometry,
});

// ─── Coverage parser ───────────────────────────────────────────────────────────

export const parseCoverageFile = (data: RawCoverageFile): CoverageData => {
  const features: Feature[] = [];

  data.coverages.forEach((coverage, coverageIndex) => {
    const baseProperties = {
      name: coverage.name,
      mission: coverage.name,
      commercialName: coverage.commercialName ?? null,
      isUplink: coverage.up,
      type: 'EUTELSAT',
    };

    coverage.footprints.forEach((footprint) => {
      const { geometry } = footprint;
      const props = { ...baseProperties, level: footprint.level, contour: footprint.level };

      if (geometry.type === 'Polygon') {
        const polygonGeometry = geometry as Polygon;
        features.push(
          attachCoverageGeometryMetadata(
            { type: 'Feature', properties: props, geometry: polygonGeometry },
            polygonGeometry,
            coverageIndex,
            0
          )
        );
      } else if (geometry.type === 'MultiPolygon') {
        const coords = geometry.coordinates as unknown[][];
        coords.forEach((coordinates, polygonIndex) => {
          const polygonGeometry: Polygon = { type: 'Polygon', coordinates: coordinates as number[][][] };
          features.push(
            attachCoverageGeometryMetadata(
              { type: 'Feature', properties: props, geometry: polygonGeometry },
              polygonGeometry,
              coverageIndex,
              polygonIndex
            )
          );
        });
      }
    });
  });

  return { type: 'FeatureCollection', features };
};

export const parsePrebuiltCoverageMeshBinaryBundle = (
  manifest: PrebuiltCoverageManifestV5,
  meshBuffer: ArrayBuffer,
): Map<string, PrebuiltCoverageMesh> => {
  const meshIndex = new Map<string, PrebuiltCoverageMesh>();

  for (const feature of manifest.features) {
    meshIndex.set(feature.key, {
      vertexFormat: manifest.meshEncoding.vertexFormat,
      fillMode: feature.fillMode,
      positionCount: feature.positionCount,
      triangleCount: feature.triangleCount,
      positions: new Float64Array(
        meshBuffer,
        feature.positionByteOffset,
        feature.positionCount * manifest.meshEncoding.positionComponents,
      ),
      indices: new Uint32Array(
        meshBuffer,
        feature.indexByteOffset,
        feature.indexCount,
      ),
      boundingSphere: feature.boundingSphere,
    });
  }

  return meshIndex;
};

const fetchCoverageJson = async (path: string): Promise<unknown | null> => {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.json();
};

const fetchCoverageArrayBuffer = async (path: string): Promise<ArrayBuffer | null> => {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.arrayBuffer();
};

export const loadSatelliteCoverage = async (satelliteId: string, satelliteName: string, satelliteType: string, coverageRadius: number): Promise<CoverageData | null> => {
  try {
    // In Vite production builds, files under /src are bundled and not served as static runtime assets.
    // Coverage JSON files must live under /public so they can be fetched at runtime.
    const data: unknown = await fetchCoverageJson(`/coverage/${satelliteId}.json`);
    if (!data) return null;

    log(`Loading real coverage for satellite ${satelliteId}`);
    if (!isCoverageFileFormat(data)) {
      throw new Error(`Unsupported coverage format for satellite ${satelliteId}`);
    }
    return parseCoverageFile(data);
  } catch (error) {
    // Only synthesize a fallback footprint if coverage loading or parsing failed.
    const data: CoverageData = {
      type: 'FeatureCollection',
      features: []
    };
    const points: [number, number][] = [];

    // Convert radius from kilometers to radians
    const angularRadius = coverageRadius / EARTH_RADIUS_KM;
    const rad = 180 / Math.PI;
    for (let i = 0; i <= POINTS_IN_CIRCLE; i++) {
      const angle = (i / POINTS_IN_CIRCLE) * 2 * Math.PI;
      const latDeg = Math.asin(Math.sin(angularRadius) * Math.cos(angle)) * rad;
      const lngDeg = Math.atan2(Math.sin(angle) * Math.sin(angularRadius), Math.cos(angularRadius)) * rad;
      points.push([lngDeg, latDeg]);
    }
    const feature: Feature = {
      type: 'Feature',
      properties: {
        satelliteId: satelliteName,
        name: '',
        type: satelliteType
      },
      geometry: {
        type: 'Polygon',
        coordinates: [points]
      }
    }
    data.features.push(feature);
    return data;
  }
}

// ─── Prebuilt mesh index cache (byte-budgeted LRU) ────────────────────────────
//
// Each cached entry holds Float64Array/Uint32Array VIEWS created over the
// satellite's whole `.mesh.bin` ArrayBuffer (see
// parsePrebuiltCoverageMeshBinaryBundle). A typed-array view keeps its backing
// buffer alive, so ONE cached satellite retains its ENTIRE mesh file — 0.19 MB
// to 14.28 MB depending on the satellite, 109 MB across the 31 satellites that
// ship a prebuilt mesh.
//
// This cache was previously an unbounded Map with no eviction, so a session
// that inspected many GEO satellites grew monotonically towards that 109 MB and
// never gave it back. Entry COUNT is a poor budget here (sizes vary ~75x), so
// the budget is expressed in bytes and eviction is least-recently-used.
//
// Evicting is always safe: CoverageLayer holds its own reference to the one
// mesh index it is currently rendering, so an evicted entry stays alive for as
// long as it is on screen and is simply re-fetched (from the HTTP cache) if it
// is needed again later.
const MESH_CACHE_BUDGET_BYTES = 48 * 1024 * 1024;

interface MeshCacheEntry {
  promise: Promise<Map<string, PrebuiltCoverageMesh>>;
  /** Retained bytes of the backing ArrayBuffer; 0 until the fetch resolves. */
  bytes: number;
}

const _meshIndexCache = new Map<string, MeshCacheEntry>();

/** Total bytes currently retained by the cache. */
const meshCacheBytes = (): number => {
  let total = 0;
  for (const entry of _meshIndexCache.values()) total += entry.bytes;
  return total;
};

/**
 * Drop least-recently-used entries until the retained byte total fits the
 * budget. `keepId` is never evicted — it is the entry the caller just asked
 * for, and evicting it would guarantee a re-fetch on the very next call.
 */
const evictMeshCacheToBudget = (keepId: string): void => {
  if (meshCacheBytes() <= MESH_CACHE_BUDGET_BYTES) return;
  // Map iterates in insertion order, and `loadSatelliteCoverageMeshIndex`
  // re-inserts on every hit, so the first key is the least recently used.
  for (const key of Array.from(_meshIndexCache.keys())) {
    if (meshCacheBytes() <= MESH_CACHE_BUDGET_BYTES) return;
    if (key === keepId) continue;
    _meshIndexCache.delete(key);
  }
};

export const loadSatelliteCoverageMeshIndex = (satelliteId: string): Promise<Map<string, PrebuiltCoverageMesh>> => {
  const cached = _meshIndexCache.get(satelliteId);
  if (cached) {
    // Refresh recency: re-inserting moves this key to the end of the iteration
    // order, so it is evicted last.
    _meshIndexCache.delete(satelliteId);
    _meshIndexCache.set(satelliteId, cached);
    return cached.promise;
  }

  const entry: MeshCacheEntry = { promise: null as never, bytes: 0 };

  entry.promise = (async () => {
    try {
      const manifest = await fetchCoverageJson(`/coverage-prebuilt/${satelliteId}.manifest.json`);
      if (manifest && isPrebuiltCoverageManifestV5Format(manifest)) {
        const meshBuffer = await fetchCoverageArrayBuffer(`/coverage-prebuilt/${manifest.meshFile}`);
        if (meshBuffer) {
          const index = parsePrebuiltCoverageMeshBinaryBundle(manifest, meshBuffer);
          // Account for the retained buffer, then trim older satellites.
          if (_meshIndexCache.get(satelliteId) === entry) {
            entry.bytes = meshBuffer.byteLength;
            evictMeshCacheToBudget(satelliteId);
          }
          return index;
        }
      }
    } catch {
    }
    return new Map<string, PrebuiltCoverageMesh>();
  })();

  _meshIndexCache.set(satelliteId, entry);
  return entry.promise;
};

/** Test/diagnostic hook: current cache occupancy. */
export const getCoverageMeshCacheStats = (): {
  entries: number;
  retainedBytes: number;
  budgetBytes: number;
} => ({
  entries: _meshIndexCache.size,
  retainedBytes: meshCacheBytes(),
  budgetBytes: MESH_CACHE_BUDGET_BYTES,
});

/** Test/diagnostic hook: drop every cached mesh index. */
export const clearCoverageMeshCache = (): void => {
  _meshIndexCache.clear();
};

export const getCoverageColor = (
  type: string | null,
  opacity: number = 0.3,
  satellite?: SatelliteData,
  failedSnps?: ReadonlySet<string>
): string => {
  // Determine once whether this ONEWEB satellite covers at least one non-failed SNP
  const hasSNP = satellite ? hasSNPInCoverage(satellite, failedSnps) : false;

  // ONEWEB double-zone logic (STANDARD / BACKHAUL)
  // Rule:
  // - If at least one SNP is covered by ANY coverage of the satellite:
  //   -> all coverages are GREEN, with intensity depending on the zone
  // - If no SNP is covered:
  //   -> all coverages are GRAY (neutral color for no service)

  if (type === 'ONEWEB_STANDARD') {
    // Dark pink if SNP covered, gray otherwise
    const baseColor = hasSNP ? '219, 39, 119' : '107, 114, 128'; // Pink vs Gray
    return `rgba(${baseColor}, ${opacity})`;
  }

  if (type === 'ONEWEB_BACKHAUL') {
    // Light pink if SNP covered, light gray otherwise
    const baseColor = hasSNP ? '219, 39, 119' : '156, 163, 175'; // Pink vs Light Gray
    return `rgba(${baseColor}, ${opacity * 0.3})`;
  }

  if (type === 'SNP_VISIBILITY_AREA') {
    // SNP visibility area - dark orange
    return `rgba(255, 140, 0, ${opacity * 0.6})`;
  }

  // Default satellite coloring
  const baseColor =
    type === 'EUTELSAT'
      ? '37, 99, 235'
      : type === 'ONEWEB'
        ? '219, 39, 119'
        : '200, 200, 200';

  return `rgba(${baseColor}, ${opacity})`;
};

export const hasSNPInCoverage = (
  satellite: SatelliteData,
  failedSnps: ReadonlySet<string> = new Set(),
): boolean => {
  // Only check for LEO satellites (ONEWEB)
  if (satellite.type !== 'ONEWEB') {
    return false;
  }

  // Check if any non-failed SNP is in the satellite's coverage
  for (const snp of SNPS_DATA) {
    // Feature 1: skip SNPs marked as failed
    if (failedSnps.has(snp.name)) continue;

    const coverageClasses = isPointInCoverage(
      { lat: snp.lat, lng: snp.lng },
      satellite,
      null
    );

    if (coverageClasses.includes('backhaul')) {
      return true;
    }
  }

  return false;
}

export interface SNPConnectedSatellite {
  satellite: SatelliteData;
  elevation: number;   // degrees, satellite elevation seen from SNP
  distanceKm: number;  // surface distance km
  latencyMs: number;   // one-way latency ms
}

/**
 * Find all LEO satellites currently connected to a given SNP (elevation ≥ 15°).
 * Returns results sorted by descending elevation.
 */
export const getSatellitesConnectedToSNP = (
  snp: SNPData,
  satellites: SatelliteData[],
  failedSnps: ReadonlySet<string> = new Set()
): SNPConnectedSatellite[] => {
  if (failedSnps.has(snp.name)) return [];

  const result: SNPConnectedSatellite[] = [];

  for (const satellite of satellites) {
    if (satellite.type !== 'ONEWEB') continue;

    const elevation = calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, satellite);
    if (elevation < MIN_SNP_GATEWAY_ELEVATION_DEG) continue;

    const distanceKm = haversineDistanceKm(
      { lat: snp.lat, lng: snp.lng },
      { lat: satellite.position.lat, lng: satellite.position.lng }
    );

    const distance3D = compute3DDistanceKm(
      { lat: snp.lat, lng: snp.lng },
      { lat: satellite.position.lat, lng: satellite.position.lng, alt: satellite.position.alt }
    );
    const latencyMs = (distance3D / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

    result.push({ satellite, elevation, distanceKm, latencyMs });
  }

  return result.sort((a, b) => b.elevation - a.elevation);
};
