import { describe, expect, it } from 'vitest';
import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toRad } from '../../../utils/sphericalGeometry';
import {
    DEFAULT_STEP_SECONDS, DEFAULT_WINDOW_HOURS, MIN_RELIABLE_WINDOW_HOURS,
    computeAccessIntervals, unionAccessIntervals, validateWindow,
} from '../analysis/accessIntervals';
import { computeGapStatistics } from '../analysis/gapStatistics';
import { groundArcRad } from '../fov/footprint';
import {
    EARTH_ROTATION_RATE_RAD_S, argLatRateRadPerSec, nodalRegressionRadPerSec,
} from '../propagation/keplerJ2';
import { generateWalkerConstellation } from '../domain/walker';
import { selectSubConstellation } from '../domain/subConstellation';
import type {
    AnalysisWindow, FovSpec, OrbitalElements, Target, WalkerSpec,
} from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

describe('accessIntervals — window validation', () => {
    it('accepts the defaults', () => {
        const v = validateWindow({
            startMs: EPOCH, durationHours: DEFAULT_WINDOW_HOURS, stepSeconds: DEFAULT_STEP_SECONDS,
        });
        expect(v.ok).toBe(true);
        expect(v.warnings).toEqual([]);
    });

    it('warns below 24 h — a Walker pattern repeats over a repeat cycle, not a day', () => {
        const v = validateWindow({ startMs: EPOCH, durationHours: 6, stepSeconds: 10 });
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/confidently wrong/);
        expect(MIN_RELIABLE_WINDOW_HOURS).toBe(24);
        expect(DEFAULT_WINDOW_HOURS).toBe(72);
    });

    it('warns when the sampling step is coarse enough to miss a pass', () => {
        const v = validateWindow({ startMs: EPOCH, durationHours: 72, stepSeconds: 120 });
        expect(v.warnings.join(' ')).toMatch(/miss passes/);
    });

    it('rejects a non-positive duration or step', () => {
        expect(validateWindow({ startMs: EPOCH, durationHours: 0, stepSeconds: 10 }).ok).toBe(false);
        expect(validateWindow({ startMs: EPOCH, durationHours: 72, stepSeconds: 0 }).ok).toBe(false);
    });

    it('throws rather than analysing an invalid window', () => {
        expect(() => computeAccessIntervals([], { kind: 'POINT', name: 'T', latDeg: 0, lonDeg: 0 },
            { biasDeg: { alongTrack: 0, crossTrack: 0 }, shape: 'ELLIPSE', halfAngle1Deg: 10, halfAngle2Deg: 10, clockingDeg: 0 },
            { startMs: EPOCH, durationHours: -1, stepSeconds: 10 }
        )).toThrow(/Invalid AnalysisWindow/);
    });
});

describe('accessIntervals — union', () => {
    const span = (id: string, s: number, e: number) => ({
        satelliteId: id,
        intervals: [{ startMs: s, endMs: e, clippedAtStart: false, clippedAtEnd: false }],
    });

    it('merges overlapping spans from different satellites', () => {
        const merged = unionAccessIntervals([span('A', 0, 100), span('B', 50, 150)]);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ startMs: 0, endMs: 150 });
        expect(merged[0].satelliteIds).toEqual(['A', 'B']);
    });

    it('keeps disjoint spans separate', () => {
        const merged = unionAccessIntervals([span('A', 0, 100), span('B', 200, 300)]);
        expect(merged).toHaveLength(2);
    });

    it('merges exactly-adjacent spans — no zero-length gap', () => {
        const merged = unionAccessIntervals([span('A', 0, 100), span('B', 100, 200)]);
        expect(merged).toHaveLength(1);
        expect(merged[0].endMs).toBe(200);
    });

    it('absorbs a span fully contained in another', () => {
        const merged = unionAccessIntervals([span('A', 0, 500), span('B', 100, 200)]);
        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ startMs: 0, endMs: 500 });
        expect(merged[0].satelliteIds).toEqual(['A', 'B']);
    });

    it('propagates the clipped flags through a merge', () => {
        const merged = unionAccessIntervals([
            { satelliteId: 'A', intervals: [{ startMs: 0, endMs: 100, clippedAtStart: true, clippedAtEnd: false }] },
            { satelliteId: 'B', intervals: [{ startMs: 50, endMs: 150, clippedAtStart: false, clippedAtEnd: true }] },
        ]);
        expect(merged[0].clippedAtStart).toBe(true);
        expect(merged[0].clippedAtEnd).toBe(true);
    });
});

