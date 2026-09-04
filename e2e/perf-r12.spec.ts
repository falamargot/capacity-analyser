import { expect, test } from '@playwright/test';

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
 */

const QUIET_MS = 20_000;

test.describe('R12 — REVISIT frame rate', () => {
  test('measures fps with the fleet in motion', async ({ page }, testInfo) => {
    test.skip(!process.env.PERF_R12, 'Measurement, not a gate: set PERF_R12=1 to run');
    test.skip(testInfo.project.name !== 'desktop-chromium', 'One viewport is the measurement');
    test.setTimeout(240_000);

    await page.goto('/?mode=revisit');
    await expect(page.getByRole('button', { name: /Back to / })).toBeVisible({ timeout: 60_000 });
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
    if (await speed.count() > 0) await speed.selectOption('100');
    const play = page.getByRole('button', { name: 'Play simulation' });
    if (await play.count() > 0 && await play.isVisible()) await play.click();
    await page.waitForTimeout(3_000);

    await page.evaluate(() => (window as unknown as { __perfReset?: () => void }).__perfReset?.());
    await page.waitForTimeout(QUIET_MS);
    const stats = await page.evaluate(
      () => (window as unknown as { __perfStats?: () => unknown }).__perfStats?.(),
    ) as { frame?: Record<string, unknown> } | undefined;
    console.log('R12 profiler ' + JSON.stringify(stats?.frame));

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
  });
});
