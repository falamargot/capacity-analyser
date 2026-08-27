// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClockProvider } from '../../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../../time/SimulationClock';
import type { RevisitAnalysis } from '../analysis/runScenario';
import { defaultScenario, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';
import {
    useRevisitAnalysis, type UseRevisitAnalysisResult,
} from '../hooks/useRevisitAnalysis';
import type { RevisitWorkerInput, RevisitWorkerOutput } from '../workers/revisitProtocol';

class MockWorker {
    static instances: MockWorker[] = [];
    readonly postMessage = vi.fn<(message: RevisitWorkerInput) => void>();
    readonly terminate = vi.fn();
    private listeners = new Map<string, Array<EventListenerOrEventListenerObject>>();

    constructor() {
        MockWorker.instances.push(this);
    }

    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push(listener);
        this.listeners.set(type, listeners);
    }

    emitMessage(message: RevisitWorkerOutput) {
        const event = { data: message } as MessageEvent<RevisitWorkerOutput>;
        for (const listener of this.listeners.get('message') ?? []) {
            if (typeof listener === 'function') listener(event);
            else listener.handleEvent(event);
        }
    }
}

let root: Root | null = null;
let container: HTMLDivElement;
let originalWorker: typeof Worker;
let latest: UseRevisitAnalysisResult | null = null;

function Harness({ scenario }: { scenario: RevisitScenario }) {
    latest = useRevisitAnalysis(scenario, { debounceMs: 20 });
    return <output>{latest.analysis?.scenario.target.name ?? 'empty'}</output>;
}

function analysisFor(scenario: RevisitScenario): RevisitAnalysis {
    // The hook treats the engine result as an opaque value. Only the scenario is
    // needed here to distinguish the late response from the current one.
    return { scenario } as RevisitAnalysis;
}

beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    originalWorker = globalThis.Worker;
    globalThis.Worker = MockWorker as unknown as typeof Worker;
    MockWorker.instances = [];
    latest = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    globalThis.Worker = originalWorker;
    vi.useRealTimers();
    document.body.replaceChildren();
});

describe('useRevisitAnalysis freshness', () => {
    it('rejects target A when its response lands during target B debounce', async () => {
        const scenarioA = defaultScenario(Date.UTC(2026, 7, 26));
        const singapore = TARGET_PRESETS.find((target) => target.name === 'Singapore')!;
        const scenarioB = { ...scenarioA, target: singapore };
        const clock = createSimulationClock({ now: () => scenarioA.window.startMs });
        const render = async (scenario: RevisitScenario) => act(async () => root?.render(
            <SimulationClockProvider clock={clock}>
                <Harness scenario={scenario} />
            </SimulationClockProvider>
        ));

        await render(scenarioA);
        await act(async () => vi.advanceTimersByTimeAsync(20));
        const worker = MockWorker.instances[0];
        const requestA = worker.postMessage.mock.calls[0][0];
        expect(requestA.type).toBe('analyse');

        await render(scenarioB);
        expect(latest?.analysis).toBeNull();

        await act(async () => worker.emitMessage({
            kind: 'analyse', ok: true,
            requestId: requestA.requestId,
            timelineRevision: requestA.timelineRevision,
            computeMs: 1,
            analysis: analysisFor(scenarioA),
        }));
        expect(latest?.analysis).toBeNull();
        expect(latest?.isComputing).toBe(true);

        await act(async () => vi.advanceTimersByTimeAsync(20));
        const requestB = worker.postMessage.mock.calls[1][0];
        await act(async () => worker.emitMessage({
            kind: 'analyse', ok: true,
            requestId: requestB.requestId,
            timelineRevision: requestB.timelineRevision,
            computeMs: 1,
            analysis: analysisFor(scenarioB),
        }));

        expect(latest?.analysis?.scenario.target.name).toBe('Singapore');
        expect(latest?.isComputing).toBe(false);
    });
});
