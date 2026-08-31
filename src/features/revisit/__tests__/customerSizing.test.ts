/**
 * `resolveCustomerSizing` — the sentence the salesperson reads out loud.
 *
 * The contract is mostly about pairs of statements that must never appear
 * together. The card prints the sizing outcome directly under the verdict
 * derived from the same measured gap, so any outcome that contradicts that gap
 * is visible to a customer, in the room, for as long as the target is selected.
 */

import { describe, expect, it } from 'vitest';
import {
    resolveCustomerSizing, type CustomerSizingInput,
} from '../analysis/customerSizing';
import { runPayloadSweep, type PayloadSweepResult, type SweepConfiguration } from '../analysis/payloadSweep';
import { executiveEnvelopePoints } from '../analysis/executiveEnvelope';
import { DEFAULT_REFERENCE, FOV_PRESETS, TARGET_PRESETS, defaultWindow } from '../domain/presets';
import type { GapStatistics, SubConstellationSpec } from '../domain/types';

const HOUR = 3600_000;

function statistics(maxGapMs: number | null): GapStatistics {
    return {
        maxGapMs,
        meanGapMs: maxGapMs,
        p95GapMs: maxGapMs,
        accessCount: 10,
        fractionInView: 0.02,
        meanAccessDurationMs: 300_000,
        totalInViewMs: 3_000_000,
        interiorGapCount: 9,
        boundaryGapsDiscarded: 2,
        coverage: 'INTERMITTENT',
        warnings: [],
    };
}

function configuration(
    selection: SubConstellationSpec,
    selectedPlanes: number,
    payloadsPerPlane: number,
    maxGapMs: number | null,
): SweepConfiguration {
    return { selection, selectedPlanes, payloadsPerPlane, maxGapMs, statistics: statistics(maxGapMs) };
}

/** One count, two splits: the winner spread over 6 planes, the loser over 12. */
function sweepAt48(bestMaxGapMs: number, alternativeMaxGapMs: number): PayloadSweepResult {
    const best = configuration({ planeStride: 2, satStride: 6, planeShift: 0 }, 6, 8, bestMaxGapMs);
    const alternative = configuration(
        { planeStride: 1, satStride: 12, planeShift: 0 }, 12, 4, alternativeMaxGapMs
    );
    return {
        points: [{
            payloadCount: 48,
            maxGapMs: best.maxGapMs,
            best,
            alternatives: [alternative],
            spreadAdvantage: 0.2,
        }],
        warnings: [],
    };
}

/** The state in the 2026-08-28 screenshot: 48 flown, 2 h 20 measured, 2 h asked. */
function input(overrides: Partial<CustomerSizingInput> = {}): CustomerSizingInput {
    return {
        currentMaxGapMs: 2 * HOUR + 20 * 60_000,
        requirementMs: 2 * HOUR,
        isArea: false,
        hasAreaAnalysis: false,
        hasInspectedPoint: true,
        sweep: sweepAt48(1.9 * HOUR, 2 * HOUR + 20 * 60_000),
        isSweeping: false,
        hasSweepError: false,
        recommendedPayloadCount: 48,
        currentPayloadCount: 48,
        // The split adopted for the REFERENCE target — 12 planes × 4.
        selection: { planeStride: 1, satStride: 12 },
        isConfigurationSettling: false,
        ...overrides,
    };
}

