const OPENSKY_API_BASE = 'https://opensky-network.org/api';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const TOKEN_REFRESH_MARGIN_MS = 30_000;

type OpenSkyState = any[];

interface OpenSkyResponse {
  time: number;
  states: OpenSkyState[] | null;
}

export interface ServerAircraft {
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

export interface AirTrafficSnapshot {
  aircraft: ServerAircraft[];
  meta: {
    source: 'opensky' | 'mock';
    authenticated: boolean;
    bbox: {
      lamin: number;
      lamax: number;
      lomin: number;
      lomax: number;
    };
    note?: string;
  };
}

type BoundingBox = {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
};

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

// All commercial aviation above FL164 (~5 km) worldwide — excludes polar regions
// where traffic is sparse enough to not warrant the latency cost.
const GLOBAL_BBOX: BoundingBox = { lamin: -80, lamax: 80, lomin: -180, lomax: 180 };

// How many aircraft the server sends to the client. The client further caps at 500
// (DEFAULT_CONFIG.maxAircraft). Sorting by altitude here ensures the highest-flying
// long-haul aircraft are kept, giving good global geographic spread.
const SERVER_MAX_AIRCRAFT = 600;

const getMockAircraftData = (): ServerAircraft[] => ([
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

const parseAircraft = (states: OpenSkyState[] | null): ServerAircraft[] => (
  (states ?? [])
    .filter((state) => Array.isArray(state) && state.length >= 11)
    .map((state): ServerAircraft => {
      const [
        icao24, callsign, , ,
        last_contact, longitude, latitude, baro_altitude,
        on_ground, velocity, heading,
      ] = state;

      return {
        icao24,
        callsign: callsign?.trim() || '',
        latitude,
        longitude,
        baro_altitude,
        velocity,
        heading,
        on_ground: !!on_ground,
        last_contact: last_contact ?? null,
        altitude_km: typeof baro_altitude === 'number' ? baro_altitude / 1000 : null,
        speed_kmh: typeof velocity === 'number' ? velocity * 3.6 : null,
      };
    })
    .filter((aircraft) => {
      if (aircraft.latitude == null || aircraft.longitude == null) return false;
      if (aircraft.on_ground) return false;
      if (aircraft.altitude_km == null || aircraft.altitude_km < 5.0) return false;
      if (!aircraft.callsign) return false;
      return true;
    })
);

const getAccessToken = async (): Promise<string | null> => {
  const clientId = process.env['OPENSKY_CLIENT_ID']?.trim();
  const clientSecret = process.env['OPENSKY_CLIENT_SECRET']?.trim();

  if (!clientId || !clientSecret) return null;

  if (cachedToken && Date.now() < cachedTokenExpiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return cachedToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetch(OPENSKY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`OpenSky token request failed with HTTP ${response.status}`);
  }

  const data = await response.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) {
    throw new Error('OpenSky token response did not include access_token');
  }

  cachedToken = data.access_token;
  cachedTokenExpiresAt = Date.now() + ((data.expires_in ?? 1800) * 1000);
  return cachedToken;
};

export async function fetchAirTrafficSnapshot(): Promise<AirTrafficSnapshot> {
  const bbox = GLOBAL_BBOX;
  let authenticated = false;

  try {
    const token = await getAccessToken();
    authenticated = !!token;

    const url = new URL(`${OPENSKY_API_BASE}/states/all`);
    url.searchParams.set('lamin', String(bbox.lamin));
    url.searchParams.set('lamax', String(bbox.lamax));
    url.searchParams.set('lomin', String(bbox.lomin));
    url.searchParams.set('lomax', String(bbox.lomax));

    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`OpenSky states request failed with HTTP ${response.status}`);
    }

    const data = await response.json() as OpenSkyResponse;
    const allAircraft = parseAircraft(data.states);
    if (allAircraft.length === 0) {
      return {
        aircraft: getMockAircraftData(),
        meta: {
          source: 'mock',
          authenticated,
          bbox,
          note: 'OpenSky returned no usable aircraft for the requested area.',
        },
      };
    }

    // Sort by altitude descending so long-haul commercial flights are prioritised
    // over lower GA traffic. The client takes the top 500 of these 600.
    const aircraft = allAircraft
      .sort((a, b) => (b.altitude_km ?? 0) - (a.altitude_km ?? 0))
      .slice(0, SERVER_MAX_AIRCRAFT);

    return {
      aircraft,
      meta: { source: 'opensky', authenticated, bbox },
    };
  } catch (error) {
    return {
      aircraft: getMockAircraftData(),
      meta: {
        source: 'mock',
        authenticated,
        bbox,
        note: error instanceof Error ? error.message : 'Unknown OpenSky error',
      },
    };
  }
}
