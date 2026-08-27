/**
 * MobileResultStrip — the phone's permanent answer line.
 *
 * On a phone the analysis column cannot stay open: it and the header between
 * them left the globe a 73 px slit (mobile UX plan §2). But collapsing the
 * column must not collapse the *answer* — REVISIT's entry promise is "a number
 * on screen, immediately".
 *
 * So the column becomes a sheet, and this strip is what remains when the sheet
 * is closed: the verdict, the worst-case gap, and the requirement it is judged
 * against. Nothing else. Everything on this strip is content the user is
 * looking for; the rest of the column is content they go and get.
 *
 * It doubles as the sheet's handle — tapping it opens the full analysis.
 */

import React from 'react';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { formatGap } from '../analysis/gapStatistics';
import type { GapStatistics } from '../domain/types';
import type { RevisitAnalysisContext } from '../domain/analysisTargets';
import { REVISIT_OUTCOME, REVISIT_PANEL } from './revisitTheme';

export interface MobileResultStripProps {
    analysisContext: RevisitAnalysisContext;
    statistics: GapStatistics | null;
    areaAnalysis: AreaAnalysis | null;
    areaIsDefined?: boolean;
    requirementMs: number;
    isComputing: boolean;
    /** Selected comparison row exists but has no analysable location yet. */
    pointIsPending?: boolean;
    /** The target set is intentionally empty, rather than an incomplete comparison row. */
    noTarget?: boolean;
    /** Reference or Comparison N — keeps the collapsed result attributable. */
    pointResultLabel?: string;
    /** Sheet state, so the chevron and the aria state stay truthful. */
    expanded: boolean;
    onToggle: () => void;
}

type Verdict = { text: string; className: string };

function pointVerdict(
    statistics: GapStatistics | null, requirementMs: number, isComputing: boolean,
): Verdict {
    if (!statistics) {
        return isComputing
            ? { text: 'Analysing', className: REVISIT_OUTCOME.unavailable.badge }
            : { text: 'No result', className: REVISIT_OUTCOME.unavailable.badge };
    }
    if (statistics.coverage === 'NEVER_IN_VIEW') {
        return { text: 'Never in view', className: REVISIT_OUTCOME.error.badge };
    }
    return statistics.maxGapMs !== null && statistics.maxGapMs <= requirementMs
        ? { text: 'Meets', className: REVISIT_OUTCOME.meets.badge }
        : { text: 'Misses', className: REVISIT_OUTCOME.misses.badge };
}

function areaVerdict(
    analysis: AreaAnalysis | null, requirementMs: number, isComputing: boolean, areaIsDefined: boolean,
): Verdict {
    if (!analysis) {
        return isComputing
            ? { text: 'Analysing', className: 'border-slate-500/40 bg-slate-500/15 text-slate-300' }
            : areaIsDefined
                ? { text: 'Ready', className: 'border-sky-400/40 bg-sky-500/15 text-sky-200' }
                : { text: 'Area incomplete', className: 'border-slate-500/40 bg-slate-500/15 text-slate-300' };
    }
    if (analysis.neverInViewCount > 0 || analysis.unmeasuredCount > 0) {
        return { text: 'Area incomplete', className: REVISIT_OUTCOME.error.badge };
    }
    const misses = analysis.cells
        .some((cell) => cell.maxGapMs !== null && cell.maxGapMs > requirementMs);
    return misses
        ? { text: 'Area misses', className: REVISIT_OUTCOME.misses.badge }
        : { text: 'Area meets', className: REVISIT_OUTCOME.meets.badge };
}

export const MobileResultStrip: React.FC<MobileResultStripProps> = ({
    analysisContext, statistics, areaAnalysis, areaIsDefined = false, requirementMs, isComputing,
    pointIsPending = false, noTarget = false, pointResultLabel, expanded, onToggle,
}) => {
    const isArea = analysisContext === 'AREA';
    const verdict = noTarget
        ? { text: 'No target', className: 'border-slate-500/40 bg-slate-500/15 text-slate-300' }
        : !isArea && pointIsPending
        ? { text: 'Location required', className: 'border-sky-400/40 bg-sky-500/15 text-sky-200' }
        : isArea
        ? areaVerdict(areaAnalysis, requirementMs, isComputing, areaIsDefined)
        : pointVerdict(statistics, requirementMs, isComputing);
    const unbounded = isArea && (areaAnalysis?.neverInViewCount ?? 0) > 0;
    const headlineMs = isArea ? areaAnalysis?.worstCell?.maxGapMs ?? null : statistics?.maxGapMs ?? null;
    const secondaryMs = isArea ? areaAnalysis?.meanCellMaxGapMs ?? null : statistics?.meanGapMs ?? null;

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls="revisit-analysis-sheet"
            data-revisit-result-strip
            className={`${REVISIT_PANEL} flex w-full items-center gap-3 px-3 py-2 text-left ${isComputing ? 'opacity-70' : ''}`}
        >
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    <span className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] ${verdict.className}`}>
                        {verdict.text}
                    </span>
                    <span className="truncate text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                        {isArea
                            ? 'Least-covered cell'
                            : pointResultLabel
                                ? `${pointResultLabel} · max gap`
                                : 'Maximum gap'}{' '}
                        vs {formatGap(requirementMs)}
                    </span>
                </span>
                <span className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-2xl font-black leading-none text-white tabular-nums">
                        {noTarget
                            ? 'Add target'
                            : pointIsPending
                            ? 'Set point'
                            : isArea && !areaAnalysis && areaIsDefined
                                ? 'Pending'
                                : unbounded ? 'Never seen' : formatGap(headlineMs)}
                    </span>
                    <span className="truncate text-[12px] font-bold text-slate-400 tabular-nums">
                        {isArea && !areaAnalysis && areaIsDefined
                            ? 'least-covered cell'
                            : `${isArea ? 'mean cell' : 'mean'} ${formatGap(secondaryMs)}`}
                    </span>
                </span>
            </span>
            <span aria-hidden="true" className="shrink-0 text-sm text-slate-300">
                {expanded ? '⌄' : '⌃'}
            </span>
        </button>
    );
};

export default MobileResultStrip;
