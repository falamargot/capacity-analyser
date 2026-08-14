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

test.describe('REVISIT P2b-B3 scenario workspace', () => {
  test('uses an accessible drawer and restores the complete Area configuration without stale results', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence and PDF contract is viewport-independent');
    await page.getByRole('tab', { name: 'Area' }).click();
    await page.getByRole('button', { name: 'Define area target' }).click();
    const areaPanel = page.getByRole('region', { name: 'Area coverage' });
    await areaPanel.getByLabel('Custom area name').fill('North Sea');
    await areaPanel.getByText('Paste coordinate list', { exact: true }).click();
    await areaPanel.getByLabel('Custom area coordinate list').fill('51, -2\n51, 9\n61, 9\n61, -2');
    await areaPanel.getByRole('button', { name: 'Apply list' }).click();
    await areaPanel.getByRole('button', { name: 'Run custom area' }).click();
    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('North Sea', { timeout: 60_000 });

    const launcher = page.getByRole('button', { name: 'Scenario workspace' });
    await launcher.click();
    const drawer = page.getByRole('dialog', { name: 'Scenario workspace' });
    await expect(drawer).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close scenario workspace' })).toBeFocused();
    const workspace = drawer.getByRole('region', { name: 'Saved scenario workspace' });
    await expect(workspace).toContainText('Area results');
    await workspace.getByLabel('Scenario name').fill('North Sea board demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();

    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Area PDF' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).not.toBeNull();
    expect((await readFile(path!)).subarray(0, 5).toString()).toBe('%PDF-');

    await page.getByRole('button', { name: 'Close scenario workspace' }).press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await page.getByRole('tab', { name: /Points/ }).click();
    await launcher.click();
    await page.getByRole('region', { name: 'Saved scenario workspace' }).getByRole('button', { name: 'Load', exact: true }).click();

    await expect(page.getByRole('tab', { name: 'Area' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('North Sea');
    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Not run');
    await expect(page.getByRole('region', { name: 'Coverage timeline' })).toContainText('Run an area analysis');
  });

  test('fills the mobile viewport without horizontal overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile drawer contract');
    await page.getByRole('button', { name: 'Scenarios' }).click();
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