describe('resolveCustomerSizing', () => {
    /*
     * The defect this branch exists for. `RECOMMENDED` was reachable only
     * through a positive payload delta, so a recommendation costing nothing
     * fell through to `COVERED` — under a verdict computed from the same gap
     * that says the requirement is missed.
     */
    it('never says the current configuration covers a requirement it misses', () => {
        const sizing = resolveCustomerSizing(input());
        expect(sizing.kind).not.toBe('COVERED');
        expect(sizing).toEqual({
            kind: 'RETOPOLOGY',
            payloadCount: 48,
            split: { planes: 6, perPlane: 8 },
            maxGapMs: 1.9 * HOUR,
        });
    });

    it('proposes the measured split, not merely a different count', () => {
        const sizing = resolveCustomerSizing(input());
        if (sizing.kind !== 'RETOPOLOGY') throw new Error(`expected RETOPOLOGY, got ${sizing.kind}`);
        // The count it offers to apply is one the fleet already carries, so the
        // recommendation can never be read as an upsell.
        expect(sizing.payloadCount).toBeLessThanOrEqual(48);
        expect(sizing.maxGapMs).toBeLessThanOrEqual(2 * HOUR);
    });

    /*
     * Fewer payloads is the same class of answer: the sweep measured something
     * compliant that costs nothing. It must not degrade to `COVERED` either,
     * and it must not be dressed up as a negative "additional payloads" figure.
     */
    it('reports a compliant configuration below the current count as a reconfiguration', () => {
        const sweep = sweepAt48(1.9 * HOUR, 2.4 * HOUR);
        sweep.points.unshift({
            payloadCount: 36,
            maxGapMs: 1.5 * HOUR,
            best: configuration({ planeStride: 1, satStride: 16, planeShift: 0 }, 12, 3, 1.5 * HOUR),
            alternatives: [],
            spreadAdvantage: null,
        });

        const sizing = resolveCustomerSizing(input({ sweep, recommendedPayloadCount: 36 }));

        expect(sizing).toEqual({
            kind: 'RETOPOLOGY',
            payloadCount: 36,
            split: { planes: 12, perPlane: 3 },
            maxGapMs: 1.5 * HOUR,
        });
    });

    /*
     * Regression guard for the 2026-08-27 fix, which this branch sits directly
     * behind: during the reconcile the split about to be adopted is not yet the
     * one on screen, so the re-split branch would match and flash a
     * recommendation for a move the app is already making by itself.
     */
    it('keeps the reconcile window a wait rather than a recommendation', () => {
        expect(resolveCustomerSizing(input({ isConfigurationSettling: true })))
            .toEqual({ kind: 'COMPUTING' });
    });

    it('proposes nothing when the split on screen is already the measured best', () => {
        // Current selection IS the sweep's winner at this count, so there is
        // nothing to apply; only an inconsistency upstream could reach here.
        const sizing = resolveCustomerSizing(input({ selection: { planeStride: 2, satStride: 6 } }));
        expect(sizing).toEqual({ kind: 'COVERED' });
    });

    it('ignores plane shift, which applying does not change', () => {
        // z redistributes payloads within a rung and is carried across by
        // `selectionForPayloadCount`; treating it as a difference would offer a
        // button that changes nothing.
        const sweep = sweepAt48(1.9 * HOUR, 2.4 * HOUR);
        sweep.points[0].best.selection = { planeStride: 2, satStride: 6, planeShift: 3 };
        const sizing = resolveCustomerSizing(input({
            sweep, selection: { planeStride: 2, satStride: 6 },
        }));
        expect(sizing).toEqual({ kind: 'COVERED' });
    });

    it('still charges for payloads when the answer genuinely costs some', () => {
        // 72 is not a rung of this fixture's sweep, so there is no measured
        // split and no measured gap to attach — and none is invented.
        expect(resolveCustomerSizing(input({ recommendedPayloadCount: 72 })))
            .toEqual({
                kind: 'RECOMMENDED', payloadCount: 72, additionalPayloads: 24,
                split: null, maxGapMs: null,
            });
    });

    /*
     * P1 (2026-08-31). `RECOMMENDED` used to carry the count and the delta and
     * nothing else, so the card's only actionable state described neither the
     * topology its button was about to apply nor the revisit that topology
     * achieves — while `RETOPOLOGY` and `AREA_VERIFIED`, the two rarer states,
     * described both. The measurement was in hand the whole time: it is the
     * same sweep point the count comes from.
     */
    it('describes the configuration it is about to recommend', () => {
        const sizing = resolveCustomerSizing(input({
            currentPayloadCount: 24,
            recommendedPayloadCount: 48,
        }));

        expect(sizing).toEqual({
            kind: 'RECOMMENDED',
            payloadCount: 48,
            additionalPayloads: 24,
            // The sweep's MEASURED winner at 48, not the ladder's ordering.
            split: { planes: 6, perPlane: 8 },
            maxGapMs: 1.9 * HOUR,
        });
    });

    it('keeps the states that are not sizing answers intact', () => {
        expect(resolveCustomerSizing(input({ currentMaxGapMs: HOUR })).kind).toBe('COVERED');
        expect(resolveCustomerSizing(input({ isArea: true, hasAreaAnalysis: true })).kind)
            .toBe('AREA_NOT_SIZED');
        expect(resolveCustomerSizing(input({ isArea: true, hasAreaAnalysis: false })).kind)
            .toBe('UNAVAILABLE');
        expect(resolveCustomerSizing(input({ hasInspectedPoint: false })).kind).toBe('UNAVAILABLE');
        expect(resolveCustomerSizing(input({ hasSweepError: true })).kind).toBe('FAILED');
        expect(resolveCustomerSizing(input({ recommendedPayloadCount: null })).kind)
            .toBe('BEYOND_RANGE');
        expect(resolveCustomerSizing(input({ recommendedPayloadCount: null, isSweeping: true })).kind)
            .toBe('COMPUTING');
        expect(resolveCustomerSizing(input({ recommendedPayloadCount: null, sweep: null })).kind)
            .toBe('COMPUTING');
    });
});

