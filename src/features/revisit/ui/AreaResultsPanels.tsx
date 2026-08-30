import React, { useMemo } from 'react';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import type { AreaTarget } from '../domain/areaTarget';
import { formatGap } from '../analysis/gapStatistics';
import { REVISIT_LABEL, REVISIT_OUTCOME, REVISIT_PANEL } from './revisitTheme';

interface AreaResultsProps {
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    progress: number | null;
    error: string | null;
    requirementMs: number;
    draftArea?: AreaTarget | null;
    /** Integrate Area statistics into CustomerResultCard without a second verdict. */
    embedded?: boolean;
}

function areaCounts(analysis: AreaAnalysis | null, requirementMs: number) {
    if (!analysis) return { meets: 0, misses: 0, never: 0, unmeasured: 0 };
    let meets = 0;
    let misses = 0;
    for (const cell of analysis.cells) {
        if (cell.statistics.coverage === 'NEVER_IN_VIEW') continue;
        if (cell.maxGapMs === null) continue;
        if (cell.maxGapMs <= requirementMs) meets++;
        else misses++;
    }
    return {
        meets,
        misses,
        never: analysis.neverInViewCount,
        unmeasured: analysis.unmeasuredCount,
    };
}

export const AreaResultSummary: React.FC<AreaResultsProps> = ({
    analysis, isRunning, progress, error, requirementMs, draftArea = null, embedded = false,
}) => {
    const counts = useMemo(() => areaCounts(analysis, requirementMs), [analysis, requirementMs]);
    const unbounded = Boolean(analysis && analysis.neverInViewCount > 0);
    const hasImpossibleCells = unbounded || counts.unmeasured > 0;
    const missesRequirement = hasImpossibleCells || counts.misses > 0;

    return (
        <section className={`${embedded
            ? 'revisit-area-result-summary mt-3 border-t border-slate-700/50 pt-2.5'
            : `${REVISIT_PANEL} revisit-area-result-summary px-4 py-3`}`} aria-label="Area result summary">
            {!embedded && <div className="flex items-start justify-between gap-3">
                <div>
                    <span className={REVISIT_LABEL}>Area result</span>
                    <div className="mt-1 text-[12px] font-bold text-sky-700 dark:text-sky-200">
                        {analysis?.area.name ?? draftArea?.name ?? 'No Area configured'}
                    </div>
                </div>
                <span className={`rounded border px-2 py-1 text-[11px] font-black uppercase tracking-wide ${error
                    ? REVISIT_OUTCOME.error.badge
                    : !analysis || isRunning
                    ? 'border-slate-600 text-slate-400'
                    : hasImpossibleCells
                        ? REVISIT_OUTCOME.error.badge
                        : missesRequirement
                        ? REVISIT_OUTCOME.misses.badge
                        : REVISIT_OUTCOME.meets.badge}`}>
                    {error
                        ? 'Analysis unavailable'
                        : isRunning
                        ? `${Math.round((progress ?? 0) * 100)}%`
                        : !analysis
                            ? draftArea?.boundary.length && draftArea.boundary.length >= 3 ? 'Ready to analyse' : 'Area incomplete'
                            : missesRequirement ? 'Area misses' : 'Area meets'}
                </span>
            </div>}

            {!embedded && !analysis && !isRunning && !error && (
                <p className="mt-3 text-[12px] leading-4 text-slate-400">
                    {!draftArea
                        ? 'Add an Area as a compared target in the header, then draw or import its polygon.'
                        : draftArea.boundary.length < 3
                            ? 'Define this Area by drawing or importing a polygon.'
                            : 'The polygon is ready. Its worst-cell analysis starts automatically.'}
                </p>
            )}
            {isRunning && (
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-700/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
                    <div className="h-full bg-sky-400 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                </div>
            )}

            {analysis && (
                <>
                    {!embedded && <div className="mt-3 border-b border-slate-700/50 pb-3">
                        <span className={REVISIT_LABEL}>Least-covered cell</span>
                        <div className={`mt-0.5 text-3xl font-black tabular-nums ${unbounded ? 'text-violet-300' : 'text-white'}`}>
                            {unbounded ? 'Never seen' : formatGap(analysis.worstCell?.maxGapMs ?? null)}
                        </div>
                        {analysis.worstCell && (
                            <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">
                                {analysis.worstCell.target.latDeg.toFixed(2)}° · {analysis.worstCell.target.lonDeg.toFixed(2)}°
                            </p>
                        )}
                    </div>}
                    <div className={`${embedded ? '' : 'mt-2'} grid grid-cols-3 gap-2`}>
                        <div><span className={REVISIT_LABEL}>Mean cell</span><div className="text-sm font-bold tabular-nums">{formatGap(analysis.meanCellMaxGapMs)}</div></div>
                        <div><span className={REVISIT_LABEL}>Best cell</span><div className="text-sm font-bold tabular-nums">{formatGap(analysis.bestCell?.maxGapMs ?? null)}</div></div>
                        <div><span className={REVISIT_LABEL}>Cells</span><div className="text-sm font-bold tabular-nums">{analysis.cells.length}</div></div>
                    </div>
                    {embedded && analysis.worstCell && (
                        <p className="mt-2 text-[12px] leading-4 text-slate-400">
                            Least-covered cell at {analysis.worstCell.target.latDeg.toFixed(2)}° · {analysis.worstCell.target.lonDeg.toFixed(2)}°
                        </p>
                    )}
                </>
            )}
        </section>
    );
};

