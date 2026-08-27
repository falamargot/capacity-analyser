import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, openRevisitAnalysis, openRevisitSurfaces,
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

test.describe('REVISIT P2b-B2 contextual results', () => {
  test('separates Points and Area results and moves Scenario Workspace to the left menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Context contract is viewport-independent');
    const analysis = page.getByRole('region', { name: 'REVISIT analysis' });
    await expect(analysis).toContainText('Point result · Reference target');
    await expect(analysis.getByRole('region', { name: 'Area coverage' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Saved scenario workspace' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    await expect(page.getByRole('dialog', { name: 'Scenario workspace' })).toBeVisible();
    await page.getByRole('button', { name: 'Close scenario workspace' }).click();

    const pointsHeaderHeight = await page.locator('[data-revisit-context-bar]').evaluate((element) => element.getBoundingClientRect().height);
    await addSecondaryArea(page);
    await page.getByRole('button', { name: 'Define area target' }).click();
    const areaHeaderHeight = await page.locator('[data-revisit-context-bar]').evaluate((element) => element.getBoundingClientRect().height);
    // Adding a real secondary row may grow the triad by one compact line; the
    // separate empty Area section is gone, and deeper header compaction is a
    // later UX increment rather than part of this target-model change.
    expect(areaHeaderHeight).toBeLessThanOrEqual(pointsHeaderHeight + 60);
    await expect(analysis.getByRole('region', { name: 'Area result summary' })).toBeVisible();
    // The cell distribution is supporting evidence in the consolidated Analysis view.
    await expect(analysis.getByRole('region', { name: 'Area cell distribution' })).toBeVisible();
    await expect(analysis.getByRole('button', { name: 'Data', exact: true })).toHaveCount(0);
    await expect(analysis.getByRole('region', { name: 'Target comparison' })).toHaveCount(0);
    await expect(analysis.getByText('Sizing evidence')).toHaveCount(0);
    await expect(page.getByText('Observation schedule comparison')).toBeVisible();
    await expect(page.getByText('Point lanes + Area worst-cell lane')).toBeVisible();

    await page.getByRole('button', { name: 'Define area target' }).click();
    const areaPanel = page.getByRole('region', { name: 'Area coverage' });
    await areaPanel.getByLabel('Custom area name').fill('North Sea');
    await areaPanel.getByText('Paste coordinate list', { exact: true }).click();
    await areaPanel.getByLabel('Custom area coordinate list').fill('51, -2\n51, 9\n61, 9\n61, -2');
    await areaPanel.getByRole('button', { name: 'Apply list' }).click();
    await expect(analysis.getByRole('region', { name: 'Area result summary' })).toContainText('Least-covered cell', { timeout: 60_000 });
    await expect(page.locator('[data-revisit-timeline]')).toContainText(/least-covered cell/i);
    await expect(page.locator('[data-revisit-context-panel="analysis-target"]')).toContainText('North Sea');
    await expect(analysis).toHaveJSProperty('scrollTop', 0);
  });

  test('adds one temporal lane per comparison point', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Pointer contract is viewport-independent');
    const canvas = page.locator('.cesium-widget canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({
      position: { x: box!.width * 0.54, y: box!.height * 0.43 },
      modifiers: ['Shift'], force: true,
    });
    await expect(page.getByText('Observation schedule comparison')).toBeVisible();
    // The lanes and the seek slider are siblings: the slider overlays the track
    // column only, so it can carry the playhead without nesting the lane buttons.
    const timeline = page.locator('[data-revisit-timeline]');
    await expect(timeline).toContainText('Reference ·');
    await expect(timeline).toContainText('Comparison ·');
    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(comparison).toContainText('Maximum gap', { timeout: 30_000 });

    const timelineRows = timeline.locator('[data-revisit-timeline-lane]');
    const comparisonRows = comparison.locator('[data-revisit-comparison-row]');
    await expect(comparisonRows).toHaveCount(2);
    for (let index = 0; index < 2; index += 1) {
      const timelineBox = await timelineRows.nth(index).boundingBox();
      const comparisonBox = await comparisonRows.nth(index).boundingBox();
      expect(timelineBox).not.toBeNull();
      expect(comparisonBox).not.toBeNull();
      expect(Math.abs(timelineBox!.y - comparisonBox!.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(timelineBox!.height - comparisonBox!.height)).toBeLessThanOrEqual(1);
    }
  });

  test('uses Area-specific mobile navigation without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Dedicated mobile contract');
    await addSecondaryArea(page);
    // The area EDITOR is on the configuration surface; assert it while that is
    // the open panel, because navigating away dismisses its popover.
    await expect(page.getByRole('region', { name: 'Area coverage' })).toBeVisible();

    // Area evidence now lives in the single consolidated analysis sheet, which
    // cannot be open at the same time as the editor on a phone.
    await openRevisitAnalysis(page);
    await expect(page.getByRole('region', { name: 'Customer result' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Area cell distribution' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Data', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Advanced', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Setup', exact: true })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
