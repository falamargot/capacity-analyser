import * as satellite from 'satellite.js';
import { SatelliteData } from '../types/satellites';
import { loadSatelliteCoverage } from './coverageService';
import { log } from '../utils/logger';

// ─── TLE Cache Configuration ─────────────────────────────────────────────────
// TTL of 30 minutes: fresh enough for accurate SGP4 propagation, lenient enough
// to avoid CelesTrak rate-limits during development (multiple hot-reloads).
const TLE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const CELESTRAK_API = {
  EUTELSAT: 'https://celestrak.org/NORAD/elements/gp.php?NAME=EUTELSAT&FORMAT=tle',
  ONEWEB: 'https://celestrak.org/NORAD/elements/gp.php?NAME=ONEWEB&FORMAT=tle'
};

// Fallback static file (used ONLY if both localStorage cache is empty AND API fails)
const CELESTRAK_FILE = {
  EUTELSAT: '/celestrak.txt',
  ONEWEB: '/celestrak.txt'
};

const CACHE_KEYS = {
  EUTELSAT_TLE: 'tle_eutelsat_data',
  EUTELSAT_TS: 'tle_eutelsat_ts',
  ONEWEB_TLE: 'tle_oneweb_data',
  ONEWEB_TS: 'tle_oneweb_ts',
};

// ─── localStorage TLE Cache Helpers ──────────────────────────────────────────

