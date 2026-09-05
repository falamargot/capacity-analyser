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
import { payloadCount as countPayloads, selectSubConstellation } from '../domain/subConstellation';
import { generateWalkerConstellation } from '../domain/walker';
import {
    computeAccessIntervals, contributingSatellites, type SatelliteAccess,
} from './accessIntervals';
import { computeGapStatistics } from './gapStatistics';
import { runPayloadSweep, type PayloadSweepResult } from './payloadSweep';
import { validateScenario } from './scenarioValidation';

export { validateScenario } from './scenarioValidation';

export interface RevisitAnalysis {
    /** Echoed back so a consumer can confirm which inputs produced this result. */
    scenario: RevisitScenario;
    /** N = (P/x)·(S/y). */
    payloadCount: number;
    /** Ids of the payload-carrying satellites, in fleet order. */
    selectedIds: string[];
    intervals: AccessInterval[];
    /**
     * The same access, per contributing satellite, un-unioned.
     *
     * `intervals` answers "was anything watching"; this answers "which one, and
     * when". The temporal lens needs the second question to show a merged block
     * resolving into a handover — `AccessInterval.satelliteIds` names the
     * contributors but not when each of them started and stopped, so it cannot
     * be reconstructed downstream.
     */
    perSatellite: SatelliteAccess[];
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

/**
 * Cache identity for a generated fleet.
 *
 * ── WHY THIS IS DERIVED, NOT LISTED BY HAND ─────────────────────────────────
 * It used to be a hand-written list of eight scalars, and it OMITTED
 * `planeAltitudesKm`, `raanOffsetsDeg` and `sparesPerPlane` — the three arrays
 * carrying the plane-altitude ladder, the Walker Star seam and the spares, all
 * three of which `generateWalkerConstellation` consumes. Two structurally
 * different specs with equal scalars therefore collided, and the worker's
 * module-level cache served the wrong fleet across messages: 634 satellites
 * where 576 were asked for, plane 0 at 7553 km instead of 7578 km, and a
 * maximum revisit gap out by minutes.
 *
 * That was the worst possible shape of the bug. The globe regenerates its fleet
 * WITHOUT this cache and `runPayloadSweep` calls `generateWalkerConstellation`
 * directly, so the picture and the sizing recommendation stayed correct while
 * the headline KPI, the area heat map and the comparison rows did not — nothing
 * on screen contradicted the wrong number.
 *
 * So the key is no longer maintained by hand. It is built from the spec's OWN
 * KEYS, sorted, which makes it exhaustive BY CONSTRUCTION: a field added to
 * `WalkerSpec` tomorrow enters the key without anyone having to remember it.
 * `raan0Deg` is normalised because an absent value and `0` are the same fleet;
 * every other absent field is emitted as absent, so it can never be confused
 * with a present one.
 *
 * The asymmetry to keep in mind when touching this: OVER-keying costs one
 * redundant regeneration, which is cheap and correct. UNDER-keying returns the
 * wrong constellation. When in doubt, include the field.
 */
function walkerKey(spec: WalkerSpec): string {
    const normalized: Record<string, unknown> = { ...spec, raan0Deg: spec.raan0Deg ?? 0 };
    return JSON.stringify(
        Object.keys(normalized)
            .sort()
            .filter((key) => normalized[key] !== undefined)
            .map((key) => [key, normalized[key]])
    );
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
        perSatellite: contributingSatellites(access.perSatellite),
        statistics,
        sweep,
        warnings: [...new Set([...validation.warnings, ...statistics.warnings])],
    };
}
