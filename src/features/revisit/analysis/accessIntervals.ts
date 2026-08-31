/**
 * accessIntervals.ts — when can the sub-constellation see the target?
 *
 * Sample containment at a coarse Δt, then refine every transition by bisection.
 * That gets sub-second AOS/LOS without paying for a fine global step: the coarse
 * step only has to be short enough not to *miss* a pass, and bisection supplies
 * the precision.
 *
 * Δt must therefore be well below the shortest pass — for a narrow FOV at LEO a
 * pass can be tens of seconds, which is why the default is 5–10 s and why
 * `validateStep` warns rather than silently under-sampling.
 *
 * Pure and deterministic (design note §7.6): no wall clock, no module state, no
 * floating-point accumulation — sample times are computed from the index, not by
 * repeated addition.
 */

import type {
    AccessInterval, AnalysisWindow, EciState, FovSpec, OrbitalElements, Target,
} from '../domain/types';
import {
    earthRotationGrid, isTargetInFov, prepareFov, targetTrack,
    type PreparedFov, type TargetTrack,
} from '../fov/containment';
import { preparePropagators, propagateState, type PropagatorState } from '../propagation/keplerJ2';

/** Bisection iterations. 24 halvings of a 10 s step resolve to well under a microsecond. */
const BISECTION_ITERATIONS = 24;

/** Below this the window cannot capture a Walker repeat cycle (ADR-001 §3). */
export const MIN_RELIABLE_WINDOW_HOURS = 24;
export const DEFAULT_WINDOW_HOURS = 72;
export const DEFAULT_STEP_SECONDS = 10;
/** Hard cost ceiling for an interactive analysis. */
export const MAX_WINDOW_HOURS = 240;
/** Coarsest sampling step exposed by the engineering UI. */
export const MAX_STEP_SECONDS = 120;

export interface WindowValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export function validateWindow(window: AnalysisWindow): WindowValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isFinite(window.startMs)) {
        errors.push(`startMs must be finite, got ${window.startMs}`);
    }
    if (!Number.isFinite(window.durationHours) || window.durationHours <= 0) {
        errors.push(`durationHours must be positive, got ${window.durationHours}`);
    } else if (window.durationHours > MAX_WINDOW_HOURS) {
        errors.push(
            `durationHours ${window.durationHours} exceeds the interactive ceiling of ${MAX_WINDOW_HOURS} h`
        );
    } else if (window.durationHours < MIN_RELIABLE_WINDOW_HOURS) {
        warnings.push(
            `Analysis window is ${window.durationHours} h. A Walker ground-track pattern ` +
            `repeats over a repeat cycle, not a day — below ${MIN_RELIABLE_WINDOW_HOURS} h ` +
            `the revisit figure is confidently wrong. ${DEFAULT_WINDOW_HOURS} h is the default.`
        );
    }
    if (!Number.isFinite(window.stepSeconds) || window.stepSeconds <= 0) {
        errors.push(`stepSeconds must be positive, got ${window.stepSeconds}`);
    } else if (window.stepSeconds > MAX_STEP_SECONDS) {
        errors.push(
            `stepSeconds ${window.stepSeconds} exceeds the supported ceiling of ${MAX_STEP_SECONDS} s`
        );
    } else if (window.stepSeconds > 60) {
        warnings.push(
            `stepSeconds is ${window.stepSeconds}. A short pass can be tens of seconds; ` +
            `a step this coarse can miss passes entirely, which bisection cannot recover.`
        );
    }

    return { ok: errors.length === 0, errors, warnings };
}

/** Raw per-satellite access spans, before the union. */
export interface SatelliteAccess {
    satelliteId: string;
    intervals: Array<{ startMs: number; endMs: number; clippedAtStart: boolean; clippedAtEnd: boolean }>;
}

/**
 * Refine a transition time by bisection on the containment predicate.
 *
 * `tLo` and `tHi` bracket a single sign change: `inViewAtLo` holds at tLo and
 * its negation at tHi. Returns the crossing, in seconds from epoch.
 */
