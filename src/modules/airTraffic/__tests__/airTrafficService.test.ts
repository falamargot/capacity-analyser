import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAircraftCache, getAircraftData } from '../airTrafficService';
beforeEach(() => { clearAircraftCache(); vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('air traffic evidence', () => {
  it.each([{ ok: false }, { ok: true, json: async () => ({ aircraft: [] }) },
    { ok: true, json: async () => ({ aircraft: [{ callsign: 'AF1234' }], meta: { source: 'mock' } }) }])('never invents aircraft on unavailable or mock responses', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await getAircraftData()).toEqual([]);
  });
  it('returns no aircraft on connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getAircraftData()).toEqual([]);
  });
  it('keeps the last good positions through a transient failure', async () => {
    const aircraft = [{ icao24: 'abc123', callsign: 'TEST' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aircraft, meta: { source: 'opensky' } }) }));
    expect(await getAircraftData()).toEqual(aircraft);

    // The proxy hiccups. An empty answer must not be written into the cache:
    // doing so blanks the layer for the whole cache duration over an outage
    // that may last a second, and the next poll would not even re-try.
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start + 61_000); // past CACHE_DURATION
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await getAircraftData()).toEqual(aircraft);

    // ...and the very next poll re-tries, rather than being told by a cached
    // emptiness to wait out the minute.
    const fetchAgain = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aircraft, meta: { source: 'opensky' } }) });
    vi.stubGlobal('fetch', fetchAgain);
    expect(await getAircraftData()).toEqual(aircraft);
    expect(fetchAgain).toHaveBeenCalledTimes(1);
  });
  it('caches real responses without substituting or inferring fields', async () => {
    const aircraft = [{ icao24: 'abc123', callsign: 'TEST' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ aircraft, meta: { source: 'opensky' } }) }));
    expect(await getAircraftData()).toEqual(aircraft);
    expect(await getAircraftData()).toEqual(aircraft);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
