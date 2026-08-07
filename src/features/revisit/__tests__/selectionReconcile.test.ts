import { describe, expect, it } from 'vitest';
import {
    reconcileToMeasuredBest, sameSelection, selectionStatus,
} from '../domain/selectionReconcile';
import { runPayloadSweep } from '../analysis/payloadSweep';
import { DEFAULT_REFERENCE, DEFAULT_SELECTION, FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import { payloadCount } from '../domain/subConstellation';
import type { AnalysisWindow, SubConstellationSpec } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);
const london = TARGET_PRESETS.find((t) => t.name === 'London')!;
const window: AnalysisWindow = { startMs: EPOCH, durationHours: 24, stepSeconds: 30 };

/** The real default scenario — the one that shipped the divergence. */
const sweep = runPayloadSweep(DEFAULT_REFERENCE, london, FOV_PRESETS.STANDARD, window);
const defaultCount = payloadCount(DEFAULT_REFERENCE, DEFAULT_SELECTION);

describe('sameSelection', () => {
    const a: SubConstellationSpec = { planeStride: 3, satStride: 4, planeShift: 0 };
    it('compares all three fields', () => {
        expect(sameSelection(a, { ...a })).toBe(true);
        expect(sameSelection(a, { ...a, planeStride: 1 })).toBe(false);
        expect(sameSelection(a, { ...a, satStride: 1 })).toBe(false);
        expect(sameSelection(a, { ...a, planeShift: 2 })).toBe(false);
    });
});

describe('selectionStatus — claims nothing without measurement', () => {
    it('reports no best and no comparison while the sweep is unavailable', () => {
        const status = selectionStatus(DEFAULT_SELECTION, defaultCount, null);
        expect(status.bestSelection).toBeNull();
        expect(status.bestSplit).toBeNull();
        expect(status.configurationCount).toBe(0);
        expect(status.improvementAvailable).toBeNull();
    });

    it('reports the measured best split and its gap once swept', () => {
        const status = selectionStatus(DEFAULT_SELECTION, defaultCount, sweep);
        expect(status.bestSelection).not.toBeNull();
        expect(status.bestSplit!.planes * status.bestSplit!.perPlane).toBe(defaultCount);
        expect(status.bestMaxGapMs).not.toBeNull();
        expect(status.configurationCount).toBeGreaterThan(1);
    });

    it('quantifies the improvement only against a measured alternative', () => {
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        const worse = point.alternatives[point.alternatives.length - 1];
        const status = selectionStatus(worse.selection, defaultCount, sweep);
        expect(status.isBest).toBe(false);
        expect(status.improvementAvailable).not.toBeNull();
        expect(status.improvementAvailable!).toBeGreaterThan(0);
        expect(status.improvementAvailable!).toBeLessThan(1);
    });

    it('reports isBest for the measured winner', () => {
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        expect(selectionStatus(point.best.selection, defaultCount, sweep).isBest).toBe(true);
        expect(selectionStatus(point.best.selection, defaultCount, sweep).improvementAvailable)
            .toBeNull();
    });
});

// ── The regression this module exists for ──────────────────────────────────
describe('reconcileToMeasuredBest', () => {
    it('moves the shipped preset onto the measured best', () => {
        // The bug: the preset's split is chosen from the ladder's ordering, so it
        // can differ from what the sweep measures. Before this fix the KPI showed
        // the preset while the value curve plotted the measured best — two
        // different constellations, both presented as the answer.
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        const better = reconcileToMeasuredBest(
            DEFAULT_SELECTION, defaultCount, sweep, 'auto'
        );

        if (sameSelection(DEFAULT_SELECTION, point.best.selection)) {
            // Already best for this preset — then nothing should move.
            expect(better).toBeNull();
        } else {
            expect(better).not.toBeNull();
            expect(better!.planeStride).toBe(point.best.selection.planeStride);
            expect(better!.satStride).toBe(point.best.selection.satStride);
        }
    });

    it('leaves an explicit Advanced-drawer choice alone', () => {
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        const worse = point.alternatives[point.alternatives.length - 1];
        // Same inputs, only the provenance differs.
        expect(reconcileToMeasuredBest(worse.selection, defaultCount, sweep, 'auto'))
            .not.toBeNull();
        expect(reconcileToMeasuredBest(worse.selection, defaultCount, sweep, 'manual'))
            .toBeNull();
    });

    it('does nothing before the sweep lands, rather than guessing', () => {
        expect(reconcileToMeasuredBest(DEFAULT_SELECTION, defaultCount, null, 'auto'))
            .toBeNull();
    });

    it('does nothing when the selection is already the measured best', () => {
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        expect(reconcileToMeasuredBest(point.best.selection, defaultCount, sweep, 'auto'))
            .toBeNull();
    });

    it('preserves the plane shift, which the sweep does not rank', () => {
        const point = sweep.points.find((p) => p.payloadCount === defaultCount)!;
        const worse = point.alternatives[point.alternatives.length - 1];
        const better = reconcileToMeasuredBest(
            { ...worse.selection, planeShift: 3 }, defaultCount, sweep, 'auto'
        );
        expect(better).not.toBeNull();
        expect(better!.planeShift).toBe(3);
    });

    it('converges — reconciling twice is a fixed point', () => {
        const once = reconcileToMeasuredBest(DEFAULT_SELECTION, defaultCount, sweep, 'auto')
            ?? DEFAULT_SELECTION;
        expect(reconcileToMeasuredBest(once, defaultCount, sweep, 'auto')).toBeNull();
    });

    it('agrees with the value curve at EVERY payload count', () => {
        // The property the whole fix is for: after reconciliation the selection
        // the KPI is computed from is exactly the one the chart plots.
        for (const point of sweep.points) {
            const reconciled = reconcileToMeasuredBest(
                point.alternatives[0]?.selection ?? point.best.selection,
                point.payloadCount, sweep, 'auto'
            ) ?? point.best.selection;
            expect(sameSelection(reconciled, point.best.selection)).toBe(true);
        }
    });
});
