/**
 * CoverageLens — the coverage ribbon at an honest time scale.
 *
 * ── WHY IT EXISTS ───────────────────────────────────────────────────────────
 * On a 72 h ribbon a 90 s pass is half a pixel, so `passSpans` widens it to the
 * legibility floor — 5.2 min, roughly 3.5× the pass. The consequence is the
 * defect this component answers: the playhead LOOKS like it sits inside a pass
 * while the satellite is a thousand kilometres past the target, and there is no
 * surface anywhere in the module on which that can be checked.
 *
 * The lens re-projects the SAME intervals onto a one-hour span. At ~300 px that
 * is 12 s/px: the floor drops to a single pixel and stops distorting anything a
 * reader can see.
 *
 * ── TWO DECISIONS THAT ARE NOT NEGOTIABLE ───────────────────────────────────
 * 1. It magnifies the DATA, never the pixels. A `transform: scale()` over the
 *    ribbon's SVG would magnify rectangles that are already floored — the same
 *    falsehood, ten times larger. Everything here re-runs `passSpans` against
 *    the sub-range with `minWidth = 1 px`.
 * 2. Its extent is a TIME SPAN, not a zoom factor. The analysis window runs from
 *    24 h to `MAX_WINDOW_HOURS` = 240 h, so "×10" denotes a different thing in
 *    every scenario, while "±30 min around the pointer" denotes the same thing
 *    in all of them — and is what a viewer can be told.
 *
 * ── WHY IT IS IMPERATIVE ────────────────────────────────────────────────────
 * `update()` is called from the ribbon's existing rAF at pointer rate. React
 * state at that rate would re-render the ribbon and every lane on it, which is
 * exactly the cost `InViewBand`'s memo and the scene controller's structure /
 * geometry split exist to avoid. So: the node set is allocated once, `update()`
 * writes attributes into it, and this component never re-renders except when its
 * props genuinely change (a new analysis, a new colour).
 *
 * Placement and pointer plumbing belong to the host (P2); this file owns the
 * projection, the pool and the readings.
 */

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MAX_SECONDARY_TARGETS } from '../domain/analysisTargets';
import type { AccessInterval } from '../domain/types';
import { RIBBON_MIN_SPAN_FRACTION, buildPassSpanIndex, passSpans } from './passSpans';
import { SNAP_TOLERANCE_PX } from './coverageRibbonSnap';
import {
    describePassAt, formatLensScale, formatPassDuration, formatUtcRange, lensRange,
    snapTargetAt, summarisePassAt,
} from './lensReadings';

/** ±30 min. See decision 2 above. */
export const DEFAULT_LENS_SPAN_MS = 3600_000;
export const DEFAULT_LENS_WIDTH_PX = 300;
const LENS_TRACK_HEIGHT = 22;
/** Breathing room kept between the panel and the screen edges. */
const VIEWPORT_MARGIN_PX = 8;

/**
 * Ceiling on the tick pool.
 *
 * A one-hour span holds 2–4 passes for any constellation this module models, so
 * 64 is far beyond the physics. It is a HARD bound rather than a generous one:
 * the pool is what keeps `update()` allocation-free, and a pool that could be
 * outgrown would silently become an allocation per frame at the worst moment.
 * Beyond it the lens says the span is too dense instead of drawing a lie.
 */
export const MAX_LENS_TICKS = 64;

/**
 * How many lanes the panel can stack.
 *
 * Bounded by the timeline itself — one primary plus `MAX_SECONDARY_TARGETS` —
 * so this is a fact about the module, not a budget: the comparison is a single
 * slot today, which is what makes showing every lane at once affordable.
 */
export const MAX_LENS_LANES = MAX_SECONDARY_TARGETS + 1;

export interface CoverageLensHandle {
    /**
     * Show the lens centred on `hoverMs`, or hide it when passed `null`.
     *
     * `clientX` places the panel horizontally and `laneIndex` picks the lane to
     * read — the one under the pointer, not the selected one. Three scalars
     * rather than an options object, deliberately: this runs once per frame and
     * must not allocate. Everything else about the placement comes from
     * `anchorRef`,
     * which the host measures on enter and on resize — never here, and never
     * per frame.
     */
    update(hoverMs: number | null, clientX?: number, laneIndex?: number): void;
}

