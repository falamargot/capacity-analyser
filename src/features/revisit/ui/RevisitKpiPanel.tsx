/**
 * RevisitKpiPanel — the headline (UX §4.2).
 *
 * Reuses the treatment of ENG's `GEO [BLOCKED] · LAT / DL / UL` block: a verdict
 * badge, a row of metrics, and one grey line of qualification underneath.
 *
 * WORST CASE is roughly twice the size of the others and the only value in
 * bright amber. Both max and mean are always shown, labelled — showing mean
 * alone invites the accusation of cherry-picking, showing max alone hides the
 * typical experience (ADR-001 §3).
 */

import React from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { GapStatistics } from '../domain/types';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface RevisitKpiPanelProps {
    statistics: GapStatistics | null;
    windowHours: number;
    /** Customer requirement, ms. The verdict badge compares against it. */
    requirementMs: number | null;
    isComputing: boolean;
    /**
     * True while the payload sweep — the source of `comparison` — is still
     * running. Distinct from `isComputing`, which tracks the much faster
     * single-scenario statistics: gating the comparison row on `isComputing`
     * let it flash a false "beyond the tested payload range" while the sweep
     * that would have answered it was still in flight.
     */
    comparisonIsComputing?: boolean;
    comparison?: {
        baselineMaxGapMs: number | null;
        /** The 1-payload configuration never sees the target over the window. */
        baselineNeverInView?: boolean;
        /**
         * The 1-payload baseline was measured, but every gap in the window
         * touched a boundary and was discarded, so no worst-case figure can
         * be stated for it — a real answer, distinct from `null` meaning the
         * sweep has not reached it yet.
         */
        baselineInconclusive?: boolean;
        currentPayloadCount: number;
        targetPayloadCount: number | null;
    };
}

function Metric({ label, value, tone = 'secondary' }: {
    label: string; value: string; tone?: 'headline' | 'secondary';
}) {
    return (
        <div className="flex flex-col gap-1">
            {/* `whitespace-nowrap` on both label and value: "PASSES / DAY" and
                "1 h 59 min" both wrap at this panel width otherwise, which turns
                a KPI row into ragged two-line blocks. */}
            <span className={`${REVISIT_LABEL} whitespace-nowrap`}>{label}</span>
            <span
                className={tone === 'headline'
                    ? 'whitespace-nowrap text-[32px] font-black leading-none text-amber-300 tabular-nums'
                    : 'whitespace-nowrap text-base font-bold leading-none text-slate-200 tabular-nums'}
            >
                {value}
            </span>
        </div>
    );
}