/**
 * Where the cell distribution lives.
 *
 * `embedded` renders the content alone, with no card and no disclosure of its
 * own: in Area mode it is the evidence behind the recommendation, exactly as
 * the value curve is for a Point, so it belongs under the SAME
 * `Why this recommendation?` disclosure inside the Recommended configuration
 * card rather than in a separate `Cells vs requirement` card beside it. Two
 * analysis modes, one place to ask "why".
 */
export const AreaDistributionPanel: React.FC<
    Pick<AreaResultsProps, 'analysis' | 'requirementMs'> & { embedded?: boolean }
> = ({
    analysis, requirementMs, embedded = false,
}) => {
    const counts = useMemo(() => areaCounts(analysis, requirementMs), [analysis, requirementMs]);
    const emptyNote = (
        <p className="mt-2 text-[12px] leading-4 text-slate-400">
            Define a valid area to see the compliant, failing and never-seen cells.
        </p>
    );
    if (!analysis) return embedded ? emptyNote : (
        <section className={REVISIT_PANEL} aria-label="Area cell distribution">
            <details className="group px-3 py-2.5">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3">
                    <span className={REVISIT_LABEL}>Cells vs requirement</span>
                    <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-90">›</span>
                </summary>
                {emptyNote}
            </details>
        </section>
    );
    const total = Math.max(analysis.cells.length, 1);
    const categories = [
        { label: 'Meets', count: counts.meets, color: 'bg-lime-400', text: REVISIT_OUTCOME.meets.text },
        { label: 'Misses', count: counts.misses, color: 'bg-orange-500', text: REVISIT_OUTCOME.misses.text },
        { label: 'Never seen', count: counts.never, color: 'bg-red-500', text: REVISIT_OUTCOME.error.text },
        { label: 'Unmeasured', count: counts.unmeasured, color: 'bg-red-800', text: REVISIT_OUTCOME.error.text },
    ];
    const body = (
        <>
            <div className="mt-2 flex h-3 overflow-hidden rounded bg-slate-800" aria-label={`${counts.meets} of ${analysis.cells.length} cells meet the requirement`}>
                {categories.filter((category) => category.count > 0).map((category) => (
                    <span key={category.label} className={category.color} style={{ width: `${category.count / total * 100}%` }} title={`${category.label}: ${category.count}`} />
                ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {categories.map((category) => (
                    <div key={category.label} className="flex items-center justify-between text-[12px]">
                        <span className="text-slate-400">{category.label}</span>
                        <strong className={`tabular-nums ${category.text}`}>{category.count} · {Math.round(category.count / total * 100)}%</strong>
                    </div>
                ))}
            </div>
            <p className="mt-2 text-[11px] leading-3 text-slate-400">
                Regular latitude/longitude grid · mean is over cells, not area-weighted.
            </p>
            {analysis.warnings.map((warning) => <p key={warning} className="mt-1 text-[11px] leading-3 text-amber-200">{warning}</p>)}
        </>
    );

    if (embedded) return body;

    return (
        <section className={REVISIT_PANEL} aria-label="Area cell distribution">
          <details className="group px-3 py-2.5">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3">
              <span className={REVISIT_LABEL}>Cells vs requirement</span>
              <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-90">›</span>
            </summary>
            {body}
          </details>
        </section>
    );
};
