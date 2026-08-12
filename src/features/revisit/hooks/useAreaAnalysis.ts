/**
 * useAreaAnalysis — run a gridded area, on demand.
 *
 * Every cell is a full engine run, so this is opt-in rather than automatic: a
 * 300-cell grid over 72 hours is tens of seconds and must never be triggered by
 * simply opening the mode (UX §6 — the mode opens instantly on a preset).
 *
 * Runs on its own worker for the same reason the sweep does: it would otherwise
 * block the headline analysis behind a queue for the whole run.
 *
 * ── TWO LIFECYCLE RULES THIS HOOK EXISTS TO ENFORCE ─────────────────────────
 *
 * 1. A RESULT BELONGS TO THE SCENARIO THAT PRODUCED IT. An area analysis is
 *    computed against a specific constellation, instrument and window. If any of
 *    those change, the result on screen is describing a world that no longer
 *    exists — and it is draped over the globe as a heat map, which reads as
 *    current. So the result is discarded on any scenario change, and an in-flight
 *    response whose scenario key no longer matches is dropped rather than
 *    published under the new inputs.
 *
 * 2. THE WORKER IS OWNED, NOT LEAKED. It is created with the hook and terminated
 *    on unmount. Previously it was created lazily inside `run` and never
 *    terminated, so every visit to the mode left another worker alive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import type { AreaTarget } from '../domain/areaTarget';
import { validateArea } from '../domain/areaTarget';
import { analyseArea, type AreaAnalysis } from '../analysis/areaAnalysis';
import {
    isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput,
} from '../workers/revisitProtocol';

export interface UseAreaAnalysisResult {
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    error: string | null;
    /** 0–1 while running, null when idle. Driven by real worker progress. */
    progress: number | null;
    run: (area: AreaTarget) => void;
    clear: () => void;
}

/** Everything an area result depends on. The target is supplied by the area itself. */
function areaScenarioKey(scenario: RevisitScenario): string {
    return JSON.stringify([
        scenario.reference, scenario.selection, scenario.payload, scenario.window,
    ]);
}

interface Pending {
    requestId: number;
    timelineRevision: number;
    scenarioKey: string;
}

export function useAreaAnalysis(scenario: RevisitScenario): UseAreaAnalysisResult {
    const clock = useSimulationClock();
    const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<Pending | null>(null);
    const mountedRef = useRef(true);

    const scenarioKey = areaScenarioKey(scenario);
    const scenarioKeyRef = useRef(scenarioKey);
    scenarioKeyRef.current = scenarioKey;
    const scenarioRef = useRef(scenario);
    scenarioRef.current = scenario;

    const createWorker = useCallback((): Worker | null => {
        let worker: Worker | null = null;
        try {
            worker = new Worker(
                new URL('../workers/revisitWorker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            return null; // Main-thread fallback happens in `run`.
        }

        worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
            const response = event.data;
            if (!mountedRef.current) return;

            const pending = pendingRef.current;
            if (!pending) return;

            if (response.kind === 'area-progress') {
                if (response.requestId !== pending.requestId) return;
                setProgress(response.total > 0 ? response.completed / response.total : null);
                return;
            }
            if (response.kind !== 'area') return;
            if (!isCurrentResponse(response, pending)) return;
            // The scenario may have moved on while this ran.
            if (pending.scenarioKey !== scenarioKeyRef.current) {
                pendingRef.current = null;
                setIsRunning(false);
                setProgress(null);
                return;
            }

            pendingRef.current = null;
            setIsRunning(false);
            setProgress(null);
            if (response.ok) {
                setAnalysis(response.area);
                setError(null);
            } else {
                setError(response.error);
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            pendingRef.current = null;
            setIsRunning(false);
            setProgress(null);
            setAnalysis(null);
            setError(event.message || 'Area worker failed');
        });

        return worker;
    }, []);

    /**
     * Termination is the only reliable way to interrupt synchronous worker code.
     * Replacing the dedicated area worker therefore provides real cancellation:
     * a new request never waits behind an abandoned grid run.
     */
    const replaceWorker = useCallback(() => {
        const previous = workerRef.current;
        workerRef.current = null;
        previous?.terminate();
        if (mountedRef.current) workerRef.current = createWorker();
    }, [createWorker]);

    // ── Rule 2: the worker is owned for the lifetime of the hook ───────────
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

    // ── Rule 1: a result belongs to the scenario that produced it ───────────
    useEffect(() => {
        const wasRunning = pendingRef.current !== null;
        pendingRef.current = null;
        // Kill the active computation rather than merely ignoring its eventual
        // reply. Otherwise the next area request sits behind obsolete work.
        if (wasRunning) replaceWorker();
        setAnalysis(null);
        setError(null);
        setProgress(null);
        setIsRunning(false);
    }, [scenarioKey, replaceWorker]);

    const run = useCallback((area: AreaTarget) => {
        const current = scenarioRef.current;

        // Validate on the main thread so the user gets the aliasing message
        // immediately rather than after a worker round-trip.
        const validation = validateArea(area, current.reference, current.payload);
        if (!validation.ok) {
            setError(validation.errors.join(' '));
            setAnalysis(null);
            return;
        }

        // Defensive latest-request-wins behavior even if a future caller allows
        // a second area button while the first run is still active.
        if (pendingRef.current) replaceWorker();

        setIsRunning(true);
        setError(null);
        setProgress(0);

        const requestId = ++requestIdRef.current;
        const timelineRevision = clock.getSnapshot().revision;
        pendingRef.current = {
            requestId, timelineRevision, scenarioKey: scenarioKeyRef.current,
        };

        const worker = workerRef.current;
        if (!worker) {
            // Main-thread fallback. This blocks for the whole grid, which is why
            // the cell budget exists.
            try {
                const { target: _dropped, ...rest } = current;
                setAnalysis(analyseArea(rest, area));
                setError(null);
            } catch (e) {
                setAnalysis(null);
                setError(e instanceof Error ? e.message : String(e));
            } finally {
                setIsRunning(false);
                setProgress(null);
                pendingRef.current = null;
            }
            return;
        }

        const request: RevisitWorkerInput = {
            type: 'area', requestId, timelineRevision, scenario: current, area,
        };
        worker.postMessage(request);
    }, [clock, replaceWorker]);

    const clear = useCallback(() => {
        const wasRunning = pendingRef.current !== null;
        pendingRef.current = null;
        if (wasRunning) replaceWorker();
        setAnalysis(null);
        setError(null);
        setProgress(null);
        setIsRunning(false);
    }, [replaceWorker]);

    return useMemo(
        () => ({ analysis, isRunning, error, progress, run, clear }),
        [analysis, isRunning, error, progress, run, clear]
    );
}
