/**
 * useRevisitSweep — the value curve, on its own worker.
 *
 * ── WHY A SECOND WORKER ─────────────────────────────────────────────────────
 * The sweep costs one engine run per ladder rung — measured at ~1.9 s for a
 * 12 × 8 constellation over 72 h, against ~45 ms for a single configuration.
 * Sharing a worker with the headline analysis would put that behind the same
 * queue: a slider drag would sit behind an in-flight sweep and the headline
 * number, the whole point of the mode, would lag by up to two seconds.
 *
 * ── WHY THE SLIDER DOES NOT INVALIDATE IT ───────────────────────────────────
 * The sweep evaluates EVERY rung of the ladder, so it does not depend on which
 * rung is currently selected. Its cache key is therefore the constellation, the
 * instrument, the target, the window and `planeShift` — not the strides. Moving
 * the payload slider re-reads a curve that is already computed, instantly.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import { runPayloadSweep, type PayloadSweepResult } from '../analysis/payloadSweep';
import {
    isCurrentResponse, sweepInvalidationKey,
    type RevisitWorkerInput, type RevisitWorkerOutput,
} from '../workers/revisitProtocol';

/** Longer than the analysis debounce: this is expensive and never urgent. */
export const SWEEP_DEBOUNCE_MS = 600;

export interface UseRevisitSweepResult {
    sweep: PayloadSweepResult | null;
    isComputing: boolean;
    error: string | null;
    computeMs: number | null;
}

export function useRevisitSweep(
    scenario: RevisitScenario,
    enabled: boolean = true
): UseRevisitSweepResult {
    const clock = useSimulationClock();

    const [completed, setCompleted] = useState<{
        key: string;
        sweep: PayloadSweepResult;
    } | null>(null);
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{
        requestId: number;
        timelineRevision: number;
        key: string;
    } | null>(null);
    const mountedRef = useRef(true);

    // The key that matters: strides are deliberately absent.
    const key = sweepInvalidationKey(scenario);
    const stableScenario = useMemo(() => scenario, [key]); // eslint-disable-line react-hooks/exhaustive-deps
    // A completed result is publishable only for the inputs that produced it.
    // This is derived during render, so an old curve disappears immediately on
    // an input change rather than one effect later.
    const sweep = completed?.key === key ? completed.sweep : null;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        let worker: Worker | null = null;
        try {
            worker = new Worker(
                new URL('../workers/revisitWorker.ts', import.meta.url),
                { type: 'module' }
            );
        } catch {
            return; // Main-thread fallback handled in the dispatch effect.
        }

        worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
            const response = event.data;
            if (!mountedRef.current || response.kind !== 'sweep') return;
            const pending = pendingRef.current;
            if (!pending || !isCurrentResponse(response, pending)) {
                return;
            }
            pendingRef.current = null;
            setComputeMs(response.computeMs);
            setIsComputing(false);
            if (response.ok) {
                setCompleted({ key: pending.key, sweep: response.sweep });
                setError(null);
            } else {
                setCompleted(null);
                setError(response.error);
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            pendingRef.current = null;
            setIsComputing(false);
            setCompleted(null);
            setError(event.message || 'Revisit sweep worker failed');
        });

        workerRef.current = worker;
        return () => {
            worker?.terminate();
            workerRef.current = null;
            pendingRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;
        setIsComputing(true);
        setError(null);
        // Invalidate an in-flight response before the debounce for its
        // replacement starts. Otherwise an obsolete sweep can land during that
        // window and be reconciled into the new scenario.
        pendingRef.current = null;

        const timer = setTimeout(() => {
            const requestId = ++requestIdRef.current;
            const timelineRevision = clock.getSnapshot().revision;
            pendingRef.current = { requestId, timelineRevision, key };

            const worker = workerRef.current;
            if (!worker) {
                // Inline fallback. Blocking the main thread for ~2 s is bad, but
                // silently having no value curve is worse — it is the deliverable.
                const startedAt = performance.now();
                try {
                    const result = runPayloadSweep(
                        stableScenario.reference, stableScenario.target,
                        stableScenario.payload, stableScenario.window,
                        { planeShift: stableScenario.selection.planeShift }
                    );
                    if (!mountedRef.current) return;
                    setCompleted({ key, sweep: result });
                    setError(null);
                } catch (e) {
                    if (!mountedRef.current) return;
                    setCompleted(null);
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
                type: 'sweep', requestId, timelineRevision, scenario: stableScenario,
            };
            worker.postMessage(request);
        }, SWEEP_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [stableScenario, enabled, clock, key]);

    return { sweep, isComputing, error, computeMs };
}
