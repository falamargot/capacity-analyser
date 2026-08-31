/**
 * areaAnalysis.ts — run the point engine over a gridded area.
 *
 * The whole of area support is this: reduce the polygon to cell centres, run the
 * *unchanged* point engine on each, and aggregate. Nothing in `containment.ts`,
 * `accessIntervals.ts` or `gapStatistics.ts` knows areas exist, which is what
 * keeps the validated core validated.
 *
 * ── WHAT THE AGGREGATE NUMBERS MEAN ─────────────────────────────────────────
 * **Worst cell is the headline**, for the same reason max gap is the headline
 * for a point (ADR-001 §3): it is the number a customer would contract against.
 * A mean over cells flatters the result and hides the corner of the area that
 * fails.
 *
 * The mean is a mean over CELLS, not over AREA. Cells sit on a regular lat/lon
 * lattice, so they cover less ground as latitude rises and high-latitude cells
 * are over-weighted. For the areas this tool is meant for that bias is small,
 * but it is real and is stated rather than buried — do not quote the mean as an
 * area-weighted average.
 */

import type {
    AccessInterval, AnalysisWindow, FovSpec, GapStatistics, PointTarget, RevisitScenario,
} from '../domain/types';
import type { AreaTarget } from '../domain/areaTarget';
import { generateGrid, validateArea } from '../domain/areaTarget';
import { mergeValidations } from '../domain/inputValidation';
import { selectSubConstellation } from '../domain/subConstellation';
import { constellationFor, type ConstellationCache } from './runScenario';
import { computeAccessIntervalsForCells } from './accessIntervals';

/**
 * Cells computed per shared propagation pass.
 *
 * Twelve is a compromise measured on the default window: it removes 11 of every
 * 12 propagation passes — most of the available gain — while keeping the
 * progress bar moving eight times on a 96-cell grid and the peak interval
 * retention at twelve cells' worth. Raising it buys little; lowering it towards
 * 1 returns to the old cost.
 */
const AREA_CELL_BATCH = 12;
import { computeGapStatistics } from './gapStatistics';
import { validateScenarioBase } from './scenarioValidation';

export interface AreaCellResult {
    target: PointTarget;
    statistics: GapStatistics;
    /** Convenience mirror of `statistics.maxGapMs`, the value the heat map colours by. */
    maxGapMs: number | null;
}

export interface AreaAnalysis {
    area: AreaTarget;
    cells: AreaCellResult[];
    /** The headline: the worst-performing cell in the area. */
    worstCell: AreaCellResult | null;
    bestCell: AreaCellResult | null;
    /** Mean of the per-cell max gaps, over cells that produced one. */
    meanCellMaxGapMs: number | null;
    /** Cells where the target is never in view — they have no gap figure at all. */
    neverInViewCount: number;
    /** Cells that produced no interior gap, usually because the window is short. */
    unmeasuredCount: number;
    /** Accesses of the contractual worst cell only; avoids retaining every cell timeline. */
    worstCellIntervals: AccessInterval[];
    warnings: string[];
}

export interface AreaAnalysisOptions {
    /** Reports progress as cells complete, for a long-running grid. */
    onProgress?: (completed: number, total: number) => void;
}

/**
 * Analyse an area.
 *
 * @throws if the area does not validate — most importantly if the grid is
 *         coarser than the swath, which would produce an aliased heat map that
 *         looks authoritative and is not.
 */
export function analyseArea(
    scenario: Omit<RevisitScenario, 'target'>,
    area: AreaTarget,
    options: AreaAnalysisOptions = {}
): AreaAnalysis {
    const collected = collectCells(scenario, area, options);
    return finaliseArea(area, collected);
}

/**
 * Everything the grid produced, before it is turned into an `AreaAnalysis`.
 *
 * `stoppedAt` is the cell that ended the run early, and it is the reason this
 * intermediate exists: a partial set of cells must never become an
 * `AreaAnalysis`. A truncated grid has no worst cell, no mean and no
 * distribution — only the knowledge that one cell failed — and the way to stop
 * a partial result reaching the heat map is to make it a different type, not to
 * flag it and rely on every consumer checking the flag.
 */