// ─── EXIT GATE 5 (continued) — the closed-form single-satellite scenario ────
describe('accessIntervals — analytic single-satellite revisit', () => {
    // One equatorial satellite, one equatorial target, one nadir-pointing cone.
    // Every rate in this model is constant, so the whole revisit geometry is
    // closed-form and the engine can be checked against it end to end:
    //
    //   ω_sat = u̇ + Ω̇          (at i = 0 the node and the argument of latitude
    //                            collapse into a single in-plane angle)
    //   ω_rel = ω_sat − ω_E     relative to the rotating Earth
    //   Δ_max = groundArcRad(a, θ)
    //   access duration = 2Δ_max / ω_rel
    //   max gap        = (2π − 2Δ_max) / ω_rel
    const ALT_KM = 600;
    const A_KM = orbitalRadiusKm(ALT_KM);
    const HALF_ANGLE_DEG = 30;

    const element: OrbitalElements = {
        id: 'P00_S00',
        planeIndex: 0,
        satIndexInPlane: 0,
        semiMajorAxisKm: A_KM,
        inclinationDeg: 0,
        raanDeg: 0,
        argLatDeg: 0,
    };

    const target: Target = { kind: 'POINT', name: 'Equator', latDeg: 0, lonDeg: 0 };
    const fov: FovSpec = {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE',
        halfAngle1Deg: HALF_ANGLE_DEG,
        halfAngle2Deg: HALF_ANGLE_DEG,
        clockingDeg: 0,
    };
    const window: AnalysisWindow = { startMs: EPOCH, durationHours: 6, stepSeconds: 10 };

    const omegaRel =
        argLatRateRadPerSec(A_KM, 0) + nodalRegressionRadPerSec(A_KM, 0) - EARTH_ROTATION_RATE_RAD_S;
    const deltaMaxRad = groundArcRad(A_KM, toRad(HALF_ANGLE_DEG)).arcRad;
    const expectedAccessMs = ((2 * deltaMaxRad) / omegaRel) * 1000;
    const expectedGapMs = ((2 * Math.PI - 2 * deltaMaxRad) / omegaRel) * 1000;

    const access = computeAccessIntervals([element], target, fov, window);
    const stats = computeGapStatistics(access.intervals, window, access.warnings);

    // Tolerances here are set by float64, not by the engine. UTC timestamps in
    // 2026 are ~1.78e12 ms, where one ulp is ~4e-4 ms, so differences of two
    // timestamps cannot resolve below about half a microsecond however good the
    // bisection is. 5 µs on a 109-second access is ~12 ulp — the floor, not a
    // concession.
    it('matches the closed-form access duration to the microsecond', () => {
        const interior = access.intervals.filter((i) => !i.clippedAtStart && !i.clippedAtEnd);
        expect(interior.length).toBeGreaterThan(0);
        for (const i of interior) {
            expect(i.endMs - i.startMs).toBeCloseTo(expectedAccessMs, 2);
        }
    });

    it('matches the closed-form maximum gap to the microsecond', () => {
        expect(stats.maxGapMs).not.toBeNull();
        expect(stats.maxGapMs!).toBeCloseTo(expectedGapMs, 2);
        // Relative agreement is at the double-precision limit.
        expect(Math.abs(stats.maxGapMs! - expectedGapMs) / expectedGapMs).toBeLessThan(1e-9);
    });

    it('produces identical interior gaps, as a constant-rate geometry must', () => {
        expect(stats.interiorGapCount).toBeGreaterThan(1);
        expect(stats.meanGapMs!).toBeCloseTo(stats.maxGapMs!, 2);
        expect(stats.p95GapMs!).toBeCloseTo(stats.maxGapMs!, 2);
    });

    it('sums access plus gap to the relative revisit period', () => {
        expect(expectedAccessMs + expectedGapMs)
            .toBeCloseTo(((2 * Math.PI) / omegaRel) * 1000, 6);
        // ~103.37 min against the Earth, longer than the 96.7 min orbital
        // period, because the ground track has to catch up with the rotating
        // Earth.
        //
        // This figure has moved twice, both times for a recorded reason:
        // 103.35 → 103.20 when R4 corrected u̇ to carry both Brouwer secular
        // terms (a faster u̇ shortens the relative period), and 103.20 → 103.37
        // when R28 moved the altitude datum to the equatorial radius (a larger
        // `a` slows u̇ again, and by slightly more).
        expect((expectedAccessMs + expectedGapMs) / 60000).toBeCloseTo(103.37, 1);
    });

    it('agrees with the closed form on fraction in view', () => {
        expect(stats.fractionInView).toBeCloseTo(deltaMaxRad / Math.PI, 2);
    });

    it('discards the boundary gaps and says how many', () => {
        expect(stats.boundaryGapsDiscarded).toBeGreaterThan(0);
        expect(stats.coverage).toBe('INTERMITTENT');
    });

    it('is insensitive to the coarse step, because transitions are bisected', () => {
        for (const stepSeconds of [2, 5, 20, 30]) {
            const w = { ...window, stepSeconds };
            const a = computeAccessIntervals([element], target, fov, w);
            const s = computeGapStatistics(a.intervals, w, a.warnings);
            // Sub-millisecond on a ~6083 s gap, i.e. 1e-10 relative — the
            // bisection's own convergence floor, not a step-size sensitivity.
            expect(s.maxGapMs!).toBeCloseTo(expectedGapMs, 2);
            expect(Math.abs(s.maxGapMs! - expectedGapMs) / expectedGapMs).toBeLessThan(1e-9);
        }
    });
});

