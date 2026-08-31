/**
 * CustomerResultCard — the commercial answer (Programme 7A).
 *
 * REVISIT computed the right numbers long before it said the right sentence.
 * The first thing on screen used to be `MISSES 2 H REQUIREMENT`: true, and read
 * as a failure before it read as an opportunity — while the answer that turns
 * it into one, the payload count that would meet the requirement, sat in a
 * 10 px grey fragment and could not be acted on at all.
 *
 * This card leads the analysis column with the three things a salesperson has
 * to say out loud, in order:
 *
 *   1. the customer's question, phrased so it can be read verbatim;
 *   2. what the CURRENT configuration delivers, against the requirement;
 *   3. the RECOMMENDED configuration, and a control that applies it.
 *
 * ── WHY THE TWO BLOCKS HAVE SEPARATE STATES ─────────────────────────────────
 * The single-scenario analysis resolves in well under a second; the payload
 * sweep behind the recommendation can take ~30 s. Gating the whole card on the
 * slower one would hide the answer for half a minute to protect against a mixed
 * frame — the opposite of what a demonstration needs. So the current
 * configuration renders as soon as it is known, and the recommendation carries
 * its own `Calculating fleet sizing…`. Neither block ever shows the previous
 * scenario's value (plan, Programme 7 decisions 2 and 3).
 *
 * The verdict vocabulary is deliberately secondary to the answer: the status
 * pill states `Requirement covered` / `More payloads required` /
 * `Reconfiguration required` / `Assessment required` and
 * never leads with red.
 */

import React from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { RevisitAreaTargetRole } from '../domain/analysisTargets';
import { REVISIT_LABEL, REVISIT_OUTCOME, REVISIT_PANEL } from './revisitTheme';
import type { CustomerSizing } from '../analysis/customerSizing';

/*
 * The vocabulary is shared, so the decision is too: `CustomerSizing` and the
 * function that resolves it live in `analysis/customerSizing.ts`, where they can
 * be tested against a real sweep instead of through a render of the whole mode.
 */
export type { CustomerSizing };

export interface CustomerResultCardProps {
    /** Semantic colour carried by the result currently inspected in the sidebar. */
    targetRole?: RevisitAreaTargetRole;
    /** The customer's question, phrased to be read out loud verbatim. */
    question: string;
    /** Basis of a multi-target comparison, when there is more than one target. */
    currentPayloadCount: number;
    /** Payload-capable satellites in the active fleet — the `of 576` denominator. */
    fleetSize: number;
    /**
     * The split those payloads are flown in.
     *
     * `Current configuration` used to print the count and the fleet denominator
     * and stop, while the split it refers to lived in 10 px grey under the
     * payload slider, at the opposite corner of the screen. Once the
     * recommendation started stating its own split (P1), the reader was
     * comparing a described configuration against an undescribed one
     * (P5, 2026-08-31).
     *
     * The provenance note that shares that slider caption — `measured best of 6
     * splits at this count` — deliberately stays there: it qualifies the
     * control, not the answer.
     */
    currentSplit?: { planes: number; perPlane: number } | null;
    currentMaxGapMs: number | null;
    currentIsComputing: boolean;
    /**
     * Why there is no current figure, when there is none — "never in view over
     * this window", "area not yet analysed". Stated rather than left as `—`.
     */
    currentUnavailableReason?: string | null;
    /** Label of the current metric; an Area measures its least-covered cell. */
    currentMetricLabel?: string;
    requirementMs: number;
    sizing: CustomerSizing;
    /** Absent when there is nothing to apply. */
    onApply?: () => void;
    /** Offered only on `FAILED`, and only for a sweep that can be re-run. */
    onRetrySizing?: () => void;
    /**
     * Start an area sizing search. Absent when there is nothing to probe from —
     * the search needs a measured worst cell to start from.
     */
    onSizeArea?: () => void;
    /** Cells in the grid, so the control can state what it is about to cost. */
    areaCellCount?: number | null;
    /** Operational proof kept inside the answer instead of a duplicate card. */
    supportingMetrics?: React.ReactNode;
    /** Sizing evidence shown inside Recommended configuration. */
    recommendedConfigurationDetail?: React.ReactNode;
}