/**
 * Where the host wants the panel, in viewport coordinates.
 *
 * `anchorTop` is the edge the lens sits ABOVE — the timeline card's top, not
 * the track's. The track lives at the bottom of a card whose own `overflow:
 * hidden` clips anything drawn above it, and the row immediately over the track
 * carries the transport controls: a panel placed by the track either disappears
 * or covers pause. So the host names the edge, and the lens obeys.
 */
export interface CoverageLensAnchor {
    /** Left edge of the track box. */
    left: number;
    /** Width of the track box; the panel is clamped inside it. */
    width: number;
    /** Viewport y the panel's bottom edge must stay above. */
    anchorTop: number;
}

/** One timeline lane, as the lens needs to read it. */
export interface CoverageLensLane {
    id: string;
    /** The bare target name — the lens says WHICH lane it is reading. */
    name: string;
    /** The lane's access intervals — the ribbon's own array, not a copy. */
    intervals: AccessInterval[];
    /** The lane's identity colour. */
    color: string;
    /** "Least-covered cell" for an Area lane, so its reading cannot be taken
     *  for the whole zone. Omitted for a point. */
    basisLabel?: string;
    /**
     * Why this lane has no result yet — "Computing…", "Define polygon".
     *
     * Without it an unfinished lane arrives here as an empty interval list and
     * the panel reads "No pass in view": an assertion that the target is never
     * seen, made about an analysis that has not run. The ribbon's own result
     * cell says "Computing…" two centimetres away.
     */
    statusLabel?: string | null;
}

export interface CoverageLensProps {
    /**
     * EVERY lane, not the one to show.
     *
     * Which lane the lens reads follows the POINTER, and the pointer moves far
     * faster than this component may re-render. Passing the hovered lane as a
     * prop would make crossing a lane boundary a React render of the ribbon at
     * pointer time — the exact cost this whole design avoids. So the lanes are
     * a stable array and `update()` names one by index.
     */
    lanes: CoverageLensLane[];
    windowStartMs: number;
    windowMs: number;
    /** Visible extent, ms. Defaults to one hour. */
    spanMs?: number;
    /** Rendered width, px. The lens's resolution is `spanMs / widthPx`. */
    widthPx?: number;
    /**
     * Live placement, read inside `update()`. A ref rather than a prop value so
     * the host can re-measure without re-rendering the lens.
     */
    anchorRef?: React.RefObject<CoverageLensAnchor>;
    /**
     * The scenario clock, so the panel can show WHERE THE GLOBE IS.
     *
     * The lens describes the instant under the POINTER; the globe shows the
     * instant at the PLAYHEAD. They are different instants, and until this
     * marker existed nothing said so — a reader saw "In view · 1 min 52 s" on
     * one row and no satellite over that target on the globe, and had no way to
     * know the sentence was about a moment they had not travelled to.
     */
    getTimeMs?: () => number;
}