export const RevisitKpiPanel: React.FC<RevisitKpiPanelProps> = ({
    statistics, windowHours, requirementMs, isComputing, comparisonIsComputing = false, comparison,
}) => {
    const maxGapMs = statistics?.maxGapMs ?? null;
    const meets = requirementMs !== null && maxGapMs !== null && maxGapMs <= requirementMs;

    // The verdict, in the grammar ENG already uses for
    // `Service blocked — uplink link budget failed`.
    let verdict: { text: string; className: string };
    if (!statistics) {
        verdict = isComputing
            ? {
                text: 'ANALYSING SCENARIO',
                className: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
            }
            : {
                text: 'NO VALID RESULT',
                className: 'border-red-400/40 bg-red-500/15 text-red-200',
            };
    } else if (statistics.coverage === 'NEVER_IN_VIEW') {
        verdict = {
            text: 'TARGET NEVER IN VIEW',
            className: 'border-red-400/40 bg-red-500/15 text-red-200',
        };
    } else if (requirementMs === null) {
        verdict = {
            text: 'NO TARGET SET',
            className: 'border-slate-500/40 bg-slate-500/15 text-slate-300',
        };
    } else if (meets) {
        verdict = {
            text: `MEETS ${formatGap(requirementMs).toUpperCase()} REQUIREMENT`,
            className: 'border-lime-400/40 bg-lime-500/15 text-lime-200',
        };
    } else {
        verdict = {
            text: `MISSES ${formatGap(requirementMs).toUpperCase()} REQUIREMENT`,
            className: 'border-red-400/40 bg-red-500/15 text-red-200',
        };
    }

    const passesPerDay = statistics
        ? (statistics.accessCount / Math.max(windowHours / 24, 1e-9)).toFixed(1)
        : '—';
    const gainVsOne = maxGapMs !== null
        && comparison?.baselineMaxGapMs != null
        && comparison.baselineMaxGapMs > 0
        ? Math.max(0, 1 - maxGapMs / comparison.baselineMaxGapMs)
        : null;
    const additionalPayloads = comparison?.targetPayloadCount == null
        ? null
        : Math.max(0, comparison.targetPayloadCount - comparison.currentPayloadCount);

    /*
     * m2. This row is the business case, and it is on screen the moment the mode
     * opens. It used to narrate its own unresolved state — "awaiting measured
     * 1-payload baseline", "not reached in tested configurations" — which is
     * engineering shorthand in the one place a customer reads first.
     *
     * The nulls are not interchangeable, and there are four cases, not two:
     * the baseline resolves (a percentage), the 1-payload configuration never
     * sees the target at all across the window (epoch- and target-dependent, and
     * the strongest argument in the pitch — so it is stated), every gap it did
     * see touched a window boundary and was discarded (a real answer too — see
     * `baselineInconclusive`), or the sweep simply has not finished (omitted,
     * because there is genuinely nothing to say). A missing target count is
     * likewise a real answer rather than a wait — gated on `comparisonIsComputing`,
     * the sweep's own flag, not `isComputing`, which tracks the much faster
     * single-scenario statistics and finishes well before the sweep does.
     */
    const comparisonItems: Array<{ label: string; value: string }> = [];
    if (gainVsOne !== null) {
        comparisonItems.push({
            label: 'Vs 1 payload',
            value: `${Math.round(gainVsOne * 100)}% shorter worst-case`,
        });
    } else if (comparison?.baselineNeverInView) {
        // Previously hidden behind "awaiting measured 1-payload baseline", which
        // described a wait when the sweep had in fact already answered: a single
        // payload has no revisit figure to report because it never gets a look.
        comparisonItems.push({ label: 'Vs 1 payload', value: 'never sees this target' });
    } else if (comparison?.baselineInconclusive) {
        comparisonItems.push({ label: 'Vs 1 payload', value: 'no worst-case in this window' });
    }
    if (additionalPayloads !== null) {
        comparisonItems.push({
            label: 'To target',
            value: additionalPayloads === 0
                ? 'met by this configuration'
                : `+${additionalPayloads} payloads`,
        });
    } else if (comparison && !comparisonIsComputing) {
        comparisonItems.push({ label: 'To target', value: 'beyond the tested payload range' });
    }
    const comparisonPending = Boolean(comparison) && comparisonItems.length === 0 && comparisonIsComputing;

    return (
        <div className={`${REVISIT_PANEL} revisit-kpi-panel px-4 py-3 ${isComputing ? 'opacity-60' : ''}`}>
            <span
                className={`revisit-kpi-verdict inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${verdict.className}`}
            >
                {verdict.text}
            </span>

            {/* WORST CASE is given its own row so it stays roughly twice the size
                of the rest and never competes for width with them (UX §4.2). */}
            <div className="revisit-kpi-headline mt-3">
                <Metric label="Worst case" value={formatGap(maxGapMs)} tone="headline" />
            </div>
            <div className="revisit-kpi-secondary mt-3 flex items-end gap-5 border-t border-slate-700/50 pt-2.5">
                <Metric label="Mean" value={formatGap(statistics?.meanGapMs ?? null)} />
                <Metric label="Passes / day" value={statistics ? passesPerDay : '—'} />
                <Metric
                    label="In view"
                    value={statistics ? `${(statistics.fractionInView * 100).toFixed(1)} %` : '—'}
                />
            </div>

            {/* The qualification line. The boundary-gap convention is stated here
                because it materially changes the headline number. */}
            <p className="revisit-kpi-qualification mt-2 text-[10px] leading-4 text-slate-500">
                {windowHours} h window · max-gap definition · boundary gaps discarded
                {isComputing && ' · recomputing…'}
            </p>

            {comparison && (comparisonItems.length > 0 || comparisonPending) && (
                <div
                    className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-700/50 pt-2 text-[10px] leading-4 text-slate-400"
                    aria-label="Business comparison"
                    aria-busy={comparisonPending || undefined}
                >
                    {comparisonPending ? (
                        <span className="italic text-slate-500">Measuring payload comparisons…</span>
                    ) : comparisonItems.map((item) => (
                        <span key={item.label}>
                            <strong className="text-slate-200">{item.label}:</strong>{' '}
                            {item.value}
                        </span>
                    ))}
                </div>
            )}

        </div>
    );
};
