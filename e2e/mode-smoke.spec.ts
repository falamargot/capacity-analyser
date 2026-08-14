import { expect, test } from '@playwright/test';

const waitForTelecomShell = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('button', { name: 'Revisit', exact: true })).toBeVisible({ timeout: 30_000 });
};

test.describe('application mode shell', () => {
  test('opens every mode with one Cesium viewer', async ({ page }) => {
    await page.goto('/');
    await waitForTelecomShell(page);

    await expect(page.getByRole('button', { name: /^(Eng|Engineering)$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);

    await page.getByRole('button', { name: /^(Comm|Commercial)$/ }).click();
    await expect(page.getByRole('button', { name: /^(Comm|Commercial)$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);

    await page.getByRole('button', { name: 'Revisit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to Commercial', exact: false })).toBeVisible();
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });

  test('can return from revisit to the originating mode', async ({ page }) => {
    await page.goto('/');
    await waitForTelecomShell(page);
    await page.getByRole('button', { name: /^(Comm|Commercial)$/ }).click();
    await page.getByRole('button', { name: 'Revisit', exact: true }).click();
    await page.getByRole('button', { name: 'Back to Commercial', exact: false }).click();

    await waitForTelecomShell(page);
    await expect(page.getByRole('button', { name: /^(Comm|Commercial)$/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });

  test('keeps telecom navigation state through a REVISIT round trip', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'State persistence is viewport-independent');
    await page.goto('/?mode=engineering');
    await waitForTelecomShell(page);
    const geoScope = page.getByRole('button', { name: 'GEO satellite scope' }).first();
    await geoScope.click();
    await expect(geoScope).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Revisit', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to Engineering', exact: false })).toBeVisible();
    const capturedCamera = await page.evaluate(() => {
      const raw = sessionStorage.getItem('capacity-analyzer:telecom-session:v1');
      return raw ? (JSON.parse(raw) as { camera?: unknown }).camera : null;
    });
    expect(capturedCamera).not.toBeNull();
    await page.getByRole('button', { name: 'Back to Engineering', exact: false }).click();

    await waitForTelecomShell(page);
    await expect(page.getByRole('button', { name: 'GEO satellite scope' }).first()).toHaveAttribute('aria-pressed', 'true');
  });

  test('restores an independent REVISIT scenario', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'State persistence is viewport-independent');
    await page.goto('/?mode=revisit');
    await expect(page.getByRole('combobox', { name: 'Target' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('combobox', { name: 'Target' }).selectOption({ label: 'Singapore' });
    await page.getByRole('button', { name: 'Back to Engineering', exact: false }).click();
    await waitForTelecomShell(page);
    await page.getByRole('button', { name: 'Revisit', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('Singapore');
  });
});

test.describe('desktop history and lifecycle', () => {
  test('supports direct URLs and browser history', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop lifecycle gate');
    await page.goto('/?mode=engineering');
    await waitForTelecomShell(page);
    await page.getByRole('button', { name: /^(Comm|Commercial)$/ }).click();
    await expect(page).toHaveURL(/mode=commercial/);
    await page.getByRole('button', { name: 'Revisit', exact: true }).click();
    await expect(page).toHaveURL(/mode=revisit/);

    await page.goBack();
    await waitForTelecomShell(page);
    await expect(page.getByRole('button', { name: /^(Comm|Commercial)$/ })).toHaveAttribute('aria-pressed', 'true');
    await page.goBack();
    await waitForTelecomShell(page);
    await expect(page.getByRole('button', { name: /^(Eng|Engineering)$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps one viewer and bounded lifecycle counters across 20 transitions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop lifecycle gate');
    test.setTimeout(300_000);
    await page.goto('/?mode=engineering');
    await waitForTelecomShell(page);
    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    const initial = await page.evaluate(() => (window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number; listenerBreakdown?: Record<string, number> } }).__memStats?.());

    for (let cycle = 0; cycle < 10; cycle += 1) {
      await page.getByRole('button', { name: 'Revisit', exact: true }).click();
      await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __simulationClockAuthorities?: number }).__simulationClockAuthorities)).toBe(1);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __capacityModeMetrics?: unknown[] }).__capacityModeMetrics?.length ?? 0)).toBe(cycle * 2 + 1);
      await page.getByRole('button', { name: 'Back to Engineering', exact: false }).click();
      await waitForTelecomShell(page);
      await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __capacityModeMetrics?: unknown[] }).__capacityModeMetrics?.length ?? 0)).toBe(cycle * 2 + 2);
    }

    await page.evaluate(() => (window as unknown as { gc?: () => void }).gc?.());
    const result = await page.evaluate(() => ({
      stats: (window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number; listenerBreakdown?: Record<string, number> } }).__memStats?.(),
      metrics: (window as unknown as { __capacityModeMetrics?: Array<{ durationMs: number }> }).__capacityModeMetrics ?? [],
    }));
    expect(result.metrics).toHaveLength(20);
    expect(result.metrics.every((metric) => metric.durationMs < 10_000)).toBe(true);
    expect(await page.locator('.cesium-widget canvas').count()).toBe(1);
    console.log('[mode-transition-budget]', JSON.stringify({
      maxDurationMs: Math.max(...result.metrics.map((metric) => metric.durationMs)),
      listenerDelta: initial && result.stats ? result.stats.activeListeners - initial.activeListeners : null,
      timerDelta: initial && result.stats ? result.stats.activeTimers - initial.activeTimers : null,
      listenerBreakdown: result.stats?.listenerBreakdown,
      heapDeltaMB: initial && result.stats && 'heap' in initial && 'heap' in result.stats
        ? ((result.stats as { heap?: { usedMB: number } | null }).heap?.usedMB ?? 0) - ((initial as { heap?: { usedMB: number } | null }).heap?.usedMB ?? 0)
        : null,
    }));
    if (initial && result.stats) {
      expect(result.stats.activeListeners - initial.activeListeners).toBeLessThan(50);
      expect(result.stats.activeTimers - initial.activeTimers).toBeLessThan(20);
      if ('heap' in initial && 'heap' in result.stats) {
        const initialHeap = (initial as { heap?: { usedMB: number } | null }).heap;
        const finalHeap = (result.stats as { heap?: { usedMB: number } | null }).heap;
        if (initialHeap && finalHeap) expect(finalHeap.usedMB - initialHeap.usedMB).toBeLessThan(40);
      }
    }
  });
});

