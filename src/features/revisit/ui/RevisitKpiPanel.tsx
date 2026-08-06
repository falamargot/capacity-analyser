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
    /** Selectable requirements, in hours. Omit to render the requirement read-only. */
    requirementChoicesHours?: number[];
    onRequirementChange?: (ms: number) => void;
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
    statistics, windowHours, requirementMs, isComputing,
    requirementChoicesHours, onRequirementChange,
}) => {
    const maxGapMs = statistics?.maxGapMs ?? null;
    const meets = requirementMs !== null && maxGapMs !== null && maxGapMs <= requirementMs;

    // The verdict, in the grammar ENG already uses for
    // `Service blocked — uplink link budget failed`.
    let verdict: { text: string; className: string };
    if (statistics?.coverage === 'NEVER_IN_VIEW') {
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
            text: `MEETS ${formatGap(requirementMs).toUpperCase()} TARGET`,
            className: 'border-lime-400/40 bg-lime-500/15 text-lime-200',
        };
    } else {
        verdict = {
            text: `MISSES ${formatGap(requirementMs).toUpperCase()} TARGET`,
            className: 'border-red-400/40 bg-red-500/15 text-red-200',
        };
    }

    const passesPerDay = statistics
        ? (statistics.accessCount / Math.max(windowHours / 24, 1e-9)).toFixed(1)
        : '—';

    return (
        <div className={`${REVISIT_PANEL} px-4 py-3 ${isComputing ? 'opacity-60' : ''}`}>
            <span
                className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${verdict.className}`}
            >
                {verdict.text}
            </span>

            {/* WORST CASE is given its own row so it stays roughly twice the size
                of the rest and never competes for width with them (UX §4.2). */}
            <div className="mt-3">
                <Metric label="Worst case" value={formatGap(maxGapMs)} tone="headline" />
            </div>
            <div className="mt-3 flex items-end gap-5 border-t border-slate-700/50 pt-2.5">
                <Metric label="Mean" value={formatGap(statistics?.meanGapMs ?? null)} />
                <Metric label="Passes / day" value={statistics ? passesPerDay : '—'} />
                <Metric
                    label="In view"
                    value={statistics ? `${(statistics.fractionInView * 100).toFixed(1)} %` : '—'}
                />
            </div>

            {/* The qualification line. The boundary-gap convention is stated here
                because it materially changes the headline number. */}
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
                {windowHours} h window · max-gap definition · boundary gaps discarded
                {isComputing && ' · recomputing…'}
            </p>

            {requirementChoicesHours && onRequirementChange && (
                <label className="mt-2 flex items-center gap-2 border-t border-slate-700/50 pt-2">
                    <span className={REVISIT_LABEL}>Requirement</span>
                    <select
                        className="rounded border border-slate-700 bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-bold text-slate-200 outline-none"
                        value={requirementMs ?? ''}
                        onChange={(e) => onRequirementChange(Number(e.target.value))}
                    >
                        {requirementChoicesHours.map((h) => (
                            <option key={h} value={h * 3600_000}>{formatGap(h * 3600_000)}</option>
                        ))}
                    </select>
                </label>
            )}
        </div>
    );
};
