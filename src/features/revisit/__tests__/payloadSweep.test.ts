import { describe, expect, it } from 'vitest';
import { payloadsRequiredFor, runPayloadSweep } from '../analysis/payloadSweep';
import { DEFAULT_REFERENCE, FOV_PRESETS, defaultWindow } from '../domain/presets';
import { ladderPayloadCounts } from '../domain/subConstellation';
import type { AnalysisWindow, FovSpec, Target, WalkerSpec } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

const reference: WalkerSpec = {
    pattern: 'STAR', planes: 6, satsPerPlane: 4,
    inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};
const london: Target = { kind: 'POINT', name: 'London', latDeg: 51.5, lonDeg: -0.13 };
const fov: FovSpec = {
    biasDeg: { alongTrack: 0, crossTrack: 0 },
    shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 30, clockingDeg: 0,
};
const window: AnalysisWindow = { startMs: EPOCH, durationHours: 24, stepSeconds: 20 };

const sweep = runPayloadSweep(reference, london, fov, window);

describe('payloadSweep — the value curve', () => {
    it('covers every rung of the ladder exactly once', () => {
        expect(sweep.points.map((p) => p.payloadCount)).toEqual(ladderPayloadCounts(6, 4));
    });

    it('returns points ascending by payload count', () => {
        const counts = sweep.points.map((p) => p.payloadCount);
        expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });

    it('trends downward — many payloads beat few', () => {
        const measured = sweep.points.filter((p) => p.maxGapMs !== null);
        expect(measured.length).toBeGreaterThan(2);
        expect(measured[measured.length - 1].maxGapMs!).toBeLessThan(measured[0].maxGapMs!);

        const half = Math.floor(measured.length / 2);
        const mean = (xs: typeof measured) => xs.reduce((s, p) => s + p.maxGapMs!, 0) / xs.length;
        expect(mean(measured.slice(half))).toBeLessThan(mean(measured.slice(0, half)));
    });

    // THE CURVE IS NOT MONOTONIC, AND THAT IS THE POINT. Ladder configurations
    // are not nested: going from N to the next rung can move payloads into
    // *fewer* planes, and plane spread matters more than raw count. For
    // P=6, S=4 the only way to place 8 payloads is 2 planes × 4, which loses to
    // 6 payloads over 3 planes × 2.
    //
    // Anyone later "fixing" the sweep to produce a tidy 1/N curve would be
    // erasing the tool's most persuasive finding. This test stands in the way.
    it('lets a higher payload count be worse when it concentrates into fewer planes', () => {
        const six = sweep.points.find((p) => p.payloadCount === 6)!;
        const eight = sweep.points.find((p) => p.payloadCount === 8)!;
        expect(six.best.selectedPlanes).toBe(3);
        expect(eight.best.selectedPlanes).toBe(2);
        expect(eight.maxGapMs!).toBeGreaterThan(six.maxGapMs!);
    });

    it('reaches full coverage at the top of the ladder', () => {
        const full = sweep.points[sweep.points.length - 1];
        expect(full.payloadCount).toBe(24);
        expect(full.best.selectedPlanes).toBe(6);
        expect(full.best.payloadsPerPlane).toBe(4);
        expect(full.best.selection).toEqual({ planeStride: 1, satStride: 1, planeShift: 0 });
    });
});

describe('payloadSweep — ties are kept, not collapsed', () => {
    it('records the alternatives at a payload count with more than one split', () => {
        const tied = sweep.points.filter((p) => p.alternatives.length > 0);
        expect(tied.length).toBeGreaterThan(0);
        for (const point of tied) {
            for (const alt of point.alternatives) {
                expect(alt.selectedPlanes * alt.payloadsPerPlane).toBe(point.payloadCount);
            }
        }
    });

    it('reports the best configuration first', () => {
        for (const point of sweep.points) {
            for (const alt of point.alternatives) {
                if (point.maxGapMs === null || alt.maxGapMs === null) continue;
                expect(point.maxGapMs).toBeLessThanOrEqual(alt.maxGapMs);
            }
        }
    });

    it('prefers spreading payloads across planes at an equal count', () => {
        // The claim the tool exists to make: 4 payloads over 4 planes beat 4 in
        // one plane. Both are on the ladder for P=6, S=4.
        const four = sweep.points.find((p) => p.payloadCount === 4)!;
        expect(four.alternatives.length).toBeGreaterThan(0);
        const oneP1ane = [four.best, ...four.alternatives].find((c) => c.selectedPlanes === 1);
        const spread = [four.best, ...four.alternatives].find((c) => c.selectedPlanes > 1);
        expect(oneP1ane).toBeDefined();
        expect(spread).toBeDefined();
        expect(spread!.maxGapMs!).toBeLessThan(oneP1ane!.maxGapMs!);
        expect(four.best.selectedPlanes).toBeGreaterThan(1);
    });

    it('quantifies the advantage as a fraction, for the slide', () => {
        const four = sweep.points.find((p) => p.payloadCount === 4)!;
        expect(four.spreadAdvantage).not.toBeNull();
        expect(four.spreadAdvantage!).toBeGreaterThan(0);
        expect(four.spreadAdvantage!).toBeLessThan(1);
    });

    it('reports no advantage where the count admits only one split', () => {
        const single = sweep.points.find((p) => p.alternatives.length === 0);
        expect(single).toBeDefined();
        expect(single!.spreadAdvantage).toBeNull();
    });
});

