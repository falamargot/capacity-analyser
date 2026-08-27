/**
 * sweepScheduler — one payload sweep at a time, across the whole module.
 *
 * ── THE PROBLEM THIS REPLACES ───────────────────────────────────────────────
 * Every `useRevisitSweep` instance used to own a Worker and a private cache.
 * With a reference target and a comparison target on screen that meant two
 * Workers, two caches and two full-fleet sweeps running against each other, and
 * the two never shared a result even when the targets sat at the same
 * coordinates: the invalidation key serialised the whole target object, so the
 * display NAME alone was enough to force a second ~25 s computation of exactly
 * the same numbers. Under a few rapid target changes the comparison curve took
 * close to a minute to appear.
 *
 * ── WHAT THIS DOES INSTEAD ──────────────────────────────────────────────────
 * One Worker, one bounded cache, one queue, for every caller:
 *
 *  - **Deduplication.** The key is PHYSICAL — constellation, instrument, target
 *    coordinates, window, plane shift. The name is excluded, so a reference and
 *    a comparison at the same place resolve to one computation and the second
 *    caller is served from cache or joins the run already in flight.
 *  - **Serialisation.** At most one sweep runs at a time. Two heavy sweeps no
 *    longer compete for the same cores.
 *  - **Supersession, not cancellation.** A request already in flight is never
 *    cancelled — someone may still want it, and its result fills the cache
 *    either way. A request still QUEUED whose last subscriber has gone is
 *    dropped, because nothing on screen is waiting for it. Without that rule a
 *    presenter flicking through four targets would queue four 25 s sweeps and
 *    wait for all of them.
 *
 * ── WHY A MODULE SINGLETON ──────────────────────────────────────────────────
 * The thing being shared is a scarce machine resource — one background thread,
 * and a cache of results that took ~25 s each to produce. React context would scope it to a
 * subtree and give a second REVISIT mount a second Worker, which is the defect
 * this module exists to remove. `resetSweepScheduler` exists for tests and for
 * the retry path, and is the only way to tear the singleton down.
 */

import { runPayloadSweep, type PayloadSweepResult } from '../analysis/payloadSweep';
import type { RevisitScenario } from '../domain/types';
import type { RevisitFailureCause } from '../domain/revisitFailure';
import { inlineFailureCause } from '../domain/revisitFailure';
import {
    isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput,
} from './revisitProtocol';

/**
 * How many completed curves to retain.
 *
 * Sized by the WORKFLOW, not by bytes. A `PayloadSweepResult` is one entry per
 * ladder rung, each holding a handful of scalars and a `GapStatistics` — no
 * access intervals, so a curve is tens of kilobytes and the earlier per-hook
 * bound of one was far stricter than the data warranted. Four covers a
 * reference and a comparison plus the pair the presenter just came from, which
 * is what makes stepping back and forth between two locations instant. Still a
 * bound rather than a target: the map must not grow with session length.
 */
export const MAX_CACHED_SWEEPS = 4;

/**
 * The subset of a scenario a sweep result actually depends on.
 *
 * Deliberately NOT `scenario.target`: that object carries the display name, and
 * two targets with different names at the same coordinates have identical
 * curves. Strides are absent for the reason `sweepInvalidationKey` documents —
 * the sweep evaluates every rung, so which rung is selected cannot change it.
 */
export function physicalSweepKey(scenario: RevisitScenario): string {
    const { target } = scenario;
    return JSON.stringify([
        scenario.reference,
        scenario.payload,
        // Coordinates only. `name` is presentation, not physics.
        [target.kind, target.latDeg, target.lonDeg, target.altitudeKm ?? 0],
        scenario.window,
        scenario.selection.planeShift,
    ]);
}

export type SweepOutcome =
    | { ok: true; sweep: PayloadSweepResult; computeMs: number }
    | { ok: false; cause: RevisitFailureCause; computeMs: number };

export type SweepListener = (outcome: SweepOutcome) => void;

interface SweepJob {
    key: string;
    scenario: RevisitScenario;
    timelineRevision: number;
    listeners: Set<SweepListener>;
    startedAt: number;
}

