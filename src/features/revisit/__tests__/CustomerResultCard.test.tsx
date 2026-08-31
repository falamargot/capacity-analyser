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
        expect(container.textContent).toContain('Maximum gap');
        expect(container.textContent).toContain('6 h');
        expect(container.textContent).toContain('Requirement');
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
        expect(container.textContent).toContain('Maximum gap');
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
            sizing: {
                kind: 'RECOMMENDED', payloadCount: 36, additionalPayloads: 24,
                split: { planes: 12, perPlane: 3 }, maxGapMs: 1.5 * HOUR,
            },
            onApply,
        });

        expect(container.textContent).toContain('Recommended configuration');
        expect(container.textContent).toContain('36');
        expect(container.textContent).toContain('+24');
        /*
         * The block that carries the button must say what the button DOES.
         * Until 2026-08-31 it printed the count and the fleet denominator and
         * stopped: neither the topology it was about to apply nor the revisit
         * that topology achieves — while the two rarer states, `RETOPOLOGY` and
         * `AREA_VERIFIED`, stated both. The fields were not merely unrendered;
         * `CustomerSizing.RECOMMENDED` did not carry them.
         */
        expect(container.textContent).toContain('12 planes × 3 per plane');
        expect(container.textContent).toContain('1 h 30 min');

        const apply = container.querySelector<HTMLButtonElement>('.revisit-apply-recommended');
        expect(apply).not.toBeNull();
        await act(async () => apply?.click());
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    /* Nothing measured, nothing stated: the count stands alone rather than
       borrowing a split or a gap from anywhere. */
    it('omits the split and the gap when the sweep point was not found', async () => {
        await renderCard({
            sizing: {
                kind: 'RECOMMENDED', payloadCount: 36, additionalPayloads: 24,
                split: null, maxGapMs: null,
            },
        });

        expect(container.textContent).toContain('36');
        expect(container.textContent).toContain('within the 576-satellite active fleet');
        expect(container.textContent).not.toMatch(/planes × \d+ per plane/);
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
        /*
         * The cost sentence is the block's only ALWAYS-VISIBLE statement of
         * what the proposal costs: the composition line beside it is
         * `revisit-customer-secondary` and is hidden on a short stage. A
         * re-split at the SAME count genuinely costs nothing, so this is where
         * the phrase belongs — and nowhere else (see the test below).
         */
        const cost = [...container.querySelectorAll('p')]
            .find((p) => p.textContent?.startsWith('The payloads already flown'))!;
        expect(cost).toBeDefined();
        expect(cost.textContent).toContain('no additional payloads required');
        expect(cost.className).not.toContain('revisit-customer-secondary');
        // Never in the `Requirement covered` colour: the badge above says the
        // requirement is missed, and lime is what says it is met.
        expect(cost.className).not.toContain('lime');
        // P6: the measurement is a labelled row carrying the current block's
        // own label, so the two worst cases read as one comparison.
        const measured = container.querySelector('[aria-label="Recommended configuration"] dl > div')!;
        expect(measured.textContent).toContain('Maximum gap');
        expect(measured.textContent).toContain('1 h 54 min');
        // The two statements that must never appear together.
        expect(container.textContent).not.toContain('More payloads required');
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
        expect(container.textContent).not.toContain('the payloads already flown');
        /*
         * "No additional payloads required" is true here and badly understates
         * it: the recommendation FREES twelve. Reported 2026-08-31 against a
         * case proposing 6 payloads where 64 are flown, where the sentence read
         * as "the current configuration is fine" — directly under
         * `Reconfiguration required`.
         *
         * The saving must be stated OUTSIDE the composition line, which is
         * `revisit-customer-secondary` and hidden on a short stage — so it is
         * asserted on the visible sentence, not on the card's text as a whole.
         */
        const cost = [...container.querySelectorAll('p')]
            .find((p) => p.textContent?.includes('fewer payloads'))!;
        expect(cost).toBeDefined();
        expect(cost.className).not.toContain('revisit-customer-secondary');
        expect(cost.textContent).toBe('12 fewer payloads than the current configuration.');
        expect(container.textContent).not.toContain('no additional payloads required');
    });

    /*
     * The apply note is gone (2026-08-30). It explained that applying a
     * secondary target's recommendation retunes the SHARED topology, which is
     * true and is a real consequence — but it was a paragraph under a button on
     * a card that already carries a question, a verdict, six figures and a
     * chart. The card is read out loud in front of an audience, and the note
     * was the line that never got read.
     */
    it('offers the apply control without a paragraph under it', async () => {
        await renderCard({
            sizing: {
                kind: 'RETOPOLOGY',
                payloadCount: 48,
                split: { planes: 6, perPlane: 8 },
                maxGapMs: 1.9 * HOUR,
            },
            onApply: vi.fn(),
        });

        // Not a paragraph under the button — a title ON it, so the
        // consequence survives without spending a line of the card.
        const apply = container.querySelector('.revisit-apply-recommended')!;
        expect(apply).not.toBeNull();
        expect(container.textContent).not.toContain('Optimises the shared topology');
        expect(apply.getAttribute('title')).toContain('shared topology');
    });

    /* A secondary target's recommendation retunes what the primary flies, and
       that is the half a presenter gets asked about. */
    it('warns on the control that a secondary recommendation retunes the shared topology', async () => {
        await renderCard({
            targetRole: 'COMPARISON',
            sizing: {
                kind: 'RETOPOLOGY',
                payloadCount: 48,
                split: { planes: 6, perPlane: 8 },
                maxGapMs: 1.9 * HOUR,
            },
            onApply: vi.fn(),
        });

        expect(container.querySelector('.revisit-apply-recommended')?.getAttribute('title'))
            .toContain('the primary target stops driving it');
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
            sizing: {
                kind: 'RECOMMENDED', payloadCount: 36, additionalPayloads: 24,
                split: { planes: 12, perPlane: 3 }, maxGapMs: 1.5 * HOUR,
            },
        });

        expect(container.textContent).toContain('More payloads required');
        expect(container.textContent).not.toContain('MISSES');
        expect(container.querySelector('.revisit-customer-status')?.className)
            .toContain('text-orange-200');
    });

    it('reports a covered requirement without proposing anything', async () => {
        await renderCard({ currentMaxGapMs: 1.5 * HOUR, sizing: { kind: 'COVERED' } });

        // The badge is the whole message here: the sentence that repeated it
        // under a "Requirement covered" pill is gone.
        expect(container.textContent).toContain('Requirement covered');
        expect(container.textContent).not.toContain('Met by the current configuration');
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
        expect(container.textContent).toContain('Assessment required');
        expect(container.textContent).not.toContain('Calculating fleet sizing');
    });

    it('reserves red for a technical sizing failure', async () => {
        await renderCard({ sizing: { kind: 'FAILED' } });
        expect(container.querySelector('.revisit-customer-status')?.className)
            .toContain('text-red-200');
    });

    /* Programme 5b guardrail, restated as a rendering contract. */
    /*
     * The control states its cost before it is paid. A button that takes ten
     * seconds and says nothing gets clicked twice, and the second click
     * restarts the search it is waiting for.
     */
    it('says what a sizing search will cost before starting it', async () => {
        await renderCard({
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: { kind: 'AREA_NOT_SIZED' },
            onSizeArea: vi.fn(),
            areaCellCount: 96,
        });

        const button = container.querySelector('.revisit-size-area');
        // The label names the ANSWER, not the machinery that produces it.
        expect(button?.textContent).toContain('Measure payloads');
        expect(button?.textContent).toContain('96 cells');
        expect(button?.textContent).toMatch(/about \d+ s/);
    });

    /*
     * One element, not three. An unsized area used to show a verdict pill, a
     * sentence saying nothing had been measured, and a button offering to
     * measure it — the pill and the sentence both restating the absence the
     * button already implies. Only the offer survives.
     */
    it('offers the measurement and nothing else until an area has been sized', async () => {
        await renderCard({
            question: 'Can every analysed cell in Customer AOI be observed at least every 2 h, with an assumed 700 km IR swath?',
            currentMetricLabel: 'Maximum gap · least-covered cell',
            sizing: { kind: 'AREA_NOT_SIZED' },
            onSizeArea: vi.fn(),
        });

        expect(container.textContent).toContain('Maximum gap · least-covered cell');
        expect(container.querySelector('.revisit-size-area')).not.toBeNull();
        // No verdict: nothing has been measured to put one on.
        expect(container.querySelector('.revisit-customer-status')).toBeNull();
        expect(container.textContent).not.toContain('Assessment required');
        expect(container.textContent).not.toContain('has been measured for this area yet');
        expect(container.textContent).not.toMatch(/\+\d+/);
        expect(container.querySelector('.revisit-apply-recommended')).toBeNull();
    });

    /*
     * The empty slot is only justified while a control fills it. An area whose
     * cells produced no measured gap has no cell to probe from, so RevisitApp
     * withholds `onSizeArea` — and the block then has to say something rather
     * than print the question and stop.
     */
    it('keeps a verdict when the measurement cannot be offered', async () => {
        await renderCard({
            currentMetricLabel: 'Maximum gap · least-covered cell',
            sizing: { kind: 'AREA_NOT_SIZED' },
            onSizeArea: undefined,
        });

        expect(container.querySelector('.revisit-size-area')).toBeNull();
        expect(container.querySelector('.revisit-customer-status')?.textContent)
            .toContain('Assessment required');
        expect(container.textContent).toContain('no measured cell to start from');
    });

    /*
     * A search that RAN and found nothing is the opposite case: it is a
     * measured absence, it keeps its verdict, and it must not re-offer the
     * button as though nothing had happened.
     */
    it('states a failed search as a measured absence, without re-offering it', async () => {
        await renderCard({
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: { kind: 'AREA_NOT_FOUND', stoppedAtCeiling: false, ruledOutByProbe: true },
            onSizeArea: vi.fn(),
        });

        expect(container.textContent).toContain('Assessment required');
        expect(container.textContent).toContain('least-covered cell of this area');
        expect(container.querySelector('.revisit-size-area')).toBeNull();
    });

    /*
     * The claim an area sizing may make, and the one it may not. Every cell was
     * measured at this configuration — that is what "verified" means here — but
     * the probe ranks candidates on ONE cell, so a cheaper rung it ranked lower
     * may also pass. The card must say both, in the same breath as the number.
     */
    it('states the scope of a verified area sizing beside the number', async () => {
        await renderCard({
            currentMetricLabel: 'Maximum gap · least-covered cell',
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: {
                kind: 'AREA_VERIFIED',
                payloadCount: 36,
                selection: { planeStride: 2, satStride: 8, planeShift: 0 },
                selectedPlanes: 6,
                payloadsPerPlane: 6,
                worstCellGapMs: 1.8 * HOUR,
                candidatesTried: 2,
                additionalPayloads: 24,
            },
        });

        expect(container.textContent).toContain('36');
        expect(container.textContent).toContain('+24');
        expect(container.textContent).toContain('6 planes × 6 per plane');
        expect(container.textContent).toContain('Verified on every cell of this area');
        expect(container.textContent).toContain('Not proved minimal');
        expect(container.textContent).toContain('More payloads required');

        /*
         * P6: the worst cell of the PROPOSAL is a labelled row carrying the
         * current block's own label, not a 12 px fragment beside the split.
         * The 3 h → 1 h 48 collapse is the argument; both halves are now
         * typeset as figures worth reading, one card apart.
         */
        const recommended = container.querySelector('[aria-label="Recommended configuration"]')!;
        const rows = [...recommended.querySelectorAll('dl > div')];
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain('Maximum gap · least-covered cell');
        expect(rows[0].textContent).toContain('1 h 48 min');
    });

    /*
     * P2 (2026-08-31). This is the strongest claim the module makes — a
     * configuration measured on EVERY cell of the grid, with its search
     * evidence printed underneath — and it was the one screen that offered
     * nothing to do about it, while a point recommendation one click away
     * offered a button on a weaker claim. The presenter had to read the split
     * out loud and reproduce it by hand in the Advanced drawer.
     */
    it('offers the action that applies a verified area configuration', async () => {
        const onApply = vi.fn();
        await renderCard({
            currentMetricLabel: 'Maximum gap · least-covered cell',
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: {
                kind: 'AREA_VERIFIED',
                payloadCount: 72,
                selection: { planeStride: 1, satStride: 8, planeShift: 0 },
                selectedPlanes: 12,
                payloadsPerPlane: 6,
                worstCellGapMs: 1.02 * HOUR,
                candidatesTried: 3,
                additionalPayloads: 60,
            },
            onApply,
        });

        const apply = container.querySelector<HTMLButtonElement>('.revisit-apply-recommended');
        expect(apply).not.toBeNull();
        await act(async () => apply?.click());
        expect(onApply).toHaveBeenCalledTimes(1);
    });

    /*
     * Found by re-reading the screen after P2/P6 landed (2026-08-31). The area
     * proposed 36 payloads where 48 were flown and said so NOWHERE: the `+N`
     * chip only renders a cost, and the saving sentence had been added to
     * `RETOPOLOGY` alone. The reader was left to subtract. Worse, the badge's
     * own tooltip asserted the opposite of the numbers beside it.
     */
    it('states the saving when a verified area answer uses fewer payloads', async () => {
        await renderCard({
            currentPayloadCount: 48,
            currentMetricLabel: 'Maximum gap · least-covered cell',
            currentMaxGapMs: 2 * HOUR + 21 * 60_000,
            requirementMs: 2 * HOUR,
            sizing: {
                kind: 'AREA_VERIFIED',
                payloadCount: 36,
                selection: { planeStride: 1, satStride: 16, planeShift: 0 },
                selectedPlanes: 12,
                payloadsPerPlane: 3,
                worstCellGapMs: HOUR + 59 * 60_000,
                candidatesTried: 1,
                additionalPayloads: -12,
            },
        });

        const cost = [...container.querySelectorAll('p')]
            .find((p) => p.textContent?.includes('fewer payloads'))!;
        expect(cost).toBeDefined();
        expect(cost.textContent).toBe('12 fewer payloads than the current configuration.');
        // Not in the hidden line, and not in the colour that says "covered".
        expect(cost.className).not.toContain('revisit-customer-secondary');
        expect(cost.className).not.toContain('lime');

        // The badge said "the same budget, split differently" over 36 against 48.
        const badge = container.querySelector('.revisit-customer-status')!;
        expect(badge.textContent).toBe('Reconfiguration required');
        expect(badge.getAttribute('title')).toContain('fewer payloads than are flown today');
        expect(badge.getAttribute('title')).not.toContain('the same budget');
    });

    /* A re-split costs nothing, so it must not say payloads are required. */
    it('calls a same-budget area answer a reconfiguration', async () => {
        await renderCard({
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: {
                kind: 'AREA_VERIFIED',
                payloadCount: 12,
                selection: { planeStride: 6, satStride: 8, planeShift: 0 },
                selectedPlanes: 2,
                payloadsPerPlane: 6,
                worstCellGapMs: 1.9 * HOUR,
                candidatesTried: 1,
                additionalPayloads: 0,
            },
        });

        expect(container.textContent).toContain('Reconfiguration required');
        expect(container.textContent).not.toMatch(/\+\d+/);
        // The same sentence the point re-split uses, from the same component.
        expect(container.textContent)
            .toContain('The payloads already flown, redistributed — no additional payloads required.');
        expect(container.querySelector('.revisit-customer-status')?.getAttribute('title'))
            .toContain('the same budget');
    });

    it('reports the search phase while it runs', async () => {
        await renderCard({
            currentMaxGapMs: 3 * HOUR,
            requirementMs: 2 * HOUR,
            sizing: { kind: 'AREA_SIZING', phase: 'verify', candidate: 2, fraction: 0.4 },
        });

        // The progress line is the whole message; a `Sizing…` pill above it
        // said the same thing in fewer words.
        expect(container.querySelector('.revisit-customer-status')).toBeNull();
        expect(container.textContent).toContain('Verifying candidate 2');
        expect(container.textContent).toContain('40%');
    });

    it('explains a missing current figure instead of leaving a dash', async () => {
        await renderCard({
            currentMaxGapMs: null,
            currentUnavailableReason: 'This target is never in view over the analysis window.',
            sizing: { kind: 'UNAVAILABLE' },
        });

        expect(container.textContent).toContain('never in view over the analysis window');
        expect(container.textContent).toContain('Assessment required');
        // Nothing to size against — the whole block is absent, not empty.
        expect(container.textContent).not.toContain('Recommended configuration');
    });

    /*
     * The verdict now heads Recommended configuration instead of sitting under
     * the question. It was a claim before the reader had the figures, and the
     * card is read top to bottom out loud: question, what is flown, what it
     * achieves, then the verdict on it.
     */
    it('carries the verdict at the head of the recommendation, not under the question', async () => {
        await renderCard({
            currentMaxGapMs: HOUR,
            requirementMs: 2 * HOUR,
            sizing: { kind: 'COVERED' },
        });

        const recommended = container.querySelector('[aria-label="Recommended configuration"]')!;
        expect(recommended.textContent).toContain('Requirement covered');
        // And it is not said twice: the sentence that repeated the badge is gone.
        expect(container.textContent).not.toContain('no additional payloads required');
    });
});
