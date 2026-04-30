import * as satellite from 'satellite.js';

export interface IssPosition {
  lat: number;
  lng: number;
  altKm: number;
  velocityKmS: number;
  timestamp: number;
}

export interface IssTle {
  line1: string;
  line2: string;
  fetchedAt: number;
}

export interface IssOrbitPath {
  past: { lat: number; lng: number; altKm: number }[];
  future: { lat: number; lng: number; altKm: number }[];
  computedAt: number;
}

const ISS_NORAD_ID = 25544;
const TLE_CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
const ORBIT_STEP_MINUTES = 2;
const PAST_MINUTES = 30;
const FUTURE_MINUTES = 90;
const CONFIGURED_API_BASE = (
  (import.meta.env.VITE_LOCAL_API_BASE as string | undefined)
  ?? (import.meta.env.VITE_REGULATORY_API_BASE as string | undefined)
  ?? (import.meta.env.VITE_API_URL as string | undefined)
)?.replace(/\/$/, '');
const ISS_TLE_URLS = [
  '/api/iss/tle',
  CONFIGURED_API_BASE ? `${CONFIGURED_API_BASE}/api/iss/tle` : 'http://localhost:3001/api/iss/tle',
  `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=TLE`,
];

let cachedTle: IssTle | null = null;

async function fetchTleTextFromUrl(url: string): Promise<IssTle> {
  const res = await fetch(url, { signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const line1 = lines.find((l) => l.startsWith('1 '));
  const line2 = lines.find((l) => l.startsWith('2 '));
  if (!line1 || !line2) throw new Error('TLE lines not found in response');
  return { line1, line2, fetchedAt: Date.now() };
}

async function fetchTleText(): Promise<IssTle> {
  const errors: string[] = [];

  for (const url of ISS_TLE_URLS) {
    try {
      return await fetchTleTextFromUrl(url);
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(errors.join(' | '));
}

export async function fetchIssTle(): Promise<IssTle> {
  const now = Date.now();

  if (cachedTle && now - cachedTle.fetchedAt < TLE_CACHE_DURATION_MS) {
    return cachedTle;
  }

  try {
    const tle = await fetchTleText();
    cachedTle = tle;
    return tle;
  } catch (err) {
    if (cachedTle) return cachedTle;
    throw new Error(`ISS TLE unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function propagateIss(tle: IssTle, date: Date): IssPosition | null {
  try {
    const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
    const posvel = satellite.propagate(satrec, date);

    if (!posvel.position || typeof posvel.position === 'boolean') return null;
    if (!posvel.velocity || typeof posvel.velocity === 'boolean') return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(posvel.position, gmst);

    const lat = satellite.degreesLat(geo.latitude);
    const lng = satellite.degreesLong(geo.longitude);
    const altKm = geo.height;

    if (!isFinite(lat) || !isFinite(lng) || !isFinite(altKm)) return null;

    const v = posvel.velocity;
    const velocityKmS = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

    return { lat, lng, altKm, velocityKmS, timestamp: date.getTime() };
  } catch {
    return null;
  }
}

function sampleOrbitPoint(
  satrec: satellite.SatRec,
  date: Date,
): { lat: number; lng: number; altKm: number } | null {
  try {
    const posvel = satellite.propagate(satrec, date);
    if (!posvel.position || typeof posvel.position === 'boolean') return null;

    const gmst = satellite.gstime(date);
    const geo = satellite.eciToGeodetic(posvel.position, gmst);
    const lat = satellite.degreesLat(geo.latitude);
    const lng = satellite.degreesLong(geo.longitude);
    const altKm = geo.height;

    if (!isFinite(lat) || !isFinite(lng) || !isFinite(altKm)) return null;
    return { lat, lng, altKm };
  } catch {
    return null;
  }
}

export function computeIssOrbitPath(tle: IssTle, now: Date): IssOrbitPath {
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2);
  const past: { lat: number; lng: number; altKm: number }[] = [];
  const future: { lat: number; lng: number; altKm: number }[] = [];

  for (let i = PAST_MINUTES; i >= 0; i -= ORBIT_STEP_MINUTES) {
    const t = new Date(now.getTime() - i * 60 * 1000);
    const pt = sampleOrbitPoint(satrec, t);
    if (pt) past.push(pt);
  }

  for (let i = 0; i <= FUTURE_MINUTES; i += ORBIT_STEP_MINUTES) {
    const t = new Date(now.getTime() + i * 60 * 1000);
    const pt = sampleOrbitPoint(satrec, t);
    if (pt) future.push(pt);
  }

  return { past, future, computedAt: now.getTime() };
}

export function clearIssTleCache(): void {
  cachedTle = null;
}
