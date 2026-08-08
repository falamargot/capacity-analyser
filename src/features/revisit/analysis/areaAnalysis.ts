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
    AnalysisWindow, FovSpec, GapStatistics, PointTarget, RevisitScenario,
} from '../domain/types';
import type { AreaTarget } from '../domain/areaTarget';
import { generateGrid, validateArea } from '../domain/areaTarget';
import { mergeValidations } from '../domain/inputValidation';
import { selectSubConstellation } from '../domain/subConstellation';
import { constellationFor, type ConstellationCache } from './runScenario';
import { computeAccessIntervals } from './accessIntervals';
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

    for (let i = 0; i < grid.length; i++) {
        const target = grid[i];
        const access = computeAccessIntervals(
            selected, target, scenario.payload as FovSpec, scenario.window as AnalysisWindow
        );
        const statistics = computeGapStatistics(access.intervals, scenario.window, access.warnings);
        cells.push({ target, statistics, maxGapMs: statistics.maxGapMs });
        options.onProgress?.(i + 1, grid.length);
    }

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
        warnings: [...warningSet],
    };
}
