import { expect, test } from '@playwright/test';
import { addSecondaryArea, openRevisitSurfaces,
  seedReferenceTarget,
} from './revisitCompact';

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
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

test.describe('REVISIT P2b-A custom areas', () => {
  test('imports, validates, runs and restores a GeoJSON polygon', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence contract is viewport-independent');
    await addSecondaryArea(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    await area.getByLabel('Import area GeoJSON').setInputFiles({
      name: 'channel.geojson',
      mimeType: 'application/geo+json',
      buffer: Buffer.from(geoJson),
    });
    await expect(area.getByLabel('Custom area name')).toHaveValue('Channel AOI');
    await expect(area.getByLabel('Custom area validation')).toContainText(/Ready · 4 vertices · \d+ cells/);

    // The area's NAME identifies the active context; the summary carries the
    // cell metrics.
    await expect(page.getByLabel('Active result context')).toContainText('Channel AOI', { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Area result summary' }))
      .toContainText('Least-covered cell', { timeout: 60_000 });

    await page.getByRole('button', { name: /^(scenario )?workspace
i }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    await workspace.getByLabel('Scenario name').fill('Polygon demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Close scenario workspace' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    await area.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('Area · Channel AOI')).toHaveCount(0);
    await page.getByRole('button', { name: /^(scenario )?workspace
i }).click();
    await workspace.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    await expect(area.getByLabel('Custom area name')).toHaveValue('Channel AOI');
    await expect(area.getByLabel('Custom area validation')).toContainText('Ready');
  });

  test('draws on the globe without moving the point target and cleans preview resources', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Cesium lifecycle contract is viewport-independent');
    await addSecondaryArea(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { cesium: { entities: number; primitives: number } | null } }
    ).__memStats?.().cesium);

    await area.getByRole('button', { name: 'Draw on globe' }).click();
    /*
     * Drawing has its own toolbar over the globe now, and the editor popover
     * deliberately closes to leave the scene clear. The old assertion — that
     * the popover stays open so `Finish polygon` remains reachable — described
     * a flow that no longer exists; `Finish polygon`, `Undo` and `Cancel` live
     * in the drawing toolbar, which also carries the vertex count.
     */
    const drawing = page.getByRole('toolbar', { name: 'Polygon drawing controls' });
    await expect(drawing).toBeVisible();
    await expect(drawing).toContainText('Draw Secondary polygon');
    await expect(drawing).toContainText('the last edge closes automatically');
    await expect(area).toHaveCount(0);
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
    // Globe clicks keep the drawing toolbar in place and count the vertices.
    await expect(drawing).toBeVisible();
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('3 vertices');
    await drawing.getByRole('button', { name: 'Finish polygon' }).click();
    await expect(drawing).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Least-covered cell', { timeout: 60_000 });

    await page.getByRole('button', { name: /Primary target/ }).click();
    await expect(page.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('London');
    await page.getByRole('button', { name: /Select secondary target polygon/ }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();

    await area.getByRole('button', { name: 'Remove' }).click();
    await expect.poll(async () => page.evaluate(() => (
      window as unknown as { __memStats?: () => { cesium: { entities: number; primitives: number } | null } }
    ).__memStats?.().cesium)).toEqual(initial);
  });

  test('keeps the custom-area editor usable on mobile without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await addSecondaryArea(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    await expect(area.getByRole('button', { name: 'Draw on globe' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
