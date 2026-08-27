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
import { REVISIT_COLORS, REVISIT_LABEL, REVISIT_OUTCOME, REVISIT_PANEL } from './revisitTheme';

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

/** One row in the unified target set. Point and Area rows deliberately expose
 * only the contractual max-gap basis they share; their different mean
 * semantics are never placed in the same comparison column. */
export interface CoverageRibbonTarget extends CoverageRibbonLane {
    kind: 'POINT' | 'AREA';
    roleLabel: string;
    basisLabel: 'Point' | 'Least-covered cell';
    statusLabel?: string | null;
    unbounded?: boolean;
}

interface CoverageRibbonProps {
    /** Backward-compatible reference lane. */
    intervals: AccessInterval[];
    statistics: GapStatistics | null;
    pointLanes?: CoverageRibbonLane[];
    targetLanes?: CoverageRibbonTarget[];
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
    /**
     * Why the comparison lanes are empty, when they failed.
     *
     * The comparison used to report its failure through the presentation-wide
     * blocking notice, which stopped the demonstration over a background
     * calculation. It is stated here instead — in the block it belongs to, and
     * without adding a row: the status slot and the subtitle already exist.
     */
    comparisonError?: string | null;
    onSelectPoint?: (id: string) => void;
    onSelectTarget?: (id: string) => void;
}

const TRACK_HEIGHT = 18;

function goalTextClass(maxGapMs: number | null, requirementMs: number, unbounded = false): string {
    if (unbounded) return REVISIT_OUTCOME.error.text;
    if (maxGapMs === null) return REVISIT_OUTCOME.unavailable.text;
    return maxGapMs <= requirementMs
        ? REVISIT_OUTCOME.meets.text
        : REVISIT_OUTCOME.misses.text;
}

/** `datetime-local` has no timezone field. REVISIT defines the control as UTC,
 * so the displayed wall-clock fields are always cut from an ISO UTC value. */