/*
 * The synthetic sweep above is only worth what the real one says. This runs the
 * engine over the configuration that produced the defect and shows that the two
 * targets genuinely disagree about how to split the same 48 payloads — which is
 * why the shared topology cannot be assumed to be any one target's winner.
 */
describe('resolveCustomerSizing against a measured sweep', () => {
    const EPOCH = Date.UTC(2026, 7, 28);
    const window = defaultWindow(EPOCH);
    // Enough rungs for an envelope, few enough to keep the engine cost sane.
    const payloadCounts = [1, 24, 36, 48];
    const london = TARGET_PRESETS.find((target) => target.name === 'London')!;
    const singapore = TARGET_PRESETS.find((target) => target.name === 'Singapore')!;
    const sweepFor = (target: typeof london) => runPayloadSweep(
        DEFAULT_REFERENCE, target, FOV_PRESETS.STANDARD, window, { payloadCounts }
    );
    const londonSweep = sweepFor(london);
    const singaporeSweep = sweepFor(singapore);
    const at = (sweep: PayloadSweepResult, count: number) =>
        sweep.points.find((point) => point.payloadCount === count)!;

    it('measures a different winning split for each target at the same count', () => {
        const londonBest = at(londonSweep, 48).best;
        const singaporeBest = at(singaporeSweep, 48).best;

        expect(londonBest.selectedPlanes).toBe(12);
        expect(singaporeBest.selectedPlanes).toBe(6);
        expect(singaporeBest.selection).not.toEqual(londonBest.selection);
    });

    it('does not tell the secondary target its shared topology is enough', () => {
        const requirementMs = 2 * HOUR;
        // What the primary target's winner is reconciled to, fleet-wide.
        const shared = at(londonSweep, 48).best.selection;
        // What that same split delivers over the secondary target.
        const sharedOverSingapore = at(singaporeSweep, 48).alternatives
            .find((candidate) => candidate.selection.planeStride === shared.planeStride
                && candidate.selection.satStride === shared.satStride)!;

        expect(sharedOverSingapore.maxGapMs).toBeGreaterThan(requirementMs);
        expect(at(singaporeSweep, 48).maxGapMs).toBeLessThanOrEqual(requirementMs);

        const recommendedPayloadCount = executiveEnvelopePoints(singaporeSweep)
            .find((point) => point.maxGapMs !== null && point.maxGapMs <= requirementMs)
            ?.payloadCount ?? null;
        expect(recommendedPayloadCount).toBe(48);

        const sizing = resolveCustomerSizing({
            currentMaxGapMs: sharedOverSingapore.maxGapMs,
            requirementMs,
            isArea: false,
            hasAreaAnalysis: false,
            hasInspectedPoint: true,
            sweep: singaporeSweep,
            isSweeping: false,
            hasSweepError: false,
            recommendedPayloadCount,
            currentPayloadCount: 48,
            selection: shared,
            isConfigurationSettling: false,
        });

        expect(sizing).toEqual({
            kind: 'RETOPOLOGY',
            payloadCount: 48,
            split: { planes: 6, perPlane: 8 },
            maxGapMs: at(singaporeSweep, 48).maxGapMs,
        });
    });
});