function bisectTransition(
    sat: PropagatorState,
    fov: PreparedFov,
    track: TargetTrack,
    tLo: number,
    tHi: number,
    inViewAtLo: boolean,
): number {
    let lo = tLo;
    let hi = tHi;
    /*
     * Its OWN state buffer, never the caller's.
     *
     * Bisection propagates to a dozen intermediate instants. Writing those into
     * the caller's scratch leaves it holding the state at the last midpoint
     * instead of at `tHi` — harmless in a single-target loop, which
     * re-propagates at the top of the next iteration, and a real defect in the
     * multi-target loop, where the remaining targets of the SAME step are then
     * tested against a satellite position that belongs to another instant.
     * Found on 2026-08-30 by comparing the area path cell-by-cell against the
     * batched one: gaps differed by seconds on cells whose neighbour had a
     * transition at that step.
     */
    const probe: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        propagateState(sat, mid, probe);
        const inView = isTargetInFov(probe, track.at(mid), fov);
        if (inView === inViewAtLo) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

/**
 * Access spans for one satellite over the window.
 *
 * A span in progress at a window edge is clipped and flagged — the gap adjacent
 * to it is boundary-truncated and must be discarded from the statistics
 * (ADR-001 §3), and that flag is how `gapStatistics` knows.
 */
export function computeSatelliteAccess(
    sat: PropagatorState,
    target: Target,
    fov: PreparedFov,
    window: AnalysisWindow,
    /**
     * The target's track over this window. Optional so a single call keeps its
     * old signature; every loop over satellites MUST pass one, or the constant
     * part of the target's position is recomputed per satellite — the waste
     * this parameter exists to remove.
     */
    track: TargetTrack = targetTrack(
        target, window.startMs, window.stepSeconds, window.durationHours * 3600,
    ),
): SatelliteAccess {
    const epochMs = window.startMs;
    const durationSec = window.durationHours * 3600;
    const step = window.stepSeconds;
    const stepCount = Math.ceil(durationSec / step);

    const intervals: SatelliteAccess['intervals'] = [];
    const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

    let prevT = 0;
    propagateState(sat, 0, scratch);
    let prevInView = isTargetInFov(scratch, track.atStep(0), fov);

    let openStartSec = prevInView ? 0 : NaN;
    let openClippedAtStart = prevInView;

    for (let i = 1; i <= stepCount; i++) {
        // Computed from the index, never accumulated, so the sample grid is
        // identical on every run regardless of step size.
        const t = Math.min(i * step, durationSec);
        propagateState(sat, t, scratch);
        const inView = isTargetInFov(scratch, track.atStep(i), fov);

        if (inView !== prevInView) {
            const crossing = bisectTransition(sat, fov, track, prevT, t, prevInView);
            if (inView) {
                openStartSec = crossing;
                openClippedAtStart = false;
            } else {
                intervals.push({
                    startMs: epochMs + openStartSec * 1000,
                    endMs: epochMs + crossing * 1000,
                    clippedAtStart: openClippedAtStart,
                    clippedAtEnd: false,
                });
                openStartSec = NaN;
            }
        }

        prevT = t;
        prevInView = inView;
        if (t >= durationSec) break;
    }

    if (prevInView && Number.isFinite(openStartSec)) {
        intervals.push({
            startMs: epochMs + openStartSec * 1000,
            endMs: epochMs + durationSec * 1000,
            clippedAtStart: openClippedAtStart,
            clippedAtEnd: true,
        });
    }

    return { satelliteId: sat.id, intervals };
}

/**
 * Union the per-satellite spans into the target's access timeline.
 *
 * Overlapping and exactly-adjacent spans merge: the question the statistics
 * answer is "was *anything* watching", not "which satellite".
 */
export function unionAccessIntervals(perSatellite: SatelliteAccess[]): AccessInterval[] {
    const flat = perSatellite.flatMap((s) =>
        s.intervals.map((iv) => ({ ...iv, satelliteId: s.satelliteId }))
    );
    flat.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

    const merged: AccessInterval[] = [];
    for (const iv of flat) {
        const last = merged[merged.length - 1];
        if (last && iv.startMs <= last.endMs) {
            if (iv.endMs > last.endMs) {
                last.endMs = iv.endMs;
                last.clippedAtEnd = iv.clippedAtEnd;
            } else if (iv.endMs === last.endMs) {
                last.clippedAtEnd = last.clippedAtEnd || iv.clippedAtEnd;
            }
            if (!last.satelliteIds.includes(iv.satelliteId)) {
                last.satelliteIds.push(iv.satelliteId);
            }
        } else {
            merged.push({
                startMs: iv.startMs,
                endMs: iv.endMs,
                satelliteIds: [iv.satelliteId],
                clippedAtStart: iv.clippedAtStart,
                clippedAtEnd: iv.clippedAtEnd,
            });
        }
    }
    return merged;
}

export interface AccessComputation {
    intervals: AccessInterval[];
    perSatellite: SatelliteAccess[];
    warnings: string[];
}

/**
 * The whole access computation for one target: propagate the payload-carrying
 * subset, test containment, union the results.
 *
 * `elements` must already be the selected sub-constellation, not the full fleet.
 */
export function computeAccessIntervals(
    elements: OrbitalElements[],
    target: Target,
    fovSpec: FovSpec,
    window: AnalysisWindow
): AccessComputation {
    const validation = validateWindow(window);
    if (!validation.ok) {
        throw new Error(`Invalid AnalysisWindow: ${validation.errors.join('; ')}`);
    }

    const fov = prepareFov(fovSpec);
    const propagators = preparePropagators(elements);
    // One track for the whole run: the target's ECEF position, the epoch's GMST
    // and the grid's cos/sin are computed once instead of once per satellite.
    const track = targetTrack(
        target, window.startMs, window.stepSeconds, window.durationHours * 3600,
    );
    const perSatellite = propagators.map(
        (p) => computeSatelliteAccess(p, target, fov, window, track),
    );

    return {
        intervals: unionAccessIntervals(perSatellite),
        perSatellite,
        warnings: validation.warnings,
    };
}

/**
 * Compute a small target set while propagating every satellite only once per
 * coarse sample. Three independent runs repeat the dominant Kepler/J2 work
 * three times; this keeps identical containment and bisection semantics while
 * bounding the public comparison workflow to `targets.length <= 3`.
 */
export function computeAccessIntervalsForTargets(
    elements: OrbitalElements[],
    targets: Target[],
    fovSpec: FovSpec,
    window: AnalysisWindow,
): AccessComputation[] {
    // The cap is a POLICY of the public comparison workflow — it returns every
    // interval of every target to the UI — not a limit of the loop below. The
    // area path shares the same loop through `computeAccessIntervalsForCells`,
    // in bounded batches, precisely because the mathematics is indifferent to
    // the target count.
    if (targets.length > 3) throw new Error('Target comparison supports at most 3 targets');
    return computeAccessIntervalsForCells(elements, targets, fovSpec, window);
}

/**
 * The same computation without the comparison workflow's three-target cap.
 *
 * ── WHY THE AREA PATH NEEDS THIS ────────────────────────────────────────────
 * `analyseArea` used to call the single-target `computeAccessIntervals` once
 * per cell, which re-propagated the entire sub-constellation for every cell: on
 * a 96-cell grid the same 72 satellites were propagated 96 times over 25 920
 * steps to produce positions that do not depend on the cell at all.
 *
 * Here the satellites are propagated once and every cell is tested at that
 * state. Containment and bisection are untouched — this is the same loop the
 * comparison workflow has used since it was written.
 *
 * The caller batches: see `AREA_CELL_BATCH` in `areaAnalysis.ts`.
 */
export function computeAccessIntervalsForCells(
    elements: OrbitalElements[],
    targets: Target[],
    fovSpec: FovSpec,
    window: AnalysisWindow,
): AccessComputation[] {
    if (targets.length === 0) return [];
    const validation = validateWindow(window);
    if (!validation.ok) {
        throw new Error(`Invalid AnalysisWindow: ${validation.errors.join('; ')}`);
    }
    const fov = prepareFov(fovSpec);
    const propagators = preparePropagators(elements);
    const perTarget: SatelliteAccess[][] = targets.map(() => []);
    const epochMs = window.startMs;
    const durationSec = window.durationHours * 3600;
    const step = window.stepSeconds;
    const stepCount = Math.ceil(durationSec / step);
    // One track per target, built once for the whole run rather than per
    // satellite. With the propagation already shared by this loop, this is what
    // makes the per-step cost `1 propagate + T cheap rotations` instead of
    // `T × (propagate + full target reconstruction)`.
    // One rotation grid for the batch, one track per target on top of it. The
    // grid depends on the window alone, so a private copy per cell would have
    // multiplied its 4.1 MB (72 h at a 1 s step) by the batch size for nothing.
    const rotation = earthRotationGrid(epochMs, step, durationSec);
    const tracks = targets.map(
        (target) => targetTrack(target, epochMs, step, durationSec, rotation),
    );

    for (const sat of propagators) {
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        const intervals = targets.map(() => [] as SatelliteAccess['intervals']);
        propagateState(sat, 0, scratch);
        const previous = tracks.map((track) => (
            isTargetInFov(scratch, track.atStep(0), fov)
        ));
        const openStarts = previous.map((inView) => inView ? 0 : NaN);
        const clippedStarts = [...previous];
        let previousT = 0;

        for (let index = 1; index <= stepCount; index += 1) {
            const t = Math.min(index * step, durationSec);
            propagateState(sat, t, scratch);
            for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
                const inView = isTargetInFov(
                    scratch, tracks[targetIndex].atStep(index), fov
                );
                if (inView !== previous[targetIndex]) {
                    const crossing = bisectTransition(
                        sat, fov, tracks[targetIndex], previousT, t, previous[targetIndex],
                    );
                    if (inView) {
                        openStarts[targetIndex] = crossing;
                        clippedStarts[targetIndex] = false;
                    } else {
                        intervals[targetIndex].push({
                            startMs: epochMs + openStarts[targetIndex] * 1000,
                            endMs: epochMs + crossing * 1000,
                            clippedAtStart: clippedStarts[targetIndex],
                            clippedAtEnd: false,
                        });
                        openStarts[targetIndex] = NaN;
                    }
                }
                previous[targetIndex] = inView;
            }
            previousT = t;
            if (t >= durationSec) break;
        }

        for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
            if (previous[targetIndex] && Number.isFinite(openStarts[targetIndex])) {
                intervals[targetIndex].push({
                    startMs: epochMs + openStarts[targetIndex] * 1000,
                    endMs: epochMs + durationSec * 1000,
                    clippedAtStart: clippedStarts[targetIndex],
                    clippedAtEnd: true,
                });
            }
            perTarget[targetIndex].push({ satelliteId: sat.id, intervals: intervals[targetIndex] });
        }
    }

    return perTarget.map((perSatellite) => ({
        intervals: unionAccessIntervals(perSatellite),
        perSatellite,
        warnings: validation.warnings,
    }));
}
