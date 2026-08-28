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
 * pill states `Requirement covered` / `Additional payloads required` /
 * `Reconfiguration required` / `Further engineering assessment required` and
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
    comparisonNote?: string | null;
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
    /** Rendered under the apply control when applying is an explicit choice. */
    applyNote?: string | null;
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

type Status = { text: string; className: string };

/**
 * The status is a function of the CURRENT result and the sizing outcome, in
 * that order — never of the sizing alone. A configuration that already meets
 * the requirement is `Requirement covered` whatever the sweep is doing.
 */
function customerStatus(meetsRequirement: boolean | null, sizing: CustomerSizing): Status {
    if (meetsRequirement === true) {
        return { text: 'Requirement covered', className: REVISIT_OUTCOME.meets.badge };
    }
    if (sizing.kind === 'FAILED') {
        return {
            text: 'Further engineering assessment required',
            className: REVISIT_OUTCOME.error.badge,
        };
    }
    if (meetsRequirement === null
        || sizing.kind === 'BEYOND_RANGE'
        || sizing.kind === 'AREA_NOT_SIZED'
        || sizing.kind === 'UNAVAILABLE') {
        return {
            text: 'Further engineering assessment required',
            className: REVISIT_OUTCOME.unavailable.badge,
        };
    }
    if (sizing.kind === 'COMPUTING') {
        return {
            text: 'Current configuration below requirement',
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
        text: 'Additional payloads required',
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
    sizing, fleetSize, currentPayloadCount, applyNote, onApply, onUndo, onRetrySizing, detail,
}: {
    sizing: CustomerSizing;
    fleetSize: number;
    currentPayloadCount: number;
    applyNote?: string | null;
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
            className="mt-3 border-t border-slate-700/50 pt-2.5"
            aria-label="Recommended configuration"
            aria-live="polite"
            aria-busy={sizing.kind === 'COMPUTING' || undefined}
        >
            <span className={REVISIT_LABEL}>Recommended configuration</span>

            {sizing.kind === 'COMPUTING' && (
                <p className="mt-1 text-[13px] italic leading-5 text-slate-400">
                    Calculating fleet sizing…
                </p>
            )}

            {sizing.kind === 'COVERED' && (
                <p className="mt-1 text-[13px] leading-5 text-lime-200">
                    Met by the current configuration — no additional payloads required.
                </p>
            )}

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
                        <span className="text-[13px] font-black text-slate-100 tabular-nums">
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

            {offersApply && onApply && (
                <button
                    type="button"
                    onClick={onApply}
                    className="revisit-apply-recommended mt-2 min-h-11 w-full rounded-lg border border-slate-400/70 bg-slate-100/10 px-3 py-2 text-[12px] font-black uppercase tracking-[0.12em] text-slate-100 transition-colors hover:border-white hover:bg-white/15"
                >
                    Apply recommended configuration
                </button>
            )}
            {offersApply && applyNote && (
                <p className="mt-1 text-[12px] leading-4 text-slate-400">{applyNote}</p>
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
    targetRole = 'REFERENCE', question, comparisonNote = null, currentPayloadCount, fleetSize,
    currentMaxGapMs, currentIsComputing, currentUnavailableReason = null,
    currentMetricLabel = 'Maximum revisit gap', requirementMs, sizing,
    applyNote = null, onApply, onUndo, onRetrySizing, supportingMetrics = null,
    recommendedConfigurationDetail = null,
}) => {
    const meetsRequirement = currentMaxGapMs === null ? null : currentMaxGapMs <= requirementMs;
    const status = customerStatus(meetsRequirement, sizing);

    return (
        <section
            className={`${REVISIT_PANEL} revisit-customer-result revisit-result-${targetRole.toLowerCase()} px-4 py-3`}
            aria-label="Customer result"
            data-revisit-result-role={targetRole.toLowerCase()}
        >
            <p className="text-[13px] font-semibold leading-5 text-slate-100">{question}</p>
            {comparisonNote && (
                <p className="revisit-customer-secondary mt-1 text-[12px] leading-4 text-slate-400">
                    {comparisonNote}
                </p>
            )}

            <span
                className={`revisit-customer-status mt-2 inline-flex rounded-md border px-2 py-0.5 text-[12px] font-black uppercase tracking-[0.14em] ${status.className}`}
            >
                {status.text}
            </span>

            <div className="mt-3 border-t border-slate-700/50 pt-2.5">
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
            </div>

            {supportingMetrics}

            <SizingBlock
                sizing={sizing}
                fleetSize={fleetSize}
                currentPayloadCount={currentPayloadCount}
                applyNote={applyNote}
                onApply={onApply}
                onUndo={onUndo}
                onRetrySizing={onRetrySizing}
                detail={recommendedConfigurationDetail}
            />
        </section>
    );
};
