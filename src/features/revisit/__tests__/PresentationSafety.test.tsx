// @vitest-environment jsdom

/**
 * Programme 7B contracts for the two presentation-safety surfaces.
 *
 * The contract that matters is tone, and it is testable: a degraded mode must
 * not be announced as a failure, the engineering text must still be reachable,
 * and the readiness summary must not claim readiness it does not have.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    PresentationNotice, PresentationReadiness, type ReadinessSignal,
} from '../ui/PresentationSafety';

let root: Root | null = null;
let container: HTMLDivElement;

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

const signal = (over: Partial<ReadinessSignal> = {}): ReadinessSignal => ({
    label: 'Scenario', state: 'READY', detail: 'Valid and ready to analyse.', ...over,
});

describe('PresentationNotice', () => {
    it('states the consequence and keeps the engineering text one disclosure away', async () => {
        await act(async () => root?.render(
            <PresentationNotice
                severity="BLOCKING"
                headline="The analysis could not be completed."
                guidance="Change an input to run it again, or reset the scenario."
                technicalDetail="Revisit worker failed: postMessage cloning error"
            />
        ));

        expect(container.textContent).toContain('The analysis could not be completed.');
        expect(container.textContent).toContain('Change an input to run it again');
        // Present, but behind a closed disclosure rather than across the globe.
        const details = container.querySelector('details');
        expect(details).not.toBeNull();
        expect(details?.hasAttribute('open')).toBe(false);
        expect(details?.textContent).toContain('postMessage cloning error');
    });

    /*
     * The reason this component exists: `Running on the main thread — Worker
     * unavailable` used to be shown in red, as an error, to a room of customers.
     * It is neither an error nor a change to any number.
     */
    it('does not announce a degraded mode as a failure', async () => {
        await act(async () => root?.render(
            <PresentationNotice
                severity="DEGRADED"
                headline="Running in reduced performance mode."
                guidance="Results are identical; the interface may pause while they are computed."
                technicalDetail="This browser could not create a module Worker."
            />
        ));

        const notice = container.querySelector('[data-revisit-notice-severity]');
        expect(notice?.getAttribute('data-revisit-notice-severity')).toBe('DEGRADED');
        expect(notice?.getAttribute('role')).toBe('status');
        expect(notice?.className).not.toContain('border-red');
        expect(container.textContent).toContain('Results are identical');
        expect(container.textContent).not.toContain('Worker unavailable');
    });

    it('marks a blocking problem as an alert', async () => {
        await act(async () => root?.render(
            <PresentationNotice severity="BLOCKING" headline="This configuration cannot be analysed." />
        ));

        const notice = container.querySelector('[data-revisit-notice-severity]');
        expect(notice?.getAttribute('role')).toBe('alert');
        // No disclosure at all when there is nothing technical to disclose.
        expect(container.querySelector('details')).toBeNull();
    });
});

describe('PresentationReadiness', () => {
    it('summarises as ready only when every signal is', async () => {
        await act(async () => root?.render(
            <PresentationReadiness
                signals={[signal(), signal({ label: 'Fleet sizing' })]}
            />
        ));

        expect(container.querySelector('[data-revisit-readiness]')?.getAttribute('data-revisit-readiness'))
            .toBe('Ready to present');
    });

    it('never reports ready while a signal is degraded, pending or blocked', async () => {
        const cases: Array<[ReadinessSignal['state'], string]> = [
            ['PENDING', 'Preparing'],
            ['DEGRADED', 'Ready with limitations'],
            ['BLOCKED', 'Not ready'],
        ];
        for (const [state, expected] of cases) {
            await act(async () => root?.render(
                <PresentationReadiness
                    signals={[signal(), signal({ label: 'Fleet sizing', state })]}
                />
            ));
            expect(container.querySelector('[data-revisit-readiness]')?.getAttribute('data-revisit-readiness'))
                .toBe(expected);
        }
    });

    it('maps mobile readiness to amber, red and green dots', async () => {
        const cases: Array<[ReadinessSignal['state'], string]> = [
            ['PENDING', 'bg-amber-400'],
            ['BLOCKED', 'bg-red-400'],
            ['READY', 'bg-lime-400'],
        ];
        for (const [state, expectedClass] of cases) {
            await act(async () => root?.render(
                <PresentationReadiness signals={[signal({ state })]} />
            ));
            expect(container.querySelector('summary span:first-child')?.className)
                .toContain(expectedClass);
        }
    });

    /* A blocked signal outranks a degraded one — worst state wins. */
    it('reports the worst state, not the first', async () => {
        await act(async () => root?.render(
            <PresentationReadiness
                signals={[
                    signal({ label: 'Background computation', state: 'DEGRADED' }),
                    signal({ label: 'Scenario', state: 'BLOCKED' }),
                ]}
            />
        ));

        expect(container.querySelector('[data-revisit-readiness]')?.getAttribute('data-revisit-readiness'))
            .toBe('Not ready');
    });

    /*
     * The reason this component stopped being a menu entry: it reports, it does
     * not act. `Reduced globe load` was the one control living inside it, and it
     * is a display setting — it moved to `StageControls` with the other display
     * settings, and is covered there.
     */
    it('offers nothing to press — it is a status, not a command', async () => {
        await act(async () => root?.render(
            <PresentationReadiness signals={[signal()]} />
        ));

        expect(container.querySelector('.revisit-presentation-profile')).toBeNull();
        expect(container.querySelectorAll('button')).toHaveLength(0);
    });

    /* Settled is the common case and says so quietly; a problem does not. */
    it('speaks up only when something is not ready', async () => {
        await act(async () => root?.render(
            <PresentationReadiness signals={[signal()]} />
        ));
        const quiet = container.querySelector('summary span:last-child');
        expect(quiet?.className).toContain('text-slate-500');

        await act(async () => root?.render(
            <PresentationReadiness signals={[signal({ state: 'BLOCKED' })]} />
        ));
        const loud = container.querySelector('summary span:last-child');
        expect(loud?.className).toContain('font-bold');
        expect(loud?.textContent).toBe('Not ready');
    });
});
