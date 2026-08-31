/**
 * useAreaSizing — run the area sizing search, and own its cancellation.
 *
 * ── WHY A HOOK OF ITS OWN ───────────────────────────────────────────────────
 * `useAreaAnalysis` measures the configuration currently flown and re-runs
 * itself whenever the scenario moves. This one SEARCHES: it walks the ladder on
 * one cell and then verifies candidates over the whole grid, which costs a full
 * area pass per candidate. Two consequences follow, and both are why it cannot
 * live inside the analysis hook:
 *
 *   - it never runs on its own. A scenario change discards its result rather
 *     than recomputing it, because recomputing costs seconds and nobody asked;
 *   - it needs its own worker, so terminating a search does not also kill the
 *     area analysis that keeps the heat map on screen.
 *
 * Cancellation is termination, as everywhere else in this module: replacing the
 * worker is the only reliable way to interrupt synchronous engine code.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import { sizeArea, type AreaSizingResult } from '../analysis/areaSizing';
import { areaAnalysisKey, validateArea, type AreaTarget } from '../domain/areaTarget';
import {
    inlineFailureCause, revisitFailure, revisitFailureDetail, type RevisitFailure,
} from '../domain/revisitFailure';
import type { PointTarget, RevisitScenario } from '../domain/types';
import {
    isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput,
} from '../workers/revisitProtocol';

export interface AreaSizingStatus {
    phase: 'probe' | 'verify';
    /** 1-based; 0 during the probe. */
    candidate: number;
    /** 0–1 within the current phase. */
    fraction: number;
}

export interface UseAreaSizingResult {
    result: AreaSizingResult | null;
    isRunning: boolean;
    status: AreaSizingStatus | null;
    error: string | null;
    failure: RevisitFailure | null;
    isMainThreadFallback: boolean;
    /** Start a search. `probeCell` is normally the current worst cell. */
    run: (area: AreaTarget, probeCell: PointTarget, requirementMs: number) => void;
    clear: () => void;
}

interface Pending {
    requestId: number;
    timelineRevision: number;
    scenarioKey: string;
}

/**
 * What a sized answer actually depends on.
 *
 * The requirement belongs in it: a sized answer answers ONE requirement, so
 * changing "2 h max gap" to "30 min" must discard it rather than leave a stale
 * count under a new question.
 *
 * The flown SELECTION does not, and this is the difference with
 * `areaScenarioKey`. `sizeArea` replaces the selection with each candidate in
 * turn and returns the cheapest rung that meets the requirement everywhere —
 * `areaSizing.test.ts` pins that the answer is the same whatever is flown. Key
 * it on the selection and a nudge of the payload slider, or `reconcileToMeasuredBest`
 * adopting the measured-best topology, threw away a ten-second search whose
 * result had not changed.
 *
 * `planeShift` is the exception and stays in: the probe sweep is enumerated at
 * the shift currently flown (`sizeArea` passes it to `runPayloadSweep`), so a
 * different shift is a different ladder and a different answer.
 */
export function areaSizingKey(
    scenario: RevisitScenario,
    area: AreaTarget | null,
    requirementMs: number,
): string {
    return JSON.stringify([
        scenario.reference, scenario.payload, scenario.window,
        scenario.selection.planeShift,
        areaAnalysisKey(area),
        requirementMs,
    ]);
}