describe('payloadSweep — options and the requirement crossing', () => {
    it('honours a payload-count restriction', () => {
        const partial = runPayloadSweep(reference, london, fov, window, { payloadCounts: [2, 24] });
        expect(partial.points.map((p) => p.payloadCount)).toEqual([2, 24]);
    });

    it('applies the plane shift to every configuration', () => {
        const shifted = runPayloadSweep(reference, london, fov, window, { planeShift: 1 });
        for (const p of shifted.points) {
            expect(p.best.selection.planeShift).toBe(1);
        }
    });

    it('finds the smallest payload count meeting a requirement', () => {
        const best = sweep.points[sweep.points.length - 1].maxGapMs!;
        const requirement = best * 1.5;
        const answer = payloadsRequiredFor(sweep, requirement);
        expect(answer).not.toBeNull();
        expect(answer!.maxGapMs!).toBeLessThanOrEqual(requirement);

        // It really is the smallest — nothing cheaper on the ladder qualifies.
        for (const p of sweep.points) {
            if (p.payloadCount < answer!.payloadCount) {
                expect(p.maxGapMs === null || p.maxGapMs > requirement).toBe(true);
            }
        }
    });

    it('returns null when no rung meets the requirement, rather than rounding', () => {
        expect(payloadsRequiredFor(sweep, 1)).toBeNull();
    });

    it('is deterministic', () => {
        const again = runPayloadSweep(reference, london, fov, window);
        expect(again.points.map((p) => p.maxGapMs)).toEqual(sweep.points.map((p) => p.maxGapMs));
    });

    it('carries the window warnings up to the caller', () => {
        const short = runPayloadSweep(reference, london, fov, {
            startMs: EPOCH, durationHours: 6, stepSeconds: 20,
        });
        expect(short.warnings.join(' ')).toMatch(/confidently wrong/);
    });

    /**
     * Regression for a real bug, reported against the production reference
     * constellation (12×48, ONEWEB_HLD_V1) and default window: at 10°N 10°E
     * the 1-payload rung genuinely never sees the target within 72 h, while
     * every other rung — including 12, a config a user could easily be
     * looking at — does. `sweep.warnings` used to fold every rung's coverage
     * narrative into one caller-facing list, so a warning that was only ever
     * true about the 1-payload rung was shown while looking at 12.
     *
     * "The window is short" is a fact about the SCENARIO; "never in view" is a
     * fact about the CONFIGURATION currently on screen. Conflating them means
     * a warning about a rung the user isn't looking at gets attached to the
     * one they are.
     */
    it('does not fold one rung\'s coverage narrative into the sweep-wide warnings', () => {
        const target: Target = { kind: 'POINT', name: 'Custom point', latDeg: 10, lonDeg: 10 };
        const production = runPayloadSweep(
            DEFAULT_REFERENCE, target, FOV_PRESETS.STANDARD, defaultWindow(EPOCH)
        );

        const oneRung = production.points.find((p) => p.payloadCount === 1);
        expect(oneRung?.best.statistics.coverage).toBe('NEVER_IN_VIEW');

        const twelveRung = production.points.find((p) => p.payloadCount === 12);
        expect(twelveRung?.best.statistics.coverage).toBe('INTERMITTENT');
        expect(twelveRung?.best.statistics.maxGapMs).not.toBeNull();

        // The premise held (a rung with no coverage exists), but it must not
        // leak into the sweep-wide warnings.
        expect(production.warnings.join(' ')).not.toMatch(/never in view/i);
    }, 30_000);
});
