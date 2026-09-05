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
import type { SatelliteAccess } from '../analysis/accessIntervals';
import type { AccessInterval } from '../domain/types';
import {
    RIBBON_MIN_SPAN_FRACTION, buildPassSpanIndex, passSpans,
    type PassSpan, type TimeSpan,
} from './passSpans';
import { SNAP_TOLERANCE_PX } from './coverageRibbonSnap';
import {
    describePassAt, formatLensScale, formatPassDuration, formatUtcRange, lensRange,
    snapTargetAt, summariseContributors, summarisePassAt,
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

/**
 * Satellite bands drawn under the emphasised lane.
 *
 * Four is past the physics — an hour of a Walker shell puts two or three
 * payloads over a point, not five — and it is a hard bound for the same reason
 * the tick pool is: nodes are allocated once, and a pool that could be outgrown
 * becomes an allocation per frame at the worst moment. Beyond it the sentence
 * says how many are not drawn.
 */
export const MAX_SUB_LANES = 4;
/** Ticks per band. One satellite crosses a point once or twice in an hour. */
const MAX_SUB_TICKS = 8;
const SUB_LANE_HEIGHT = 5;
/**
 * Below this drawn width the destination outline changes register.
 *
 * A 1.5 px stroke centred on the edges of a 3 px rect consumes the rect. Four
 * pixels is where the outline still reads as a border around a pass rather than
 * as a bar in its own right.
 */
const OUTLINE_MIN_TICK_PX = 4;
const SUB_LANE_GAP = 2;

/** A lane with nothing to decompose. Shared, so the empty case allocates
 *  nothing either — `?? []` in a per-frame path is still a per-frame array. */
const EMPTY_CONTRIBUTORS: readonly SatelliteAccess[] = [];

/**
 * One slot of the band pool.
 *
 * `spans` is the array `passSpans` returned, held by reference and replaced
 * each frame — never copied. `firstX` is cached because the bounded insertion
 * sort reads it once per comparison and `spans[0].x` is one dereference more.
 */
interface BandSlot {
    satelliteId: string;
    spans: PassSpan<TimeSpan>[];
    firstX: number;
}

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
    /**
     * The same access, per contributing satellite.
     *
     * Drawn as thin bands under the emphasised lane's track, on the SAME axis:
     * that is where a four-minute block resolves into two ninety-second passes
     * that overlap — a handover the union cannot show and the ribbon, at 1.1 px
     * a tick, could never have shown.
     */
    perSatellite?: SatelliteAccess[];
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
        /** Whether that outline was drawn in its thin treatment, so the stroke
         *  is rewritten when the SAME index comes to stand for another pass. */
        const outlinedThinRef = useRef<boolean[]>(Array(MAX_LENS_LANES).fill(false));
        /** Satellite bands: one pool per row, `MAX_SUB_LANES` bands of ticks. */
        const bandRefs = useRef<Array<Array<SVGGElement | null>>>(
            Array.from({ length: MAX_LENS_LANES }, () => []),
        );
        /** The four kept bands, reused across frames and across rows: only one
         *  row's worth is live at a time, and nothing outlives the call. */
        const bandScratch = useRef<BandSlot[]>(
            Array.from({ length: MAX_SUB_LANES }, () => (
                { satelliteId: '', spans: [], firstX: 0 }
            )),
        );
        /** The strip that holds them: its height is written per frame, so a row
         *  with nothing to decompose costs no vertical space at all. */
        const bandStripRefs = useRef<Array<SVGSVGElement | null>>([]);
        /** One density fill per band, for a satellite too busy to draw. */
        const bandDensityRefs = useRef<Array<Array<SVGRectElement | null>>>(
            Array.from({ length: MAX_LENS_LANES }, () => []),
        );
        const bandTickRefs = useRef<Array<Array<Array<SVGRectElement | null>>>>(
            Array.from({ length: MAX_LENS_LANES }, () => (
                Array.from({ length: MAX_SUB_LANES }, () => [])
            )),
        );
        const contributorRefs = useRef<Array<HTMLDivElement | null>>([]);
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
        // One index per contributing satellite, built with the lane's own and
        // never per frame. Contributor lists are short — a handful of satellites
        // ever cross a given point — so this is a few small typed arrays.
        const subIndexes = useMemo(
            () => lanes.map((lane) => (lane.perSatellite ?? []).map(
                (satellite) => buildPassSpanIndex(satellite.intervals),
            )),
            [lanes],
        );
        const subIndexesRef = useRef(subIndexes);
        subIndexesRef.current = subIndexes;
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
                /*
                 * The treatment is part of the state, not only the index.
                 *
                 * `spans` is rebuilt every frame from the visible hour, so the
                 * same index comes to stand for another pass as soon as one
                 * leaves the window: [P1,P2,P3] becomes [P2,P3,P4] and index 1
                 * is now a different, possibly much shorter pass. Keying the
                 * write on the index alone left the previous pass's stroke on
                 * it — a 1.5 px stroke swallowing the 1 px tick `OUTLINE_MIN_
                 * TICK_PX` exists to keep visible.
                 */
                const outlinedWidth = outlined >= 0
                    ? Math.max(spans[outlined].width * g.widthPx, 1)
                    : 0;
                const thin = outlinedWidth < OUTLINE_MIN_TICK_PX;
                if (outlinedRef.current[row] !== outlined
                    || outlinedThinRef.current[row] !== thin) {
                    const previous = ticks[outlinedRef.current[row]];
                    if (previous) {
                        previous.removeAttribute('stroke');
                        previous.removeAttribute('stroke-width');
                        previous.removeAttribute('rx');
                    }
                    const next = ticks[outlined];
                    if (next) {
                        /*
                         * A stroke is drawn CENTRED on the edge, so half of it
                         * falls inside the rect. On a pass reduced to the 1 px
                         * floor, 1.5 px of stroke leaves nothing of the tick:
                         * the mark stops naming a pass and becomes a smudge.
                         *
                         * Below that width the outline thins to 1 px and the
                         * corners round: the mark still reads as "this one"
                         * while the amber underneath stays visible. The rect is
                         * deliberately NOT widened — the floor already overstates
                         * a short pass on the ribbon, and the lens exists
                         * because that overstatement misleads.
                         */
                        if (thin) next.setAttribute('rx', '1.5');
                        next.setAttribute('stroke', '#e2e8f0');
                        next.setAttribute('stroke-width', thin ? '1' : '1.5');
                    }
                    outlinedRef.current[row] = outlined;
                    outlinedThinRef.current[row] = thin;
                }

                /*
                 * ── THE UNION, DECOMPOSED ───────────────────────────────────
                 *
                 * One band per satellite that actually saw the target in this
                 * hour, on the lane's OWN axis — same range, same centre line,
                 * same 12 s/px. That shared axis is the whole point: a block the
                 * lane draws as one becomes two overlapping bands, and the
                 * reader sees a handover instead of a long pass.
                 *
                 * Only under the emphasised lane. Two decompositions at once
                 * would ask which of four strips answers the question.
                 *
                 * No ids on the bands: a label would need horizontal room, and
                 * horizontal room is the axis. The sentence below names them, in
                 * the order the bands are stacked.
                 */
                const bands = bandRefs.current[row];
                const contributors = row === emphasised ? (lane.perSatellite ?? EMPTY_CONTRIBUTORS) : EMPTY_CONTRIBUTORS;
                /*
                 * The four kept bands go into a POOL, not a fresh array.
                 *
                 * Each contributor is offered to a bounded insertion sort by
                 * first x, so the pool always holds the earliest `MAX_SUB_LANES`
                 * in stacking order and `inViewCount` still counts every
                 * satellite seen in the hour — which is what "+N more" is about.
                 * The previous shape (push everything, sort, truncate) allocated
                 * an array and an object per contributor per pointer move.
                 */
                const inView = bandScratch.current;
                let kept = 0;
                let inViewCount = 0;
                /*
                 * Every contributor is examined, not the first four.
                 *
                 * `perSatellite` lists the satellites that saw the target
                 * anywhere in the WINDOW — ten of them over 72 h — while the
                 * bands are about this HOUR. Stopping the scan at the cap made
                 * "+N more" count satellites with no pass in view at all: the
                 * live panel read "P06_S16 · +9 more" under a single band. With
                 * an index a miss costs a binary search and returns nothing, so
                 * the full scan is cheap and the count is about what is drawn.
                 */
                for (let i = 0; i < contributors.length; i += 1) {
                    const satellite = contributors[i];
                    const spans = passSpans(
                        satellite.intervals, t0, t1, 1 / Math.max(1, g.widthPx),
                        subIndexesRef.current[row]?.[i],
                    );
                    if (spans.length === 0) continue;
                    inViewCount += 1;
                    // Stacked in the order they start, so "handover A → B"
                    // reads top to bottom.
                    const firstX = spans[0].x;
                    let slot = -1;
                    if (kept < MAX_SUB_LANES) {
                        slot = kept;
                        kept += 1;
                    } else if (firstX < inView[MAX_SUB_LANES - 1].firstX) {
                        slot = MAX_SUB_LANES - 1;
                    }
                    if (slot < 0) continue;
                    while (slot > 0 && inView[slot - 1].firstX > firstX) {
                        inView[slot].satelliteId = inView[slot - 1].satelliteId;
                        inView[slot].spans = inView[slot - 1].spans;
                        inView[slot].firstX = inView[slot - 1].firstX;
                        slot -= 1;
                    }
                    inView[slot].satelliteId = satellite.satelliteId;
                    inView[slot].spans = spans;
                    inView[slot].firstX = firstX;
                }
                const hiddenBands = Math.max(0, inViewCount - kept);

                /*
                 * The strip is only as tall as it has bands.
                 *
                 * A fixed four-band height was reserved on every row — an Area
                 * lane, a lane the engine has not decomposed, the row nobody is
                 * pointing at — and a comparison paid it twice: 56 px of empty
                 * strip out of the 126 px a 375 px phone gives the whole panel.
                 * One attribute per frame buys that back.
                 */
                const strip = bandStripRefs.current[row];
                if (strip) {
                    const stripHeight = kept * (SUB_LANE_HEIGHT + SUB_LANE_GAP);
                    strip.style.display = stripHeight > 0 ? '' : 'none';
                    if (stripHeight > 0) strip.setAttribute('height', `${stripHeight}`);
                }
                let denseBands = 0;
                for (let band = 0; band < MAX_SUB_LANES; band += 1) {
                    const node = bands[band];
                    if (!node) continue;
                    const entry = band < kept ? inView[band] : null;
                    if (!entry) {
                        node.style.display = 'none';
                        continue;
                    }
                    node.style.display = '';
                    node.setAttribute(
                        'transform', `translate(0, ${band * (SUB_LANE_HEIGHT + SUB_LANE_GAP)})`,
                    );
                    /*
                     * Same rule as the lane above: past the pool a band cannot
                     * draw its passes honestly, so it says so with the density
                     * fill instead of drawing eight of twenty and letting the
                     * gaps between them be read as gaps in coverage.
                     */
                    const bandDense = entry.spans.length > MAX_SUB_TICKS;
                    if (bandDense) denseBands += 1;
                    const bandDensity = bandDensityRefs.current[row][band];
                    if (bandDensity) {
                        bandDensity.style.display = bandDense ? '' : 'none';
                        if (bandDense) bandDensity.setAttribute('fill', lane.color);
                    }
                    const bandDrawn = bandDense ? 0 : entry.spans.length;
                    const rects = bandTickRefs.current[row][band];
                    for (let i = 0; i < MAX_SUB_TICKS; i += 1) {
                        const rect = rects[i];
                        if (!rect) continue;
                        const span = i < bandDrawn ? entry.spans[i] : undefined;
                        if (!span) {
                            rect.style.display = 'none';
                            continue;
                        }
                        rect.style.display = '';
                        rect.setAttribute('fill', lane.color);
                        rect.setAttribute('x', `${span.x * g.widthPx}`);
                        rect.setAttribute('width', `${Math.max(span.width * g.widthPx, 1)}`);
                    }
                }

                const contributorLine = contributorRefs.current[row];
                if (contributorLine) {
                    const text = summariseContributors(
                        inView, kept, hiddenBands, denseBands,
                    );
                    if (contributorLine.textContent !== text) contributorLine.textContent = text;
                    contributorLine.style.display = text ? '' : 'none';
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
                        <svg
                            ref={(node) => { bandStripRefs.current[row] = node; }}
                            data-revisit-lens-bands
                            width={widthPx}
                            height={SUB_LANE_HEIGHT + SUB_LANE_GAP}
                            className="mt-0.5 block"
                            style={{ display: 'none' }}
                        >
                            {Array.from({ length: MAX_SUB_LANES }, (_ignored, band) => (
                                <g
                                    key={band}
                                    ref={(node) => { bandRefs.current[row][band] = node; }}
                                    data-revisit-lens-band={band}
                                    style={{ display: 'none' }}
                                >
                                    <rect
                                        x={0} y={0} width={widthPx} height={SUB_LANE_HEIGHT}
                                        rx={2} fill="#111a2b" stroke="#1e2b42" strokeWidth={0.5}
                                    />
                                    <rect
                                        ref={(node) => { bandDensityRefs.current[row][band] = node; }}
                                        data-revisit-lens-band-density
                                        x={0} y={0} width={widthPx} height={SUB_LANE_HEIGHT}
                                        rx={2} opacity={0.35} style={{ display: 'none' }}
                                    />
                                    {Array.from({ length: MAX_SUB_TICKS }, (_unused, i) => (
                                        <rect
                                            key={i}
                                            ref={(node) => { bandTickRefs.current[row][band][i] = node; }}
                                            x={0} y={0} width={0} height={SUB_LANE_HEIGHT}
                                            opacity={0.85}
                                            style={{ display: 'none' }}
                                        />
                                    ))}
                                </g>
                            ))}
                        </svg>
                        <div
                            ref={(node) => { contributorRefs.current[row] = node; }}
                            data-revisit-lens-contributors
                            className="truncate text-[10px] leading-tight tabular-nums text-slate-400"
                            style={{ display: 'none' }}
                        />
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