export function useAreaSizing(
    scenario: RevisitScenario,
    area: AreaTarget | null = null,
    requirementMs = 0,
): UseAreaSizingResult {
    const clock = useSimulationClock();
    const [result, setResult] = useState<AreaSizingResult | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [status, setStatus] = useState<AreaSizingStatus | null>(null);
    const [failure, setFailure] = useState<RevisitFailure | null>(null);
    const [isMainThreadFallback, setIsMainThreadFallback] = useState(false);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<Pending | null>(null);
    const mountedRef = useRef(true);

    const scenarioKey = areaSizingKey(scenario, area, requirementMs);
    const scenarioKeyRef = useRef(scenarioKey);
    scenarioKeyRef.current = scenarioKey;
    const scenarioRef = useRef(scenario);
    scenarioRef.current = scenario;

    const createWorker = useCallback((): Worker | null => {
        let worker: Worker | null = null;
        try {
            worker = new Worker(
                new URL('../workers/revisitWorker.ts', import.meta.url),
                { type: 'module' },
            );
            setIsMainThreadFallback(false);
        } catch {
            setIsMainThreadFallback(true);
            return null;
        }

        worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
            const response = event.data;
            if (!mountedRef.current) return;
            const pending = pendingRef.current;
            if (!pending) return;

            if (response.kind === 'area-sizing-progress') {
                if (response.requestId !== pending.requestId) return;
                setStatus({
                    phase: response.phase,
                    candidate: response.candidate,
                    fraction: response.total > 0 ? response.completed / response.total : 0,
                });
                return;
            }
            if (response.kind !== 'area-sizing') return;
            if (!isCurrentResponse(response, pending)) return;
            // The scenario may have moved on while this ran; a sizing computed
            // against an abandoned configuration is not a result.
            if (pending.scenarioKey !== scenarioKeyRef.current) {
                pendingRef.current = null;
                setIsRunning(false);
                setStatus(null);
                return;
            }

            pendingRef.current = null;
            setIsRunning(false);
            setStatus(null);
            if (response.ok) {
                setResult(response.sizing);
                setFailure(null);
            } else {
                setFailure(revisitFailure(
                    { path: 'Worker', kind: 'engine error', message: response.error },
                    'Area sizing', 'Area target',
                ));
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            pendingRef.current = null;
            setIsRunning(false);
            setStatus(null);
            setResult(null);
            setFailure(revisitFailure(
                { path: 'Worker', kind: 'runtime error', message: event.message || '' },
                'Area sizing', 'Area target',
            ));
        });

        return worker;
    }, []);

    const replaceWorker = useCallback(() => {
        const previous = workerRef.current;
        workerRef.current = null;
        previous?.terminate();
        if (mountedRef.current) workerRef.current = createWorker();
    }, [createWorker]);

    useEffect(() => {
        mountedRef.current = true;
        replaceWorker();
        return () => {
            mountedRef.current = false;
            workerRef.current?.terminate();
            workerRef.current = null;
            pendingRef.current = null;
        };
    }, [replaceWorker]);

    // A moved scenario invalidates the answer and kills the search — it does not
    // restart it. Sizing is asked for, never inferred.
    useEffect(() => {
        const wasRunning = pendingRef.current !== null;
        pendingRef.current = null;
        if (wasRunning) replaceWorker();
        setResult(null);
        setFailure(null);
        setStatus(null);
        setIsRunning(false);
    }, [scenarioKey, replaceWorker]);

    const run = useCallback((
        target: AreaTarget, probeCell: PointTarget, requirement: number,
    ) => {
        const current = scenarioRef.current;

        const validation = validateArea(target, current.reference, current.payload);
        if (!validation.ok) {
            setFailure(revisitFailure(
                { path: 'Main thread', kind: 'invalid input', message: validation.errors.join(' ') },
                'Area sizing', 'Area target',
            ));
            setResult(null);
            return;
        }

        if (pendingRef.current) replaceWorker();

        setIsRunning(true);
        setFailure(null);
        setStatus({ phase: 'probe', candidate: 0, fraction: 0 });

        const requestId = ++requestIdRef.current;
        const timelineRevision = clock.getSnapshot().revision;
        pendingRef.current = {
            requestId, timelineRevision, scenarioKey: scenarioKeyRef.current,
        };

        const worker = workerRef.current;
        if (!worker) {
            // Main-thread fallback: this blocks for the whole search, which is
            // seconds. It exists so the feature works at all where Workers do
            // not, not because it is a good experience.
            try {
                const { target: _dropped, ...rest } = current;
                setResult(sizeArea(rest, target, probeCell, requirement));
                setFailure(null);
            } catch (e) {
                setResult(null);
                setFailure(revisitFailure(inlineFailureCause(e), 'Area sizing', 'Area target'));
            } finally {
                setIsRunning(false);
                setStatus(null);
                pendingRef.current = null;
            }
            return;
        }

        const request: RevisitWorkerInput = {
            type: 'area-sizing',
            requestId,
            timelineRevision,
            scenario: current,
            area: target,
            probeCell,
            requirementMs: requirement,
        };
        worker.postMessage(request);
    }, [clock, replaceWorker]);

    const clear = useCallback(() => {
        const wasRunning = pendingRef.current !== null;
        pendingRef.current = null;
        if (wasRunning) replaceWorker();
        setResult(null);
        setFailure(null);
        setStatus(null);
        setIsRunning(false);
    }, [replaceWorker]);

    return useMemo(() => ({
        result, isRunning, status, isMainThreadFallback, run, clear,
        error: failure ? revisitFailureDetail(failure) : null,
        failure,
    }), [result, isRunning, status, isMainThreadFallback, run, clear, failure]);
}