const CoverageLensImpl = React.forwardRef<CoverageLensHandle, CoverageLensProps>(
    function CoverageLens({
        lanes, windowStartMs, windowMs,
        spanMs = DEFAULT_LENS_SPAN_MS,
        widthPx = DEFAULT_LENS_WIDTH_PX,
        anchorRef,
        getTimeMs,
    }, ref) {
        const rootRef = useRef<HTMLDivElement | null>(null);
        const rangeRef = useRef<HTMLDivElement | null>(null);
        /** One entry per stacked lane row. Allocated once, never re-created. */
        const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
        const tickRefs = useRef<Array<Array<SVGRectElement | null>>>(
            Array.from({ length: MAX_LENS_LANES }, () => []),
        );
        const densityRefs = useRef<Array<SVGRectElement | null>>([]);
        const clockRefs = useRef<Array<SVGLineElement | null>>([]);
        /** Index of the tick currently outlined as the click's destination,
         *  per row, so exactly two attribute writes are needed to move it. */
        const outlinedRef = useRef<number[]>(Array(MAX_LENS_LANES).fill(-1));
        const readoutRefs = useRef<Array<HTMLDivElement | null>>([]);
        const labelRefs = useRef<Array<HTMLDivElement | null>>([]);
        /** Ticks written on the previous pass, per row: the hide loop only has
         *  to walk as far as the longer of then and now, not the whole pool. */
        const drawnCountRef = useRef<number[]>(Array(MAX_LENS_LANES).fill(0));
        /** Last instant drawn, so a prop change can redraw without the pointer. */
        const lastHoverRef = useRef<number | null>(null);
        /** Last lane drawn, so a prop change redraws the same one. */
        const lastLaneRef = useRef(0);
        /** Last x drawn, so the same redraw keeps the panel where it was. */
        const lastClientXRef = useRef(0);
        /**
         * The lane array whose identity (name, colour) is currently painted.
         *
         * Repainting names and 64 fills per row is cheap once and wasteful sixty
         * times a second, so it happens only when the analysis hands over a new
         * array. `null` forces the next draw to repaint.
         */
        const paintedLanesRef = useRef<CoverageLensLane[] | null>(null);
        /** Row currently emphasised, so the opacity is written only on a change. */
        const emphasisedRef = useRef(-1);

        // One index per lane, rebuilt only when the analysis hands over new
        // arrays — never per frame.
        const indexes = useMemo(
            () => lanes.map((lane) => buildPassSpanIndex(lane.intervals)), [lanes],
        );
        const indexesRef = useRef(indexes);
        indexesRef.current = indexes;
        /*
         * Every input `draw` needs, behind ONE ref written on each render.
         * `draw` itself must never change identity: it is handed out through the
         * imperative handle and called from the host's frame loop, so a new
         * closure per render would either go stale or force the host to
         * re-subscribe. Reading live values through this ref is what lets it
         * stay stable and current at the same time.
         */
        const geometry = useRef({
            lanes, windowStartMs, windowMs, spanMs, widthPx, anchorRef, getTimeMs,
        });
        geometry.current = {
            lanes, windowStartMs, windowMs, spanMs, widthPx, anchorRef, getTimeMs,
        };

        const draw = useCallback((
            hoverMs: number | null, clientX = 0, laneIndex = 0,
        ): void => {
            const root = rootRef.current;
            if (!root) return;
            lastHoverRef.current = hoverMs;
            lastLaneRef.current = laneIndex;
            lastClientXRef.current = clientX;
            if (hoverMs === null || geometry.current.lanes.length === 0) {
                root.hidden = true;
                // Dropped on hide, never left standing: a permanent
                // `will-change` keeps a compositing layer alive for a panel
                // that is visible only while a pointer is on the track.
                root.style.willChange = '';
                return;
            }
            const g = geometry.current;
            const laneCount = Math.min(g.lanes.length, MAX_LENS_LANES);
            const emphasised = Math.max(0, Math.min(laneCount - 1, laneIndex));
            const { t0, t1 } = lensRange(hoverMs, g.windowStartMs, g.windowMs, g.spanMs);
            const range = t1 - t0;
            const anchorWidth = g.anchorRef?.current?.width ?? 0;
            const snapFloorMs = RIBBON_MIN_SPAN_FRACTION * g.windowMs;
            const snapToleranceMs = anchorWidth > 0
                ? (SNAP_TOLERANCE_PX / anchorWidth) * g.windowMs
                : 0;
            /*
             * Identity — names and fills — is repainted only when the analysis
             * hands over a new lane array, never per frame.
             */
            const identityDirty = paintedLanesRef.current !== g.lanes;
            paintedLanesRef.current = g.lanes;

            /*
             * ── EVERY LANE, ON ONE AXIS ─────────────────────────────────────
             *
             * The comparison exists to be compared, and at the ribbon's scale it
             * cannot be: a tick is 1.1 px, so "are the two targets seen at the
             * same time or in turn" is unreadable there. Stacked on the SAME
             * range, the same centre line and the same 12 s/px, it is one look.
             *
             * The pointer still chooses one row — but only to emphasise it and
             * to own the sentence and the click. Reading is no longer a choice.
             */
            for (let row = 0; row < MAX_LENS_LANES; row += 1) {
                const rowNode = rowRefs.current[row];
                if (!rowNode) continue;
                if (row >= laneCount) {
                    // A single-lane timeline shows a single-lane panel, exactly
                    // as it did before the second row existed.
                    rowNode.hidden = true;
                    /*
                     * The count is NOT reset. It records what this row's DOM
                     * still holds, not what is visible: zeroing it here left
                     * ticks from a removed target displayed, and the
                     * `max(then, now)` loop below never came back for them —
                     * they reappeared as phantom passes when the row returned.
                     */
                    continue;
                }
                rowNode.hidden = false;
                const lane = g.lanes[row];
                const ticks = tickRefs.current[row];

                if (identityDirty) {
                    const label = labelRefs.current[row];
                    if (label) {
                        label.textContent = lane.basisLabel
                            ? `${lane.name} · ${lane.basisLabel}`
                            : lane.name;
                        label.style.color = lane.color;
                    }
                    for (let i = 0; i < MAX_LENS_TICKS; i += 1) {
                        ticks[i]?.setAttribute('fill', lane.color);
                    }
                    densityRefs.current[row]?.setAttribute('fill', lane.color);
                }

                const spans = passSpans(
                    lane.intervals, t0, t1, 1 / Math.max(1, g.widthPx),
                    indexesRef.current[row],
                );
                // Too dense to draw honestly: say so rather than drawing 64 of N.
                const dense = spans.length > MAX_LENS_TICKS;
                const density = densityRefs.current[row];
                if (density) density.style.display = dense ? '' : 'none';
                const drawn = dense ? 0 : spans.length;
                // Only as far as the longer of then and now: hiding a pool that
                // is mostly already hidden is work nobody asked for.
                const touched = Math.max(drawn, drawnCountRef.current[row]);
                for (let i = 0; i < touched; i += 1) {
                    const rect = ticks[i];
                    if (!rect) continue;
                    if (i >= drawn) {
                        rect.style.display = 'none';
                        continue;
                    }
                    const span = spans[i];
                    rect.style.display = '';
                    rect.setAttribute('x', `${span.x * g.widthPx}`);
                    rect.setAttribute('width', `${Math.max(span.width * g.widthPx, 1)}`);
                }
                drawnCountRef.current[row] = drawn;

                /*
                 * ── WHERE THE CLICK WOULD LAND ──────────────────────────────
                 *
                 * The destination is not a new mark: it is an outline on the
                 * tick the click goes to. A third glyph on a 22 px track would
                 * have to be told apart from the ticks and from the two lines
                 * that already mean two instants; an outline binds to the pass
                 * itself and cannot be read as anything else.
                 *
                 * Only on the emphasised row, because only that row is clicked,
                 * and only when a snap is on offer — the same `snapTargetAt`
                 * the sentence uses, so the words and the mark cannot point at
                 * different passes.
                 */
                const target = row === emphasised && !dense
                    ? snapTargetAt(
                        lane.intervals, hoverMs, snapFloorMs, snapToleranceMs,
                        indexesRef.current[row],
                    )
                    : null;
                let outlined = -1;
                if (target) {
                    for (let i = 0; i < drawn; i += 1) {
                        if (spans[i].interval === target) { outlined = i; break; }
                    }
                }
                if (outlinedRef.current[row] !== outlined) {
                    const previous = ticks[outlinedRef.current[row]];
                    if (previous) {
                        previous.removeAttribute('stroke');
                        previous.removeAttribute('stroke-width');
                    }
                    const next = ticks[outlined];
                    if (next) {
                        next.setAttribute('stroke', '#e2e8f0');
                        next.setAttribute('stroke-width', '1.5');
                    }
                    outlinedRef.current[row] = outlined;
                }

                const readout = readoutRefs.current[row];
                if (readout) {
                    const text = dense
                        ? `${spans.length} passes in view — span too dense to resolve`
                        // A lane still being computed states that, and nothing
                        // else: "No pass" would be a result it does not have.
                        : lane.statusLabel
                            ? `${lane.statusLabel} · no result yet`
                            // The emphasised row carries the full sentence and
                            // the offer, because it is the row a click acts on.
                            // The other is context: enough to compare, not
                            // enough to be mistaken for the subject.
                            : row === emphasised
                                ? describePassAt(
                                    lane.intervals, hoverMs, snapFloorMs, snapToleranceMs,
                                    indexesRef.current[row],
                                )
                                : summarisePassAt(
                                    lane.intervals, hoverMs, indexesRef.current[row],
                                );
                    if (readout.textContent !== text) readout.textContent = text;
                }
            }

            /*
             * The playhead, when it falls inside the visible hour.
             *
             * Two markers, two meanings: the solid centre line is where the
             * POINTER is — what every sentence in this panel describes — and
             * this dashed one is where the GLOBE is. When they coincide the
             * reading describes what is on screen; when they do not, the
             * distance between them is the answer to "why is no satellite over
             * that target?".
             */
            const nowMs = g.getTimeMs?.();
            const clockX = nowMs !== undefined && nowMs >= t0 && nowMs <= t1
                ? ((nowMs - t0) / range) * g.widthPx
                : null;
            for (let row = 0; row < MAX_LENS_LANES; row += 1) {
                const clock = clockRefs.current[row];
                if (!clock) continue;
                if (clockX === null) {
                    clock.style.display = 'none';
                    continue;
                }
                clock.style.display = '';
                clock.setAttribute('x1', `${clockX}`);
                clock.setAttribute('x2', `${clockX}`);
            }

            if (emphasisedRef.current !== emphasised) {
                emphasisedRef.current = emphasised;
                for (let row = 0; row < MAX_LENS_LANES; row += 1) {
                    const rowNode = rowRefs.current[row];
                    if (!rowNode) continue;
                    const isEmphasised = row === emphasised;
                    rowNode.style.opacity = isEmphasised ? '1' : '0.55';
                    // Stated, not only shaded: which row owns the sentence and
                    // the click is a fact, and opacity is a rendering of it.
                    rowNode.setAttribute('data-revisit-lens-emphasis', String(isEmphasised));
                }
            }

            if (rangeRef.current) {
                const text = `${formatUtcRange(t0, t1, g.windowMs)} · `
                    + `${formatPassDuration(range)} · ${formatLensScale(range, g.widthPx)}`;
                if (rangeRef.current.textContent !== text) rangeRef.current.textContent = text;
            }
            const anchor = g.anchorRef?.current;
            if (anchor && anchor.width > 0) {
                /*
                 * Fixed to the viewport, and bottom-anchored so no height has to
                 * be measured: the panel's own box is never read back, which is
                 * what keeps this function free of layout reads.
                 */
                /*
                 * Clamped to the track, then to the viewport — in that order.
                 *
                 * On a phone the track column is ~120 px wide, narrower than
                 * the panel itself, so "inside the track" has no solution. The
                 * panel is then pinned to the track's centre and stops
                 * following the finger, rather than being pushed off screen by
                 * a clamp with an empty range. The viewport always has the last
                 * word: a panel outside it is not a panel.
                 */
                const viewportMin = VIEWPORT_MARGIN_PX;
                const viewportMax = Math.max(
                    viewportMin, window.innerWidth - g.widthPx - VIEWPORT_MARGIN_PX,
                );
                let lo = anchor.left;
                let hi = anchor.left + anchor.width - g.widthPx;
                if (hi < lo) lo = hi = anchor.left + (anchor.width - g.widthPx) / 2;
                lo = Math.max(viewportMin, Math.min(viewportMax, lo));
                hi = Math.max(lo, Math.max(viewportMin, Math.min(viewportMax, hi)));
                const left = Math.max(lo, Math.min(hi, clientX - g.widthPx / 2));
                root.style.left = `${Math.round(left)}px`;
                root.style.bottom = `${Math.round(window.innerHeight - anchor.anchorTop + 8)}px`;
            }
            if (root.hidden) {
                root.style.willChange = 'transform';
                root.hidden = false;
            }
        }, []);

        useImperativeHandle(ref, (): CoverageLensHandle => ({ update: draw }), [draw]);

        // A new analysis while the lens is open must not leave last question's
        // ticks on screen under the new heading — the same rule the analysis
        // hook applies to a retained result whose subject changed.
        useEffect(() => {
            // A new analysis can change a lane's colour, name or intervals, so
            // the identity must be repainted, not only the geometry.
            paintedLanesRef.current = null;
            emphasisedRef.current = -1;
            if (rootRef.current && !rootRef.current.hidden) {
                draw(lastHoverRef.current, lastClientXRef.current, lastLaneRef.current);
            }
            // `draw` reads everything through refs; re-running on the inputs is
            // the point, and adding it to the deps would defeat that.
        }, [draw, lanes, windowStartMs, windowMs, spanMs, widthPx]);

        /*
         * ── WHY A PORTAL ────────────────────────────────────────────────────
         * Rendered in place, the panel loses twice: the timeline card clips its
         * own overflow, and the stage the card sits in paints BELOW the Cesium
         * canvas' full-viewport container — measured on 2026-09-05, when a
         * correctly positioned, correctly sized,un-hidden panel was simply not
         * on screen. `position: fixed` fixes the first problem and not the
         * second; only leaving the subtree fixes both.
         *
         * The panel carries no interaction of its own (`pointer-events-none`),
         * so nothing is lost by moving it out of the tree.
         */
        return createPortal(
            <div
                ref={rootRef}
                hidden
                data-revisit-lens
                /*
                 * Derived, pointer-only surface: the seek slider beside it
                 * carries the accessible name, value and keyboard control. The
                 * pinned variant (P3), which IS reachable without a pointer,
                 * must give this a text alternative rather than inherit this.
                 */
                aria-hidden="true"
                /*
                 * FIXED, not absolute. The track sits inside a card with
                 * `overflow: hidden`; an absolutely positioned panel tall enough
                 * to clear the transport row above the track is clipped away
                 * entirely by that card. Measured in the browser on 2026-09-05,
                 * not deduced.
                 */
                className="pointer-events-none fixed z-40 rounded border border-slate-600 bg-[#0b1220]/95 p-2 shadow-lg shadow-black/40"
                style={{ width: widthPx }}
            >
                {/*
                  * The header carries what the rows SHARE — the range, the span
                  * and the scale. Identity moved onto each row when the panel
                  * started stacking them: a single header name could only ever
                  * describe one of two lanes, and it was being truncated to
                  * "SIN…" by this very line.
                  */}
                <div ref={rangeRef} data-revisit-lens-range className="mb-1 truncate text-[10px] leading-tight tabular-nums text-slate-400" />
                {Array.from({ length: MAX_LENS_LANES }, (_unused, row) => (
                    <div
                        key={row}
                        ref={(node) => { rowRefs.current[row] = node; }}
                        data-revisit-lens-row={row}
                        hidden
                        className="mt-1 leading-tight first:mt-0"
                    >
                        <div
                            ref={(node) => { labelRefs.current[row] = node; }}
                            data-revisit-lens-label
                            className="truncate text-[10px] font-black uppercase tracking-wide"
                        />
                        <svg width={widthPx} height={LENS_TRACK_HEIGHT} className="block">
                            <rect width={widthPx} height={LENS_TRACK_HEIGHT} rx={3} fill="#111a2b" stroke="#1e2b42" />
                            <rect
                                ref={(node) => { densityRefs.current[row] = node; }}
                                data-revisit-lens-density
                                x={0} y={0} width={widthPx} height={LENS_TRACK_HEIGHT}
                                opacity={0.35} style={{ display: 'none' }}
                            />
                            <g data-revisit-lens-ticks={MAX_LENS_TICKS}>
                                {Array.from({ length: MAX_LENS_TICKS }, (_ignored, i) => (
                                    <rect
                                        key={i}
                                        ref={(node) => { tickRefs.current[row][i] = node; }}
                                        x={0} y={0} width={0} height={LENS_TRACK_HEIGHT}
                                        opacity={0.94}
                                        style={{ display: 'none' }}
                                        data-revisit-lens-tick={i}
                                    />
                                ))}
                            </g>
                            {/* Where the globe is. Dashed, because it is not
                                what this panel's sentences describe. */}
                            <line
                                ref={(node) => { clockRefs.current[row] = node; }}
                                data-revisit-lens-clock
                                x1={0} x2={0} y1={0} y2={LENS_TRACK_HEIGHT}
                                stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="3 2"
                                opacity={0.9} style={{ display: 'none' }}
                            />
                            {/* The hovered instant, on every row: one axis is
                                what makes two lanes comparable at a glance. */}
                            <line
                                x1={widthPx / 2} x2={widthPx / 2} y1={0} y2={LENS_TRACK_HEIGHT}
                                stroke="#fff" strokeWidth={1} opacity={0.85}
                            />

                        </svg>
                        <div
                            ref={(node) => { readoutRefs.current[row] = node; }}
                            data-revisit-lens-readout
                            className="mt-0.5 text-[10px] leading-tight tabular-nums text-slate-300"
                        />
                    </div>
                ))}
            </div>,
            document.body,
        );
    }
);

/**
 * Memoised on purpose: the host re-renders for reasons the lens does not share
 * — a clock read, a landing comparison, a selection — and the lens must skip all
 * of them. Its own updates arrive through the imperative handle.
 */
export const CoverageLens = React.memo(CoverageLensImpl);
