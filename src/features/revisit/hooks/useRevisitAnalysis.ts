/**
 * useRevisitAnalysis — drive the revisit worker from React.
 *
 * Flow (design note §5.1): parameter change → debounce → post to worker →
 * worker returns the completed analysis → UI updates. The statistics are never
 * accumulated from animation frames.
 *
 * ── WHY THE WINDOW DOES NOT FOLLOW THE PLAYHEAD ─────────────────────────────
 * The analysis window is part of the scenario and is anchored once. The
 * SimulationClock playhead moves *within* that fixed window; it does not move
 * the window. This is deliberate and is what makes the Lot 2 exit criterion —
 * "scrubbing backwards leaves statistics unchanged" — true by construction
 * rather than by luck. Re-anchoring is an explicit user action, not a side
 * effect of scrubbing.
 *
 * Consequently `timelineRevision` cannot be compared against the *current*
 * clock revision: doing so would reject an in-flight response the moment the
 * user seeks, and since the scenario would be unchanged nothing would
 * re-dispatch — leaving the UI computing forever. The response is instead
 * matched against the revision captured at dispatch, which is the question the
 * guard is actually asking: "is this the reply to the request I am waiting for?"
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import { runRevisitScenario, type RevisitAnalysis } from '../analysis/runScenario';
import { isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput } from '../workers/revisitProtocol';

/** Long enough to swallow a slider drag, short enough to feel immediate. */
export const DEFAULT_DEBOUNCE_MS = 300;

export interface UseRevisitAnalysisOptions {
    includeSweep?: boolean;
    debounceMs?: number;
}

export interface UseRevisitAnalysisResult {
    /** The last successfully computed analysis. Retained while a new one is in flight. */
    analysis: RevisitAnalysis | null;
    isComputing: boolean;
    error: string | null;
    /** True when a Worker could not be constructed and the engine runs inline. */
    isMainThreadFallback: boolean;
    /** Wall-clock duration of the last computation, ms. Telemetry only. */
    computeMs: number | null;
}

/** Stable identity for a scenario — the engine is a pure function of exactly this. */
function scenarioKey(scenario: RevisitScenario, includeSweep: boolean): string {
    return JSON.stringify([scenario, includeSweep]);
}

export function useRevisitAnalysis(
    scenario: RevisitScenario,
    options: UseRevisitAnalysisOptions = {}
): UseRevisitAnalysisResult {
    const { includeSweep = false, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
    const clock = useSimulationClock();

    const [analysis, setAnalysis] = useState<RevisitAnalysis | null>(null);
    const [isComputing, setIsComputing] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [isMainThreadFallback, setIsMainThreadFallback] = useState(false);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{ requestId: number; timelineRevision: number } | null>(null);
    /** Set on unmount so a late worker message cannot call setState on a dead tree. */
    const mountedRef = useRef(true);

    const key = scenarioKey(scenario, includeSweep);
    // The scenario object is rebuilt on every render by its owner; the engine
    // only cares about its value. Keying on the serialisation is what stops a
    // fresh object identity from triggering an endless recompute loop.
    const stableScenario = useMemo(() => scenario, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    // Own the worker for the lifetime of the hook.
    useEffect(() => {
        let worker: Worker | null = null;
        try {
            worker = new Worker(
                new URL('../workers/revisitWorker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            // Some environments (older Safari, locked-down embeds, jsdom) cannot
            // construct a module Worker. The engine is pure, so running it inline
            // is correct — just not off the main thread. The loader in
            // useSatelliteLoader handles the same failure the same way.
            setIsMainThreadFallback(true);
            return;
        }

        worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
            const response = event.data;
            // This worker only ever receives `analyse`, but the guard keeps the
            // two hooks' response handling symmetric and type-narrowed.
            if (!mountedRef.current || response.kind !== 'analyse') return;
            if (!isCurrentResponse(response, pendingRef.current ?? { requestId: null, timelineRevision: -1 })) {
                return;
            }
            pendingRef.current = null;

            setComputeMs(response.computeMs);
            setIsComputing(false);
            if (response.ok) {
                setAnalysis(response.analysis);
                setError(null);
            } else {
                // Never leave the last valid KPI on screen after the current
                // scenario has been rejected; it would look like the invalid
                // inputs produced that number.
                setAnalysis(null);
                setError(response.error);
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            // Clear the in-flight gate, or no further request is ever dispatched.
            pendingRef.current = null;
            setIsComputing(false);
            setError(event.message || 'Revisit worker failed');
        });

        workerRef.current = worker;
        return () => {
            worker?.terminate();
            workerRef.current = null;
            pendingRef.current = null;
        };
    }, []);

    // Dispatch on scenario change, debounced.
    useEffect(() => {
        setIsComputing(true);
        setError(null);

        const timer = setTimeout(() => {
            const requestId = ++requestIdRef.current;
            const timelineRevision = clock.getSnapshot().revision;
            pendingRef.current = { requestId, timelineRevision };

            const worker = workerRef.current;
            if (!worker) {
                // Main-thread fallback. Same function the worker calls, so the two
                // paths cannot produce different numbers.
                const startedAt = performance.now();
                try {
                    const result = runRevisitScenario(stableScenario, { includeSweep });
                    if (!mountedRef.current) return;
                    setAnalysis(result);
                    setError(null);
                } catch (e) {
                    if (!mountedRef.current) return;
                    setAnalysis(null);
                    setError(e instanceof Error ? e.message : String(e));
                } finally {
                    if (mountedRef.current) {
                        setComputeMs(performance.now() - startedAt);
                        setIsComputing(false);
                        pendingRef.current = null;
                    }
                }
                return;
            }

            const request: RevisitWorkerInput = {
                type: 'analyse',
                requestId,
                timelineRevision,
                scenario: stableScenario,
                includeSweep,
            };
            worker.postMessage(request);
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [stableScenario, includeSweep, debounceMs, clock]);

    return { analysis, isComputing, error, isMainThreadFallback, computeMs };
}
