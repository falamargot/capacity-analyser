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
        expect(sheet.metrics[0].label).toBe('Maximum gap');
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
        expect(sheet.metrics[0].label).toBe('Maximum gap');
        expect(sheet.assumptions.map((row) => row.label)).toEqual(expect.arrayContaining([
            'Hosted payloads', 'Host fleet', 'Orbit', 'FOV', 'Analysis window',
        ]));
        expect(sheet.caveats.join(' ')).toMatch(/not an operational scheduling/i);
        expect(sheet.caveats.join(' ')).toMatch(/not an instrument datasheet/i);
        expect(sheet.generatedAtIso).toBe('2026-08-13T12:00:00.000Z');
    });

    /*
     * An assumptions table exists so a reader can tell which assumptions
     * produced the numbers beside them. The elevation mask changes every one of
     * those numbers — it can only remove accesses — and used to leave no trace
     * here at all.
     */
    it('states the elevation mask in the FOV assumption when one is applied', () => {
        const bare = buildRevisitResultSheet(
            scenario, runRevisitScenario(scenario), 2 * 3600_000, [],
            new Date('2026-08-13T12:00:00Z'),
        );
        const fovOf = (sheet: { assumptions: Array<{ label: string; value: string }> }) =>
            sheet.assumptions.find((row) => row.label === 'FOV')?.value ?? '';
        expect(fovOf(bare)).not.toMatch(/elevation/);

        const masked: RevisitScenario = {
            ...scenario,
            payload: { ...scenario.payload, minElevationDeg: 15 },
        };
        const sheet = buildRevisitResultSheet(
            masked, runRevisitScenario(masked), 2 * 3600_000, [],
            new Date('2026-08-13T12:00:00Z'),
        );
        expect(fovOf(sheet)).toMatch(/accesses above 15° elevation/);
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
            bindingCells: [],
            inViewProfile: new Float32Array(0),
            worstCellIntervals: [],
            warnings: [],
        };
        const sheet = buildAreaResultSheet(
            scenario, area, 2 * 3600_000, new Date('2026-08-13T12:00:00Z')
        );
        expect(sheet.title).toContain('area');
        expect(sheet.metrics[0]).toEqual({ label: 'Least-covered cell', value: '4 h' });
        // Not "assessment required": the area simply has not been sized, and
        // the tool can size it. The two claims are different.
        expect(sheet.verdict).toBe('NOT SIZED');
        expect(sheet.assumptions.map((row) => row.label)).toContain('Area grid');
        expect(sheet.caveats.join(' ')).toMatch(/not an average timeline/i);
    });
    /*
     * The document must not deny a measurement the screen made. Before this,
     * `buildAreaResultSheet` had no way to receive the sizing result, so a user
     * who measured 36 payloads, read "MORE PAYLOADS REQUIRED" on screen and
     * exported got a summary saying the area had never been sized.
     */
    it('carries a measured area sizing into the document', () => {
        const area = missingAreaAnalysis();
        const sheet = buildAreaResultSheet(
            scenario, area, 2 * 3600_000, new Date('2026-08-13T12:00:00Z'),
            {
                areaSizing: {
                    kind: 'VERIFIED',
                    payloadCount: 36,
                    selection: { planeStride: 1, satStride: 4, planeShift: 0 },
                    selectedPlanes: 12,
                    payloadsPerPlane: 3,
                    worstCellGapMs: 1.5 * 3600_000,
                    candidatesTried: 2,
                    analysis: area,
                    attempts: [],
                    probeRejected: 40,
                    ladderSize: 60,
                },
            },
        );

        expect(sheet.verdict).toBe('MORE PAYLOADS REQUIRED');
        expect(sheet.recommendation).toContain('36 payload-equipped satellites');
        expect(sheet.recommendation).toContain('12 planes × 3 per plane');
        // The scope of the claim travels with the number, or a reader takes it
        // for an optimum.
        expect(sheet.recommendation).toContain('not proved minimal');
        expect(sheet.caveats.join(' ')).toMatch(/2 candidates over every cell/);
    });

    /* A search that RAN and found nothing is an impasse, not an unasked question. */
    it('distinguishes a failed search from one never run', () => {
        const area = missingAreaAnalysis();
        const sheet = buildAreaResultSheet(
            scenario, area, 2 * 3600_000, new Date('2026-08-13T12:00:00Z'),
            {
                areaSizing: {
                    kind: 'NONE',
                    candidatesTried: 0,
                    stoppedAtCeiling: false,
                    probeRejected: 60,
                    attempts: [],
                    ladderSize: 60,
                },
            },
        );

        expect(sheet.verdict).toBe('ASSESSMENT REQUIRED');
        expect(sheet.recommendation).toContain('least-covered cell of this area');
        expect(sheet.recommendation).not.toContain('has not been measured');
    });
});

/** An area that misses a 2 h requirement on its only cell. */
function missingAreaAnalysis(): AreaAnalysis {
    const statistics = {
        maxGapMs: 4 * 3600_000, meanGapMs: 3 * 3600_000, p95GapMs: 4 * 3600_000,
        accessCount: 4, fractionInView: 0.05, meanAccessDurationMs: 60_000,
        totalInViewMs: 240_000, interiorGapCount: 3, boundaryGapsDiscarded: 2,
        coverage: 'INTERMITTENT' as const, warnings: [],
    };
    const cell = {
        target: { kind: 'POINT' as const, name: 'Cell 1', latDeg: 45.5, lonDeg: 1.5 },
        statistics, maxGapMs: statistics.maxGapMs,
    };
    return {
        area: {
            kind: 'AREA', name: 'Customer AOI', gridSpacingDeg: 1,
            boundary: [
                { latDeg: 45, lonDeg: 1 }, { latDeg: 45, lonDeg: 2 },
                { latDeg: 46, lonDeg: 2 },
            ],
        },
        cells: [cell],
        worstCell: cell,
        bestCell: cell,
        meanCellMaxGapMs: statistics.maxGapMs,
        neverInViewCount: 0,
        unmeasuredCount: 0,
        bindingCells: [],
        inViewProfile: new Float32Array(0),
        worstCellIntervals: [],
        warnings: [],
    };
}
