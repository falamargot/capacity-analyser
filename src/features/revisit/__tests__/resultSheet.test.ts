import { describe, expect, it } from 'vitest';
import { buildAreaResultSheet, buildRevisitResultSheet } from '../analysis/resultSheet';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { runRevisitScenario } from '../analysis/runScenario';
import { FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';

const london = TARGET_PRESETS.find((target) => target.name === 'London')!;
const scenario: RevisitScenario = {
    reference: {
        pattern: 'STAR', planes: 4, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    },
    selection: { planeStride: 2, satStride: 2, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    target: london,
    window: { startMs: Date.UTC(2026, 7, 13), durationHours: 24, stepSeconds: 60 },
};

describe('REVISIT result sheet', () => {
    it('exports the contractual metric, reproducibility inputs and customer caveats', () => {
        const analysis = runRevisitScenario(scenario);
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 2 * 3600_000, [], new Date('2026-08-13T12:00:00Z')
        );
        expect(sheet.metrics[0].label).toBe('Worst-case revisit');
        expect(sheet.assumptions.map((row) => row.label)).toEqual(expect.arrayContaining([
            'Hosted payloads', 'Host fleet', 'Orbit', 'FOV', 'Analysis window',
        ]));
        expect(sheet.caveats.join(' ')).toMatch(/not an operational scheduling/i);
        expect(sheet.caveats.join(' ')).toMatch(/not an instrument datasheet/i);
        expect(sheet.generatedAtIso).toBe('2026-08-13T12:00:00.000Z');
    });

    it('exports the determining cell and area-specific qualifications', () => {
        const statistics = {
            maxGapMs: 4 * 3600_000, meanGapMs: 3 * 3600_000, p95GapMs: 4 * 3600_000,
            accessCount: 4, fractionInView: 0.05, meanAccessDurationMs: 60_000,
            totalInViewMs: 240_000, interiorGapCount: 3, boundaryGapsDiscarded: 2,
            coverage: 'INTERMITTENT' as const, warnings: [],
        };
        const area: AreaAnalysis = {
            area: {
                kind: 'AREA', name: 'Customer AOI', gridSpacingDeg: 1,
                boundary: [
                    { latDeg: 45, lonDeg: 1 }, { latDeg: 45, lonDeg: 2 },
                    { latDeg: 46, lonDeg: 2 },
                ],
            },
            cells: [{
                target: { kind: 'POINT', name: 'Cell 1', latDeg: 45.5, lonDeg: 1.5 },
                statistics, maxGapMs: statistics.maxGapMs,
            }],
            worstCell: {
                target: { kind: 'POINT', name: 'Cell 1', latDeg: 45.5, lonDeg: 1.5 },
                statistics, maxGapMs: statistics.maxGapMs,
            },
            bestCell: {
                target: { kind: 'POINT', name: 'Cell 1', latDeg: 45.5, lonDeg: 1.5 },
                statistics, maxGapMs: statistics.maxGapMs,
            },
            meanCellMaxGapMs: statistics.maxGapMs,
            neverInViewCount: 0,
            unmeasuredCount: 0,
            worstCellIntervals: [],
            warnings: [],
        };
        const sheet = buildAreaResultSheet(
            scenario, area, 2 * 3600_000, new Date('2026-08-13T12:00:00Z')
        );
        expect(sheet.title).toContain('area');
        expect(sheet.metrics[0]).toEqual({ label: 'Worst cell', value: '4 h' });
        expect(sheet.verdict).toBe('AREA MISSES TARGET');
        expect(sheet.assumptions.map((row) => row.label)).toContain('Area grid');
        expect(sheet.caveats.join(' ')).toMatch(/not an average timeline/i);
    });
});
