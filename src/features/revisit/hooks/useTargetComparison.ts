import { useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import { compareRevisitTargets } from '../analysis/targetComparison';
import {
    inlineFailureCause, revisitFailure, revisitFailureDetail, type RevisitFailure,
} from '../domain/revisitFailure';
import type { PointTarget, RevisitScenario } from '../domain/types';
import {
    isCurrentResponse, type RevisitTargetComparisonRow,
    type RevisitWorkerInput, type RevisitWorkerOutput,
} from '../workers/revisitProtocol';

const MAX_COMPARISON_TARGETS = 3;
const COMPARISON_DEBOUNCE_MS = 500;

export interface UseTargetComparisonResult {
    rows: RevisitTargetComparisonRow[] | null;
    isComputing: boolean;
    /** The failure as one block of text, label first. Never an empty string. */
    error: string | null;
    /** The same failure with its operation, target, path and kind. */
    failure: RevisitFailure | null;
    computeMs: number | null;
    isMainThreadFallback: boolean;
}

export function useTargetComparison(
    scenario: RevisitScenario,
    targets: PointTarget[],
    enabled: boolean,
): UseTargetComparisonResult {
    const clock = useSimulationClock();
    const [completed, setCompleted] = useState<{ key: string; rows: RevisitTargetComparisonRow[] } | null>(null);
    const [isComputing, setIsComputing] = useState(false);
    const [failure, setFailure] = useState<RevisitFailure | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [isMainThreadFallback, setIsMainThreadFallback] = useState(false);
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{ requestId: number; timelineRevision: number; key: string } | null>(null);
    const mountedRef = useRef(true);

    const key = JSON.stringify([
        scenario.reference, scenario.selection, scenario.payload, scenario.window,
        targets.slice(0, MAX_COMPARISON_TARGETS),
    ]);
    const stable = useMemo(() => ({ scenario, targets: targets.slice(0, MAX_COMPARISON_TARGETS) }), [key]); // eslint-disable-line react-hooks/exhaustive-deps
    const rows = completed?.key === key ? completed.rows : null;

    useEffect(() => {
        // React StrictMode performs a setup → cleanup → setup probe in dev.
        // Re-arm here, otherwise the probe leaves every real worker response
        // classified as a late message from an unmounted component.
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!enabled) {
            pendingRef.current = null;
            setIsComputing(false);
            setIsMainThreadFallback(false);
            return;
        }
        let worker: Worker | null = null;
        try {
            worker = new Worker(new URL('../workers/revisitWorker.ts', import.meta.url), { type: 'module' });
            setIsMainThreadFallback(false);
        } catch {
            setIsMainThreadFallback(true);
            // Inline fallback is handled by the dispatch effect.
        }
        worker?.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
            const response = event.data;
            const pending = pendingRef.current;
            if (!mountedRef.current || response.kind !== 'compare' || !pending
                || !isCurrentResponse(response, pending)) return;
            pendingRef.current = null;
            setIsComputing(false);
            setComputeMs(response.computeMs);
            if (response.ok) {
                setCompleted({ key: pending.key, rows: response.rows });
                setFailure(null);
            } else {
                setCompleted(null);
                setFailure(revisitFailure(
                    { path: 'Worker', kind: 'engine error', message: response.error },
                    'Target comparison', 'Comparison set',
                ));
            }
        });
        worker?.addEventListener('error', (event) => {
            if (!mountedRef.current) return;
            pendingRef.current = null;
            setIsComputing(false);
            setCompleted(null);
            setFailure(revisitFailure(
                { path: 'Worker', kind: 'runtime error', message: event.message || '' },
                'Target comparison', 'Comparison set',
            ));
        });
        workerRef.current = worker;
        return () => {
            worker?.terminate();
            workerRef.current = null;
            pendingRef.current = null;
        };
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;
        setIsComputing(true);
        setFailure(null);
        pendingRef.current = null;
        const timer = window.setTimeout(() => {
            const requestId = ++requestIdRef.current;
            const timelineRevision = clock.getSnapshot().revision;
            pendingRef.current = { requestId, timelineRevision, key };
            const worker = workerRef.current;
            if (worker) {
                worker.postMessage({
                    type: 'compare', requestId, timelineRevision,
                    scenario: stable.scenario, targets: stable.targets,
                } satisfies RevisitWorkerInput);
                return;
            }
            const startedAt = performance.now();
            try {
                const fallbackRows = compareRevisitTargets(stable.scenario, stable.targets);
                if (mountedRef.current) {
                    setCompleted({ key, rows: fallbackRows });
                    setFailure(null);
                }
            } catch (cause) {
                if (mountedRef.current) {
                    setCompleted(null);
                    setFailure(revisitFailure(
                        inlineFailureCause(cause),
                        'Target comparison', 'Comparison set',
                    ));
                }
            } finally {
                if (mountedRef.current) {
                    pendingRef.current = null;
                    setComputeMs(performance.now() - startedAt);
                    setIsComputing(false);
                }
            }
        }, COMPARISON_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [enabled, key, stable, clock]);

    return {
        rows, isComputing, computeMs, isMainThreadFallback,
        error: failure ? revisitFailureDetail(failure) : null,
        failure,
    };
}
