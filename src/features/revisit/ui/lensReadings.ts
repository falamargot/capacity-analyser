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
    drawnPassNear, emptyNeighbourhood, passNeighbourhood, type PassSpanIndex,
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
 * for, the sentence names the discrepancy and offers the click that fixes it.
 * That band — up to the floor's width — is precisely where the timeline
 * misleads, and it is the only place the offer is made.
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
                + ` · ${length} · click to seek to it`;
        }
        const relation = hoverMs < drawn.startMs
            ? `starts in ${formatPassDuration(drawn.startMs - hoverMs)}`
            : `ended ${formatPassDuration(hoverMs - drawn.endMs)} ago`;
        return `Nearest pass ${relation} · ${length} · click to seek to it`;
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
