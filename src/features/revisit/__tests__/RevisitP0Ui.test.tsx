// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import { RevisitHeader } from '../ui/RevisitHeader';
import { CoverageRibbon } from '../ui/CoverageRibbon';
import { ModelProvenance } from '../ui/ModelProvenance';
import { referenceProfileFor } from '../domain/referenceProfiles';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

describe('REVISIT P0 presentation UI', () => {
    it('states the complete OneWeb fleet truth in the scenario rail', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                spreadNote={null}
            />
        ));

        expect(container.textContent).toContain('576 active + 58 spare · 634 total');
    });

    it('keeps model evidence collapsed behind a positive compact badge', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <ModelProvenance
                reference={scenario.reference}
                profile={referenceProfileFor(scenario.reference)}
                fit={null}
                isRunning={false}
                error={null}
                onCalibrate={() => undefined}
                onAdoptFit={() => undefined}
            />
        ));

        const details = container.querySelector('details');
        expect(details?.open).toBe(false);
        expect(container.textContent).toContain('Validated model');
        expect(container.textContent).toContain('live-TLE fit optional');
        expect(container.textContent).not.toContain('not yet calibrated');
    });

    it('offers play, pause, stepping, speed and an absolute UTC timestamp', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        const onSeek = vi.fn();
        const onSetSpeed = vi.fn();
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={onSeek}
                speed={0}
                onSetSpeed={onSetSpeed}
            />
        ));

        expect(container.textContent).toContain('2026-08-12 12:00:00 UTC');
        const buttons = [...container.querySelectorAll('button')];
        await act(async () => buttons.find((button) => button.textContent === 'Play')!.click());
        expect(onSetSpeed).toHaveBeenCalledWith(1);
        await act(async () => buttons.find((button) => button.textContent === '+1 h')!.click());
        expect(onSeek).toHaveBeenCalledWith(startMs + 3600_000);

        const speed = container.querySelector('select[aria-label="Simulation speed"]') as HTMLSelectElement;
        speed.value = '100';
        await act(async () => speed.dispatchEvent(new Event('change', { bubbles: true })));
        expect(onSetSpeed).toHaveBeenCalledWith(100);
    });

    /**
     * The seek surface used to wrap the lane rows, so the `role="slider"`
     * contained the per-lane buttons — a nested interactive control, which the
     * Axe gate rejects and screen readers do not reliably announce. It is now a
     * sibling overlay carrying only the playhead.
     */
    it('keeps the seek slider free of nested interactive controls', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                pointLanes={[
                    {
                        id: 'REFERENCE', label: 'Reference · London', name: 'London',
                        intervals: [], statistics: null, selected: true,
                    },
                    {
                        id: 'comparison-1', label: 'Compare 1 · Singapore', name: 'Singapore',
                        intervals: [], statistics: null,
                    },
                ]}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
            />
        ));

        const slider = container.querySelector('[role="slider"]') as HTMLElement;
        expect(slider).not.toBeNull();
        expect(slider.querySelectorAll('button, a, input, select, [tabindex]')).toHaveLength(0);
        // The lane buttons still exist — they moved out of the slider, not away.
        expect([...container.querySelectorAll('button')].map((button) => button.textContent))
            .toEqual(expect.arrayContaining(['Reference · London', 'Compare 1 · Singapore']));
        // Nothing may hide the slider from assistive technology.
        expect(slider.closest('[aria-hidden="true"]')).toBeNull();
    });
});
