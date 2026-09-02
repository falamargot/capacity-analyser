// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import { RevisitHeader } from '../ui/RevisitHeader';
import { CoverageRibbon } from '../ui/CoverageRibbon';
import { TleComparisonDialog } from '../ui/TleComparisonDialog';
import { AnalysisWindowControl } from '../ui/AnalysisWindowControl';
import type { GapStatistics } from '../domain/types';
import { REVISIT_COLORS } from '../ui/revisitTheme';

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

    /*
     * D2 (2026-08-29). The live-TLE fit is a diagnostic, never the analysed
     * model, and it now lives on its own surface. Two properties are pinned
     * here because losing either recreates a defect that shipped:
     *
     *  - the fitted topology and its deltas must be present. Without them the
     *    panel showed `645 real satellites` and `248 km RMS` beside a
     *    Characteristics block reading 12 × 48, and the residual had no subject.
     *  - the source and the instant must be present. The fetchTLE ladder
     *    degrades silently, so two measurements minutes apart can legitimately
     *    disagree; unexplained, that reads as an unreliable tool.
     */
    it('reports the fitted shell, its deltas, and what it was measured from', async () => {
        await act(async () => root?.render(
            <TleComparisonDialog
                fit={{
                    // A fit never reproduces the ladder, the seam or the spares;
                    // 12 × 53 is what the real catalogue yielded on 2026-08-29.
                    spec: {
                        pattern: 'STAR', planes: 12, satsPerPlane: 53,
                        inclinationDeg: 87.88, altitudeKm: 1198.9,
                        phasingF: 1, fudge: 1,
                    },
                    satellitesUsed: 636,
                    satellitesExcluded: 9,
                    planesDetected: 12,
                    planePopulations: [53],
                    raanRmsDeg: 0.06,
                    argLatRmsDeg: 1.88,
                    altitudeRmsKm: 13.9,
                    inclinationRmsDeg: 0.02,
                    alongTrackRmsKm: 248,
                    notes: ['9 satellites were more than 25 km off the median shell'],
                }}
                provenance={{
                    source: 'bundled',
                    retrievedAtMs: Date.UTC(2026, 7, 29, 8, 55),
                    catalogueSatellites: 645,
                    epochRangeMs: {
                        earliestMs: Date.UTC(2026, 7, 28, 18, 0),
                        latestMs: Date.UTC(2026, 7, 29, 6, 30),
                    },
                }}
                analysedSpec={defaultScenario(Date.UTC(2026, 7, 12)).reference}
                mode="HLD"
                isRunning={false}
                error={null}
                onReMeasure={() => undefined}
                onAdoptFittedShell={() => undefined}
                onClose={() => undefined}
            />
        ));

        // Portalled to the body, so read the document rather than the container.
        const text = document.body.textContent ?? '';

        // It denies being the analysed model, at the top and not in a footnote.
        expect(text).toContain('TLE shell characterisation');
        expect(text).toContain('Nothing here changes the analysed constellation');

        // The fit, with a subject: the comparison names the model it is against.
        expect(text).toContain('12 × 53');
        expect(text).toContain('vs HLD');
        expect(text).toContain('+5 sats/plane');
        expect(text).toContain('+60 total');
        expect(text).toContain('248 km');
        expect(text).toContain('not trajectory-validated');

        // What it was measured from. The bundled file must never read as live.
        expect(text).toContain('file bundled with this build');
        expect(text).not.toContain('CelesTrak, live');
        expect(text).toContain('2026-08-29 08:55 UTC');
        expect(text).toContain('645 OneWeb objects');
        expect(text).toContain('Re-measuring can return different figures');
    });

    /*
     * The comparison follows the analysed model. Pinned because the previous
     * behaviour — always comparing to the HLD — was reported as a bug: someone
     * editing a 17 × 37 shell saw `vs HLD 12 × 48` and concluded the panel had
     * not registered their edits.
     *
     * The weight of the differing figures is pinned with it: bold is what makes
     * "what is different" answerable without reading four numbers.
     */
    it('compares against the edited model, and weights what differs', async () => {
        const edited = {
            ...defaultScenario(Date.UTC(2026, 7, 12)).reference,
            planes: 17, satsPerPlane: 37,
        };
        await act(async () => root?.render(
            <TleComparisonDialog
                fit={{
                    spec: {
                        pattern: 'STAR', planes: 12, satsPerPlane: 53,
                        inclinationDeg: 87.9, altitudeKm: 1198.9,
                        phasingF: 1, fudge: 1,
                    },
                    satellitesUsed: 636, satellitesExcluded: 9, planesDetected: 12,
                    planePopulations: [53], raanRmsDeg: 0.06, argLatRmsDeg: 1.88,
                    altitudeRmsKm: 13.9, inclinationRmsDeg: 0.02, alongTrackRmsKm: 248,
                    notes: [],
                }}
                provenance={null}
                analysedSpec={edited}
                mode="CUSTOM"
                isRunning={false}
                error={null}
                onReMeasure={() => undefined}
                onAdoptFittedShell={() => undefined}
                onClose={() => undefined}
            />
        ));

        const text = document.body.textContent ?? '';
        expect(text).toContain('vs your model');
        expect(text).toContain('17 × 37');
        expect(text).toContain('\u22125 planes');
        expect(text).toContain('+16 sats/plane');

        // Planes, sats/plane and altitude differ; the inclination does not.
        const bold = [...document.querySelectorAll('.font-bold')].map((e) => e.textContent);
        expect(bold).toEqual(['12', '53', '1198.9 km']);

        // Adoption is offered in CUSTOM, where the fields are writable, and it
        // lands in Custom HLD — never as a model.
        expect([...document.querySelectorAll('button')]
            .some((button) => button.textContent === 'Use fitted shell')).toBe(true);
    });

    /*
     * Non-modality is load-bearing, not a style choice: the reader compares
     * `12 × 53` in this panel against `12 × 48` in the settings panel behind it,
     * and a modal turns that into a memory exercise. Two things carry it, and
     * both are pinned here because breaking either is invisible until someone
     * demonstrates the tool:
     *
     *  - no `aria-modal`, so assistive technology does not hide the rest;
     *  - `data-revisit-panel-flyout`, which `RevisitHeader.useClickOutside`
     *    treats as inside the constellation panel. Without it, the first click
     *    into this flyout dismisses the panel it is explaining.
     */
    it('is a non-modal flyout that the constellation panel treats as its own', async () => {
        await act(async () => root?.render(
            <TleComparisonDialog
                fit={null}
                provenance={null}
                analysedSpec={defaultScenario(Date.UTC(2026, 7, 12)).reference}
                mode="HLD"
                isRunning
                error={null}
                onReMeasure={() => undefined}
                onAdoptFittedShell={() => undefined}
                onClose={() => undefined}
            />
        ));

        const root_ = document.querySelector('[data-testid="tle-comparison-dialog"]');
        expect(root_?.hasAttribute('data-revisit-panel-flyout')).toBe(true);
        expect(document.querySelector('[aria-modal="true"]')).toBeNull();
    });

    /* The measurement is reversible: it can be closed, by three routes. */
    it('closes on Escape, on the backdrop and on its own buttons', async () => {
        const onClose = vi.fn();
        await act(async () => root?.render(
            <TleComparisonDialog
                fit={null}
                provenance={null}
                analysedSpec={defaultScenario(Date.UTC(2026, 7, 12)).reference}
                mode="HLD"
                isRunning
                error={null}
                onReMeasure={() => undefined}
                onAdoptFittedShell={() => undefined}
                onClose={onClose}
            />
        ));

        expect(document.body.textContent).toContain('Measuring…');

        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        });
        expect(onClose).toHaveBeenCalledTimes(1);

        const backdrop = document.querySelector<HTMLButtonElement>(
            '[aria-label="Dismiss TLE comparison"]'
        );
        await act(async () => backdrop?.click());
        expect(onClose).toHaveBeenCalledTimes(2);

        const close = [...document.querySelectorAll('button')]
            .find((button) => button.textContent === 'Close');
        await act(async () => close?.click());
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    /*
     * The analysis window left Constellation settings for the coverage ribbon,
     * beside the axis the duration defines. Two things are pinned:
     *
     *  - the collapsed summary states both values, so the window can be checked
     *    without opening anything — it is a demonstration surface;
     *  - the engine's own warnings surface here. A step above 60 s can miss
     *    whole passes and the revisit figure then comes out too large with no
     *    error anywhere, so the one place that edits it must say so.
     */
    it('summarises the analysis window and carries the engine\'s warnings', async () => {
        const onChange = vi.fn();
        await act(async () => root?.render(
            <AnalysisWindowControl
                window={{ startMs: Date.UTC(2026, 7, 12), durationHours: 72, stepSeconds: 10 }}
                onChange={onChange}
            />
        ));
        expect(container.textContent).toContain('72 h window');
        expect(container.textContent).not.toContain('72 h · 10 s');

        const open = () => container.querySelector<HTMLButtonElement>(
            '[aria-label="Analysis window settings"]'
        )!;
        await act(async () => open().click());
        const step = document.querySelector<HTMLInputElement>('input[aria-label="Step s"]')!;
        expect(step.value).toBe('10');

        // A coarse step is not refused — it is stated. The engine's own
        // validateWindow supplies the wording, so the two cannot drift apart.
        await act(async () => root?.render(
            <AnalysisWindowControl
                window={{ startMs: Date.UTC(2026, 7, 12), durationHours: 12, stepSeconds: 90 }}
                onChange={onChange}
            />
        ));
        const text = document.body.textContent ?? '';
        expect(text).toContain('can miss passes entirely');
        expect(text).toContain('the revisit figure is confidently wrong');
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

    it('keeps the requirement verdict visible for a single target', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={gapStatistics(3 * 3600_000)}
                windowStartMs={startMs}
                windowHours={72}
                getTimeMs={() => startMs}
                onSeek={() => undefined}
                speed={0}
                onSetSpeed={() => undefined}
                requirementMs={2 * 3600_000}
            />
        ));

        const result = container.querySelector('[data-revisit-lane-result="REFERENCE"]')!;
        expect(result.textContent).toContain('3 h');
        expect(result.textContent).toContain('MISSES');
        expect(result.querySelector('[data-revisit-lane-verdict]')?.className)
            .toContain('text-red-300');
    });

    /*
     * R32 — the in-view band behind an Area lane.
     *
     * The two things that must hold are not "it renders": the band has to stay
     * a BACKGROUND (painted under the access ticks, in the lane's own colour,
     * at an opacity no full bin can push into tick territory) and it must not
     * appear on a Point lane, which has no such quantity.
     */
    it('paints the in-view band under an Area lane only, and keeps it a background', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        const profile = new Float32Array([0, 0.25, 1, 0.5]);
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Primary', basisLabel: 'Point',
                        label: 'Primary · London', name: 'London',
                        intervals: [], statistics: null, selected: true,
                    },
                    {
                        id: 'AREA_TARGET', kind: 'AREA', roleLabel: 'Secondary',
                        basisLabel: 'Least-covered cell',
                        label: 'Secondary · North Sea · least-covered cell', name: 'North Sea',
                        intervals: [], statistics: null, inViewProfile: profile,
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

        const pointLane = container.querySelector('[data-revisit-timeline-lane="REFERENCE"]')!;
        expect(pointLane.querySelector('[data-revisit-inview-band]')).toBeNull();

        const band = container
            .querySelector('[data-revisit-timeline-lane="AREA_TARGET"] [data-revisit-inview-band]')!;
        expect(band).not.toBeNull();
        // The empty bin is omitted rather than painted at zero opacity.
        const bins = [...band.querySelectorAll('rect')];
        expect(bins).toHaveLength(3);
        const opacities = bins.map((bin) => Number(bin.getAttribute('fill-opacity')));
        expect(opacities[0]).toBeLessThan(opacities[1]);
        expect(opacities[1]).toBeGreaterThan(opacities[2]);
        // A fully covered bin still sits well under the 0.94 access ticks.
        expect(Math.max(...opacities)).toBeLessThan(0.5);
        // The band carries target identity, never an outcome colour.
        expect(bins[0].getAttribute('fill')).toBe(REVISIT_COLORS.comparison);
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
                        id: 'REFERENCE', label: 'Primary · London', name: 'London',
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
            .toEqual(expect.arrayContaining(['Primary · London', 'Compare 1 · Singapore']));
        // Nothing may hide the slider from assistive technology.
        expect(slider.closest('[aria-hidden="true"]')).toBeNull();
    });

    it('carries the selected point emphasis across the unified comparison lanes', async () => {
        const startMs = Date.UTC(2026, 7, 12, 12);
        const onSelectPoint = vi.fn();
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                pointLanes={[
                    {
                        id: 'REFERENCE', label: 'Primary · London', name: 'London',
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
        const selectedComparisonRow = container.querySelector('[data-revisit-comparison-row="comparison-1"]')!;
        expect(selectedTimeline.className).toContain('border-sky-300/60');
        expect(selectedComparisonRow).toBe(selectedTimeline);
        expect(selectedTimeline.querySelector('svg')?.getAttribute('class')).toContain('opacity-100');
        expect(container.querySelector('[data-revisit-timeline-lane="REFERENCE"] svg')?.getAttribute('class'))
            .toContain('opacity-75');

        // The compact result at the end of the lane selects the same context.
        await act(async () => selectedComparisonRow
            .querySelector<HTMLElement>('[data-revisit-lane-result]')!.click());
        expect(onSelectPoint).toHaveBeenCalledWith('comparison-1');
    });

    it('paints the longest-gap outline in the outcome vocabulary: green meets, red misses', async () => {
        const startMs = Date.UTC(2026, 7, 12, 0);
        const hour = 3600_000;
        await act(async () => root?.render(
            <CoverageRibbon
                intervals={[]}
                statistics={null}
                targetLanes={[
                    {
                        id: 'REFERENCE', kind: 'POINT', roleLabel: 'Reference', basisLabel: 'Point',
                        label: 'Primary · London', name: 'London', selected: true,
                        intervals: [
                            { startMs: startMs + hour, endMs: startMs + 2 * hour, satelliteIds: ['sat-1'], clippedAtStart: false, clippedAtEnd: false },
                            { startMs: startMs + 5 * hour, endMs: startMs + 6 * hour, satelliteIds: ['sat-1'], clippedAtStart: false, clippedAtEnd: false },
                        ],
                        statistics: gapStatistics(3 * hour),
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Secondary · Singapore', name: 'Singapore',
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
        expect(missRow?.querySelector('[data-revisit-lane-verdict]')?.className).toContain('text-red-300');
        expect(meetRow?.querySelector('[data-revisit-lane-verdict]')?.className).toContain('text-lime-300');
        expect(container.querySelector('[data-revisit-gap-outcome="misses"]')
            ?.getAttribute('stroke')).toBe('#E24B4A');
        // Not the lane's identity colour (#38BDF8 here): amber and orange are
        // 12 degrees apart, so a passing Primary gap was indistinguishable from
        // a missing one on the element whose only job is to say which it is.
        expect(container.querySelector('[data-revisit-gap-outcome="meets"]')
            ?.getAttribute('stroke')).toBe('#C0DD97');
        const toolbar = container.querySelector('[data-revisit-timeline-toolbar]')!;
        expect(toolbar.textContent).toContain('Requirement ≤ 2 h');
        expect(toolbar.textContent).toContain('Longest gap · green meets, red misses');
        expect(toolbar.querySelector('[aria-label="Simulation time controls"]')).not.toBeNull();
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
                        label: 'Primary · London', name: 'London', intervals: [], statistics: null,
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Secondary · Singapore', name: 'Singapore', intervals: [], statistics: null,
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
                        label: 'Primary · London', name: 'London', intervals: [], statistics: null,
                    },
                    {
                        id: 'comparison-1', kind: 'POINT', roleLabel: 'Comparison', basisLabel: 'Point',
                        label: 'Secondary · Singapore', name: 'Singapore', intervals: [], statistics: null,
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
        expect(container.textContent).not.toContain('Comparison unavailable');
        expect(container.textContent).not.toContain('Compare targets');
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
        expect(container.querySelectorAll('[data-revisit-timeline-lane]')).toHaveLength(2);
        expect(container.querySelectorAll('[data-revisit-comparison-row]')).toHaveLength(2);
        expect(container.textContent).not.toContain('Compare targets');
        const areaRow = container.querySelector('[data-revisit-comparison-row="AREA_TARGET"]') as HTMLElement;
        expect(areaRow.className).toContain('border-sky-300/60');
        await act(async () => areaRow
            .querySelector<HTMLElement>('[data-revisit-lane-result]')!.click());
        expect(onSelectTarget).toHaveBeenCalledWith('AREA_TARGET');
    });
});