function isCacheValid(tsKey: string): boolean {
  try {
    const ts = localStorage.getItem(tsKey);
    if (!ts) return false;
    return Date.now() - parseInt(ts, 10) < TLE_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function readFromCache(dataKey: string): string | null {
  try {
    return localStorage.getItem(dataKey);
  } catch {
    return null;
  }
}

function writeToCache(dataKey: string, tsKey: string, data: string): void {
  try {
    localStorage.setItem(dataKey, data);
    localStorage.setItem(tsKey, String(Date.now()));
  } catch (e) {
    // If localStorage is full/unavailable, silently skip
    console.warn('[TLE Cache] Failed to write to localStorage:', e);
  }
}

/**
 * Fetch TLE data for a given operator with cache-first strategy:
 *   1. Return localStorage entry if < TTL_MS old.
 *   2. Try CelesTrak live API; if successful, update cache.
 *   3. If API fails but stale cache exists, use stale cache (better than nothing).
 *   4. Last resort: fall back to bundled static file.
 */
async function fetchTLE(
  operator: 'EUTELSAT' | 'ONEWEB',
  dataKey: string,
  tsKey: string
): Promise<string> {
  // 1. Cache hit (fresh)
  if (isCacheValid(tsKey)) {
    const cached = readFromCache(dataKey);
    if (cached) {
      log(`[TLE Cache] Serving fresh ${operator} TLEs from localStorage.`);
      return cached;
    }
  }

  // 2. Try live API
  try {
    log(`[TLE Cache] Fetching fresh ${operator} TLEs from CelesTrak…`);
    const resp = await fetch(CELESTRAK_API[operator]);
    if (resp.ok) {
      const text = await resp.text();
      if (text.trim().length > 100) { // Sanity check: not an error page
        writeToCache(dataKey, tsKey, text);
        return text;
      }
    }
    throw new Error(`Bad response from CelesTrak: ${resp.status}`);
  } catch (apiError) {
    console.warn(`[TLE Cache] CelesTrak API failed for ${operator}:`, apiError);

    // 3. Stale cache fallback
    const stale = readFromCache(dataKey);
    if (stale) {
      console.warn(`[TLE Cache] Using stale ${operator} TLEs from localStorage (age > ${TLE_CACHE_TTL_MS / 60000} min).`);
      return stale;
    }

    // 4. Last resort: bundled static file
    console.warn(`[TLE Cache] Falling back to bundled static file for ${operator}.`);
    const fileResp = await fetch(CELESTRAK_FILE[operator]);
    return await fileResp.text();
  }
}

// ─── TLE Parsing ─────────────────────────────────────────────────────────────

export interface SatRecSatellite {
  satrec: any;
  name: string;
  noradId: string;
}

function parseTLE(tleData: string, operator: string) {
  const lines = tleData.split('\n').filter(line => line.trim());
  const satellites = [];

  for (let i = 0; i < lines.length; i += 3) {
    if (i + 2 >= lines.length) break;

    const name = lines[i].trim();
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    const satrec = satellite.twoline2satrec(line1, line2);
    if (satrec && name.includes(operator)) {
      satellites.push({
        name,
        satrec,
        noradId: line1.substring(2, 7).trim()
      });
    }
  }
  return satellites;
}

// ─── Position Calculation ─────────────────────────────────────────────────────

export function calculatePosition(sat: any, date: Date = new Date()) {
  const positionAndVelocity = satellite.propagate(sat.satrec, date);
  const gmst = satellite.gstime(date);

  if (positionAndVelocity && positionAndVelocity.position && typeof positionAndVelocity.position !== 'boolean') {
    const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
    return {
      lat: satellite.degreesLat(geoPosition.latitude),
      lng: satellite.degreesLong(geoPosition.longitude),
      alt: geoPosition.height
    };
  }

  return { lat: 0, lng: 0, alt: 0 };
}

// ─── Main Fetch Entry Point ───────────────────────────────────────────────────

export async function fetchSatellites(): Promise<SatelliteData[]> {
  try {
    const [eutelsatTLE, onewebTLE] = await Promise.all([
      fetchTLE('EUTELSAT', CACHE_KEYS.EUTELSAT_TLE, CACHE_KEYS.EUTELSAT_TS),
      fetchTLE('ONEWEB', CACHE_KEYS.ONEWEB_TLE, CACHE_KEYS.ONEWEB_TS),
    ]);

    const eutelsatSats = parseTLE(eutelsatTLE, 'EUTELSAT');
    const onewebSats = parseTLE(onewebTLE, 'ONEWEB');

    log(`[fetchSatellites] ${eutelsatSats.length} EUTELSAT + ${onewebSats.length} ONEWEB satellites loaded.`);

    const eutelsatSatPromises = eutelsatSats.map(async (sat) => {
      const coverageData = await loadSatelliteCoverage(sat.noradId, sat.name, 'EUTELSAT', 10);
      return {
        id: sat.noradId,
        name: sat.name,
        noradId: sat.noradId,
        type: 'EUTELSAT' as const,
        orbitType: 'GEO' as const,
        satrec: sat.satrec,
        position: calculatePosition(sat),
        referenced_coverages: coverageData || { type: 'FeatureCollection' as const, features: [] },
        coverages: coverageData ? coverageData.features.map((feature, index) => ({
          name: `${sat.name}_beam_${index + 1}`,
          feature: feature
        })) : [{
          name: sat.name,
          feature: { type: 'Feature' as const, properties: {}, geometry: null as any }
        }],
        capacity: {
          maxThroughput: 100,
          bandwidth: { ku: 500, ka: 300, c: 200 },
          availability: 0.99
        }
      };
    });

    const onewebSatPromises = onewebSats.map(async (sat) => {
      const coverageData = await loadSatelliteCoverage(sat.noradId, sat.name, 'ONEWEB', 600);
      return {
        id: sat.noradId,
        name: sat.name,
        noradId: sat.noradId,
        type: 'ONEWEB' as const,
        orbitType: 'LEO' as const,
        satrec: sat.satrec,
        position: calculatePosition(sat),
        referenced_coverages: coverageData || { type: 'FeatureCollection' as const, features: [] },
        coverages: coverageData ? coverageData.features.map((feature, index) => ({
          name: `${sat.name}_zone_${index + 1}`,
          feature: feature
        })) : [{
          name: sat.name,
          feature: { type: 'Feature' as const, properties: {}, geometry: null as any }
        }],
        capacity: {
          maxThroughput: 8,
          bandwidth: { ku: 250, ka: 150, c: 100 },
          availability: 0.99
        }
      };
    });

    const satellites: SatelliteData[] = [
      ...await Promise.all(eutelsatSatPromises),
      ...await Promise.all(onewebSatPromises)
    ];
    return satellites;
  } catch (error) {
    console.error('Error fetching satellite data:', error);
    return [];
  }
}