// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RevisitExplanation } from '../analysis/explainRevisit';
import { WhyThisRevisit } from '../ui/WhyThisRevisit';

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
});

const explanation: RevisitExplanation = {
    limiting: null,
    conclusion: {
        label: 'Main lever',
        text: 'Use the value curve to choose a tested payload count that meets the requirement.',
    },
    factors: [
        {
            id: 'GEOMETRY', label: 'Geometry', value: 'lat 51.5° < reach 90.0° ✓',
            detail: 'The target is geometrically reachable.', status: 'OK', isLimiting: false,
            summaryLabel: 'Target reachable', summaryValue: '51.5°N is within the limit',
            showInSummary: false,
        },
        {
            id: 'PHASING', label: 'Phasing', value: 'f = 1.5 ⚠',
            detail: '1.5 is not an integer, so this is not a standard Walker constellation.',
            status: 'WARN', isLimiting: false,
            summaryLabel: 'Walker phasing', summaryValue: 'f = 1.5',
            showInSummary: true,
        },
        {
            id: 'PLANE_SPREAD', label: 'Plane spread', value: '4 × 3',
            detail: 'This is the best measured split.', status: 'OK', isLimiting: false,
            summaryLabel: 'Payload distribution',
            summaryValue: '12 payloads · 4 planes × 3/plane', showInSummary: true,
        },
        {
            id: 'ACCESS_WINDOWS', label: 'Access windows', value: '479 / 72 h',
            detail: '479 accesses over 72 h.', status: 'OK', isLimiting: false,
            summaryLabel: 'Observation opportunities',
            summaryValue: '479 access windows · 72 h', showInSummary: true,
        },
    ],
};

describe('What drives this result', () => {
    it('keeps the presenter summary concise and technical evidence collapsed', async () => {
        await act(async () => root?.render(<WhyThisRevisit explanation={explanation} />));

        expect(container.textContent).toContain('What drives this result');
        expect(container.textContent).toContain('Payload distribution');
        expect(container.textContent).toContain('Observation opportunities');
        expect(container.textContent).toContain('Main lever');

        const details = container.querySelector('details') as HTMLDetailsElement;
        expect(details).not.toBeNull();
        expect(details.open).toBe(false);
        expect(details.querySelector('summary')?.textContent).toContain('Technical details');
        expect(details.textContent).toContain('Geometry');

        const primaryList = container.querySelector(':scope > div > ul');
        expect(primaryList?.textContent).not.toContain('Target reachable');
        expect(primaryList?.textContent).not.toContain('Geometry');
    });

    it('gives a WARN factor a visible cue in the primary summary rather than hiding it in Technical details', async () => {
        await act(async () => root?.render(<WhyThisRevisit explanation={explanation} />));

        const primaryList = container.querySelector(':scope > div > ul');
        expect(primaryList?.textContent).toContain('Walker phasing');

        const phasingRow = [...primaryList!.querySelectorAll('li')]
            .find((li) => li.textContent?.includes('Walker phasing'))!;
        expect(phasingRow.querySelector('[aria-hidden="true"]')?.className).toContain('bg-amber-400');
    });

    it('reveals the engineering explanation only on request', async () => {
        await act(async () => root?.render(<WhyThisRevisit explanation={explanation} />));
        const details = container.querySelector('details') as HTMLDetailsElement;
        const summary = details.querySelector('summary') as HTMLElement;
        await act(async () => summary.click());
        expect(details.open).toBe(true);

        const geometry = [...details.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Geometry'))!;
        await act(async () => geometry.click());
        expect(details.textContent).toContain('The target is geometrically reachable.');
    });
});
