// @vitest-environment jsdom
/**
 * The lens, wired to the ribbon (P2).
 *
 * The behaviour is easy to see and easy to get wrong; the COST is neither. So
 * the first test here is the one that matters: a hundred pointer moves must
 * commit zero React renders. If that ever fails, the lens has become the thing
 * the whole design was built to avoid — a re-render of the module's presenting
 * surface at pointer rate.
 */
import { Profiler, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RIBBON_MIN_SPAN_FRACTION } from '../ui/passSpans';
import { CoverageRibbon, type CoverageRibbonTarget } from '../ui/CoverageRibbon';
import type { AccessInterval, GapStatistics } from '../domain/types';

const EPOCH = Date.UTC(2026, 8, 4, 0, 0, 0);
const HOUR = 3600_000;
const WINDOW_HOURS = 72;
const WINDOW_MS = WINDOW_HOURS * HOUR;
/** The seek surface's geometry, which jsdom will not compute for us. */
const TRACK_LEFT = 200;
const TRACK_WIDTH = 700;
/** Lane rows, stacked: 28 px each with a 6 px gutter between them. */
const LANE_TOP = 600;
const LANE_HEIGHT = 28;
const LANE_GAP = 6;
/** Filled by `renderRibbon`, so the rect mock can place each row. */
let laneIds: string[] = [];
/** Shifted by `reflow()` to simulate layout moving under a resting pointer. */
let layoutOffsetY = 0;

function laneCentreY(index: number): number {
    return LANE_TOP + layoutOffsetY + index * (LANE_HEIGHT + LANE_GAP) + LANE_HEIGHT / 2;
}

/** Everything moves by `dy`, and nothing resizes — what a ResizeObserver on the
 *  seek surface cannot see. */
function reflow(dy: number): void {
    layoutOffsetY += dy;
}

let root: Root | null = null;
let container: HTMLDivElement;
let commits = 0;
const seeks: number[] = [];
const speeds: number[] = [];

beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
        .IS_REACT_ACT_ENVIRONMENT = true;
    clockRef.value = EPOCH;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    commits = 0;
    seeks.length = 0;
    speeds.length = 0;
    laneIds = [];
    layoutOffsetY = 0;
    /*
     * jsdom lays nothing out, so every box is 0 wide. The lens is deliberately
     * driven from CACHED rects, which makes stubbing them the whole fixture —
     * and the lane rows need rects of their own, because which lane the pointer
     * is on is a question about `clientY`.
     */
    vi.spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function mocked(this: Element): DOMRect {
            const laneId = this.getAttribute?.('data-revisit-timeline-lane');
            if (laneId) {
                const index = Math.max(0, laneIds.indexOf(laneId));
                const top = LANE_TOP + layoutOffsetY + index * (LANE_HEIGHT + LANE_GAP);
                return {
                    left: TRACK_LEFT, width: TRACK_WIDTH, right: TRACK_LEFT + TRACK_WIDTH,
                    top, bottom: top + LANE_HEIGHT, height: LANE_HEIGHT,
                    x: TRACK_LEFT, y: top, toJSON: () => ({}),
                } as DOMRect;
            }
            return {
                left: TRACK_LEFT, width: TRACK_WIDTH, right: TRACK_LEFT + TRACK_WIDTH,
                top: LANE_TOP + layoutOffsetY, bottom: LANE_TOP + layoutOffsetY + 70,
                height: 70, x: TRACK_LEFT, y: LANE_TOP + layoutOffsetY, toJSON: () => ({}),
            } as DOMRect;
        });
});

afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

function interval(startMs: number, endMs: number): AccessInterval {
    return {
        startMs, endMs, satelliteIds: ['P00_S00'],
        clippedAtStart: false, clippedAtEnd: false,
    };
}

/** One 90 s pass an hour, on the half hour. */
const PASSES: AccessInterval[] = Array.from({ length: 72 }, (_unused, i) => interval(
    EPOCH + i * HOUR + 30 * 60_000, EPOCH + i * HOUR + 30 * 60_000 + 90_000,
));

const STATISTICS: GapStatistics = {
    maxGapMs: HOUR, meanGapMs: HOUR, p95GapMs: HOUR, accessCount: PASSES.length,
} as GapStatistics;

