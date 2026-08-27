import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';
import type { PayloadSweepResult } from '../analysis/payloadSweep';
import type { RevisitWorkerInput, RevisitWorkerOutput } from '../workers/revisitProtocol';
import {
    isSweepWorkerUnavailable, physicalSweepKey, primeSweepWorker, requestSweep,
    resetSweepScheduler, restartSweepWorker, sweepSchedulerStats, type SweepOutcome,
} from '../workers/sweepScheduler';

class MockWorker {
    static instances: MockWorker[] = [];
    readonly postMessage = vi.fn<(message: RevisitWorkerInput) => void>();
    readonly terminate = vi.fn();
    private listeners = new Map<string, Array<(event: unknown) => void>>();

    constructor() {
        MockWorker.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
        const existing = this.listeners.get(type) ?? [];
        existing.push(listener);
        this.listeners.set(type, existing);
    }

    private emit(type: string, event: unknown) {
        for (const listener of this.listeners.get(type) ?? []) listener(event);
    }

    /** Reply to the request at `index`, echoing its envelope as the worker does. */
    reply(index: number, sweep: PayloadSweepResult) {
        const request = this.postMessage.mock.calls[index][0];
        const response: RevisitWorkerOutput = {
            kind: 'sweep', ok: true, sweep, computeMs: 1,
            requestId: request.requestId, timelineRevision: request.timelineRevision,
        };
        this.emit('message', { data: response });
    }

    replyWithEngineError(index: number, message: string) {
        const request = this.postMessage.mock.calls[index][0];
        const response: RevisitWorkerOutput = {
            kind: 'sweep', ok: false, error: message, computeMs: 1,
            requestId: request.requestId, timelineRevision: request.timelineRevision,
        };
        this.emit('message', { data: response });
    }

    crash(message = '') {
        this.emit('error', { message });
    }
}

const sweepOf = (warning: string): PayloadSweepResult => ({ points: [], warnings: [warning] });

function scenarioAt(name: string, latDeg: number, lonDeg: number): RevisitScenario {
    const base = defaultScenario(Date.UTC(2026, 7, 26));
    return { ...base, target: { kind: 'POINT', name, latDeg, lonDeg } };
}

const LONDON = scenarioAt('London', 51.5074, -0.1278);
/** Same place, different label — the case that used to compute twice. */
const LONDON_RENAMED = scenarioAt('Customer HQ', 51.5074, -0.1278);
const SINGAPORE = scenarioAt('Singapore', 1.3521, 103.8198);

let originalWorker: typeof Worker;

beforeEach(() => {
    originalWorker = globalThis.Worker;
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    MockWorker.instances = [];
    resetSweepScheduler();
});

afterEach(() => {
    resetSweepScheduler();
    globalThis.Worker = originalWorker;
});

const collect = () => {
    const outcomes: SweepOutcome[] = [];
    return { outcomes, listener: (outcome: SweepOutcome) => { outcomes.push(outcome); } };
};

describe('physicalSweepKey', () => {
    it('ignores the display name and separates real coordinates', () => {
        expect(physicalSweepKey(LONDON)).toBe(physicalSweepKey(LONDON_RENAMED));
        expect(physicalSweepKey(LONDON)).not.toBe(physicalSweepKey(SINGAPORE));
    });

    it('excludes the strides the payload slider moves', () => {
        const shifted = {
            ...LONDON,
            selection: { ...LONDON.selection, planeStride: LONDON.selection.planeStride + 1 },
        };
        expect(physicalSweepKey(shifted)).toBe(physicalSweepKey(LONDON));
    });
});

describe('sweepScheduler deduplication', () => {
    it('runs one sweep for two targets at the same place under different names', () => {
        const reference = collect();
        const comparison = collect();
        requestSweep(LONDON, 0, reference.listener);
        requestSweep(LONDON_RENAMED, 0, comparison.listener);

        const worker = MockWorker.instances[0];
        expect(MockWorker.instances).toHaveLength(1);
        expect(worker.postMessage).toHaveBeenCalledTimes(1);

        worker.reply(0, sweepOf('shared'));
        for (const outcome of [reference.outcomes[0], comparison.outcomes[0]]) {
            expect(outcome.ok).toBe(true);
            expect(outcome.ok && outcome.sweep.warnings).toEqual(['shared']);
        }
    });

    it('serves a later identical request from cache without dispatching again', async () => {
        const first = collect();
        requestSweep(LONDON, 0, first.listener);
        MockWorker.instances[0].reply(0, sweepOf('cached'));

        const second = collect();
        requestSweep(LONDON_RENAMED, 0, second.listener);
        await Promise.resolve();

        expect(MockWorker.instances[0].postMessage).toHaveBeenCalledTimes(1);
        expect(second.outcomes[0]?.ok).toBe(true);
    });
});

