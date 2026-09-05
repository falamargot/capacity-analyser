// @vitest-environment jsdom
/**
 * P4 — the performance gate for the temporal lens.
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 * R12 stayed open for months because "60 fps at 256 satellites" had been
 * *counted from the code* rather than measured, and two audits refused it on
 * exactly that ground (`docs/REVISIT_FOREGROUND_PERFORMANCE.md`). The lens was
 * built under an explicit "no performance loss" constraint, so the claim is
 * pinned by assertions rather than by argument.
 *
 * ── WHAT THIS ESTABLISHES, AND WHAT IT DOES NOT ─────────────────────────────
 * Establishes: the per-frame work is bounded and small; the node pool really is
 * a pool; a pointer sweep commits no React render; and the ribbon path cannot
 * touch Cesium at all.
 *
 * Does NOT establish presented frame rate. That needs a browser presenting
 * frames, and the automation pane reports `document.visibilityState ===
 * "hidden"` and fires zero rAF callbacks — the same obstacle R29c hit and
 * documented. The structural assertion below is the stronger statement anyway:
 * the globe's cost cannot change, because nothing on this path can reach it.
 *
 * Budgets are deliberately loose — they are regression fences, not targets. A
 * typical local run measures well under a tenth of them; a CI machine under
 * load is still nowhere near.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Profiler, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverageRibbon, type CoverageRibbonTarget } from '../ui/CoverageRibbon';
import { buildPassSpanIndex, drawnPassNear } from '../ui/passSpans';
import { describePassAt } from '../ui/lensReadings';
import {
    CoverageLens, type CoverageLensAnchor, type CoverageLensHandle, type CoverageLensLane,
} from '../ui/CoverageLens';
import type { AccessInterval, GapStatistics } from '../domain/types';

const EPOCH = Date.UTC(2026, 8, 4, 0, 0, 0);
const HOUR = 3600_000;
/** The interactive ceiling: the worst window the engine will accept. */
const WINDOW_HOURS = 240;
const WINDOW_MS = WINDOW_HOURS * HOUR;
const TRACK_LEFT = 200;
const TRACK_WIDTH = 1400;

/** ── Budgets ────────────────────────────────────────────────────────────── */
/**
 * One `update()` — the whole per-frame cost of the lens.
 *
 * Deliberately far above what it measures. Run alone this is 0.13 ms mean /
 * 0.15 ms p95 on the WORST window the engine accepts (240 h, 5760 passes); run
 * inside the full suite, with every other file executing in parallel, the same
 * code measures 0.40 ms. A fence set near the good number is a fence that fails
 * on a busy machine and gets deleted. These catch an order-of-magnitude
 * regression, which is the only kind worth a red build here — and the SCALING
 * assertion below is the one that actually tests the design.
 */
const UPDATE_P95_BUDGET_MS = 4;
const UPDATE_MEAN_BUDGET_MS = 2;
/**
 * Ten times the passes may not cost three times the work.
 *
 * This is machine-independent, which the absolute budgets are not, and it is
 * the property the binary index and the bounded pool were built for: the lens
 * shows one hour, so its cost must follow the SPAN, never the window.
 */
const SCALING_RATIO_LIMIT = 3;
/**
 * How much faster the indexed reading path must be than the linear one.
 *
 * A RATIO, measured in the same process on the same machine, because absolute
 * milliseconds here are worthless: the same code measures 0.13 ms mean on a
 * quiet machine and 0.24 ms at a load average of 9.5. A ratio cancels that out
 * and is the only number in this file that can be trusted on a busy CI box.
 */
const INDEXED_SPEEDUP_MIN = 5;

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

/**
 * A lane heavier than anything the module can produce: the longest window it
 * accepts (240 h), filled at **24 passes per HOUR** — one every 2.5 minutes,
 * 5760 in all. A large constellation gives of the order of 24 a DAY, so this is
 * roughly 24x the real cadence, deliberately: a fence is worth more when the
 * fixture is past the worst case rather than at it.
 */
const PASSES_PER_HOUR = 24;
const PASS_COUNT = WINDOW_HOURS * PASSES_PER_HOUR;
const PASSES = passesOver(WINDOW_MS, PASS_COUNT);

/** The same DENSITY over a tenth of the window — the module's default. Same
 *  passes per hour, ten times fewer of them, which is what makes the ratio
 *  below a measure of array length rather than of how much is in view. */
