import { expect, test } from '@playwright/test';
import {
  isCompactViewport, openRevisitStageControls, openRevisitSurfaces,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('capacity-analyzer:revisit-session:v1');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
});

test.describe('REVISIT P0 demonstration contract', () => {
  test('opens on a business result with the complete OneWeb fleet truth', async ({ page }) => {
    await expect(page.getByText('576 active + 58 spare · 634 total')).toBeVisible();
    await expect(page.getByText('Demo story')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
    await expect(page.getByText(/telecom workspace is preserved/i)).toHaveCount(0);
    await expect(page.getByText('Validated model')).toHaveCount(1);
    await expect(page.getByText(/not yet calibrated/i)).toHaveCount(0);

    await page.getByRole('button', { name: 'Open model and validation' }).click();
    const modelValidation = page.getByRole('dialog', { name: 'Model & validation' });
    await expect(modelValidation.getByRole('button', { name: 'Calibrate vs OneWeb' })).toBeVisible();
    await expect(modelValidation).toContainText('Propagation cross-checked vs NASA GMAT');

    await page.getByRole('button', { name: 'Advanced constellation settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await expect(modelValidation).toHaveCount(0);
    await expect(settings.getByText('Model & validation')).toHaveCount(0);
    await expect(settings.getByRole('button', { name: 'Calibrate vs OneWeb' })).toHaveCount(0);
    await expect(page.locator('.revisit-model-provenance')).toHaveCount(0);
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
    await openRevisitStageControls(page);
    const payloadSlider = page.getByRole('slider', { name: 'Number of hosted payloads' });
    await payloadSlider.press('ArrowRight');
    await expect(payloadSlider).not.toHaveAttribute('aria-valuetext', '12 payloads');

    await page.getByRole('button', { name: /^(Reset scenario|Reset)$/ }).click();
    await expect(payloadSlider).toHaveAttribute('aria-valuetext', '12 payloads');

    const timestamp = page.locator('time');
    const initial = await timestamp.textContent();
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await expect(page.getByRole('button', { name: 'Play simulation' })).toBeVisible();
    // Hour stepping is a `sm`-and-up affordance; on a phone the same seek is
    // done on the timeline itself, which is keyboard-operable everywhere.
    if (isCompactViewport(page)) {
      await page.getByRole('slider', { name: /Seek within the .* analysis window/ })
        .press('ArrowRight');
    } else {
      await page.getByRole('button', { name: 'Step simulation forward one hour' }).click();
    }
    await expect(timestamp).not.toHaveText(initial ?? '');
    await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('100');
    await expect(page.getByRole('combobox', { name: 'Simulation speed' })).toHaveValue('100');
  });

  test('keeps secondary scene controls out of presenter view and exposes them on demand', async ({ page }) => {
    await openRevisitStageControls(page);
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
    // Cesium initializes its shared label/glyph infrastructure asynchronously
    // even while labels are off. Let that one-time work settle before measuring
    // repeated P0 interactions; the P1 gate separately warms and measures labels.
    await page.waitForTimeout(3_000);
    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());

    // Keep this a single browser action. Per-click trace snapshots rasterise the
    // complete Cesium canvas and can make the instrumentation gate exceed its
    // timeout without reflecting application cost.
    await page.evaluate(async () => {
      const clickNamed = (name: string) => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.includes(name));
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing ${name} button`);
        button.click();
      };
      const commit = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      for (let cycle = 0; cycle < 5; cycle += 1) {
        clickNamed('Explore controls');
        await commit();
        clickNamed('Presenter view');
        await commit();
        clickNamed('Pause');
        await commit();
        clickNamed('Play');
        await commit();
      }
    });

    const final = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());
    if (initial && final) {
      expect(final.activeListeners - initial.activeListeners).toBeLessThanOrEqual(0);
      expect(final.activeTimers - initial.activeTimers).toBeLessThanOrEqual(0);
    }
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });
});