type Status = { text: string; className: string; title?: string };

/**
 * The two blocks of the answer are two CARDS, siblings of `Result drivers` in
 * the analysis column — not two panels nested inside a third.
 *
 * A single column separated by hairlines read as one long paragraph of numbers,
 * and the presenter had to remember which figure belonged to what is flown and
 * which to what is proposed. Nesting them inside the old outer card said the
 * opposite of the intent: one frame containing two frames still reads as one
 * object. So the outer frame is gone and each block carries `REVISIT_PANEL`,
 * the same chrome and the same padding as every other card in that column.
 */
const BLOCK_FRAME = `${REVISIT_PANEL} px-3 py-2.5`;

/**
 * The status is a function of the CURRENT result and the sizing outcome, in
 * that order — never of the sizing alone. A configuration that already meets
 * the requirement is `Requirement covered` whatever the sweep is doing.
 */
function customerStatus(
    meetsRequirement: boolean | null,
    sizing: CustomerSizing,
    /**
     * Whether the measurement can actually be offered. An unsized area drops
     * its verdict because the control replaces it — so when there is no
     * control, the verdict has to come back or the block says nothing at all.
     */
    canSizeArea: boolean,
): Status | null {
    if (meetsRequirement === true) {
        return { text: 'Requirement covered', className: REVISIT_OUTCOME.meets.badge };
    }
    /*
     * "Further engineering assessment required" was accurate and unreadable:
     * thirty-eight characters in a pill beside a section heading, wrapping to
     * two lines on a phone. The register is what mattered — it must not read as
     * a bug in the tool — and "Assessment required" keeps it in a third of the
     * width. The sentence it replaces survives on hover, and the block below
     * says which assessment and why in full.
     */
    if (sizing.kind === 'FAILED') {
        return {
            text: 'Assessment required',
            title: 'The fleet sizing sweep failed. The measured result above is unaffected; sizing needs a further engineering assessment.',
            className: REVISIT_OUTCOME.error.badge,
        };
    }
    /*
     * Before the catch-all below, deliberately. An area whose worst cell is
     * never in view has no current figure, so `meetsRequirement` is null and the
     * catch-all would claim "assessment required" while a search is running or
     * has already produced a verified answer.
     */
    /*
     * No badge in either of these two states, and that is the point. An area
     * with no sizing showed three things at once — a verdict pill, a sentence
     * saying nothing had been measured, and a button offering to measure it —
     * where one of them is the whole content: the offer. A running search is
     * the same case one step later: the progress line already says what is
     * happening, so a `Sizing…` pill above it repeated it in fewer words.
     *
     * Both return null, and the caller renders the slot empty. A missing verdict
     * is honest here: nothing has been measured to put in it.
     */
    if (sizing.kind === 'AREA_SIZING') return null;
    if (sizing.kind === 'AREA_NOT_SIZED') {
        if (canSizeArea) return null;
        /*
         * No probe cell, so no search: the sizing starts from the least-covered
         * cell of the analysis, and an area whose cells produced no measured
         * gap has none to start from. That IS an impasse, and it keeps its
         * verdict — the empty slot is only justified while a control fills it.
         */
        return {
            text: 'Assessment required',
            title: 'Sizing starts from the least-covered cell, and this area has no measured cell to start from. It needs a further engineering assessment.',
            className: REVISIT_OUTCOME.unavailable.badge,
        };
    }
    if (sizing.kind === 'AREA_VERIFIED') {
        if (sizing.additionalPayloads > 0) {
            return {
                text: 'More payloads required',
                title: 'A configuration was measured to meet the requirement on every cell of this area. It costs additional payloads.',
                className: REVISIT_OUTCOME.misses.badge,
            };
        }
        /*
         * Three cases, not two. `additionalPayloads <= 0` used to be answered
         * with a single title claiming the answer was found "at the payload
         * count already flown — the same budget, split differently", which is
         * simply FALSE of an area proposing 36 payloads where 48 are flown —
         * the case on screen when this was found (2026-08-31). The verdict word
         * is the same for both; the explanation behind it cannot be.
         */
        if (sizing.additionalPayloads < 0) {
            return {
                text: 'Reconfiguration required',
                title: 'A configuration was measured to meet the requirement on every cell of this area, and it uses fewer payloads than are flown today — a different split, not a larger fleet.',
                className: REVISIT_OUTCOME.misses.badge,
            };
        }
        return {
            text: 'Reconfiguration required',
            title: 'A configuration was measured to meet the requirement on every cell of this area, at the payload count already flown — the same budget, split differently.',
            className: REVISIT_OUTCOME.misses.badge,
        };
    }
    /*
     * A search that ran and found nothing IS an impasse, unlike one never run:
     * the ladder was walked and the evidence block below says how far. This is
     * the case the badge was built for.
     */
    if (sizing.kind === 'AREA_NOT_FOUND') {
        return {
            text: 'Assessment required',
            title: sizing.ruledOutByProbe
                ? 'No configuration on the tested ladder meets this requirement on the least-covered cell, which is part of the area.'
                : 'The search verified candidates over every cell and none met the requirement. It needs a further engineering assessment.',
            className: REVISIT_OUTCOME.unavailable.badge,
        };
    }
    if (meetsRequirement === null
        || sizing.kind === 'BEYOND_RANGE'
        || sizing.kind === 'UNAVAILABLE') {
        return {
            text: 'Assessment required',
            title: 'No payload count can be proposed for this case — the target is not in view, or the requirement is beyond the tested range. It needs a further engineering assessment.',
            className: REVISIT_OUTCOME.unavailable.badge,
        };
    }
    /*
     * Shortened for the same reason as `Assessment required`, and it was the
     * longer of the two at thirty-nine characters: the pill sits beside a
     * section heading and wrapped to two lines on a phone. What it must convey
     * is the miss, not the sentence.
     */
    if (sizing.kind === 'COMPUTING') {
        return {
            text: 'Below requirement',
            title: 'The current configuration does not meet the requirement. Fleet sizing is still calculating, so no payload count is proposed yet.',
            className: REVISIT_OUTCOME.misses.badge,
        };
    }
    // Still a miss, so still the miss colour — but the ask is a redistribution,
    // and saying "additional payloads" for a change that costs none would be
    // the same false claim in the opposite direction.
    if (sizing.kind === 'RETOPOLOGY') {
        return {
            text: 'Reconfiguration required',
            className: REVISIT_OUTCOME.misses.badge,
        };
    }
    return {
        // Shortened with the other two: the figure below it — `72 … +60` —
        // says which payloads and how many, so the pill only has to say that
        // the answer costs some.
        text: 'More payloads required',
        title: 'The requirement is met only by adding payloads to the current configuration.',
        className: REVISIT_OUTCOME.misses.badge,
    };
}

