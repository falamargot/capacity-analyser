// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import { RevisitHeader } from '../ui/RevisitHeader';
import { CoverageRibbon } from '../ui/CoverageRibbon';
import { ModelProvenance } from '../ui/ModelProvenance';
import { referenceProfileFor } from '../domain/referenceProfiles';
import type { GapStatistics } from '../domain/types';

let root: Root | null = null;
let container: HTMLDivElement;

const gapStatistics = (maxGapMs: number): GapStatistics => ({
    maxGapMs,
    meanGapMs: maxGapMs / 2,
    p95GapMs: maxGapMs,
    accessCount: 2,
    fractionInView: 0.1,
    meanAccessDurationMs: 3600_000,
    totalInViewMs: 2 * 3600_000,
    interiorGapCount: 1,
    boundaryGapsDiscarded: 2,
    warnings: [],
    coverage: 'INTERMITTENT',
});

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

    it('states the engine claims and the selected model, without a fit claim', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <ModelProvenance
                mode="HLD"
                profile={referenceProfileFor(scenario.reference)}
                fit={null}
            />
        ));

        // Engine claims hold for every model and must always be stated.
        expect(container.textContent).toContain('Propagation cross-checked vs NASA GMAT');
        expect(container.textContent).toContain('WGS84 ellipsoid');
        expect(container.textContent).toContain('OneWeb Gen1 (HLD reference)');

        // No fit has been run, so nothing may imply the fleet was measured.
        expect(container.textContent).not.toContain('Real fleet vs perfect shell');
        expect(container.textContent).not.toContain('RMS along-track');
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

        const dateTime = container.querySelector('[aria-label="Simulation date and time UTC"]') as HTMLInputElement;
        expect(dateTime.value).toBe('2026-08-12T12:00');
        expect(dateTime.min).toBe('2026-08-12T12:00:00');
        expect(dateTime.max).toBe('2026-08-15T12:00:00');
        const buttons = [...container.querySelectorAll('button')];
        await act(async () => buttons.find((button) => button.textContent === 'Play')!.click());
        expect(onSetSpeed).toHaveBeenCalledWith(1);
        await act(async () => buttons.find((button) => button.textContent === '+1 h')!.click());
        expect(onSeek).toHaveBeenCalledWith(startMs + 3600_000);

        const speed = container.querySelector('select[aria-label="Simulation speed"]') as HTMLSelectElement;
        speed.value = '100';
        await act(async () => speed.dispatchEvent(new Event('change', { bubbles: true })));
        expect(onSetSpeed).toHaveBeenCalledWith(100);

        dateTime.value = '2026-08-13T06:30:00';
        await act(async () => dateTime.dispatchEvent(new Event('change', { bubbles: true })));
        expect(onSetSpeed).toHaveBeenCalledWith(0);
        expect(onSeek).toHaveBeenCalledWith(Date.UTC(2026, 7, 13, 6, 30));
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

    it('carries the selected point emphasis across the timeline and comparison sidecar', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        const onSelectPoint = vi.fn();
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                pointLanes={[
                    {
                        id: 'REFERENCE', label: 'Reference · London', name: 'London',
                        intervals: [], statistics: null,
                    },
                    {
                        id: 'comparison-1', label: 'Compare 1 · Singapore', name: 'Singapore',
                        intervals: [], statistics: null, selected: true,
                    },
                ]}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
                onSelectPoint={onSelectPoint}
            />
        ));

        const selectedTimeline = container.querySelector('[data-revisit-timeline-lane="comparison-1"]')!;
        const selectedSidecar = container.querySelector('[data-revisit-comparison-row="comparison-1"]')!;
        expect(selectedTimeline.className).toContain('border-sky-300/60');
        expect(selectedSidecar.className).toContain('border-sky-300/60');
        expect(selectedTimeline.querySelector('svg')?.getAttribute('class')).toContain('opacity-100');
        expect(container.querySelector('[data-revisit-timeline-lane="REFERENCE"] svg')?.getAttribute('class'))
            .toContain('opacity-75');

        // Any comparison cell, not only its target-name button, selects the row.
        await act(async () => (selectedSidecar.lastElementChild as HTMLElement).click());
        expect(onSelectPoint).toHaveBeenCalledWith('comparison-1');
    });

    it('uses orange for finite misses while keeping compliant gaps green or target-coloured', async () => {
        const startMs = Date.UTC(2026, 7, 12, 0);
        const hour = 3600_000;
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Reference', basisLabel: 'Point',
                        label: 'Reference · London', name: 'London', selected: true,
                        intervals: [
                            { startMs: startMs + hour, endMs: startMs + 2 * hour, satelliteIds: ['sat-1'], clippedAtStart: false, clippedAtEnd: false },
                            { startMs: startMs + 5 * hour, endMs: startMs + 6 * hour, satelliteIds: ['sat-1'], clippedAtStart: false, clippedAtEnd: false },
                        ],
                        statistics: gapStatistics(3 * hour),
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Comparison · Singapore', name: 'Singapore',
                        intervals: [
                            { startMs: startMs + hour, endMs: startMs + 2 * hour, satelliteIds: ['sat-2'], clippedAtStart: false, clippedAtEnd: false },
                            { startMs: startMs + 3 * hour, endMs: startMs + 4 * hour, satelliteIds: ['sat-2'], clippedAtStart: false, clippedAtEnd: false },
                        ],
                        statistics: gapStatistics(hour),
                    },
                ]}
                requirementMs={2 * hour}
                windowStartMs={startMs}
                windowHours={8}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
            />
        ));

        const missRow = container.querySelector('[data-revisit-comparison-row="REFERENCE"]');
        const meetRow = container.querySelector('[data-revisit-comparison-row="comparison-1"]');
        expect(missRow?.lastElementChild?.className).toContain('text-orange-300');
        expect(meetRow?.lastElementChild?.className).toContain('text-lime-300');
        expect(container.querySelector('[data-revisit-gap-outcome="misses"]')
            ?.getAttribute('stroke')).toBe('#F97316');
        expect(container.querySelector('[data-revisit-gap-outcome="meets"]')
            ?.getAttribute('stroke')).toBe('#38BDF8');
    });

    /*
     * A failed target comparison used to raise the presentation-wide blocking
     * notice, stopping the demonstration over a background calculation. It is
     * stated here instead — and it must be stated SOMEWHERE: when the notice
     * stopped carrying it, the only other render site was a table that is no
     * longer mounted anywhere, so the failure became invisible.
     */
    it('states a failed comparison in the comparison block without a banner', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Reference', basisLabel: 'Point',
                        label: 'Reference · London', name: 'London', intervals: [], statistics: null,
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Comparison · Singapore', name: 'Singapore', intervals: [], statistics: null,
                    },
                ]}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
                comparisonError={'Comparison set · Target comparison · Worker runtime error'}
            />
        ));

        expect(container.textContent).toContain('Unavailable');
        expect(container.textContent).toContain('Comparison unavailable');
        // Stated in place, not as an alert over the whole screen.
        expect(container.querySelector('[role="alert"]')).toBeNull();
        // The engineering text stays reachable without occupying a row.
        expect(container.querySelector('[title*="Worker runtime error"]')).not.toBeNull();
    });

    it('shows the computing state when the comparison has not failed', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Reference', basisLabel: 'Point',
                        label: 'Reference · London', name: 'London', intervals: [], statistics: null,
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Comparison · Singapore', name: 'Singapore', intervals: [], statistics: null,
                    },
                ]}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
                comparisonIsComputing
            />
        ));

        expect(container.textContent).toContain('Computing…');
        expect(container.textContent).not.toContain('Unavailable');
        expect(container.textContent).toContain('Same topology, FOV and requirement');
    });

    it('compares Point and Area on the shared contractual gap without mixing means', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        const onSelectTarget = vi.fn();
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Primary', basisLabel: 'Point',
                        label: 'Primary · London', name: 'London', intervals: [], statistics: null,
                    },
                    {
                        id: 'AREA_TARGET', kind: 'AREA', roleLabel: 'Secondary 1', basisLabel: 'Least-covered cell',
                        label: 'Secondary 1 · North Sea · worst cell', name: 'North Sea',
                        intervals: [], statistics: null, statusLabel: 'Select to analyse', selected: true,
                    },
                ]}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
                onSelectTarget={onSelectTarget}
            />
        ));

        expect(container.textContent).toContain('Point lanes + Area worst-cell lane');
        expect(container.textContent).toContain('Maximum gap');
        expect(container.textContent).toContain('Least-covered cell');
        expect(container.textContent).not.toContain('Mean');
        const compactComparison = [...container.querySelectorAll('details')]
            .find((details) => details.textContent?.includes('Compare targets')) as HTMLDetailsElement;
        expect(compactComparison).not.toBeNull();
        expect(compactComparison.open).toBe(false);
        expect(compactComparison.className).toContain('lg:hidden');
        const areaRow = container.querySelector('[data-revisit-comparison-row="AREA_TARGET"]') as HTMLElement;
        expect(areaRow.className).toContain('border-sky-300/60');
        await act(async () => areaRow.click());
        expect(onSelectTarget).toHaveBeenCalledWith('AREA_TARGET');
    });
});