describe('sweepScheduler queue', () => {
    it('runs one sweep at a time instead of competing for the cores', () => {
        requestSweep(LONDON, 0, collect().listener);
        requestSweep(SINGAPORE, 0, collect().listener);

        const worker = MockWorker.instances[0];
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(sweepSchedulerStats().queued).toBe(1);

        worker.reply(0, sweepOf('london'));
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
    });

    it('drops queued work nobody is waiting for, and never cancels what is running', () => {
        const running = collect();
        requestSweep(LONDON, 0, running.listener);
        const worker = MockWorker.instances[0];

        // Three more targets chosen in quick succession; only the last is still
        // wanted by the time the running sweep lands.
        const abandoned = [
            requestSweep(scenarioAt('A', 10, 10), 0, collect().listener),
            requestSweep(scenarioAt('B', 20, 20), 0, collect().listener),
        ];
        const wanted = collect();
        requestSweep(scenarioAt('C', 30, 30), 0, wanted.listener);
        for (const subscription of abandoned) subscription.cancel();

        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        worker.reply(0, sweepOf('london'));

        // Exactly one further dispatch — the wanted one. Without the drop rule
        // this would have been three sweeps deep.
        expect(worker.postMessage).toHaveBeenCalledTimes(2);
        expect(worker.postMessage.mock.calls[1][0].scenario.target.name).toBe('C');
        expect(sweepSchedulerStats().queued).toBe(0);
    });

    it('lets a cancelled in-flight sweep finish and fill the cache', async () => {
        const subscription = requestSweep(LONDON, 0, collect().listener);
        const worker = MockWorker.instances[0];
        subscription.cancel();
        worker.reply(0, sweepOf('finished anyway'));

        const later = collect();
        requestSweep(LONDON, 0, later.listener);
        await Promise.resolve();
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        expect(later.outcomes[0]?.ok && later.outcomes[0].sweep.warnings)
            .toEqual(['finished anyway']);
    });
});

describe('sweepScheduler failures', () => {
    it('reports an engine exception as a Worker engine error', () => {
        const target = collect();
        requestSweep(LONDON, 0, target.listener);
        MockWorker.instances[0].replyWithEngineError(0, 'ladder is empty');

        const outcome = target.outcomes[0];
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.cause).toEqual({
            path: 'Worker', kind: 'engine error', message: 'ladder is empty',
        });
    });

    it('reports a crash as a Worker runtime error even with no message', () => {
        const target = collect();
        requestSweep(LONDON, 0, target.listener);
        MockWorker.instances[0].crash();

        const outcome = target.outcomes[0];
        expect(outcome.ok).toBe(false);
        expect(!outcome.ok && outcome.cause.path).toBe('Worker');
        expect(!outcome.ok && outcome.cause.kind).toBe('runtime error');
    });

    it('discards the crashed Worker so the next request gets a fresh one', () => {
        requestSweep(LONDON, 0, collect().listener);
        MockWorker.instances[0].crash();
        expect(MockWorker.instances[0].terminate).toHaveBeenCalled();

        requestSweep(SINGAPORE, 0, collect().listener);
        expect(MockWorker.instances).toHaveLength(2);
        expect(MockWorker.instances[1].postMessage).toHaveBeenCalledTimes(1);
    });

    it('re-runs the interrupted sweep on a rebuilt Worker when retried', () => {
        const target = collect();
        requestSweep(LONDON, 0, target.listener);
        restartSweepWorker();

        expect(MockWorker.instances).toHaveLength(2);
        const rebuilt = MockWorker.instances[1];
        expect(rebuilt.postMessage).toHaveBeenCalledTimes(1);
        expect(rebuilt.postMessage.mock.calls[0][0].scenario.target.name).toBe('London');

        rebuilt.reply(0, sweepOf('recovered'));
        expect(target.outcomes[0]?.ok).toBe(true);
    });

    it('keeps every other measured curve when one target is retried', async () => {
        requestSweep(SINGAPORE, 0, collect().listener);
        MockWorker.instances[0].reply(0, sweepOf('singapore'));
        expect(sweepSchedulerStats().cached).toBe(1);

        restartSweepWorker();
        const reused = collect();
        requestSweep(SINGAPORE, 0, reused.listener);
        await Promise.resolve();
        expect(reused.outcomes[0]?.ok && reused.outcomes[0].sweep.warnings)
            .toEqual(['singapore']);
    });
});

describe('sweepScheduler worker priming', () => {
    it('reports Worker availability before any sweep is dispatched', () => {
        expect(primeSweepWorker()).toBe(true);
        expect(MockWorker.instances).toHaveLength(1);
        expect(isSweepWorkerUnavailable()).toBe(false);
    });

    /*
     * The degraded-mode notice is a PRE-meeting warning. If the absence of
     * Workers were only discovered on the first dispatch, it would appear after
     * the ~25 s main-thread freeze it exists to announce.
     */
    it('reports the absence of Workers before the first main-thread run', () => {
        globalThis.Worker = (function BrokenWorker() {
            throw new Error('module workers unavailable');
        }) as unknown as typeof Worker;

        expect(primeSweepWorker()).toBe(false);
        expect(isSweepWorkerUnavailable()).toBe(true);
    });
});

describe('sweepScheduler presets', () => {
    it('keys the shipped target presets apart', () => {
        const keys = TARGET_PRESETS.map((target) => physicalSweepKey({ ...LONDON, target }));
        expect(new Set(keys).size).toBe(TARGET_PRESETS.length);
    });
});
