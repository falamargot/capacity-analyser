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
import type { AccessInterval, AnalysisWindow, GapStatistics } from '../domain/types';
import { AnalysisWindowControl } from './AnalysisWindowControl';
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
    /** Target-owned business threshold; falls back to the legacy global prop. */
    requirementMs?: number;
    /**
     * Share of the area's cells in view per time bin, drawn as the lane's
     * background (R32). Points do not have one: a point is in view or it is
     * not, which the ticks above already say.
     */
    inViewProfile?: Float32Array;
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
    /**
     * The analysis window and its editor, when the host provides them.
     *
     * Optional so the ribbon still renders standalone in tests and in surfaces
     * that only display a timeline; the control appears where it can act.
     */
    analysisWindow?: AnalysisWindow;
    onAnalysisWindowChange?: (window: AnalysisWindow) => void;
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

/**
 * The in-view band (R32), isolated behind `React.memo`.
 *
 * The band is 360 rectangles per Area lane, and the ribbon re-renders for
 * reasons that have nothing to do with it — the playhead's clock read, a
 * comparison landing, a selection change. Its two inputs are stable: the
 * profile is the analysis's own array and the colour is a constant, so memoing
 * makes those renders skip it entirely. The ribbon is the one surface this
 * module presents from, and it has paid for avoidable work before.
 */
