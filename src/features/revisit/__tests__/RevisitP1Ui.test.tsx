// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import type { GapStatistics } from '../domain/types';
import { AdvancedDrawer } from '../ui/AdvancedDrawer';
import { referenceWithPatch } from '../domain/referenceEditing';
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

    it('keeps one shared requirement beside the swath input', async () => {
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
                spreadNote={null}
            />
        ));

        const hostedPayloads = container.querySelector(
            '[data-revisit-context-panel="hosted-payloads"]'
        )!;
        expect(hostedPayloads.textContent).toContain('Assumed sensor swath');
        expect(hostedPayloads.textContent).toContain('Requirement');
        const requirement = hostedPayloads.querySelector(
            '[aria-label="Requirement for all targets"]'
        ) as HTMLSelectElement;
        // Neutral, not the selected target's colour: the threshold belongs to
        // the analysis, not to whichever target is in focus.
        expect(requirement.className).not.toContain('border-amber');
        expect(requirement.className).not.toContain('border-sky');
        expect(requirement.disabled).toBe(false);
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

    /*
     * Custom HLD keeps its own values, so the ONLY path that replaces them with
     * the reference is this button. It exists because the alternative — the
     * mode switch quietly restoring 12 × 48 — lost work to a navigation.
     *
     * Offered only in Custom, and only while the values actually differ: in HLD
     * the values already are the reference, and a button that would change
     * nothing is noise.
     */
    it('offers the HLD copy only in Custom, and only when it would change something', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onCopyHldIntoCustom = vi.fn();
        const model = {
            mode: 'CUSTOM' as const,
            profile: null,
            fit: null,
            provenance: null,
            isRunning: false,
            error: null,
            onModeChange: () => undefined,
            onCompareToTleSet: () => undefined,
            onCopyHldIntoCustom,
        };
        const edited = {
            ...scenario,
            reference: { ...scenario.reference, planes: 17, satsPerPlane: 37 },
        };

        // `variant="menu"` renders the panel body directly; the default variant
        // is the collapsed Advanced section and would test the disclosure.
        // Custom, values identical to the HLD: nothing to copy.
        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={scenario} onChange={() => undefined} model={model} variant="menu"
            />
        ));
        expect([...container.querySelectorAll('span')]
            .filter((element) => element.textContent === '= HLD')).toHaveLength(1);
        expect(container.textContent).not.toContain('Evidence');
        expect(container.textContent).not.toContain('Kepler + J2');
        const evidenceButton = container.querySelector(
            'button[aria-label="Model evidence"]'
        ) as HTMLButtonElement;
        await act(async () => evidenceButton.click());
        expect(container.querySelector('[role="dialog"][aria-label="Model evidence"]'))
            .not.toBeNull();
        expect(container.textContent).toContain('Kepler + J2 secular · no drag');
        expect(container.textContent).toContain('Hand-entered · no external provenance');
        await act(async () => evidenceButton.click());
        expect(container.textContent).not.toContain('Kepler + J2');
        const button = () => [...container.querySelectorAll('button')]
            .find((element) => element.textContent === 'Copy HLD values');
        expect(button()).toBeUndefined();

        // Custom, values edited: the copy is offered.
        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={edited} onChange={() => undefined} model={model} variant="menu"
            />
        ));
        expect(button()?.className).toContain('bg-amber-500/15');
        expect(button()?.className).toContain('text-amber-50');
        await act(async () => button()!.click());
        expect(onCopyHldIntoCustom).toHaveBeenCalledTimes(1);

        // HLD: never, the values are the reference already.
        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={edited}
                onChange={() => undefined}
                model={{ ...model, mode: 'HLD' }}
                variant="menu"
            />
        ));
        expect(button()).toBeUndefined();
    });

    /*
     * Bold means one thing: this value is no longer the reference. Every Walker
     * field used to be bold, which made seven emphasised numbers that said
     * nothing; the point of Custom HLD is to see at a glance what was changed.
     */
    it('emphasises only the Walker values that differ from the HLD', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const model = {
            mode: 'CUSTOM' as const,
            profile: null, fit: null, provenance: null,
            isRunning: false, error: null,
            onModeChange: () => undefined,
            onCompareToTleSet: () => undefined,
            onCopyHldIntoCustom: () => undefined,
        };
        // The Walker fieldset only: the stride, geometry and window fields are
        // not compared against anything, so they keep their own weight.
        const bold = () => [...container.querySelector('fieldset')!
            .querySelectorAll('input, select')]
            .filter((element) => element.className.includes('font-bold'))
            .map((element) => (element as HTMLInputElement).value);

        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={scenario} onChange={() => undefined} model={model} variant="menu"
            />
        ));
        expect(bold()).toEqual([]);

        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={{
                    ...scenario,
                    reference: { ...scenario.reference, planes: 17, altitudeKm: 550 },
                }}
                onChange={() => undefined}
                model={model}
                variant="menu"
            />
        ));
        expect(bold()).toEqual(['17', '550']);
    });

    /*
     * Every editable field explains itself on hover. Not decoration: this panel
     * is read by people who are not orbital engineers, and "Fudge",
     * "Phasing f" and "Plane shift z" are unguessable from their labels.
     *
     * Asserted as a count over the fieldsets rather than field by field, so a
     * field added later without a title fails here instead of shipping mute.
     */
    it('explains every editable parameter on hover', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <AdvancedDrawer scenario={scenario} onChange={() => undefined} variant="menu" />
        ));

        const labelled = [...container.querySelectorAll('label')];
        const withControl = labelled.filter((label) => label.querySelector('input, select'));
        expect(withControl.length).toBeGreaterThan(10);

        const mute = withControl
            .filter((label) => !label.getAttribute('title'))
            .map((label) => label.textContent?.slice(0, 24));
        expect(mute).toEqual([]);
    });

    /*
     * The ladder, the seam and the spares are the HLD's evidence — what
     * separates the profile from seven identical scalars — and they are shown
     * nowhere else in the application. They are no longer three rows of their
     * own: the summary sentence already says "per-plane altitude ladder" and
     * "58 across 12 planes spare", so the exact figures moved to its hover,
     * where they belong to whoever asks rather than to everyone who opens the
     * panel. This pins that they are still reachable, and that an edited shell
     * says so rather than going quiet.
     */
    it('keeps the structural figures on the summary, and reports their loss', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const summary = () => container.querySelector('.revisit-characteristics-summary');

        await act(async () => root?.render(
            <AdvancedDrawer scenario={scenario} onChange={() => undefined} variant="menu" />
        ));
        expect(summary()?.textContent).toContain('per-plane altitude ladder');
        const detail = summary()?.getAttribute('title') ?? '';
        expect(detail).toContain('1175–1219 km');
        expect(detail).toContain('seam 12.525°');
        expect(detail).toContain('58 across 12 planes');

        // `referenceWithPatch` drops all three as soon as the plane count moves.
        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={{
                    ...scenario,
                    reference: referenceWithPatch(scenario.reference, { planes: 15 }),
                }}
                onChange={() => undefined}
                variant="menu"
            />
        ));
        expect(summary()?.textContent).not.toContain('per-plane altitude ladder');
        expect(summary()?.getAttribute('title')).toContain('Uniform shell');
    });

    /*
     * Two undo levels, and they answer different questions. "Discard edits"
     * goes back to the instrument currently applied — it can only act on a
     * staged edit. "Reset to standard" goes back to the instrument the scenario
     * opens with, which is reachable even when nothing is staged, and that is
     * the whole point of it being there.
     *
     * Reset loads the draft rather than publishing, so a geometry still reaches
     * the scenario by exactly one route: Apply.
     */
    it('offers a reset to the standard instrument, distinct from discarding edits', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const applied = {
            ...scenario,
            payload: { ...scenario.payload, halfAngle1Deg: 25, halfAngle2Deg: 25 },
        };
        const onChange = vi.fn();
        await act(async () => root?.render(
            <AdvancedDrawer scenario={applied} onChange={onChange} variant="menu" />
        ));

        const button = (label: string) => [...container.querySelectorAll('button')]
            .find((element) => element.textContent === label) as HTMLButtonElement;

        // Nothing staged: discarding has nothing to do, resetting does.
        expect(button('Discard edits').disabled).toBe(true);
        expect(button('Reset to standard').disabled).toBe(false);

        await act(async () => button('Reset to standard').click());
        // The draft moved; the scenario did not.
        expect(onChange).not.toHaveBeenCalled();
        const halfAngle = container.querySelector<HTMLInputElement>(
            '[aria-label="FOV half-angle 1"]'
        )!;
        expect(Number(halfAngle.value)).toBeCloseTo(16.13, 2);

        await act(async () => button('Apply instrument geometry').click());
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange.mock.calls[0][0].payload.halfAngle1Deg).toBeCloseTo(16.13, 2);
    });

    /*
     * The instrument is the user's in both models, so it must not read as
     * locked when the Walker fields are. The Walker fieldset carries `disabled`
     * in HLD; the payload fields never do.
     */
    it('leaves the instrument editable while the Walker fields are locked', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        await act(async () => root?.render(
            <AdvancedDrawer
                scenario={scenario}
                onChange={() => undefined}
                variant="menu"
                model={{
                    mode: 'HLD', profile: null, fit: null, provenance: null,
                    isRunning: false, error: null,
                    onModeChange: () => undefined,
                    onCompareToTleSet: () => undefined,
                    onCopyHldIntoCustom: () => undefined,
                }}
            />
        ));

        expect(container.querySelector('fieldset')!.disabled).toBe(true);
        const halfAngle = container.querySelector<HTMLInputElement>(
            '[aria-label="FOV half-angle 1"]'
        )!;
        expect(halfAngle.closest('fieldset')).toBeNull();
        expect(halfAngle.disabled).toBe(false);
        expect(container.textContent).toContain('yours in either model');
    });

    /*
     * The payload slider edits the very configuration the constellation panel
     * is displaying, so it must not dismiss it: the panel's own line reads
     * "12 payloads — 2 planes × 6", and closing it mid-drag threw away the
     * reader's place in what the drag was changing. The same holds for the
     * swath preset, which writes the instrument angles the panel displays.
     * Everything else outside still closes it, which is why the exemption is a
     * narrow selector rather than "ignore the header".
     */
    it('stays open while the header edits what it displays', async () => {
        await act(async () => root?.render(
            <RevisitHeader
                scenario={defaultScenario(Date.UTC(2026, 7, 12))}
                payloadCounts={[12, 24, 48]}
                currentPayloadCount={12}
                onPayloadCountChange={() => undefined}
                targetNames={['London']}
                onTargetChange={() => undefined}
                onInstrumentPresetChange={() => undefined}
                spreadNote={null}
                model={{
                    mode: 'HLD', profile: null, fit: null, provenance: null,
                    isRunning: false, error: null,
                    onModeChange: () => undefined,
                    onCompareToTleSet: () => undefined,
                    onCopyHldIntoCustom: () => undefined,
                }}
            />
        ));

        const open = container.querySelector<HTMLButtonElement>(
            '[aria-label="Constellation model and settings"]'
        )!;
        await act(async () => open.click());
        const panel = () => container.querySelector('[data-revisit-constellation-panel]');
        expect(panel()).not.toBeNull();

        const down = (element: Element) => act(async () => {
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        });

        await down(container.querySelector('.revisit-payload-slider')!);
        expect(panel()).not.toBeNull();

        await down(container.querySelector('[data-revisit-payload-step]')!);
        expect(panel()).not.toBeNull();

        // The swath preset writes the instrument the panel is showing.
        await down(container.querySelector('[data-revisit-payload-swath]')!);
        expect(panel()).not.toBeNull();

        // Anything else still dismisses it.
        await down(document.body);
        expect(panel()).toBeNull();
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
        expect(container.textContent).toContain('Maximum gap');
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
