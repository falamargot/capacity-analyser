/**
 * areaSizing.ts — how many payloads does an AREA need?
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * A Point gets a measured answer: `runPayloadSweep` walks the whole topology
 * ladder against that target and reports the cheapest rung that meets the
 * requirement. An Area got nothing — `AREA_NOT_SIZED`, a refusal — because the
 * same sweep over a grid costs `cells × ladder`: 8.6 billion satellite-steps on
 * a 96-cell grid, about twelve minutes. Proposing a number without measuring it
 * was rightly forbidden (Programme 5b), so the card said it could not answer.
 *
 * ── THE METHOD: PROBE, THEN VERIFY ──────────────────────────────────────────
 * The product `cells × ladder` becomes a sum.
 *
 *   1. PROBE — sweep the whole ladder against ONE cell, the least-covered one
 *      of the current analysis. Cost is the ladder, independent of the grid.
 *   2. VERIFY — take the candidates in ascending payload count and run the FULL
 *      area at each, in the topology the probe measured as best for that count.
 *      The first candidate whose worst cell meets the requirement is the answer.
 *
 * ── WHAT THIS CLAIMS, AND WHAT IT DOES NOT ──────────────────────────────────
 * The result is a configuration VERIFIED over every cell — never a configuration
 * proved minimal. The binding cell can change with the topology, so a cheaper
 * rung might have passed had the probe been run on a different cell. Callers
 * must present it as "verified across all cells", and the UI wording is part of
 * that contract, not decoration.
 *
 * When no candidate passes within `MAX_CANDIDATES`, that is reported as such
 * rather than as "impossible": the ladder was not exhausted, and saying so is
 * the difference between a measured absence and an invented one.
 */

import { verifyAreaMeets, type AreaAnalysis } from './areaAnalysis';
import { runPayloadSweep, type SweepConfiguration } from './payloadSweep';
import type { AreaTarget } from '../domain/areaTarget';
import type { RevisitScenario, SubConstellationSpec } from '../domain/types';

/**
 * How many candidates may be verified before giving up.
 *
 * Each one costs a full area pass, so an unbounded search on a grid that no
 * rung can satisfy would run until the user closed the tab. Six covers the
 * realistic case — the probe's ranking is usually right within one or two
 * rungs — and the result says how many were tried, so a ceiling that bites is
 * visible rather than silent.
 */
export const MAX_CANDIDATES = 6;

/**
 * One candidate actually verified over the grid.
 *
 * The search is only citable if it can be inspected: a number with no trace is
 * indistinguishable from a guess. Each attempt carries what the probe promised
 * and what the grid delivered, so the gap between the two — the reason the
 * verification step exists — is visible rather than asserted. Measured on a
 * 96-cell grid: 12 × 3 held 1.47 h on the probe cell and 2.45 h on the area.
 */
export interface AreaSizingAttempt {
    payloadCount: number;
    selectedPlanes: number;
    payloadsPerPlane: number;
    /** Worst gap on the probe cell — what ranked this candidate. */
    probeGapMs: number;
    /**
     * Worst gap over the whole grid when the candidate passed; when it failed,
     * the gap of the FIRST cell measured to miss — the verification stops there
     * rather than finishing a grid whose verdict is already known.
     */
    areaWorstGapMs: number | null;
    passed: boolean;
    /** Cells computed before the verdict, out of the whole grid. */
    cellsComputed: number;
    totalCells: number;
}

export type AreaSizingResult =
    | {
        kind: 'VERIFIED';
        /** Payloads in the configuration that met the requirement everywhere. */
        payloadCount: number;
        selection: SubConstellationSpec;
        /** P/x — planes carrying payloads. */
        selectedPlanes: number;
        /** S/y — payloads per selected plane. */
        payloadsPerPlane: number;
        /** The worst cell of the VERIFIED area run, not of the probe. */
        worstCellGapMs: number;
        candidatesTried: number;
        /** The verified area analysis, so the caller need not recompute it. */
        analysis: AreaAnalysis;
        attempts: AreaSizingAttempt[];
        /** Configurations the probe cell alone ruled out, before any grid pass. */
        probeRejected: number;
        /** Configurations on the ladder, so the two figures can be read together. */
        ladderSize: number;
    }
    | {
        kind: 'NONE';
        candidatesTried: number;
        /** True when the ceiling stopped the search rather than the ladder. */
        stoppedAtCeiling: boolean;
        /**
         * Configurations the probe cell alone already ruled out, so no grid pass
         * was spent on them. Zero candidates with a non-zero ladder means the
         * requirement is out of reach for every rung, on the probe cell at least.
         */
        probeRejected: number;
        attempts: AreaSizingAttempt[];
        ladderSize: number;
    };

export interface AreaSizingProgress {
    phase: 'probe' | 'verify';
    /** 1-based index of the candidate being verified; 0 during the probe. */
    candidate: number;
    completed: number;
    total: number;
}

export interface AreaSizingOptions {
    onProgress?: (progress: AreaSizingProgress) => void;
    maxCandidates?: number;
}

