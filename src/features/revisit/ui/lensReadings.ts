/**
 * lensReadings.ts — what the temporal lens says, as pure functions.
 *
 * Split from `CoverageLens.tsx` so the component file exports only components
 * (fast refresh), and because these are the parts worth testing without a DOM:
 * the range arithmetic, the two formats, and the sentence that turns a hovered
 * instant into "the cursor is two minutes early".
 */

import type { AccessInterval } from '../domain/types';
import {
    drawnPassNear, emptyNeighbourhood, passNeighbourhood,
    type PassSpanIndex, type TimeSpan,
} from './passSpans';

/**
 * Duration for a reader at this scale — seconds included.
 *
 * Deliberately NOT `formatGap`, which rounds to the minute: it reports a 90 s
 * pass as "2 min", destroying the one quantity the lens exists to show. The gap
 * vocabulary is right for gaps, which are hours; this one is for passes, which
 * are seconds.
 */
export function formatPassDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (minutes > 0) return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
    return `${seconds} s`;
}

/** UTC wall clock to the second. The module defines every displayed time as UTC. */
export function formatUtcClock(ms: number): string {
    return new Date(ms).toISOString().slice(11, 19);
}

/**
 * The date, when a wall clock alone would be ambiguous.
 *
 * The analysis window runs up to 240 h, so a time of day identifies as many as
 * ten different instants in it. Found by a test that moved the pointer 48 h and
 * read back a range label identical to the first, character for character —
 * which is exactly how a reader would be misled. Below 24 h the date is noise
 * and is left out.
 */
export function formatUtcDay(ms: number, windowMs: number): string {
    if (windowMs <= 24 * 3600_000) return '';
    return `${new Date(ms).toISOString().slice(5, 10)} `;
}

/**
 * A range as "09-05 23:45:00 → 09-06 00:45:00", dating the end only when it
 * falls on another day.
 *
 * Dating the start alone was the same trap one step further in: a span crossing
 * midnight printed "09-05 23:45:00 → 00:45:00" and quietly attributed both
 * instants to the 5th. The end carries its date exactly when it differs, so the
 * label grows by six characters in the one case that needs them.
 */
export function formatUtcRange(t0: number, t1: number, windowMs: number): string {
    const startDay = formatUtcDay(t0, windowMs);
    /*
     * The day is compared by arithmetic, not by formatting both ends: this runs
     * once per pointer move, and `toISOString` is the most expensive thing in
     * the sentence. The common range stays at the three calls it always cost;
     * only a span crossing midnight pays for a fourth.
     */
    const sameDay = Math.floor(t0 / 86_400_000) === Math.floor(t1 / 86_400_000);
    const endDay = startDay && !sameDay ? formatUtcDay(t1, windowMs) : '';
    return `${startDay}${formatUtcClock(t0)} → ${endDay}${formatUtcClock(t1)}`;
}

/** "12 s/px" — the lens's own resolution, stated so a magnified block cannot be
 * mistaken for a long one. */
export function formatLensScale(spanMs: number, widthPx: number): string {
    const perPx = spanMs / Math.max(1, widthPx) / 1000;
    if (perPx >= 60) return `${(perPx / 60).toFixed(1)} min/px`;
    if (perPx >= 10) return `${Math.round(perPx)} s/px`;
    return `${perPx.toFixed(1)} s/px`;
}

/**
 * The sub-range the lens shows for a hovered instant.
 *
 * The span is CONSTANT: near a window edge the range slides inward instead of
 * shrinking, so the scale printed on the lens stays true and the reader is never
 * shown two different resolutions without being told. A window shorter than the
 * span collapses to the window itself.
 */
export function lensRange(
    hoverMs: number, windowStartMs: number, windowMs: number, spanMs: number,
): { t0: number; t1: number } {
    const windowEndMs = windowStartMs + windowMs;
    if (spanMs >= windowMs) return { t0: windowStartMs, t1: windowEndMs };
    const half = spanMs / 2;
    const centre = Math.max(windowStartMs + half, Math.min(windowEndMs - half, hoverMs));
    return { t0: centre - half, t1: centre + half };
}

