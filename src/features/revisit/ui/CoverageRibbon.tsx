/**
 * Context-aware temporal result.
 *
 * POINTS keeps one bounded lane per target. AREA keeps only the contractual
 * worst-cell intervals. An averaged area timeline has no clear mission meaning
 * and is deliberately neither computed nor presented.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { SimulationSpeed } from '../../../time/SimulationClock';
import type { AreaAnalysis } from '../analysis/areaAnalysis';
import { computeGaps, formatGap } from '../analysis/gapStatistics';
import { REFERENCE_POINT_ID, type RevisitAnalysisContext } from '../domain/analysisTargets';
import type { AccessInterval, GapStatistics } from '../domain/types';
import { REVISIT_COLORS, REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

export interface CoverageRibbonLane {
    id: string;
    label: string;
    /** The bare target name, for contexts (like the comparison table) that
     * must not carry the "Reference · " / "Compare N · " label prefix. */
    name: string;
    intervals: AccessInterval[];
    statistics: GapStatistics | null;
    selected?: boolean;
}

interface CoverageRibbonProps {
    /** Backward-compatible reference lane. */
    intervals: AccessInterval[];
    statistics: GapStatistics | null;
    pointLanes?: CoverageRibbonLane[];
    areaAnalysis?: AreaAnalysis | null;
    windowStartMs: number;
    windowHours: number;
    getTimeMs: () => number;
    onSeek: (ms: number) => void;
    speed: SimulationSpeed;
    onSetSpeed: (speed: SimulationSpeed) => void;
    analysisContext?: RevisitAnalysisContext;
    referenceTargetName?: string;
    areaName?: string | null;
    requirementMs?: number;
    comparisonIsComputing?: boolean;
    comparisonError?: string | null;
    onSelectPoint?: (id: string) => void;
}

const TRACK_HEIGHT = 18;

function longestInteriorGap(
    intervals: AccessInterval[], statistics: GapStatistics | null,
    windowStartMs: number, windowHours: number,
) {
    if (!statistics || statistics.maxGapMs === null) return null;
    const gaps = computeGaps(intervals, {
        startMs: windowStartMs, durationHours: windowHours, stepSeconds: 1,
    }).filter((gap) => !gap.truncatedAtStart && !gap.truncatedAtEnd);
    return gaps.length > 0
        ? gaps.reduce((worst, gap) => gap.durationMs > worst.durationMs ? gap : worst)
        : null;
}

