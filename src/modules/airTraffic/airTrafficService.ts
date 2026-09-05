import { log } from '../../utils/logger';

export interface Aircraft {
  icao24: string;
  callsign: string;
  latitude: number | null;
  longitude: number | null;
  baro_altitude: number | null;
  velocity: number | null;
  heading: number | null;
  on_ground: boolean;
  last_contact: number | null;
  altitude_km: number | null;
  speed_kmh: number | null;
}

interface AirTrafficBackendResponse {
  aircraft: Aircraft[];
  meta?: {
    source: 'opensky' | 'unavailable' | 'mock';
    authenticated: boolean;
    note?: string;
  };
}

interface FocusPoint {
  lat: number;
  lng: number;
}

type CacheEntry = {
  aircraft: Aircraft[];
  lastFetchTime: number;
};

const API_BASE = (
  (import.meta.env.VITE_LOCAL_API_BASE as string | undefined)
  ?? (import.meta.env.VITE_REGULATORY_API_BASE as string | undefined)
  ?? 'http://localhost:3001'
).replace(/\/$/, '');

const CACHE_DURATION = 60_000;
// LRU bound: each entry can hold thousands of aircraft (full OpenSky payload),
// so the cap is much tighter than for regulatoryService. 32 buckets covers
// recent panning history without unbounded growth.
const AIRCRAFT_CACHE_MAX_ENTRIES = 32;
const aircraftCache = new Map<string, CacheEntry>();

const getCacheKey = (_focusPoint?: FocusPoint | null): string => 'global';

const aircraftCacheGet = (key: string): CacheEntry | undefined => {
  const value = aircraftCache.get(key);
  if (value !== undefined) {
    aircraftCache.delete(key);
    aircraftCache.set(key, value);
  }
  return value;
};

const aircraftCacheSet = (key: string, value: CacheEntry): void => {
  if (aircraftCache.has(key)) aircraftCache.delete(key);
  aircraftCache.set(key, value);
  if (aircraftCache.size > AIRCRAFT_CACHE_MAX_ENTRIES) {
    const oldestKey = aircraftCache.keys().next().value;
    if (oldestKey !== undefined) aircraftCache.delete(oldestKey);
  }
};


export function clearAircraftCache(): void {
  aircraftCache.clear();
}

export async function fetchAircraftData(_focusPoint?: FocusPoint | null): Promise<Aircraft[]> {
  try {
    log('🛩️ Fetching aircraft data from local OpenSky proxy...');
    const url = new URL(`${API_BASE}/api/air-traffic`);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`🛩️ Air traffic proxy returned HTTP ${response.status}, no aircraft data available`);
      return [];
    }

    const data = await response.json() as AirTrafficBackendResponse;

    if (data.meta?.source === 'mock' || data.meta?.source === 'unavailable') {
      console.warn(`🛩️ Air traffic proxy has no live data${data.meta.note ? `: ${data.meta.note}` : ''}`);
      return [];
    }

    if (!Array.isArray(data.aircraft) || data.aircraft.length === 0) {
      console.warn('🛩️ Air traffic proxy returned no aircraft, no aircraft data available');
      return [];
    }

    log(`🛩️ Received ${data.aircraft.length} aircraft from local OpenSky proxy`);
    return data.aircraft;
  } catch (error) {
    console.warn('🛩️ Failed to fetch aircraft data from local proxy, no aircraft data available:', error);
    return [];
  }
}

export async function getAircraftData(focusPoint: FocusPoint | null = null): Promise<Aircraft[]> {
  const cacheKey = getCacheKey(focusPoint);
  const cached = aircraftCacheGet(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.lastFetchTime) < CACHE_DURATION) {
    return cached.aircraft;
  }

  const freshData = await fetchAircraftData(focusPoint);
  /*
   * An empty result is never cached.
   *
   * `fetchAircraftData` returns `[]` for every failure — a proxy 502, a dropped
   * connection, OpenSky with nothing usable — which is right: inventing mock
   * aircraft was worse. But writing that emptiness into the cache with a fresh
   * timestamp blanks the layer for the whole `CACHE_DURATION`, so a one-second
   * outage costs a minute of aircraft. The last good positions are served
   * instead, and the next poll re-tries immediately rather than in a minute.
   */
  if (freshData.length > 0) {
    aircraftCacheSet(cacheKey, {
      aircraft: freshData,
      lastFetchTime: now,
    });
    return freshData;
  }
  return cached?.aircraft ?? [];
}

export function filterAircraftByView(
  aircraft: Aircraft[],
  _cameraBounds: unknown,
  _focusPoint: unknown,
  maxAircraft: number = 6000
): Aircraft[] {
  // Sort highest-altitude commercial aircraft first — this provides good global
  // geographic spread since long-haul routes cover all continents. Cesium handles
  // frustum culling for aircraft outside the camera viewport, so no JS-level clip
  // is needed. The cap keeps the 60fps interpolation loop bounded.
  return aircraft
    .filter((ac) => ac.latitude !== null && ac.longitude !== null)
    .sort((a, b) => (b.altitude_km ?? 0) - (a.altitude_km ?? 0))
    .slice(0, maxAircraft);
}