interface Readings {
    /** The pass under the pointer, when there is one. */
    current: AccessInterval | null;
    /** Nearest pass starting after the pointer. May be outside the lens span:
     *  "next in 2 h 34 min" is a useful answer even when nothing is drawn. */
    next: AccessInterval | null;
}

/** `readAt`'s own scratch — never the one `drawnPassNear` writes into. */
const readScratch = emptyNeighbourhood();
const readings: Readings = { current: null, next: null };

function readAt(
    intervals: AccessInterval[], hoverMs: number, index?: PassSpanIndex,
): Readings {
    const { current, next } = passNeighbourhood(intervals, hoverMs, index, readScratch);
    readings.current = current >= 0 ? intervals[current] : null;
    readings.next = next >= 0 ? intervals[next] : null;
    return readings;
}


/**
 * The sentence under the ticks.
 *
 * Inside a pass it states the measured dwell and its true AOS/LOS — the numbers
 * the ribbon cannot carry. Outside one it states the distance to the next pass,
 * which is the reading that resolves the original confusion: "the cursor is two
 * minutes early", not "the globe disagrees with the timeline".
 *
 * The middle case is the whole point. When `snapFloorMs` is given and the
 * pointer sits inside a tick the ribbon DREW but outside the pass it stands
 * for, the sentence names the discrepancy. That band — up to the floor's width
 * — is precisely where the timeline misleads. The click on offer is not
 * spelled out in words: it is the outlined tick in the panel, which shows WHERE
 * the click lands instead of only asserting that one exists.
 */
/**
 * The pass a click would seek to, or null when the click is a plain seek.
 *
 * One rule, two consumers: the sentence that OFFERS the snap and the marker that
 * SHOWS where it lands. They were always going to be written twice otherwise,
 * and an offer that points somewhere other than where the click goes is the
 * failure this module has already had once, over the tolerance.
 *
 * Never while the pointer is inside a pass: there is nothing to seek to then —
 * the reading already describes what is happening now.
 */
export function snapTargetAt(
    intervals: AccessInterval[], hoverMs: number,
    snapFloorMs: number, snapToleranceMs: number, index?: PassSpanIndex,
): AccessInterval | null {
    if (!(snapFloorMs > 0)) return null;
    if (readAt(intervals, hoverMs, index).current) return null;
    return drawnPassNear(intervals, hoverMs, snapFloorMs, snapToleranceMs, index);
}

export function describePassAt(
    intervals: AccessInterval[], hoverMs: number,
    snapFloorMs = 0, snapToleranceMs = 0, index?: PassSpanIndex,
): string {
    const { current, next } = readAt(intervals, hoverMs, index);
    if (current) {
        return `In view · ${formatPassDuration(current.endMs - current.startMs)}`
            + ` · AOS ${formatUtcClock(current.startMs)} → LOS ${formatUtcClock(current.endMs)}`;
    }
    const drawn = snapTargetAt(intervals, hoverMs, snapFloorMs, snapToleranceMs, index);
    if (drawn) {
        const length = `${formatPassDuration(drawn.endMs - drawn.startMs)} long`;
        const drawnEnd = drawn.startMs
            + Math.max(drawn.endMs - drawn.startMs, snapFloorMs);
        // Inside the tick the ribbon drew, but outside the pass it stands for:
        // the exact situation that made the globe look wrong. Name it.
        if (hoverMs >= drawn.startMs && hoverMs < drawnEnd) {
            return `Tick drawn here · the pass ended ${
                formatPassDuration(hoverMs - drawn.endMs)} ago`
                + ` · ${length}`;
        }
        const relation = hoverMs < drawn.startMs
            ? `starts in ${formatPassDuration(drawn.startMs - hoverMs)}`
            : `ended ${formatPassDuration(hoverMs - drawn.endMs)} ago`;
        return `Nearest pass ${relation} · ${length}`;
    }
    if (next) {
        return `No pass · next in ${formatPassDuration(next.startMs - hoverMs)}`
            + ` at ${formatUtcClock(next.startMs)}`;
    }
    return 'No pass in view';
}

/**
 * The same reading, short enough to sit under a lane nobody is pointing at.
 *
 * The stacked panel shows every lane; only the emphasised one owns the sentence
 * and the click. The others need exactly enough to answer "and this target?" —
 * in view, or how far the next pass is — and no more, or the panel starts
 * arguing with itself about which row is the subject.
 */
