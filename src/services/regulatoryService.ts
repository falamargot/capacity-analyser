/**
 * Regulatory Service — thin async client for the Regulatory API server
 *
 * The 12.5 MB GeoJSON and spatial index now live server-side.
 * This module is a lightweight fetch wrapper with 0.5°-resolution caching,
 * matching the previous synchronous API shape as closely as possible.
 *
 * ALL DATA IS SIMULATED. Not real OneWeb licensing information.
 */

// ─── Public types ──────────────────────────────────────────────────────────

export type RegulatoryStatus =
  | 'ALLOWED'
  | 'ALLOWED_CONFIRMED'
  | 'ALLOWED_ESTIMATED'
  | 'RESTRICTED'
  | 'BLOCKED';

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

// ─── Configuration ─────────────────────────────────────────────────────────

const CONFIGURED_API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined)
  ?.trim()
  .replace(/\/$/, '');
const API_BASE = CONFIGURED_API_BASE ?? 'http://localhost:3001';

/** Static fallback bundled with the frontend build (works on Vercel and preview deployments). */
export const REGULATORY_OVERLAY_STATIC_URL = '/oneweb_regulatory_overlay.geojson';

/** Preferred URL for the regulatory overlay GeoJSON (used by rendering layers). */
export const REGULATORY_OVERLAY_URL = CONFIGURED_API_BASE
  ? `${CONFIGURED_API_BASE}/api/regulatory/overlay`
  : REGULATORY_OVERLAY_STATIC_URL;

// ─── Client-side cache (0.5° resolution) ──────────────────────────────────
// LRU bounded by REGULATORY_CACHE_MAX_ENTRIES — Map preserves insertion order,
// so re-inserting on hit keeps recently-used keys near the tail and oldest at
// the head for O(1) eviction. 5000 entries covers typical multi-region session
// exploration without unbounded growth across long sessions of panning.

const REGULATORY_CACHE_MAX_ENTRIES = 5000;
const _cache = new Map<string, RegulatoryResult>();
let overlayGeoJsonPromise: Promise<any> | null = null;

function cacheGet(key: string): RegulatoryResult | undefined {
  const value = _cache.get(key);
  if (value !== undefined) {
    // Move to most-recently-used position
    _cache.delete(key);
    _cache.set(key, value);
  }
  return value;
}

function cacheSet(key: string, value: RegulatoryResult): void {
  if (_cache.has(key)) _cache.delete(key);
  _cache.set(key, value);
  if (_cache.size > REGULATORY_CACHE_MAX_ENTRIES) {
    const oldestKey = _cache.keys().next().value;
    if (oldestKey !== undefined) _cache.delete(oldestKey);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Async regulatory lookup by latitude/longitude.
 *
 * Caches results at 0.5° resolution (≈ 55 km).
 * Returns null when evidence is unavailable; never interprets a failed lookup as ocean permission.
 */
export async function regulatoryLookup(lat: number, lng: number): Promise<RegulatoryResult | null> {
  const cacheKey = `${Math.round(lat * 2)}_${Math.round(lng * 2)}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/api/regulatory?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const result = (await res.json()) as RegulatoryResult;
    cacheSet(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/**
 * Loads the overlay GeoJSON used by country-level rendering.
 *
 * When no explicit API base is configured, prefer the static asset bundled in
 * `public/` so deployments without the Fastify backend (for example Vercel)
 * can still render country overlays.
 */
export async function fetchRegulatoryOverlayGeoJson(): Promise<any> {
  if (overlayGeoJsonPromise) return overlayGeoJsonPromise;

  const candidateUrls = CONFIGURED_API_BASE
    ? [REGULATORY_OVERLAY_URL, REGULATORY_OVERLAY_STATIC_URL]
    : [REGULATORY_OVERLAY_STATIC_URL, `${API_BASE}/api/regulatory/overlay`];

  overlayGeoJsonPromise = (async () => {
    let lastError: unknown = null;

    for (const url of candidateUrls) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} loading ${url}`);
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }

    overlayGeoJsonPromise = null;
    throw lastError instanceof Error
      ? lastError
      : new Error('Failed to load regulatory overlay GeoJSON.');
  })();

  return overlayGeoJsonPromise;
}

