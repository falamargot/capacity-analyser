import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, addSecondaryPoint, openRevisitAnalysis, openRevisitSetup,
  openRevisitSurfaces,
  seedReferenceTarget,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

/*
 * A point and an area on one screen — but as REFERENCE and COMPARISON, not as
 * two comparisons. The target set holds a single comparison slot now, so the
 * former setup (comparison point + comparison area) has no object; the mixed
 * metric this spec is about is unchanged, and is still what the table shows.
 */
async function configureMixedTargets(page: import('@playwright/test').Page) {
  await addSecondaryArea(page);
  const area = page.getByRole('region', { name: 'Area coverage' });
  await area.getByLabel('Custom area name').fill('Customer AOI');
  await area.getByText('Paste coordinate list', { exact: true }).click();
  await area.getByLabel('Custom area coordinate list').fill('15, 35\n15, 45\n25, 45\n25, 35');
  await area.getByRole('button', { name: 'Apply list' }).click();
  // The area summary is in the analysis sheet, not in the editor that defined
  // the area — and on a phone the two cannot be open at once (Programme 7B).
  await openRevisitAnalysis(page);
  await expect(page.getByRole('region', { name: 'Area result summary' }))
    .toContainText('Least-covered cell', { timeout: 60_000 });
}

test.describe('REVISIT P2c-C mixed target comparison', () => {
  test('computes and retains both polygon roles independently', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Dual-polygon worker ownership is viewport-independent');

    const targetSet = page.locator('[data-revisit-context-panel="analysis-target"]');
    await targetSet.getByRole('button', { name: 'Remove reference target' }).click();
    await targetSet.getByRole('button', { name: 'Add reference target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add polygon reference target' }).click();

    let editor = page.getByRole('region', { name: 'Area coverage' });
    await editor.getByText('Paste coordinate list', { exact: true }).click();
    await editor.getByLabel('Custom area coordinate list')
      .fill('18, 30\n18, 36\n22, 36\n22, 30');
    await editor.getByRole('button', { name: 'Apply list' }).click();
    await targetSet.getByRole('button', { name: /reference polygon/i }).first().click();

    await addSecondaryArea(page);
    editor = page.getByRole('dialog', { name: 'Define area target' });
    await editor.getByText('Paste coordinate list', { exact: true }).click();
    await editor.getByLabel('Custom area coordinate list')
      .fill('8, 75\n8, 82\n13, 82\n13, 75');
    await editor.getByRole('button', { name: 'Apply list' }).click();
    await openRevisitAnalysis(page);

    const comparison = page.getByRole('region', { name: 'Target comparison' });
    const referenceRow = comparison.locator('[data-revisit-comparison-row="REFERENCE_AREA_TARGET"]');
    const comparisonRow = comparison.locator('[data-revisit-comparison-row="AREA_TARGET"]');
    await expect(referenceRow).toBeVisible();
    await expect(comparisonRow).toBeVisible();
    await expect(page.locator('[data-revisit-area-layers="reference,comparison"]')).toBeVisible();
    await expect(referenceRow).not.toContainText(/Preparing|Computing|Select to analyse/, { timeout: 60_000 });
    await expect(comparisonRow).not.toContainText(/Preparing|Computing|Select to analyse/, { timeout: 60_000 });
    await expect(page.locator('[data-revisit-area-analysis-layers="comparison,reference"]')).toBeVisible();

    const referenceResult = await referenceRow.textContent();
    const comparisonResult = await comparisonRow.textContent();
    await referenceRow.click();
    await expect(page.getByLabel('Active result context')).toContainText('Reference area');
    await comparisonRow.click();
    await expect(page.getByLabel('Active result context')).toContainText('Comparison area');
    await expect(referenceRow).toHaveText(referenceResult ?? '');
    await expect(comparisonRow).toHaveText(comparisonResult ?? '');
  });

  test('compares Point and Area on one qualified contractual metric and synchronises selection', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop sidecar contract');
    await configureMixedTargets(page);

    const timeline = page.getByRole('region', { name: 'Coverage timeline' });
    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(timeline).toContainText('Observation schedule comparison');
    await expect(timeline).toContainText('Point lanes + Area worst-cell lane');
    await expect(comparison).toContainText('Maximum gap');
    await expect(comparison).toContainText('Least-covered cell');
    await expect(comparison).not.toContainText('Mean');
    await expect(comparison).not.toContainText(/Select to analyse|Computing…/, { timeout: 30_000 });
    // Reference point + comparison area: two lanes, two rows.
    await expect(timeline.locator('[data-revisit-timeline-lane]')).toHaveCount(2);
    await expect(comparison.locator('[data-revisit-comparison-row]')).toHaveCount(2);

    const areaRow = comparison.locator('[data-revisit-comparison-row="AREA_TARGET"]');
    await areaRow.click();
    await expect(page.getByLabel('Active result context')).toContainText('Area result');
    await expect(areaRow).toHaveClass(/border-sky-300/);

    const pointRow = comparison.locator('[data-revisit-comparison-row]').first();
    await pointRow.click();
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Reference target');
    // The reference row carries the amber accent; comparisons carry sky.
    await expect(pointRow).toHaveClass(/border-amber-300/);
  });

  test('keeps every mixed target selectable from the compact timeline without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile timeline contract');
    await configureMixedTargets(page);
    const timeline = page.getByRole('region', { name: 'Coverage timeline' });
    /*
     * Two lanes, not three: the target set holds a reference and ONE comparison
     * slot, so this spec's reference point plus comparison area is the whole
     * set. The count was a leftover from the two-comparison era — the desktop
     * twin above already asserts 2.
     */
    await expect(timeline.locator('[data-revisit-timeline-lane]')).toHaveCount(2);
    /*
     * The comparison in this spec is the AREA `Customer AOI`, not a point — the
     * `Comparison · Singapore` lane this used to click belonged to the
     * two-comparison target set and no longer exists. Selecting the area lane is
     * what the test is named for: every mixed target reachable from the compact
     * timeline.
     */
    await timeline.getByRole('button', { name: /Comparison · Customer AOI/ }).click();
    await expect(page.getByLabel('Active result context')).toContainText('Area result');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
