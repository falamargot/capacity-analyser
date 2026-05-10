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
    source: 'opensky' | 'mock';
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

const getCacheKey = (focusPoint: FocusPoint | null = null): string => {
  if (!focusPoint) return 'default';
  const latBucket = Math.round(focusPoint.lat * 2) / 2;
  const lngBucket = Math.round(focusPoint.lng * 2) / 2;
  return `${latBucket.toFixed(1)},${lngBucket.toFixed(1)}`;
};

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

const getMockAircraftData = (): Aircraft[] => ([
  {
    icao24: 'a80897',
    callsign: 'AF1234',
    latitude: 48.8566,
    longitude: 2.3522,
    baro_altitude: 10668,
    velocity: 250,
    heading: 270,
    on_ground: false,
    last_contact: Math.floor(Date.now() / 1000),
    altitude_km: 10.668,
    speed_kmh: 900,
  },
  {
    icao24: 'a1b2c3',
    callsign: 'LH5678',
    latitude: 50.1109,
    longitude: 8.6821,
    baro_altitude: 11277,
    velocity: 240,
    heading: 90,
    on_ground: false,
    last_contact: Math.floor(Date.now() / 1000),
    altitude_km: 11.277,
    speed_kmh: 864,
  },
  {
    icao24: 'd4e5f6',
    callsign: 'BA9012',
    latitude: 51.4700,
    longitude: -0.4543,
    baro_altitude: 11887,
    velocity: 260,
    heading: 45,
    on_ground: false,
    last_contact: Math.floor(Date.now() / 1000),
    altitude_km: 11.887,
    speed_kmh: 936,
  },
]);

export function clearAircraftCache(): void {
  aircraftCache.clear();
}

export async function fetchAircraftData(focusPoint: FocusPoint | null = null): Promise<Aircraft[] | null> {
  try {
    log('🛩️ Fetching aircraft data from local OpenSky proxy...');
    const url = new URL(`${API_BASE}/api/air-traffic`);
    if (focusPoint) {
      url.searchParams.set('lat', String(focusPoint.lat));
      url.searchParams.set('lng', String(focusPoint.lng));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`🛩️ Air traffic proxy returned HTTP ${response.status}, using mock data`);
      return getMockAircraftData();
    }

    const data = await response.json() as AirTrafficBackendResponse;
    if (!Array.isArray(data.aircraft) || data.aircraft.length === 0) {
      console.warn('🛩️ Air traffic proxy returned no aircraft, using mock data');
      return getMockAircraftData();
    }

    if (data.meta?.source === 'mock') {
      console.warn(`🛩️ Air traffic proxy is serving mock data${data.meta.note ? `: ${data.meta.note}` : ''}`);
    } else {
      log(`🛩️ Received ${data.aircraft.length} aircraft from local OpenSky proxy`);
    }

    return data.aircraft;
  } catch (error) {
    console.warn('🛩️ Failed to fetch aircraft data from local proxy, using mock data:', error);
    return getMockAircraftData();
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
  if (freshData && freshData.length > 0) {
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
  cameraBounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null,
  focusPoint: { lat: number; lng: number } | null,
  maxAircraft: number = 6000
): Aircraft[] {
  let filtered = aircraft;

  if (cameraBounds) {
    filtered = filtered.filter((ac) =>
      ac.latitude !== null &&
      ac.longitude !== null &&
      ac.latitude >= cameraBounds.south &&
      ac.latitude <= cameraBounds.north &&
      ac.longitude >= cameraBounds.west &&
      ac.longitude <= cameraBounds.east
    );
  }

  if (focusPoint) {
    const haversineKm = (lat: number, lng: number): number => {
      const R = 6371;
      const dLat = (lat - focusPoint.lat) * Math.PI / 180;
      const dLon = (lng - focusPoint.lng) * Math.PI / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(focusPoint.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    filtered = [...filtered].sort((a, b) =>
      haversineKm(a.latitude!, a.longitude!) - haversineKm(b.latitude!, b.longitude!)
    );
  } else {
    filtered = [...filtered].sort((a, b) => (b.altitude_km ?? 0) - (a.altitude_km ?? 0));
  }

  return filtered.slice(0, maxAircraft);
}