const LANE: CoverageRibbonTarget = {
    id: 'primary', label: 'Primary · Test', name: 'Test target',
    intervals: PASSES, statistics: STATISTICS, selected: true,
    kind: 'POINT', roleLabel: 'Primary', basisLabel: 'Point',
};

/** A clock the tests move by hand, read the way the ribbon reads the real one. */
const clockRef = { value: EPOCH, now: () => clockRef.value };

function renderRibbon(lanes: CoverageRibbonTarget[] = [LANE]): void {
    laneIds = lanes.map((lane) => lane.id);
    act(() => root?.render(
        <Profiler id="ribbon" onRender={() => { commits += 1; }}>
            <CoverageRibbon
                intervals={lanes[0]?.intervals ?? []}
                statistics={lanes[0]?.statistics ?? null}
                targetLanes={lanes}
                windowStartMs={EPOCH}
                windowHours={WINDOW_HOURS}
                getTimeMs={clockRef.now}
                onSeek={(ms) => { seeks.push(ms); }}
                speed={0}
                onSetSpeed={(value) => { speeds.push(value); }}
            />
        </Profiler>
    ));
}

function surface(): HTMLElement {
    const node = container.querySelector('[role="slider"]');
    if (!(node instanceof HTMLElement)) throw new Error('seek surface missing');
    return node;
}

function lens(): HTMLElement {
    const node = document.body.querySelector('[data-revisit-lens]');
    if (!(node instanceof HTMLElement)) throw new Error('lens missing');
    return node;
}

/** The emphasised row: the one the pointer is on, which owns the sentence. */
const EMPHASISED = '[data-revisit-lens-emphasis="true"]';

function readout(): string {
    return document.body
        .querySelector(`${EMPHASISED} [data-revisit-lens-readout]`)?.textContent ?? '';
}

function emphasisedLabel(): string {
    return document.body
        .querySelector(`${EMPHASISED} [data-revisit-lens-label]`)?.textContent ?? '';
}

/** The x a given instant sits at, in the stubbed track box. */
function clientXFor(ms: number): number {
    return TRACK_LEFT + ((ms - EPOCH) / WINDOW_MS) * TRACK_WIDTH;
}

function pointer(type: string, clientX: number, laneIndex = 0): void {
    const event = new Event(type, { bubbles: false }) as Event & {
        clientX: number; clientY: number;
    };
    event.clientX = clientX;
    event.clientY = laneCentreY(laneIndex);
    surface().dispatchEvent(event);
}

/** One turn of the ribbon's own frame loop. */
async function frame(): Promise<void> {
    await act(async () => {
        // TWO nested frames. The ribbon's own loop may already be queued for
        // the frame an event lands in, so its callback can run before the event
        // is read — a single frame observes the previous value.
        await new Promise<void>((resolve) => requestAnimationFrame(
            () => requestAnimationFrame(() => resolve()),
        ));
    });
}

describe('CoverageRibbon + lens — cost', () => {
    it('commits no React render for a hundred pointer moves', async () => {
        renderRibbon();
        await frame();
        const before = commits;

        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR));
        for (let i = 0; i < 100; i += 1) {
            pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + i * 20_000));
        }
        await frame();

        expect(commits).toBe(before);
        expect(lens().hidden).toBe(false);
    });

    it('measures on enter and at 2 Hz, never per frame or per move', async () => {
        renderRibbon();
        const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
        await frame();
        expect(spy).not.toHaveBeenCalled();

        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR));
        const perMeasure = spy.mock.calls.length;
        expect(perMeasure).toBeGreaterThan(0);

        const started = performance.now();
        for (let i = 0; i < 20; i += 1) {
            pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + i * 20_000));
        }
        await frame();
        await frame();
        const elapsed = performance.now() - started;

        /*
         * The contract is a CADENCE, not silence: while a pointer is on the
         * track the loop re-measures twice a second so a reflow cannot leave
         * the cached boxes describing where the rows used to be. What must
         * never happen is a measurement per move or per frame — so the budget
         * is derived from elapsed wall time, not from a fixed count, or this
         * test fails on a slow machine for being right.
         */
        const refreshes = Math.ceil(elapsed / 500) + 1;
        const growth = spy.mock.calls.length - perMeasure;
        expect(growth).toBeLessThanOrEqual(refreshes * perMeasure);
        expect(growth).toBeLessThan(20 * perMeasure);
    });

    it('costs nothing while the pointer is away', async () => {
        renderRibbon();
        await frame();
        expect(lens().hidden).toBe(true);
        expect(lens().style.willChange).toBe('');
    });
});

