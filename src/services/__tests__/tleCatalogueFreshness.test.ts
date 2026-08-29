/**
 * The offline half of the TLE ladder: which catalogue wins when CelesTrak is
 * unreachable.
 *
 * The rung order used to decide, and it was wrong in both directions. Preferring
 * the stale cache served March data on 2026-08-29, minutes after
 * `public/celestrak.txt` had been refreshed to August — a cache entry is "stale"
 * 30 minutes after it was written, which says nothing about how old the elements
 * inside it are. Inverting the order is wrong just as often: a cache written by
 * a live fetch two hours ago beats a bundled file from last month's build.
 *
 * So the epochs decide. These tests pin that, including the two cases where a
 * naive comparison silently picks the older set.
 */

import { describe, expect, it } from 'vitest';
import { fresherCatalogue, newestTleEpochMs } from '../satelliteService';

/** A minimal, checksum-free two-line set — only the epoch field is read. */
const tle = (name: string, epochYear: string, epochDay: string): string => [
    name,
    `1 44057U 19010A   ${epochYear}${epochDay}  .00000064  00000+0  13249-3 0  9995`,
    '2 44057  87.9103 214.3389 0002256  97.6125 262.5262 13.16596511361132',
].join('\n');

/** Day 240 of 2026 — 28 August. */
const AUGUST = tle('ONEWEB-0012', '26', '240.90625737');
/** Day 83 of 2026 — 24 March, the epoch the bundled file carried for months. */
const MARCH = tle('ONEWEB-0012', '26', '083.19556101');

describe('newestTleEpochMs', () => {
    /* The day-of-year field carries a fraction, and it is part of the epoch:
       240.90625737 is 28 August at 21:45 UTC, not 28 August at midnight. */
    it('reads the epoch field of line 1, fraction included', () => {
        expect(new Date(newestTleEpochMs(AUGUST)!).toISOString())
            .toBe('2026-08-28T21:45:00.636Z');
        expect(new Date(newestTleEpochMs(MARCH)!).toISOString())
            .toBe('2026-03-24T04:41:36.471Z');
    });

    it('reports the NEWEST epoch, not the first', () => {
        expect(newestTleEpochMs(`${MARCH}\n${AUGUST}`)).toBe(newestTleEpochMs(AUGUST));
    });

    /* The pivot is fixed by the TLE format itself, not by this catalogue. */
    it('pivots the two-digit year at 57', () => {
        expect(newestTleEpochMs(tle('OLD', '57', '001.00000000')))
            .toBe(Date.UTC(1957, 0, 1));
        expect(newestTleEpochMs(tle('NEW', '56', '001.00000000')))
            .toBe(Date.UTC(2056, 0, 1));
    });

    it('returns null when nothing parses', () => {
        expect(newestTleEpochMs('')).toBeNull();
        expect(newestTleEpochMs('not a catalogue\nat all')).toBeNull();
    });
});

describe('fresherCatalogue', () => {
    /* The defect that prompted this: a refreshed bundled file losing to a cache
       entry that was merely past its 30-minute TTL. */
    it('prefers the bundled file when its elements are newer than the cache', () => {
        expect(fresherCatalogue(MARCH, AUGUST)).toEqual({ text: AUGUST, source: 'bundled' });
    });

    /* The mirror defect, which a blind reorder would have introduced. */
    it('prefers the stale cache when ITS elements are newer', () => {
        expect(fresherCatalogue(AUGUST, MARCH)).toEqual({ text: AUGUST, source: 'cache-stale' });
    });

    it('keeps the cache when the two carry the same epoch', () => {
        expect(fresherCatalogue(AUGUST, AUGUST)?.source).toBe('cache-stale');
    });

    it('falls back to whichever candidate exists', () => {
        expect(fresherCatalogue(null, AUGUST)).toEqual({ text: AUGUST, source: 'bundled' });
        expect(fresherCatalogue(AUGUST, null)).toEqual({ text: AUGUST, source: 'cache-stale' });
        expect(fresherCatalogue(null, null)).toBeNull();
    });

    it('discards an unreadable candidate rather than trusting it', () => {
        expect(fresherCatalogue('garbage', AUGUST)?.source).toBe('bundled');
        expect(fresherCatalogue(AUGUST, 'garbage')?.source).toBe('cache-stale');
    });

    /* Neither readable: the cache at least came from CelesTrak once. */
    it('keeps the cache when neither epoch can be read', () => {
        expect(fresherCatalogue('garbage', 'also garbage')?.source).toBe('cache-stale');
    });
});