interface CollectedCells {
    cells: AreaCellResult[];
    warnings: Set<string>;
    worstCellIntervals: AccessInterval[];
    stoppedAt: AreaCellResult | null;
}

function collectCells(
    scenario: Omit<RevisitScenario, 'target'>,
    area: AreaTarget,
    options: AreaAnalysisOptions & { stopWhen?: (cell: AreaCellResult) => boolean } = {},
): CollectedCells {
    // The area path never goes through `validateScenario` — it has no single
    // target — so it has to check the instrument and fleet itself, or an invalid
    // FOV would produce a full heat map of plausible nonsense.
    const validation = mergeValidations(
        validateArea(area, scenario.reference, scenario.payload),
        validateScenarioBase(scenario),
    );
    if (!validation.ok) {
        throw new Error(`Invalid area target: ${validation.errors.join('; ')}`);
    }

    const grid = generateGrid(area);
    const cache: { current: ConstellationCache | null } = { current: null };
    const fleet = constellationFor(scenario.reference, cache);
    const selected = selectSubConstellation(scenario.reference, scenario.selection, fleet);

    const cells: AreaCellResult[] = [];
    const warningSet = new Set<string>(validation.warnings);
    let worstMeasuredGapMs = -Infinity;
    let worstCellIntervals: AccessInterval[] = [];
    let hasNeverInViewCell = false;

    /*
     * Cells are computed in batches that share one propagation pass.
     *
     * The satellites' positions do not depend on the cell, so running cells one
     * at a time re-propagated the whole sub-constellation for every one of them.
     * `computeAccessIntervalsForCells` propagates once per batch and tests every
     * cell of that batch at each state — identical containment, identical
     * bisection, identical results.
     *
     * Why a batch rather than the whole grid at once, which would share even
     * more: progress. `onProgress` reports CELLS completed and the presenter
     * watches that bar; one batch of 96 would move it once, at the end. A batch
     * also bounds the peak retention of per-cell, per-satellite intervals, and
     * it is the granularity a future early-exit will stop at.
     */
    for (let start = 0; start < grid.length; start += AREA_CELL_BATCH) {
        const batch = grid.slice(start, start + AREA_CELL_BATCH);
        const accesses = computeAccessIntervalsForCells(
            selected, batch, scenario.payload as FovSpec, scenario.window as AnalysisWindow
        );

        for (let offset = 0; offset < batch.length; offset += 1) {
            const target = batch[offset];
            const access = accesses[offset];
            const statistics = computeGapStatistics(
                access.intervals, scenario.window, access.warnings
            );
            cells.push({ target, statistics, maxGapMs: statistics.maxGapMs });

            if (statistics.coverage === 'NEVER_IN_VIEW') {
                if (!hasNeverInViewCell) worstCellIntervals = [];
                hasNeverInViewCell = true;
            } else if (!hasNeverInViewCell && statistics.maxGapMs !== null
                && statistics.maxGapMs > worstMeasuredGapMs) {
                worstMeasuredGapMs = statistics.maxGapMs;
                worstCellIntervals = access.intervals;
            }
        }

        options.onProgress?.(Math.min(start + batch.length, grid.length), grid.length);

        /*
         * Early exit, at batch granularity.
         *
         * The check runs on the cells this batch produced, so the work already
         * spent is never wasted and the work not yet started is never spent.
         * Finer granularity would mean giving up the shared propagation pass
         * that makes a batch cheap in the first place — the two are the same
         * trade, seen from either end.
         */
        if (options.stopWhen) {
            const failing = cells.slice(start).find(options.stopWhen);
            if (failing) {
                return { cells, warnings: warningSet, worstCellIntervals, stoppedAt: failing };
            }
        }
    }

    return { cells, warnings: warningSet, worstCellIntervals, stoppedAt: null };
}

