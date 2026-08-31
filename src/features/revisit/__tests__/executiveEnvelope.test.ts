import { describe, expect, it } from 'vitest';
import { executiveEnvelopePoints } from '../analysis/executiveEnvelope';
import { computeGapStatistics } from '../analysis/gapStatistics';
import type { PayloadSweepResult, SweepPoint } from '../analysis/payloadSweep';
import type { GapStatistics } from '../domain/types';

const HOUR = 3600_000;

function statistics(maxGapMs: number | null): GapStatistics {
    return {
        coverage: maxGapMs === 0 ? 'ALWAYS_IN_VIEW' : maxGapMs === null ? 'NEVER_IN_VIEW' : 'INTERMITTENT',
        maxGapMs,
        meanGapMs: maxGapMs,
        p95GapMs: maxGapMs,
        accessCount: maxGapMs === null ? 0 : 4,
        meanAccessDurationMs: maxGapMs === null ? null : 600_000,
        fractionInView: maxGapMs === 0 ? 1 : 0.1,
        totalInViewMs: 0,
        interiorGapCount: maxGapMs === null || maxGapMs === 0 ? 0 : 3,
        boundaryGapsDiscarded: 2,
        warnings: [],
    };
}

function point(payloadCount: number, maxGapMs: number | null): SweepPoint {
    return {
        payloadCount,
        maxGapMs,
        best: {
            selection: { planeStride: 1, satStride: 1, planeShift: 0 },
            selectedPlanes: payloadCount,
            payloadsPerPlane: 1,
            maxGapMs,
            statistics: statistics(maxGapMs),
        },
        alternatives: [],
        spreadAdvantage: null,
    };
}

const sweepOf = (...points: SweepPoint[]): PayloadSweepResult => ({ points, warnings: [] });

describe('executiveEnvelopePoints', () => {
    it('keeps only strict measured improvements as the budget grows', () => {
        const envelope = executiveEnvelopePoints(sweepOf(
            point(2, 6 * HOUR),
            point(4, 6 * HOUR),     // no improvement
            point(6, 3 * HOUR),
            point(8, 4 * HOUR),     // dominated by 6
            point(12, 1 * HOUR),
        ));

        expect(envelope.map((p) => p.payloadCount)).toEqual([2, 6, 12]);
    });

    it('drops an unknown worst case rather than treating it as an improvement', () => {
        // `null` is what a target never in view, or a window whose every gap
        // touches a boundary, produces. Nothing may be claimed about it.
        const envelope = executiveEnvelopePoints(sweepOf(
            point(1, null),
            point(2, 6 * HOUR),
        ));

        expect(envelope.map((p) => p.payloadCount)).toEqual([2]);
    });

    /*
     * The 2026-08-31 defect. The filter read `maxGapMs <= 0`, and
     * `computeGapStatistics` reports ALWAYS_IN_VIEW as a maximum gap of exactly
     * zero — so the one configuration that covers the target permanently was
     * removed from the envelope, and `Recommended configuration` could only
     * quote a larger payload count, or nothing at all.
     */
    it('keeps a permanently-covering configuration, which is a measurement of zero', () => {
        const window = { startMs: 0, durationHours: 72, stepSeconds: 10 };
        const alwaysInView = computeGapStatistics(
            [{
                startMs: 0,
                endMs: 72 * HOUR,
                satelliteIds: ['P00_S00'],
                clippedAtStart: true,
                clippedAtEnd: true,
            }],
            window,
        );
        // The premise of this test, asserted rather than assumed.
        expect(alwaysInView.coverage).toBe('ALWAYS_IN_VIEW');
        expect(alwaysInView.maxGapMs).toBe(0);

        const envelope = executiveEnvelopePoints(sweepOf(
            point(2, 6 * HOUR),
            point(4, alwaysInView.maxGapMs),
        ));

        expect(envelope.map((p) => p.payloadCount)).toEqual([2, 4]);
        // And it is what a 2 h requirement is then answered with.
        expect(envelope.find((p) => p.maxGapMs !== null && p.maxGapMs <= 2 * HOUR)?.payloadCount)
            .toBe(4);
    });

    it('does not keep a second zero — it is not an improvement on the first', () => {
        const envelope = executiveEnvelopePoints(sweepOf(
            point(4, 0),
            point(8, 0),
        ));

        expect(envelope.map((p) => p.payloadCount)).toEqual([4]);
    });
});
