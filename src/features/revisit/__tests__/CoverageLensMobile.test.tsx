// @vitest-environment jsdom
/**
 * The lens on a phone.
 *
 * Three things break when the same code meets a 375 px viewport, and each one
 * is asserted here rather than argued:
 *
 *   1. There is no hover. A finger produces `pointerenter → move → leave` like a
 *      mouse, so a DRAG along the track scrubs the lens — but only if the
 *      browser has not taken the horizontal gesture for scrolling first, which
 *      is what `touch-pan-y` is for. `pointercancel`, which a mouse never emits,
 *      is the case that would otherwise leave the panel standing.
 *   2. The track column is about 120 px on a phone — NARROWER than the 300 px
 *      panel. Clamping the panel "inside the track" then has no solution, and a
 *      naive clamp puts its left edge off screen.
 *   3. The playhead reading must not impose a desktop minimum width on a 375 px
 *      row.
 *
 * The live check on a real mobile viewport could not be completed: the browser
 * pane stopped presenting frames (`visibilityState === "hidden"`, zero rAF
 * callbacks — the obstacle `docs/REVISIT_FOREGROUND_PERFORMANCE.md` records),
 * and the lens is driven from a frame loop. What follows is the same behaviour
 * at component level, with the phone's real numbers.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverageRibbon, type CoverageRibbonTarget } from '../ui/CoverageRibbon';
import type { AccessInterval, GapStatistics } from '../domain/types';

const EPOCH = Date.UTC(2026, 8, 4, 0, 0, 0);
const HOUR = 3600_000;
const WINDOW_HOURS = 72;

/** A 375 px phone: 16 px of panel padding, a 6 rem label and a 7 rem result
 *  column either side of the track. What is left is about 120 px. */
const VIEWPORT_WIDTH = 375;
const TRACK_LEFT = 128;
const TRACK_WIDTH = 120;
const LENS_WIDTH = 300;
/** Two lane rows, as a comparison shows them on a phone. */
const LANE_TOP = 700;
const LANE_HEIGHT = 28;
const LANE_GAP = 6;
let laneIds: string[] = [];

function laneCentreY(index: number): number {
    return LANE_TOP + index * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2;
}

let root: Root | null = null;
let container: HTMLDivElement;
let originalInnerWidth: number;

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
        value: VIEWPORT_WIDTH, configurable: true, writable: true,
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    laneIds = [];
    vi.spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function mocked(this: Element): DOMRect {
            const laneId = this.getAttribute?.('data-revisit-timeline-lane');
            const top = laneId
                ? LANE_TOP + Math.max(0, laneIds.indexOf(laneId)) * (LANE_HEIGHT + LANE_GAP)
                : LANE_TOP;
            return {
                left: TRACK_LEFT, width: TRACK_WIDTH, right: TRACK_LEFT + TRACK_WIDTH,
                top, bottom: top + LANE_HEIGHT, height: LANE_HEIGHT,
                x: TRACK_LEFT, y: top, toJSON: () => ({}),
            } as DOMRect;
        });
});

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.replaceChildren();
    Object.defineProperty(window, 'innerWidth', {
        value: originalInnerWidth, configurable: true, writable: true,
    });
    vi.restoreAllMocks();
});

function interval(startMs: number, endMs: number): AccessInterval {
    return {
        startMs, endMs, satelliteIds: ['P00_S00'],
        clippedAtStart: false, clippedAtEnd: false,
    };
}

const PASSES: AccessInterval[] = Array.from({ length: 72 }, (_u, i) => interval(
    EPOCH + i * HOUR + 30 * 60_000, EPOCH + i * HOUR + 30 * 60_000 + 90_000,
));

const LANE: CoverageRibbonTarget = {
    id: 'primary', label: 'Primary · Test', name: 'Test target',
    intervals: PASSES,
    statistics: { maxGapMs: HOUR, meanGapMs: HOUR, p95GapMs: HOUR, accessCount: 72 } as GapStatistics,
    selected: true, kind: 'POINT', roleLabel: 'Primary', basisLabel: 'Point',
};

function renderRibbon(lanes: CoverageRibbonTarget[] = [LANE]): void {
    laneIds = lanes.map((lane) => lane.id);
    act(() => root?.render(
        <CoverageRibbon
            intervals={PASSES}
            statistics={LANE.statistics}
            targetLanes={lanes}
            windowStartMs={EPOCH}
            windowHours={WINDOW_HOURS}
            getTimeMs={() => EPOCH + 30 * HOUR + 30 * 60_000 + 30_000}
            onSeek={() => undefined}
            speed={0}
            onSetSpeed={() => undefined}
        />
    ));
}

function surface(): HTMLElement {
    const node = container.querySelector('[role="slider"]');
    if (!(node instanceof HTMLElement)) throw new Error('seek surface missing');
    return node;
}

/** The emphasised row: the one the pointer is on, which owns the sentence. */
const EMPHASISED = '[data-revisit-lens-emphasis="true"]';

function emphasisedLabel(): string {
    return document.body
        .querySelector(`${EMPHASISED} [data-revisit-lens-label]`)?.textContent ?? '';
}

function lens(): HTMLElement {
    const node = document.body.querySelector('[data-revisit-lens]');
    if (!(node instanceof HTMLElement)) throw new Error('lens missing');
    return node;
}

/** A finger, not a mouse: same pointer events, `pointerType: "touch"`. */
function touch(type: string, clientX: number, laneIndex = 0, yOffset = 0): void {
    const event = new Event(type) as Event & {
        clientX: number; clientY: number; pointerType: string;
    };
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'clientY', { value: laneCentreY(laneIndex) + yOffset });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    surface().dispatchEvent(event);
}

