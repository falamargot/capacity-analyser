import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CELESTRAK_FETCH_TIMEOUT_MS, fetchTLE, fetchWithTimeout,
} from '../satelliteService';

/**
 * A1 regression — the boot must survive a network that SWALLOWS the CelesTrak
 * request rather than refusing it.
 *
 * This is the failure the 2026-08-27 review hit: on a filtering network the
 * `fetch` promise simply never settles, so `fetchTLE`'s four-step ladder — fresh
 * cache, live API, stale cache, bundled file — was unreachable below step 2 and
 * the whole application held on "Loading satellite data and coverage…"
 * indefinitely. A rejecting fetch was never the problem; a PENDING one was.
 *
 * So every test here hands out a promise that is never resolved and never
 * rejected. Nothing short of that reproduces the defect: stubbing `fetch` to
 * reject would have passed against the broken code too.
 */

const BUNDLED_TLE = [
    'ONEWEB-0012',
    '1 44057U 19010A   26240.50000000  .00000100  00000-0  10000-3 0  9991',
    '2 44057  87.9000  15.2250 0002000  90.0000 270.0000 13.16000000 12345',
].join('\n');

/**
 * A fetch that never answers — the filtering-network behaviour, exactly.
 *
 * It stays pending until the signal aborts, then rejects, because that is what a
 * real `fetch` does. A stub that ignored the signal would hang the test rather
 * than exercise the deadline, and would be asserting against a `fetch` that does
 * not exist: the whole mechanism rests on the implementation honouring abort,
 * and both the browser and Node do.
 */
const pendingUntilAborted = (_url: string, init?: RequestInit) => (
    new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) {
            reject(new Error('aborted'));
            return;
        }
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })
);

const bundledResponse = () => Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(BUNDLED_TLE),
} as Response);

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('fetchWithTimeout — the deadline itself', () => {
    it('rejects a fetch that never settles, instead of hanging forever', async () => {
        vi.stubGlobal('fetch', vi.fn(pendingUntilAborted));
        await expect(fetchWithTimeout('https://celestrak.example/tle', 25)).rejects.toThrow();
    });

    it('aborts the request, so the connection is released and not merely ignored', async () => {
        // Resolving the promise instead of aborting would leave the socket open
        // and the ladder would still be blocked behind it on the next boot.
        let captured: AbortSignal | undefined;
        vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
            captured = init?.signal ?? undefined;
            return pendingUntilAborted(url, init);
        }));

        await expect(fetchWithTimeout('https://celestrak.example/tle', 25)).rejects.toThrow();
        expect(captured).toBeDefined();
        expect(captured!.aborted).toBe(true);
    });

    it('passes a healthy response straight through', async () => {
        vi.stubGlobal('fetch', vi.fn(bundledResponse));
        const response = await fetchWithTimeout('https://celestrak.example/tle', 25);
        expect(response.ok).toBe(true);
    });

    it('waits five seconds in production, not the millisecond the tests use', () => {
        // The injectable timeout is a test seam, not a behaviour change.
        expect(CELESTRAK_FETCH_TIMEOUT_MS).toBe(5_000);
    });
});

describe('fetchTLE — the ladder is reachable below step 2', () => {
    /**
     * Routes CelesTrak into a permanent hang and the bundled file to real
     * content, then reports which URLs were asked for. IndexedDB is absent in
     * this environment, so the cache steps degrade to "nothing here" on their
     * own — which is the same state a first-ever boot is in.
     */
    function stubNetwork() {
        const requested: string[] = [];
        vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
            requested.push(url);
            if (url.includes('celestrak.org')) return pendingUntilAborted(url, init);
            return bundledResponse();
        }));
        return requested;
    }

    it('falls back to the bundled file when the live call never answers', async () => {
        const requested = stubNetwork();

        const tle = await fetchTLE('ONEWEB', 'tle_oneweb_test', 25);

        expect(tle).toBe(BUNDLED_TLE);
        expect(requested.some((url) => url.includes('celestrak.org'))).toBe(true);
        expect(requested.some((url) => url.includes('celestrak.txt'))).toBe(true);
    });

    it('resolves in the time the deadline allows, not indefinitely', async () => {
        stubNetwork();

        const startedAt = Date.now();
        await fetchTLE('EUTELSAT', 'tle_eutelsat_test', 25);

        // Generous: the assertion that matters is that it TERMINATES. Before the
        // fix this promise never settled and the test would have timed out.
        expect(Date.now() - startedAt).toBeLessThan(2_000);
    });

    it('returns the live payload untouched when CelesTrak does answer', async () => {
        const live = `${BUNDLED_TLE}\nLIVE MARKER — long enough to pass the sanity check on length`;
        vi.stubGlobal('fetch', vi.fn((url: string) => (
            url.includes('celestrak.org')
                ? Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(live) } as Response)
                : bundledResponse()
        )));

        expect(await fetchTLE('ONEWEB', 'tle_oneweb_test', 25)).toBe(live);
    });
});
