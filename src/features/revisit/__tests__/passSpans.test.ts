/**
 * passSpans — the projection both the ribbon and the temporal lens draw from.
 *
 * The numbers here are chosen so the floor's distortion is visible rather than
 * incidental: a 90 s pass on a 72 h window is the case that made a playhead look
 * like it sat inside a pass while the satellite was ~1200 km past the target.
 */
import { describe, expect, it } from 'vitest';
import {
    RIBBON_MIN_SPAN_FRACTION, buildPassSpanIndex, drawnPassNear, passNeighbourhood,
    passSpans,
} from '../ui/passSpans';
import type { AccessInterval } from '../domain/types';

const EPOCH = Date.UTC(2026, 8, 4, 0, 0, 0);
const HOUR = 3600_000;
const WINDOW_MS = 72 * HOUR;

function interval(startMs: number, endMs: number): AccessInterval {
    return {
        startMs, endMs, satelliteIds: ['P00_S00'],
        clippedAtStart: false, clippedAtEnd: false,
    };
}

describe('passSpans — measured geometry', () => {
    it('places a span at its true start and true width', () => {
        const spans = passSpans(
            [interval(EPOCH + 36 * HOUR, EPOCH + 37 * HOUR)],
            EPOCH, EPOCH + WINDOW_MS, 0,
        );
        expect(spans).toHaveLength(1);
        expect(spans[0].x).toBeCloseTo(0.5, 12);
        expect(spans[0].width).toBeCloseTo(1 / 72, 12);
        expect(spans[0].floored).toBe(false);
    });

    it('returns the interval itself, so callers can read the true AOS/LOS', () => {
        const source = interval(EPOCH + HOUR, EPOCH + HOUR + 90_000);
        const [span] = passSpans([source], EPOCH, EPOCH + WINDOW_MS, 0);
        expect(span.interval).toBe(source);
    });

    it('keeps spans in input order', () => {
        const spans = passSpans([
            interval(EPOCH + HOUR, EPOCH + 2 * HOUR),
            interval(EPOCH + 5 * HOUR, EPOCH + 6 * HOUR),
            interval(EPOCH + 9 * HOUR, EPOCH + 10 * HOUR),
        ], EPOCH, EPOCH + WINDOW_MS, 0);
        expect(spans.map((s) => s.x)).toEqual([...spans.map((s) => s.x)].sort((a, b) => a - b));
    });
});

describe('passSpans — the floor, and what it costs', () => {
    it('inflates a 90 s pass to 5.2 min on the ribbon, and says so', () => {
        const passMs = 90_000;
        const [span] = passSpans(
            [interval(EPOCH + 36 * HOUR, EPOCH + 36 * HOUR + passMs)],
            EPOCH, EPOCH + WINDOW_MS, RIBBON_MIN_SPAN_FRACTION,
        );
        expect(span.floored).toBe(true);
        expect(span.width).toBeCloseTo(RIBBON_MIN_SPAN_FRACTION, 12);
        // The distortion this whole plan exists to explain: ~3.5x.
        const drawnMs = span.width * WINDOW_MS;
        expect(drawnMs / passMs).toBeGreaterThan(3);
        expect(drawnMs).toBeCloseTo(5.184 * 60_000, 6);
    });

    it('leaves the same pass undistorted in a one-hour lens', () => {
        const t0 = EPOCH + 36 * HOUR - 30 * 60_000;
        const lensWidthPx = 300;
        const [span] = passSpans(
            [interval(EPOCH + 36 * HOUR, EPOCH + 36 * HOUR + 90_000)],
            t0, t0 + HOUR, 1 / lensWidthPx,
        );
        expect(span.floored).toBe(false);
        // 90 s of a 1 h span across 300 px — seven pixels and a half.
        expect(span.width * lensWidthPx).toBeCloseTo(7.5, 6);
    });

    it('never floors a span past the right edge of the range', () => {
        const t1 = EPOCH + WINDOW_MS;
        const [span] = passSpans(
            [interval(t1 - 1000, t1)], EPOCH, t1, RIBBON_MIN_SPAN_FRACTION,
        );
        expect(span.x + span.width).toBeLessThanOrEqual(1);
    });
});

