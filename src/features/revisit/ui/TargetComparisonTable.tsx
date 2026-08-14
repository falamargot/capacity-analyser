import React from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { RevisitTargetComparisonRow } from '../workers/revisitProtocol';
import type { PointTarget } from '../domain/types';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface TargetComparisonTableProps {
    rows: RevisitTargetComparisonRow[] | null;
    requirementMs: number;
    enabled: boolean;
    isComputing: boolean;
    error: string | null;
    targets: PointTarget[];
    pendingCount?: number;
}

export const TargetComparisonTable: React.FC<TargetComparisonTableProps> = ({
    rows, requirementMs, enabled, isComputing, error, targets, pendingCount = 0,
}) => (
    <section className={`${REVISIT_PANEL} px-3 py-2.5`} aria-label="Target comparison">
        <div className="flex items-center justify-between gap-2">
            <div>
                <span className={REVISIT_LABEL}>Compare targets</span>
                <p className="mt-0.5 text-[9px] text-slate-500">Reference + up to 2 user points · same topology and FOV</p>
            </div>
            {!enabled && (
                <span className="rounded border border-slate-700 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-slate-500">
                    {pendingCount > 0 ? 'Location required' : 'No secondary point'}
                </span>
            )}
        </div>

        {!enabled && <p className="mt-2 text-[10px] text-slate-500">
            {pendingCount > 0
                ? 'Set the comparison location from the site list or its location menu. It is excluded from results until then.'
                : 'Use Shift-click on the globe or “Add comparison point” in Analysis target.'}
        </p>}
        {enabled && pendingCount > 0 && (
            <p className="mt-2 text-[10px] text-sky-300">
                {pendingCount} comparison point awaiting location · excluded from results.
            </p>
        )}
        {isComputing && <p className="mt-2 text-[10px] text-slate-400">Comparing {targets.map((target) => target.name).join(', ')}…</p>}
        {error && <p className="mt-2 text-[10px] text-red-300">{error}</p>}
        {rows && (
            <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-[10px] tabular-nums">
                    <thead className="text-[8px] font-black uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="pb-1 pr-2">Target</th>
                            <th className="pb-1 pr-2">Worst</th>
                            <th className="pb-1 pr-2">Mean</th>
                            <th className="pb-1 text-right">Goal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/40 text-slate-300">
                        {rows.map((row, index) => {
                            const meets = row.statistics.maxGapMs !== null
                                && row.statistics.maxGapMs <= requirementMs;
                            // Rows are the reference plus up to two comparison
                            // points, replaced wholesale on each computed
                            // result — index is stable within that and, unlike
                            // `target.name`, never collides when two targets
                            // happen to share a name.
                            return (
                                <tr key={index}>
                                    <th className="py-1.5 pr-2 font-bold text-slate-100">{row.target.name}</th>
                                    <td className="py-1.5 pr-2">{formatGap(row.statistics.maxGapMs)}</td>
                                    <td className="py-1.5 pr-2">{formatGap(row.statistics.meanGapMs)}</td>
                                    <td className={`py-1.5 text-right font-black ${meets ? 'text-lime-300' : 'text-red-300'}`}>
                                        {meets ? 'MEETS' : 'MISSES'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}
    </section>
);
