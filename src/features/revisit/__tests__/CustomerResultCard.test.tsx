// @vitest-environment jsdom

/**
 * Programme 7A contracts for `CustomerResultCard`.
 *
 * The card is the first thing a customer reads, so what it must NOT say is as
 * much of a contract as what it says: no payload figure for an Area, no
 * recommendation carried over while the sweep is still running, and no
 * "beyond the tested range" stated as an answer before the sweep has given one.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerResultCard } from '../ui/CustomerResultCard';

let root: Root | null = null;
let container: HTMLDivElement;

const HOUR = 3600_000;

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
});

async function renderCard(overrides: Partial<React.ComponentProps<typeof CustomerResultCard>> = {}) {
    const props: React.ComponentProps<typeof CustomerResultCard> = {
        question: 'Can the Eutelsat LEO fleet observe London at least every 2 h, with an assumed 700 km IR swath?',
        currentPayloadCount: 12,
        fleetSize: 576,
        currentMaxGapMs: 6 * HOUR,
        currentIsComputing: false,
        requirementMs: 2 * HOUR,
        sizing: { kind: 'COMPUTING' },
        ...overrides,
    };
    await act(async () => root?.render(<CustomerResultCard {...props} />));
    return container;
}

describe('CustomerResultCard', () => {
    it('carries the inspected target role across its section hierarchy', async () => {
        await renderCard({ targetRole: 'COMPARISON' });

        expect(container.querySelector('[data-revisit-result-role="comparison"]')
            ?.classList.contains('revisit-result-comparison')).toBe(true);
        expect(container.querySelector('.revisit-label')?.textContent)
            .toContain('Current configuration');
    });

    it('leads with the customer question and both sides of the comparison', async () => {
        await renderCard();

        expect(container.textContent).toContain('Can the Eutelsat LEO fleet observe London');
        expect(container.textContent).toContain('Current configuration');
        expect(container.textContent).toContain('Maximum revisit gap');
        expect(container.textContent).toContain('6 h');
        expect(container.textContent).toContain('Customer requirement');
        expect(container.textContent).toContain('2 h');
    });

    /*
     * A failed sweep is a LOCAL state of the sizing block. It used to raise the
     * presentation-wide blocking notice instead, which covered a correct result
     * with a red alert because a secondary calculation had failed.
     */
    it('states a failed sizing in place, keeps the result, and offers a retry', async () => {
        const onRetrySizing = vi.fn();
        await renderCard({ sizing: { kind: 'FAILED' }, onRetrySizing });

        expect(container.textContent).toContain('Fleet sizing could not be calculated');
        expect(container.textContent).toContain('The result above is unaffected');
        // The measured answer is still on screen — that is the whole point.
        expect(container.textContent).toContain('Maximum revisit gap');
        expect(container.textContent).toContain('6 h');
        // No payload recommendation is invented in its place.
        expect(container.textContent).not.toContain('Apply recommended configuration');

        const retry = container.querySelector<HTMLButtonElement>('.revisit-retry-sizing');
        expect(retry).not.toBeNull();
        await act(async () => retry?.click());
        expect(onRetrySizing).toHaveBeenCalledTimes(1);
    });

    it('omits the retry control when the sizing cannot be re-run', async () => {
        await renderCard({ sizing: { kind: 'FAILED' } });
        expect(container.querySelector('.revisit-retry-sizing')).toBeNull();
        expect(container.textContent).toContain('Fleet sizing could not be calculated');
    });

    it('states the recommendation and offers the action that applies it', async () => {
        const onApply = vi.fn();
        await renderCard({
            sizing: { kind: 'RECOMMENDED', payloadCount: 36, additionalPayloads: 24 },
            onApply,
        });

        expect(container.textContent).toContain('Recommended configuration');
        expect(container.textContent).toContain('36');
        expect(container.textContent).toContain('+24');

        const apply = container.querySelector<HTMLButtonElement>('.revisit-apply-recommended');
        expect(apply).not.toBeNull();
        await act(async () => apply?.click());
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    /*
     * The 2026-08-28 defect, as a rendering contract: the card must not print a
     * verdict and a recommendation that contradict each other, and a
     * recommendation that costs nothing must still be actionable.
     */
    it('offers a re-split without ever calling it additional payloads', async () => {
        const onApply = vi.fn();
        await renderCard({
            currentPayloadCount: 48,
            currentMaxGapMs: 2 * HOUR + 20 * 60_000,
            sizing: {
                kind: 'RETOPOLOGY',
                payloadCount: 48,
                split: { planes: 6, perPlane: 8 },
                maxGapMs: 1.9 * HOUR,
            },
            onApply,
        });

        expect(container.textContent).toContain('Reconfiguration required');
        expect(container.textContent).toContain('6 × 8');
        expect(container.textContent).toContain('planes × payloads per plane');
        expect(container.textContent).toContain('the payloads already flown, redistributed');
        expect(container.textContent).toContain('no additional payloads required');
        // The two statements that must never appear together.
        expect(container.textContent).not.toContain('Additional payloads required');
        expect(container.textContent).not.toContain('Met by the current configuration');
        expect(container.textContent).not.toMatch(/\+\d+/);

        const apply = container.querySelector<HTMLButtonElement>('.revisit-apply-recommended');
        expect(apply).not.toBeNull();
        await act(async () => apply?.click());
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    it('says how many payloads are freed when the answer needs fewer', async () => {
        await renderCard({
            currentPayloadCount: 48,
            currentMaxGapMs: 2.4 * HOUR,
            sizing: {
                kind: 'RETOPOLOGY',
                payloadCount: 36,
                split: { planes: 12, perPlane: 3 },
                maxGapMs: 1.5 * HOUR,
            },
        });

        expect(container.textContent).toContain('36 payload-equipped satellites');
        expect(container.textContent).toContain('12 fewer than the current configuration');
        expect(container.textContent).not.toContain('the payloads already flown');
    });

    it('carries the apply note only where there is something to apply', async () => {
        const note = 'Optimises the shared topology for the comparison target.';
        await renderCard({ sizing: { kind: 'BEYOND_RANGE' }, applyNote: note, onApply: vi.fn() });
        expect(container.textContent).not.toContain(note);

        await renderCard({
            sizing: {
                kind: 'RETOPOLOGY',
                payloadCount: 48,
                split: { planes: 6, perPlane: 8 },
                maxGapMs: 1.9 * HOUR,
            },
            applyNote: note,
            onApply: vi.fn(),
        });
        expect(container.textContent).toContain(note);
    });

    it('keeps sizing evidence inside Recommended configuration', async () => {
        await renderCard({
            sizing: { kind: 'COVERED' },
            recommendedConfigurationDetail: <div data-testid="sizing-evidence">Sizing evidence</div>,
        });

        const recommendation = container.querySelector('[aria-label="Recommended configuration"]');
        expect(recommendation?.querySelector('[data-testid="sizing-evidence"]')).not.toBeNull();
        expect(recommendation?.textContent).toContain('Why this recommendation?');
        expect(recommendation?.textContent).toContain('Sizing evidence');
    });

    /*
     * The reason the card exists: the recommendation, not the failure, is the
     * dominant message. The status is present but stated in commercial terms.
     */
    it('frames a missed requirement as additional payloads, not as a failure', async () => {
        await renderCard({
            sizing: { kind: 'RECOMMENDED', payloadCount: 36, additionalPayloads: 24 },
        });

        expect(container.textContent).toContain('Additional payloads required');
        expect(container.textContent).not.toContain('MISSES');
        expect(container.querySelector('.revisit-customer-status')?.className)
            .toContain('text-orange-200');
    });

    it('reports a covered requirement without proposing anything', async () => {
        await renderCard({ currentMaxGapMs: 1.5 * HOUR, sizing: { kind: 'COVERED' } });

        expect(container.textContent).toContain('Requirement covered');
        expect(container.textContent).toContain('no additional payloads required');
        expect(container.querySelector('.revisit-apply-recommended')).toBeNull();
        expect(container.querySelector('.revisit-customer-status')?.className)
            .toContain('text-lime-200');
    });

    /*
     * The current answer resolves in under a second; the sweep behind the
     * recommendation can take ~30 s. The card must show the first while waiting
     * for the second, and must not offer an action it cannot honour yet.
     */
    it('shows the current answer while the fleet sizing is still measuring', async () => {
        const onApply = vi.fn();
        await renderCard({ sizing: { kind: 'COMPUTING' }, onApply });

        expect(container.textContent).toContain('6 h');
        expect(container.textContent).toContain('Calculating fleet sizing…');
        expect(container.textContent).not.toContain('tested payload range');
        expect(container.querySelector('.revisit-apply-recommended')).toBeNull();
    });

    it('distinguishes a measured absence of solution from a wait', async () => {
        await renderCard({ sizing: { kind: 'BEYOND_RANGE' } });

        expect(container.textContent).toContain('No configuration on the tested payload range');
        expect(container.textContent).toContain('Further engineering assessment required');
        expect(container.textContent).not.toContain('Calculating fleet sizing');
    });

    it('reserves red for a technical sizing failure', async () => {
        await renderCard({ sizing: { kind: 'FAILED' } });
        expect(container.querySelector('.revisit-customer-status')?.className)
            .toContain('text-red-200');
    });

    /* Programme 5b guardrail, restated as a rendering contract. */
    it('never proposes a payload count for an area', async () => {
        await renderCard({
            question: 'Can every analysed cell in Customer AOI be observed at least every 2 h, with an assumed 700 km IR swath?',
            currentMetricLabel: 'Maximum revisit gap · least-covered cell',
            sizing: { kind: 'AREA_NOT_SIZED' },
        });

        expect(container.textContent).toContain('Maximum revisit gap · least-covered cell');
        expect(container.textContent).toContain('Area sizing has not been calculated');
        expect(container.textContent).not.toMatch(/\+\d+/);
        expect(container.querySelector('.revisit-apply-recommended')).toBeNull();
    });

    it('explains a missing current figure instead of leaving a dash', async () => {
        await renderCard({
            currentMaxGapMs: null,
            currentUnavailableReason: 'This target is never in view over the analysis window.',
            sizing: { kind: 'UNAVAILABLE' },
        });

        expect(container.textContent).toContain('never in view over the analysis window');
        expect(container.textContent).toContain('Further engineering assessment required');
        // Nothing to size against — the whole block is absent, not empty.
        expect(container.textContent).not.toContain('Recommended configuration');
    });

    it('offers the return to the previous configuration only when there is one', async () => {
        const onUndo = vi.fn();
        await renderCard({ sizing: { kind: 'COVERED' }, currentMaxGapMs: HOUR });
        expect(container.querySelector('.revisit-undo-recommended')).toBeNull();

        await renderCard({ sizing: { kind: 'COVERED' }, currentMaxGapMs: HOUR, onUndo });
        const undo = container.querySelector<HTMLButtonElement>('.revisit-undo-recommended');
        expect(undo).not.toBeNull();
        await act(async () => undo?.click());
        expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('states the comparison basis when more than one target is in the set', async () => {
        await renderCard({
            comparisonNote: 'Comparing 3 customer targets against the same fleet configuration.',
        });

        expect(container.textContent).toContain('Comparing 3 customer targets');
    });
});