async function frame(): Promise<void> {
    await act(async () => {
        await new Promise<void>((r) => requestAnimationFrame(
            () => requestAnimationFrame(() => r()),
        ));
    });
}

describe('The lens on a phone — the gesture', () => {
    it('lets a horizontal drag belong to the track, and vertical panning to the page', () => {
        renderRibbon();
        expect(surface().className).toContain('touch-pan-y');
    });

    it('scrubs on a finger drag', async () => {
        renderRibbon();
        touch('pointerenter', TRACK_LEFT + 10);
        await frame();
        expect(lens().hidden).toBe(false);
        const first = lens().querySelector('[data-revisit-lens-range]')?.textContent;

        touch('pointermove', TRACK_LEFT + 60);
        await frame();
        expect(lens().querySelector('[data-revisit-lens-range]')?.textContent)
            .not.toBe(first);
    });

    it('closes when the browser takes the gesture over', async () => {
        renderRibbon();
        touch('pointerenter', TRACK_LEFT + 40);
        await frame();
        expect(lens().hidden).toBe(false);

        // `pointercancel` — a scroll or a system gesture claiming the touch. A
        // mouse never sends it, so nothing else in this path would hide the
        // panel and it would be left standing over the globe.
        touch('pointercancel', TRACK_LEFT + 40);
        await frame();
        expect(lens().hidden).toBe(true);
    });
});

describe('The lens on a phone — the geometry', () => {
    it('stays on screen although the track is narrower than the panel', async () => {
        renderRibbon();
        touch('pointerenter', TRACK_LEFT);
        await frame();
        const left = Number.parseInt(lens().style.left, 10);
        expect(left).toBeGreaterThanOrEqual(8);
        expect(left + LENS_WIDTH).toBeLessThanOrEqual(VIEWPORT_WIDTH - 8);
    });

    it('stops following the finger instead of sliding off the edge', async () => {
        renderRibbon();
        touch('pointerenter', TRACK_LEFT);
        await frame();
        const atStart = lens().style.left;

        touch('pointermove', TRACK_LEFT + TRACK_WIDTH);
        await frame();
        expect(lens().style.left).toBe(atStart);
        // It still reads a different instant — only the placement is pinned.
        expect(lens().hidden).toBe(false);
    });

    it('sits above the card, not above the transport row', async () => {
        renderRibbon();
        touch('pointerenter', TRACK_LEFT + 40);
        await frame();
        // The mocked card top is 700; the panel's bottom edge is above it.
        expect(lens().style.bottom).toBe(`${window.innerHeight - 700 + 8}px`);
    });
});

describe('The lens on a phone — the reading', () => {
    it('gives the same sentence without a pointer at all', async () => {
        renderRibbon();
        await frame();
        const reading = container.querySelector('[data-revisit-playhead-reading]');
        expect(reading?.textContent).toContain('In view · 1 min 30 s');
    });

    it('takes the full row rather than a desktop minimum width', () => {
        renderRibbon();
        const reading = container.querySelector('[data-revisit-playhead-reading]');
        // Full width on a phone; the 17 rem minimum applies from `md` up, where
        // there is a toolbar wide enough to hold it inline.
        expect(reading?.className).toContain('w-full');
        expect(reading?.className).toContain('md:min-w-[17rem]');
    });
});

describe('The lens on a phone — which lane a finger is reading', () => {
    const secondary: CoverageRibbonTarget = {
        ...LANE,
        id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
        roleLabel: 'Secondary', selected: false,
        intervals: [interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 30_000)],
    };

    it('reads the row the finger landed on', async () => {
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        touch('pointerenter', TRACK_LEFT + 20, 1);
        await frame();
        expect(emphasisedLabel()).toBe('Other target');
    });

    it('keeps that row for the whole drag, however the finger wanders', async () => {
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        touch('pointerenter', TRACK_LEFT + 10, 1);
        await frame();
        expect(emphasisedLabel()).toBe('Other target');

        // 20 px up is the other row on a phone — and it is nothing at all to a
        // finger dragging sideways. The subject must not change under it.
        touch('pointermove', TRACK_LEFT + 60, 1, -20);
        await frame();
        expect(emphasisedLabel()).toBe('Other target');
        // The instant still tracks the finger; only the lane is locked.
        expect(document.body.querySelector('[data-revisit-lens-range]')?.textContent)
            .toBeTruthy();
    });

    it('changes lane when the finger lifts and lands on the other row', async () => {
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        touch('pointerenter', TRACK_LEFT + 10, 1);
        await frame();
        touch('pointerleave', 0, 1);
        await frame();

        touch('pointerenter', TRACK_LEFT + 10, 0);
        await frame();
        expect(emphasisedLabel()).toBe('Test target');
    });

    it('still follows a mouse across rows — the lock is for touch only', async () => {
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        const mouse = (type: string, clientX: number, laneIndex: number) => {
            const event = new Event(type) as Event & { clientX: number; clientY: number };
            Object.defineProperty(event, 'clientX', { value: clientX });
            Object.defineProperty(event, 'clientY', { value: laneCentreY(laneIndex) });
            surface().dispatchEvent(event);
        };
        mouse('pointerenter', TRACK_LEFT + 10, 0);
        await frame();
        expect(emphasisedLabel()).toBe('Test target');
        mouse('pointermove', TRACK_LEFT + 10, 1);
        await frame();
        expect(emphasisedLabel()).toBe('Other target');
    });
});
