/**
 * Regulatory Service — GeoJSON-based country regulatory status lookup
 *
 * Loads the OneWeb regulatory demo map (public/oneweb_regulatory_map.geojson),
 * builds a 5°×5° grid spatial index, and exposes a synchronous point-in-polygon
 * lookup with 0.5°-precision caching.
 *
 * ALL DATA IS SIMULATED. Not real OneWeb licensing information.
 *
 * Performance strategy:
 *  - GeoJSON is loaded once, lazily, on first call to ensureLoaded()
 *  - Grid index limits PIP candidates to ~3 features per cell
 *  - Cache avoids repeated PIP for same 0.5° cell
 */

// ─── Public types ──────────────────────────────────────────────────────────

export type RegulatoryStatus = 'ALLOWED' | 'RESTRICTED' | 'BLOCKED';

export interface RegulatoryResult {
  /** ISO 3166-1 Alpha-2 code, null for ocean/international waters */
  isoA2: string | null;
  /** ISO 3166-1 Alpha-3 code */
  isoA3: string | null;
  /** Country name */
  countryName: string | null;
  /** Simulated regulatory status */
  status: RegulatoryStatus;
  /** Human-readable reason for the status */
  reason: string;
  /** Simulated confidence score [0, 1] */
  confidence: number;
  /** Whether terminal emission is permitted (simulated) */
  emitAllowed: boolean;
  /** Whether service is permitted (simulated) */
  serviceAllowed: boolean;
  /** Suggested fill colour for map overlay */
  styleFill: string;
  /** Suggested opacity for map overlay */
  styleOpacity: number;
  /** True when the point is outside all country polygons */
  isOcean: boolean;
}

// ─── Default ocean result ──────────────────────────────────────────────────

const OCEAN_RESULT: RegulatoryResult = {
  isoA2: null,
  isoA3: null,
  countryName: null,
  status: 'RESTRICTED',
  reason: 'International waters — no specific regulatory jurisdiction. Service subject to flag-state licensing.',
  confidence: 0.15,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#78909c',
  styleOpacity: 0.1,
  isOcean: true,
};

/** Safe default returned before the GeoJSON has been loaded */
const LOADING_RESULT: RegulatoryResult = {
  isoA2: null,
  isoA3: null,
  countryName: null,
  status: 'ALLOWED',
  reason: 'Regulatory data loading…',
  confidence: 0,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#9e9e9e',
  styleOpacity: 0.1,
  isOcean: false,
};

// ─── Internal data structures ──────────────────────────────────────────────

interface FeatureRecord {
  isoA2: string;
  isoA3: string;
  name: string;
  status: RegulatoryStatus;
  reason: string;
  confidence: number;
  emitAllowed: boolean;
  serviceAllowed: boolean;
  styleFill: string;
  styleOpacity: number;
  bboxMinLat: number;
  bboxMaxLat: number;
  bboxMinLng: number;
  bboxMaxLng: number;
  /** Flattened ring list: outer rings + hole rings from all (Multi)Polygon members */
  rings: Array<Array<[number, number]>>; // each ring: [[lng, lat], ...]
}

const GRID_DEG = 5; // cell size in degrees

let _features: FeatureRecord[] = [];
let _gridIndex: Map<string, number[]> = new Map();
let _loaded = false;
let _loadPromise: Promise<void> | null = null;

/** Point lookup cache at 0.5° resolution (≈ 55 km) */
const _lookupCache = new Map<string, RegulatoryResult>();

// ─── Geometry helpers ──────────────────────────────────────────────────────

function extractRings(geometry: any): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];

  const addPolygon = (polygonCoords: number[][][]) => {
    for (const ring of polygonCoords) {
      rings.push(ring as Array<[number, number]>);
    }
  };

  if (geometry.type === 'Polygon') {
    addPolygon(geometry.coordinates);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      addPolygon(polygon);
    }
  }

  return rings;
}