function RecommendedEvidenceDisclosure({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = React.useState(() => (
        typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(min-width: 768px)').matches
    ));

    return (
        <details
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
            className="mt-3 border-t border-slate-700/50 pt-2.5"
        >
            <summary className="revisit-label flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-black uppercase tracking-[0.1em] text-slate-300 md:min-h-8">
                Why this recommendation?
                <span aria-hidden="true" className="text-sm text-slate-500">{open ? '−' : '+'}</span>
            </summary>
            <div className="pb-1 pt-1">{children}</div>
        </details>
    );
}

/**
 * Roughly what a sizing search will cost, in seconds.
 *
 * Calibrated on 2026-08-31 measurements (HLD 12 × 48, 72 h @ 10 s): the probe is
 * ~3 s whatever the grid holds, and each verification is ~18 ms per cell, with
 * two or three verifications typical. Deliberately coarse and rounded to five
 * seconds — this is there so the wait is consented to, not so anyone can time
 * it. A machine slower than the one measured makes it optimistic, which is why
 * the label says "about".
 */
function estimatedSizingSeconds(cells: number): number {
    return Math.max(5, Math.round((3 + 2.5 * 0.018 * cells) / 5) * 5);
}

/**
 * The three lines every recommendation is made of, in one place.
 *
 * `RECOMMENDED`, `RETOPOLOGY` and `AREA_VERIFIED` answer the same question and
 * used to answer it in three different shapes: the point recommendation gave a
 * count and nothing else, the re-split gave a split and a sentence, the area
 * gave a split with its worst cell buried in 12 px grey beside it. A reader
 * comparing `Current` with `Recommended` had to re-learn the layout each time,
 * and on the area screen the figure that carries the argument — 10 h 26 → 1 h 1
 * — was typeset as the smaller of the two (2026-08-31).
 *
 * So: headline, then what it is made of, then what it MEASURES — and the
 * measurement uses the same label and the same `<dl>` shape as the current
 * block directly above it, because the two are meant to be read as one
 * comparison.
 */
function RecommendedHeadline({ value, unit, delta }: {
    value: string;
    unit: string;
    /** The payload cost, when there is one. Never rendered for a saving. */
    delta?: number;
}) {
    return (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 leading-none">
            <span className="text-2xl font-black text-white tabular-nums">{value}</span>
            <span className="text-[13px] font-semibold text-slate-300">{unit}</span>
            {delta !== undefined && delta > 0 && (
                /* The delta is what the recommendation COSTS, so it carries the
                   miss colour the badge above it uses. In slate it read as one
                   more neutral figure. */
                <span className={`text-[13px] font-black tabular-nums ${REVISIT_OUTCOME.misses.text}`}>
                    +{delta}
                </span>
            )}
        </p>
    );
}

/**
 * What the recommendation is made of. Hidden on a short stage, so nothing that
 * only appears here may be load-bearing — the cost sentence and the measured
 * gap are both outside it, deliberately.
 */
function RecommendedComposition({ split, payloadCount, fleetSize }: {
    split: { planes: number; perPlane: number } | null;
    /** Omitted when the headline already IS the payload count. */
    payloadCount?: number;
    fleetSize: number;
}) {
    const parts = [
        split ? `${split.planes} planes × ${split.perPlane} per plane` : null,
        payloadCount !== undefined ? `${payloadCount} payload-equipped satellites` : null,
        `within the ${fleetSize}-satellite active fleet`,
    ].filter((part): part is string => part !== null);

    return (
        <p className="revisit-customer-secondary mt-0.5 text-[12px] leading-4 text-slate-400">
            {parts.join(' · ')}
        </p>
    );
}

/**
 * What the proposal COSTS, when it does not cost payloads.
 *
 * Shared by `RETOPOLOGY` and `AREA_VERIFIED` because they were drifting: the
 * point re-split stated its saving and the verified area did not, so an area
 * proposing 36 payloads against 48 flown printed `Reconfiguration required`,
 * `36`, `12 planes × 3` — and left the reader to do the subtraction
 * (2026-08-31).
 *
 * Renders nothing above the current count: there the `+N` chip on the headline
 * has already said it, and saying it twice is how the two drifted in the first
 * place.
 *
 * This is the only ALWAYS-VISIBLE statement of a saving — the composition line
 * is `revisit-customer-secondary` and is hidden on a short stage — and it is
 * deliberately not the `meets` lime: it sits under `Reconfiguration required`,
 * and lime is the colour that says the requirement IS met.
 */
function RecommendedCost({ payloadCount, currentPayloadCount }: {
    payloadCount: number;
    currentPayloadCount: number;
}) {
    if (payloadCount > currentPayloadCount) return null;
    return (
        <p className="mt-1 text-[13px] leading-5 text-slate-200">
            {payloadCount < currentPayloadCount
                ? `${currentPayloadCount - payloadCount} fewer payloads than the current `
                    + 'configuration.'
                : 'The payloads already flown, redistributed — no additional payloads required.'}
        </p>
    );
}

/**
 * The measured worst case of the proposal, in the shape the current block uses
 * for its own — same label, same size, same alignment, one card apart.
 */
function RecommendedMeasurement({ label, maxGapMs }: {
    label: string;
    maxGapMs: number | null;
}) {
    if (maxGapMs === null) return null;
    return (
        <dl className="mt-2 text-[13px] leading-5">
            <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-400">{label}</dt>
                <dd className="font-black tabular-nums text-slate-100">{formatGap(maxGapMs)}</dd>
            </div>
        </dl>
    );
}

function SizingBlock({
    sizing, status, question, targetRole, fleetSize, currentPayloadCount,
    currentMetricLabel, onApply, onRetrySizing, onSizeArea, areaCellCount, detail,
}: {
    /** Absent when nothing has been measured to put a verdict on. */
    status: Status | null;
    question: string;
    targetRole: RevisitAreaTargetRole;
    sizing: CustomerSizing;
    fleetSize: number;
    currentPayloadCount: number;
    /** The current block's metric label, reused so the two figures compare. */
    currentMetricLabel: string;
    onApply?: () => void;
    onRetrySizing?: () => void;
    onSizeArea?: () => void;
    areaCellCount?: number | null;
    detail?: React.ReactNode;
}) {
    if (sizing.kind === 'UNAVAILABLE') return null;

    /*
     * One control for every measured proposal. Keeping one button rather than
     * one per kind is what stops a measured recommendation from being
     * un-actionable — twice now:
     *
     *   - the re-split case had no way to be adopted from this card at all;
     *   - `AREA_VERIFIED` had none either, so the screen that makes the
     *     STRONGEST claim in the module — a configuration measured on every
     *     cell of the grid, with its search evidence printed underneath — was
     *     the one screen offering nothing to do about it, while a point
     *     recommendation one click away offered a button on a weaker claim
     *     (2026-08-31). The presenter had to read the split out loud and
     *     reproduce it by hand in the Advanced drawer.
     *
     * The three are NOT applied through the same helper: see
     * `handleApplyRecommendation`. An area adopts the strides its search
     * verified over the grid, never the point sweep's best at that count.
     */
    const offersApply = sizing.kind === 'RECOMMENDED'
        || sizing.kind === 'RETOPOLOGY'
        || sizing.kind === 'AREA_VERIFIED';

    return (
        <div
            className={BLOCK_FRAME}
            aria-label="Recommended configuration"
            aria-live="polite"
            aria-busy={sizing.kind === 'COMPUTING' || undefined}
        >
            {/*
              * Label, question, verdict — in that order, and the order is the
              * argument. The label names the block the way every other card in
              * the column is named; the question is what this block answers,
              * which is why it moved here from the top of the card; and the
              * badge sits under the question because it IS the answer to it.
              * Badge beside the label made it a property of the heading rather
              * than a reply.
              */}
            <span className={REVISIT_LABEL}>Recommended configuration</span>
            <p className="mt-1 text-[13px] font-semibold leading-5 text-slate-100">{question}</p>
            {status && (
                <span
                    title={status.title}
                    className={`revisit-customer-status mt-2 inline-flex rounded-md border px-2 py-0.5 text-[12px] font-black uppercase tracking-[0.14em] ${status.className}`}
                >
                    {status.text}
                </span>
            )}

            {sizing.kind === 'COMPUTING' && (
                <p className="mt-1 text-[13px] italic leading-5 text-slate-400">
                    Calculating fleet sizing…
                </p>
            )}

            {/* Nothing more to say on COVERED: the badge beside the heading is
                the whole message, and "no additional payloads required" under a
                badge reading "Requirement covered" was the same sentence
                twice. */}

            {/*
                A failed sweep is stated here, in the block it would have
                filled, and nowhere else. It deliberately does NOT raise the
                presentation notice: the answer above this line is computed and
                correct, and covering it with a red banner because a secondary
                calculation failed is what this replaces.
            */}
            {sizing.kind === 'FAILED' && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    Fleet sizing could not be calculated. The result above is unaffected.
                    {onRetrySizing && (
                        <>
                            {' '}
                            <button
                                type="button"
                                onClick={onRetrySizing}
                                className="revisit-retry-sizing font-bold text-sky-300 underline decoration-dotted underline-offset-2 transition-colors hover:text-sky-200"
                            >
                                Retry
                            </button>
                        </>
                    )}
                </p>
            )}

            {sizing.kind === 'AREA_SIZING' && (
                <p className="mt-2 text-[13px] italic leading-5 text-slate-400">
                    {sizing.phase === 'probe'
                        ? 'Probing the topology ladder on the least-covered cell…'
                        : `Verifying candidate ${sizing.candidate} over every cell — `
                            + `${Math.round(sizing.fraction * 100)}%`}
                </p>
            )}

            {sizing.kind === 'AREA_VERIFIED' && (
                <>
                    <RecommendedHeadline
                        value={String(sizing.payloadCount)}
                        unit="payload-equipped satellites"
                        delta={sizing.additionalPayloads}
                    />
                    <RecommendedComposition
                        split={{ planes: sizing.selectedPlanes, perPlane: sizing.payloadsPerPlane }}
                        fleetSize={fleetSize}
                    />
                    {/* The worst cell was a 12 px fragment beside the split while
                        the CURRENT worst cell was a labelled row — so the 10 h 26
                        → 1 h 1 collapse, which is the entire argument, was
                        typeset with its winning half the smaller of the two. */}
                    <RecommendedMeasurement
                        label={currentMetricLabel}
                        maxGapMs={sizing.worstCellGapMs}
                    />
                    {/*
                      * The scope of the claim, stated where the number is, not in
                      * a tooltip. "Verified" is what was done — every cell was
                      * measured at this configuration. "Optimal" is what was NOT
                      * done: the probe ranks candidates on one cell, so a cheaper
                      * rung it ranked lower may also pass.
                      */}
                    <RecommendedCost
                        payloadCount={sizing.payloadCount}
                        currentPayloadCount={currentPayloadCount}
                    />
                    <p className="mt-1 text-[12px] leading-4 text-lime-200">
                        Verified on every cell of this area
                        {sizing.candidatesTried > 1
                            && ` · ${sizing.candidatesTried} candidates tried`}
                        . Not proved minimal.
                    </p>
                </>
            )}

            {sizing.kind === 'BEYOND_RANGE' && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    No configuration on the tested payload range meets this requirement.
                </p>
            )}

            {/*
              * The whole content of this state: one control, in the slot the
              * verdict would occupy, directly under the question it answers.
              *
              * It is labelled for the ANSWER, not the operation. "Size this
              * area" named a piece of machinery and left the reader to work out
              * that the machinery produces the missing number. "Measure
              * payloads" names what comes back — kept to two words because the
              * cost annotation shares the line, and a label that wraps turns one
              * control into two lines of shouting capitals.
              *
              * Asked for, not automatic: the search costs a ladder probe plus a
              * full area pass per candidate, and it must not start while
              * someone is still drawing the polygon.
              */}
            {sizing.kind === 'AREA_NOT_SIZED' && !onSizeArea && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    No payload count can be measured here: the search starts from the
                    least-covered cell, and this area has no measured cell to start from.
                </p>
            )}

            {sizing.kind === 'AREA_NOT_SIZED' && onSizeArea && (
                <button
                    type="button"
                    onClick={onSizeArea}
                    title="Walk the topology ladder on the least-covered cell, then verify each candidate over every cell of the grid. The estimate is approximate: it depends on how many candidates have to be verified."
                    className="revisit-size-area mt-2 min-h-11 w-full rounded-lg border border-slate-400/70 bg-slate-100/10 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-slate-100 transition-colors hover:border-white hover:bg-white/15"
                >
                    Measure payloads
                    {/* The cost, before it is paid. A control that takes ten
                        seconds and says nothing gets clicked twice. */}
                    {areaCellCount ? (
                        <span className="ml-2 font-semibold normal-case tracking-normal text-slate-400">
                            {areaCellCount} cells · about {estimatedSizingSeconds(areaCellCount)} s
                        </span>
                    ) : null}
                </button>
            )}

            {/*
              * A measured absence. The badge above says "assessment required";
              * this says what was searched, and the evidence block underneath
              * says how far it got. No button: the search already ran, and
              * re-offering it as if nothing had happened would hide that.
              */}
            {sizing.kind === 'AREA_NOT_FOUND' && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    {sizing.ruledOutByProbe
                        ? 'No configuration on the tested ladder meets this requirement on the '
                            + 'least-covered cell of this area.'
                        : sizing.stoppedAtCeiling
                            ? 'The search reached its candidate limit without finding a '
                                + 'configuration that meets the requirement everywhere.'
                            : 'Every candidate verified over the grid failed on at least one cell.'}
                </p>
            )}

            {sizing.kind === 'RECOMMENDED' && (
                <>
                    <RecommendedHeadline
                        value={String(sizing.payloadCount)}
                        unit="payload-equipped satellites"
                        delta={sizing.additionalPayloads}
                    />
                    {/* The split and the measured gap were BOTH absent here
                        until 2026-08-31: this block proposed a payload count,
                        carried the button that applies it, and never said which
                        topology it was about to apply or what revisit it
                        achieves. Both are measured; both are now stated. */}
                    <RecommendedComposition split={sizing.split} fleetSize={fleetSize} />
                    <RecommendedMeasurement
                        label={currentMetricLabel}
                        maxGapMs={sizing.maxGapMs}
                    />
                </>
            )}

            {/*
                The change IS the split, so the split is what the eye lands on.
                Leading with the payload count here would print the number that
                is NOT changing in the position reserved for the answer.
            */}
            {sizing.kind === 'RETOPOLOGY' && (
                <>
                    <RecommendedHeadline
                        value={`${sizing.split.planes} × ${sizing.split.perPlane}`}
                        unit="planes × payloads per plane"
                    />
                    <RecommendedComposition
                        split={null}
                        payloadCount={sizing.payloadCount}
                        fleetSize={fleetSize}
                    />
                    <RecommendedMeasurement
                        label={currentMetricLabel}
                        maxGapMs={sizing.maxGapMs}
                    />
                    {/*
                      * The COST, alone — the measurement above it is now a
                      * labelled row like the current block's, so this line no
                      * longer has to carry both.
                      *
                      * NOT the `meets` lime. Above this sits `Reconfiguration
                      * required`, the verdict on what is FLOWN; painted in lime
                      * — the `Requirement covered` colour everywhere else in
                      * this module — the two read as a contradiction: the badge
                      * says the requirement is missed and the sentence under it
                      * looked like the badge that says it is met (reported
                      * 2026-08-31). Slate is the neutral register and is
                      * covered in both themes (`index.css`, `.text-slate-200`).
                      *
                      * "No additional payloads required" is true of a re-split
                      * and badly understates a proposal that frees 58 of them,
                      * so the two cases are worded separately. This is the only
                      * ALWAYS-VISIBLE statement of the saving: the composition
                      * line above is `revisit-customer-secondary` and is hidden
                      * on a short stage.
                      */}
                    <RecommendedCost
                        payloadCount={sizing.payloadCount}
                        currentPayloadCount={currentPayloadCount}
                    />
                </>
            )}

            {/*
              * The consequence lives on the control rather than under it. As a
              * paragraph it was the line nobody read on a card that already
              * carries a question, a verdict, six figures and a chart; as a
              * title it is there for whoever wonders what "apply" costs.
              *
              * The topology is SHARED, so applying from a secondary target
              * retunes what the primary flies too — which is the half a
              * presenter is most likely to be asked about.
              */}
            {offersApply && onApply && (
                <button
                    type="button"
                    onClick={onApply}
                    title={targetRole === 'COMPARISON'
                        ? 'Optimises the shared topology for the secondary target, so the primary target stops driving it.'
                        : 'Applies this split to the shared topology — every compared target is then analysed on this configuration.'}
                    className="revisit-apply-recommended mt-2 min-h-11 w-full rounded-lg border border-slate-400/70 bg-slate-100/10 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-slate-100 transition-colors hover:border-white hover:bg-white/15"
                >
                    Apply recommended configuration
                </button>
            )}

            {detail && <RecommendedEvidenceDisclosure>{detail}</RecommendedEvidenceDisclosure>}
        </div>
    );
}