test.describe('responsive REVISIT shell', () => {
  test('has no horizontal overflow and keeps interactive controls in the viewport', async ({ page }) => {
    await page.goto('/?mode=revisit');
    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
    const dismissNotice = page.getByRole('button', { name: 'Dismiss REVISIT scenario notice' });
    if (await dismissNotice.isVisible()) await dismissNotice.click();

    const layout = await page.evaluate(() => {
      const visibleControls = [...document.querySelectorAll<HTMLElement>('button, select, input, [tabindex]')]
        .filter((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        outOfBounds: visibleControls.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.left < -1 || rect.right > window.innerWidth + 1;
        }).map((element) => element.getAttribute('aria-label') || element.textContent?.trim()).slice(0, 10),
      };
    });

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.outOfBounds).toEqual([]);
  });

  test('keeps the scenario rail flush to the top and the globe below it', async ({ page }) => {
    await page.goto('/?mode=revisit');
    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
    const dismissNotice = page.getByRole('button', { name: 'Dismiss REVISIT scenario notice' });
    if (await dismissNotice.isVisible()) await dismissNotice.click();

    const layout = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>('[data-global-app-header]')!;
      const context = document.querySelector<HTMLElement>('[data-revisit-context-bar]')!;
      const stage = document.querySelector<HTMLElement>('.revisit-stage')!;
      const headerRect = header.getBoundingClientRect();
      const contextRect = context.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return {
        headerTop: headerRect.top,
        contextTopGap: contextRect.top - headerRect.top,
        contextInHeader: contextRect.top >= headerRect.top && contextRect.bottom <= headerRect.bottom,
        stageStartsAfterHeader: stageRect.top >= headerRect.bottom - 1,
        stageHeight: stageRect.height,
      };
    });

    expect(layout.headerTop).toBe(0);
    expect(layout.contextTopGap).toBeLessThan(20);
    expect(layout.contextInHeader).toBe(true);
    expect(layout.stageStartsAfterHeader).toBe(true);
    expect(layout.stageHeight).toBeGreaterThan(260);
  });

  test('preserves a usable globe stage at ultra-wide low height', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'short-wide-chromium', 'Dedicated low-height regression gate');
    await page.setViewportSize({ width: 2048, height: 320 });
    await page.addInitScript(() => localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed'));
    await page.goto('/?mode=revisit');

    const stage = page.locator('.revisit-stage');
    await expect(stage).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible();
    expect(await stage.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(180);
    await expect(page.getByRole('button', { name: /Back to / })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'Number of hosted payloads' })).toBeVisible();
  });
});
