/**
 * customerSizing.ts — what the sizing sweep has to propose, as one decision.
 *
 * This used to live inline in `RevisitApp`, where it could only be exercised
 * through a full render of the mode. It is pure and it is the sentence a
 * salesperson reads out loud, so it is worth being able to test directly
 * against a sweep — which is how the 2026-08-28 defect below is now pinned.
 */

import type { PayloadSweepResult } from './payloadSweep';
import type { SubConstellationSpec } from '../domain/types';

/**
 * What the fleet sizing has to say. These are not interchangeable and the
 * distinction is the whole point of the customer result card:
 *
 * - `COVERED`        the current configuration already meets the requirement;
 * - `RECOMMENDED`    a measured configuration on the ladder meets it, and it
 *                    costs additional payloads;
 * - `RETOPOLOGY`     a measured configuration meets it WITHOUT additional
 *                    payloads — the same budget (or less) split differently;
 * - `COMPUTING`      the sweep has not answered yet — a wait, not an answer;
 * - `BEYOND_RANGE`   the sweep answered: nothing on the tested ladder meets it;
 * - `AREA_NOT_SIZED` an Area is being analysed and no area-wide sizing sweep
 *                    exists, so no payload figure may be proposed at all
 *                    (Programme 5b guardrail, kept as an invariant here);
 * - `UNAVAILABLE`    there is no current result to size against.
 */
export type CustomerSizing =
    | { kind: 'COVERED' }
    | { kind: 'RECOMMENDED'; payloadCount: number; additionalPayloads: number }
    /**
     * The requirement is met at a payload count the fleet ALREADY carries — by
     * distributing those payloads across a different number of planes.
     *
     * This exists because `RECOMMENDED` was reachable only through a positive
     * payload delta, so a recommendation that costs nothing degraded to
     * `COVERED` and the card said `Additional payloads required` and `Met by
     * the current configuration` in the same frame, permanently (2026-08-28).
     * The topology is shared across every compared target, so the split adopted
     * for the reference target is routinely not the winner for a comparison
     * target at the same count — this is the normal case, not an edge case.
     *
     * `payloadCount` is never greater than the current count. Equal means a
     * pure re-split; lower means the requirement is met with fewer payloads.
     */
    | {
        kind: 'RETOPOLOGY';
        payloadCount: number;
        split: { planes: number; perPlane: number };
        /** Worst-case revisit the sweep MEASURED for that split, ms. */
        maxGapMs: number;
    }
    | { kind: 'COMPUTING' }
    /**
     * The sizing sweep failed while the result above is fine.
     *
     * A separate kind rather than `UNAVAILABLE` because the two say different
     * things to the room: `UNAVAILABLE` means no sizing applies here, `FAILED`
     * means one applies and did not complete — which is recoverable, and is why
     * this is the only sizing state that offers an action.
     */
    | { kind: 'FAILED' }
    | { kind: 'BEYOND_RANGE' }
    | { kind: 'AREA_NOT_SIZED' }
    | { kind: 'UNAVAILABLE' };

export interface CustomerSizingInput {
    /** Worst-case gap of the result on screen, ms. Null when there is none. */
    currentMaxGapMs: number | null;
    requirementMs: number;
    /** An Area is judged on its least-covered cell and is never sized. */
    isArea: boolean;
    /** Whether that Area has produced an analysis. Ignored outside an Area. */
    hasAreaAnalysis: boolean;
    /** Whether a point is inspected. Ignored inside an Area. */
    hasInspectedPoint: boolean;
    /** The payload sweep for the INSPECTED target, not for the reference. */
    sweep: PayloadSweepResult | null;
    isSweeping: boolean;
    hasSweepError: boolean;
    /**
     * Smallest measured count meeting the requirement, from the executive
     * envelope of the same sweep. Null when the sweep found none.
     */
    recommendedPayloadCount: number | null;
    currentPayloadCount: number;
    /** The strides on screen. `planeShift` is deliberately not part of this. */
    selection: Pick<SubConstellationSpec, 'planeStride' | 'satStride'>;
    /** True while `reconcileToMeasuredBest` still has a move to make. */
    isConfigurationSettling: boolean;
}

