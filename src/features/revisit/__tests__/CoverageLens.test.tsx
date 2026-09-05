// @vitest-environment jsdom
/**
 * CoverageLens — the honest-scale reading of the same intervals.
 *
 * Two properties matter more than the pixels and are asserted first: the lens
 * never re-renders React between `update()` calls (it is driven from a rAF at
 * pointer rate), and it never draws more than its pre-allocated pool.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    CoverageLens, MAX_LENS_LANES, MAX_LENS_TICKS,
    type CoverageLensAnchor, type CoverageLensHandle, type CoverageLensLane,
} from '../ui/CoverageLens';
import { formatLensScale, formatPassDuration, lensRange } from '../ui/lensReadings';
import type { AccessInterval } from '../domain/types';

const EPOCH = Date.UTC(2026, 8, 4, 0, 0, 0);
const HOUR = 3600_000;
const WINDOW_MS = 72 * HOUR;
const WIDTH_PX = 300;

/** The emphasised row: the one the pointer is on, which owns the sentence. */
const EMPHASISED = '[data-revisit-lens-emphasis="true"]';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    laneStatus = null;
    if (root) act(() => root?.unmount());
    root = null;
    document.body.replaceChildren();
});

function interval(startMs: number, endMs: number): AccessInterval {
    return {
        startMs, endMs, satelliteIds: ['P00_S00'],
        clippedAtStart: false, clippedAtEnd: false,
    };
}

/** One 90 s pass an hour — the module's own working case. */
const PASSES: AccessInterval[] = Array.from({ length: 72 }, (_unused, i) => interval(
    EPOCH + i * HOUR + 30 * 60_000, EPOCH + i * HOUR + 30 * 60_000 + 90_000,
));

const handle: { current: CoverageLensHandle | null } = { current: null };
/** A track box 800 px wide starting at x = 100, 640 px down the viewport.
 *  jsdom reports a 1024 px viewport, so this one comfortably holds the panel. */
const anchorRef: React.RefObject<CoverageLensAnchor> = {
    current: { left: 100, width: 800, anchorTop: 640 },
};
const renders = { count: 0 };

let laneStatus: string | null = null;

function laneOf(intervals: AccessInterval[]): CoverageLensLane[] {
    return [{
        id: 'primary', name: 'Test target', intervals, color: '#FBBF24',
        statusLabel: laneStatus,
    }];
}

const Host: React.FC<{ intervals: AccessInterval[] }> = ({ intervals }) => {
    // Counted inside the lens's own parent: this is what a pointer-rate update
    // would move if the lens were driven by state instead of by its handle.
    renders.count += 1;
    return (
        <CoverageLens
            ref={(node) => { handle.current = node; }}
            anchorRef={anchorRef}
            lanes={laneOf(intervals)}
            windowStartMs={EPOCH}
            windowMs={WINDOW_MS}
            widthPx={WIDTH_PX}
        />
    );
};

function mount(intervals: AccessInterval[] = PASSES): void {
    handle.current = null;
    renders.count = 0;
    act(() => root?.render(<Host intervals={intervals} />));
}

function lensRoot(): HTMLElement {
    // Portalled to the body: it must escape the timeline card's clipping and
    // the stage that paints below the globe canvas.
    const node = document.body.querySelector('[data-revisit-lens]');
    if (!(node instanceof HTMLElement)) throw new Error('lens root missing');
    return node;
}

function visibleTicks(): SVGRectElement[] {
    return [...document.body.querySelectorAll('[data-revisit-lens-ticks] rect')]
        .filter((node): node is SVGRectElement =>
            node instanceof SVGElement && node.style.display !== 'none');
}

function readout(): string {
    return document.body
        .querySelector(`${EMPHASISED} [data-revisit-lens-readout]`)?.textContent ?? '';
}

