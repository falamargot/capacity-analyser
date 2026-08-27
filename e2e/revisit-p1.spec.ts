import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, openRevisitAnalysis, openRevisitSetup, openRevisitSurfaces,
  openRevisitDisplayControls,
  seedReferenceTarget,
  openRevisitAnalysisTab, ensureDetailsOpen,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('capacity-analyzer:revisit-session:v1');
    localStorage.removeItem('collapsible:revisit-advanced');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
  // Wait for a sweep-backed result before every test, then hand the compact
  // viewport back to the configuration surface. Since Programme 7B the two
  // cannot be open at once, so each test opens the one it needs.
  await openRevisitAnalysis(page);
  await expect(page.getByLabel('Business comparison')).toBeVisible({ timeout: 30_000 });
  await openRevisitSetup(page);
});

test.describe('REVISIT P1 requirement contract', () => {
  test('keeps one canonical revisit requirement at the top of the active result context', async ({ page }) => {
    await openRevisitAnalysis(page);
    const context = page.getByLabel('Active result context');
    const requirement = page.getByRole('combobox', { name: 'Revisit requirement' });
    await expect(requirement).toHaveCount(1);
    await expect(context.getByRole('combobox', { name: 'Revisit requirement' })).toHaveValue('7200000');

    await requirement.selectOption('3600000');
    // The requirement now reads back from the customer result card rather than
    // the KPI verdict badge, which kept only the exceptional states when the
    // pass/fail pair moved beside the recommendation (Programme 7A).
    const card = page.getByRole('region', { name: 'Customer result' });
    await expect(card).toContainText('at least every 1 h');
    await expect(card).toContainText('Customer requirement');

    // Adding the Area happens on the configuration surface, which on a phone
    // is now the panel that closes the analysis column. Reopen it to read the
    // requirement back: the point of the assertion is that there is still only
    // ONE requirement and it survived the context change.
    await addSecondaryArea(page);
    await openRevisitAnalysis(page);
    await expect(context.getByRole('combobox', { name: 'Revisit requirement' })).toHaveValue('3600000');
    await expect(page.getByRole('combobox', { name: 'Area requirement' })).toHaveCount(0);
  });

  test('exposes truthful instrument presets without a demo workflow', async ({ page }, testInfo) => {
    const instrument = page.getByRole('combobox', { name: 'Instrument preset' });
    await expect(instrument).toHaveValue('STANDARD');
    await expect(page.getByText('Illustrative IR preset · not an instrument datasheet')).toBeVisible();

    await instrument.selectOption('WIDE');
    await expect(instrument).toHaveValue('WIDE');
    await openRevisitAnalysisTab(page, 'Analysis');
    await ensureDetailsOpen(page.locator('details', { hasText: 'Result drivers' }).first());
    await page.locator('summary', { hasText: 'Technical details' }).click();
    await expect(page.getByRole('button', { name: /Swath 1400 km/ })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
    await expect(page.getByText(/demo (story|workflow)/i)).toHaveCount(0);
  });

  test('explains the business drivers first and keeps routine engineering checks secondary', async ({ page }, testInfo) => {
    await openRevisitAnalysisTab(page, 'Analysis');
    const panel = page.getByRole('region', { name: 'REVISIT analysis' });
    const drivers = panel.locator('details', { hasText: 'Result drivers' }).first();
    await ensureDetailsOpen(drivers);
    await expect(panel.getByText('What drives this result', { exact: true })).toBeVisible();
    await expect(panel.getByText('Payload distribution', { exact: true })).toBeVisible();
    await expect(panel.getByText('Observation opportunities', { exact: true })).toBeVisible();
    await expect(panel.getByText(/^(Main lever|Analysis pending)$/)).toBeVisible();

    // The default near-polar constellation reaches 90°, so "target reachable"
    // would be a tautology rather than useful presenter evidence.
    await expect(panel.getByText('Target reachable', { exact: true })).toHaveCount(0);
    /*
     * Match the disclosure by its OWN summary, not by `hasText`. `Technical
     * details` is nested inside `Result drivers`, so a text filter resolves to
     * both the inner disclosure and every ancestor containing it — a strict-mode
     * violation rather than an assertion.
     */
    const technical = panel.locator('details').filter({
      has: page.locator('> summary', { hasText: 'Technical details' }),
    });
    await expect(technical).toHaveCount(1);
    await expect(technical).not.toHaveAttribute('open', '');
    await technical.locator('summary').click();
    await expect(technical.getByRole('button', { name: /Geometry/ })).toBeVisible();
    await expect(technical.getByRole('button', { name: /Swath/ })).toBeVisible();
    await expect(technical.getByRole('button', { name: /Phasing/ })).toBeVisible();
  });

  test('accepts bounded coordinates and reports topology changes', async ({ page }) => {
    await page.getByRole('button', { name: 'Set reference target location' }).click();
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

    await page.getByRole('button', { name: 'Set reference target location' }).click();
    await page.getByRole('textbox', { name: 'Search reference target location' }).fill('Toulouse');
    await page.getByRole('button', { name: /Toulouse, Haute-Garonne/ }).click();

    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('Toulouse, Haute-Garonne');
    await expect(page.getByText('43.60° · 1.44°', { exact: true })).toBeVisible();
  });

  test('stages complete advanced geometry before one recomputation', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile header menu gives deterministic access to advanced inputs');
    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await expect(settings).toBeVisible();
    // Instrument geometry lives behind `Expert settings` since Programme 7E.
    await settings.locator('.revisit-expert-settings summary').click();

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
    await openRevisitDisplayControls(page);
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
    await openRevisitAnalysis(page);
    const panel = page.getByRole('region', { name: 'REVISIT analysis' });
    // The customer result card absorbed the KPI headline: embedded, the KPI
    // block contributes only the secondary metrics row, so the maximum gap is
    // read from the card — which is the figure this test is about.
    await expect(panel.getByRole('region', { name: 'Customer result' }))
      .toContainText('Maximum revisit gap');
    await expect(panel.locator('.revisit-kpi-secondary')).toContainText('Average revisit');
    const comparison = panel.getByLabel('Business comparison');
    // Gated on the sweep's own `isSweeping` flag, not the much faster
    // single-scenario analysis, so it is not guaranteed inside the default
    // assertion budget: the panel correctly shows "Measuring payload
    // comparisons…" until the sweep resolves, rather than a premature answer.
    // The 1-payload baseline needs the whole ladder walked and lands last.
    await expect(comparison).toContainText(/Vs 1 payload:/, { timeout: 30_000 });
    // `To target: +N payloads` moved to the customer result card, beside the
    // control that applies it (Programme 7A).
    await expect(comparison).not.toContainText(/To target:/);
  });
});