const SMALL_WINDOW_MS = 24 * HOUR;
const SMALL_PASSES = passesOver(SMALL_WINDOW_MS, 24 * PASSES_PER_HOUR);

function passesOver(windowMs: number, count: number): AccessInterval[] {
    return Array.from({ length: count }, (_u, i) => {
        const start = EPOCH + i * (windowMs / count);
        return interval(start, start + 90_000);
    });
}

const POOL_LANE: CoverageLensLane[] = [
    { id: 'p', name: 'P', intervals: PASSES, color: '#FBBF24' },
];

const anchorRef: { current: CoverageLensAnchor } = {
    current: { left: TRACK_LEFT, width: TRACK_WIDTH, anchorTop: 600 },
};

function percentile(samples: number[], p: number): number {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/**
 * Sweep a pointer across the whole window and time every `update()`.
 *
 * Every call lands on a different sub-range, so nothing can be cached between
 * them — this is the pointer moving, not the pointer sitting still.
 */
function measureSweep(intervals: AccessInterval[], windowMs: number): {
    mean: number; p95: number;
} {
    const handle: { current: CoverageLensHandle | null } = { current: null };
    act(() => root?.render(
        <CoverageLens
            ref={(node) => { handle.current = node; }}
            anchorRef={anchorRef}
            lanes={[{ id: 'p', name: 'P', intervals, color: '#FBBF24' }]}
            windowStartMs={EPOCH}
            windowMs={windowMs}
        />
    ));
    // Warm up: the first calls pay for jsdom's style and attribute plumbing.
    act(() => {
        for (let i = 0; i < 200; i += 1) {
            handle.current?.update(EPOCH + i * 60_000, TRACK_LEFT + i % TRACK_WIDTH);
        }
    });

    const samples: number[] = [];
    act(() => {
        for (let i = 0; i < 2000; i += 1) {
            const started = performance.now();
            handle.current?.update(
                EPOCH + (i / 2000) * windowMs, TRACK_LEFT + (i / 2000) * TRACK_WIDTH,
            );
            samples.push(performance.now() - started);
        }
    });
    return {
        mean: samples.reduce((a, b) => a + b, 0) / samples.length,
        p95: percentile(samples, 0.95),
    };
}

describe('P4 — per-frame cost', () => {
    it('updates well inside a frame budget, on the worst window the engine allows', () => {
        const { mean, p95 } = measureSweep(PASSES, WINDOW_MS);
        // Reported so a regression run says by how much, not just "failed".
        console.log(`lens update: mean ${mean.toFixed(4)} ms · p95 ${p95.toFixed(4)} ms`
            + ` · ${PASS_COUNT} passes over ${WINDOW_HOURS} h`
            + ` (${PASSES_PER_HOUR}/h)`);
        expect(mean).toBeLessThan(UPDATE_MEAN_BUDGET_MS);
        expect(p95).toBeLessThan(UPDATE_P95_BUDGET_MS);
    });

    it('costs the same at ten times the window — the span sets the work, not the window', () => {
        const small = measureSweep(SMALL_PASSES, SMALL_WINDOW_MS);
        const large = measureSweep(PASSES, WINDOW_MS);
        console.log(`lens scaling: 24 h ${small.mean.toFixed(4)} ms`
            + ` → 240 h ${large.mean.toFixed(4)} ms`
            + ` · ratio ${(large.mean / small.mean).toFixed(2)}`);
        expect(large.mean / small.mean).toBeLessThan(SCALING_RATIO_LIMIT);
    });

    it('reads through the index, not through the whole lane', () => {
        const index = buildPassSpanIndex(PASSES);
        const floorMs = 0.0012 * WINDOW_MS;
        const toleranceMs = (3 / 939) * WINDOW_MS;
        const time = (fn: (ms: number) => void): number => {
            for (let i = 0; i < 500; i += 1) fn(EPOCH + (i / 500) * WINDOW_MS);
            const started = performance.now();
            for (let i = 0; i < 4000; i += 1) fn(EPOCH + (i / 4000) * WINDOW_MS);
            return (performance.now() - started) / 4000;
        };

        const linear = time((ms) => { describePassAt(PASSES, ms, floorMs, toleranceMs); });
        const indexed = time((ms) => {
            describePassAt(PASSES, ms, floorMs, toleranceMs, index);
        });
        const snapLinear = time((ms) => { drawnPassNear(PASSES, ms, floorMs, toleranceMs); });
        const snapIndexed = time((ms) => {
            drawnPassNear(PASSES, ms, floorMs, toleranceMs, index);
        });
        console.log(
            `reading path: linear ${(linear * 1000).toFixed(2)} us`
            + ` → indexed ${(indexed * 1000).toFixed(2)} us`
            + ` (x${(linear / indexed).toFixed(1)});`
            + ` snap: x${(snapLinear / snapIndexed).toFixed(1)}`
        );
        // The sentence and the snap now cost what the drawing costs: the span,
        // not the window. Before the index they walked all 5760 intervals.
        expect(linear / indexed).toBeGreaterThan(INDEXED_SPEEDUP_MIN);
        expect(snapLinear / snapIndexed).toBeGreaterThan(INDEXED_SPEEDUP_MIN);
    });

    it('allocates no DOM in steady state — the pool is a pool', () => {
        const handle: { current: CoverageLensHandle | null } = { current: null };
        act(() => root?.render(
            <CoverageLens
                ref={(node) => { handle.current = node; }}
                anchorRef={anchorRef}
                lanes={POOL_LANE}
                windowStartMs={EPOCH}
                windowMs={WINDOW_MS}
            />
        ));
        const lens = document.body.querySelector('[data-revisit-lens]') as HTMLElement;
        act(() => { handle.current?.update(EPOCH + HOUR, TRACK_LEFT + 10); });
        const before = lens.querySelectorAll('*').length;

        act(() => {
            for (let i = 0; i < 1000; i += 1) {
                handle.current?.update(EPOCH + (i / 1000) * WINDOW_MS, TRACK_LEFT + i);
            }
        });

        expect(lens.querySelectorAll('*').length).toBe(before);
    });
});

describe('P4 — the ribbon path', () => {
    const STATISTICS = {
        maxGapMs: HOUR, meanGapMs: HOUR, p95GapMs: HOUR, accessCount: PASSES.length,
    } as GapStatistics;
    const LANE: CoverageRibbonTarget = {
        id: 'primary', label: 'Primary · Test', name: 'Test target',
        intervals: PASSES, statistics: STATISTICS, selected: true,
        kind: 'POINT', roleLabel: 'Primary', basisLabel: 'Point',
    };

    it('commits no React render for a pointer sweep across several frames', async () => {
        let commits = 0;
        vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
            left: TRACK_LEFT, width: TRACK_WIDTH, right: TRACK_LEFT + TRACK_WIDTH,
            top: 600, bottom: 628, height: 28, x: TRACK_LEFT, y: 600, toJSON: () => ({}),
        } as DOMRect);

        act(() => root?.render(
            <Profiler id="ribbon" onRender={() => { commits += 1; }}>
                <CoverageRibbon
                    intervals={PASSES}
                    statistics={STATISTICS}
                    targetLanes={[LANE]}
                    windowStartMs={EPOCH}
                    windowHours={WINDOW_HOURS}
                    getTimeMs={() => EPOCH}
                    onSeek={() => undefined}
                    speed={0}
                    onSetSpeed={() => undefined}
                />
            </Profiler>
        ));

        const surface = container.querySelector('[role="slider"]') as HTMLElement;
        const send = (type: string, clientX: number) => {
            const event = new Event(type) as Event & { clientX: number };
            Object.defineProperty(event, 'clientX', { value: clientX });
            surface.dispatchEvent(event);
        };
        const frame = async () => act(async () => {
            await new Promise<void>((r) => requestAnimationFrame(() => r()));
        });

        await frame();
        const before = commits;
        send('pointerenter', TRACK_LEFT);
        for (let f = 0; f < 10; f += 1) {
            for (let i = 0; i < 50; i += 1) {
                send('pointermove', TRACK_LEFT + (f * 50 + i) % TRACK_WIDTH);
            }
            await frame();
        }
        send('pointerleave', 0);
        await frame();

        expect(commits).toBe(before);
    });

    it('cannot touch the globe: nothing on this path reaches Cesium', () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const files = [
            'CoverageRibbon.tsx', 'CoverageLens.tsx', 'passSpans.ts',
            'lensReadings.ts', 'coverageRibbonSnap.ts',
        ];
        for (const file of files) {
            const source = readFileSync(resolve(here, '..', 'ui', file), 'utf8');
            expect(source, `${file} must not import Cesium`).not.toMatch(/from ['"]cesium['"]/);
            // `requestRender` is how this module asks the globe to draw. The
            // lens must never be a reason for a frame.
            expect(source, `${file} must not request a globe render`)
                .not.toMatch(/requestRender/);
        }
    });
});
