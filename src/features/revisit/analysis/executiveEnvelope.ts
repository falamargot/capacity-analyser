import type { PayloadSweepResult } from './payloadSweep';

/**
 * Keep only strict measured improvements as payload budget increases.
 *
 * This is the honest executive envelope: every retained point is an original
 * sweep result. Dominated exact-count topologies remain in the source sweep and
 * can still be inspected; no interpolation or synthetic KPI is introduced.
 *
 * ── WHY `null` IS DROPPED AND ZERO IS NOT ───────────────────────────────────
 * `maxGapMs === null` is an UNKNOWN — the target was never in view, or every
 * gap touched a window boundary and was discarded. Nothing may be claimed about
 * it, so it cannot enter an envelope of improvements.
 *
 * `maxGapMs === 0` is a MEASUREMENT, and the best one there is:
 * `computeGapStatistics` reports ALWAYS_IN_VIEW as a maximum gap of exactly
 * zero ("the maximum gap is zero, not unmeasured"). This filter used to read
 * `maxGapMs <= 0`, which discarded precisely the configuration that covers the
 * target permanently — so `Recommended configuration` could never propose it
 * and quoted a larger payload count, or `BEYOND_RANGE`, instead (found
 * 2026-08-31). Negative durations cannot occur: a gap runs from a cursor to a
 * later interval start.
 */
export function executiveEnvelopePoints(sweep: PayloadSweepResult): PayloadSweepResult['points'] {
    let bestGapMs = Number.POSITIVE_INFINITY;
    return sweep.points.filter((point) => {
        if (point.maxGapMs === null) return false;
        if (point.maxGapMs >= bestGapMs) return false;
        bestGapMs = point.maxGapMs;
        return true;
    });
}
