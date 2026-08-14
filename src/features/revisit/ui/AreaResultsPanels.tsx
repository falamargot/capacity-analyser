import React, { useMemo } from 'react';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { formatGap } from '../analysis/gapStatistics';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface AreaResultsProps {
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    progress: number | null;
    error: string | null;
    requirementMs: number;
    onExportCsv: () => void;
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
    analysis, isRunning, progress, error, requirementMs,
}) => {
    const counts = useMemo(() => areaCounts(analysis, requirementMs), [analysis, requirementMs]);
    const unbounded = Boolean(analysis && analysis.neverInViewCount > 0);
    const missesRequirement = unbounded || counts.misses > 0 || counts.unmeasured > 0;

    return (
        <section className={`${REVISIT_PANEL} revisit-area-result-summary px-4 py-3`} aria-label="Area result summary">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <span className={REVISIT_LABEL}>Area result</span>
                    <div className="mt-1 text-[11px] font-bold text-sky-700 dark:text-sky-200">
                        {analysis?.area.name ?? 'No analysed area'}
                    </div>
                </div>
                <span className={`rounded border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${!analysis || isRunning
                    ? 'border-slate-600 text-slate-400'
                    : missesRequirement
                        ? 'border-rose-400/50 bg-rose-400/10 text-rose-300'
                        : 'border-lime-400/50 bg-lime-400/10 text-lime-300'}`}>
                    {isRunning ? `${Math.round((progress ?? 0) * 100)}%` : !analysis ? 'Not run' : missesRequirement ? 'Area misses' : 'Area meets'}
                </span>
            </div>

            {error && <p role="alert" className="mt-2 text-[10px] text-red-300">{error}</p>}
            {!analysis && !isRunning && !error && (
                <p className="mt-3 text-[11px] leading-4 text-slate-400">
                    Open the Area target menu in the header, then select, draw or import an area.
                </p>
            )}
            {isRunning && (
                <div className="mt-3 h-1.5 overflow-hidden rounded bg-slate-700/60" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress ?? 0) * 100)}>
                    <div className="h-full bg-sky-400 transition-[width]" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />
                </div>
            )}

            {analysis && (
                <>
                    <div className="mt-3 border-b border-slate-700/50 pb-3">
                        <span className={REVISIT_LABEL}>Worst cell</span>
                        <div className={`mt-0.5 text-3xl font-black tabular-nums ${unbounded ? 'text-violet-300' : 'text-amber-300'}`}>
                            {unbounded ? 'Never seen' : formatGap(analysis.worstCell?.maxGapMs ?? null)}
                        </div>
                        {analysis.worstCell && (
                            <p className="mt-0.5 text-[9px] tabular-nums text-slate-400">
                                {analysis.worstCell.target.latDeg.toFixed(2)}° · {analysis.worstCell.target.lonDeg.toFixed(2)}°
                            </p>
                        )}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                        <div><span className={REVISIT_LABEL}>Mean cell</span><div className="text-sm font-bold tabular-nums">{formatGap(analysis.meanCellMaxGapMs)}</div></div>
                        <div><span className={REVISIT_LABEL}>Best cell</span><div className="text-sm font-bold tabular-nums">{formatGap(analysis.bestCell?.maxGapMs ?? null)}</div></div>
                        <div><span className={REVISIT_LABEL}>Cells</span><div className="text-sm font-bold tabular-nums">{analysis.cells.length}</div></div>
                    </div>
                </>
            )}
        </section>
    );
};

export const AreaDistributionPanel: React.FC<Pick<AreaResultsProps, 'analysis' | 'requirementMs' | 'onExportCsv'>> = ({
    analysis, requirementMs, onExportCsv,
}) => {
    const counts = useMemo(() => areaCounts(analysis, requirementMs), [analysis, requirementMs]);
    if (!analysis) return (
        <section className={`${REVISIT_PANEL} px-3 py-3`} aria-label="Area cell distribution">
            <span className={REVISIT_LABEL}>Cells vs requirement</span>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">Run an area analysis to see the compliant, failing and never-seen cells.</p>
        </section>
    );
    const total = Math.max(analysis.cells.length, 1);
    const categories = [
        { label: 'Meets', count: counts.meets, color: 'bg-lime-400', text: 'text-lime-300' },
        { label: 'Misses', count: counts.misses, color: 'bg-rose-400', text: 'text-rose-300' },
        { label: 'Never seen', count: counts.never, color: 'bg-violet-400', text: 'text-violet-300' },
        { label: 'Unmeasured', count: counts.unmeasured, color: 'bg-slate-500', text: 'text-slate-300' },
    ];
    return (
        <section className={`${REVISIT_PANEL} px-3 py-2.5`} aria-label="Area cell distribution">
            <span className={REVISIT_LABEL}>Cells vs requirement</span>
            <div className="mt-2 flex h-3 overflow-hidden rounded bg-slate-800" aria-label={`${counts.meets} of ${analysis.cells.length} cells meet the requirement`}>
                {categories.filter((category) => category.count > 0).map((category) => (
                    <span key={category.label} className={category.color} style={{ width: `${category.count / total * 100}%` }} title={`${category.label}: ${category.count}`} />
                ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                {categories.map((category) => (
                    <div key={category.label} className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">{category.label}</span>
                        <strong className={`tabular-nums ${category.text}`}>{category.count} · {Math.round(category.count / total * 100)}%</strong>
                    </div>
                ))}
            </div>
            <p className="mt-2 text-[9px] leading-3 text-slate-400">
                Regular latitude/longitude grid · mean is over cells, not area-weighted.
            </p>
            {analysis.warnings.map((warning) => <p key={warning} className="mt-1 text-[9px] leading-3 text-amber-200">{warning}</p>)}
            <button type="button" onClick={onExportCsv} className="mt-2 rounded border border-slate-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-300 hover:border-sky-400/50 hover:text-sky-200">
                Export grid CSV
            </button>
        </section>
    );
};
