import { expect, test } from '@playwright/test';

const geoJson = JSON.stringify({
  type: 'Feature',
  properties: { name: 'Channel AOI' },
  geometry: {
    type: 'Polygon',
    coordinates: [[[-2, 49], [2, 49], [2, 51], [-2, 51], [-2, 49]]],
  },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.removeItem('capacity-analyzer:revisit-saved-scenarios:v1');
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
});

test.describe('REVISIT P2b-A custom areas', () => {
  test('imports, validates, runs and restores a GeoJSON polygon', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence contract is viewport-independent');
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    const area = page.getByRole('region', { name: 'Area coverage' });
    await area.getByLabel('Import area GeoJSON').setInputFiles({
      name: 'channel.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(geoJson),
    });
    await expect(area.getByLabel('Custom area name')).toHaveValue('Channel AOI');
    await expect(area.getByLabel('Custom area validation')).toContainText(/Ready · 4 vertices · \d+ cells/);

    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Channel AOI', { timeout: 60_000 });

    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    await workspace.getByLabel('Scenario name').fill('Polygon demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close scenario workspace' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    await area.getByRole('button', { name: 'Remove' }).click();
    await expect(area.getByRole('button', { name: 'Draw on globe' })).toBeVisible();
    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    await workspace.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    await expect(area.getByLabel('Custom area name')).toHaveValue('Channel AOI');
    await expect(area.getByLabel('Custom area validation')).toContainText('Ready');
  });

  test('draws on the globe without moving the point target and cleans preview resources', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Cesium lifecycle contract is viewport-independent');
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    const area = page.getByRole('region', { name: 'Area coverage' });
    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { cesium: { entities: number; primitives: number } | null } }
    ).__memStats?.().cesium);

    await area.getByRole('button', { name: 'Draw on globe' }).click();
    await expect(area).toContainText('Click the globe to add vertices · 0 points');
    const canvas = page.locator('.cesium-widget canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    for (const point of [
      { x: box!.width * 0.42, y: box!.height * 0.42 },
      { x: box!.width * 0.50, y: box!.height * 0.34 },
      { x: box!.width * 0.57, y: box!.height * 0.44 },
    ]) {
      await canvas.click({ position: point, force: true });
    }
    // Globe clicks are part of the editor workflow: the popup must stay open
    // so Finish polygon remains directly accessible.
    await expect(area).toBeVisible();
    await expect(area.getByRole('button', { name: 'Finish polygon' })).toBeVisible();
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('3 vertices');
    await area.getByRole('button', { name: 'Finish polygon' }).click();
    await expect(area.getByLabel('Custom area validation')).toContainText('Ready');
    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Worst cell', { timeout: 60_000 });

    await page.getByRole('tab', { name: 'Points 1' }).click();
    await expect(page.getByRole('combobox', { name: 'Target' })).toHaveValue('London');
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();

    await area.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => page.evaluate(() => (
      window as unknown as { __memStats?: () => { cesium: { entities: number; primitives: number } | null } }
    ).__memStats?.().cesium)).toEqual(initial);
  });

  test('keeps the custom-area editor usable on mobile without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    const area = page.getByRole('region', { name: 'Area coverage' });
    await expect(area.getByRole('button', { name: 'Draw on globe' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
