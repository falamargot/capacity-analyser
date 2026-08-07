/**
 * selectionReconcile.ts — one canonical answer to "which configuration is on
 * screen, and is it the best one?"
 *
 * ── THE BUG THIS MODULE EXISTS TO PREVENT ───────────────────────────────────
 * The headline KPI is computed from `scenario.selection`. The value curve plots
 * the sweep's MEASURED best at each payload count. Nothing kept those two in
 * step, so on first load the KPI described the preset's split (4 planes × 2,
 * 9 h 40) while the chart showed the measured best at the same payload count
 * (2 planes × 4, 6 h 05) — two different constellations, both presented as the
 * answer. The header made it worse by labelling the preset "best of 3 splits"
 * using `enumerateLadder`'s ordering, which is a deterministic default and not a
 * measurement.
 *
 * ── WHY NOT SIMPLY ALWAYS SNAP TO THE BEST ─────────────────────────────────
 * Because the Advanced drawer exists. An engineer who sets x and y deliberately
 * is asking "what does THIS configuration do?", and silently replacing it the
 * moment a sweep lands would answer a different question. So the selection
 * carries its provenance: an automatic selection (preset, slider, value-curve
 * click) reconciles to the measured best; a manual one never does, and is
 * instead reported alongside the best so the comparison is explicit.
 */

import type { PayloadSweepResult } from '../analysis/payloadSweep';
import type { SubConstellationSpec } from './types';

/**
 * Where the current selection came from.
 *
 * `auto` — chosen for the user (preset, payload slider, value curve).
 * `manual` — set explicitly in the Advanced drawer.
 */
export type SelectionSource = 'auto' | 'manual';

export function sameSelection(
    a: SubConstellationSpec, b: SubConstellationSpec
): boolean {
    return a.planeStride === b.planeStride
        && a.satStride === b.satStride
        && a.planeShift === b.planeShift;
}

export interface SelectionStatus {
    /** The measured best selection at this payload count, if the sweep has run. */
    bestSelection: SubConstellationSpec | null;
    /** Planes × per-plane of the measured best, for display. */
    bestSplit: { planes: number; perPlane: number } | null;
    /** Worst-case gap of the measured best, ms. */
    bestMaxGapMs: number | null;
    /** How many configurations exist at this payload count. */
    configurationCount: number;
    /** True when the current selection IS the measured best. */
    isBest: boolean;
    /**
     * Set only when the current selection is NOT the measured best AND the
     * difference has been measured — the fraction by which the best improves on
     * it. Never derived from the ladder's ordering.
     */
    improvementAvailable: number | null;
}

/**
 * Compare the current selection against what the sweep measured.
 *
 * Returns `isBest: true` while the sweep is unavailable — not because it is
 * known to be best, but because nothing may be *claimed* about it yet. Callers
 * must not render a "best" label off the back of a null sweep.
 */
export function selectionStatus(
    selection: SubConstellationSpec,
    payloadCount: number,
    sweep: PayloadSweepResult | null
): SelectionStatus {
    const point = sweep?.points.find((p) => p.payloadCount === payloadCount);
    if (!point) {
        return {
            bestSelection: null,
            bestSplit: null,
            bestMaxGapMs: null,
            configurationCount: 0,
            isBest: true,
            improvementAvailable: null,
        };
    }

    const isBest = sameSelection(selection, point.best.selection);
    const mine = [point.best, ...point.alternatives]
        .find((c) => sameSelection(c.selection, selection));

    const improvementAvailable = !isBest
        && mine?.maxGapMs != null
        && point.best.maxGapMs != null
        && mine.maxGapMs > 0
        ? (mine.maxGapMs - point.best.maxGapMs) / mine.maxGapMs
        : null;

    return {
        bestSelection: point.best.selection,
        bestSplit: {
            planes: point.best.selectedPlanes,
            perPlane: point.best.payloadsPerPlane,
        },
        bestMaxGapMs: point.best.maxGapMs,
        configurationCount: 1 + point.alternatives.length,
        isBest,
        improvementAvailable,
    };
}

/**
 * The selection that should be on screen once the sweep is known.
 *
 * Returns null when nothing should change — no sweep yet, already best, or the
 * user chose this configuration deliberately.
 */
export function reconcileToMeasuredBest(
    selection: SubConstellationSpec,
    payloadCount: number,
    sweep: PayloadSweepResult | null,
    source: SelectionSource
): SubConstellationSpec | null {
    if (source === 'manual' || !sweep) return null;

    const status = selectionStatus(selection, payloadCount, sweep);
    if (status.isBest || !status.bestSelection) return null;

    // Keep the user's plane shift: z redistributes payloads within a rung and is
    // not what the sweep ranks.
    return { ...status.bestSelection, planeShift: selection.planeShift };
}
