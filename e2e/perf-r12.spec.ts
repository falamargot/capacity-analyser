import { expect, test } from '@playwright/test';
import { openRevisitSurfaces, seedReferenceTarget } from './revisitCompact';

/*
 * R12 — the 60 fps target, made one command instead of a console ritual.
 *
 *     PERF_R12=1 npx playwright test perf-r12 --project=desktop-chromium --headed
 *
 * OPT-IN: skipped unless PERF_R12 is set, so it never runs in a normal suite.
 * It is a MEASUREMENT, not a gate — it asserts nothing about the numbers,
 * because a frame rate is a property of the machine it was measured on.
 *
 * ── RUN IT HEADED, AND HERE IS WHY ──────────────────────────────────────────
 * Headless Chromium has no compositor: rAF is throttled to ~6.5 fps (measured
 * 2026-09-04: p50 152 ms) and WebGL falls back to SwiftShader, a software
 * rasteriser. Both numbers would be the harness's, not the app's. `--headed`
 * gives a real window, a real vsync and the real GPU.
 *
 * Reads the app's own dev profiler (`utils/runtimeProfiler.ts`), which is why
 * this needs a DEV build — the profiler is stripped from production.
 *
 * ── IT ASSERTS ITS PRECONDITIONS, AND ONLY THOSE ────────────────────────────
 * The first version of this spec passed while measuring nothing: REVISIT opens
 * with NO target, so there is no timeline, no Play button and no speed
 * selector — the clock never started, Cesium rendered 0 frames, and the 59 fps
 * it reported was an empty rAF loop. A run that measures nothing must FAIL, so
 * the target, the running clock and a non-zero frame count are now assertions.
 * The frame rate itself is never asserted: that is a property of the machine.
 */

const QUIET_MS = 20_000;

test.describe('R12 — REVISIT frame rate', () => {
  test('measures fps with the fleet in motion', async ({ page }, testInfo) => {
    test.skip(!process.env.PERF_R12, 'Measurement, not a gate: set PERF_R12=1 to run');
    test.skip(testInfo.project.name !== 'desktop-chromium', 'One viewport is the measurement');
    test.setTimeout(240_000);

    await page.goto('/?mode=revisit');
    await expect(page.getByRole('button', { name: /Back to / })).toBeVisible({ timeout: 60_000 });
    await openRevisitSurfaces(page);
    // Without a target there is no access lane, hence no timeline and no clock
    // controls at all. This is the step whose absence made the first run
    // measure an idle app.
    await seedReferenceTarget(page);
    // Tiles, fleet and first analysis, before the sample window opens.
    await page.waitForTimeout(20_000);

    const scene = await page.evaluate(() => {
      const v = (window as unknown as { __revisitViewer?: any }).__revisitViewer;
      const gl = v?.scene?.context?._gl;
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      const prims: Array<{ type: string; len: number | null }> = [];
      for (let i = 0; i < (v?.scene?.primitives?.length ?? 0); i++) {
        const c = v.scene.primitives.get(i);
        prims.push({ type: c.constructor.name, len: c.length ?? null });
      }
      return {
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
        canvas: [v?.scene?.canvas?.width, v?.scene?.canvas?.height],
        dpr: window.devicePixelRatio,
        requestRenderMode: v?.scene?.requestRenderMode,
        visibility: document.visibilityState,
        prims,
      };
    });
    console.log('R12 scene   ' + JSON.stringify(scene));

    /*
     * A STATIC REVISIT SCENE RENDERS NOTHING — `requestRenderMode` is on and
     * nothing requests a frame, so a quiet window reports 0 fps and that is the
     * design working. Put the clock in motion first: that is the state the
     * 60 fps target is actually about.
     */
    const speed = page.getByRole('combobox', { name: 'Simulation speed' });
    await expect(speed, 'no speed control — the scenario has no timeline').toBeVisible({ timeout: 30_000 });
    await speed.selectOption('100');
    const play = page.getByRole('button', { name: 'Play simulation' });
    if (await play.count() > 0 && await play.isVisible()) await play.click();
    await expect(
      page.getByRole('button', { name: 'Pause simulation' }),
      'the clock is not running, so nothing would move',
    ).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(3_000);

    /*
     * Do NOT read `viewer.clock` here. REVISIT drives scenario time through
     * `SimulationClockContext`, not Cesium's clock, so `shouldAnimate` is false
     * even while playback runs — an earlier version of this spec logged that
     * and read it as "the clock is not running". The Pause button above is the
     * real signal.
     */

    await page.evaluate(() => (window as unknown as { __perfReset?: () => void }).__perfReset?.());
    await page.waitForTimeout(QUIET_MS);
    const stats = await page.evaluate(
      () => (window as unknown as { __perfStats?: () => unknown }).__perfStats?.(),
    ) as { frame?: Record<string, unknown> } | undefined;
    const frame = stats?.frame as {
      frames?: number;
      fps?: number;
      frameMs?: { p50?: number };
      renderMs?: { p50?: number; p95?: number };
    } | undefined;
    console.log('R12 profiler ' + JSON.stringify(frame));
    /*
     * READ THESE TWO TOGETHER — it is the whole point of R12b.
     *   frameMs  = the INTERVAL between frames, i.e. the cadence.
     *   renderMs = what ONE frame cost, preRender → postRender.
     * A 32 ms interval with a 3 ms render means nothing is slow and the app
     * simply is not asking for more frames — a cadence choice, not an
     * optimisation problem. A 32 ms interval with a 30 ms render is the
     * opposite, and only then is there something to make faster.
     */
    const interval = frame?.frameMs?.p50 ?? 0;
    const cost = frame?.renderMs?.p50 ?? 0;
    console.log(
      `R12 verdict  interval p50=${interval.toFixed(1)}ms  render p50=${cost.toFixed(1)}ms`
      + `  -> ${cost > interval * 0.6 ? 'FRAME COST BOUND (optimise)' : 'CADENCE BOUND (nothing is slow)'}`,
    );
    // The whole point of the run. Zero frames means the sample window saw a
    // static scene — inconclusive, and it must not read as a pass.
    expect(
      (stats?.frame as { frames?: number } | undefined)?.frames ?? 0,
      'Cesium rendered no frames: the scene was static, so this run measured nothing',
    ).toBeGreaterThan(0);

    // Independent of the app's counter: the browser's own rAF cadence.
    const raf = await page.evaluate(async () => {
      const t: number[] = [];
      let last = performance.now();
      await new Promise<void>((res) => {
        const tick = () => {
          const now = performance.now();
          t.push(now - last);
          last = now;
          if (t.length >= 300) return res();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        setTimeout(res, 10_000);
      });
      t.shift();
      t.sort((a, b) => a - b);
      const q = (p: number) => t[Math.min(t.length - 1, Math.floor(p * t.length))];
      return {
        frames: t.length,
        fps: +(1000 / q(0.5)).toFixed(1),
        p50: +q(0.5).toFixed(2),
        p95: +q(0.95).toFixed(2),
        max: +t[t.length - 1].toFixed(2),
      };
    });
    console.log('R12 rAF      ' + JSON.stringify(raf));
    /*
     * Read the two together. `rAF` is what the BROWSER offers — at vsync it is
     * ~16.7 ms whatever the app does, so it is the harness's ceiling, not a
     * result. The app's frame rate is the profiler's `fps` / `frameMs.p95`,
     * counted from frames Cesium actually rendered.
     */
  });
});
