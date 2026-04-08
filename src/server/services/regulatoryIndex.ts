/**
 * Regulatory Index — server-side port of regulatoryService.ts
 *
 * Loads the OneWeb regulatory demo map GeoJSON from disk,
 * builds a 5°×5° grid spatial index, and exposes a synchronous
 * point-in-polygon lookup with 0.5°-precision caching.
 *
 * ALL DATA IS SIMULATED. Not real OneWeb licensing information.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ─── Public types ──────────────────────────────────────────────────────────

export type RegulatoryStatus =
  | 'ALLOWED'
  | 'ALLOWED_CONFIRMED'
  | 'ALLOWED_ESTIMATED'
  | 'RESTRICTED'
  | 'BLOCKED';

export interface RegulatoryResult {
  isoA2: string | null;
  isoA3: string | null;
  countryName: string | null;
  status: RegulatoryStatus;
  reason: string;
  confidence: number;
  emitAllowed: boolean;
  serviceAllowed: boolean;
  styleFill: string;
  styleOpacity: number;
  isOcean: boolean;
}

// ─── Default ocean result ──────────────────────────────────────────────────

export const OCEAN_RESULT: RegulatoryResult = {
  isoA2: null,
  isoA3: null,
  countryName: null,
  status: 'ALLOWED_ESTIMATED',
  reason: 'International waters — no specific regulatory jurisdiction. Service treated as estimated-allowed, subject to flag-state licensing.',
  confidence: 0.3,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#78909c',
  styleOpacity: 0.1,
  isOcean: true,
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
  rings: Array<Array<[number, number]>>;
}

const GRID_DEG = 5;

let _features: FeatureRecord[] = [];
let _gridIndex: Map<string, number[]> = new Map();
let _loaded = false;

/** Point lookup cache at 0.5° resolution */
const _lookupCache = new Map<string, RegulatoryResult>();

// ─── Geometry helpers ──────────────────────────────────────────────────────

function extractRings(geometry: { type: string; coordinates: unknown }): Array<Array<[number, number]>> {
  const rings: Array<Array<[number, number]>> = [];
  const addPolygon = (coords: number[][][]) => {
    for (const ring of coords) rings.push(ring as Array<[number, number]>);
  };
  if (geometry.type === 'Polygon') {
    addPolygon(geometry.coordinates as number[][][]);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates as number[][][][]) addPolygon(polygon);
  }
  return rings;
}

function getBBox(rings: Array<Array<[number, number]>>) {
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

function pointInRing(lat: number, lng: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function isInFeature(lat: number, lng: number, f: FeatureRecord): boolean {
  if (lat < f.bboxMinLat || lat > f.bboxMaxLat || lng < f.bboxMinLng || lng > f.bboxMaxLng) return false;
  let crossings = 0;
  for (const ring of f.rings) {
    if (pointInRing(lat, lng, ring)) crossings++;
  }
  return crossings % 2 === 1;
}

// ─── GeoJSON loading + indexing ────────────────────────────────────────────

export async function loadAndIndex(publicDir: string): Promise<void> {
  const raw = await readFile(join(publicDir, 'oneweb_regulatory_map.geojson'), 'utf-8');
  const geojson = JSON.parse(raw) as { features: Array<{ geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> }> };

  _features = [];
  _gridIndex = new Map();

  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const props = feature.properties ?? {};

    const rings = extractRings(feature.geometry);
    if (rings.length === 0) continue;

    const bbox = getBBox(rings);
    const record: FeatureRecord = {
      isoA2: (props['ISO3166-1-Alpha-2'] as string) ?? '',
      isoA3: (props['ISO3166-1-Alpha-3'] as string) ?? '',
      name: (props['name'] as string) ?? '',
      status: ((props['regulatory_status'] as RegulatoryStatus) ?? 'RESTRICTED'),
      reason: (props['regulatory_reason'] as string) ?? '',
      confidence: typeof props['regulatory_confidence'] === 'number' ? (props['regulatory_confidence'] as number) : 0.5,
      emitAllowed: props['emit_allowed'] !== false,
      serviceAllowed: props['service_allowed'] !== false,
      styleFill: (props['style_fill'] as string) ?? '#9e9e9e',
      styleOpacity: typeof props['style_opacity'] === 'number' ? (props['style_opacity'] as number) : 0.2,
      bboxMinLat: bbox.minLat,
      bboxMaxLat: bbox.maxLat,
      bboxMinLng: bbox.minLng,
      bboxMaxLng: bbox.maxLng,
      rings,
    };

    const idx = _features.length;
    _features.push(record);

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

export function regulatoryLookup(lat: number, lng: number): RegulatoryResult {
  if (!_loaded) return OCEAN_RESULT;

  const cacheKey = `${Math.round(lat * 2)}_${Math.round(lng * 2)}`;
  const cached = _lookupCache.get(cacheKey);
  if (cached) return cached;

  const row = Math.floor(lat / GRID_DEG);
  const col = Math.floor(lng / GRID_DEG);
  const candidates = _gridIndex.get(`${row}_${col}`) ?? [];

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
