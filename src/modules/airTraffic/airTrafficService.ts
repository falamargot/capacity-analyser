import { log } from '../../utils/logger';
/**
 * Air Traffic Service
 * Handles fetching and caching of ADS-B aircraft data from OpenSky Network API
 */

export interface Aircraft {
  // OpenSky API fields
  icao24: string;
  callsign: string;
  latitude: number | null;
  longitude: number | null;
  baro_altitude: number | null; // meters
  velocity: number | null; // m/s
  heading: number | null; // degrees
  on_ground: boolean;
  last_contact: number;
  // Computed fields
  altitude_km: number | null;
  speed_kmh: number | null;
}

export interface AirTrafficResponse {
  time: number;
  states: any[][]; // Raw OpenSky states array
}

// Cache for aircraft data
let aircraftCache: Aircraft[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60000; // 60 seconds

/**
 * Fetch aircraft data from OpenSky Network API
 * Falls back to mock data if API is unavailable
 */
export async function fetchAircraftData(): Promise<Aircraft[] | null> {
  try {
    log('🛩️ Fetching aircraft data from OpenSky API...');
    const response = await fetch('https://opensky-network.org/api/states/all', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      console.warn(`🛩️ API returned HTTP ${response.status}, using mock data`);
      return getMockAircraftData();
    }

    const data: AirTrafficResponse = await response.json();

    if (!data.states || !Array.isArray(data.states)) {
      console.warn('🛩️ Invalid API response, using mock data');
      return getMockAircraftData();
    }

    log(`🛩️ Received ${data.states.length} aircraft states from API`);

    // Parse and filter aircraft data
    const aircraft: Aircraft[] = data.states
      .filter(state => state && state.length >= 17)
      .map(state => {
        const [
          icao24, callsign, , ,
          last_contact, longitude, latitude, baro_altitude,
          on_ground, velocity, heading
        ] = state;

        // Convert to our Aircraft interface
        const aircraft: Aircraft = {
          icao24,
          callsign: callsign?.trim() || '',
          latitude,
          longitude,
          baro_altitude,
          velocity,
          heading,
          on_ground: !!on_ground,
          last_contact,
          altitude_km: baro_altitude ? baro_altitude / 1000 : null,
          speed_kmh: velocity ? velocity * 3.6 : null
        };

        return aircraft;
      })
      .filter(aircraft => {
        // Apply performance filters
        if (!aircraft.latitude || !aircraft.longitude) return false;
        if (aircraft.on_ground) return false;
        if (!aircraft.altitude_km || aircraft.altitude_km < 5.0) return false; // Below 5000m
        if (!aircraft.callsign) return false; // Require callsign for display

        return true;
      });

    log(`🛩️ Filtered to ${aircraft.length} valid aircraft`);
    return aircraft;
  } catch (error) {
    console.warn('🛩️ Failed to fetch aircraft data, using mock data:', error);
    return getMockAircraftData();
  }
}

/**
 * Generate mock aircraft data for testing
 */
function getMockAircraftData(): Aircraft[] {
  log('🛩️ Using mock aircraft data');
  
  return [
    {
      icao24: 'a80897',
      callsign: 'AF1234',
      latitude: 48.8566,
      longitude: 2.3522,
      baro_altitude: 10668, // 35,000 feet
      velocity: 250, // m/s
      heading: 270,
      on_ground: false,
      last_contact: Date.now() / 1000,
      altitude_km: 10.668,
      speed_kmh: 900
    },
    {
      icao24: 'a1b2c3',
      callsign: 'LH5678',
      latitude: 51.5074,
      longitude: -0.1278,
      baro_altitude: 11277, // 37,000 feet
      velocity: 240,
      heading: 90,
      on_ground: false,
      last_contact: Date.now() / 1000,
      altitude_km: 11.277,
      speed_kmh: 864
    },
    {
      icao24: 'd4e5f6',
      callsign: 'BA9012',
      latitude: 40.7128,
      longitude: -74.0060,
      baro_altitude: 11887, // 39,000 feet
      velocity: 260,
      heading: 45,
      on_ground: false,
      last_contact: Date.now() / 1000,
      altitude_km: 11.887,
      speed_kmh: 936
    }
  ];
}

/**
 * Release the in-memory aircraft cache.
 * Call when the air traffic feature is disabled so the full OpenSky dataset
 * (up to ~10 000 Aircraft objects) is not retained until the next fetch cycle.
 */
export function clearAircraftCache(): void {
  aircraftCache = [];
  lastFetchTime = 0;
}

/**
 * Get cached aircraft data or fetch fresh data if cache is expired
 */
export async function getAircraftData(): Promise<Aircraft[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (aircraftCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
    return aircraftCache;
  }

  // Fetch fresh data
  const freshData = await fetchAircraftData();

  if (freshData && freshData.length > 0) {
    aircraftCache = freshData;
    lastFetchTime = now;
  }

  return aircraftCache;
}

/**
 * Filter aircraft based on camera bounds, then sort by relevance and apply a hard cap.
 *
 * Relevance priority:
 *  - If a focusPoint is provided: closest aircraft first (most useful for current analysis)
 *  - Otherwise: highest altitude first (commercial cruising traffic = most visible/important)
 *
 * This ensures global coverage while guaranteeing the most relevant aircraft are always
 * within the rendering budget when the cap is reached.
 */
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

  // Filter by camera bounds if available
  if (cameraBounds) {
    filtered = filtered.filter(ac =>
      ac.latitude !== null &&
      ac.longitude !== null &&
      ac.latitude >= cameraBounds.south &&
      ac.latitude <= cameraBounds.north &&
      ac.longitude >= cameraBounds.west &&
      ac.longitude <= cameraBounds.east
    );
  }

  // Sort by relevance so the most useful aircraft are kept when the cap is reached
  if (focusPoint) {
    // Closest to analysis point first
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
    // Highest altitude first (commercial cruising traffic priority)
    filtered = [...filtered].sort((a, b) => (b.altitude_km ?? 0) - (a.altitude_km ?? 0));
  }

  // Apply hard cap
  return filtered.slice(0, maxAircraft);
}
