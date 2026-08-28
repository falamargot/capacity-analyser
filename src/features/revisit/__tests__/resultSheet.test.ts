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
    /*
     * `recommendedPayloadCount: null` used to mean three different things at
     * once, and the document printed the strongest of them — an impossibility —
     * in all three cases. Exporting during the ~25 s sweep produced a customer
     * document stating that nothing meets the requirement, seconds before the
     * screen recommended a configuration that does.
     */
    it('does not claim the requirement is unreachable while the sweep is still running', () => {
        const analysis = runRevisitScenario(scenario);
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 60_000, [], new Date('2026-08-13T12:00:00Z'),
            { recommendedPayloadCount: null, sizingStatus: 'PENDING' },
        );
        expect(sheet.recommendation).toMatch(/still being calculated/i);
        expect(sheet.recommendation).not.toMatch(/No configuration/i);
    });

    it('says the sizing failed rather than that nothing meets the requirement', () => {
        const analysis = runRevisitScenario(scenario);
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 60_000, [], new Date('2026-08-13T12:00:00Z'),
            { recommendedPayloadCount: null, sizingStatus: 'FAILED' },
        );
        expect(sheet.recommendation).toMatch(/could not be calculated/i);
        expect(sheet.recommendation).not.toMatch(/No configuration/i);
        // The measured result above it is untouched by a sizing failure.
        expect(sheet.metrics[0].label).toBe('Maximum revisit gap');
    });

    it('still states the impossibility when the sweep actually completed', () => {
        const analysis = runRevisitScenario(scenario);
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 60_000, [], new Date('2026-08-13T12:00:00Z'),
            { recommendedPayloadCount: null, sizingStatus: 'MEASURED' },
        );
        expect(sheet.recommendation).toMatch(/No configuration on the tested payload range/i);
    });

    /*
     * Primary and Secondary targets own separate requirements. Verdicting every
     * comparison row against the single threshold of whichever target happened
     * to be selected at export time printed `Meets` beside a target the ribbon
     * was reporting as MISSES — the exported customer document contradicted the
     * screen it was exported from.
     */
    it('verdicts every compared target against its own requirement', () => {
        const analysis = runRevisitScenario(scenario);
        const rows = [
            { name: 'London', maxGapMs: 3 * 3600_000 },
            { name: 'Singapore', maxGapMs: 3 * 3600_000 },
        ].map(({ name, maxGapMs }) => ({
            target: { ...london, name },
            // Derived from a real run so the row cannot drift out of shape as
            // `GapStatistics` grows; only the figure under test is overridden.
            statistics: { ...analysis.statistics, maxGapMs, meanGapMs: maxGapMs },
            intervals: [],
            payloadCount: analysis.payloadCount,
            warnings: [],
        }));

        const sheet = buildRevisitResultSheet(
            scenario, analysis, 12 * 3600_000, rows, new Date('2026-08-13T12:00:00Z'),
            // The Secondary target is selected, so the sheet's headline
            // requirement is 12 h — but the Primary row is still judged at 2 h.
            { comparisonRequirementsMs: [2 * 3600_000, 12 * 3600_000] },
        );

        expect(sheet.comparisons[0]).toMatchObject({
            target: 'London', requirement: '2 h', verdict: 'Misses',
        });
        expect(sheet.comparisons[1]).toMatchObject({
            target: 'Singapore', requirement: '12 h', verdict: 'Meets',
        });
    });

    it('falls back to the single requirement when no per-target list is supplied', () => {
        const analysis = runRevisitScenario(scenario);
        const rows = [{
            target: london,
            statistics: {
                ...analysis.statistics,
                maxGapMs: 3 * 3600_000,
                meanGapMs: 3 * 3600_000,
            },
            intervals: [],
            payloadCount: analysis.payloadCount,
            warnings: [],
        }];

        const sheet = buildRevisitResultSheet(
            scenario, analysis, 12 * 3600_000, rows, new Date('2026-08-13T12:00:00Z'),
        );
        expect(sheet.comparisons[0]).toMatchObject({ requirement: '12 h', verdict: 'Meets' });
    });

    it('exports the contractual metric, reproducibility inputs and customer caveats', () => {
        const analysis = runRevisitScenario(scenario);
        const sheet = buildRevisitResultSheet(
            scenario, analysis, 2 * 3600_000, [], new Date('2026-08-13T12:00:00Z')
        );
        expect(sheet.metrics[0].label).toBe('Maximum revisit gap');
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
        expect(sheet.metrics[0]).toEqual({ label: 'Least-covered cell', value: '4 h' });
        expect(sheet.verdict).toBe('FURTHER ENGINEERING ASSESSMENT REQUIRED');
        expect(sheet.assumptions.map((row) => row.label)).toContain('Area grid');
        expect(sheet.caveats.join(' ')).toMatch(/not an average timeline/i);
    });
});
