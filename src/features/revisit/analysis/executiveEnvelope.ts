import type { PayloadSweepResult } from './payloadSweep';

/**
 * Keep only strict measured improvements as payload budget increases.
 *
 * This is the honest executive envelope: every retained point is an original
 * sweep result. Dominated exact-count topologies remain in the source sweep and
 * can still be inspected; no interpolation or synthetic KPI is introduced.
 */
export function executiveEnvelopePoints(sweep: PayloadSweepResult): PayloadSweepResult['points'] {
    let bestGapMs = Number.POSITIVE_INFINITY;
    return sweep.points.filter((point) => {
        if (point.maxGapMs === null || point.maxGapMs <= 0) return false;
        if (point.maxGapMs >= bestGapMs) return false;
        bestGapMs = point.maxGapMs;
        return true;
    });
}
