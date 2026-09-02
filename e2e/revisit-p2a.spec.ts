import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { openRevisitSurfaces,
  seedReferenceTarget,
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

test.describe('REVISIT P2a product workflow', () => {
  test('saves, restores and shares a named scenario', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Persistence contract is viewport-independent');
    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    await expect(workspace.locator('summary', { hasText: 'Technical exports' })).toBeVisible();
    await workspace.locator('summary', { hasText: 'Technical exports' }).click();
    await expect(workspace.getByRole('button', { name: 'Accesses CSV' })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Sweep CSV' })).toBeVisible();
    await workspace.getByRole('textbox', { name: 'Scenario name' }).fill('London board demo');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(workspace.getByRole('status')).toContainText('Saved');

    // JSON export moved under `Technical sharing` in Programme 7E: it is how an
    // engineer moves a scenario between machines, not a customer-facing step.
    await workspace.locator('.revisit-technical-sharing summary').click();
    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Export JSON', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('revisit-london-board-demo.json');

    await page.getByRole('button', { name: 'Close scenario workspace' }).click();
    await page.getByRole('combobox', { name: 'Target', exact: true }).selectOption('Singapore');
    await expect(page.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('Singapore');
    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    await workspace.getByRole('button', { name: 'Load', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('London');
  });

  /*
   * The three-target comparison this test was built around is gone: the target
   * set is a reference plus ONE comparison now, so Shift-clicking twice no
   * longer produces three point rows. The comparison-table assertions were
   * removed rather than reinvented — what remains, and what this test is kept
   * for, is the export contract.
   */
  test('exports a qualified result PDF', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Export contract is viewport-independent');
    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    const downloadPromise = page.waitForEvent('download');
    await workspace.getByRole('button', { name: 'Export customer summary' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^revisit-result-.*\.pdf$/);
    const path = await download.path();
    expect(path).not.toBeNull();
    const pdf = await readFile(path!);
    expect(pdf.byteLength).toBeGreaterThan(5_000);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('removes scenario management from the mobile rail', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await expect(page.locator('[aria-controls="revisit-scenario-workspace-drawer"]')).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Scenario workspace' })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
