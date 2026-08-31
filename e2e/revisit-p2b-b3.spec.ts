import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  addSecondaryArea, openRevisitSurfaces, pasteAreaBoundary, seedReferenceTarget,
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

test.describe('REVISIT P2b-B3 scenario workspace', () => {
  test('uses an accessible drawer and restores the complete Area configuration without stale results', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence and PDF contract is viewport-independent');
    await addSecondaryArea(page);
    const areaPanel = page.getByRole('region', { name: 'Area coverage' });
    await areaPanel.getByLabel('Custom area name').fill('North Sea');
    await pasteAreaBoundary(areaPanel, '51, -2\n51, 9\n61, 9\n61, -2');
    await expect(page.getByLabel('Active result context')).toContainText('North Sea', { timeout: 60_000 });

    const launcher = page.getByRole('button', { name: /^(scenario )?workspace$/i });
    await launcher.click();
    const drawer = page.getByRole('dialog', { name: 'Scenario workspace' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close scenario workspace' })).toBeFocused();
    const workspace = drawer.getByRole('region', { name: 'Saved scenario workspace' });
    await expect(workspace).toContainText('Area results');
    await workspace.getByLabel('Scenario name').fill('North Sea board demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();

    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Export customer summary' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');

    await page.getByRole('button', { name: 'Close scenario workspace' }).press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await page.getByRole('button', { name: /Primary target/ }).click();
    await launcher.click();
    await page.getByRole('region', { name: 'Saved scenario workspace' }).getByRole('button', { name: 'Load', exact: true }).click();

    await expect(page.getByRole('button', { name: /Select secondary target polygon/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('North Sea');
    await expect(page.getByLabel('Active result context')).toContainText('North Sea', { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Coverage timeline' })).toContainText('Observation schedule comparison');
    await expect(page.getByRole('region', { name: 'Coverage timeline' })).toContainText('Area worst-cell lane');
  });

  test('fills the mobile viewport without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile drawer contract');
    // Scenario management sits under the stage controls, which themselves
    // carry globe display toggles only. Below `md` the panel is still the
    // full-width sheet: a 432 px popup on a 390 px phone is an edge drawer
    // with extra steps, so the width contract below is unchanged.
    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    await expect(page.getByRole('dialog', { name: 'Scenario workspace' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      drawerWidth: document.querySelector('[data-testid="scenario-workspace-drawer"] aside')?.getBoundingClientRect().width,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.drawerWidth).toBe(dimensions.viewportWidth);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
