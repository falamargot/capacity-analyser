import { describe, expect, it } from 'vitest';
import { computeAccessIntervals, computeAccessIntervalsForTargets } from '../analysis/accessIntervals';
import { generateWalkerConstellation } from '../domain/walker';
import { selectSubConstellation } from '../domain/subConstellation';
import type { AnalysisWindow, FovSpec, PointTarget, WalkerSpec } from '../domain/types';
import { compareRevisitTargets } from '../analysis/targetComparison';

describe('bounded target comparison', () => {
    it('is byte-identical to independent target runs while sharing propagation', () => {
        const reference: WalkerSpec = {
            pattern: 'STAR', planes: 4, satsPerPlane: 4,
            inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
        };
        const selection = { planeStride: 2, satStride: 2, planeShift: 0 };
        const selected = selectSubConstellation(
            reference, selection, generateWalkerConstellation(reference),
        );
        const fov: FovSpec = {
            biasDeg: { alongTrack: 0, crossTrack: 0 }, shape: 'ELLIPSE',
            halfAngle1Deg: 25, halfAngle2Deg: 25, clockingDeg: 0,
        };
        const window: AnalysisWindow = {
            startMs: Date.UTC(2026, 7, 13), durationHours: 24, stepSeconds: 30,
        };
        const targets: PointTarget[] = [
            { kind: 'POINT', name: 'London', latDeg: 51.5074, lonDeg: -0.1278 },
            { kind: 'POINT', name: 'Singapore', latDeg: 1.3521, lonDeg: 103.8198 },
            { kind: 'POINT', name: 'Longyearbyen', latDeg: 78.2232, lonDeg: 15.6267 },
        ];
        const shared = computeAccessIntervalsForTargets(selected, targets, fov, window);
        const independent = targets.map((target) => computeAccessIntervals(selected, target, fov, window));
        expect(shared).toEqual(independent);
    });

    it('rejects an unbounded target list', () => {
        expect(() => computeAccessIntervalsForTargets([], Array.from({ length: 4 }, (_, index) => ({
            kind: 'POINT' as const, name: String(index), latDeg: 0, lonDeg: index,
        })), {
            biasDeg: { alongTrack: 0, crossTrack: 0 }, shape: 'ELLIPSE',
            halfAngle1Deg: 10, halfAngle2Deg: 10, clockingDeg: 0,
        }, { startMs: 0, durationHours: 24, stepSeconds: 30 })).toThrow(/at most 3/i);
    });

    it('returns the bounded timelines needed by the comparison ribbon', () => {
        const reference: WalkerSpec = {
            pattern: 'STAR', planes: 2, satsPerPlane: 4,
            inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
        };
        const scenario = {
            reference,
            selection: { planeStride: 1, satStride: 2, planeShift: 0 },
            payload: {
                biasDeg: { alongTrack: 0, crossTrack: 0 }, shape: 'ELLIPSE' as const,
                halfAngle1Deg: 25, halfAngle2Deg: 25, clockingDeg: 0,
            },
            target: { kind: 'POINT' as const, name: 'London', latDeg: 51.5, lonDeg: -0.1 },
            window: { startMs: Date.UTC(2026, 7, 13), durationHours: 24, stepSeconds: 30 },
        };
        const rows = compareRevisitTargets(scenario, [scenario.target]);
        expect(rows).toHaveLength(1);
        expect(rows[0].intervals.length).toBeGreaterThan(0);
    });
});
