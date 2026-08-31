/**
 * Area sizing — probe one cell, verify the whole grid.
 *
 * The tests that matter here are not "does it return a number". They are the
 * two claims the feature makes and the one it must never make:
 *
 *   - the answer is VERIFIED on every cell, not extrapolated from the probe;
 *   - a candidate that passes the probe cell but fails elsewhere is rejected —
 *     the case that justifies the verification step existing at all;
 *   - nothing is proposed when nothing was measured to pass.
 */

import { describe, expect, it, vi } from 'vitest';
import { sizeArea } from '../analysis/areaSizing';
import { analyseArea } from '../analysis/areaAnalysis';
import { boxArea, generateGrid } from '../domain/areaTarget';
import { FOV_PRESETS } from '../domain/presets';
import type { PointTarget, RevisitScenario, WalkerSpec } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);

/** Small shell and a coarse step: these tests exercise control flow, not physics. */
const reference: WalkerSpec = {
    pattern: 'STAR', planes: 6, satsPerPlane: 4,
    inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};

const scenario: Omit<RevisitScenario, 'target'> = {
    reference,
    selection: { planeStride: 3, satStride: 4, planeShift: 0 },
    payload: FOV_PRESETS.WIDE,
    window: { startMs: EPOCH, durationHours: 24, stepSeconds: 60 },
};

const area = boxArea('Test area', 44, 0, 50, 6, 2);
const probeCell: PointTarget = { kind: 'POINT', name: 'Probe', latDeg: 47, lonDeg: 3 };

const HOUR = 3600_000;

describe('sizeArea', () => {
    it('verifies its answer on the whole grid, not on the probe cell', () => {
        const result = sizeArea(scenario, area, probeCell, 6 * HOUR);
        expect(result.kind).toBe('VERIFIED');
        if (result.kind !== 'VERIFIED') return;

        // The reported worst case is the verified area's, and it meets the
        // requirement — the claim the card will print.
        expect(result.worstCellGapMs).toBeLessThanOrEqual(6 * HOUR);
        expect(result.analysis.worstCell?.maxGapMs).toBe(result.worstCellGapMs);

        // Re-running the area at the returned selection reproduces it exactly.
        const replay = analyseArea({ ...scenario, selection: result.selection }, area);
        expect(replay.worstCell?.maxGapMs).toBe(result.worstCellGapMs);
        expect(result.payloadCount).toBe(result.selectedPlanes * result.payloadsPerPlane);
    });

    /*
     * The reason verification exists. A requirement tight enough that the probe
     * cell's ranking cannot be trusted must still produce either a verified
     * answer or an honest absence — never a count taken from the probe alone.
     */
    it('rejects a candidate that passes the probe cell but fails another', () => {
        const verifiedCounts: number[] = [];
        const result = sizeArea(scenario, area, probeCell, 3 * HOUR, {
            onProgress: (progress) => {
                if (progress.phase === 'verify' && progress.completed === progress.total) {
                    verifiedCounts.push(progress.candidate);
                }
            },
        });

        if (result.kind === 'VERIFIED') {
            const replay = analyseArea({ ...scenario, selection: result.selection }, area);
            expect(replay.worstCell?.maxGapMs).toBeLessThanOrEqual(3 * HOUR);
        } else {
            expect(result.candidatesTried).toBeGreaterThan(0);
        }
        // Whatever the outcome, at least one candidate was actually verified on
        // the full grid rather than assumed from the probe.
        expect(verifiedCounts.length).toBeGreaterThan(0);
    });

    /*
     * The probe cell is IN the grid, so a configuration that misses there has a
     * failing cell already. Verifying it would spend a full grid pass to confirm
     * what the probe proved — so an out-of-reach requirement costs the ladder
     * and nothing more.
     */
    it('proposes nothing, and spends no grid pass, when the probe rules everything out', () => {
        const result = sizeArea(scenario, area, probeCell, 60_000);
        expect(result.kind).toBe('NONE');
        if (result.kind !== 'NONE') return;
        expect(result.candidatesTried).toBe(0);
        expect(result.stoppedAtCeiling).toBe(false);
        expect(result.probeRejected).toBeGreaterThan(0);
    });

    /*
     * The ceiling exists for the opposite case: many configurations pass the
     * probe cell and keep failing elsewhere. It must be reported as a ceiling —
     * "we stopped looking" is not "nothing works".
     */
    it('reports the ceiling when it is the ceiling that stopped the search', () => {
        const result = sizeArea(scenario, area, probeCell, 6 * HOUR, { maxCandidates: 0 });
        expect(result.kind).toBe('NONE');
        if (result.kind !== 'NONE') return;
        expect(result.stoppedAtCeiling).toBe(true);
        expect(result.candidatesTried).toBe(0);
    });

    it('reports the probe phase before any verification', () => {
        const phases: string[] = [];
        sizeArea(scenario, area, probeCell, 6 * HOUR, {
            onProgress: (progress) => {
                if (phases[phases.length - 1] !== progress.phase) phases.push(progress.phase);
            },
        });
        expect(phases[0]).toBe('probe');
        expect(phases).toContain('verify');
    });

    it('is deterministic', () => {
        const first = sizeArea(scenario, area, probeCell, 6 * HOUR);
        const second = sizeArea(scenario, area, probeCell, 6 * HOUR);
        expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });

    it('does not depend on the selection currently flown', () => {
        const asFlown = sizeArea(scenario, area, probeCell, 6 * HOUR);
        const different = sizeArea(
            { ...scenario, selection: { planeStride: 1, satStride: 1, planeShift: 0 } },
            area, probeCell, 6 * HOUR,
        );
        expect(JSON.stringify(asFlown)).toBe(JSON.stringify(different));
    });
});

