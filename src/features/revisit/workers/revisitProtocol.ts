/**
 * revisitProtocol.ts — the revisit worker message contract.
 *
 * Deliberately shaped after `workers/satellitePositionProtocol.ts` rather than
 * invented (audit §3.6, F4). Two elements are copied because they are the
 * staleness solution this codebase has already validated:
 *
 *  - `requestId` echoed untouched, so a superseded response is discarded rather
 *    than published over a newer one;
 *  - `timelineRevision` echoed untouched, so work started against a clock
 *    timeline the user has since changed can never reach the screen.
 *
 * `SimulationClockSnapshot.revision` is the source of `timelineRevision`. Its
 * docstring anticipated exactly this consumer: *"Future async consumers use it
 * to reject work started against an obsolete timeline."*
 *
 * Type-only module — safe to import from both the main thread and the worker.
 */

import type { RevisitScenario } from '../domain/types';
import type { RevisitAnalysis } from '../analysis/runScenario';
import type { PayloadSweepResult } from '../analysis/payloadSweep';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import type { AreaTarget } from '../domain/areaTarget';

export interface RevisitAnalyseRequest {
    type: 'analyse';
    /** Echoed back untouched. */
    requestId: number;
    /** Echoed back untouched. Identifies the clock controls this work started against. */
    timelineRevision: number;
    scenario: RevisitScenario;
    /** Sweep the whole ladder as well. Costs one engine run per rung. */
    includeSweep: boolean;
}

/**
 * Sweep the whole ladder, without the single-configuration analysis.
 *
 * Kept separate from `analyse` because the two have very different costs and,
 * crucially, different invalidation. The sweep is a function of the
 * constellation, the instrument, the target and the window — it does NOT depend
 * on which satellites are currently selected, because it evaluates every rung
 * anyway. So dragging the payload slider must not recompute it. Only
 * `selection.planeShift` is read, since z redistributes payloads within each
 * rung rather than changing the rungs.
 */
export interface RevisitSweepRequest {
    type: 'sweep';
    requestId: number;
    timelineRevision: number;
    scenario: RevisitScenario;
}

/**
 * Grid an area and run every cell.
 *
 * `scenario.target` is ignored — the area supplies the points. Cost scales with
 * the cell count, which `validateArea` bounds before this is ever dispatched.
 */
export interface RevisitAreaRequest {
    type: 'area';
    requestId: number;
    timelineRevision: number;
    scenario: RevisitScenario;
    area: AreaTarget;
}

export type RevisitWorkerInput =
    | RevisitAnalyseRequest | RevisitSweepRequest | RevisitAreaRequest;

/** The subset of a scenario the sweep actually depends on. */
export function sweepInvalidationKey(scenario: RevisitScenario): string {
    return JSON.stringify([
        scenario.reference,
        scenario.payload,
        scenario.target,
        scenario.window,
        scenario.selection.planeShift,
    ]);
}

interface RevisitEnvelope {
    requestId: number;
    timelineRevision: number;
    /** Wall-clock duration of the computation, ms. Telemetry only — never an input. */
    computeMs: number;
}

/**
 * Incremental progress for a long area run.
 *
 * Carries no result — it exists so a grid of hundreds of cells reports movement
 * instead of the UI showing a progress value that never changes.
 */
export interface RevisitAreaProgress {
    kind: 'area-progress';
    requestId: number;
    timelineRevision: number;
    completed: number;
    total: number;
}

export type RevisitWorkerOutput =
    | (RevisitEnvelope & { ok: true; kind: 'analyse'; analysis: RevisitAnalysis })
    | (RevisitEnvelope & { ok: true; kind: 'sweep'; sweep: PayloadSweepResult })
    | (RevisitEnvelope & { ok: true; kind: 'area'; area: AreaAnalysis })
    | (RevisitEnvelope & { ok: false; kind: 'analyse' | 'sweep' | 'area'; error: string })
    | RevisitAreaProgress;

/**
 * Should a response be published?
 *
 * A response is stale if it is not the request currently awaited, or if the
 * clock timeline has moved on since it was dispatched. Both must hold — checking
 * only `requestId` lets a result computed against an abandoned timeline through.
 */
export function isCurrentResponse(
    response: Pick<RevisitEnvelope, 'requestId' | 'timelineRevision'>,
    expected: { requestId: number | null; timelineRevision: number }
): boolean {
    return response.requestId === expected.requestId
        && response.timelineRevision === expected.timelineRevision;
}