describe('CoverageLens — imperative contract', () => {
    it('starts hidden and draws nothing until it is asked to', () => {
        mount();
        expect(lensRoot().hidden).toBe(true);
        expect(visibleTicks()).toHaveLength(0);
    });

    it('does not re-render React when updated', () => {
        mount();
        const before = renders.count;
        act(() => {
            for (let i = 0; i < 120; i += 1) {
                handle.current?.update(EPOCH + 30 * HOUR + i * 1000);
            }
        });
        expect(renders.count).toBe(before);
        expect(lensRoot().hidden).toBe(false);
    });

    it('hides on null and stops drawing', () => {
        mount();
        act(() => { handle.current?.update(EPOCH + 30 * HOUR + 30 * 60_000 + 45_000); });
        expect(visibleTicks().length).toBeGreaterThan(0);
        act(() => { handle.current?.update(null); });
        expect(lensRoot().hidden).toBe(true);
    });

    it('allocates exactly one pool and refuses to draw past it', () => {
        const dense: AccessInterval[] = Array.from({ length: 400 }, (_unused, i) => interval(
            EPOCH + 30 * HOUR + i * 8000, EPOCH + 30 * HOUR + i * 8000 + 4000,
        ));
        mount(dense);
        // One pool per stackable lane, allocated once — the panel shows every
        // lane of the timeline, and the timeline holds at most `MAX_LENS_LANES`.
        expect(document.body.querySelectorAll('[data-revisit-lens-ticks] rect'))
            .toHaveLength(MAX_LENS_TICKS * MAX_LENS_LANES);
        act(() => { handle.current?.update(EPOCH + 30 * HOUR + 30 * 60_000); });
        expect(visibleTicks()).toHaveLength(0);
        const density = document.body.querySelector(`${EMPHASISED} [data-revisit-lens-density]`);
        expect((density as SVGElement).style.display).not.toBe('none');
        expect(readout()).toMatch(/too dense/);
    });

    it('places itself within the host track, clamped at both ends', () => {
        mount();
        // Centred on the pointer...
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 400); });
        expect(lensRoot().style.left).toBe('250px');
        // ...and clamped to the track box at either edge rather than spilling.
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 110); });
        expect(lensRoot().style.left).toBe('100px');
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 890); });
        expect(lensRoot().style.left).toBe('600px');
    });

    it('never leaves the viewport, whatever the track claims', () => {
        anchorRef.current = { left: 100, width: 1600, anchorTop: 640 };
        mount();
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 1600); });
        // 1024 px of jsdom viewport, 300 px of panel, 8 px of margin.
        expect(lensRoot().style.left).toBe(`${window.innerWidth - 300 - 8}px`);
        anchorRef.current = { left: 100, width: 800, anchorTop: 640 };
    });

    it('pins itself when the track is narrower than the panel — a phone', () => {
        // A 375 px phone leaves the track column about 120 px.
        anchorRef.current = { left: 130, width: 120, anchorTop: 600 };
        mount();
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 140); });
        const pinned = lensRoot().style.left;
        // It stops following the finger rather than sliding off screen.
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 240); });
        expect(lensRoot().style.left).toBe(pinned);
        expect(Number.parseInt(pinned, 10)).toBeGreaterThanOrEqual(8);
        anchorRef.current = { left: 100, width: 800, anchorTop: 640 };
    });

    it('sits above the edge the host names, not above the track', () => {
        mount();
        act(() => { handle.current?.update(EPOCH + 30 * HOUR, 800); });
        // window.innerHeight (jsdom: 768) - anchorTop 640 + 8 px of clearance.
        expect(lensRoot().style.bottom).toBe(`${window.innerHeight - 640 + 8}px`);
    });
});

