/**
 * runScenario.ts — one scenario in, one result out.
 *
 * The single entry point to the engine. The worker wraps this; a test calls it
 * directly; the main thread calls it as a fallback when a Worker cannot be
 * constructed. Keeping the orchestration here rather than inside the worker is
 * what makes those three paths provably identical.
 *
 * Pure and deterministic — no clock, no module state. The constellation cache
 * below is keyed by value and never changes what is returned, only how long it
 * takes to return it.
 */

import type {
    AccessInterval, GapStatistics, OrbitalElements, RevisitScenario, WalkerSpec,
} from '../domain/types';
import {
    payloadCount as countPayloads, selectSubConstellation, validateSelection,
} from '../domain/subConstellation';
import { generateWalkerConstellation, validateWalkerSpec } from '../domain/walker';
import { computeAccessIntervals, validateWindow } from './accessIntervals';
import { computeGapStatistics } from './gapStatistics';
import { runPayloadSweep, type PayloadSweepResult } from './payloadSweep';

export interface RevisitAnalysis {
    /** Echoed back so a consumer can confirm which inputs produced this result. */
    scenario: RevisitScenario;
    /** N = (P/x)·(S/y). */
    payloadCount: number;
    /** Ids of the payload-carrying satellites, in fleet order. */
    selectedIds: string[];
    intervals: AccessInterval[];
    statistics: GapStatistics;
    /** Present only when the sweep was requested — it costs one run per ladder rung. */
    sweep?: PayloadSweepResult;
    /** Validation warnings from every stage, deduplicated. */
    warnings: string[];
}

export interface RunScenarioOptions {
    /** Also sweep the whole configuration ladder. Off by default: it is ~N× the cost. */
    includeSweep?: boolean;
}

/**
 * Validate a scenario without running it.
 *
 * Separated so a UI can grey out a control before the user triggers a compute,
 * rather than discovering the problem as a thrown error afterwards.
 */
export function validateScenario(scenario: RevisitScenario): {
    ok: boolean; errors: string[]; warnings: string[];
} {
    const walker = validateWalkerSpec(scenario.reference);
    const selection = validateSelection(scenario.reference, scenario.selection);
    const window = validateWindow(scenario.window);

    return {
        ok: walker.ok && selection.ok && window.ok,
        errors: [...walker.errors, ...selection.errors, ...window.errors],
        warnings: [...walker.warnings, ...selection.warnings, ...window.warnings],
    };
}

/**
 * A generated fleet, kept so that changing only the FOV or the target does not
 * regenerate it.
 *
 * The Walker generation itself is cheap; this exists because the worker holds it
 * across messages, mirroring the persistent-satrec cache in
 * `satellitePositionWorker` that removed ~240 KB/s of structured-clone traffic.
 */
export interface ConstellationCache {
    key: string;
    elements: OrbitalElements[];
}

function walkerKey(spec: WalkerSpec): string {
    return [
        spec.pattern, spec.planes, spec.satsPerPlane, spec.inclinationDeg,
        spec.altitudeKm, spec.phasingF, spec.fudge, spec.raan0Deg ?? 0,
    ].join('|');
}

/**
 * Generate the fleet, reusing `cache` when the Walker parameters are unchanged.
 * Mutates `cache` in place and returns the elements.
 */
export function constellationFor(
    spec: WalkerSpec,
    cache?: { current: ConstellationCache | null }
): OrbitalElements[] {
    const key = walkerKey(spec);
    if (cache?.current && cache.current.key === key) return cache.current.elements;

    const elements = generateWalkerConstellation(spec);
    if (cache) cache.current = { key, elements };
    return elements;
}

/**
 * Run one scenario.
 *
 * @throws if the scenario is invalid. Callers that can present the problem to a
 *         user should call `validateScenario` first; the throw is the backstop
 *         that keeps a malformed fleet out of the engine.
 */
export function runRevisitScenario(
    scenario: RevisitScenario,
    options: RunScenarioOptions = {},
    cache?: { current: ConstellationCache | null }
): RevisitAnalysis {
    const validation = validateScenario(scenario);
    if (!validation.ok) {
        throw new Error(`Invalid RevisitScenario: ${validation.errors.join('; ')}`);
    }

    const fleet = constellationFor(scenario.reference, cache);
    const selected = selectSubConstellation(scenario.reference, scenario.selection, fleet);

    const access = computeAccessIntervals(
        selected, scenario.target, scenario.payload, scenario.window
    );
    const statistics = computeGapStatistics(access.intervals, scenario.window, access.warnings);

    const sweep = options.includeSweep
        ? runPayloadSweep(
            scenario.reference, scenario.target, scenario.payload, scenario.window,
            { planeShift: scenario.selection.planeShift }
        )
        : undefined;

    return {
        scenario,
        payloadCount: countPayloads(scenario.reference, scenario.selection),
        selectedIds: selected.map((el) => el.id),
        intervals: access.intervals,
        statistics,
        sweep,
        warnings: [...new Set([...validation.warnings, ...statistics.warnings])],
    };
}