const cache = new Map<string, PayloadSweepResult>();
/** Queued and in-flight jobs, by key. One job per key is the whole point. */
const jobs = new Map<string, SweepJob>();
const queue: string[] = [];
let inFlight: SweepJob | null = null;
let pendingRequestId: number | null = null;
let requestSequence = 0;

let worker: Worker | null = null;
/** Latched once construction fails: this browser has no module Workers. */
let workerUnavailable = false;

/** Insertion-ordered LRU write. Re-inserting an existing key promotes it. */
export function cacheSweep(
    store: Map<string, PayloadSweepResult>, key: string, sweep: PayloadSweepResult,
    limit: number = MAX_CACHED_SWEEPS,
): void {
    store.delete(key);
    store.set(key, sweep);
    while (store.size > limit) {
        const oldest = store.keys().next().value;
        if (oldest === undefined) break;
        store.delete(oldest);
    }
}

/** A completed curve for these physical inputs, if one is retained. */
export function cachedSweep(scenario: RevisitScenario): PayloadSweepResult | null {
    return cachedSweepByKey(physicalSweepKey(scenario));
}

/**
 * The same lookup for a caller that already holds the key.
 *
 * `physicalSweepKey` serialises the whole Walker spec, including its per-plane
 * altitude and RAAN arrays, so it is not free. React callers derive the key once
 * per render and read the cache through this.
 */
export function cachedSweepByKey(key: string): PayloadSweepResult | null {
    return cache.get(key) ?? null;
}

export function isSweepWorkerUnavailable(): boolean {
    return workerUnavailable;
}

/**
 * Construct the Worker now rather than on the first request, and report whether
 * one exists.
 *
 * This is a PRESENTATION-SAFETY requirement, not an optimisation. The
 * "Running in reduced performance mode" notice is a pre-meeting warning: if the
 * absence of Workers were only discovered when the first sweep is dispatched,
 * the warning would arrive after the ~25 s main-thread freeze it exists to
 * announce. Callers prime as soon as they are enabled.
 *
 * Idempotent — the singleton means many callers still produce at most one
 * Worker.
 */
export function primeSweepWorker(): boolean {
    return ensureWorker() !== null;
}

function ensureWorker(): Worker | null {
    if (worker || workerUnavailable) return worker;
    try {
        worker = new Worker(new URL('./revisitWorker.ts', import.meta.url), { type: 'module' });
    } catch {
        workerUnavailable = true;
        return null;
    }
    worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
        const response = event.data;
        if (response.kind !== 'sweep' || !inFlight) return;
        if (!isCurrentResponse(response, {
            requestId: pendingRequestId,
            timelineRevision: inFlight.timelineRevision,
        })) return;
        settle(inFlight, response.ok
            ? { ok: true, sweep: response.sweep, computeMs: response.computeMs }
            : {
                ok: false,
                computeMs: response.computeMs,
                cause: { path: 'Worker', kind: 'engine error', message: response.error },
            });
    });
    worker.addEventListener('error', (event) => {
        if (!inFlight) return;
        const failed = inFlight;
        /*
         * A Worker that raised `error` is not reusable — the next postMessage
         * would go to a dead thread and nothing would ever come back. Drop it
         * before settling so the following job constructs a fresh one; that is
         * also what makes the retry control work without a page reload.
         */
        disposeWorker();
        settle(failed, {
            ok: false,
            computeMs: performance.now() - failed.startedAt,
            cause: {
                path: 'Worker',
                kind: 'runtime error',
                message: event.message || '',
            },
        });
    });
    return worker;
}

function disposeWorker(): void {
    worker?.terminate();
    worker = null;
    pendingRequestId = null;
}

function settle(job: SweepJob, outcome: SweepOutcome): void {
    if (outcome.ok) cacheSweep(cache, job.key, outcome.sweep);
    jobs.delete(job.key);
    if (inFlight === job) {
        inFlight = null;
        pendingRequestId = null;
    }
    // Copy: a listener may subscribe again from inside its own callback.
    for (const listener of [...job.listeners]) listener(outcome);
    pump();
}