describe('CoverageRibbon + lens — behaviour', () => {
    const passStart = EPOCH + 30 * HOUR + 30 * 60_000;

    it('reads the instant under the pointer at lens resolution', async () => {
        renderRibbon();
        pointer('pointerenter', clientXFor(passStart + 45_000));
        await frame();

        expect(lens().hidden).toBe(false);
        expect(readout()).toContain('In view · 1 min 30 s');
        expect(readout()).toContain('AOS 06:30:00 → LOS 06:31:30');
    });

    it('says how far the pointer is from the next pass', async () => {
        renderRibbon();
        // Twenty minutes early — beyond the click radius, so the reading is the
        // plain distance rather than an offer to snap.
        pointer('pointerenter', clientXFor(passStart - 20 * 60_000));
        await frame();
        expect(readout()).toBe('No pass · next in 20 min 00 s at 06:30:00');
    });

    it('hides on leave and drops its compositing hint', async () => {
        renderRibbon();
        pointer('pointerenter', clientXFor(passStart));
        await frame();
        expect(lens().hidden).toBe(false);
        expect(lens().style.willChange).toBe('transform');

        pointer('pointerleave', 0);
        await frame();
        expect(lens().hidden).toBe(true);
        expect(lens().style.willChange).toBe('');
    });

    it('reads the lane under the pointer, not the selected one', async () => {
        const secondary: CoverageRibbonTarget = {
            ...LANE,
            id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
            roleLabel: 'Secondary', selected: false,
            intervals: [interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 30_000)],
        };
        // The PRIMARY is selected; the pointer is on the secondary row. Showing
        // the primary's passes there is the confusion this behaviour fixes.
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR + 10_000), 1);
        await frame();

        expect(emphasisedLabel())
            .toBe('Other target');
        expect(readout()).toContain('In view · 30 s');

        // Crossing back to the primary row swaps the lane, at the same x.
        pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + 10_000), 0);
        await frame();
        expect(emphasisedLabel())
            .toBe('Test target');
        expect(readout()).toContain('No pass');
    });

    it('commits no React render when the pointer crosses a lane', async () => {
        const secondary: CoverageRibbonTarget = {
            ...LANE,
            id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
            roleLabel: 'Secondary', selected: false,
            intervals: [interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 30_000)],
        };
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        await frame();
        const before = commits;

        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 0);
        for (let i = 0; i < 20; i += 1) {
            pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + i * 1000), i % 2);
            await frame();
        }
        expect(commits).toBe(before);
    });

    it('snaps on the lane under the pointer, not on the selected one', async () => {
        const secondaryPass = interval(
            EPOCH + 12 * HOUR, EPOCH + 12 * HOUR + 40_000,
        );
        const secondary: CoverageRibbonTarget = {
            ...LANE,
            id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
            roleLabel: 'Secondary', selected: false, intervals: [secondaryPass],
        };
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        // On the secondary row, a minute before ITS pass — the primary has
        // nothing there, so a snap proves which lane the click consulted.
        pointer('pointerenter', clientXFor(secondaryPass.startMs - 60_000), 1);
        await frame();

        const event = new MouseEvent('click', { bubbles: true }) as MouseEvent & {
            clientX: number;
        };
        Object.defineProperty(event, 'clientX', {
            value: clientXFor(secondaryPass.startMs - 60_000),
        });
        act(() => { surface().dispatchEvent(event); });

        expect(seeks).toEqual([(secondaryPass.startMs + secondaryPass.endMs) / 2]);
        expect(speeds).toEqual([0]);
    });

    it('places the panel within the track and clamps it at the edges', async () => {
        renderRibbon();
        pointer('pointerenter', clientXFor(EPOCH));
        await frame();
        expect(lens().style.left).toBe(`${TRACK_LEFT}px`);

        pointer('pointermove', clientXFor(EPOCH + WINDOW_MS));
        await frame();
        expect(lens().style.left).toBe(`${TRACK_LEFT + TRACK_WIDTH - 300}px`);
    });
});