function utcDateTimeInputValue(ms: number): string {
    return new Date(ms).toISOString().slice(0, 19);
}

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
    intervals, statistics, pointLanes, targetLanes, areaAnalysis,
    windowStartMs, windowHours, getTimeMs, onSeek,
    speed, onSetSpeed, analysisContext = 'POINTS',
    referenceTargetName = 'Reference target',
    requirementMs = 2 * 3600_000, comparisonIsComputing = false, comparisonError = null,
    onSelectPoint, onSelectTarget = onSelectPoint,
}) => {
    const seekRef = useRef<HTMLDivElement | null>(null);
    const playheadRef = useRef<HTMLDivElement | null>(null);
    const [currentHours, setCurrentHours] = useState(0);
    const windowMs = windowHours * 3600_000;
    const windowEndMs = windowStartMs + windowMs;
    const fractionOf = (ms: number) => Math.max(0, Math.min(1, (ms - windowStartMs) / windowMs));

    const lanes = useMemo<CoverageRibbonLane[]>(() => pointLanes !== undefined ? pointLanes : [{
        id: REFERENCE_POINT_ID, label: referenceTargetName, name: referenceTargetName,
        intervals, statistics, selected: true,
    }], [pointLanes, referenceTargetName, intervals, statistics]);
    const targetRows = useMemo(() => {
        const targets: CoverageRibbonTarget[] = targetLanes !== undefined ? targetLanes : lanes.map((lane, index) => ({
            ...lane,
            kind: 'POINT',
            roleLabel: index === 0 ? 'Reference target' : 'Comparison target',
            basisLabel: 'Point',
            statusLabel: null,
            unbounded: false,
        }));
        return targets.map((lane) => ({
            ...lane,
            longestGap: longestInteriorGap(lane.intervals, lane.statistics, windowStartMs, windowHours),
        }));
    }, [targetLanes, lanes, windowStartMs, windowHours]);
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
    const handleDateTimeChange = (value: string) => {
        if (!value) return;
        const requestedMs = Date.parse(`${value}Z`);
        if (!Number.isFinite(requestedMs)) return;
        const boundedMs = Math.max(windowStartMs, Math.min(windowEndMs, requestedMs));
        onSeek(boundedMs);
        // `SimulationClock.setDateTime` resumes at 1× by design. Pause after
        // seeking so the manually entered instant remains stable for review.
        onSetSpeed(0);
        setCurrentHours((boundedMs - windowStartMs) / 3600_000);
    };
    const showComparisonSidecar = targetRows.length > 1;
    /** The sidecar carries the per-lane figures, so the rows drop their value column. */
    const hasValueColumn = !showComparisonSidecar;
    const trackColumns = hasValueColumn
        ? 'grid-cols-[6rem_minmax(0,1fr)_5rem]'
        : 'grid-cols-[6rem_minmax(0,1fr)]';
    /** AREA without an analysis shows a placeholder, not a timeline: nothing to seek on. */
    const hasSeekableTrack = targetRows.some((row) => row.kind === 'POINT' || row.intervals.length > 0);

    const accessTrack = (
        laneIntervals: AccessInterval[], longestGap: ReturnType<typeof longestInteriorGap>,
        color: string, emphasised = true,
    ) => {
        const gapColor = longestGap?.durationMs && longestGap.durationMs > requirementMs
            ? REVISIT_COLORS.miss
            : color;
        return (
        <svg className={`block w-full transition-opacity ${emphasised ? 'opacity-100' : 'opacity-75'}`} height={TRACK_HEIGHT} aria-hidden="true">
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
                fill={gapColor} fillOpacity={0.16} stroke={gapColor}
                data-revisit-gap-outcome={longestGap.durationMs > requirementMs ? 'misses' : 'meets'}
                strokeWidth={1.2} rx={2} />}
        </svg>
        );
    };

    /*
     * A failure states itself where the comparison lives, using the two slots
     * the header already has: the status word and the subtitle. It costs no
     * extra row, and it stays out of the presentation notice, which is reserved
     * for the result actually on screen.
     */
    const comparisonSubtitle = comparisonError
        ? 'Comparison unavailable — the selected result above is unaffected.'
        : 'Same topology, FOV and requirement';
    const comparisonStatus = comparisonError
        ? (
            <span
                className="text-[11px] font-black uppercase tracking-wide text-red-300"
                title={comparisonError}
            >
                Unavailable
            </span>
        )
        : comparisonIsComputing
            ? <span className="text-[11px] font-black uppercase tracking-wide text-sky-300">Computing…</span>
            : null;

    return (
        <section className={`${REVISIT_PANEL} revisit-coverage-ribbon overflow-hidden`} aria-label="Coverage timeline">
            <div className={showComparisonSidecar ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_400px]' : ''}>
                <div className="px-2 pt-2 sm:px-4 sm:pt-3 lg:col-start-1 lg:row-start-1">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                        <div>
                            <div className={REVISIT_LABEL}>
                                {targetRows.length === 0
                                    ? 'No target selected'
                                    : targetRows.length > 1 ? 'Observation schedule comparison' : 'Reference target access'}
                            </div>
                            <div className="mt-0.5 hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 sm:block">
                                {targetRows.length === 0
                                    ? 'Add a reference target to create an access lane'
                                    : targetRows.some((row) => row.kind === 'AREA')
                                    ? `${windowHours} h window · Point lanes + Area worst-cell lane`
                                    : `${windowHours} h analysis window · one access lane per point`}
                            </div>
                        </div>
                        {analysisContext === 'AREA' && areaAnalysis?.worstCell && (
                            <span className="text-[11px] font-bold tabular-nums text-sky-200">
                                {areaAnalysis.worstCell.target.latDeg.toFixed(2)}° · {areaAnalysis.worstCell.target.lonDeg.toFixed(2)}°
                            </span>
                        )}
                    </div>

                    <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Simulation time controls">
                        <button type="button" onClick={() => onSetSpeed(speed === 0 ? 1 : 0)}
                            aria-label={speed === 0 ? 'Play simulation' : 'Pause simulation'}
                            className="min-h-11 md:min-h-8 rounded border border-slate-600 px-2 text-[12px] font-black uppercase tracking-[0.08em] text-slate-200 hover:border-slate-300">
                            {speed === 0 ? 'Play' : 'Pause'}
                        </button>
                        {/* Hour stepping duplicates tap-to-seek on the timeline
                            below and costs a wrapped row a phone cannot spare
                            (mobile UX plan §4); play/pause and speed stay at
                            every width. */}
                        <button type="button" onClick={() => seekToHours(currentHours - 1)} aria-label="Step simulation back one hour"
                            className="hidden min-h-11 md:min-h-8 rounded border border-slate-700 px-2 text-[12px] font-bold text-slate-300 sm:block">−1 h</button>
                        <button type="button" onClick={() => seekToHours(currentHours + 1)} aria-label="Step simulation forward one hour"
                            className="hidden min-h-11 md:min-h-8 rounded border border-slate-700 px-2 text-[12px] font-bold text-slate-300 sm:block">+1 h</button>
                        <label className="flex min-h-11 md:min-h-8 items-center gap-1 rounded border border-slate-700 px-2">
                            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Speed</span>
                            <select aria-label="Simulation speed" value={speed === 0 ? 1 : speed}
                                onChange={(event) => onSetSpeed(Number(event.target.value))}
                                className="min-h-11 bg-transparent text-[12px] font-bold text-slate-200 outline-none md:min-h-0">
                                <option value={1}>1×</option><option value={10}>10×</option><option value={100}>100×</option>
                            </select>
                        </label>
                        <label className="ml-auto flex min-h-11 items-center gap-1.5 rounded border border-slate-600/70 px-2 md:min-h-8">
                            <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">UTC</span>
                            <input
                                type="datetime-local"
                                step={1}
                                min={utcDateTimeInputValue(windowStartMs)}
                                max={utcDateTimeInputValue(windowEndMs)}
                                value={utcDateTimeInputValue(timestampMs)}
                                onChange={(event) => handleDateTimeChange(event.target.value)}
                                aria-label="Simulation date and time UTC"
                                className="min-h-9 bg-transparent text-[12px] font-bold tabular-nums text-slate-100 outline-none [color-scheme:dark] md:min-h-0"
                            />
                        </label>
                    </div>
                </div>

                {showComparisonSidecar && (
                    <section className="hidden lg:contents" aria-label="Target comparison">
                        <div className="border-l border-slate-700/60 bg-slate-950/25 px-4 pt-3 lg:col-start-2 lg:row-start-1">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className={REVISIT_LABEL}>Compare targets</div>
                                    <p className={`mt-0.5 text-[11px] ${comparisonError ? 'text-red-200' : 'text-slate-500'}`}>
                                        {comparisonSubtitle}
                                    </p>
                                </div>
                                {comparisonStatus}
                            </div>
                            <div className="mt-3 grid grid-cols-[minmax(0,1fr)_4.5rem_5rem_4rem] gap-2 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                <span>Target</span><span>Basis</span><span>Maximum gap</span><span className="text-right">Goal</span>
                            </div>
                        </div>

                        <div className="border-l border-slate-700/60 bg-slate-950/25 px-4 lg:col-start-2 lg:row-start-2">
                            <div className="space-y-1.5">
                                {targetRows.map((lane, index) => {
                                    const maxGapMs = lane.statistics?.maxGapMs ?? null;
                                    const meets = maxGapMs !== null && maxGapMs <= requirementMs;
                                    const waiting = Boolean(lane.statusLabel) || (index > 0 && !lane.statistics && comparisonIsComputing);
                                    const isReference = lane.roleLabel === 'Reference';
                                    const selectedTone = isReference
                                        ? 'border-y border-l-[3px] border-amber-300/60 bg-amber-400/12 shadow-[inset_0_0_14px_rgba(251,191,36,0.08)]'
                                        : 'border-y border-l-[3px] border-sky-300/60 bg-sky-400/12 shadow-[inset_0_0_14px_rgba(56,189,248,0.09)]';
                                    return (
                                        <div
                                            key={lane.id}
                                            data-revisit-comparison-row={lane.id}
                                            onClick={() => onSelectTarget?.(lane.id)}
                                            className={`grid h-7 cursor-pointer grid-cols-[minmax(0,1fr)_4.5rem_5rem_4rem] items-center gap-2 rounded px-1 text-[11px] tabular-nums transition-colors hover:bg-white/[0.05] ${lane.selected ? selectedTone : 'border-y border-l-[3px] border-transparent'}`}
                                        >
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onSelectTarget?.(lane.id);
                                                }}
                                                aria-pressed={lane.selected}
                                                title={lane.label}
                                                className={`truncate text-left font-bold ${isReference ? 'text-amber-200' : 'text-sky-200'} ${lane.selected ? 'brightness-125' : ''}`}
                                            >{lane.roleLabel} · {lane.name}</button>
                                            <span className="truncate text-slate-400">{lane.basisLabel}</span>
                                            <span className="text-slate-200">{lane.statusLabel ?? (lane.unbounded ? 'Never seen' : waiting ? '…' : formatGap(maxGapMs))}</span>
                                            <span className={`text-right font-black ${goalTextClass(maxGapMs, requirementMs, lane.unbounded)}`}>
                                                {lane.unbounded ? 'MISSES' : maxGapMs === null ? '—' : meets ? 'MEETS' : 'MISSES'}
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
                        <div className="space-y-1.5">
                            {targetRows.map((lane) => {
                                const isReference = lane.roleLabel === 'Reference';
                                const selectedTone = isReference
                                    ? 'border-y border-l-[3px] border-amber-300/60 bg-amber-400/12 shadow-[inset_0_0_14px_rgba(251,191,36,0.08)]'
                                    : 'border-y border-l-[3px] border-sky-300/60 bg-sky-400/12 shadow-[inset_0_0_14px_rgba(56,189,248,0.09)]';
                                return (
                                    <div
                                        key={lane.id}
                                        data-revisit-timeline-lane={lane.id}
                                        className={`grid h-7 items-center gap-2 rounded transition-colors ${trackColumns} ${lane.selected ? selectedTone : 'border-y border-l-[3px] border-transparent'}`}
                                    >
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onSelectTarget?.(lane.id);
                                            }}
                                            aria-pressed={lane.selected}
                                            title={lane.label}
                                            className={`truncate text-left text-[11px] font-bold ${isReference ? 'text-amber-200' : 'text-sky-200'} ${lane.selected ? 'brightness-125' : ''}`}
                                        >{lane.label}</button>
                                        {accessTrack(
                                            lane.intervals,
                                            lane.longestGap,
                                            isReference ? REVISIT_COLORS.target : REVISIT_COLORS.comparison,
                                            lane.selected || targetRows.length === 1,
                                        )}
                                        {!showComparisonSidecar && <span className="text-right text-[11px] font-bold text-slate-400">{lane.statusLabel ?? (lane.unbounded ? 'Never seen' : formatGap(lane.statistics?.maxGapMs ?? null))}</span>}
                                    </div>
                                );
                            })}
                        </div>

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

                {showComparisonSidecar && (
                    <details className="group mx-2 mt-2 rounded border border-slate-700/60 bg-slate-950/25 px-2 py-1.5 sm:mx-4 lg:hidden">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-left">
                            <span>
                                <span className={REVISIT_LABEL}>Compare targets</span>
                                <span className={`mt-0.5 block text-[11px] ${comparisonError ? 'text-red-200' : 'text-slate-500'}`}>
                                    {comparisonSubtitle}
                                </span>
                            </span>
                            <span className="flex items-center gap-2">
                                {comparisonStatus}
                                <span aria-hidden="true" className="text-slate-500 transition-transform group-open:rotate-90">›</span>
                            </span>
                        </summary>
                        <div className="overflow-x-auto pb-1">
                            <div className="grid min-w-[22rem] grid-cols-[minmax(0,1fr)_6rem_5rem_4rem] gap-2 border-b border-slate-700/50 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
                                <span>Target</span><span>Basis</span><span>Maximum gap</span><span className="text-right">Goal</span>
                            </div>
                            {targetRows.map((lane, index) => {
                                const maxGapMs = lane.statistics?.maxGapMs ?? null;
                                const meets = maxGapMs !== null && maxGapMs <= requirementMs;
                                const waiting = Boolean(lane.statusLabel) || (index > 0 && !lane.statistics && comparisonIsComputing);
                                const isReference = lane.roleLabel === 'Reference';
                                return (
                                    <button
                                        key={lane.id}
                                        type="button"
                                        data-revisit-comparison-row={lane.id}
                                        onClick={() => onSelectTarget?.(lane.id)}
                                        aria-pressed={lane.selected}
                                        className={`grid min-h-11 min-w-[22rem] w-full grid-cols-[minmax(0,1fr)_6rem_5rem_4rem] items-center gap-2 border-b border-slate-800/60 px-1 text-left text-[11px] tabular-nums ${lane.selected
                                            ? isReference ? 'border-l-[3px] border-l-amber-300/60 bg-amber-400/12' : 'border-l-[3px] border-l-sky-300/60 bg-sky-400/12'
                                            : 'border-l-[3px] border-l-transparent'}`}
                                    >
                                        <span className={`truncate font-bold ${isReference ? 'text-amber-200' : 'text-sky-200'}`}>{lane.roleLabel} · {lane.name}</span>
                                        <span className="truncate text-slate-400">{lane.basisLabel}</span>
                                        <span className="text-slate-200">{lane.statusLabel ?? (lane.unbounded ? 'Never seen' : waiting ? '…' : formatGap(maxGapMs))}</span>
                                        <span className={`text-right font-black ${goalTextClass(maxGapMs, requirementMs, lane.unbounded)}`}>
                                            {lane.unbounded ? 'MISSES' : maxGapMs === null ? '—' : meets ? 'MEETS' : 'MISSES'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </details>
                )}

                <div className="px-2 pb-2 sm:px-4 sm:pb-3 lg:col-start-1 lg:row-start-3">
                    <div className="mt-1 flex justify-between text-[11px] font-semibold tabular-nums text-slate-500">
                        {hourTicks.map((hour) => <span key={hour}>{String(hour).padStart(2, '0')}:00</span>)}
                    </div>
                </div>
            </div>
        </section>
    );
};