// ─── EXIT GATE 4 — determinism ──────────────────────────────────────────────
describe('accessIntervals — determinism', () => {
    const reference: WalkerSpec = {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    };
    const target: Target = { kind: 'POINT', name: 'London', latDeg: 51.5, lonDeg: -0.13 };
    const fov: FovSpec = {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 20, clockingDeg: 15,
    };
    const window: AnalysisWindow = { startMs: EPOCH, durationHours: 24, stepSeconds: 10 };

    function run() {
        const fleet = generateWalkerConstellation(reference);
        const selected = selectSubConstellation(
            reference, { planeStride: 2, satStride: 2, planeShift: 1 }, fleet
        );
        const access = computeAccessIntervals(selected, target, fov, window);
        return { access, stats: computeGapStatistics(access.intervals, window, access.warnings) };
    }

    it('produces byte-identical statistics across repeated runs', () => {
        const a = run();
        const b = run();
        expect(b.stats).toEqual(a.stats);
        expect(b.access.intervals).toEqual(a.access.intervals);
        expect(JSON.stringify(b.stats)).toBe(JSON.stringify(a.stats));
    });

    it('produces a usable result for the reference scenario', () => {
        const { stats } = run();
        expect(stats.coverage).toBe('INTERMITTENT');
        expect(stats.accessCount).toBeGreaterThan(0);
        expect(stats.maxGapMs).not.toBeNull();
        expect(stats.maxGapMs!).toBeGreaterThan(0);
        expect(stats.fractionInView).toBeGreaterThan(0);
        expect(stats.fractionInView).toBeLessThan(1);
    });

    it('does not depend on the order the satellites are supplied in', () => {
        const fleet = generateWalkerConstellation(reference);
        const selected = selectSubConstellation(
            reference, { planeStride: 2, satStride: 2, planeShift: 1 }, fleet
        );
        const forward = computeAccessIntervals(selected, target, fov, window);
        const reversed = computeAccessIntervals([...selected].reverse(), target, fov, window);
        const statsA = computeGapStatistics(forward.intervals, window, forward.warnings);
        const statsB = computeGapStatistics(reversed.intervals, window, reversed.warnings);
        expect(statsB.maxGapMs).toBe(statsA.maxGapMs);
        expect(statsB.accessCount).toBe(statsA.accessCount);
        expect(statsB.totalInViewMs).toBeCloseTo(statsA.totalInViewMs, 6);
    });
});

describe('accessIntervals — physical sanity', () => {
    const reference: WalkerSpec = {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    };
    const fov: FovSpec = {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 30, clockingDeg: 0,
    };
    const window: AnalysisWindow = { startMs: EPOCH, durationHours: 24, stepSeconds: 10 };
    const fleet = generateWalkerConstellation(reference);

    function maxGapFor(selection: { planeStride: number; satStride: number; planeShift: number }) {
        const selected = selectSubConstellation(reference, selection, fleet);
        const access = computeAccessIntervals(selected, { kind: 'POINT', name: 'London', latDeg: 51.5, lonDeg: -0.13 }, fov, window);
        return computeGapStatistics(access.intervals, window, access.warnings);
    }

    it('improves revisit as payloads are added', () => {
        const few = maxGapFor({ planeStride: 3, satStride: 4, planeShift: 0 });
        const many = maxGapFor({ planeStride: 1, satStride: 1, planeShift: 0 });
        expect(many.fractionInView).toBeGreaterThan(few.fractionInView);
        expect(many.maxGapMs!).toBeLessThan(few.maxGapMs!);
    });

    it('never sees a target well below the inclination cut-off', () => {
        // At i = 87.9° the ground track reaches ±87.9°; a near-polar constellation
        // still covers the equator, so use the FOV cut-off instead: a very narrow
        // instrument on a near-polar fleet cannot reach a target it never passes.
        const selected = selectSubConstellation(reference, { planeStride: 1, satStride: 1, planeShift: 0 }, fleet);
        const narrow: FovSpec = { ...fov, halfAngle1Deg: 0.05, halfAngle2Deg: 0.05 };
        const access = computeAccessIntervals(selected, { kind: 'POINT', name: 'T', latDeg: 51.5, lonDeg: -0.13 }, narrow, window);
        const stats = computeGapStatistics(access.intervals, window, access.warnings);
        expect(stats.fractionInView).toBeLessThan(0.01);
    });

    it('keeps every access interval inside the window and ordered', () => {
        const selected = selectSubConstellation(reference, { planeStride: 1, satStride: 2, planeShift: 0 }, fleet);
        const access = computeAccessIntervals(selected, { kind: 'POINT', name: 'T', latDeg: 51.5, lonDeg: -0.13 }, fov, window);
        const windowEnd = window.startMs + window.durationHours * 3600_000;
        let prevEnd = -Infinity;
        for (const i of access.intervals) {
            expect(i.startMs).toBeGreaterThanOrEqual(window.startMs);
            expect(i.endMs).toBeLessThanOrEqual(windowEnd);
            expect(i.endMs).toBeGreaterThan(i.startMs);
            expect(i.startMs).toBeGreaterThan(prevEnd);
            prevEnd = i.endMs;
        }
    });
});