/**
 * Does this configuration meet the requirement on EVERY cell?
 *
 * The sizing search asks this of each candidate, and for a candidate that fails
 * it needs one bit — plus, for the evidence trail, where it failed. Running the
 * whole grid to learn that the seventh cell already missed is work spent to
 * confirm a conclusion reached long before. Measured on 2026-08-31: stopping at
 * the first failure saves 46 % of the cells verified on a 96-cell grid, 47 % on
 * 216.
 *
 * The return type is a union rather than an analysis with a `truncated` flag:
 * a partial grid cannot be summarised — no worst cell, no mean, no distribution
 * — so it must not be representable as an `AreaAnalysis` that a heat map or a
 * KPI panel could accept. The type refuses it; no consumer has to remember to.
 */
export type AreaVerification =
    | { met: true; analysis: AreaAnalysis }
    | {
        met: false;
        /** The first cell measured to miss — what the evidence trail names. */
        failedCell: AreaCellResult;
        /** Cells actually computed before stopping, out of the whole grid. */
        cellsComputed: number;
        totalCells: number;
    };

export function verifyAreaMeets(
    scenario: Omit<RevisitScenario, 'target'>,
    area: AreaTarget,
    requirementMs: number,
    options: AreaAnalysisOptions = {},
): AreaVerification {
    const collected = collectCells(scenario, area, {
        ...options,
        // A cell that is never in view has no gap figure and fails outright:
        // `null > requirement` is false, so it has to be tested explicitly.
        stopWhen: (cell) => cell.maxGapMs === null || cell.maxGapMs > requirementMs,
    });

    if (collected.stoppedAt) {
        return {
            met: false,
            failedCell: collected.stoppedAt,
            cellsComputed: collected.cells.length,
            totalCells: generateGrid(area).length,
        };
    }
    return { met: true, analysis: finaliseArea(area, collected) };
}

/** Summarise a COMPLETE grid. Never called with a truncated one — see above. */
function finaliseArea(area: AreaTarget, collected: CollectedCells): AreaAnalysis {
    const { cells, worstCellIntervals } = collected;
    const warningSet = collected.warnings;
    const measured = cells.filter((c) => c.maxGapMs !== null);
    const neverInViewCount = cells.filter(
        (c) => c.statistics.coverage === 'NEVER_IN_VIEW'
    ).length;
    const unmeasuredCount = cells.length - measured.length - neverInViewCount;

    // A cell that is never in view is worse than any measured gap, so it wins
    // the "worst cell" title outright — reporting a finite worst gap while part
    // of the area is never seen would be the most misleading result possible.
    const neverInViewCell = cells.find((c) => c.statistics.coverage === 'NEVER_IN_VIEW') ?? null;
    const worstMeasured = measured.length > 0
        ? measured.reduce((a, b) => (b.maxGapMs! > a.maxGapMs! ? b : a))
        : null;
    const worstCell = neverInViewCell ?? worstMeasured;

    if (neverInViewCount > 0) {
        warningSet.add(
            `${neverInViewCount} of ${cells.length} cells are never in view. The worst-case `
            + `figure for this area is unbounded, not the largest measured gap.`
        );
    }
    if (unmeasuredCount > 0) {
        warningSet.add(
            `${unmeasuredCount} cells produced no interior gap over this window — their `
            + `worst case is not established. Lengthen the window.`
        );
    }

    return {
        area,
        cells,
        worstCell,
        bestCell: measured.length > 0
            ? measured.reduce((a, b) => (b.maxGapMs! < a.maxGapMs! ? b : a))
            : null,
        meanCellMaxGapMs: measured.length > 0
            ? measured.reduce((sum, c) => sum + c.maxGapMs!, 0) / measured.length
            : null,
        neverInViewCount,
        unmeasuredCount,
        worstCellIntervals,
        warnings: [...warningSet],
    };
}