describe('CoverageLens — what it says', () => {
    const passStart = EPOCH + 30 * HOUR + 30 * 60_000;

    it('reports the measured dwell and the true AOS/LOS inside a pass', () => {
        mount();
        act(() => { handle.current?.update(passStart + 45_000); });
        expect(visibleTicks()).toHaveLength(1);
        expect(readout()).toContain('In view · 1 min 30 s');
        expect(readout()).toContain('AOS 06:30:00 → LOS 06:31:30');
    });

    it('answers the original confusion: how far the cursor is from the pass', () => {
        mount();
        act(() => { handle.current?.update(passStart - 3 * 60_000); });
        // Within the click radius, so the reading also offers the fix.
        expect(readout())
            .toBe('Nearest pass starts in 3 min 00 s · 1 min 30 s long');
    });

    it('names the tick/pass discrepancy when the pointer is inside a drawn tick', () => {
        mount();
        // Two minutes in: still inside the 5.2 min tick, 30 s past the pass.
        act(() => { handle.current?.update(passStart + 2 * 60_000); });
        expect(readout())
            .toBe('Tick drawn here · the pass ended 30 s ago · 1 min 30 s long');
    });

    it('falls back to the plain distance when no pass is within reach', () => {
        mount();
        act(() => { handle.current?.update(passStart - 20 * 60_000); });
        expect(readout()).toBe('No pass · next in 20 min 00 s at 06:30:00');
    });

    it('reports a lane with no result yet as such, never as "no pass"', () => {
        laneStatus = 'Computing…';
        mount([]);
        act(() => { handle.current?.update(passStart); });
        // "No pass in view" would be a finding about a target the engine has
        // not looked at yet — the ribbon's own cell says "Computing…" beside it.
        expect(readout()).toBe('Computing… · no result yet');
    });

    it('dates both ends of a range that crosses midnight', () => {
        mount();
        // 23:45 on a 72 h window: the end is on the next day.
        act(() => { handle.current?.update(EPOCH + 23 * HOUR + 45 * 60_000); });
        expect(document.body.querySelector('[data-revisit-lens-range]')?.textContent)
            .toBe('09-04 23:15:00 → 09-05 00:15:00 · 1 h 00 min · 12 s/px');
    });

    it('states its own span and resolution', () => {
        mount();
        act(() => { handle.current?.update(passStart); });
        expect(document.body.querySelector('[data-revisit-lens-range]')?.textContent)
            // The day is there because the window is 72 h: a wall clock alone
            // names three different instants in it.
            .toBe('09-05 06:00:00 → 07:00:00 · 1 h 00 min · 12 s/px');
    });

    it('draws a 90 s pass at its true width, not at a floor', () => {
        mount();
        act(() => { handle.current?.update(passStart + 45_000); });
        const [tick] = visibleTicks();
        // 90 s of a 1 h span across 300 px. The ribbon draws the same pass at
        // its 0.12 % floor — 5.2 min, some 3.5x longer than it lasts.
        expect(Number(tick.getAttribute('width'))).toBeCloseTo(7.5, 6);
        expect(Number(tick.getAttribute('x'))).toBeCloseTo(WIDTH_PX / 2 - 3.75, 6);
    });

    it('redraws when a new analysis arrives while it is open', () => {
        mount();
        act(() => { handle.current?.update(passStart + 45_000); });
        expect(visibleTicks()).toHaveLength(1);

        act(() => root?.render(<Host intervals={[]} />));
        expect(lensRoot().hidden).toBe(false);
        expect(visibleTicks()).toHaveLength(0);
        expect(readout()).toBe('No pass in view');
    });
});

describe('CoverageLens — pure helpers', () => {
    it('keeps the span constant at a window edge by sliding inward', () => {
        expect(lensRange(EPOCH, EPOCH, WINDOW_MS, HOUR))
            .toEqual({ t0: EPOCH, t1: EPOCH + HOUR });
        expect(lensRange(EPOCH + WINDOW_MS, EPOCH, WINDOW_MS, HOUR))
            .toEqual({ t0: EPOCH + WINDOW_MS - HOUR, t1: EPOCH + WINDOW_MS });
        expect(lensRange(EPOCH + 36 * HOUR, EPOCH, WINDOW_MS, HOUR))
            .toEqual({ t0: EPOCH + 35.5 * HOUR, t1: EPOCH + 36.5 * HOUR });
    });

    it('collapses to the window when the span would exceed it', () => {
        expect(lensRange(EPOCH + HOUR, EPOCH, HOUR, 6 * HOUR))
            .toEqual({ t0: EPOCH, t1: EPOCH + HOUR });
    });

    it('formats a pass in seconds, which formatGap cannot', () => {
        expect(formatPassDuration(90_000)).toBe('1 min 30 s');
        expect(formatPassDuration(42_000)).toBe('42 s');
        expect(formatPassDuration(3_600_000)).toBe('1 h 00 min');
    });

    it('states the resolution in the unit that fits it', () => {
        expect(formatLensScale(HOUR, 300)).toBe('12 s/px');
        expect(formatLensScale(72 * HOUR, 1500)).toBe('2.9 min/px');
        expect(formatLensScale(600_000, 300)).toBe('2.0 s/px');
    });
});