/**
 * The sizing outcome.
 *
 * `COMPUTING` is a wait and `BEYOND_RANGE` is an answer; conflating them is
 * what made the old `To target: beyond the tested payload range` appear while
 * the sweep that would have contradicted it was still running.
 *
 * An Area never yields a payload figure: it is judged on its least-covered cell
 * and no area-wide sizing sweep exists (Programme 5b guardrail).
 */
export function resolveCustomerSizing(input: CustomerSizingInput): CustomerSizing {
    const {
        currentMaxGapMs, requirementMs, isArea, hasAreaAnalysis, hasInspectedPoint,
        sweep, isSweeping, hasSweepError, recommendedPayloadCount, currentPayloadCount,
        selection, isConfigurationSettling,
    } = input;

    const covered = currentMaxGapMs !== null && currentMaxGapMs <= requirementMs;
    if (covered) return { kind: 'COVERED' };
    if (isArea) return hasAreaAnalysis ? { kind: 'AREA_NOT_SIZED' } : { kind: 'UNAVAILABLE' };
    if (!hasInspectedPoint) return { kind: 'UNAVAILABLE' };
    // A failed sweep is a sizing state, not a presentation-wide failure.
    if (hasSweepError) return { kind: 'FAILED' };
    const recommended = recommendedPayloadCount;
    if (recommended === null) {
        // No answer yet is not the same as no answer at all.
        return isSweeping || !sweep ? { kind: 'COMPUTING' } : { kind: 'BEYOND_RANGE' };
    }
    const additionalPayloads = recommended - currentPayloadCount;
    if (additionalPayloads > 0) {
        return { kind: 'RECOMMENDED', payloadCount: recommended, additionalPayloads };
    }
    /*
     * The measured best at the CURRENT count already meets the requirement
     * while the current topology does not — `reconcileToMeasuredBest` has not
     * adopted it yet. Announcing "no additional payloads required" in that
     * window contradicts the verdict printed directly above it: the card showed
     * `Additional payloads required` over a 3 h 10 min gap against a 2 h
     * requirement, and `Met by the current configuration` in the same frame.
     * The reconcile is milliseconds away; say it is still being computed rather
     * than say two opposite things at once.
     *
     * This is checked BEFORE the re-split branch below on purpose: during the
     * reconcile the split about to be adopted is not the one on screen, so that
     * branch would fire and flash `Reconfiguration required` for a frame at a
     * configuration the app is already moving to on its own.
     */
    if (isConfigurationSettling) return { kind: 'COMPUTING' };
    /*
     * Settled, still missing, and the sweep's answer costs no payloads.
     *
     * The topology is shared across every compared target, and
     * `reconcileToMeasuredBest` sets it from the REFERENCE target's sweep. A
     * comparison target routinely has a different winner at the same count —
     * London's 48 payloads want 12 planes × 4 (1 h 13) while Singapore's want
     * 6 × 8 (1 h 54, against 2 h 22 for London's split). Both are measured;
     * only one is on screen.
     *
     * Before this branch existed, `additionalPayloads <= 0` fell straight
     * through to `COVERED`, so the card announced `Additional payloads
     * required` and `Met by the current configuration` at once — not for a
     * frame, but for as long as that target was inspected — and the 20 %
     * improvement available at zero cost could not be applied from the card at
     * all (2026-08-28).
     *
     * `recommended <= currentPayloadCount` here, so this never proposes
     * spending anything. The strides are compared rather than the whole
     * selection because `planeShift` is carried across unchanged by
     * `selectionForPayloadCount`, and is therefore not what applying changes.
     */
    const recommendedPoint = sweep?.points
        .find((point) => point.payloadCount === recommended) ?? null;
    if (
        recommendedPoint
        && recommendedPoint.maxGapMs !== null
        && (recommendedPoint.best.selection.planeStride !== selection.planeStride
            || recommendedPoint.best.selection.satStride !== selection.satStride)
    ) {
        return {
            kind: 'RETOPOLOGY',
            payloadCount: recommended,
            split: {
                planes: recommendedPoint.best.selectedPlanes,
                perPlane: recommendedPoint.best.payloadsPerPlane,
            },
            maxGapMs: recommendedPoint.maxGapMs,
        };
    }
    /*
     * Nothing left to propose that is not already on screen. Reaching this with
     * `covered === false` would be an inconsistency between the single-scenario
     * result and the sweep, not a state to render — the branches above now
     * cover every way the sweep can disagree with the current configuration.
     */
    return { kind: 'COVERED' };
}