describe('CoverageRibbon + lens — seeking (P3)', () => {
    const passStart = EPOCH + 30 * HOUR + 30 * 60_000;
    const passEnd = passStart + 90_000;
    const floorMs = RIBBON_MIN_SPAN_FRACTION * WINDOW_MS;

    function click(clientX: number): void {
        const event = new MouseEvent('click', { bubbles: true }) as MouseEvent & { clientX: number };
        Object.defineProperty(event, 'clientX', { value: clientX });
        act(() => { surface().dispatchEvent(event); });
    }

    it('snaps to the pass when the click lands inside a DRAWN tick', () => {
        renderRibbon();
        // Two minutes past the pass: still inside the 5.2 min tick the ribbon
        // drew for it, and 30 s past the pass itself.
        click(clientXFor(passStart + 2 * 60_000));

        expect(seeks).toEqual([(passStart + passEnd) / 2]);
        // Paused, or a 90 s pass would be gone before it could be looked at.
        expect(speeds).toEqual([0]);
    });

    it('seeks plainly, without pausing, beyond the click radius', () => {
        renderRibbon();
        // Half an hour from either neighbour: nothing to snap to.
        const target = passStart + 30 * 60_000;
        click(clientXFor(target));

        expect(seeks).toHaveLength(1);
        expect(seeks[0]).toBeCloseTo(target, 6);
        expect(speeds).toEqual([]);
    });

    it('snaps from just before a pass too — the tick is 1.1 px wide', () => {
        renderRibbon();
        // A minute early. Requiring a hit INSIDE the drawn tick would mean
        // aiming at 1.1 px on this window, which is the defect one layer down.
        click(clientXFor(passStart - 60_000));
        expect(seeks).toEqual([(passStart + passEnd) / 2]);
        expect(speeds).toEqual([0]);
    });

    it('keeps the tolerance in pixels: 3 px of THIS track', () => {
        renderRibbon();
        const toleranceMs = (3 / TRACK_WIDTH) * WINDOW_MS;
        // Just outside the radius, measured from the drawn tick's far edge.
        const target = passStart + floorMs + toleranceMs + 1000;
        click(clientXFor(target));
        expect(seeks[0]).toBeCloseTo(target, 6);
        expect(speeds).toEqual([]);
    });

    it('offers the snap in words before the click', async () => {
        renderRibbon();
        pointer('pointerenter', clientXFor(passStart + 2 * 60_000));
        await frame();
        expect(readout()).toContain('Tick drawn here');
        expect(readout()).toContain('the pass ended 30 s ago');
        expect(readout()).toContain('click to seek to it');
    });
});

describe('CoverageRibbon — the playhead reading (P3)', () => {
    const passStart = EPOCH + 30 * HOUR + 30 * 60_000;

    function reading(): string {
        return container.querySelector('[data-revisit-playhead-reading]')?.textContent ?? '';
    }

    it('names its lane as soon as the lens can be reading another one', async () => {
        const secondary: CoverageRibbonTarget = {
            ...LANE,
            id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
            roleLabel: 'Secondary', selected: false, intervals: [],
        };
        clockRef.value = passStart + 30_000;
        renderRibbon([{ ...LANE, selected: true }, secondary]);
        await frame();
        expect(reading()).toBe(
            'Test target · In view · 1 min 30 s · AOS 06:30:00 → LOS 06:31:30',
        );
    });

    it('says what is happening at the playhead, with no pointer at all', async () => {
        clockRef.value = passStart + 30_000;
        renderRibbon();
        await frame();
        expect(reading()).toContain('In view · 1 min 30 s');
    });

    it('resolves passes the aria value cannot: it moves inside 0.1 h', async () => {
        clockRef.value = passStart - 4 * 60_000;
        renderRibbon();
        await frame();
        expect(reading()).toContain('No pass · next in 4 min');

        // Four minutes later — under the 0.1 h (6 min) threshold that gates
        // `currentHours`, so nothing in React state has changed.
        clockRef.value = passStart + 30_000;
        // The reading is throttled to the ribbon's 2 Hz aria cadence, which is
        // wall time: waiting one frame is not enough, by design.
        await act(async () => { await new Promise((r) => setTimeout(r, 550)); });
        await frame();
        expect(reading()).toContain('In view · 1 min 30 s');
    });
});

