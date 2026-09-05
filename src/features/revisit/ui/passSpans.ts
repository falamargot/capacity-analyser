/**
 * passSpans.ts — where an access interval lands on a time axis, as fractions.
 *
 * ── WHY THIS IS UNIT-FREE ───────────────────────────────────────────────────
 * Two surfaces draw the same intervals at two wildly different scales. The
 * coverage ribbon draws a 72 h window across ~1500 px, where a 90 s pass is half
 * a pixel and needs a legibility FLOOR to exist at all. The temporal lens draws
 * a 1 h span across ~300 px, where the same pass is seven pixels and the floor
 * would be the only thing lying about it.
 *
 * The geometry is identical; only `minWidth` differs. So this returns fractions
 * of `[t0, t1]` and takes its floor in the same fraction — the ribbon passes
 * `RIBBON_MIN_SPAN_FRACTION`, the lens passes `1 / widthPx`. Callers convert to
 * `%` or to `px`. Nothing here knows about either.
 *
 * ── THE FLOOR IS A DELIBERATE DISTORTION ────────────────────────────────────
 * A tick narrower than `minWidth` is widened to it, from its true start. On the
 * 72 h ribbon that inflates a 90 s pass to 5.2 min — roughly 3.5× — which is why
 * a playhead can look like it sits inside a pass while the satellite is a
 * thousand kilometres past the target. The floor is still right for the ribbon:
 * without it the pass is not drawn at all. It is the lens, at `minWidth` ≈ one
 * pixel of a 1 h span, that is the honest reading. Keeping both behind one
 * function is what stops the two surfaces from drifting apart.
 *
 * Pure: no DOM, no React, no clock.
 */

import type { AccessInterval } from '../domain/types';

/**
 * Anything with a start and an end.
 *
 * The projection needs nothing else, and the per-satellite spans the lens draws
 * under a lane are NOT `AccessInterval`s — they carry no `satelliteIds`, being
 * one satellite's own record. Making the geometry generic is what lets the union
 * and its decomposition go through exactly the same code.
 */
export interface TimeSpan { startMs: number; endMs: number }

/** The coverage ribbon's legibility floor: 0.12 % of the analysis window. */
export const RIBBON_MIN_SPAN_FRACTION = 0.0012;

export interface PassSpan<T extends TimeSpan = AccessInterval> {
    /** Left edge, as a fraction of `[t0, t1]`. Always the interval's TRUE start. */
    x: number;
    /** Width, as a fraction of `[t0, t1]`. At least `minWidth`, never past 1 − x. */
    width: number;
    /** True when `width` was widened by the floor rather than measured. */
    floored: boolean;
    /** The interval this span draws. Never a copy — callers may key on identity. */
    interval: T;
}

/**
 * A monotonicity-checked index over an interval list, for the lens.
 *
 * `unionAccessIntervals` returns disjoint intervals sorted by start, so their
 * END times are sorted too — which is what makes a binary search for "the first
 * interval that has not finished before t0" correct. That precondition is
 * CHECKED rather than assumed: a caller that hands over a raw per-satellite list
 * (which may overlap) gets a linear scan instead of a wrong answer.
 *
 * Build it once per interval-array identity and hand it to `passSpans`; without
 * one the scan is linear, which is fine for the ribbon's few dozen intervals and
 * not fine at 240 h under a pointer.
 */
export interface PassSpanIndex {
    /** Sorted end times, or null when the input was not sorted and disjoint. */
    ends: Float64Array | null;
    /** The array this index was built from. Guards against a stale index. */
    source: readonly TimeSpan[];
}

export function buildPassSpanIndex(intervals: readonly TimeSpan[]): PassSpanIndex {
    const ends = new Float64Array(intervals.length);
    let ordered = true;
    for (let i = 0; i < intervals.length; i += 1) {
        ends[i] = intervals[i].endMs;
        if (i > 0 && (intervals[i].startMs < intervals[i - 1].endMs || ends[i] < ends[i - 1])) {
            ordered = false;
            break;
        }
    }
    return { ends: ordered ? ends : null, source: intervals };
}

/** First index whose end time is strictly after `t`, or `length` when none is. */
function lowerBoundEnd(ends: Float64Array, t: number): number {
    let lo = 0;
    let hi = ends.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ends[mid] > t) hi = mid;
        else lo = mid + 1;
    }
    return lo;
}

/**
 * Project the intervals overlapping `[t0, t1]` onto that range.
 *
 * Intervals are clipped to the range, so a pass straddling an edge draws the
 * part that is inside it. A clipped span keeps its interval, so a caller can
 * still read the true AOS/LOS off `interval` — the drawn edge and the stated
 * time are deliberately allowed to disagree, because one is a viewport and the
 * other is the measurement.
 *
 * Degenerate ranges (`t1 <= t0`) return nothing rather than dividing by zero.
 */
