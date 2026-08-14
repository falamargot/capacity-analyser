import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.removeItem('capacity-analyzer:revisit-saved-scenarios:v1');
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
});

test.describe('REVISIT P2a product workflow', () => {
  test('saves, restores and shares a named scenario', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence contract is viewport-independent');
    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    await workspace.getByRole('textbox', { name: 'Scenario name' }).fill('London board demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(workspace.getByRole('status')).toContainText('Saved');

    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Share', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('revisit-london-board-demo.json');

    await page.getByRole('button', { name: 'Close scenario workspace' }).click();
    await page.getByRole('combobox', { name: 'Target' }).selectOption('Singapore');
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('Singapore');
    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    await workspace.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('London');
  });

  test('compares three targets lazily and exports a qualified result PDF', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Export contract is viewport-independent');
    const canvas = page.locator('.cesium-widget canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({ position: { x: box!.width * 0.47, y: box!.height * 0.42 }, modifiers: ['Shift'], force: true });
    await canvas.click({ position: { x: box!.width * 0.54, y: box!.height * 0.44 }, modifiers: ['Shift'], force: true });
    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(comparison.locator('[data-revisit-comparison-row]')).toHaveCount(3, { timeout: 60_000 });
    await expect(comparison).toContainText('London');

    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Point PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^revisit-result-.*\.pdf$/);
    const path = await download.path();
    expect(path).not.toBeNull();
    const pdf = await readFile(path!);
    expect(pdf.byteLength).toBeGreaterThan(5_000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('keeps P2a available in the mobile details flow without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await page.getByRole('button', { name: 'Scenarios' }).click();
    await expect(page.getByRole('dialog', { name: 'Scenario workspace' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Saved scenario workspace' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
