import { expect, test } from '@playwright/test';
import { openRevisitSurfaces } from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('capacity-analyzer:revisit-session:v1');
    localStorage.removeItem('collapsible:revisit-advanced');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  await expect(page.getByLabel('Business comparison')).toBeVisible({ timeout: 30_000 });
});

test.describe('REVISIT P1 requirement contract', () => {
  test('keeps one canonical revisit requirement at the top of the active result context', async ({ page }) => {
    const context = page.getByLabel('Active result context');
    const requirement = page.getByRole('combobox', { name: 'Revisit requirement' });
    await expect(requirement).toHaveCount(1);
    await expect(context.getByRole('combobox', { name: 'Revisit requirement' })).toHaveValue('7200000');

    await requirement.selectOption('3600000');
    await expect(page.locator('.revisit-kpi-verdict')).toContainText(/1 H REQUIREMENT/);

    await page.getByRole('tab', { name: 'Area' }).click();
    await expect(context.getByRole('combobox', { name: 'Revisit requirement' })).toHaveValue('3600000');
    await expect(page.getByRole('combobox', { name: 'Area requirement' })).toHaveCount(0);
  });

  test('exposes truthful instrument presets without a demo workflow', async ({ page }, testInfo) => {
    const instrument = page.getByRole('combobox', { name: 'Instrument preset' });
    await expect(instrument).toHaveValue('STANDARD');
    await expect(page.getByText('Illustrative IR preset · not an instrument datasheet')).toBeVisible();

    await instrument.selectOption('WIDE');
    await expect(instrument).toHaveValue('WIDE');
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByRole('button', { name: 'Details', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: /Swath 1400 km/ })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
    await expect(page.getByText(/demo (story|workflow)/i)).toHaveCount(0);
  });

  test('accepts bounded coordinates and reports topology changes', async ({ page }) => {
    await page.getByRole('button', { name: 'Set reference location' }).click();
    await page.getByRole('textbox', { name: 'Target latitude' }).fill('48,8566');
    await page.getByRole('textbox', { name: 'Target longitude' }).fill('2,3522');
    await page.getByRole('button', { name: 'Apply coordinates' }).click();
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('48.86°N 2.35°E');
    await expect(page.getByRole('combobox', { name: 'Target' }).locator('option:checked'))
      .toHaveText('Custom point');

    const topologyBefore = await page.locator('.revisit-spread-note').innerText();
    await page.getByRole('slider', { name: 'Number of hosted payloads' }).press('ArrowRight');
    await expect(page.locator('.revisit-spread-note')).not.toHaveText(topologyBefore);
    await expect(page.locator('.revisit-spread-note')).toContainText(/planes × \d+ per plane/);
  });

  test('searches a named place with the same interaction pattern as ENG and COMM', async ({ page }) => {
    await page.route('https://nominatim.openstreetmap.org/search**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
          display_name: 'Toulouse, Haute-Garonne, France',
          lat: '43.6045',
          lon: '1.4440',
        }]),
      });
    });

    await page.getByRole('button', { name: 'Set reference location' }).click();
    await page.getByRole('textbox', { name: 'Search reference location' }).fill('Toulouse');
    await page.getByRole('button', { name: /Toulouse, Haute-Garonne/ }).click();

    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('Toulouse, Haute-Garonne');
    await expect(page.getByText('43.60° · 1.44°', { exact: true })).toBeVisible();
  });

  test('stages complete advanced geometry before one recomputation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile header menu gives deterministic access to advanced inputs');
    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Advanced constellation settings' })).toBeVisible();

    await page.getByRole('combobox', { name: 'FOV shape' }).selectOption('RECTANGLE');
    await page.getByRole('spinbutton', { name: 'Along-track bias' }).fill('4', { force: true });
    await page.getByRole('spinbutton', { name: 'Cross-track bias' }).fill('-2', { force: true });
    await page.getByRole('spinbutton', { name: 'FOV clocking' }).fill('15', { force: true });
    await page.getByRole('checkbox', { name: 'Enable elevation mask' }).check();
    await page.getByRole('spinbutton', { name: 'Minimum elevation' }).fill('5', { force: true });

    await expect(page.getByRole('combobox', { name: 'Instrument preset' })).toHaveValue('STANDARD');
    await expect(page.getByText(/Changes are staged locally/)).toBeVisible();
    await page.getByRole('button', { name: 'Apply geometry' }).click();
    await expect(page.getByRole('combobox', { name: 'Instrument preset' })).toHaveValue('CUSTOM');
  });

  test('keeps labels opt-in, bounded and lifecycle-neutral', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Lifecycle counters are viewport-independent');
    await page.getByRole('button', { name: 'Explore controls' }).click();
    const labels = page.getByRole('button', { name: 'Satellite labels' });
    await expect(labels).toHaveAttribute('aria-pressed', 'false');

    // Warm the bounded Cesium glyph atlas once, then measure repeated toggles.
    await labels.click({ force: true });
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
    const renderedLabels = await page.evaluate(() => {
      const viewer = (window as unknown as { __revisitViewer?: {
        scene: { primitives: { length: number; get: (index: number) => unknown } };
      } }).__revisitViewer;
      if (!viewer) return null;
      for (let index = 0; index < viewer.scene.primitives.length; index += 1) {
        const primitive = viewer.scene.primitives.get(index) as { constructor?: { name?: string }; length?: number };
        if (primitive?.constructor?.name === 'LabelCollection') return primitive.length ?? 0;
      }
      return null;
    });
    if (renderedLabels !== null) {
      expect(renderedLabels).toBeGreaterThan(0);
      expect(renderedLabels).toBeLessThanOrEqual(96);
    }
    await labels.click({ force: true });
    await page.waitForTimeout(500);

    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await labels.click({ force: true });
      await expect(labels).toHaveAttribute('aria-pressed', 'true');
      await labels.click({ force: true });
      await expect(labels).toHaveAttribute('aria-pressed', 'false');
    }
    await page.waitForTimeout(500);

    const final = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());
    if (initial && final) {
      expect(final.activeListeners - initial.activeListeners).toBeLessThanOrEqual(0);
      expect(final.activeTimers - initial.activeTimers).toBeLessThanOrEqual(0);
    }
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
    await expect(page.locator('.cesium-widget-errorPanel')).toHaveCount(0);
  });

  test('retains worst-case while adding the business comparison', async ({ page }) => {
    const panel = page.getByRole('region', { name: 'REVISIT analysis' });
    await expect(panel.getByText('Worst case', { exact: true })).toBeVisible();
    const comparison = panel.getByLabel('Business comparison');
    // The target count resolves from the envelope as soon as the sweep produces a
    // qualifying point.
    await expect(comparison).toContainText(/To target:/);
    // The 1-payload baseline needs the whole ladder walked, so it lands later than
    // the default assertion budget. It is no longer narrated as "awaiting" while
    // absent, so the wait has to be explicit here instead.
    await expect(comparison).toContainText(/Vs 1 payload:/, { timeout: 30_000 });
  });
});
