// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import type { GapStatistics } from '../domain/types';
import { AdvancedDrawer } from '../ui/AdvancedDrawer';
import { RevisitHeader } from '../ui/RevisitHeader';
import { RevisitKpiPanel } from '../ui/RevisitKpiPanel';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
});

function change(element: HTMLInputElement | HTMLSelectElement, value: string): void {
    const prototype = element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('REVISIT P1 functional UI', () => {
    it('exposes the illustrative swath presets and bounded coordinate entry', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onInstrumentPresetChange = vi.fn();
        const onTargetCoordinatesChange = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                onInstrumentPresetChange={onInstrumentPresetChange}
                onTargetCoordinatesChange={onTargetCoordinatesChange}
                spreadNote="4 planes × 3 per plane"
            />
        ));

        expect(container.textContent).toContain('Illustrative EO/IR preset');
        const preset = container.querySelector('[aria-label="Instrument preset"]') as HTMLSelectElement;
        await act(async () => change(preset, 'WIDE'));
        expect(onInstrumentPresetChange).toHaveBeenCalledWith('WIDE');

        const locationButton = container.querySelector('[aria-label="Set reference location"]') as HTMLButtonElement;
        await act(async () => locationButton.click());
        const latitude = container.querySelector('[aria-label="Target latitude"]') as HTMLInputElement;
        const longitude = container.querySelector('[aria-label="Target longitude"]') as HTMLInputElement;
        await act(async () => {
            change(latitude, '48.86');
            change(longitude, '2.35');
        });
        const applyCoordinates = [...container.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Apply coordinates'))!;
        await act(async () => applyCoordinates.click());
        expect(onTargetCoordinatesChange).toHaveBeenCalledWith(48.86, 2.35, undefined);
    });

    it('keeps manual location editors inside each point row', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onSecondaryPointChange = vi.fn();
        const onSecondaryPointTargetChange = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London', 'Singapore']}
                onTargetChange={() => undefined}
                onTargetCoordinatesChange={() => undefined}
                comparisonPoints={[{
                    id: 'comparison-1',
                    target: { kind: 'POINT', name: 'Custom point', latDeg: 40, lonDeg: 5 },
                }]}
                onSecondaryPointChange={onSecondaryPointChange}
                onSecondaryPointTargetChange={onSecondaryPointTargetChange}
                spreadNote={null}
            />
        ));

        expect(container.textContent).not.toContain('Click: move reference');
        const locationButtons = [...container.querySelectorAll('[aria-haspopup="dialog"][aria-label$="location"]')];
        expect(locationButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
            'Set reference location',
            'Set comparison 1 location',
        ]);

        await act(async () => (locationButtons[1] as HTMLButtonElement).click());
        const openMenu = container.querySelector('[role="dialog"]')!;
        const latitude = openMenu.querySelector('[aria-label="Comparison 1 latitude"]') as HTMLInputElement;
        const longitude = openMenu.querySelector('[aria-label="Comparison 1 longitude"]') as HTMLInputElement;
        await act(async () => {
            change(latitude, '41.5');
            change(longitude, '6.25');
        });
        const apply = [...openMenu.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Apply coordinates'))!;
        await act(async () => apply.click());
        expect(onSecondaryPointChange).toHaveBeenCalledWith('comparison-1', 41.5, 6.25, undefined);

        const targetPreset = container.querySelector('[aria-label="Comparison 1 target"]') as HTMLSelectElement;
        await act(async () => change(targetPreset, 'Singapore'));
        expect(onSecondaryPointTargetChange).toHaveBeenCalledWith('comparison-1', 'Singapore');
    });

    it('stages complete FOV geometry and applies it once', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onChange = vi.fn();
        await act(async () => root?.render(
            <AdvancedDrawer scenario={scenario} onChange={onChange} />
        ));
        await act(async () => (
            container.querySelector('[aria-label="Expand Advanced"]') as HTMLButtonElement
        ).click());

        const shape = container.querySelector('[aria-label="FOV shape"]') as HTMLSelectElement;
        const along = container.querySelector('[aria-label="Along-track bias"]') as HTMLInputElement;
        await act(async () => {
            change(shape, 'RECTANGLE');
            change(along, '4');
        });
        expect(onChange).not.toHaveBeenCalled();

        const apply = [...container.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Apply geometry'))!;
        await act(async () => apply.click());
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].payload.shape).toBe('RECTANGLE');
        expect(onChange.mock.calls[0][0].payload.biasDeg.alongTrack).toBe(4);
    });

    it('turns the KPI into a truthful comparison without replacing worst-case', async () => {
        const statistics: GapStatistics = {
            maxGapMs: 3 * 3600_000,
            meanGapMs: 2 * 3600_000,
            p95GapMs: 2.8 * 3600_000,
            accessCount: 12,
            fractionInView: 0.1,
            meanAccessDurationMs: 60_000,
            totalInViewMs: 3600_000,
            interiorGapCount: 10,
            boundaryGapsDiscarded: 2,
            coverage: 'INTERMITTENT',
            warnings: [],
        };
        await act(async () => root?.render(
            <RevisitKpiPanel
                statistics={statistics}
                windowHours={72}
                requirementMs={2 * 3600_000}
                isComputing={false}
                comparison={{
                    baselineMaxGapMs: 12 * 3600_000,
                    currentPayloadCount: 12,
                    targetPayloadCount: 36,
                }}
            />
        ));
        expect(container.textContent).toContain('Worst case');
        expect(container.textContent).toContain('75% shorter worst-case');
        expect(container.textContent).toContain('+24 payloads');
    });
});
