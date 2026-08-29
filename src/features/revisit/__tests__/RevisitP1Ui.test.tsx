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
    it('starts an empty target set with the same Point or Polygon choice used for comparison', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onAddReferencePoint = vi.fn();
        const onAddAreaTarget = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                hasReferenceTarget={false}
                onAddReferencePoint={onAddReferencePoint}
                onAddAreaTarget={onAddAreaTarget}
                spreadNote={null}
            />
        ));

        expect(container.querySelector('[aria-label="Add secondary target"]')).toBeNull();
        expect(container.textContent).not.toContain('Reference geometry');
        await act(async () => (
            container.querySelector('[aria-label="Add primary target"]') as HTMLButtonElement
        ).click());
        expect(container.querySelector('[aria-label="Choose primary target type"]')).not.toBeNull();

        await act(async () => (
            container.querySelector('[aria-label="Add Primary point target"]') as HTMLButtonElement
        ).click());
        expect(onAddReferencePoint).toHaveBeenCalledOnce();
    });

    it('allows the primary target to be removed as a complete target-set reset', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onRemoveReferenceTarget = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                onRemoveReferenceTarget={onRemoveReferenceTarget}
                spreadNote={null}
            />
        ));

        expect(container.querySelector('[aria-label="Add secondary target"]')).not.toBeNull();
        await act(async () => (
            container.querySelector('[aria-label="Remove primary target"]') as HTMLButtonElement
        ).click());
        expect(onRemoveReferenceTarget).toHaveBeenCalledOnce();
    });

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

        expect(container.textContent).toContain('Illustrative IR preset');
        const preset = container.querySelector('[aria-label="Instrument preset"]') as HTMLSelectElement;
        await act(async () => change(preset, 'WIDE'));
        expect(onInstrumentPresetChange).toHaveBeenCalledWith('WIDE');

        const locationButton = container.querySelector('[aria-label="Set primary target location"]') as HTMLButtonElement;
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

    it('keeps the selected target requirement beside the swath input', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onRequirementChange = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                onInstrumentPresetChange={() => undefined}
                requirementMs={2 * 3600_000}
                requirementChoicesHours={[1, 2, 6]}
                onRequirementChange={onRequirementChange}
                activeTargetRole="REFERENCE"
                spreadNote={null}
            />
        ));

        const hostedPayloads = container.querySelector(
            '[data-revisit-context-panel="hosted-payloads"]'
        )!;
        expect(hostedPayloads.textContent).toContain('Assumed sensor swath');
        expect(hostedPayloads.textContent).toContain('Revisit requirement');
        const requirement = hostedPayloads.querySelector(
            '[aria-label="Revisit requirement for Primary target"]'
        ) as HTMLSelectElement;
        expect(requirement.className).toContain('border-amber');
        await act(async () => change(requirement, String(6 * 3600_000)));
        expect(onRequirementChange).toHaveBeenCalledWith(6 * 3600_000);
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
            'Set primary target location',
            'Set secondary target location',
        ]);

        await act(async () => (locationButtons[1] as HTMLButtonElement).click());
        const openMenu = container.querySelector('[role="dialog"]')!;
        const latitude = openMenu.querySelector('[aria-label="Secondary target latitude"]') as HTMLInputElement;
        const longitude = openMenu.querySelector('[aria-label="Secondary target longitude"]') as HTMLInputElement;
        await act(async () => {
            change(latitude, '41.5');
            change(longitude, '6.25');
        });
        const apply = [...openMenu.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Apply coordinates'))!;
        await act(async () => apply.click());
        expect(onSecondaryPointChange).toHaveBeenCalledWith('comparison-1', 41.5, 6.25, undefined);

        const targetPreset = container.querySelector('[aria-label="Secondary target"]') as HTMLSelectElement;
        expect(targetPreset.selectedOptions[0]?.textContent).toBe('Custom point');
        await act(async () => change(targetPreset, 'Singapore'));
        expect(onSecondaryPointTargetChange).toHaveBeenCalledWith('comparison-1', 'Singapore');
    });

    it('presents point and area targets in one selectable list', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onAnalysisContextChange = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                customArea={{
                    kind: 'AREA', id: 'area-1', name: 'Custom area', gridSpacingDeg: 2,
                    boundary: [
                        { latDeg: 10, lonDeg: 10 },
                        { latDeg: 12, lonDeg: 10 },
                        { latDeg: 11, lonDeg: 12 },
                    ],
                }}
                comparisonAreaCellCount={7}
                secondaryTargetOrder={['AREA_TARGET']}
                onAnalysisContextChange={onAnalysisContextChange}
                spreadNote={null}
            />
        ));

        expect(container.querySelector('[role="tablist"]')).toBeNull();
        expect(container.textContent).toContain('Primary target');
        expect(container.textContent).toContain('Secondary target');
        expect(container.textContent).toContain('Polygon · Custom area');
        expect(container.textContent).not.toContain('Primary drives configuration');

        await act(async () => (
            container.querySelector('[aria-label="Select secondary target polygon"]') as HTMLButtonElement
        ).click());
        expect(onAnalysisContextChange).toHaveBeenCalledWith('AREA');
    });

    it('offers Point or Area only after Add compared target is opened', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                secondaryTargetOrder={[]}
                spreadNote={null}
            />
        ));

        expect(container.textContent).not.toContain('Area ·');
        await act(async () => (
            container.querySelector('[aria-label="Add secondary target"]') as HTMLButtonElement
        ).click());
        expect(container.querySelector('[aria-label="Choose secondary target type"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Add Secondary point target"]')).not.toBeNull();
        expect(container.querySelector('[aria-label="Add Secondary polygon target"]')).not.toBeNull();
    });

    it('does not render a redundant geometry switch for an existing reference', async () => {
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

        expect(container.textContent).not.toContain('Reference geometry');
        expect(container.querySelector('[aria-label="Primary target geometry"]')).toBeNull();
    });

    it('renders independent reference and comparison polygons without adding a third slot', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const polygon = (id: string, name: string) => ({
            kind: 'AREA' as const, id, name, gridSpacingDeg: 1,
            boundary: [
                { latDeg: 10, lonDeg: 10 },
                { latDeg: 12, lonDeg: 10 },
                { latDeg: 11, lonDeg: 12 },
            ],
        });
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                referenceArea={polygon('reference-area', 'Reference AOI')}
                comparisonArea={polygon('comparison-area', 'Comparison AOI')}
                areaTargetRole="REFERENCE"
                customArea={polygon('reference-area', 'Reference AOI')}
                secondaryTargetOrder={['AREA_TARGET']}
                spreadNote={null}
            />
        ));

        expect(container.textContent).toContain('Polygon · Reference AOI');
        expect(container.textContent).toContain('Polygon · Comparison AOI');
        expect(container.querySelector('[aria-label="Add secondary target"]')).toBeNull();
    });

    it('offers one atomic role-swap action only for complete targets', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onSwapTargetRoles = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[12]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London', 'Singapore']}
                onTargetChange={() => undefined}
                comparisonPoints={[{
                    id: 'secondary-1',
                    target: { kind: 'POINT', name: 'Singapore', latDeg: 1.35, lonDeg: 103.82 },
                }]}
                secondaryTargetOrder={['secondary-1']}
                canSwapTargetRoles
                onSwapTargetRoles={onSwapTargetRoles}
                spreadNote={null}
            />
        ));

        const swap = container.querySelector(
            '[aria-label="Swap Primary and Secondary targets"]'
        ) as HTMLButtonElement;
        expect(swap.disabled).toBe(false);
        await act(async () => swap.click());
        expect(onSwapTargetRoles).toHaveBeenCalledOnce();
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
            .find((button) => button.textContent?.includes('Apply instrument geometry'))!;
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
                comparison={{ baselineMaxGapMs: 12 * 3600_000 }}
            />
        ));
        expect(container.textContent).toContain('Maximum revisit gap');
        expect(container.textContent).toContain('75% shorter worst-case');
        // `+24 payloads` is now `CustomerResultCard`'s, beside the control that
        // applies it (Programme 7A); repeating it here put the recommendation
        // back in a 10 px grey line.
        expect(container.textContent).not.toContain('payloads');
    });

    it('does not claim "beyond the tested payload range" while the sweep is still running', async () => {
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
        // The fast single-scenario analysis (`isComputing`) has already
        // finished, but the sweep (`comparisonIsComputing`) has not — the
        // scenario that used to produce a false "beyond the tested payload
        // range" claim moments before the real sweep answer arrived.
        await act(async () => root?.render(
            <RevisitKpiPanel
                statistics={statistics}
                windowHours={72}
                requirementMs={2 * 3600_000}
                isComputing={false}
                comparisonIsComputing={true}
                comparison={{ baselineMaxGapMs: null }}
            />
        ));
        expect(container.textContent).not.toContain('beyond the tested payload range');
        expect(container.textContent).toContain('Measuring payload comparisons');
    });

    it('reports a boundary-truncated 1-payload baseline as a real answer, not a silent gap', async () => {
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
                comparisonIsComputing={false}
                comparison={{ baselineMaxGapMs: null, baselineInconclusive: true }}
            />
        ));
        expect(container.textContent).toContain('no worst-case in this window');
    });
});