describe('passSpans — clipping and rejection', () => {
    const t0 = EPOCH + 10 * HOUR;
    const t1 = EPOCH + 11 * HOUR;

    it('clips a span straddling the start', () => {
        const [span] = passSpans([interval(t0 - 30 * 60_000, t0 + 30 * 60_000)], t0, t1, 0);
        expect(span.x).toBe(0);
        expect(span.width).toBeCloseTo(0.5, 12);
    });

    it('clips a span straddling the end', () => {
        const [span] = passSpans([interval(t1 - 30 * 60_000, t1 + 30 * 60_000)], t0, t1, 0);
        expect(span.x).toBeCloseTo(0.5, 12);
        expect(span.x + span.width).toBeCloseTo(1, 12);
    });

    it('drops intervals entirely outside the range, on both sides', () => {
        expect(passSpans([
            interval(t0 - 2 * HOUR, t0 - HOUR),
            interval(t1 + HOUR, t1 + 2 * HOUR),
        ], t0, t1, RIBBON_MIN_SPAN_FRACTION)).toEqual([]);
    });

    it('drops an interval touching the range only at a boundary', () => {
        expect(passSpans([interval(t0 - HOUR, t0)], t0, t1, 0)).toEqual([]);
        expect(passSpans([interval(t1, t1 + HOUR)], t0, t1, 0)).toEqual([]);
    });

    it('returns nothing for a degenerate or inverted range', () => {
        const one = [interval(t0, t1)];
        expect(passSpans(one, t0, t0, RIBBON_MIN_SPAN_FRACTION)).toEqual([]);
        expect(passSpans(one, t1, t0, RIBBON_MIN_SPAN_FRACTION)).toEqual([]);
    });

    it('returns nothing for an empty interval list', () => {
        expect(passSpans([], t0, t1, RIBBON_MIN_SPAN_FRACTION)).toEqual([]);
    });
});

describe('buildPassSpanIndex — the lens fast path', () => {
    const union: AccessInterval[] = Array.from({ length: 200 }, (_, i) => interval(
        EPOCH + i * HOUR, EPOCH + i * HOUR + 90_000,
    ));

    it('accepts a disjoint, sorted union and produces identical spans', () => {
        const index = buildPassSpanIndex(union);
        expect(index.ends).not.toBeNull();
        const t0 = EPOCH + 100 * HOUR - 30 * 60_000;
        const withIndex = passSpans(union, t0, t0 + HOUR, 1 / 300, index);
        const withoutIndex = passSpans(union, t0, t0 + HOUR, 1 / 300);
        expect(withIndex).toEqual(withoutIndex);
        expect(withIndex).toHaveLength(1);
    });

    it('refuses an overlapping list rather than returning a wrong answer', () => {
        const overlapping = [
            interval(EPOCH, EPOCH + 4 * HOUR),
            interval(EPOCH + HOUR, EPOCH + 2 * HOUR),
        ];
        const index = buildPassSpanIndex(overlapping);
        expect(index.ends).toBeNull();
        // The linear scan still finds both, which is the point of refusing.
        expect(passSpans(overlapping, EPOCH, EPOCH + 5 * HOUR, 0, index)).toHaveLength(2);
    });

    it('ignores an index built from a different array', () => {
        const stale = buildPassSpanIndex(union);
        const other = [interval(EPOCH + 3 * HOUR, EPOCH + 3 * HOUR + 90_000)];
        expect(passSpans(other, EPOCH, EPOCH + WINDOW_MS, 0, stale)).toHaveLength(1);
    });
});

describe('drawnPassNear — what a click is asking for', () => {
    const floorMs = RIBBON_MIN_SPAN_FRACTION * WINDOW_MS;
    /** One 90 s pass an hour, the module's working case. */
    const passes = Array.from({ length: 24 }, (_u, i) => interval(
        EPOCH + i * HOUR, EPOCH + i * HOUR + 90_000,
    ));
    const second = passes[1];

    it('snaps from inside the drawn tick', () => {
        expect(drawnPassNear(passes, second.startMs + 2 * 60_000, floorMs, 0))
            .toBe(second);
    });

    it('snaps from within the click radius on either side', () => {
        const tolerance = 9 * 60_000;
        expect(drawnPassNear(passes, second.startMs - 5 * 60_000, floorMs, tolerance))
            .toBe(second);
        expect(drawnPassNear(passes, second.startMs + floorMs + 5 * 60_000, floorMs, tolerance))
            .toBe(second);
    });

    it('does not snap beyond the radius', () => {
        expect(drawnPassNear(passes, second.startMs - 20 * 60_000, floorMs, 9 * 60_000))
            .toBeNull();
    });

    /*
     * A 375 px phone leaves the track column 114 px. Three pixels of it are
     * nearly two hours of a 72 h window — longer than the gaps themselves. The
     * radius must stay meaningful there rather than reaching across passes.
     */
    it('is never pulled past a nearer pass, however coarse the track', () => {
        const phoneTolerance = (3 / 114) * WINDOW_MS;
        expect(phoneTolerance).toBeGreaterThan(HOUR);

        // On the late side of the gap: the NEXT pass, not the one two hours back.
        expect(drawnPassNear(passes, second.startMs - 10 * 60_000, floorMs, phoneTolerance))
            .toBe(second);
        // On the early side: the previous one, never reaching across the middle.
        expect(drawnPassNear(passes, second.startMs - 45 * 60_000, floorMs, phoneTolerance))
            .toBe(passes[0]);
    });

    it('leaves the middle of a gap a plain seek at desktop resolution', () => {
        // 3 px of a 939 px track: 13.8 min, well under half of a 55 min gap.
        const desktopTolerance = (3 / 939) * WINDOW_MS;
        expect(drawnPassNear(passes, second.startMs - 30 * 60_000, floorMs, desktopTolerance))
            .toBeNull();
    });

    it('measures the gap on the side the pointer is on', () => {
        const sparse = [
            interval(EPOCH, EPOCH + 90_000),
            interval(EPOCH + 6 * HOUR, EPOCH + 6 * HOUR + 90_000),
            interval(EPOCH + 6 * HOUR + 20 * 60_000, EPOCH + 6 * HOUR + 20 * 60_000 + 90_000),
        ];
        const tolerance = 40 * 60_000;
        // Approached across the wide gap: half of ~6 h is far beyond the
        // tolerance, so the pixel radius governs and 30 min still snaps.
        expect(drawnPassNear(sparse, EPOCH + 6 * HOUR - 30 * 60_000, floorMs, tolerance))
            .toBe(sparse[1]);
        // Between the two close passes, the nearer one wins — the 40 min radius
        // never drags the click back to the pass it has already left.
        expect(drawnPassNear(
            sparse, sparse[1].startMs + floorMs + 10 * 60_000, floorMs, tolerance,
        )).toBe(sparse[2]);
    });

    it('returns nothing when the tolerance is zero and the click misses', () => {
        expect(drawnPassNear(passes, second.startMs - 1000, floorMs, 0)).toBeNull();
    });
});