/**
 * Size an area.
 *
 * `scenario.selection` is the configuration currently flown; it is replaced by
 * each candidate in turn, so what comes back is independent of it. The probe
 * cell is the caller's — normally `worstCell` of the analysis already on screen,
 * which costs nothing to supply and is the cell most likely to bind.
 */
export function sizeArea(
    scenario: Omit<RevisitScenario, 'target'>,
    area: AreaTarget,
    probeCell: RevisitScenario['target'],
    requirementMs: number,
    options: AreaSizingOptions = {},
): AreaSizingResult {
    const maxCandidates = options.maxCandidates ?? MAX_CANDIDATES;

    // ── 1. Probe ────────────────────────────────────────────────────────────
    options.onProgress?.({ phase: 'probe', candidate: 0, completed: 0, total: 1 });
    const sweep = runPayloadSweep(
        scenario.reference, probeCell, scenario.payload, scenario.window,
        { planeShift: scenario.selection.planeShift },
    );
    options.onProgress?.({ phase: 'probe', candidate: 0, completed: 1, total: 1 });

    /*
     * Only the configurations that PASS on the probe cell are worth verifying,
     * and that is exact rather than heuristic: the probe cell belongs to the
     * grid, so a configuration whose gap there exceeds the requirement already
     * has a failing cell. The area's worst case is at least that bad. Verifying
     * it would spend a full grid pass to confirm a failure the probe proved.
     *
     * This is also what makes the candidate ceiling meaningful. Ordering by
     * payload count alone and cutting at six tried the six CHEAPEST rungs —
     * the least likely to pass anything — and reported "nothing found" without
     * ever testing a configuration that could have worked. Found in the browser
     * on a 9-cell area against a 2 h requirement.
     *
     * Within that filter: ascending payload count, and at equal count the split
     * the probe ranked better first.
     */
    const candidates: SweepConfiguration[] = sweep.points
        .slice()
        .sort((a, b) => a.payloadCount - b.payloadCount)
        .flatMap((point) => [point.best, ...point.alternatives])
        .filter((configuration) => (
            configuration.maxGapMs !== null && configuration.maxGapMs <= requirementMs
        ));

    // ── 2. Verify ───────────────────────────────────────────────────────────
    const ladderSize = sweep.points.reduce(
        (count, point) => count + 1 + point.alternatives.length, 0,
    );
    const probeRejected = ladderSize - candidates.length;

    const attempts: AreaSizingAttempt[] = [];
    let tried = 0;
    for (const candidate of candidates) {
        if (tried >= maxCandidates) {
            return {
                kind: 'NONE',
                candidatesTried: tried,
                stoppedAtCeiling: true,
                probeRejected,
                attempts,
                ladderSize,
            };
        }
        tried += 1;

        /*
         * Verification stops at the first cell that misses. A failing candidate
         * therefore costs the batch containing its first failure, not the grid:
         * the verdict is the same and the work is not.
         */
        const verification = verifyAreaMeets(
            { ...scenario, selection: candidate.selection },
            area,
            requirementMs,
            {
                onProgress: (completed, total) => options.onProgress?.({
                    phase: 'verify', candidate: tried, completed, total,
                }),
            },
        );

        const attempt: AreaSizingAttempt = verification.met
            ? {
                payloadCount: payloadCountOf(candidate),
                selectedPlanes: candidate.selectedPlanes,
                payloadsPerPlane: candidate.payloadsPerPlane,
                probeGapMs: candidate.maxGapMs as number,
                areaWorstGapMs: verification.analysis.worstCell?.maxGapMs ?? null,
                passed: true,
                cellsComputed: verification.analysis.cells.length,
                totalCells: verification.analysis.cells.length,
            }
            : {
                payloadCount: payloadCountOf(candidate),
                selectedPlanes: candidate.selectedPlanes,
                payloadsPerPlane: candidate.payloadsPerPlane,
                probeGapMs: candidate.maxGapMs as number,
                areaWorstGapMs: verification.failedCell.maxGapMs,
                passed: false,
                cellsComputed: verification.cellsComputed,
                totalCells: verification.totalCells,
            };
        attempts.push(attempt);

        if (verification.met) {
            const analysis = verification.analysis;
            const worst = analysis.worstCell?.maxGapMs ?? null;
            return {
                kind: 'VERIFIED',
                payloadCount: payloadCountOf(candidate),
                selection: candidate.selection,
                selectedPlanes: candidate.selectedPlanes,
                payloadsPerPlane: candidate.payloadsPerPlane,
                worstCellGapMs: worst as number,
                candidatesTried: tried,
                analysis,
                attempts,
                probeRejected,
                ladderSize,
            };
        }
    }

    return {
        kind: 'NONE',
        candidatesTried: tried,
        stoppedAtCeiling: false,
        probeRejected,
        attempts,
        ladderSize,
    };
}

/** Payloads a configuration flies: selected planes × payloads per plane. */
function payloadCountOf(configuration: SweepConfiguration): number {
    return configuration.selectedPlanes * configuration.payloadsPerPlane;
}