describe('CoverageRibbon + lens — lanes with no result yet', () => {
    const pending: CoverageRibbonTarget = {
        ...LANE,
        id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
        roleLabel: 'Secondary', selected: false,
        intervals: [], statistics: null, statusLabel: 'Computing…',
    };

    it('says so in the lens instead of "No pass in view"', async () => {
        renderRibbon([{ ...LANE, selected: true }, pending]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 1);
        await frame();
        expect(readout()).toBe('Computing… · no result yet');
    });

    it('says so in the header reading when that lane is the selected one', async () => {
        renderRibbon([{ ...LANE, selected: false }, { ...pending, selected: true }]);
        await frame();
        expect(container.querySelector('[data-revisit-playhead-reading]')?.textContent)
            .toBe('Other target · Computing… · no result yet');
    });

    it('applies the ribbon\'s own waiting rule, not just the explicit label', async () => {
        // No statusLabel, but a secondary lane with no statistics while the
        // comparison runs — exactly what the result cell renders as "…".
        act(() => root?.render(
            <Profiler id="ribbon" onRender={() => { commits += 1; }}>
                <CoverageRibbon
                    intervals={PASSES}
                    statistics={STATISTICS}
                    targetLanes={[
                        { ...LANE, selected: true },
                        {
                            ...pending, statusLabel: null, selected: false,
                        },
                    ]}
                    windowStartMs={EPOCH}
                    windowHours={WINDOW_HOURS}
                    getTimeMs={clockRef.now}
                    onSeek={(ms) => { seeks.push(ms); }}
                    speed={0}
                    onSetSpeed={(value) => { speeds.push(value); }}
                    comparisonIsComputing
                />
            </Profiler>
        ));
        laneIds = ['primary', 'secondary'];
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 1);
        await frame();
        expect(readout()).toBe('Computing… · no result yet');
    });
});

describe('CoverageRibbon + lens — geometry that moves under the pointer', () => {
    it('refreshes the cached boxes while hovering, at the aria cadence', async () => {
        renderRibbon([{ ...LANE, selected: true }, {
            ...LANE, id: 'secondary', name: 'Other target', roleLabel: 'Secondary',
            selected: false, intervals: [interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 30_000)],
        }]);
        // The pointer lands on the FIRST row and never moves again.
        const y = laneCentreY(0);
        const event = new Event('pointerenter') as Event & {
            clientX: number; clientY: number;
        };
        Object.defineProperty(event, 'clientX', { value: clientXFor(EPOCH + 30 * HOUR) });
        Object.defineProperty(event, 'clientY', { value: y });
        surface().dispatchEvent(event);
        await frame();
        expect(emphasisedLabel())
            .toBe('Test target');

        const bottomBefore = lens().style.bottom;

        // A reflow above the track moves every row up by one row height. The
        // pointer has not moved, so it is now over the SECOND row — and no
        // ResizeObserver fires, because nothing resized.
        reflow(-(LANE_HEIGHT + LANE_GAP));
        await act(async () => { await new Promise((r) => setTimeout(r, 550)); });
        await frame();

        // Within half a second and with no pointer event: the panel has moved
        // with the card...
        expect(lens().style.bottom).not.toBe(bottomBefore);
        expect(Number.parseInt(lens().style.bottom, 10))
            .toBe(Number.parseInt(bottomBefore, 10) + LANE_HEIGHT + LANE_GAP);
        // ...and it now reads the row that is actually under the cursor.
        expect(emphasisedLabel())
            .toBe('Other target');
    });

    it('leaves a finger on the row it landed on, even after a reflow', async () => {
        renderRibbon([{ ...LANE, selected: true }, {
            ...LANE, id: 'secondary', name: 'Other target', roleLabel: 'Secondary',
            selected: false, intervals: [interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 30_000)],
        }]);
        const event = new Event('pointerenter') as Event & {
            clientX: number; clientY: number; pointerType: string;
        };
        Object.defineProperty(event, 'clientX', { value: clientXFor(EPOCH + 30 * HOUR) });
        Object.defineProperty(event, 'clientY', { value: laneCentreY(0) });
        Object.defineProperty(event, 'pointerType', { value: 'touch' });
        surface().dispatchEvent(event);
        await frame();

        reflow(-(LANE_HEIGHT + LANE_GAP));
        await act(async () => { await new Promise((r) => setTimeout(r, 550)); });
        await frame();
        // The placement follows the card; the SUBJECT does not change under a
        // finger that never lifted.
        expect(emphasisedLabel())
            .toBe('Test target');
    });
});

