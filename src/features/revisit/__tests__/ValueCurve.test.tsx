// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValueCurve } from '../ui/ValueCurve';
import { formatGap } from '../analysis/gapStatistics';
import type { PayloadSweepResult } from '../analysis/payloadSweep';

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

const statistics = (maxGapMs: number) => ({
    coverage: 'INTERMITTENT' as const,
    maxGapMs,
    meanGapMs: maxGapMs,
    p95GapMs: maxGapMs,
    accessCount: 2,
    meanAccessDurationMs: 500,
    fractionInView: 0.1,
    totalInViewMs: 1_000,
    interiorGapCount: 1,
    boundaryGapsDiscarded: 2,
    warnings: [],
});

const sweep: PayloadSweepResult = {
    warnings: [],
    points: [
        {
            payloadCount: 4,
            maxGapMs: 2 * 3600_000,
            best: {
                selection: { planeStride: 2, satStride: 2, planeShift: 0 },
                selectedPlanes: 2,
                payloadsPerPlane: 2,
                maxGapMs: 2 * 3600_000,
                statistics: statistics(2 * 3600_000),
            },
            alternatives: [],
            spreadAdvantage: null,
        },
        {
            payloadCount: 8,
            maxGapMs: 60 * 60_000,
            best: {
                selection: { planeStride: 1, satStride: 2, planeShift: 0 },
                selectedPlanes: 4,
                payloadsPerPlane: 2,
                maxGapMs: 60 * 60_000,
                statistics: statistics(60 * 60_000),
            },
            alternatives: [],
            spreadAdvantage: null,
        },
    ],
};

describe('ValueCurve current-selection coherence', () => {
    it('does not describe a rejected sweep as measured output', async () => {
        await act(async () => root?.render(
            <ValueCurve
                sweep={null}
                isComputing={false}
                requirementMs={2 * 3600_000}
                currentPayloadCount={4}
                currentMaxGapMs={null}
                currentIsMeasuredBest={false}
                targetName="London"
                onSelectPayloadCount={() => undefined}
            />
        ));

        expect(container.textContent).toContain('no valid sweep');
        expect(container.textContent).toContain('No valid sweep is available');
        expect(container.textContent).not.toContain('measured outputs');
    });

    it('shows the exact manual KPI result rather than the sweep optimum', async () => {
        const manualGapMs = 5 * 3600_000;
        await act(async () => root?.render(
            <ValueCurve
                sweep={sweep}
                isComputing={false}
                requirementMs={2 * 3600_000}
                currentPayloadCount={4}
                currentMaxGapMs={manualGapMs}
                currentIsMeasuredBest={false}
                targetName="London"
                onSelectPayloadCount={() => undefined}
            />
        ));

        expect(container.textContent).toContain('Current manual split');
        expect(container.textContent).toContain(formatGap(manualGapMs));
        expect(container.textContent).not.toContain('Current configuration: 4 payloads');
        expect(container.querySelector('[aria-label^="Current manual split"]')).not.toBeNull();
    });

    it('labels a measured winner as the current configuration', async () => {
        await act(async () => root?.render(
            <ValueCurve
                sweep={sweep}
                isComputing={false}
                requirementMs={2 * 3600_000}
                currentPayloadCount={4}
                currentMaxGapMs={2 * 3600_000}
                currentIsMeasuredBest
                targetName="London"
                onSelectPayloadCount={() => undefined}
            />
        ));

        expect(container.textContent).toContain('Current configuration');
        expect(container.textContent).not.toContain('Current manual split');
    });
});
