/**
 * CoverageRibbon — the temporal journey (UX §4.4).
 *
 * The most important transposition in the mode. In ENG and COMM the ribbon
 * narrates the *service path*; REVISIT has no spatial journey, so the same slot
 * carries the same "progression" semantics on a different axis: time.
 *
 *  - filled amber where the target is in view, empty during gaps
 *  - the longest gap outlined in red with a translucent fill, labelled
 *  - a thin white playhead bound to SimulationClock; click to seek
 *
 * This makes revisit tangible without a word of explanation, and it is the most
 * valuable thing on screen after the headline number.
 *
 * Hand-rolled SVG. No charting dependency (ADR-001, proposal §3.5).
 *
 * The playhead is driven by requestAnimationFrame reading `getTimeMs()`, NOT by
 * React state: clock progression deliberately emits no render, and a ribbon that
 * re-rendered the whole tree 60 times a second would reintroduce exactly the
 * 2 Hz amplification this module was isolated to avoid.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { formatGap } from '../analysis/gapStatistics';
import type { AccessInterval, GapStatistics } from '../domain/types';
import { computeGaps } from '../analysis/gapStatistics';
import { REVISIT_COLORS, REVISIT_LABEL, REVISIT_PANEL } from './revisitTheme';

interface CoverageRibbonProps {
    intervals: AccessInterval[];
    statistics: GapStatistics | null;
    windowStartMs: number;
    windowHours: number;
    getTimeMs: () => number;
    onSeek: (ms: number) => void;
}

const RIBBON_HEIGHT = 34;

export const CoverageRibbon: React.FC<CoverageRibbonProps> = ({
    intervals, statistics, windowStartMs, windowHours, getTimeMs, onSeek,
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const playheadRef = useRef<SVGLineElement | null>(null);
    const windowMs = windowHours * 3600_000;

    /** Fraction 0–1 of the window, clamped. */
    const fractionOf = (ms: number) => Math.max(0, Math.min(1, (ms - windowStartMs) / windowMs));

    const longestGap = useMemo(() => {
        if (!statistics || statistics.maxGapMs === null) return null;
        const gaps = computeGaps(intervals, {
            startMs: windowStartMs, durationHours: windowHours, stepSeconds: 1,
        });
        const interior = gaps.filter((g) => !g.truncatedAtStart && !g.truncatedAtEnd);
        if (interior.length === 0) return null;
        return interior.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
    }, [intervals, statistics, windowStartMs, windowHours]);

    // Playhead animation — outside React, for the reason in the header note.
    useEffect(() => {
        let frame = 0;
        const tick = () => {
            frame = requestAnimationFrame(tick);
            const line = playheadRef.current;
            if (!line) return;
            const x = fractionOf(getTimeMs()) * 100;
            line.setAttribute('x1', `${x}%`);
            line.setAttribute('x2', `${x}%`);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [getTimeMs, windowStartMs, windowMs]);

    const handleClick = (event: React.MouseEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const fraction = (event.clientX - rect.left) / rect.width;
        onSeek(windowStartMs + Math.max(0, Math.min(1, fraction)) * windowMs);
    };

    const hourTicks = useMemo(() => {
        // One tick every 6 h keeps the axis readable at 24 h and at 72 h.
        const stepHours = windowHours <= 24 ? 6 : 12;
        const ticks: number[] = [];
        for (let h = 0; h <= windowHours; h += stepHours) ticks.push(h);
        return ticks;
    }, [windowHours]);

    return (
        <div className={`${REVISIT_PANEL} px-4 py-3`}>
            <div className="mb-2 flex items-center justify-between">
                <span className={REVISIT_LABEL}>Coverage timeline</span>
                {longestGap && (
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-red-300">
                        Longest gap {formatGap(longestGap.durationMs)}
                    </span>
                )}
            </div>

            <svg
                ref={svgRef}
                className="w-full cursor-pointer"
                height={RIBBON_HEIGHT}
                onClick={handleClick}
                role="presentation"
            >
                {/* Empty track — the gaps. */}
                <rect x={0} y={0} width="100%" height={RIBBON_HEIGHT} rx={4}
                    fill="#111a2b" stroke="#1e2b42" />

                {/* Filled where the target is in view. */}
                {intervals.map((iv, i) => {
                    const x = fractionOf(iv.startMs) * 100;
                    const w = Math.max(
                        (Math.min(iv.endMs, windowStartMs + windowMs) - Math.max(iv.startMs, windowStartMs))
                        / windowMs * 100,
                        0.12, // never render a pass so short it becomes invisible
                    );
                    return (
                        <rect key={i} x={`${x}%`} y={0} width={`${w}%`} height={RIBBON_HEIGHT}
                            fill={REVISIT_COLORS.accent} opacity={0.92} />
                    );
                })}

                {/* The longest gap, outlined — the single most legible fact here. */}
                {longestGap && (
                    <rect
                        x={`${fractionOf(longestGap.startMs) * 100}%`}
                        y={1}
                        width={`${(longestGap.durationMs / windowMs) * 100}%`}
                        height={RIBBON_HEIGHT - 2}
                        fill={REVISIT_COLORS.alert}
                        fillOpacity={0.16}
                        stroke={REVISIT_COLORS.alert}
                        strokeWidth={1.5}
                        rx={3}
                    />
                )}

                <line ref={playheadRef} x1="0%" x2="0%" y1={0} y2={RIBBON_HEIGHT}
                    stroke="#ffffff" strokeWidth={1.5} />
            </svg>

            <div className="mt-1 flex justify-between text-[9px] font-semibold tabular-nums text-slate-500">
                {hourTicks.map((h) => <span key={h}>{String(h).padStart(2, '0')}:00</span>)}
            </div>
        </div>
    );
};