describe('CoverageRibbon + lens — both lanes on one axis', () => {
    const other: CoverageRibbonTarget = {
        ...LANE,
        id: 'secondary', label: 'Compare 1 · Other', name: 'Other target',
        roleLabel: 'Secondary', selected: false,
        // A pass 12 minutes after the primary's, so the two lanes are visibly
        // out of phase inside the same one-hour span.
        intervals: [interval(
            EPOCH + 30 * HOUR + 42 * 60_000, EPOCH + 30 * HOUR + 42 * 60_000 + 40_000,
        )],
    };

    function rows(): HTMLElement[] {
        return [...document.body.querySelectorAll('[data-revisit-lens-row]')]
            .filter((node): node is HTMLElement => node instanceof HTMLElement && !node.hidden);
    }

    it('draws every lane, not only the one under the pointer', async () => {
        renderRibbon([{ ...LANE, selected: true }, other]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR + 30 * 60_000), 0);
        await frame();

        expect(rows()).toHaveLength(2);
        const labels = rows().map(
            (row) => row.querySelector('[data-revisit-lens-label]')?.textContent,
        );
        expect(labels).toEqual(['Test target', 'Other target']);
        // Both rows drew a tick: the two schedules are comparable at a glance,
        // which is the one thing the ribbon's 1.1 px ticks cannot show.
        for (const row of rows()) {
            const drawn = [...row.querySelectorAll('[data-revisit-lens-ticks] rect')]
                .filter((node) => (node as SVGElement).style.display !== 'none');
            expect(drawn.length).toBeGreaterThan(0);
        }
    });

    it('emphasises the hovered row and gives it the sentence', async () => {
        renderRibbon([{ ...LANE, selected: true }, other]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR + 30 * 60_000), 1);
        await frame();

        const [primary, secondary] = rows();
        expect(primary.getAttribute('data-revisit-lens-emphasis')).toBe('false');
        expect(secondary.getAttribute('data-revisit-lens-emphasis')).toBe('true');
        // The emphasised row offers the click...
        expect(readout()).toContain('click to seek to it');
        // ...the other is context: short, and never an offer.
        const aside = primary.querySelector('[data-revisit-lens-readout]')?.textContent ?? '';
        expect(aside).toMatch(/^(In view|Next in|No pass in view)/);
        expect(aside).not.toContain('click to seek');
    });

    it('moves the emphasis with the pointer, without redrawing React', async () => {
        renderRibbon([{ ...LANE, selected: true }, other]);
        await frame();
        const before = commits;
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 0);
        await frame();
        expect(rows()[0].getAttribute('data-revisit-lens-emphasis')).toBe('true');

        pointer('pointermove', clientXFor(EPOCH + 30 * HOUR), 1);
        await frame();
        expect(rows()[1].getAttribute('data-revisit-lens-emphasis')).toBe('true');
        expect(commits).toBe(before);
    });

    it('leaves no phantom ticks when a lane goes and another comes back', async () => {
        const busy: CoverageRibbonTarget = {
            ...other,
            intervals: Array.from({ length: 5 }, (_u, i) => interval(
                EPOCH + 30 * HOUR + i * 6 * 60_000,
                EPOCH + 30 * HOUR + i * 6 * 60_000 + 40_000,
            )),
        };
        renderRibbon([{ ...LANE, selected: true }, busy]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR + 12 * 60_000), 0);
        await frame();
        const secondRow = () => document.body
            .querySelector('[data-revisit-lens-row="1"]') as HTMLElement;
        const visibleIn = (row: HTMLElement) => [
            ...row.querySelectorAll('[data-revisit-lens-ticks] rect'),
        ].filter((node) => (node as SVGElement).style.display !== 'none').length;
        expect(visibleIn(secondRow())).toBe(5);

        // The secondary is removed, then a quieter one takes its place.
        renderRibbon([{ ...LANE, selected: true }]);
        await frame();
        renderRibbon([{ ...LANE, selected: true }, {
            ...other,
            intervals: [interval(EPOCH + 30 * HOUR + 12 * 60_000, EPOCH + 30 * HOUR + 12 * 60_000 + 40_000)],
        }]);
        pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + 12 * 60_000), 0);
        await frame();

        // One pass, one tick. The four rects the removed target left behind
        // must not still be on screen.
        expect(visibleIn(secondRow())).toBe(1);
    });

    it('marks where the globe is, distinctly from where the pointer is', async () => {
        // The clock sits 20 minutes before the hovered instant — inside the
        // one-hour span, so the panel can show both.
        clockRef.value = EPOCH + 30 * HOUR - 20 * 60_000;
        renderRibbon([{ ...LANE, selected: true }, other]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 0);
        await frame();

        const clocks = [...document.body.querySelectorAll('[data-revisit-lens-clock]')]
            .filter((node) => (node as SVGElement).style.display !== 'none');
        expect(clocks).toHaveLength(2); // one per visible row, same axis
        // Left of the centre line: the globe is behind the pointer, which is
        // exactly what "no satellite over that target yet" looks like.
        const x = Number(clocks[0].getAttribute('x1'));
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(150);
    });

    it('hides the globe marker when the clock is outside the visible hour', async () => {
        clockRef.value = EPOCH;
        renderRibbon([{ ...LANE, selected: true }, other]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 0);
        await frame();
        expect([...document.body.querySelectorAll('[data-revisit-lens-clock]')]
            .filter((node) => (node as SVGElement).style.display !== 'none'))
            .toHaveLength(0);
    });

    function outlinedTicks(): Element[] {
        return [...document.body.querySelectorAll('[data-revisit-lens-tick]')]
            .filter((node) => node.getAttribute('stroke'));
    }

    it('outlines the pass a click would land on, and only there', async () => {
        renderRibbon([{ ...LANE, selected: true }, other]);
        const passStart = EPOCH + 30 * HOUR + 30 * 60_000;
        // Two minutes past the pass: inside the drawn tick, so a snap is
        // offered — and the sentence says so.
        pointer('pointerenter', clientXFor(passStart + 2 * 60_000), 0);
        await frame();
        expect(readout()).toContain('click to seek to it');

        const outlined = outlinedTicks();
        // One tick, on the row that owns the click. Never on the other.
        expect(outlined).toHaveLength(1);
        expect(outlined[0].closest('[data-revisit-lens-row]')
            ?.getAttribute('data-revisit-lens-emphasis')).toBe('true');
        // And it is the tick for the pass the sentence names: left of centre.
        expect(Number(outlined[0].getAttribute('x'))).toBeLessThan(150);
    });

    it('outlines nothing while the pointer is inside a pass', async () => {
        renderRibbon([{ ...LANE, selected: true }, other]);
        const passStart = EPOCH + 30 * HOUR + 30 * 60_000;
        pointer('pointerenter', clientXFor(passStart + 45_000), 0);
        await frame();
        expect(readout()).toContain('In view');
        // Nothing to seek to: the reading already describes what is happening.
        expect(outlinedTicks()).toHaveLength(0);
    });

    it('moves the outline with the pointer and clears the previous one', async () => {
        const busy: CoverageRibbonTarget = {
            ...LANE, selected: true,
            intervals: [
                interval(EPOCH + 30 * HOUR, EPOCH + 30 * HOUR + 40_000),
                interval(EPOCH + 30 * HOUR + 20 * 60_000, EPOCH + 30 * HOUR + 20 * 60_000 + 40_000),
            ],
        };
        renderRibbon([busy]);
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR + 3 * 60_000), 0);
        await frame();
        expect(outlinedTicks()).toHaveLength(1);
        const first = outlinedTicks()[0].getAttribute('data-revisit-lens-tick');

        pointer('pointermove', clientXFor(EPOCH + 30 * HOUR + 23 * 60_000), 0);
        await frame();
        // Exactly one outline at any time — the previous is cleared, never left
        // behind on a pooled rect that now draws another pass.
        expect(outlinedTicks()).toHaveLength(1);
        expect(outlinedTicks()[0].getAttribute('data-revisit-lens-tick')).not.toBe(first);
    });

    it('shows a single row for a single-lane timeline', async () => {
        renderRibbon();
        pointer('pointerenter', clientXFor(EPOCH + 30 * HOUR), 0);
        await frame();
        expect(rows()).toHaveLength(1);
    });
});
