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
 *
 * ── WHAT MAY SURVIVE A RECOMPUTATION, AND WHAT MAY NOT (Programme 7C) ───────
 * This hook retains the last analysis while the next one is in flight, and that
 * is right for a CONTINUOUS change: dragging the payload slider or stepping the
 * swath produces a neighbouring answer about the same subject, and dropping the
 * number on every cran would strobe the headline.
 *
 * It is wrong when the SUBJECT changes. A retained analysis after the target
 * moves to another city, the constellation model is replaced or the analysis
 * window is re-anchored is not an approximation of the new answer — it
 * describes a different question, under the new question's heading. So the
 * result is keyed on its identity and vanishes the moment that changes,
 * derived during render rather than one effect later.
 *
 * Deliberately NOT a global revision counter shared with the other hooks: the
 * sweep excludes the strides from its own key on purpose, and
 * `reconcileToMeasuredBest` writes those strides back from the sweep that just
 * landed — one counter over the whole scenario would invalidate the result that
 * moved it (plan, Programme 7 decision 1).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import { runRevisitScenario, type RevisitAnalysis } from '../analysis/runScenario';
import {
    inlineFailureCause, revisitFailure, revisitFailureDetail, type RevisitFailure,
} from '../domain/revisitFailure';
import { isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput } from '../workers/revisitProtocol';

/** Long enough to swallow a slider drag, short enough to feel immediate. */
export const DEFAULT_DEBOUNCE_MS = 300;

export interface UseRevisitAnalysisOptions {
    includeSweep?: boolean;
    debounceMs?: number;
}

export interface UseRevisitAnalysisResult {
    /**
     * The last successfully computed analysis, retained while a new one is in
     * flight — but only for the SAME subject. See the identity note above: a
     * change of target, constellation or window drops it immediately rather
     * than presenting the previous question's answer under the new heading.
     */
    analysis: RevisitAnalysis | null;
    isComputing: boolean;
    /** The failure as one block of text, label first. Never an empty string. */
    error: string | null;
    /** The same failure with its operation, target, path and kind. */
    failure: RevisitFailure | null;
    /** True when a Worker could not be constructed and the engine runs inline. */
    isMainThreadFallback: boolean;
    /** Wall-clock duration of the last computation, ms. Telemetry only. */
    computeMs: number | null;
}

/** Stable identity for a scenario — the engine is a pure function of exactly this. */
function scenarioKey(scenario: RevisitScenario, includeSweep: boolean): string {
    return JSON.stringify([scenario, includeSweep]);
}

/**
 * What the analysis is ABOUT, as opposed to what it measures (Programme 7C).
 *
 * `target` — a different place is a different question.
 * `reference` — a different constellation is a different fleet. Edited through
 *   the Advanced drawer, which stages a complete geometry and commits it once,
 *   so this is a discrete choice and never a drag.
 * `window` — re-anchoring or resizing the window changes the basis of the
 *   max-gap figure itself, so the previous number is not a neighbour of the new
 *   one. Included for that reason, even though the audit's list did not name it.
 *
 * Absent on purpose: `selection` and `payload`. Those are the continuous
 * controls — the payload slider and the swath preset — where retaining the last
 * value while the next is computed is what keeps the headline readable.
 */
export function analysisIdentityKey(
    scenario: RevisitScenario, includeSweep: boolean = false
): string {
    return JSON.stringify([
        scenario.target, scenario.reference, scenario.window, includeSweep,
    ]);
}

export function useRevisitAnalysis(
    scenario: RevisitScenario,
    options: UseRevisitAnalysisOptions = {}
): UseRevisitAnalysisResult {
    const { includeSweep = false, debounceMs = DEFAULT_DEBOUNCE_MS } = options;
    const clock = useSimulationClock();

    const [completed, setCompleted] = useState<
        { identityKey: string; analysis: RevisitAnalysis } | null
    >(null);
    const [isComputing, setIsComputing] = useState(true);
    const [failure, setFailure] = useState<RevisitFailure | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [isMainThreadFallback, setIsMainThreadFallback] = useState(false);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{
        requestId: number;
        timelineRevision: number;
        key: string;
        identityKey: string;
    } | null>(null);
    /** Set on unmount so a late worker message cannot call setState on a dead tree. */
    const mountedRef = useRef(true);

    const key = scenarioKey(scenario, includeSweep);
    const identityKey = analysisIdentityKey(scenario, includeSweep);
    /*
     * Derived during render, so a retained analysis for a different subject is
     * gone in the same commit as the input change — not one effect later, which
     * is a frame in which the old city's worst case sits under the new city's
     * name.
     */
    const analysis = completed?.identityKey === identityKey ? completed.analysis : null;
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
            const pending = pendingRef.current;
            if (!pending || !isCurrentResponse(response, pending)) {
                return;
            }
            pendingRef.current = null;

            setComputeMs(response.computeMs);
            setIsComputing(false);
            if (response.ok) {
                // Commit under the identity that was DISPATCHED. Reading the
                // current render identity here lets a late response for target A
                // be relabelled as target B during B's debounce window.
                setCompleted({ identityKey: pending.identityKey, analysis: response.analysis });
                setFailure(null);
            } else {
                // Never leave the last valid KPI on screen after the current
                // scenario has been rejected; it would look like the invalid
                // inputs produced that number.
                setCompleted(null);
                setFailure(revisitFailure(
                    { path: 'Worker', kind: 'engine error', message: response.error },
                    'Analysis', 'Primary target',
                ));
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            // Clear the in-flight gate, or no further request is ever dispatched.
            pendingRef.current = null;
            setIsComputing(false);
            setCompleted(null);
            setFailure(revisitFailure(
                { path: 'Worker', kind: 'runtime error', message: event.message || '' },
                'Analysis', 'Primary target',
            ));
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
        setFailure(null);
        // Invalidate the previous request before the replacement debounce. A
        // response that lands in that window belongs to the old scenario even
        // though no newer request id has been issued yet.
        pendingRef.current = null;

        const timer = setTimeout(() => {
            const requestId = ++requestIdRef.current;
            const timelineRevision = clock.getSnapshot().revision;
            const pending = { requestId, timelineRevision, key, identityKey };
            pendingRef.current = pending;

            const worker = workerRef.current;
            if (!worker) {
                // Main-thread fallback. Same function the worker calls, so the two
                // paths cannot produce different numbers.
                const startedAt = performance.now();
                try {
                    const result = runRevisitScenario(stableScenario, { includeSweep });
                    if (!mountedRef.current) return;
                    setCompleted({ identityKey: pending.identityKey, analysis: result });
                    setFailure(null);
                } catch (e) {
                    if (!mountedRef.current) return;
                    setCompleted(null);
                    setFailure(revisitFailure(
                        inlineFailureCause(e),
                        'Analysis', 'Primary target',
                    ));
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
        // `key` and `identityKey` are both functions of the scenario, and
        // `stableScenario` is memoized on `key`, so listing them changes nothing
        // at runtime — it just states the dependency the closure really has.
    }, [stableScenario, key, identityKey, includeSweep, debounceMs, clock]);

    return {
        analysis, isComputing, isMainThreadFallback, computeMs,
        error: failure ? revisitFailureDetail(failure) : null,
        failure,
    };
}
