import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, addSecondaryPoint, openRevisitSurfaces, pasteAreaBoundary, seedReferenceTarget,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.removeItem('capacity-analyzer:revisit-saved-scenarios:v1');
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

test.describe('REVISIT P2b-B1 target contexts', () => {
  test('uses plain click for the primary and Shift-click for bounded secondary targets', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Pointer contract is viewport-independent');
    const canvas = page.locator('.cesium-widget canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const target = page.getByRole('combobox', { name: 'Target', exact: true });
    const before = await target.inputValue();

    await canvas.click({ position: { x: box!.width * 0.48, y: box!.height * 0.43 }, force: true });
    await expect(target).not.toHaveValue(before);
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Primary target');
    const baselineEntityCount = await page.evaluate(() => (
      window as unknown as { __revisitViewer?: { entities: { values: unknown[] } } }
    ).__revisitViewer?.entities.values.length ?? 0);

    await canvas.click({ position: { x: box!.width * 0.55, y: box!.height * 0.45 }, modifiers: ['Shift'], force: true });
    await expect(page.getByText('Secondary target', { exact: true })).toBeVisible();

    const comparison = page.getByRole('combobox', { name: 'Secondary target', exact: true });
    const firstComparison = await comparison.inputValue();
    await canvas.click({ position: { x: box!.width * 0.62, y: box!.height * 0.48 }, modifiers: ['Shift'], force: true });
    await expect(comparison).not.toHaveValue(firstComparison);
    await expect(page.getByRole('button', { name: 'Add secondary target' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Target comparison' })).toContainText('Maximum gap');

    // One traced action avoids rasterising the full Cesium canvas twice solely
    // for test instrumentation while still exercising both React handlers.
    await page.getByRole('button', { name: 'Remove secondary target' }).click();
    await expect(page.getByText('Secondary target', { exact: true })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (
      window as unknown as { __revisitViewer?: { entities: { values: unknown[] } } }
    ).__revisitViewer?.entities.values.length ?? 0)).toBe(baselineEntityCount);
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });

  test('keeps point and area geometries while exposing one active context', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Context contract is viewport-independent');
    await addSecondaryArea(page);
    await expect(page.getByRole('button', { name: /Select secondary target polygon/ })).toHaveAttribute('aria-pressed', 'true');
    const area = page.getByRole('region', { name: 'Area coverage' });
    await expect(area).toBeVisible();
    await pasteAreaBoundary(area, '49, -2\n49, 2\n51, 2\n51, -2');
    await expect(page.getByRole('button', { name: /Select secondary target polygon/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Active result context')).toContainText('Area result');
    await expect(page.getByText('Observation schedule comparison')).toBeVisible();
    await expect(page.getByText('Point lanes + Area worst-cell lane')).toBeVisible();

    await page.getByRole('button', { name: /Primary target/ }).click();
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Primary target');
    await page.getByRole('button', { name: /Select secondary target polygon/ }).click();
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('4 vertices');
  });

  test('offers the explicit add-point control on mobile without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await expect(page.getByRole('button', { name: 'Add secondary target' })).toBeVisible();
    await addSecondaryPoint(page);
    await expect(page.getByRole('combobox', { name: 'Secondary target', exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Set secondary target location' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove secondary target' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await expect(page.getByRole('combobox', { name: 'Secondary target', exact: true })).toHaveValue('Singapore');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
