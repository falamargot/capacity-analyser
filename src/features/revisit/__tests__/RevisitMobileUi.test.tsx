// @vitest-environment jsdom

/**
 * Compact-viewport contract (mobile UX plan).
 *
 * These assert the two invariants the plan exists to protect:
 *   1. the triad is COLLAPSED by default, so the globe keeps the viewport, and
 *      the payload count — the one control manipulated continuously — is still
 *      reachable in one tap from the collapsed bar;
 *   2. collapsing the analysis column never collapses the ANSWER: the strip
 *      still carries the verdict and the worst-case gap.
 *
 * They are class/DOM assertions rather than layout ones because jsdom has no
 * layout; the pixel budget itself is verified in the browser.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultScenario } from '../domain/presets';
import type { GapStatistics } from '../domain/types';
import { RevisitHeader } from '../ui/RevisitHeader';
import { MobileResultStrip } from '../ui/MobileResultStrip';

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

const statistics = (maxGapMs: number | null): GapStatistics => ({
    maxGapMs,
    meanGapMs: maxGapMs === null ? null : maxGapMs / 2,
    p95GapMs: maxGapMs,
    accessCount: 28,
    fractionInView: 0.01,
    meanAccessDurationMs: 480_000,
    totalInViewMs: 28 * 480_000,
    interiorGapCount: 27,
    boundaryGapsDiscarded: 2,
    warnings: [],
    coverage: maxGapMs === null ? 'NEVER_IN_VIEW' : 'INTERMITTENT',
});

describe('REVISIT compact viewport', () => {
    it('collapses the triad by default and keeps the payload stepper on the bar', async () => {
        const scenario = defaultScenario(Date.UTC(2026, 7, 12));
        const onPayloadCountChange = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[6, 12, 24]}
                currentPayloadCount={12}
                onPayloadCountChange={onPayloadCountChange}
                targetNames={['London']}
                onTargetChange={() => undefined}
                spreadNote={null}
            />
        ));

        const triad = container.querySelector('#revisit-mobile-setup') as HTMLDivElement;
        // `hidden` is the compact default; `md:flex` restores it on desktop.
        expect(triad.className).toContain('hidden');
        expect(triad.className).toContain('md:flex');

        const more = container.querySelector('[aria-label="One payload more"]') as HTMLButtonElement;
        await act(async () => more.click());
        expect(onPayloadCountChange).toHaveBeenCalledWith(24);

        const fewer = container.querySelector('[aria-label="One payload fewer"]') as HTMLButtonElement;
        await act(async () => fewer.click());
        expect(onPayloadCountChange).toHaveBeenCalledWith(6);

        /*
         * Since Programme 7B the header does not own this panel's open state:
         * it is one of five mutually exclusive panels and `RevisitApp` is the
         * single authority. The header's contract is therefore to REQUEST the
         * toggle and to render whatever `setupOpen` says — asserting that it
         * opens itself would assert the bug exclusivity exists to prevent.
         */
        const onToggleSetup = vi.fn();
        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[6, 12, 24]}
                currentPayloadCount={12}
                onPayloadCountChange={onPayloadCountChange}
                targetNames={['London']}
                onTargetChange={() => undefined}
                spreadNote={null}
                setupOpen={false}
                onToggleSetup={onToggleSetup}
            />
        ));
        const disclosure = container
            .querySelector('[aria-controls="revisit-mobile-setup"]') as HTMLButtonElement;
        await act(async () => disclosure.click());
        expect(onToggleSetup).toHaveBeenCalledTimes(1);
        expect((container.querySelector('#revisit-mobile-setup') as HTMLDivElement).className)
            .toContain('hidden');

        await act(async () => root?.render(
            <RevisitHeader
                scenario={scenario}
                payloadCounts={[6, 12, 24]}
                currentPayloadCount={12}
                onPayloadCountChange={onPayloadCountChange}
                targetNames={['London']}
                onTargetChange={() => undefined}
                spreadNote={null}
                setupOpen
                onToggleSetup={onToggleSetup}
            />
        ));
        expect((container.querySelector('#revisit-mobile-setup') as HTMLDivElement).className)
            .not.toContain('hidden');
    });

    it('keeps verdict, worst case and requirement on the strip when the sheet is closed', async () => {
        const onToggle = vi.fn();
        await act(async () => root?.render(
            <MobileResultStrip
                analysisContext="POINTS"
                statistics={statistics(3 * 3600_000)}
                areaAnalysis={null}
                requirementMs={2 * 3600_000}
                isComputing={false}
                expanded={false}
                onToggle={onToggle}
            />
        ));

        expect(container.textContent).toContain('Misses');
        expect([...container.querySelectorAll('span')]
            .find((element) => element.textContent === 'Misses')?.className)
            .toContain('text-red-200');
        expect(container.textContent).toContain('3 h');
        expect(container.textContent).toContain('Maximum gap vs 2 h');

        const strip = container.querySelector('[data-revisit-result-strip]') as HTMLButtonElement;
        expect(strip.getAttribute('aria-expanded')).toBe('false');
        await act(async () => strip.click());
        expect(onToggle).toHaveBeenCalled();
    });

    it('reports a met requirement and a never-in-view target distinctly', async () => {
        await act(async () => root?.render(
            <MobileResultStrip
                analysisContext="POINTS"
                statistics={statistics(90 * 60_000)}
                areaAnalysis={null}
                requirementMs={2 * 3600_000}
                isComputing={false}
                expanded
                onToggle={() => undefined}
            />
        ));
        expect(container.textContent).toContain('Meets');
        expect([...container.querySelectorAll('span')]
            .find((element) => element.textContent === 'Meets')?.className)
            .toContain('text-lime-200');

        await act(async () => root?.render(
            <MobileResultStrip
                analysisContext="POINTS"
                statistics={statistics(null)}
                areaAnalysis={null}
                requirementMs={2 * 3600_000}
                isComputing={false}
                expanded={false}
                onToggle={() => undefined}
            />
        ));
        expect(container.textContent).toContain('Never in view');
        expect([...container.querySelectorAll('span')]
            .find((element) => element.textContent === 'Never in view')?.className)
            .toContain('text-red-200');
    });

    it('does not substitute the reference result for an incomplete comparison point', async () => {
        await act(async () => root?.render(
            <MobileResultStrip
                analysisContext="POINTS"
                statistics={statistics(3 * 3600_000)}
                areaAnalysis={null}
                requirementMs={2 * 3600_000}
                isComputing={false}
                pointIsPending
                expanded={false}
                onToggle={() => undefined}
            />
        ));
        expect(container.textContent).toContain('Location required');
        expect(container.textContent).toContain('Set point');
        expect(container.textContent).not.toContain('3 h');
    });
});
