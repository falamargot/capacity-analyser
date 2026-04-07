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

// ─── Configuration ─────────────────────────────────────────────────────────

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3001';

/** Base URL for the regulatory overlay GeoJSON (used by rendering layers) */
export const REGULATORY_OVERLAY_URL = `${API_BASE}/api/regulatory/overlay`;

// ─── Graceful degradation ──────────────────────────────────────────────────

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

// ─── Client-side cache (0.5° resolution) ──────────────────────────────────

const _cache = new Map<string, RegulatoryResult>();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Async regulatory lookup by latitude/longitude.
 *
 * Caches results at 0.5° resolution (≈ 55 km).
 * Falls back to OCEAN_RESULT on network error.
 */
export async function regulatoryLookup(lat: number, lng: number): Promise<RegulatoryResult> {
  const cacheKey = `${Math.round(lat * 2)}_${Math.round(lng * 2)}`;
  const cached = _cache.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${API_BASE}/api/regulatory?lat=${lat}&lng=${lng}`);
    if (!res.ok) return OCEAN_RESULT;
    const result = (await res.json()) as RegulatoryResult;
    _cache.set(cacheKey, result);
    return result;
  } catch {
    return OCEAN_RESULT;
  }
}

/**
 * No-op — the server handles loading at startup.
 * Kept for API compatibility with previous call sites.
 */
export async function ensureLoaded(): Promise<void> {
  // Server-side; nothing to do on the client.
}
