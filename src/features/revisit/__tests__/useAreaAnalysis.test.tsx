// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClockProvider } from '../../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../../time/SimulationClock';
import { useAreaAnalysis, type UseAreaAnalysisResult } from '../hooks/useAreaAnalysis';
import { areaForPreset, AREA_PRESETS } from '../domain/areaPresets';
import { defaultScenario } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';

class MockWorker {
    static instances: MockWorker[] = [];
    readonly postMessage = vi.fn();
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
}

let root: Root | null = null;
let container: HTMLDivElement;
let originalWorker: typeof Worker;
let latest: UseAreaAnalysisResult | null = null;

function Harness({ scenario }: { scenario: RevisitScenario }) {
    latest = useAreaAnalysis(scenario);
    return <output>{latest.isRunning ? 'running' : 'idle'}</output>;
}

beforeEach(() => {
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
    document.body.replaceChildren();
});

describe('useAreaAnalysis cancellation', () => {
    it('terminates obsolete work on scenario change, clear and unmount', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 6));
        const clock = createSimulationClock({ now: () => scenario.window.startMs });
        const area = areaForPreset(AREA_PRESETS[0], scenario.reference, scenario.payload);
        const render = async (value: RevisitScenario) => act(async () => root?.render(
            <SimulationClockProvider clock={clock}>
                <Harness scenario={value} />
            </SimulationClockProvider>
        ));

        await render(scenario);
        expect(MockWorker.instances).toHaveLength(1);

        await act(async () => latest?.run(area));
        expect(MockWorker.instances[0].postMessage).toHaveBeenCalledOnce();

        await render({
            ...scenario,
            payload: { ...scenario.payload, halfAngle1Deg: scenario.payload.halfAngle1Deg + 0.1 },
        });
        expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
        expect(MockWorker.instances).toHaveLength(2);

        await act(async () => latest?.run(area));
        await act(async () => latest?.clear());
        expect(MockWorker.instances[1].terminate).toHaveBeenCalledOnce();
        expect(MockWorker.instances).toHaveLength(3);

        await act(async () => root?.unmount());
        root = null;
        expect(MockWorker.instances[2].terminate).toHaveBeenCalledOnce();
    });
});
