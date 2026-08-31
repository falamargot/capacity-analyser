import { expect, test } from '@playwright/test';
import {
  addSecondaryPoint, openAreaEditorFromDrawing, openRevisitSurfaces, pasteAreaBoundary,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // Deliberately NOT seeded: this spec describes the target set from its empty
  // opening state outwards, so it adds the primary target itself.
});

test.describe('REVISIT P2c-B unified target set', () => {
  test('keeps Primary, Secondary and Area in one list with one inspected result', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Target-set semantics are viewport-independent');
    const targetSet = page.locator('[data-revisit-context-panel="analysis-target"]');
    const activeResult = page.getByLabel('Active result context');

    await expect(targetSet.getByRole('tablist')).toHaveCount(0);
    await expect(targetSet.getByRole('button', { name: 'Add primary target' })).toBeVisible();
    await targetSet.getByRole('button', { name: 'Add primary target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add Primary point target' }).click();
    await expect(targetSet).toContainText('Primary target');
    await expect(targetSet).not.toContainText('Area ·');
    await expect(targetSet).not.toContainText('Primary drives configuration');
    const compactHeaderHeight = await page.locator('[data-revisit-context-bar]')
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(compactHeaderHeight).toBeLessThan(170);

    await addSecondaryPoint(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await expect(targetSet).toContainText('Secondary target');
    await expect(activeResult).toContainText('Point result · Secondary target');

    // Geometry is chosen when a target is added. Removing Primary PROMOTES the
    // Secondary rather than discarding it, so emptying the list takes one
    // removal per target.
    await targetSet.getByRole('button', { name: 'Remove primary target' }).click();
    await expect(targetSet).not.toContainText('Secondary target');
    await targetSet.getByRole('button', { name: 'Remove primary target' }).click();
    await targetSet.getByRole('button', { name: 'Add primary target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add Primary polygon target' }).click();
    // Polygon goes to the globe first; the editor is reached from the toolbar.
    await openAreaEditorFromDrawing(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    await pasteAreaBoundary(area, '49, -2\n49, 2\n51, 2\n51, -2');
    await expect(activeResult).toContainText('Area result');
    await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Least-covered cell', { timeout: 60_000 });

    // The polygon editor is still open over the target list; the add control
    // underneath it cannot take a click until it is dismissed. Its own toggle
    // closes it — Escape does not.
    await targetSet.getByRole('button', { name: /primary polygon/i }).first().click();
    await expect(area).toHaveCount(0);
    await addSecondaryPoint(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');

    // All targets remain in one list while only the selected target owns the
    // contextual result and timeline.
    await expect(targetSet).toContainText('Primary target');
    await expect(targetSet).toContainText('Secondary target');
    await expect(targetSet).toContainText('Polygon · Primary area');
    await targetSet.locator('button[aria-pressed]').filter({ hasText: 'Secondary target' }).click();
    await expect(activeResult).toContainText('Point result · Secondary target');
    await targetSet.getByRole('button', { name: 'Select primary target polygon' }).click();
    await expect(activeResult).toContainText('Area result');
    await expect(page.getByRole('region', { name: 'Coverage timeline' })).toContainText('Observation schedule comparison');
    await expect(page.getByRole('region', { name: 'Coverage timeline' })).toContainText('Area worst-cell lane');
  });

  test('keeps the unified target list within the mobile viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated compact-layout contract');
    await addSecondaryPoint(page);
    const targetSet = page.locator('[data-revisit-context-panel="analysis-target"]');
    await expect(targetSet).toContainText('Primary target');
    await expect(targetSet).toContainText('Secondary target');
    await expect(targetSet).not.toContainText('Area ·');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });

  test('swaps two point roles with their requirements without changing payload count', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Role ownership is viewport-independent');
    const targetSet = page.locator('[data-revisit-context-panel="analysis-target"]');
    const hostedPayloads = page.locator('[data-revisit-context-panel="hosted-payloads"]');

    await targetSet.getByRole('button', { name: 'Add primary target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add Primary point target' }).click();
    await hostedPayloads.getByRole('combobox', { name: 'Revisit requirement for Primary target' })
      .selectOption(String(3600_000));

    await addSecondaryPoint(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await hostedPayloads.getByRole('combobox', { name: 'Revisit requirement for Secondary target' })
      .selectOption(String(6 * 3600_000));
    const payloadCountBefore = await hostedPayloads.locator('[data-revisit-payload-count]').textContent();

    await targetSet.getByRole('button', { name: 'Swap Primary and Secondary targets' }).click();

    await expect(page.getByRole('combobox', { name: 'Target', exact: true })).toHaveValue('Singapore');
    await expect(page.getByRole('combobox', { name: 'Secondary target', exact: true })).toHaveValue('London');
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Primary target');
    await expect(hostedPayloads.getByRole('combobox', { name: 'Revisit requirement for Primary target' }))
      .toHaveValue(String(6 * 3600_000));
    await expect(hostedPayloads.locator('[data-revisit-payload-count]')).toHaveText(payloadCountBefore ?? '');

    await targetSet.locator('button[aria-pressed]').filter({ hasText: 'Secondary target' }).click();
    await expect(hostedPayloads.getByRole('combobox', { name: 'Revisit requirement for Secondary target' }))
      .toHaveValue(String(3600_000));
  });
});
