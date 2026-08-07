/**
 * AreaPanel — run an area and read the heat map.
 *
 * Areas are opt-in: every cell is a full engine run, so nothing here starts
 * until the user asks. The panel's job is to make the two things that can
 * mislead impossible to miss — that the mean is over cells rather than area, and
 * that a never-in-view cell makes the worst case unbounded rather than large.
 */

import React from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { AREA_PRESETS, areaForPreset } from '../domain/areaPresets';
import { validateArea } from '../domain/areaTarget';
import type { RevisitScenario } from '../domain/types';
import { heatLegendStops } from '../render/heatMapColors';
import { REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface AreaPanelProps {
    scenario: RevisitScenario;
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    error: string | null;
    /** 0–1 while running, null when idle. */
    progress: number | null;
    requirementMs: number;
    onRun: (presetName: string) => void;
    onClear: () => void;
    onExportCsv: () => void;
}

export const AreaPanel: React.FC<AreaPanelProps> = ({
    scenario, analysis, isRunning, error, progress, requirementMs, onRun, onClear, onExportCsv,
}) => {
    const unbounded = analysis !== null && analysis.neverInViewCount > 0;

    return (
        <div className={`${REVISIT_PANEL} px-3 py-2.5`}>
            <div className="flex items-baseline justify-between">
                <span className={REVISIT_LABEL}>Area coverage</span>
                {isRunning && (
                    <span className="text-[9px] tabular-nums text-slate-500">
                        {progress === null ? 'running cells…' : `${Math.round(progress * 100)}%`}
                    </span>
                )}
            </div>

            {isRunning && progress !== null && (
                <div className="mt-1 h-0.5 w-full overflow-hidden rounded bg-slate-700/60">
                    <div
                        className="h-full bg-amber-400 transition-[width] duration-150"
                        style={{ width: `${Math.round(progress * 100)}%` }}
                    />
                </div>
            )}

            <div className="mt-1.5 flex flex-wrap gap-1">
                {AREA_PRESETS.map((preset) => {
                    const area = areaForPreset(preset, scenario.reference, scenario.payload);
                    const validation = validateArea(area, scenario.reference, scenario.payload);
                    const active = analysis?.area.name === preset.name;
                    return (
                        <button
                            key={preset.name}
                            type="button"
                            disabled={isRunning || !validation.ok}
                            onClick={() => onRun(preset.name)}
                            title={validation.ok
                                ? `${validation.estimatedCells} cells at ${area.gridSpacingDeg}°`
                                : validation.errors.join(' ')}
                            className={[
                                'rounded border px-2 py-0.5 text-[10px] font-bold transition-colors disabled:opacity-40',
                                active
                                    ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                                    : 'border-slate-600 text-slate-300 hover:border-amber-400/50',
                            ].join(' ')}
                        >
                            {preset.name}
                        </button>
                    );
                })}
                {analysis && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:text-slate-300"
                    >
                        Clear
                    </button>
                )}
            </div>

            {error && <p className="mt-1.5 text-[10px] leading-4 text-red-300">{error}</p>}

            {analysis && (
                <>
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-slate-700/50 pt-2">
                        <div>
                            <span className={REVISIT_LABEL}>Worst cell</span>
                            <div className={`text-sm font-black tabular-nums ${unbounded ? 'text-violet-300' : 'text-amber-300'}`}>
                                {unbounded ? 'never seen' : formatGap(analysis.worstCell?.maxGapMs ?? null)}
                            </div>
                        </div>
                        <div>
                            <span className={REVISIT_LABEL}>Mean cell</span>
                            <div className="text-sm font-bold tabular-nums text-slate-200">
                                {formatGap(analysis.meanCellMaxGapMs)}
                            </div>
                        </div>
                        <div>
                            <span className={REVISIT_LABEL}>Best cell</span>
                            <div className="text-sm font-bold tabular-nums text-slate-200">
                                {formatGap(analysis.bestCell?.maxGapMs ?? null)}
                            </div>
                        </div>
                    </div>

                    <p className="mt-1 text-[9px] leading-3 text-slate-500">
                        {analysis.cells.length} cells at {analysis.area.gridSpacingDeg}° ·
                        mean is over cells, not area
                    </p>

                    {/* Legend. The scale is anchored to the requirement, not to
                        this area's own range — see heatMapColors. */}
                    <div className="mt-1.5 flex items-center gap-2">
                        {heatLegendStops(requirementMs).map((stop) => (
                            <span key={stop.label} className="flex items-center gap-1">
                                <span className="h-2 w-2 rounded-sm" style={{ background: stop.css }} />
                                <span className="text-[9px] text-slate-500">{stop.label}</span>
                            </span>
                        ))}
                    </div>

                    {analysis.warnings.map((warning) => (
                        <p key={warning} className="mt-1 text-[9px] leading-3 text-amber-200/80">
                            {warning}
                        </p>
                    ))}

                    <button
                        type="button"
                        onClick={onExportCsv}
                        className="mt-1.5 rounded border border-slate-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-slate-300 hover:border-sky-400/50 hover:text-sky-200"
                    >
                        Export grid CSV
                    </button>
                </>
            )}
        </div>
    );
};