export function passSpans<T extends TimeSpan>(
    intervals: readonly T[],
    t0: number,
    t1: number,
    minWidth: number,
    index?: PassSpanIndex,
): PassSpan<T>[] {
    const span = t1 - t0;
    if (!(span > 0) || intervals.length === 0) return [];

    const floor = Math.max(0, Math.min(1, minWidth));
    const usable = index && index.source === intervals ? index.ends : null;
    const spans: PassSpan<T>[] = [];

    for (let i = usable ? lowerBoundEnd(usable, t0) : 0; i < intervals.length; i += 1) {
        const interval = intervals[i];
        // With an index the list is sorted, so the first interval starting at or
        // after the range end ends the scan. Without one, keep scanning: an
        // unsorted list may still hold overlapping intervals further down.
        if (interval.startMs >= t1) {
            if (usable) break;
            continue;
        }
        if (interval.endMs <= t0) continue;

        const clippedStart = Math.max(interval.startMs, t0);
        const clippedEnd = Math.min(interval.endMs, t1);
        if (clippedEnd <= clippedStart) continue;

        const x = (clippedStart - t0) / span;
        const measured = (clippedEnd - clippedStart) / span;
        // The floor never pushes a span past the right edge: a pass clipped by
        // the range end would otherwise draw outside the track it belongs to.
        const width = Math.min(Math.max(measured, floor), 1 - x);
        spans.push({ x, width, floored: width > measured, interval });
    }

    return spans;
}

/**
 * The three intervals a reading can possibly be about: the one containing `ms`,
 * the last one starting at or before it, and the first one starting after it.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Everything the lens SAYS used to walk the whole lane on every pointer move,
 * while everything it DRAWS went through the binary index. At the 240 h ceiling
 * that is two full scans of 5760 intervals per move against `O(log n + k)` for
 * the geometry beside it — the module's own invariant ("the lens shows one hour,
 * so its cost follows the SPAN, never the window") held for half the work.
 *
 * With an index the answer is three indices found by bisection. Without one the
 * scan is linear AND makes no ordering assumption, which is the other half of
 * the point: `drawnPassNear` used to take `bestIndex ± 1` as the neighbouring
 * pass, which is only the real neighbour in a sorted list — exactly the
 * assumption `buildPassSpanIndex` refuses to make silently.
 */
export interface PassNeighbourhood {
    /** Interval containing `ms`, or −1. When set, it equals `previous`. */
    current: number;
    /** Last interval starting at or before `ms`, or −1. */
    previous: number;
    /** First interval starting after `ms`, or −1. */
    next: number;
}

export function emptyNeighbourhood(): PassNeighbourhood {
    return { current: -1, previous: -1, next: -1 };
}

/**
 * Writes into `out` and returns it.
 *
 * This runs once or twice per pointer move, so it allocates nothing — the same
 * scratch-buffer discipline the propagator uses for `EciState`. Measured: with
 * a fresh object per call the lens's `update()` cost rose from 0.13 ms to
 * 0.23 ms, and it is the allocation, not the arithmetic, that did it.
 *
 * Each call site owns its OWN scratch. Sharing one between `readAt` and
 * `drawnPassNear` would leave the second overwriting what the first is still
 * reading — the defect `bisectTransition` records in `accessIntervals.ts`.
 */
export function passNeighbourhood(
    intervals: readonly TimeSpan[], ms: number, index?: PassSpanIndex,
    out: PassNeighbourhood = emptyNeighbourhood(),
): PassNeighbourhood {
    out.current = -1;
    out.previous = -1;
    out.next = -1;
    const ends = index && index.source === intervals ? index.ends : null;
    if (ends) {
        // Sorted and disjoint (checked when the index was built), so the first
        // interval that has not finished before `ms` decides all three.
        const i = lowerBoundEnd(ends, ms);
        if (i < intervals.length && intervals[i].startMs <= ms) {
            out.current = i;
            out.previous = i;
            out.next = i + 1 < intervals.length ? i + 1 : -1;
        } else {
            out.previous = i - 1 >= 0 ? i - 1 : -1;
            out.next = i < intervals.length ? i : -1;
        }
        return out;
    }

    for (let i = 0; i < intervals.length; i += 1) {
        const interval = intervals[i];
        if (out.current === -1 && interval.startMs <= ms && ms < interval.endMs) {
            out.current = i;
        }
        if (interval.startMs <= ms
            && (out.previous === -1 || interval.startMs > intervals[out.previous].startMs)) {
            out.previous = i;
        }
        if (interval.startMs > ms
            && (out.next === -1 || interval.startMs < intervals[out.next].startMs)) {
            out.next = i;
        }
    }
    return out;
}

