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
import { isTargetInFov, prepareFov, targetEciAt, type PreparedFov } from '../fov/containment';
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
    target: Target,
    epochMs: number,
    tLo: number,
    tHi: number,
    inViewAtLo: boolean,
    scratch: EciState
): number {
    let lo = tLo;
    let hi = tHi;
    for (let i = 0; i < BISECTION_ITERATIONS; i++) {
        const mid = (lo + hi) / 2;
        propagateState(sat, mid, scratch);
        const inView = isTargetInFov(scratch, targetEciAt(target, epochMs, mid), fov);
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
    window: AnalysisWindow
): SatelliteAccess {
    const epochMs = window.startMs;
    const durationSec = window.durationHours * 3600;
    const step = window.stepSeconds;
    const stepCount = Math.ceil(durationSec / step);

    const intervals: SatelliteAccess['intervals'] = [];
    const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

    let prevT = 0;
    propagateState(sat, 0, scratch);
    let prevInView = isTargetInFov(scratch, targetEciAt(target, epochMs, 0), fov);

    let openStartSec = prevInView ? 0 : NaN;
    let openClippedAtStart = prevInView;

    for (let i = 1; i <= stepCount; i++) {
        // Computed from the index, never accumulated, so the sample grid is
        // identical on every run regardless of step size.
        const t = Math.min(i * step, durationSec);
        propagateState(sat, t, scratch);
        const inView = isTargetInFov(scratch, targetEciAt(target, epochMs, t), fov);

        if (inView !== prevInView) {
            const crossing = bisectTransition(
                sat, fov, target, epochMs, prevT, t, prevInView, scratch
            );
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
    const perSatellite = propagators.map((p) => computeSatelliteAccess(p, target, fov, window));

    return {
        intervals: unionAccessIntervals(perSatellite),
        perSatellite,
        warnings: validation.warnings,
    };
}
