import { describe, expect, it } from 'vitest';
import {
    explainRevisit, groundHalfAngleDeg, turningLatitudeDeg,
} from '../analysis/explainRevisit';
import { runRevisitScenario } from '../analysis/runScenario';
import { runPayloadSweep } from '../analysis/payloadSweep';
import { FOV_PRESETS } from '../domain/presets';
import type { GapStatistics, RevisitScenario } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);

const scenario = (over: Partial<RevisitScenario> = {}): RevisitScenario => ({
    reference: {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 55, altitudeKm: 1200, phasingF: 1, fudge: 1,
    },
    selection: { planeStride: 2, satStride: 2, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    target: { kind: 'POINT', name: 'London', latDeg: 51.5, lonDeg: -0.13 },
    window: { startMs: EPOCH, durationHours: 24, stepSeconds: 20 },
    ...over,
});

const stats = (over: Partial<GapStatistics> = {}): GapStatistics => ({
    maxGapMs: 3600_000, meanGapMs: 1800_000, p95GapMs: 3000_000,
    accessCount: 20, fractionInView: 0.03, meanAccessDurationMs: 120_000,
    totalInViewMs: 2_400_000, interiorGapCount: 19, boundaryGapsDiscarded: 2,
    coverage: 'INTERMITTENT', warnings: [],
    ...over,
});

describe('explainRevisit — geometry', () => {
    it('reports the turning latitude for prograde and retrograde inclinations', () => {
        expect(turningLatitudeDeg(55)).toBe(55);
        expect(turningLatitudeDeg(90)).toBe(90);
        expect(turningLatitudeDeg(97.8)).toBeCloseTo(82.2, 10);
    });

    it('adds the instrument ground half-angle to the reach', () => {
        const lambda = groundHalfAngleDeg(scenario());
        // A 30° off-nadir half-angle at 1200 km reaches several degrees of arc.
        expect(lambda).toBeGreaterThan(3);
        expect(lambda).toBeLessThan(20);
    });

    it('is BLOCKING and limiting when the target is beyond reach', () => {
        // i = 30° turns at 30°; London at 51.5° is far outside even with the FOV.
        const result = explainRevisit(
            scenario({
                reference: { ...scenario().reference, inclinationDeg: 30 },
            }),
            stats({ coverage: 'NEVER_IN_VIEW', maxGapMs: null, accessCount: 0 }),
            null
        );
        const geometry = result.factors.find((f) => f.id === 'GEOMETRY')!;
        expect(geometry.status).toBe('BLOCKING');
        expect(result.limiting).toBe('GEOMETRY');
        expect(geometry.detail).toMatch(/No number of payloads changes this/);
    });

    it('is OK when the target is within reach', () => {
        const result = explainRevisit(scenario(), stats(), null);
        expect(result.factors.find((f) => f.id === 'GEOMETRY')!.status).toBe('OK');
        expect(result.limiting).not.toBe('GEOMETRY');
    });

    it('counts the FOV as extending the reach past the turning latitude', () => {
        // Inclination 48° turns below London's 51.5°, but a wide instrument reaches it.
        const narrow = explainRevisit(
            scenario({
                reference: { ...scenario().reference, inclinationDeg: 48 },
                payload: FOV_PRESETS.NARROW,
            }), stats(), null
        );
        const wide = explainRevisit(
            scenario({
                reference: { ...scenario().reference, inclinationDeg: 48 },
                payload: FOV_PRESETS.WIDE,
            }), stats(), null
        );
        expect(narrow.factors.find((f) => f.id === 'GEOMETRY')!.status).toBe('BLOCKING');
        expect(wide.factors.find((f) => f.id === 'GEOMETRY')!.status).toBe('OK');
    });
});

describe('explainRevisit — the limiting verdict is evidence-based', () => {
    it('returns no verdict, with a reason, when the ladder has not been swept', () => {
        const result = explainRevisit(scenario(), stats(), null);
        expect(result.limiting).toBeNull();
        expect(result.notDeterminedReason).toMatch(/has not been swept/);
    });

    it('never marks SWATH or PHASING as limiting — that would need runs it does not do', () => {
        const sweep = runPayloadSweep(
            scenario().reference, scenario().target, scenario().payload, scenario().window
        );
        for (const inclination of [50, 55, 70, 88]) {
            const result = explainRevisit(
                scenario({ reference: { ...scenario().reference, inclinationDeg: inclination } }),
                stats(), sweep
            );
            expect(result.limiting).not.toBe('SWATH');
            expect(result.limiting).not.toBe('PHASING');
        }
    });

    it('marks at most one factor limiting, and it matches the reported id', () => {
        const sweep = runPayloadSweep(
            scenario().reference, scenario().target, scenario().payload, scenario().window
        );
        const result = explainRevisit(scenario(), stats(), sweep);
        const flagged = result.factors.filter((f) => f.isLimiting);
        expect(flagged.length).toBeLessThanOrEqual(1);
        if (result.limiting) {
            expect(flagged).toHaveLength(1);
            expect(flagged[0].id).toBe(result.limiting);
        } else {
            expect(flagged).toHaveLength(0);
            expect(result.notDeterminedReason).toBeTruthy();
        }
    });

    it('marks PLANE SPREAD limiting only when a better split was actually measured', () => {
        const base = scenario();
        const sweep = runPayloadSweep(base.reference, base.target, base.payload, base.window);

        // Take the WORSE split from the measurement rather than assuming which
        // one it is. Which placement wins flips with target latitude — at this
        // scenario's i = 55° with London at 51.5°, just under the turning
        // latitude, dense in-plane spacing beats spreading across planes, the
        // reverse of the 87.9° case. Hard-coding either would bake in a claim
        // the engine contradicts.
        const rung = sweep.points.find(
            (p) => p.alternatives.length > 0 && p.spreadAdvantage !== null && p.spreadAdvantage >= 0.1
        );
        expect(rung).toBeDefined();
        const worse = rung!.alternatives[rung!.alternatives.length - 1];

        const concentrated = explainRevisit(
            scenario({ selection: worse.selection }), stats(), sweep
        );
        const spreadFactor = concentrated.factors.find((f) => f.id === 'PLANE_SPREAD')!;
        expect(concentrated.limiting).toBe('PLANE_SPREAD');
        expect(spreadFactor.status).toBe('WARN');
        expect(spreadFactor.detail).toMatch(/% better on worst-case revisit/);

        // The best split at the same count must NOT be flagged.
        const spreadOut = explainRevisit(
            scenario({ selection: rung!.best.selection }), stats(), sweep
        );
        expect(spreadOut.limiting).not.toBe('PLANE_SPREAD');
        expect(spreadOut.factors.find((f) => f.id === 'PLANE_SPREAD')!.status).toBe('OK');
    });

    it('does not assume spreading across planes always wins', () => {
        // The guard against anyone "simplifying" payloadSweep back into
        // enumerateLadder's default ordering, which puts the most-spread split
        // first. Measured on this engine that ordering is sometimes wrong: there
        // exist rungs whose best split has FEWER planes than an available
        // alternative. Asserted as an existence claim rather than for a specific
        // inclination, because the winner is not predictable from the parameters
        // — it flips with inclination non-monotonically and with instrument width.
        const rungsWhereConcentrationWins = [55, 70, 87.9].flatMap((inclinationDeg) => {
            const s = scenario({ reference: { ...scenario().reference, inclinationDeg } });
            const sweep = runPayloadSweep(s.reference, s.target, s.payload, s.window);
            return sweep.points.filter((p) =>
                p.alternatives.some((alt) => alt.selectedPlanes > p.best.selectedPlanes)
            ).map((p) => ({ inclinationDeg, count: p.payloadCount }));
        });

        expect(rungsWhereConcentrationWins.length).toBeGreaterThan(0);
    });

    it('finds the winning split differing between two inclinations, all else equal', () => {
        const bestPlanesAt = (s: RevisitScenario, count: number) => {
            const sweep = runPayloadSweep(s.reference, s.target, s.payload, s.window);
            return sweep.points.find((p) => p.payloadCount === count)?.best.selectedPlanes;
        };
        const at = (inclinationDeg: number) =>
            bestPlanesAt(scenario({ reference: { ...scenario().reference, inclinationDeg } }), 4);

        // Inclination is the only difference; the winning placement still moves.
        expect(at(70)).not.toBe(at(87.9));
    });

    it('flags a short window ahead of plane spread — an untrustworthy number first', () => {
        const short = scenario({
            window: { startMs: EPOCH, durationHours: 6, stepSeconds: 20 },
            selection: { planeStride: 6, satStride: 1, planeShift: 0 },
        });
        const sweep = runPayloadSweep(short.reference, short.target, short.payload, short.window);
        const result = explainRevisit(short, stats(), sweep);
        expect(result.limiting).toBe('ACCESS_WINDOWS');
        expect(result.factors.find((f) => f.id === 'ACCESS_WINDOWS')!.detail)
            .toMatch(/reliability floor/);
    });

    it('puts geometry ahead of everything — nothing else matters out of reach', () => {
        const unreachable = scenario({
            reference: { ...scenario().reference, inclinationDeg: 20 },
            selection: { planeStride: 6, satStride: 1, planeShift: 0 },
            window: { startMs: EPOCH, durationHours: 6, stepSeconds: 20 },
        });
        const sweep = runPayloadSweep(
            unreachable.reference, unreachable.target, unreachable.payload, unreachable.window
        );
        expect(explainRevisit(unreachable, stats(), sweep).limiting).toBe('GEOMETRY');
    });
});

describe('explainRevisit — rows', () => {
    it('returns the five rows the UX spec names, in order', () => {
        const result = explainRevisit(scenario(), stats(), null);
        expect(result.factors.map((f) => f.id)).toEqual([
            'GEOMETRY', 'SWATH', 'PLANE_SPREAD', 'PHASING', 'ACCESS_WINDOWS',
        ]);
    });

    it('reports the swath in kilometres, matching the engine', () => {
        const result = explainRevisit(scenario(), stats(), null);
        const swath = result.factors.find((f) => f.id === 'SWATH')!;
        expect(swath.value).toMatch(/^\d+ km$/);
        const km = Number(swath.value.replace(' km', ''));
        expect(km).toBeGreaterThan(100);
        expect(km).toBeLessThan(8000);
    });

    it('flags a non-integer phasing factor as non-standard', () => {
        const result = explainRevisit(
            scenario({ reference: { ...scenario().reference, phasingF: 1.5 } }), stats(), null
        );
        const phasing = result.factors.find((f) => f.id === 'PHASING')!;
        expect(phasing.status).toBe('WARN');
        expect(phasing.detail).toMatch(/not a standard Walker/);
    });

    it('describes the real access counts when statistics are present', () => {
        const analysis = runRevisitScenario(scenario());
        const result = explainRevisit(scenario(), analysis.statistics, null);
        const windows = result.factors.find((f) => f.id === 'ACCESS_WINDOWS')!;
        expect(windows.value).toBe(`${analysis.statistics.accessCount} / 24 h`);
    });

    it('degrades cleanly with no statistics at all', () => {
        const result = explainRevisit(scenario(), null, null);
        expect(result.factors).toHaveLength(5);
        expect(result.factors.find((f) => f.id === 'ACCESS_WINDOWS')!.value).toBe('—');
    });
});