/*
 * The search has to be inspectable, or "verified, not minimal" is a claim
 * nobody can check. These pin the trace the card renders.
 */
describe('sizeArea — evidence', () => {
    it('records what the probe promised and what the grid delivered', () => {
        const result = sizeArea(scenario, area, probeCell, 6 * HOUR);
        expect(result.kind).toBe('VERIFIED');
        if (result.kind !== 'VERIFIED') return;

        expect(result.attempts.length).toBe(result.candidatesTried);
        expect(result.attempts[result.attempts.length - 1].passed).toBe(true);
        expect(result.ladderSize).toBeGreaterThan(result.probeRejected);

        for (const attempt of result.attempts) {
            // Both figures are present for every attempt: the ranking basis and
            // the measured outcome. A trace with only one of them explains
            // nothing.
            expect(attempt.probeGapMs).toBeGreaterThan(0);
            expect(attempt.payloadCount)
                .toBe(attempt.selectedPlanes * attempt.payloadsPerPlane);
            if (attempt.passed) {
                expect(attempt.areaWorstGapMs).not.toBeNull();
                expect(attempt.areaWorstGapMs!).toBeLessThanOrEqual(6 * HOUR);
            }
        }
    });

    /* Nothing verified means nothing to show, and the counts must say why. */
    it('reports an empty trace when the probe rejected the whole ladder', () => {
        const result = sizeArea(scenario, area, probeCell, 60_000);
        expect(result.kind).toBe('NONE');
        if (result.kind !== 'NONE') return;
        expect(result.attempts).toEqual([]);
        expect(result.probeRejected).toBe(result.ladderSize);
    });
});

/*
 * M1. A candidate that fails must cost the batch containing its first failing
 * cell, not the grid — the verdict is identical either way, the work is not.
 */
describe('sizeArea — early exit', () => {
    /*
     * A grid larger than one batch, or there is nothing to stop early: a
     * 9-cell area is computed in a single shared-propagation pass, so the
     * saving only appears past the batch size.
     */
    const wideArea = boxArea('Wide area', 40, 0, 52, 12, 1.5);

    it('stops a failing verification instead of finishing the grid', () => {
        const result = sizeArea(scenario, wideArea, probeCell, 2 * HOUR);
        const failed = result.attempts.filter((attempt) => !attempt.passed);

        expect(failed.length).toBeGreaterThan(0);
        for (const attempt of failed) {
            // The verdict was reached without measuring the rest of the grid.
            expect(attempt.cellsComputed).toBeGreaterThan(0);
            expect(attempt.cellsComputed).toBeLessThan(attempt.totalCells);
            expect(attempt.totalCells).toBe(generateGrid(wideArea).length);
            // And the figure printed for a failure is the cell that failed.
            expect(attempt.areaWorstGapMs === null
                || attempt.areaWorstGapMs > 2 * HOUR).toBe(true);
        }
    });

    /* A passing candidate is measured on every cell — no early exit there. */
    it('never truncates the verification it accepts', () => {
        const result = sizeArea(scenario, wideArea, probeCell, 2 * HOUR);
        expect(result.kind).toBe('VERIFIED');
        if (result.kind !== 'VERIFIED') return;
        const accepted = result.attempts[result.attempts.length - 1];
        expect(accepted.passed).toBe(true);
        expect(accepted.cellsComputed).toBe(generateGrid(wideArea).length);
        expect(result.analysis.cells.length).toBe(generateGrid(wideArea).length);
    });
});

describe('sizeArea — cost', () => {
    /*
     * The whole point of probing one cell: the ladder is walked once, whatever
     * the grid holds. Counted through the progress callback, which reports the
     * grid size on every verification pass.
     */
    it('walks the ladder once, then only full-grid passes', () => {
        const onProgress = vi.fn();
        sizeArea(scenario, area, probeCell, 6 * HOUR, { onProgress });

        const calls = onProgress.mock.calls.map(([progress]) => progress);
        const probes = calls.filter((p) => p.phase === 'probe');
        const verifies = calls.filter((p) => p.phase === 'verify');

        expect(probes.length).toBe(2); // one before, one after
        expect(new Set(verifies.map((p) => p.total)).size).toBe(1);
        expect(verifies[0].total).toBeGreaterThan(1);
    });
});
