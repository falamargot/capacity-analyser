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
    /** Present only while an undo memory exists. */
    onUndo?: () => void;
    /** Offered only on `FAILED`, and only for a sweep that can be re-run. */
    onRetrySizing?: () => void;
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
function customerStatus(meetsRequirement: boolean | null, sizing: CustomerSizing): Status {
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
    if (meetsRequirement === null
        || sizing.kind === 'BEYOND_RANGE'
        || sizing.kind === 'AREA_NOT_SIZED'
        || sizing.kind === 'UNAVAILABLE') {
        return {
            text: 'Assessment required',
            title: 'No payload count can be proposed for this case — the target is not in view, the requirement is beyond the tested range, or an area has no sizing sweep. It needs a further engineering assessment.',
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

function SizingBlock({
    sizing, status, question, targetRole, fleetSize, currentPayloadCount,
    onApply, onUndo, onRetrySizing, detail,
}: {
    status: Status;
    question: string;
    targetRole: RevisitAreaTargetRole;
    sizing: CustomerSizing;
    fleetSize: number;
    currentPayloadCount: number;
    onApply?: () => void;
    onUndo?: () => void;
    onRetrySizing?: () => void;
    detail?: React.ReactNode;
}) {
    if (sizing.kind === 'UNAVAILABLE') return null;

    /*
     * Both proposals are applied by the same control, through the same helper
     * (`selectionForPayloadCount`). Keeping one button rather than one per kind
     * is what stops a measured recommendation from being un-actionable: the
     * re-split case had no way to be adopted from this card at all.
     */
    const offersApply = sizing.kind === 'RECOMMENDED' || sizing.kind === 'RETOPOLOGY';

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
            <span
                title={status.title}
                className={`revisit-customer-status mt-2 inline-flex rounded-md border px-2 py-0.5 text-[12px] font-black uppercase tracking-[0.14em] ${status.className}`}
            >
                {status.text}
            </span>

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

            {sizing.kind === 'BEYOND_RANGE' && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    No configuration on the tested payload range meets this requirement.
                </p>
            )}

            {/* Programme 5b guardrail: an Area is judged on its least-covered
                cell, and no area-wide sizing sweep exists. Proposing a payload
                count here would be an invented number. */}
            {sizing.kind === 'AREA_NOT_SIZED' && (
                <p className="mt-1 text-[13px] leading-5 text-slate-300">
                    Area sizing has not been calculated. No payload count is proposed for an area.
                </p>
            )}

            {sizing.kind === 'RECOMMENDED' && (
                <>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 leading-none">
                        <span className="text-2xl font-black text-white tabular-nums">
                            {sizing.payloadCount}
                        </span>
                        <span className="text-[13px] font-semibold text-slate-300">
                            payload-equipped satellites
                        </span>
                        {/* The delta is what the recommendation COSTS, so it
                            carries the miss colour the badge above it uses. In
                            slate it read as one more neutral figure. */}
                        <span className={`text-[13px] font-black tabular-nums ${REVISIT_OUTCOME.misses.text}`}>
                            +{sizing.additionalPayloads}
                        </span>
                    </p>
                    <p className="revisit-customer-secondary mt-0.5 text-[12px] leading-4 text-slate-400">
                        within the {fleetSize}-satellite active fleet
                    </p>
                </>
            )}

            {/*
                The change IS the split, so the split is what the eye lands on.
                Leading with the payload count here would print the number that
                is NOT changing in the position reserved for the answer.
            */}
            {sizing.kind === 'RETOPOLOGY' && (
                <>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 leading-none">
                        <span className="text-2xl font-black text-white tabular-nums">
                            {sizing.split.planes} × {sizing.split.perPlane}
                        </span>
                        <span className="text-[13px] font-semibold text-slate-300">
                            planes × payloads per plane
                        </span>
                    </p>
                    <p className="revisit-customer-secondary mt-0.5 text-[12px] leading-4 text-slate-400">
                        {sizing.payloadCount} payload-equipped satellites within the {fleetSize}-satellite
                        active fleet — {sizing.payloadCount === currentPayloadCount
                            ? 'the payloads already flown, redistributed'
                            : `${currentPayloadCount - sizing.payloadCount} fewer than the current configuration`}.
                    </p>
                    <p className="mt-1 text-[13px] leading-5 text-lime-200">
                        Measured at {formatGap(sizing.maxGapMs)} over this target — no additional
                        payloads required.
                    </p>
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

            {/* Undo survives the transition it caused: after applying, the card
                shows `COVERED`, and that is exactly when the presenter may want
                to go back and show the contrast again. */}
            {onUndo && (
                <button
                    type="button"
                    onClick={onUndo}
                    className="revisit-undo-recommended mt-2 min-h-11 w-full rounded-lg border border-slate-600/70 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-slate-300 transition-colors hover:border-slate-400 hover:text-slate-100"
                >
                    Return to previous configuration
                </button>
            )}
            {detail && <RecommendedEvidenceDisclosure>{detail}</RecommendedEvidenceDisclosure>}
        </div>
    );
}

export const CustomerResultCard: React.FC<CustomerResultCardProps> = ({
    targetRole = 'REFERENCE', question, currentPayloadCount, fleetSize,
    currentMaxGapMs, currentIsComputing, currentUnavailableReason = null,
    currentMetricLabel = 'Maximum revisit gap', requirementMs, sizing,
    onApply, onUndo, onRetrySizing, supportingMetrics = null,
    recommendedConfigurationDetail = null,
}) => {
    const meetsRequirement = currentMaxGapMs === null ? null : currentMaxGapMs <= requirementMs;
    const status = customerStatus(meetsRequirement, sizing);

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
                <p className="revisit-customer-secondary mt-0.5 text-[12px] leading-4 text-slate-400">
                    within the {fleetSize}-satellite active fleet
                </p>

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
                        <dt className="text-slate-400">Customer requirement</dt>
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
                {sizing.kind === 'UNAVAILABLE' && (
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
                onApply={onApply}
                onUndo={onUndo}
                onRetrySizing={onRetrySizing}
                detail={recommendedConfigurationDetail}
            />
        </section>
    );
};
