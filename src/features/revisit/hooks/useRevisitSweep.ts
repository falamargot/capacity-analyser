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

    const [sweep, setSweep] = useState<PayloadSweepResult | null>(null);
    const [isComputing, setIsComputing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{ requestId: number; timelineRevision: number } | null>(null);
    const mountedRef = useRef(true);

    // The key that matters: strides are deliberately absent.
    const key = sweepInvalidationKey(scenario);
    const stableScenario = useMemo(() => scenario, [key]); // eslint-disable-line react-hooks/exhaustive-deps

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
            if (!isCurrentResponse(response, pendingRef.current ?? { requestId: null, timelineRevision: -1 })) {
                return;
            }
            pendingRef.current = null;
            setComputeMs(response.computeMs);
            setIsComputing(false);
            if (response.ok) {
                setSweep(response.sweep);
                setError(null);
            } else {
                setError(response.error);
            }
        });

        worker.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            pendingRef.current = null;
            setIsComputing(false);
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

        const timer = setTimeout(() => {
            const requestId = ++requestIdRef.current;
            const timelineRevision = clock.getSnapshot().revision;
            pendingRef.current = { requestId, timelineRevision };

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
                    setSweep(result);
                    setError(null);
                } catch (e) {
                    if (!mountedRef.current) return;
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
    }, [stableScenario, enabled, clock]);

    return { sweep, isComputing, error, computeMs };
}
