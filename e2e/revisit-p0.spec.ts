import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('capacity-analyzer:revisit-session:v1');
  });
  await page.goto('/?mode=revisit');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
});

test.describe('REVISIT P0 demonstration contract', () => {
  test('opens on a business result with the complete OneWeb fleet truth', async ({ page }) => {
    await expect(page.getByText('576 active + 58 spare · 634 total')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Demo result summary' })).toContainText(
      /12 payloads.*worst-case over London.*target 2 h/,
    );
    await expect(page.getByText(/telecom workspace is preserved/i)).toHaveCount(0);
    await expect(page.getByText('Validated model')).toHaveCount(2);
    await expect(page.getByText(/not yet calibrated/i)).toHaveCount(0);
  });

  test('uses a truthful executive envelope and preserves exact topology inspection', async ({ page }) => {
    const curveTab = page.getByRole('button', { name: 'Curve', exact: true });
    if (await curveTab.isVisible()) await curveTab.click();
    await expect(page.getByText('best achieved with up to X payloads')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Minimum tested balanced configuration:/)).toBeVisible();

    await page.getByRole('button', { name: 'Show exact topology points' }).click();
    await expect(page.getByText('exact topology points · lower is better')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show executive envelope' })).toBeVisible();
  });

  test('supports presenter reset and explicit simulation time controls', async ({ page }) => {
    const payloadSlider = page.getByRole('slider', { name: 'Number of hosted payloads' });
    await payloadSlider.press('ArrowRight');
    await expect(page.getByRole('complementary', { name: 'Demo result summary' })).not.toContainText(/^12 payloads/);

    await page.getByRole('button', { name: /^(Reset demo|Reset)$/ }).click();
    await expect(page.getByRole('complementary', { name: 'Demo result summary' })).toContainText(/^12 payloads/);

    const timestamp = page.locator('time');
    const initial = await timestamp.textContent();
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await expect(page.getByRole('button', { name: 'Play simulation' })).toBeVisible();
    await page.getByRole('button', { name: 'Step simulation forward one hour' }).click();
    await expect(timestamp).not.toHaveText(initial ?? '');
    await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('100');
    await expect(page.getByRole('combobox', { name: 'Simulation speed' })).toHaveValue('100');
  });

  test('keeps secondary scene controls out of presenter view and exposes them on demand', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Host fleet' })).toHaveCount(0);
    await page.getByRole('button', { name: /^(Explore controls|Explore)$/ }).click();
    await expect(page.getByRole('button', { name: 'Host fleet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Auto-rotate globe' })).toBeVisible();
    await page.getByRole('button', { name: /^(Presenter view|Present)$/ }).click();
    await expect(page.getByRole('button', { name: 'Host fleet' })).toHaveCount(0);
  });

  test('adds no listeners or timers across repeated presenter and clock interactions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Lifecycle counters are viewport-independent');
    await expect(page.getByText('best achieved with up to X payloads')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());

    for (let cycle = 0; cycle < 5; cycle += 1) {
      await page.getByRole('button', { name: 'Explore controls' }).click();
      await page.getByRole('button', { name: 'Presenter view' }).click();
      await page.getByRole('button', { name: 'Pause simulation' }).click();
      await page.getByRole('button', { name: 'Play simulation' }).click();
    }

    const final = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());
    if (initial && final) {
      expect(final.activeListeners - initial.activeListeners).toBe(0);
      expect(final.activeTimers - initial.activeTimers).toBe(0);
    }
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });
});