export function summarisePassAt(
    intervals: AccessInterval[], hoverMs: number, index?: PassSpanIndex,
): string {
    const { current, next } = readAt(intervals, hoverMs, index);
    if (current) return `In view · ${formatPassDuration(current.endMs - current.startMs)}`;
    if (next) return `Next in ${formatPassDuration(next.startMs - hoverMs)}`;
    return 'No pass in view';
}

/**
 * One drawn band, as the sentence needs to see it.
 *
 * `spans` is exactly what `passSpans` returned for that satellite — the same
 * array the band is DRAWN from, handed over by reference. Unwrapping it into
 * bare intervals was allocating one array per band on every pointer move, in
 * the one code path whose whole design is to allocate nothing at pointer rate.
 */
export interface ContributorBand {
    satelliteId: string;
    spans: readonly { readonly interval: TimeSpan }[];
}

/**
 * Do two bands share any instant?
 *
 * Both span lists are in start order — `passSpans` preserves the order of the
 * intervals it projects, and access intervals are produced sorted — so this is
 * a merge, not a search: advance whichever band ends first. The pairwise form
 * it replaces compared every span with every span, which is fine at four bands
 * of two passes and quadratic in exactly the case the density fill exists for.
 */
function bandsOverlap(a: ContributorBand, b: ContributorBand): boolean {
    let i = 0;
    let j = 0;
    while (i < a.spans.length && j < b.spans.length) {
        const left = a.spans[i].interval;
        const right = b.spans[j].interval;
        if (left.startMs < right.endMs && right.startMs < left.endMs) return true;
        if (left.endMs <= right.startMs) i += 1;
        else j += 1;
    }
    return false;
}

/**
 * Which satellites are drawn under the lane, in words.
 *
 * The bands answer the SHAPE question — how many, and do they overlap. This
 * answers the identity question the shape cannot carry without stealing the
 * horizontal space that keeps every band on the lane's own axis. Order matches
 * the bands, top to bottom.
 *
 * `bands` is a POOL, reused between frames, so `count` says how much of it is
 * live. It has no default on purpose: `bands.length` is the pool's capacity,
 * which is the one value that is never right, and stale slots hold plausible
 * ids rather than empty ones — the wrong sentence would render in silence.
 * Nothing here is retained past the call.
 *
 * `denseCount` is the number of those bands whose passes exceeded the tick pool
 * and are shown as a density fill instead. The lane above says "too dense to
 * resolve" in that situation; a band has no room for a sentence, so its
 * omission is stated here rather than left to be read as a quiet gap.
 */
export function summariseContributors(
    bands: readonly ContributorBand[], count: number,
    hiddenCount = 0, denseCount = 0,
): string {
    if (count <= 0) return '';
    let overlapping = false;
    for (let i = 0; i < count && !overlapping; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
            if (bandsOverlap(bands[i], bands[j])) { overlapping = true; break; }
        }
    }
    const more = hiddenCount > 0 ? ` · +${hiddenCount} more` : '';
    /*
     * A band past the tick pool draws a density fill, not its passes. Saying so
     * costs four words; not saying it turns "eight passes drawn out of twenty"
     * into twelve gaps the reader has no way to know are not real.
     *
     * It LEADS the sentence, and that placement is the point. This line renders
     * in a `truncate` div 300 px wide — about 57 characters — and four ids plus
     * a "+N more" plus this clause is 77. Appended, the clause was clipped away
     * in precisely the crowded case it exists for, leaving a flat fill with no
     * explanation; the ids that survived name bands the reader can already see.
     * Reading it first is also right on its own terms: it changes how the bands
     * below are to be read, so it belongs before them.
     */
    const dense = denseCount > 0
        ? `${denseCount === 1 ? '1 band' : `${denseCount} bands`} too dense to resolve · `
        : '';
    if (count === 1) return `${dense}${bands[0].satelliteId}${more}`;
    const separator = overlapping ? ' → ' : ' · ';
    let ids = bands[0].satelliteId;
    for (let i = 1; i < count; i += 1) ids += separator + bands[i].satelliteId;
    return overlapping
        ? `${dense}Handover ${ids}${more}`
        : `${dense}${ids}${more}`;
}
