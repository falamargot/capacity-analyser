import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAirTrafficSnapshot, resetAirTrafficCacheForTests } from '../openSkyService';

// A single state array shaped exactly as parseAircraft expects:
// [icao24, callsign, _, _, last_contact, longitude, latitude, baro_altitude, on_ground, velocity, heading]
const oneAircraftState = ['abc123', 'TEST123 ', null, null, 1_700_000_000, 2.35, 48.85, 10000, false, 200, 90];

function mockOpenSkyResponse() {
  return {
    ok: true,
    json: async () => ({ time: 1_700_000_000, states: [oneAircraftState] }),
  };
}

// SEC-1 regression: without a server-side cache, every call to
// fetchAirTrafficSnapshot() (one per poll, per client tab) triggered its own
// fresh OpenSky fetch — a handful of concurrent clients could exhaust the
// account's shared authenticated rate limit.
describe('fetchAirTrafficSnapshot — snapshot cache + in-flight coalescing', () => {
  beforeEach(() => {
    resetAirTrafficCacheForTests();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockOpenSkyResponse()));
    vi.stubEnv('OPENSKY_CLIENT_ID', undefined);
    vi.stubEnv('OPENSKY_CLIENT_SECRET', undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('serves a second call from cache without hitting fetch again', async () => {
    const first = await fetchAirTrafficSnapshot();
    const second = await fetchAirTrafficSnapshot();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // same cached object, not just equal
    expect(first.aircraft).toHaveLength(1);
    expect(first.aircraft[0]!.icao24).toBe('abc123');
  });

  it('coalesces concurrent cache-miss callers into a single upstream fetch', async () => {
    const [a, b, c] = await Promise.all([
      fetchAirTrafficSnapshot(),
      fetchAirTrafficSnapshot(),
      fetchAirTrafficSnapshot(),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('fetches again once the cache TTL has elapsed', async () => {
    await fetchAirTrafficSnapshot();
    expect(fetch).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(8_001);

    await fetchAirTrafficSnapshot();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('returns unavailable evidence rather than invented flights on an upstream error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    const result = await fetchAirTrafficSnapshot();
    expect(result.aircraft).toEqual([]);
    expect(result.meta.source).toBe('unavailable');
  });
  it('preserves an empty upstream snapshot without fabricated flights', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ states: [] }) } as Response);
    expect((await fetchAirTrafficSnapshot()).aircraft).toEqual([]);
  });

});