/** `drawnPassNear`'s own scratch. Never shared — see `passNeighbourhood`. */
const snapScratch = emptyNeighbourhood();

/** Where a tick is drawn to, given the ribbon's legibility floor. */
function drawnEndOf(interval: TimeSpan, floorMs: number): number {
    return interval.startMs + Math.max(interval.endMs - interval.startMs, floorMs);
}

/**
 * The pass a click at `ms` is asking for, if any.
 *
 * ── WHY THIS IS NOT "INSIDE THE TICK" ───────────────────────────────────────
 * The first version of this snapped only when `ms` fell inside the DRAWN tick.
 * Measured in the browser: on a 72 h window across 939 px, the floor is 5.2 min
 * — 1.1 px. A rule that requires landing inside a 1.1 px band is a rule that
 * never fires, which is the same defect it was written to fix, one layer down.
 *
 * So the drawn extent is widened by a click tolerance the CALLER expresses in
 * time, from its own pixel width. Snapping stays bounded by what the reader can
 * see and aim at, instead of by an invisible instant.
 *
 * `floorMs` is the ribbon's legibility floor in time (`RIBBON_MIN_SPAN_FRACTION`
 * times the window): the width of the tick on screen, which is the shape the
 * reader is actually aiming at.
 */
export function drawnPassNear<T extends TimeSpan>(
    intervals: readonly T[], ms: number, floorMs: number, toleranceMs = 0,
    index?: PassSpanIndex,
): T | null {
    const sorted = Boolean(index && index.source === intervals && index.ends);
    const { previous, next } = passNeighbourhood(intervals, ms, index, snapScratch);
    let best = -1;
    let bestDistance = Infinity;
    /*
     * Three candidates, compared without an array so the hot path allocates
     * nothing. `previous - 1` earns its place: a floor wide enough can stretch
     * an earlier tick past `ms` even though a later pass has already started,
     * and that tick is what the reader sees under the pointer.
     */
    const consider = (i: number): void => {
        if (i < 0 || i >= intervals.length) return;
        const interval = intervals[i];
        const drawnEnd = drawnEndOf(interval, floorMs);
        // Distance to the drawn tick: zero inside it, positive on either side.
        const distance = ms < interval.startMs ? interval.startMs - ms
            : ms >= drawnEnd ? ms - drawnEnd
                : 0;
        if (distance < bestDistance) {
            best = i;
            bestDistance = distance;
        }
    };
    consider(previous - 1);
    consider(previous);
    consider(next);
    if (best === -1 || bestDistance > toleranceMs) return null;
    const chosen = intervals[best];
    if (bestDistance === 0) return chosen;

    /*
     * ── THE RADIUS MAY NOT REACH PAST THE MIDPOINT OF A GAP ─────────────────
     *
     * The pixel tolerance is right on a desktop track — 3 px is 9 min of a 72 h
     * window. On a phone the same 3 px are nearly TWO HOURS: the track column
     * measures 114 px (measured at 375 px on 2026-09-05), so one pixel is 38 min
     * and the gaps themselves are barely one pixel wide.
     *
     * The cap below is what keeps that radius meaningful rather than unbounded
     * in time: a click is never pulled past the midpoint between two passes.
     *
     * What it does NOT do, and the distinction matters: on a track that coarse
     * it does not leave part of the gap un-snapped — the two halves cover it.
     * That is the right behaviour there, not a compromise. At 38 min per pixel
     * a gap is one pixel wide, so "the middle of the gap" is not something the
     * reader can aim at in the first place; snapping to the nearest pass is the
     * only meaning a tap can carry. On a desktop track the pixel radius is far
     * below half a gap, so the middle of a gap stays a plain seek there.
     *
     * The neighbour is found WITHOUT assuming the list is ordered: with an index
     * the neighbourhood above is exact, and without one the scan below is.
     */
    const before = ms < chosen.startMs;
    let edge = Infinity;
    if (sorted) {
        // Ordered and disjoint: the neighbour is the adjacent index, no scan.
        const neighbour = intervals[before ? best - 1 : best + 1];
        if (neighbour) {
            edge = before
                ? chosen.startMs - drawnEndOf(neighbour, floorMs)
                : neighbour.startMs - drawnEndOf(chosen, floorMs);
        }
    } else {
        for (let i = 0; i < intervals.length; i += 1) {
            if (i === best) continue;
            const interval = intervals[i];
            if (before) {
                if (interval.startMs >= chosen.startMs) continue;
                edge = Math.min(edge, chosen.startMs - drawnEndOf(interval, floorMs));
            } else {
                if (interval.startMs <= chosen.startMs) continue;
                edge = Math.min(edge, interval.startMs - drawnEndOf(chosen, floorMs));
            }
        }
    }
    return bestDistance <= Math.min(toleranceMs, edge / 2) ? chosen : null;
}