describe('passNeighbourhood — the same answer with or without the index', () => {
    const union = Array.from({ length: 200 }, (_u, i) => interval(
        EPOCH + i * HOUR, EPOCH + i * HOUR + 90_000,
    ));
    const index = buildPassSpanIndex(union);

    it('agrees with the linear scan at every kind of instant', () => {
        const probes = [
            EPOCH - HOUR,                       // before everything
            EPOCH,                              // exactly a start
            EPOCH + 45_000,                     // inside a pass
            EPOCH + 90_000,                     // exactly an end
            EPOCH + 30 * HOUR + 20 * 60_000,    // in a gap
            EPOCH + 199 * HOUR + 45_000,        // inside the last pass
            EPOCH + 500 * HOUR,                 // after everything
        ];
        for (const ms of probes) {
            expect(passNeighbourhood(union, ms, index), `at ${ms}`)
                .toEqual(passNeighbourhood(union, ms));
        }
    });

    it('writes into the scratch it is given rather than allocating', () => {
        const scratch = { current: 9, previous: 9, next: 9 };
        const result = passNeighbourhood(union, EPOCH + 45_000, index, scratch);
        expect(result).toBe(scratch);
        expect(scratch.current).toBe(0);
    });
});

describe('drawnPassNear — without an index it assumes no ordering', () => {
    const floorMs = RIBBON_MIN_SPAN_FRACTION * WINDOW_MS;
    /*
     * A per-satellite list: overlapping and NOT globally ordered, which is what
     * `AccessComputation.perSatellite` hands out. Taking the neighbour by
     * position in the array would measure the gap against an arbitrary pass.
     */
    const unordered = [
        interval(EPOCH + 10 * HOUR, EPOCH + 10 * HOUR + 90_000),
        interval(EPOCH + 2 * HOUR, EPOCH + 2 * HOUR + 90_000),
        interval(EPOCH + 2 * HOUR + 12 * 60_000, EPOCH + 2 * HOUR + 12 * 60_000 + 90_000),
    ];

    it('snaps to the nearest drawn tick whatever the array order', () => {
        expect(drawnPassNear(unordered, EPOCH + 2 * HOUR + 60_000, floorMs, 0))
            .toBe(unordered[1]);
        expect(drawnPassNear(unordered, EPOCH + 10 * HOUR + 60_000, floorMs, 0))
            .toBe(unordered[0]);
    });

    it('caps against the real neighbour, not against the array neighbour', () => {
        const tolerance = 40 * 60_000;
        // Between the two close passes. The real gap is 12 min minus the floor,
        // so half of it is ~3.4 min: 6 min past the first tick reaches nothing
        // from that side, and the second pass is 4.9 min ahead — the nearest.
        const ms = unordered[1].startMs + floorMs + 6 * 60_000;
        expect(drawnPassNear(unordered, ms, floorMs, tolerance)).toBe(unordered[2]);
        // And the wide gap before the 10 h pass is measured against the 2 h
        // group, which sits at array index 1 and 2 — never at index -1.
        expect(drawnPassNear(unordered, EPOCH + 10 * HOUR - 30 * 60_000, floorMs, tolerance))
            .toBe(unordered[0]);
    });
});
