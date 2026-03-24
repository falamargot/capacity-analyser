/**
 * satcatService.ts
 *
 * Provides a NORAD_CAT_ID → effective OPS_STATUS_CODE map used to colour-code
 * satellites by operational status.
 *
 * Data source priority
 * ────────────────────
 * 1. /satcat-status.json  — pre-built static file written by scripts/update-celestrak.js.
 *    Generated server-side (Node.js), so CelesTrak's CORS policy is irrelevant.
 *    Contains only EUTELSAT/ONEWEB entries; typically < 20 KB.
 *    Cached in localStorage for 24 h so we only fetch it once per session.
 *
 * 2. localStorage (stale)  — used when the static file fetch fails and an older
 *    cached payload is available.
 *
 * 3. Live CelesTrak API    — last resort, only works if CelesTrak sends CORS
 *    headers for browser requests (not guaranteed).
 *
 * 4. null                  — no SATCAT data available at all; caller must default
 *    all satellites to "operational" (better than showing everything as unknown/gray).
 *
 * Effective code normalisation
 * ────────────────────────────
 * If DECAY field is non-null the satellite has re-entered; code is forced to 'D'.
 * The scripts/update-celestrak.js already applies this rule when writing the
 * static file, so the Map values are always a single-char code.
 */

import { log } from '../utils/logger';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Static file produced by scripts/update-celestrak.js — same-origin, no CORS. */
const LOCAL_SATCAT_FILE = '/satcat-status.json';

/**
 * CelesTrak public SATCAT CSV (may be blocked by CORS in browsers — the static
 * file is the primary source; this is a last-resort fallback only).
 */
const SATCAT_LIVE_URL = 'https://celestrak.org/pub/satcat.csv';

/** 24 h cache TTL — status codes change rarely. */
const SATCAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_KEY_DATA = 'satcat_data';
const CACHE_KEY_TS   = 'satcat_ts';
const FORCE_LOCAL_CELESTRAK = String(import.meta.env.VITE_FORCE_LOCAL_CELESTRAK ?? '').toLowerCase() === 'true';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Compact map: NORAD catalog ID (string) → effective OPS_STATUS_CODE. */
export type SatcatStatusMap = Map<string, string>;

