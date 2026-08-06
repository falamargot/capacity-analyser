/**
 * gapStatistics.ts — turn an access timeline into the number on the screen.
 *
 * THE HEADLINE IS MAXIMUM GAP (ADR-001 §3). It is the number a customer would
 * contract against and the only one honest about worst case. Mean, p95, access
 * count and fraction in view are computed alongside and labelled, because
 * showing mean alone invites the accusation of cherry-picking the moment
 * somebody recomputes it.
 *
 * TWO THINGS THAT CHANGE THE NUMBER AND ARE EASY TO GET WRONG:
 *
 *   1. Gaps truncated by the window boundary are DISCARDED. The first and last
 *      gap are artefacts of where the window was cut, not of the geometry. Keep
 *      them and max gap is understated.
 *   2. The window must be long enough — a Walker ground-track pattern repeats
 *      over a repeat cycle, not a day. That is enforced upstream in
 *      `accessIntervals.validateWindow`, whose warnings are merged in here.
 */

import type { AccessInterval, AnalysisWindow, GapStatistics } from '../domain/types';

/** A stretch of the window with nothing watching. */
export interface Gap {
    startMs: number;
    endMs: number;
    durationMs: number;
    /** True when the gap runs into a window edge, so its true length is unknown. */
    truncatedAtStart: boolean;
    truncatedAtEnd: boolean;
}

/**
 * Complement the access timeline inside the window.
 *
 * `intervals` must be sorted and non-overlapping — the output of
 * `unionAccessIntervals`.
 */
export function computeGaps(
    intervals: AccessInterval[],
    window: AnalysisWindow
): Gap[] {
    const windowStart = window.startMs;
    const windowEnd = window.startMs + window.durationHours * 3600 * 1000;
    const gaps: Gap[] = [];

    if (intervals.length === 0) {
        return [{
            startMs: windowStart,
            endMs: windowEnd,
            durationMs: windowEnd - windowStart,
            truncatedAtStart: true,
            truncatedAtEnd: true,
        }];
    }

    let cursor = windowStart;
    for (const iv of intervals) {
        if (iv.startMs > cursor) {
            gaps.push({
                startMs: cursor,
                endMs: iv.startMs,
                durationMs: iv.startMs - cursor,
                truncatedAtStart: cursor === windowStart,
                truncatedAtEnd: false,
            });
        }
        cursor = Math.max(cursor, iv.endMs);
    }

    if (cursor < windowEnd) {
        gaps.push({
            startMs: cursor,
            endMs: windowEnd,
            durationMs: windowEnd - cursor,
            truncatedAtStart: false,
            truncatedAtEnd: true,
        });
    }

    return gaps;
}

/**
 * Percentile by linear interpolation between order statistics (the numpy/R-7
 * convention), on an ascending array. Returns null for an empty sample.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
    const n = sortedAscending.length;
    if (n === 0) return null;
    if (n === 1) return sortedAscending[0];
    const rank = (p / 100) * (n - 1);
    const lo = Math.floor(rank);
    const hi = Math.ceil(rank);
    if (lo === hi) return sortedAscending[lo];
    return sortedAscending[lo] + (rank - lo) * (sortedAscending[hi] - sortedAscending[lo]);
}

/**
 * The result block.
 *
 * `extraWarnings` carries forward the window validation warnings from
 * `computeAccessIntervals`, so a caller reporting statistics never loses the
 * "this window is too short to believe" caveat.
 */
export function computeGapStatistics(
    intervals: AccessInterval[],
    window: AnalysisWindow,
    extraWarnings: string[] = []
): GapStatistics {
    const windowStart = window.startMs;
    const windowMs = window.durationHours * 3600 * 1000;
    const windowEnd = windowStart + windowMs;
    const warnings = [...extraWarnings];

    const gaps = computeGaps(intervals, window);
    const interior = gaps.filter((g) => !g.truncatedAtStart && !g.truncatedAtEnd);
    const boundaryGapsDiscarded = gaps.length - interior.length;

    const totalInViewMs = intervals.reduce(
        (sum, iv) => sum + (Math.min(iv.endMs, windowEnd) - Math.max(iv.startMs, windowStart)),
        0
    );
    const fractionInView = windowMs > 0 ? totalInViewMs / windowMs : 0;

    const durations = interior.map((g) => g.durationMs).sort((a, b) => a - b);
    const maxGapMs = durations.length > 0 ? durations[durations.length - 1] : null;
    const meanGapMs = durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : null;
    const p95GapMs = percentile(durations, 95);

    const meanAccessDurationMs = intervals.length > 0
        ? totalInViewMs / intervals.length
        : null;

    let coverage: GapStatistics['coverage'];
    if (intervals.length === 0) {
        coverage = 'NEVER_IN_VIEW';
        warnings.push(
            'The target is never in view over this window. There is no revisit figure to ' +
            'report — check the inclination against the target latitude, and the FOV width.'
        );
    } else if (gaps.length === 0) {
        coverage = 'ALWAYS_IN_VIEW';
        warnings.push('The target is in view for the whole window — the maximum gap is zero, not unmeasured.');
    } else {
        coverage = 'INTERMITTENT';
        if (maxGapMs === null) {
            warnings.push(
                'Every gap in this window touches a boundary, so all were discarded and no ' +
                'worst-case revisit can be stated. Lengthen the window.'
            );
        }
    }

    return {
        maxGapMs: coverage === 'ALWAYS_IN_VIEW' ? 0 : maxGapMs,
        meanGapMs: coverage === 'ALWAYS_IN_VIEW' ? 0 : meanGapMs,
        p95GapMs: coverage === 'ALWAYS_IN_VIEW' ? 0 : p95GapMs,
        accessCount: intervals.length,
        fractionInView,
        meanAccessDurationMs,
        totalInViewMs,
        interiorGapCount: interior.length,
        boundaryGapsDiscarded,
        coverage,
        warnings,
    };
}

/** Format a gap for an executive readout: `1 h 12 min`, `47 min`, `—`. */
export function formatGap(ms: number | null): string {
    if (ms === null) return '—';
    const totalMinutes = Math.round(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
}
