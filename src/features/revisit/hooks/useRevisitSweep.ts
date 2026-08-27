/**
 * useRevisitSweep — the value curve, subscribed from the shared scheduler.
 *
 * ── WHY THE SWEEP IS NOT ON THE ANALYSIS WORKER ─────────────────────────────
 * The sweep costs one engine run per ladder rung — measured at ~1.9 s for a
 * 12 × 8 constellation over 72 h, against ~45 ms for a single configuration.
 * Sharing the analysis worker would put that behind the same queue: a slider
 * drag would sit behind an in-flight sweep and the headline number, the whole
 * point of the mode, would lag by up to two seconds.
 *
 * ── WHY THE SLIDER DOES NOT INVALIDATE IT ───────────────────────────────────
 * The sweep evaluates EVERY rung of the ladder, so it does not depend on which
 * rung is currently selected. Its key is the constellation, the instrument, the
 * target position, the window and `planeShift` — not the strides. Moving the
 * payload slider re-reads a curve that is already computed, instantly.
 *
 * ── WHY THIS HOOK NO LONGER OWNS A WORKER ───────────────────────────────────
 * It used to. Two instances — the reference target and the comparison target —
 * meant two Workers, two private caches and two full-fleet sweeps competing,
 * with no sharing even when both targets sat at the same coordinates. All of
 * that now lives in `sweepScheduler`: one Worker, one bounded cache keyed on
 * physical inputs, one queue. This hook is the React face of a subscription.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import type { PayloadSweepResult } from '../analysis/payloadSweep';
import {
    needsWorkerRestart, revisitFailure, revisitFailureDetail, type RevisitFailure,
} from '../domain/revisitFailure';
import {
    cachedSweepByKey, physicalSweepKey, primeSweepWorker, requestSweep,
    restartSweepWorker,
} from '../workers/sweepScheduler';

/** Longer than the analysis debounce: this is expensive and never urgent. */
export const SWEEP_DEBOUNCE_MS = 600;

export interface UseRevisitSweepResult {
    sweep: PayloadSweepResult | null;
    isComputing: boolean;
    /**
     * The failure as one block of text, label first.
     *
     * NEVER the bare `Error.message`: a Worker `error` event can carry an empty
     * message, and an empty string is falsy — every caller testing `if (error)`
     * would then miss a real failure. The label alone is always meaningful.
     */
    error: string | null;
    /** The same failure with its operation, target, path and kind. */
    failure: RevisitFailure | null;
    computeMs: number | null;
    isMainThreadFallback: boolean;
    /**
     * Rebuild the Worker and ask again.
     *
     * Deliberately not "toggle `enabled` off and on": that is the cancel/restart
     * path, and driving a recovery through it would re-enter exactly the churn
     * a failed sweep may have come from.
     */
    retry: () => void;
}

export function useRevisitSweep(
    scenario: RevisitScenario,
    enabled: boolean = true,
    /** Which target this sweep is for, for the failure label. */
    targetRole: string | null = null,
): UseRevisitSweepResult {
    const clock = useSimulationClock();

    const [completedKey, setCompletedKey] = useState<string | null>(null);
    const [isComputing, setIsComputing] = useState(false);
    const [failure, setFailure] = useState<RevisitFailure | null>(null);
    const [computeMs, setComputeMs] = useState<number | null>(null);
    const [retryToken, setRetryToken] = useState(0);
    /*
     * Mirrored into state rather than read from the scheduler during render:
     * the latch is plain module state, so nothing would re-render when it flips
     * and the degraded-mode notice could stay hidden indefinitely.
     */
    const [isMainThreadFallback, setIsMainThreadFallback] = useState(false);
    const mountedRef = useRef(true);

    const key = physicalSweepKey(scenario);
    const stableScenario = useMemo(() => scenario, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    /*
     * Derived during render, so a curve for the previous inputs disappears the
     * moment they change rather than one effect later. The scheduler's cache is
     * the single source: a curve another target already measured for the same
     * physical inputs is available here immediately, with no second run.
     */
    const sweep = enabled ? cachedSweepByKey(key) : null;
    const publishedFailure = failure && completedKey === key ? failure : null;

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    /*
     * Build the Worker as soon as this sweep is wanted, before anything is
     * dispatched, so a browser that has none is reported BEFORE the first
     * main-thread run rather than after it.
     */
    useEffect(() => {
        if (!enabled) {
            setIsMainThreadFallback(false);
            return;
        }
        setIsMainThreadFallback(!primeSweepWorker());
    }, [enabled, retryToken]);

    useEffect(() => {
        if (!enabled) {
            setIsComputing(false);
            setFailure(null);
            return;
        }
        if (cachedSweepByKey(key)) {
            setIsComputing(false);
            setFailure(null);
            return;
        }
        setIsComputing(true);
        setFailure(null);

        let subscription: { cancel(): void } | null = null;
        const timer = setTimeout(() => {
            subscription = requestSweep(
                stableScenario,
                clock.getSnapshot().revision,
                (outcome) => {
                    if (!mountedRef.current) return;
                    setComputeMs(outcome.computeMs);
                    setIsComputing(false);
                    setCompletedKey(key);
                    setFailure(outcome.ok
                        ? null
                        : revisitFailure(outcome.cause, 'Fleet sizing', targetRole));
                },
            );
        }, SWEEP_DEBOUNCE_MS);

        return () => {
            clearTimeout(timer);
            subscription?.cancel();
        };
    }, [stableScenario, enabled, clock, key, targetRole, retryToken]);

    const retry = useCallback(() => {
        /*
         * Replace the Worker only when the Worker is what broke. An `engine
         * error` came back through the protocol, which means the thread is
         * alive and well; tearing it down would requeue and RESTART whatever
         * else is in flight — typically the reference sweep, seconds from
         * finishing — so retrying one target would silently reset another.
         */
        if (needsWorkerRestart(failure)) restartSweepWorker();
        setFailure(null);
        setRetryToken((token) => token + 1);
    }, [failure]);

    return {
        sweep,
        isComputing,
        error: publishedFailure ? revisitFailureDetail(publishedFailure) : null,
        failure: publishedFailure,
        computeMs,
        isMainThreadFallback,
        retry,
    };
}