const InViewBand: React.FC<{ profile: Float32Array; color: string }> = React.memo(
    ({ profile, color }) => (
        <g data-revisit-inview-band={profile.length}>
            {Array.from(profile, (share, bin) => (
                share <= 0 ? null : (
                    <rect
                        key={bin}
                        x={`${bin / profile.length * 100}%`}
                        y={0}
                        width={`${100 / profile.length}%`}
                        height={TRACK_HEIGHT}
                        fill={color}
                        /*
                         * Linear in the share, deliberately: a curve that
                         * lifted small shares would read as more of the area
                         * being served than is.
                         *
                         * The floor is what keeps a barely-covered instant
                         * distinguishable from an empty one on this near-black
                         * track, and the ceiling leaves a full bin far below
                         * the 0.94 access ticks — the band must never be
                         * mistaken for one.
                         */
                        fillOpacity={0.07 + 0.38 * Math.min(1, share)}
                    />
                )
            ))}
        </g>
    )
);
InViewBand.displayName = 'InViewBand';

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
    windowStartMs, windowHours, analysisWindow, onAnalysisWindowChange,
    getTimeMs, onSeek,
    speed, onSetSpeed, analysisContext = 'POINTS',
    referenceTargetName = 'Primary target',
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
            roleLabel: index === 0 ? 'Primary' : 'Secondary',
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
    const isComparison = targetRows.length > 1;
    /** Labels and exact results flank the track at every viewport. Keeping one
     * grid prevents comparison from becoming a second UI beside the timeline. */
    const trackColumns = isComparison
        ? 'grid-cols-[6rem_minmax(0,1fr)_7rem] sm:grid-cols-[8rem_minmax(0,1fr)_8.5rem]'
        : 'grid-cols-[6rem_minmax(0,1fr)_7rem] sm:grid-cols-[8rem_minmax(0,1fr)_8.5rem]';
    /* One requirement for every lane since 2026-09-02. The per-lane value is
     * still read rather than assumed, because a lane is what carries a
     * threshold into the verdict beside it; they are simply equal now. */
    const requirementSummary = `Requirement ≤ ${formatGap(
        targetRows[0]?.requirementMs ?? requirementMs,
    )}`;
    const gapOutcomes = targetRows
        .filter((lane) => lane.longestGap !== null)
        .map((lane) => lane.longestGap!.durationMs > (lane.requirementMs ?? requirementMs));
    const hasMissingLongestGap = gapOutcomes.some(Boolean);
    const hasMeetingLongestGap = gapOutcomes.some((misses) => !misses);
    /** AREA without an analysis shows a placeholder, not a timeline: nothing to seek on. */
    const hasSeekableTrack = targetRows.some((row) => row.kind === 'POINT' || row.intervals.length > 0);

    const accessTrack = (
        laneIntervals: AccessInterval[], longestGap: ReturnType<typeof longestInteriorGap>,
        color: string, laneRequirementMs: number, emphasised = true,
        inViewProfile?: Float32Array,
    ) => {
        /*
         * The outlined span is the lane's VERDICT, so it is painted in the
         * outcome vocabulary — green passes, red misses — and never in the
         * lane's identity colour.
         *
         * It used to fall back to that identity colour when the gap met the
         * requirement, which made the Primary lane's passing gap amber
         * (#FBBF24) beside a missing one in orange (#F97316): two hues 12° apart
         * carrying opposite meanings, on the one element in the module whose
         * entire job is to say pass or fail. Green is already the module's pass
         * colour everywhere else (`REVISIT_OUTCOME.meets`, the area heat scale,
         * the KPI verdict), and it is reserved for outcomes, so it cannot be
         * confused with either target identity. The miss colour became red on
         * 2026-09-02, with the rest of the module's failure vocabulary.
         */
        const gapColor = longestGap?.durationMs && longestGap.durationMs > laneRequirementMs
            ? REVISIT_COLORS.miss
            : REVISIT_COLORS.pass;
        return (
        <svg className={`block w-full transition-opacity ${emphasised ? 'opacity-100' : 'opacity-75'}`} height={TRACK_HEIGHT} aria-hidden="true">
            <rect width="100%" height={TRACK_HEIGHT} rx={3} fill="#111a2b" stroke="#1e2b42" />
            {/*
              * The in-view band (R32): how much of the AREA is visible at each
              * instant, behind the lane that says how well its worst cell is
              * served. Two rules make it safe to put here.
              *
              * It is drawn in the lane's OWN colour at low alpha, never a new
              * hue: green and red are outcomes, amber and blue are target
              * identity, and the heat map owns the per-cell ramp. A fifth
              * colour language on the one strip that carries the verdict would
              * cost more than the band is worth.
              *
              * And it stays a background — no curve, no axis, no figure. The
              * band answers "when is the zone seen", which is context; the
              * ticks and the outlined gap above it answer "is the commitment
              * met", which is the result. Anything that made the band legible
              * enough to read a number off would invite the sentence this
              * module exists to prevent: "we cover 80 % of the zone".
              */}
            {inViewProfile && inViewProfile.length > 0 && (
                <InViewBand profile={inViewProfile} color={color} />
            )}
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
                data-revisit-gap-outcome={longestGap.durationMs > laneRequirementMs ? 'misses' : 'meets'}
                strokeWidth={1.2} rx={2} />}
        </svg>
        );
    };

    /* Comparison state stays in the existing toolbar. A separate card for two
     * rows duplicated the lanes and made the eye alternate between two models. */
    const comparisonStatus = comparisonError
        ? (
            <span
                className="text-[11px] font-black uppercase tracking-wide text-red-300"
                title={comparisonError}
            >
                Comparison unavailable
            </span>
        )
        : comparisonIsComputing
            ? <span className="text-[11px] font-black uppercase tracking-wide text-sky-300">Computing…</span>
            : null;

    return (
        <section className={`${REVISIT_PANEL} revisit-coverage-ribbon overflow-hidden`} aria-label="Coverage timeline">
            <div>
                <div className="px-2 py-2 sm:px-4">
                    <div
                        className="grid grid-cols-1 gap-y-2 md:flex md:flex-wrap md:items-center md:gap-x-3 md:gap-y-1.5"
                        data-revisit-timeline-toolbar
                    >
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                            <div className={`${REVISIT_LABEL} shrink-0`}>
                                {targetRows.length === 0
                                    ? 'No target selected'
                                    : targetRows.length > 1 ? 'Observation schedule comparison' : 'Primary target access'}
                            </div>
                            {targetRows.length > 0 && (
                                <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-400">
                                    {requirementSummary}
                                </span>
                            )}
                            {isComparison && comparisonStatus}
                            {targetRows.some((row) => row.kind === 'AREA') && (
                                <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">
                                    Point lanes + Area worst-cell lane
                                </span>
                            )}
                            {/* The band needs one sentence, and the sentence has
                              * to say CELLS. The grid is regular in lat/lon and
                              * so is not equal-area — the same disclosure the
                              * recommendation panel already carries — and
                              * "% of the zone" would overstate it near the
                              * poles. "Context" is there to stop the band being
                              * quoted as a result. */}
                            {targetRows.some((row) => (row.inViewProfile?.length ?? 0) > 0) && (
                                <span
                                    className="hidden text-[11px] font-semibold text-slate-500 xl:inline"
                                    title="Shading behind an Area lane: the share of that area's grid cells in view at each instant. Context for the schedule — the requirement is judged on the least-covered cell alone."
                                >
                                    Shading · cells in view (context)
                                </span>
                            )}
                            {targetRows.length === 0 && (
                                <span className="hidden text-[11px] font-semibold text-slate-500 sm:inline">
                                    Add a primary target to create an access lane
                                </span>
                            )}
                            {targetRows.some((row) => row.longestGap !== null) && (
                                <span
                                    className="hidden items-center gap-1.5 text-[11px] font-semibold text-slate-500 xl:flex"
                                    title="The outlined span marks the longest interval without target access. Green is within the requirement, red is beyond it."
                                >
                                    {/* Both swatches appear when the lanes
                                      * disagree, so the legend names the colour
                                      * the reader is actually looking at. */}
                                    {hasMeetingLongestGap && (
                                        <span
                                            aria-hidden="true"
                                            className="h-2.5 w-5 rounded-sm border"
                                            style={{
                                                borderColor: REVISIT_COLORS.pass,
                                                background: `${REVISIT_COLORS.pass}26`,
                                            }}
                                        />
                                    )}
                                    {hasMissingLongestGap && (
                                        <span
                                            aria-hidden="true"
                                            className="h-2.5 w-5 rounded-sm border"
                                            style={{
                                                borderColor: REVISIT_COLORS.miss,
                                                background: `${REVISIT_COLORS.miss}26`,
                                            }}
                                        />
                                    )}
                                    Longest gap ·{' '}
                                    {hasMeetingLongestGap && hasMissingLongestGap
                                        ? 'green meets, red misses'
                                        : hasMissingLongestGap ? 'misses the requirement' : 'within the requirement'}
                                </span>
                            )}
                            {analysisContext === 'AREA' && areaAnalysis?.worstCell && (
                                <span className="text-[11px] font-bold tabular-nums text-sky-200">
                                    {areaAnalysis.worstCell.target.latDeg.toFixed(2)}° · {areaAnalysis.worstCell.target.lonDeg.toFixed(2)}°
                                </span>
                            )}
                        </div>
                        <div className="grid w-full min-w-0 grid-cols-3 items-stretch gap-1.5 md:ml-auto md:flex md:w-auto md:flex-wrap md:items-center md:justify-end" aria-label="Simulation time controls">
                            <button type="button" onClick={() => onSetSpeed(speed === 0 ? 1 : 0)}
                                aria-label={speed === 0 ? 'Play simulation' : 'Pause simulation'}
                                className="min-h-11 rounded border border-slate-600 px-2 text-[12px] font-black uppercase tracking-[0.08em] text-slate-200 hover:border-slate-300 md:min-h-8">
                                {speed === 0 ? 'Play' : 'Pause'}
                            </button>
                            {/* Hour stepping duplicates tap-to-seek on the timeline
                                below and costs a wrapped row a phone cannot spare
                                (mobile UX plan §4); play/pause and speed stay at
                                every width. */}
                            <button type="button" onClick={() => seekToHours(currentHours - 1)} aria-label="Step simulation back one hour"
                                className="hidden min-h-11 rounded border border-slate-700 px-2 text-[12px] font-bold text-slate-300 sm:block md:min-h-8">−1 h</button>
                            <button type="button" onClick={() => seekToHours(currentHours + 1)} aria-label="Step simulation forward one hour"
                                className="hidden min-h-11 rounded border border-slate-700 px-2 text-[12px] font-bold text-slate-300 sm:block md:min-h-8">+1 h</button>
                            <label className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded border border-slate-700 px-2 md:min-h-8 md:justify-start">
                                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">Speed</span>
                                <select aria-label="Simulation speed" value={speed === 0 ? 1 : speed}
                                    onChange={(event) => onSetSpeed(Number(event.target.value))}
                                    className="min-h-11 rounded bg-transparent text-[12px] font-bold text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 md:min-h-0">
                                    <option value={1}>1×</option><option value={10}>10×</option><option value={100}>100×</option>
                                </select>
                            </label>
                            {/* Duration remains visible beside the axis; the numerical
                                sampling step stays available in the settings popover. */}
                            {analysisWindow && onAnalysisWindowChange && (
                                <AnalysisWindowControl
                                    window={analysisWindow}
                                    onChange={onAnalysisWindowChange}
                                />
                            )}
                            <label className="col-span-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded border border-slate-600/70 px-2 md:min-h-8 md:w-auto">
                                <span className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">UTC</span>
                                <input
                                    type="datetime-local"
                                    step={1}
                                    min={utcDateTimeInputValue(windowStartMs)}
                                    max={utcDateTimeInputValue(windowEndMs)}
                                    value={utcDateTimeInputValue(timestampMs)}
                                    onChange={(event) => handleDateTimeChange(event.target.value)}
                                    aria-label="Simulation date and time UTC"
                                    className="min-h-9 min-w-0 flex-1 rounded bg-transparent text-[12px] font-bold tabular-nums text-slate-100 outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 [color-scheme:dark] md:min-h-0 md:flex-none"
                                />
                            </label>
                        </div>
                    </div>
                </div>

                <div className="px-2 sm:px-4">
                    <div
                        className="relative"
                        data-revisit-timeline
                        role={isComparison ? 'region' : undefined}
                        aria-label={isComparison ? 'Target comparison' : undefined}
                    >
                        <div className="space-y-1.5">
                            {targetRows.map((lane, index) => {
                                const maxGapMs = lane.statistics?.maxGapMs ?? null;
                                const laneRequirementMs = lane.requirementMs ?? requirementMs;
                                const meets = maxGapMs !== null && maxGapMs <= laneRequirementMs;
                                const waiting = Boolean(lane.statusLabel)
                                    || (index > 0 && !lane.statistics && comparisonIsComputing);
                                const resultText = lane.statusLabel
                                    ?? (lane.unbounded ? 'Never seen' : waiting ? '…' : formatGap(maxGapMs));
                                const verdict = lane.unbounded
                                    ? 'MISSES'
                                    : maxGapMs === null ? null : meets ? 'MEETS' : 'MISSES';
                                const isReference = lane.roleLabel === 'Primary';
                                const selectedTone = isReference
                                    ? 'border-y border-l-[3px] border-amber-300/60 bg-amber-400/12 shadow-[inset_0_0_14px_rgba(251,191,36,0.08)]'
                                    : 'border-y border-l-[3px] border-sky-300/60 bg-sky-400/12 shadow-[inset_0_0_14px_rgba(56,189,248,0.09)]';
                                return (
                                    <div
                                        key={lane.id}
                                        data-revisit-timeline-lane={lane.id}
                                        data-revisit-comparison-row={isComparison ? lane.id : undefined}
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
                                            lane.requirementMs ?? requirementMs,
                                            lane.selected || targetRows.length === 1,
                                            lane.inViewProfile,
                                        )}
                                        <button
                                            type="button"
                                            data-revisit-lane-result={lane.id}
                                            onClick={() => onSelectTarget?.(lane.id)}
                                            aria-label={`Select ${lane.roleLabel} result`}
                                            aria-pressed={lane.selected}
                                            title={`${lane.basisLabel} maximum gap · ${resultText}${verdict ? ` · ${verdict}` : ''}`}
                                            className="flex min-w-0 items-center justify-end gap-1.5 px-0.5 text-right text-[11px] tabular-nums"
                                        >
                                            <span className="sr-only">{lane.basisLabel} · Maximum gap </span>
                                            <span className="truncate font-bold text-slate-300">{resultText}</span>
                                            {verdict && (
                                                <span
                                                    data-revisit-lane-verdict
                                                    className={`shrink-0 font-black ${goalTextClass(maxGapMs, laneRequirementMs, lane.unbounded)}`}
                                                >
                                                    {verdict}
                                                </span>
                                            )}
                                        </button>
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
                                <div />
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-2 pb-2 sm:px-4 sm:pb-3">
                    <div className={`mt-1 grid gap-2 ${trackColumns}`}>
                        <div />
                        <div className="flex justify-between text-[11px] font-semibold tabular-nums text-slate-500">
                            {hourTicks.map((hour) => (
                                <span
                                    key={hour}
                                    className={hour !== 0 && hour !== windowHours ? 'hidden sm:inline' : ''}
                                >
                                    {String(hour).padStart(2, '0')}:00
                                </span>
                            ))}
                        </div>
                        <div />
                    </div>
                </div>
            </div>
        </section>
    );
};