function dispatch(job: SweepJob): void {
    inFlight = job;
    job.startedAt = performance.now();

    const active = ensureWorker();
    if (!active) {
        /*
         * Inline fallback. Blocking the main thread for seconds is bad; having
         * no value curve at all is worse — it is the deliverable. Deferred to a
         * task so the caller that triggered this never observes a synchronous
         * settle from inside its own effect.
         */
        setTimeout(() => {
            if (inFlight !== job) return;
            try {
                const sweep = runPayloadSweep(
                    job.scenario.reference, job.scenario.target,
                    job.scenario.payload, job.scenario.window,
                    { planeShift: job.scenario.selection.planeShift },
                );
                settle(job, { ok: true, sweep, computeMs: performance.now() - job.startedAt });
            } catch (cause) {
                settle(job, {
                    ok: false,
                    computeMs: performance.now() - job.startedAt,
                    cause: inlineFailureCause(cause),
                });
            }
        }, 0);
        return;
    }

    pendingRequestId = ++requestSequence;
    const request: RevisitWorkerInput = {
        type: 'sweep',
        requestId: pendingRequestId,
        timelineRevision: job.timelineRevision,
        scenario: job.scenario,
    };
    active.postMessage(request);
}

/**
 * Start the next wanted job.
 *
 * Queued jobs whose listeners have all unsubscribed are discarded here rather
 * than at unsubscribe time: a job can lose and regain listeners while it waits,
 * and only the moment before it would consume the Worker is it certain that
 * nobody wants it.
 */
function pump(): void {
    if (inFlight) return;
    while (queue.length > 0) {
        const key = queue.shift()!;
        const job = jobs.get(key);
        if (!job) continue;
        if (job.listeners.size === 0) {
            jobs.delete(key);
            continue;
        }
        dispatch(job);
        return;
    }
}

export interface SweepSubscription {
    /**
     * Stop waiting for this sweep.
     *
     * Never cancels a computation already running: it will finish and populate
     * the cache, which is what makes returning to a target instant. It only
     * withdraws interest, which lets `pump` skip the job if it is still queued.
     */
    cancel(): void;
}

/**
 * Ask for the curve of these physical inputs.
 *
 * Serves the cache when it can, joins an identical request when one exists, and
 * queues otherwise. The listener is always called asynchronously, exactly once,
 * unless the subscription is cancelled first.
 */
export function requestSweep(
    scenario: RevisitScenario,
    timelineRevision: number,
    listener: SweepListener,
): SweepSubscription {
    const key = physicalSweepKey(scenario);
    const hit = cache.get(key);
    if (hit) {
        // Promote by reference — never a structural copy of the curve.
        cacheSweep(cache, key, hit);
        let live = true;
        queueMicrotask(() => {
            if (live) listener({ ok: true, sweep: hit, computeMs: 0 });
        });
        return { cancel: () => { live = false; } };
    }

    let job = jobs.get(key);
    if (!job) {
        job = { key, scenario, timelineRevision, listeners: new Set(), startedAt: 0 };
        jobs.set(key, job);
        queue.push(key);
    }
    job.listeners.add(listener);
    pump();

    const owner = job;
    return {
        cancel: () => {
            owner.listeners.delete(listener);
        },
    };
}

/**
 * Tear the Worker down so the next request builds a fresh one.
 *
 * This is what `Retry fleet sizing` calls. It deliberately does NOT clear the
 * cache: retrying one failed target must not throw away every curve already
 * measured for the others.
 */
export function restartSweepWorker(): void {
    disposeWorker();
    workerUnavailable = false;
    if (inFlight) {
        // Whatever it was doing died with the Worker; requeue it so the caller
        // that is still listening gets an answer from the new one.
        const orphan = inFlight;
        inFlight = null;
        if (orphan.listeners.size > 0) {
            jobs.set(orphan.key, orphan);
            queue.unshift(orphan.key);
        } else {
            jobs.delete(orphan.key);
        }
    }
    pump();
}

/** Full teardown. Tests only — the singleton has no other lifecycle. */
export function resetSweepScheduler(): void {
    disposeWorker();
    workerUnavailable = false;
    inFlight = null;
    queue.length = 0;
    jobs.clear();
    cache.clear();
    requestSequence = 0;
}

/** Introspection for tests and for the memory monitor. */
export function sweepSchedulerStats(): {
    cached: number; queued: number; running: boolean;
} {
    return { cached: cache.size, queued: queue.length, running: inFlight !== null };
}