export const CustomerResultCard: React.FC<CustomerResultCardProps> = ({
    targetRole = 'REFERENCE', question, currentPayloadCount, fleetSize,
    currentSplit = null,
    currentMaxGapMs, currentIsComputing, currentUnavailableReason = null,
    currentMetricLabel = 'Maximum gap', requirementMs, sizing,
    onApply, onRetrySizing, onSizeArea, areaCellCount = null, supportingMetrics = null,
    recommendedConfigurationDetail = null,
}) => {
    const meetsRequirement = currentMaxGapMs === null ? null : currentMaxGapMs <= requirementMs;
    const status = customerStatus(meetsRequirement, sizing, Boolean(onSizeArea));

    return (
        <section
            /* A bare stack: the cards below are the surfaces, this only groups
               them and keeps the role accent that colours their labels. */
            className={`revisit-customer-result revisit-result-${targetRole.toLowerCase()} space-y-2`}
            aria-label="Customer result"
            data-revisit-result-role={targetRole.toLowerCase()}
        >
            {/*
              * The question, then the numbers. What stood between them — the
              * comparison basis, and the verdict badge — said twice what the
              * card says once: the basis repeated the target list beside it,
              * and the badge announced an outcome the reader had not been given
              * the figures for yet. The badge now heads the Recommended
              * configuration block, where it is the conclusion of what precedes
              * it rather than a claim ahead of it.
              */}
            {/*
              * Nothing to size against means no Recommended frame, and the
              * question would go with it — the one line of this card that is
              * read out loud. It stays at the top in that case alone.
              */}
            {sizing.kind === 'UNAVAILABLE' && (
                <p className={`${BLOCK_FRAME} text-[13px] font-semibold leading-5 text-slate-100`}>
                    {question}
                </p>
            )}

            <div className={BLOCK_FRAME}>
                <span className={REVISIT_LABEL}>Current configuration</span>
                <p className="mt-1 flex flex-wrap items-baseline gap-x-2 leading-none">
                    <span className="text-2xl font-black text-white tabular-nums">
                        {currentPayloadCount}
                    </span>
                    <span className="text-[13px] font-semibold text-slate-300">
                        payload-equipped satellites
                    </span>
                </p>
                <RecommendedComposition split={currentSplit} fleetSize={fleetSize} />

                <dl className="mt-2 space-y-1 text-[13px] leading-5">
                    <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-slate-400">{currentMetricLabel}</dt>
                        <dd className="font-black tabular-nums text-slate-100">
                            {currentMaxGapMs !== null
                                ? formatGap(currentMaxGapMs)
                                : currentIsComputing ? 'measuring…' : '—'}
                        </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-slate-400">Requirement</dt>
                        <dd className="font-black tabular-nums text-slate-100">
                            {formatGap(requirementMs)}
                        </dd>
                    </div>
                </dl>
                {currentMaxGapMs === null && !currentIsComputing && currentUnavailableReason && (
                    <p className="mt-1 text-[12px] leading-4 text-slate-400">{currentUnavailableReason}</p>
                )}

                {/*
                  * The verdict lives at the head of Recommended configuration —
                  * except when there is nothing to size against, where that
                  * whole block is absent by design. Without this the card lost
                  * its verdict entirely in the one case that most needs one:
                  * a target never in view. Caught by the test that pins it.
                  */}
                {sizing.kind === 'UNAVAILABLE' && status && (
                    <span
                        title={status.title}
                        className={`revisit-customer-status mt-2 inline-flex rounded-md border px-2 py-0.5 text-[12px] font-black uppercase tracking-[0.14em] ${status.className}`}
                    >
                        {status.text}
                    </span>
                )}

                {/*
                  * Inside the frame, not between the two. Average revisit,
                  * passes per day and in-view fraction describe what the
                  * CURRENT configuration achieves — floating them between two
                  * cards left the segmentation half done and the figures
                  * belonging to neither.
                  */}
                {supportingMetrics}
            </div>

            <SizingBlock
                sizing={sizing}
                status={status}
                question={question}
                targetRole={targetRole}
                fleetSize={fleetSize}
                currentPayloadCount={currentPayloadCount}
                currentMetricLabel={currentMetricLabel}
                onApply={onApply}
                onRetrySizing={onRetrySizing}
                onSizeArea={onSizeArea}
                areaCellCount={areaCellCount}
                detail={recommendedConfigurationDetail}
            />
        </section>
    );
};