function getBBox(rings: Array<Array<[number, number]>>): {
  minLat: number; maxLat: number; minLng: number; maxLng: number;
} {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Point-in-ring test using the ray-casting algorithm.
 * Ring points are [lng, lat] pairs.
 * Applying this to all rings (outer + holes) with parity counting correctly
 * handles holes: a point inside a hole flips parity back to "outside".
 */
function pointInRing(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i]; // xi=lng, yi=lat
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isInFeature(lat: number, lng: number, f: FeatureRecord): boolean {
  // Fast bounding box pre-filter
  if (lat < f.bboxMinLat || lat > f.bboxMaxLat || lng < f.bboxMinLng || lng > f.bboxMaxLng) {
    return false;
  }
  // Parity across all rings (correctly handles holes)
  let crossings = 0;
  for (const ring of f.rings) {
    if (pointInRing(lat, lng, ring)) crossings++;
  }
  return crossings % 2 === 1;
}

// ─── GeoJSON loading + indexing ────────────────────────────────────────────

function gridCellKey(lat: number, lng: number): string {
  const row = Math.floor(lat / GRID_DEG);
  const col = Math.floor(lng / GRID_DEG);
  return `${row}_${col}`;
}

async function loadAndIndex(): Promise<void> {
  const response = await fetch('/oneweb_regulatory_map.geojson');
  if (!response.ok) throw new Error(`Failed to fetch regulatory GeoJSON: ${response.status}`);
  const geojson = await response.json();

  _features = [];
  _gridIndex = new Map();

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const props = feature.properties ?? {};

    const rings = extractRings(feature.geometry);
    if (rings.length === 0) continue;

    const bbox = getBBox(rings);

    const record: FeatureRecord = {
      isoA2: props['ISO3166-1-Alpha-2'] ?? '',
      isoA3: props['ISO3166-1-Alpha-3'] ?? '',
      name: props.name ?? '',
      status: (props.regulatory_status as RegulatoryStatus) ?? 'RESTRICTED',
      reason: props.regulatory_reason ?? '',
      confidence: typeof props.regulatory_confidence === 'number' ? props.regulatory_confidence : 0.5,
      emitAllowed: props.emit_allowed !== false,
      serviceAllowed: props.service_allowed !== false,
      styleFill: props.style_fill ?? '#9e9e9e',
      styleOpacity: typeof props.style_opacity === 'number' ? props.style_opacity : 0.2,
      bboxMinLat: bbox.minLat,
      bboxMaxLat: bbox.maxLat,
      bboxMinLng: bbox.minLng,
      bboxMaxLng: bbox.maxLng,
      rings,
    };

    const idx = _features.length;
    _features.push(record);

    // Add feature to all grid cells its bounding box overlaps
    const rowMin = Math.floor(Math.max(-90, bbox.minLat) / GRID_DEG);
    const rowMax = Math.floor(Math.min(90, bbox.maxLat) / GRID_DEG);
    const colMin = Math.floor(Math.max(-180, bbox.minLng) / GRID_DEG);
    const colMax = Math.floor(Math.min(180, bbox.maxLng) / GRID_DEG);

    for (let r = rowMin; r <= rowMax; r++) {
      for (let c = colMin; c <= colMax; c++) {
        const key = `${r}_${c}`;
        if (!_gridIndex.has(key)) _gridIndex.set(key, []);
        _gridIndex.get(key)!.push(idx);
      }
    }
  }

  _loaded = true;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Trigger async GeoJSON loading. Idempotent — safe to call multiple times.
 * Await this at app startup; lookup calls will return safe defaults until done.
 */
export async function ensureLoaded(): Promise<void> {
  if (_loaded) return;
  if (_loadPromise) return _loadPromise;
  _loadPromise = loadAndIndex().catch((err) => {
    console.error('[RegulatoryService] Load failed:', err);
    _loaded = true; // prevent infinite retry
  });
  return _loadPromise;
}

/**
 * Synchronous regulatory lookup by latitude/longitude.
 *
 * Returns a safe default (ALLOWED) until loading completes.
 * Cache is at 0.5° resolution — approximately one cell per ~55 km.
 */
export function regulatoryLookup(lat: number, lng: number): RegulatoryResult {
  if (!_loaded) return LOADING_RESULT;

  // Cache key at 0.5° precision
  const cacheKey = `${Math.round(lat * 2)}_${Math.round(lng * 2)}`;
  if (_lookupCache.has(cacheKey)) {
    return _lookupCache.get(cacheKey)!;
  }

  // Find candidates via grid index
  const cell = gridCellKey(lat, lng);
  const candidates = _gridIndex.get(cell) ?? [];

  for (const idx of candidates) {
    const f = _features[idx];
    if (isInFeature(lat, lng, f)) {
      const result: RegulatoryResult = {
        isoA2: f.isoA2 || null,
        isoA3: f.isoA3 || null,
        countryName: f.name || null,
        status: f.status,
        reason: f.reason,
        confidence: f.confidence,
        emitAllowed: f.emitAllowed,
        serviceAllowed: f.serviceAllowed,
        styleFill: f.styleFill,
        styleOpacity: f.styleOpacity,
        isOcean: false,
      };
      _lookupCache.set(cacheKey, result);
      return result;
    }
  }

  _lookupCache.set(cacheKey, OCEAN_RESULT);
  return OCEAN_RESULT;
}

/** Returns true once the GeoJSON has been fully loaded and indexed */
export function isRegulatoryLoaded(): boolean {
  return _loaded;
}

// ─── Legacy export (backwards compatibility) ──────────────────────────────

/** @deprecated Use regulatoryLookup() instead */
export interface RestrictedTerritory {
  name: string;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** @deprecated Use regulatoryLookup() instead */
export const isRestrictedTerritory = (
  lat: number,
  lng: number,
): { isRestricted: boolean; territoryName?: string } => {
  const result = regulatoryLookup(lat, lng);
  if (result.status === 'BLOCKED' || result.status === 'RESTRICTED') {
    return { isRestricted: true, territoryName: result.countryName ?? undefined };
  }
  return { isRestricted: false };
};