export const CoverageRibbon: React.FC<CoverageRibbonProps> = ({
    intervals, statistics, pointLanes, areaAnalysis,
    windowStartMs, windowHours, getTimeMs, onSeek,
    speed, onSetSpeed, analysisContext = 'POINTS',
    referenceTargetName = 'Reference target', areaName,
    requirementMs = 2 * 3600_000, comparisonIsComputing = false,
    comparisonError = null, onSelectPoint,
}) => {
    const seekRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const [currentHours, setCurrentHours] = useState(0);
    const windowMs = windowHours * 3600_000;
    const windowEndMs = windowStartMs + windowMs;
    const fractionOf = (ms: number) => Math.max(0, Math.min(1, (ms - windowStartMs) / windowMs));

    const lanes = useMemo<CoverageRibbonLane[]>(() => pointLanes?.length ? pointLanes : [{
        id: REFERENCE_POINT_ID, label: referenceTargetName, name: referenceTargetName,
        intervals, statistics, selected: true,
    }], [pointLanes, referenceTargetName, intervals, statistics]);
    const pointRows = useMemo(() => lanes.map((lane) => ({
        ...lane,
        longestGap: longestInteriorGap(lane.intervals, lane.statistics, windowStartMs, windowHours),
    })), [lanes, windowStartMs, windowHours]);
    const areaWorstGap = useMemo(() => areaAnalysis ? longestInteriorGap(
        areaAnalysis.worstCellIntervals,
        areaAnalysis.worstCell?.statistics ?? null,
        windowStartMs,
        windowHours,
    ) : null, [areaAnalysis, windowStartMs, windowHours]);
    useEffect(() => {
        let frame = 0;
        let lastAriaMs = 0;
        const tick = () => {
            frame = requestAnimationFrame(tick);
            const nowMs = getTimeMs();
            if (playheadRef.current) {
                playheadRef.current.style.left = `${fractionOf(nowMs) * 100}%`;
            }
            const wall = performance.now();
            if (wall - lastAriaMs >= 500) {
                lastAriaMs = wall;
                const hours = (nowMs - windowStartMs) / 3600_000;
                setCurrentHours((previous) => Math.abs(previous - hours) >= 0.1 ? hours : previous);
            }
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
        // fractionOf is intentionally derived from these stable scalar inputs.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getTimeMs, windowStartMs, windowMs]);

    const seekToHours = (hours: number) => {
        const clamped = Math.max(0, Math.min(windowHours, hours));
        onSeek(windowStartMs + clamped * 3600_000);
    };
    const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        const rect = seekRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        onSeek(windowStartMs + Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) * windowMs);
    };
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const current = (getTimeMs() - windowStartMs) / 3600_000;
        const next = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? current + 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? current - 1
                : event.key === 'PageUp' ? current + 6
                    : event.key === 'PageDown' ? current - 6
                        : event.key === 'Home' ? 0
                            : event.key === 'End' ? windowHours : null;
        if (next === null) return;
        event.preventDefault();
        seekToHours(next);
        setCurrentHours(Math.max(0, Math.min(windowHours, next)));
    };
    const hourTicks = useMemo(() => {
        const step = windowHours <= 24 ? 6 : 12;
        const values: number[] = [];
        for (let hour = 0; hour <= windowHours; hour += step) values.push(hour);
        return values;
    }, [windowHours]);
    const timestampMs = windowStartMs + Math.max(0, Math.min(windowHours, currentHours)) * 3600_000;
    const showComparisonSidecar = analysisContext === 'POINTS' && pointRows.length > 1;
    /** The sidecar carries the per-lane figures, so the rows drop their value column. */
    const hasValueColumn = analysisContext === 'AREA' || !showComparisonSidecar;
    const trackColumns = hasValueColumn
        ? 'grid-cols-[6rem_minmax(0,1fr)_5rem]'
        : 'grid-cols-[6rem_minmax(0,1fr)]';
    /** AREA without an analysis shows a placeholder, not a timeline: nothing to seek on. */
    const hasSeekableTrack = analysisContext === 'AREA' ? Boolean(areaAnalysis) : pointRows.length > 0;

    const accessTrack = (
        laneIntervals: AccessInterval[], longestGap: ReturnType<typeof longestInteriorGap>,
        color: string,
    ) => (
        <svg className="block w-full" height={TRACK_HEIGHT} aria-hidden="true">
            <rect width="100%" height={TRACK_HEIGHT} rx={3} fill="#111a2b" stroke="#1e2b42" />
            {laneIntervals.map((interval, index) => {
                const clippedStart = Math.max(interval.startMs, windowStartMs);
                const clippedEnd = Math.min(interval.endMs, windowEndMs);
                if (clippedEnd <= clippedStart) return null;
                return <rect key={`${interval.startMs}-${index}`} x={`${fractionOf(clippedStart) * 100}%`} y={0}
                    width={`${Math.max((clippedEnd - clippedStart) / windowMs * 100, 0.12)}%`}
                    height={TRACK_HEIGHT} fill={color} opacity={0.94} />;
            })}
            {longestGap && <rect x={`${fractionOf(longestGap.startMs) * 100}%`} y={1}
                width={`${longestGap.durationMs / windowMs * 100}%`} height={TRACK_HEIGHT - 2}
                fill={REVISIT_COLORS.alert} fillOpacity={0.16} stroke={REVISIT_COLORS.alert}
                strokeWidth={1.2} rx={2} />}
        </svg>
    );

    return (
        <section className={`${REVISIT_PANEL} revisit-coverage-ribbon overflow-hidden`} aria-label="Coverage timeline">
            <div className={showComparisonSidecar ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_400px]' : ''}>
                <div className="px-2 pt-2 sm:px-4 sm:pt-3 lg:col-start-1 lg:row-start-1">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div>
                            <div className={REVISIT_LABEL}>
                                {analysisContext === 'AREA' ? 'Worst-cell access timeline' : lanes.length > 1 ? 'Point access comparison' : 'Reference point access'}
                            </div>
                            <div className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:block">
                                {analysisContext === 'AREA'
                                    ? `${areaName ?? 'Area'} · contractual determining cell`
                                    : `${windowHours} h analysis window · one access lane per point`}
                            </div>
                        </div>
                        {analysisContext === 'AREA' && areaAnalysis?.worstCell && (
                            <span className="text-[9px] font-bold tabular-nums text-sky-200">
                                {areaAnalysis.worstCell.target.latDeg.toFixed(2)}° · {areaAnalysis.worstCell.target.lonDeg.toFixed(2)}°
                            </span>
                        )}
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Simulation time controls">
                        <button type="button" onClick={() => onSetSpeed(speed === 0 ? 1 : 0)}
                            aria-label={speed === 0 ? 'Play simulation' : 'Pause simulation'}
                            className="min-h-8 rounded border border-slate-600 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-slate-200 hover:border-amber-400/60">
                            {speed === 0 ? 'Play' : 'Pause'}
                        </button>
                        {/* Hour stepping duplicates tap-to-seek on the timeline
                            below and costs a wrapped row a phone cannot spare
                            (mobile UX plan §4); play/pause and speed stay at
                            every width. */}
                        <button type="button" onClick={() => seekToHours(currentHours - 1)} aria-label="Step simulation back one hour"
                            className="hidden min-h-8 rounded border border-slate-700 px-2 text-[10px] font-bold text-slate-300 sm:block">−1 h</button>
                        <button type="button" onClick={() => seekToHours(currentHours + 1)} aria-label="Step simulation forward one hour"
                            className="hidden min-h-8 rounded border border-slate-700 px-2 text-[10px] font-bold text-slate-300 sm:block">+1 h</button>
                        <label className="flex min-h-8 items-center gap-1 rounded border border-slate-700 px-2">
                            <span className="text-[9px] font-black uppercase tracking-[0.08em] text-slate-500">Speed</span>
                            <select aria-label="Simulation speed" value={speed === 0 ? 1 : speed}
                                onChange={(event) => onSetSpeed(Number(event.target.value))}
                                className="bg-transparent text-[10px] font-bold text-slate-200 outline-none">
                                <option value={1}>1×</option><option value={10}>10×</option><option value={100}>100×</option>
                            </select>
                        </label>
                        <time dateTime={new Date(timestampMs).toISOString()} className="ml-auto text-[10px] font-bold tabular-nums text-sky-200">
                            {new Date(timestampMs).toISOString().replace('T', ' ').slice(0, 19)} UTC
                        </time>
                    </div>
                </div>

                {showComparisonSidecar && (
                    <section className="hidden lg:contents" aria-label="Target comparison">
                        <div className="border-l border-slate-700/60 bg-slate-950/25 px-4 pt-3 lg:col-start-2 lg:row-start-1">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className={REVISIT_LABEL}>Compare targets</div>
                                    <p className="mt-0.5 text-[9px] text-slate-500">Same topology, FOV and requirement</p>
                                    {comparisonError && <p role="alert" className="mt-0.5 text-[9px] text-red-300">{comparisonError}</p>}
                                </div>
                                {comparisonIsComputing && <span className="text-[8px] font-black uppercase tracking-wide text-sky-300">Computing…</span>}
                            </div>
                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4rem] gap-2 text-[8px] font-black uppercase tracking-wide text-slate-500">
                                <span>Target</span><span>Worst</span><span>Mean</span><span className="text-right">Goal</span>
                            </div>
                        </div>

                        <div className="border-l border-slate-700/60 bg-slate-950/25 px-4 lg:col-start-2 lg:row-start-2">
                            <div className="space-y-1.5">
                                {pointRows.map((lane, index) => {
                                    const maxGapMs = lane.statistics?.maxGapMs ?? null;
                                    const meets = maxGapMs !== null && maxGapMs <= requirementMs;
                                    const waiting = index > 0 && !lane.statistics && comparisonIsComputing;
                                    return (
                                        <div
                                            key={lane.id}
                                            data-revisit-comparison-row={lane.id}
                                            className={`grid h-7 grid-cols-[minmax(0,1fr)_4.5rem_4.5rem_4rem] items-center gap-2 rounded px-1 text-[9px] tabular-nums ${lane.selected ? 'bg-sky-400/10' : ''}`}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onSelectPoint?.(lane.id)}
                                                className={`truncate text-left font-bold ${index === 0 ? 'text-amber-200' : 'text-sky-200'}`}
                                            >{lane.name}</button>
                                            <span className="text-slate-200">{waiting ? '…' : formatGap(maxGapMs)}</span>
                                            <span className="text-slate-400">{waiting ? '…' : formatGap(lane.statistics?.meanGapMs ?? null)}</span>
                                            <span className={`text-right font-black ${maxGapMs === null ? 'text-slate-500' : meets ? 'text-lime-300' : 'text-red-300'}`}>
                                                {maxGapMs === null ? '—' : meets ? 'MEETS' : 'MISSES'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="border-l border-slate-700/60 bg-slate-950/25 lg:col-start-2 lg:row-start-3" />
                    </section>
                )}

                <div className="px-2 sm:px-4 lg:col-start-1 lg:row-start-2">
                    <div className="relative" data-revisit-timeline>
                        {analysisContext === 'AREA' ? (
                            areaAnalysis ? <div className="space-y-1.5">
                                <div className="grid h-7 grid-cols-[6rem_minmax(0,1fr)_5rem] items-center gap-2">
                                    <span className="truncate text-[9px] font-bold text-amber-200">Worst cell</span>
                                    {accessTrack(areaAnalysis.worstCellIntervals, areaWorstGap, REVISIT_COLORS.accent)}
                                    <span className="text-right text-[8px] font-bold text-red-300">
                                        {areaAnalysis.neverInViewCount > 0 ? 'Never seen' : formatGap(areaAnalysis.worstCell?.maxGapMs ?? null)}
                                    </span>
                                </div>
                            </div> : <div className="rounded border border-dashed border-slate-700 px-3 py-2 text-[10px] text-slate-400">
                                Define a valid area to populate the area timeline automatically.
                            </div>
                        ) : <div className="space-y-1.5">
                            {pointRows.map((lane, index) => (
                                <div
                                    key={lane.id}
                                    data-revisit-timeline-lane={lane.id}
                                    className={`grid h-7 items-center gap-2 rounded ${trackColumns} ${lane.selected ? 'bg-white/[0.04]' : ''}`}
                                >
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onSelectPoint?.(lane.id);
                                        }}
                                        className={`truncate text-left text-[9px] font-bold ${index === 0 ? 'text-amber-200' : 'text-sky-200'}`}
                                    >{lane.label}</button>
                                    {accessTrack(lane.intervals, lane.longestGap, index === 0 ? REVISIT_COLORS.accent : '#38bdf8')}
                                    {!showComparisonSidecar && <span className="text-right text-[8px] font-bold text-slate-400">{formatGap(lane.statistics?.maxGapMs ?? null)}</span>}
                                </div>
                            ))}
                        </div>}

                        {/*
                          * The seek surface overlays the TRACK COLUMN only, and
                          * carries the playhead with it.
                          *
                          * It used to be the wrapper around the whole rows
                          * block, which had two consequences. Functionally, the
                          * fraction was computed over a box ~11rem wider than
                          * the track it annotates, so the playhead and every
                          * click landed offset from the intervals they pointed
                          * at (~100 px at desktop width). For accessibility, a
                          * `role="slider"` wrapping the per-lane buttons is a
                          * nested interactive control, which screen readers do
                          * not reliably announce.
                          *
                          * The spacer cells reproduce the row template so the
                          * middle cell is exactly the track box.
                          */}
                        {hasSeekableTrack && (
                            <div className={`pointer-events-none absolute inset-0 grid gap-2 ${trackColumns}`}>
                                <div />
                                <div
                                    ref={seekRef}
                                    role="slider"
                                    tabIndex={0}
                                    onClick={handleClick}
                                    onKeyDown={handleKeyDown}
                                    aria-label={`Seek within the ${windowHours} hour analysis window`}
                                    aria-valuemin={0}
                                    aria-valuemax={windowHours}
                                    aria-valuenow={Number(currentHours.toFixed(2))}
                                    aria-valuetext={`${currentHours.toFixed(1)} hours into the window`}
                                    className="pointer-events-auto relative cursor-pointer rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
                                >
                                    <div
                                        ref={playheadRef}
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-y-0 left-0 w-px bg-white shadow-[0_0_4px_#fff]"
                                    />
                                </div>
                                {hasValueColumn && <div />}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-2 pb-2 sm:px-4 sm:pb-3 lg:col-start-1 lg:row-start-3">
                    <div className="mt-1 flex justify-between text-[9px] font-semibold tabular-nums text-slate-500">
                        {hourTicks.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
                    </div>
                </div>
            </div>
        </section>
    );
};