/** One raw SATCAT JSON record from the live CelesTrak endpoint. */
interface SatcatRecord {
  NORAD_CAT_ID:    number;
  OPS_STATUS_CODE: string;
  DECAY:           string | null;
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

function isCacheValid(): boolean {
  try {
    const ts = localStorage.getItem(CACHE_KEY_TS);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < SATCAT_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function readRawFromCache(): string | null {
  try { return localStorage.getItem(CACHE_KEY_DATA); } catch { return null; }
}

function writeRawToCache(compact: string): void {
  try {
    localStorage.setItem(CACHE_KEY_DATA, compact);
    localStorage.setItem(CACHE_KEY_TS, String(Date.now()));
  } catch (e) {
    console.warn('[SATCAT] localStorage write failed:', e);
  }
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/**
 * Deserialise a compact JSON object string (plain object) → Map.
 * The static file and localStorage both store the same format:
 *   { "28187": "+", "41310": "-", … }
 */
function parseCompact(raw: string): SatcatStatusMap | null {
  try {
    const obj = JSON.parse(raw) as Record<string, string>;
    if (typeof obj !== 'object' || Array.isArray(obj)) return null;
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

/**
 * Build a status Map from the raw CelesTrak SATCAT JSON array.
 * Forces 'D' when DECAY is non-null (satellite has re-entered).
 */
function buildStatusMap(records: SatcatRecord[]): SatcatStatusMap {
  const map: SatcatStatusMap = new Map();
  for (const rec of records) {
    const code = rec.DECAY !== null ? 'D' : rec.OPS_STATUS_CODE;
    map.set(String(rec.NORAD_CAT_ID), code);
  }
  return map;
}

function serializeMap(map: SatcatStatusMap): string {
  return JSON.stringify(Object.fromEntries(map));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a Map<noradId, effectiveOpsStatusCode>, or **null** when no data is
 * available.  A null return means the caller should treat all satellites as
 * operational rather than rendering everything in "unknown" gray.
 *
 * Resolution order:
 *   1. localStorage (fresh, < 24 h)
 *   2. /satcat-status.json  (static file, same-origin — always works)
 *   3. localStorage (stale)
 *   4. CelesTrak live API  (may be blocked by CORS)
 *   5. null
 */
export async function fetchSatcatStatusMap(): Promise<SatcatStatusMap | null> {
  if (FORCE_LOCAL_CELESTRAK) {
    try {
      const resp = await fetch(LOCAL_SATCAT_FILE);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const raw = await resp.text();
      const map = parseCompact(raw);
      if (map && map.size > 0) {
        log(`[SATCAT] VITE_FORCE_LOCAL_CELESTRAK=true -> ${map.size} records from ${LOCAL_SATCAT_FILE}.`);
        writeRawToCache(raw);
        return map;
      }
    } catch (error) {
      console.warn('[SATCAT] Forced local mode failed to load static SATCAT file:', error);
      const staleRaw = readRawFromCache();
      if (staleRaw) {
        const map = parseCompact(staleRaw);
        if (map && map.size > 0) {
          console.warn(`[SATCAT] Using stale cache (${map.size} records) because forced local static SATCAT is unavailable.`);
          return map;
        }
      }
      return null;
    }
  }

  // 1. Fresh localStorage cache
  if (isCacheValid()) {
    const raw = readRawFromCache();
    if (raw) {
      const map = parseCompact(raw);
      if (map && map.size > 0) {
        log(`[SATCAT] ${map.size} records from localStorage cache.`);
        return map;
      }
    }
  }

  // 2. Local static file (generated by scripts/update-celestrak.js, no CORS)
  try {
    const resp = await fetch(LOCAL_SATCAT_FILE);
    if (resp.ok) {
      const raw = await resp.text();
      const map = parseCompact(raw);
      if (map && map.size > 0) {
        log(`[SATCAT] ${map.size} records from ${LOCAL_SATCAT_FILE}.`);
        writeRawToCache(raw); // promote to localStorage for next time
        return map;
      }
    }
  } catch {
    // File not present or fetch error — continue to next fallback
  }

  // 3. Stale localStorage (better than nothing)
  const staleRaw = readRawFromCache();
  if (staleRaw) {
    const map = parseCompact(staleRaw);
    if (map && map.size > 0) {
      console.warn(`[SATCAT] Using stale cache (${map.size} records). Run npm run update-celestrak to refresh.`);
      return map;
    }
  }

  // 4. CelesTrak live CSV (last resort — CORS may block in browsers)
  try {
    log('[SATCAT] Attempting live CelesTrak SATCAT CSV…');
    const resp = await fetch(SATCAT_LIVE_URL);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const csvText = await resp.text();
    const lines = csvText.trim().split('\n');
    const header = lines[0].split(',');
    const COL_NORAD  = header.indexOf('NORAD_CAT_ID');
    const COL_STATUS = header.indexOf('OPS_STATUS_CODE');
    const COL_DECAY  = header.indexOf('DECAY_DATE');
    if (COL_NORAD < 0 || COL_STATUS < 0 || COL_DECAY < 0) {
      throw new Error('Unexpected CSV header.');
    }

    const records: SatcatRecord[] = lines.slice(1).map((line) => {
      const cols = line.split(',');
      return {
        NORAD_CAT_ID:    parseInt(cols[COL_NORAD], 10),
        OPS_STATUS_CODE: cols[COL_STATUS]?.trim() ?? '',
        DECAY:           cols[COL_DECAY]?.trim() || null,
      };
    }).filter((r) => !isNaN(r.NORAD_CAT_ID));

    const map = buildStatusMap(records);
    writeRawToCache(serializeMap(map));
    log(`[SATCAT] ${map.size} records from live CSV.`);
    return map;
  } catch (liveError) {
    console.warn('[SATCAT] Live CSV unavailable:', liveError);
  }

  // 5. No data at all — caller defaults all satellites to operational
  console.warn('[SATCAT] No SATCAT data available. Run: npm run update-celestrak');
  return null;
}
