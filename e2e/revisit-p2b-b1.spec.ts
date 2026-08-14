import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.removeItem('capacity-analyzer:revisit-saved-scenarios:v1');
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
});

test.describe('REVISIT P2b-B1 target contexts', () => {
  test('uses plain click for the reference and Shift-click for bounded comparison points', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Pointer contract is viewport-independent');
    const canvas = page.locator('.cesium-widget canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const target = page.getByRole('combobox', { name: 'Target' });
    const before = await target.inputValue();

    await canvas.click({ position: { x: box!.width * 0.48, y: box!.height * 0.43 }, force: true });
    await expect(target).not.toHaveValue(before);
    await expect(page.getByLabel('Active result context')).toContainText('Point analysis');
    const baselineEntityCount = await page.evaluate(() => (
      window as unknown as { __revisitViewer?: { entities: { values: unknown[] } } }
    ).__revisitViewer?.entities.values.length ?? 0);

    await canvas.click({ position: { x: box!.width * 0.55, y: box!.height * 0.45 }, modifiers: ['Shift'], force: true });
    await expect(page.getByRole('tab', { name: 'Points 2' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('Comparison 1', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Add comparison point' }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Points 3' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Comparison 2 target' })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Set comparison 2 location' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove comparison point 2' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Comparison 2 target' }).selectOption('Singapore');
    await expect(page.getByRole('combobox', { name: 'Comparison 2 target' })).toHaveValue('Singapore');
    await expect(page.getByRole('button', { name: 'Add comparison point' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Target comparison' })).toContainText(/Comparing|Worst/);

    // One traced action avoids rasterising the full Cesium canvas twice solely
    // for test instrumentation while still exercising both React handlers.
    await page.evaluate(async () => {
      for (let index = 0; index < 2; index += 1) {
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Remove comparison point 1"]',
        );
        if (!button) throw new Error('Missing comparison-point remove button');
        button.click();
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    });
    await expect(page.getByRole('tab', { name: 'Points 1' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __revisitViewer?: { entities: { values: unknown[] } } }
    ).__revisitViewer?.entities.values.length ?? 0)).toBe(baselineEntityCount);
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });

  test('keeps point and area geometries while exposing one active context', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Context contract is viewport-independent');
    await page.getByRole('tab', { name: 'Area' }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Area' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('button', { name: 'Define area target' }).click({ force: true });
    const area = page.getByRole('region', { name: 'Area coverage' });
    await expect(area).toBeVisible();
    await area.getByText('Paste coordinate list', { exact: true }).click({ force: true });
    await expect(area.getByLabel('Custom area coordinate list')).toBeVisible();
    await area.getByLabel('Custom area coordinate list').fill('49, -2\n49, 2\n51, 2\n51, -2');
    await area.getByRole('button', { name: 'Apply list' }).click();
    await expect(page.getByRole('tab', { name: 'Area' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Active result context')).toContainText('Area analysis');
    await expect(page.getByText('Worst-cell access timeline')).toBeVisible();

    await page.getByRole('tab', { name: 'Points 1' }).click();
    await expect(page.getByLabel('Active result context')).toContainText('Point analysis');
    await page.getByRole('tab', { name: 'Area' }).click();
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('4 vertices');
  });

  test('offers the explicit add-point control on mobile without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await expect(page.getByRole('button', { name: 'Add comparison point' })).toBeVisible();
    await page.getByRole('button', { name: 'Add comparison point' }).click({ force: true });
    await expect(page.getByRole('tab', { name: 'Points 2' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Comparison 1 target' })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Set comparison 1 location' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove comparison point 1' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Comparison 1 target' }).selectOption('Singapore');
    await expect(page.getByRole('combobox', { name: 'Comparison 1 target' })).toHaveValue('Singapore');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
