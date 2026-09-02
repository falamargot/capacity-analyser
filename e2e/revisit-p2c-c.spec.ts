import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, addSecondaryPoint, openAreaEditorFromDrawing, openRevisitAnalysis, openRevisitSetup, openRevisitSurfaces, pasteAreaBoundary, seedReferenceTarget,
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
 * former setup (comparison point + secondary area) has no object; the mixed
 * metric this spec is about is unchanged, and is still what the table shows.
 */
async function configureMixedTargets(page: import('@playwright/test').Page) {
  await addSecondaryArea(page);
  const area = page.getByRole('region', { name: 'Area coverage' });
  await area.getByLabel('Custom area name').fill('Customer AOI');
  await pasteAreaBoundary(area, '15, 35\n15, 45\n25, 45\n25, 35');
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
    await targetSet.getByRole('button', { name: 'Remove primary target' }).click();
    await targetSet.getByRole('button', { name: 'Add primary target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add Primary polygon target' }).click();
    // Polygon goes to the globe first; the editor is reached from the toolbar.
    await openAreaEditorFromDrawing(page);

    let editor = page.getByRole('region', { name: 'Area coverage' });
    await pasteAreaBoundary(editor, '18, 30\n18, 36\n22, 36\n22, 30');
    await targetSet.getByRole('button', { name: /primary polygon/i }).first().click();

    await addSecondaryArea(page);
    editor = page.getByRole('dialog', { name: 'Define area target' });
    await pasteAreaBoundary(editor, '8, 75\n8, 82\n13, 82\n13, 75');
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
    await referenceRow.locator('[data-revisit-lane-result]').click();
    /*
     * The role is asserted through `data-revisit-target-role` alone. A
     * `toHaveClass(/revisit-target-reference/)` pair sat beside these until
     * 2026-09-02, left stale when the visible cartouche became an `sr-only`
     * announcement: `.revisit-target-*` paints a border, and an element with no
     * box cannot carry one. Verified failing on `10d1ff9` before removal.
     */
    const activeResult = page.getByLabel('Active result context');
    await expect(activeResult).toContainText('Primary area');
    await expect(activeResult).toHaveAttribute('data-revisit-target-role', 'reference');
    await comparisonRow.locator('[data-revisit-lane-result]').click();
    await expect(activeResult).toContainText('Secondary area');
    await expect(activeResult).toHaveAttribute('data-revisit-target-role', 'comparison');
    await expect(referenceRow).toHaveText(referenceResult ?? '');
    await expect(comparisonRow).toHaveText(comparisonResult ?? '');
  });

  /*
   * The two Area runs are keyed by ROLE, not by polygon. A role swap that left
   * them in place kept the old Primary's completed grid attached to the new
   * Primary slot — and `displayedReferenceAreaAnalysis` RENAMES a mismatched
   * analysis instead of discarding it, so this row presented one polygon's
   * coverage under the other polygon's name, verdicted against the other
   * polygon's just-swapped requirement, until the debounced auto-run landed.
   * `isRunning` was false throughout the 450 ms debounce, so nothing on screen
   * said the figure was stale.
   *
   * The assertion that catches it is the FIRST one after the click: the row
   * must go pending. Reaching the right end state is not enough — the defect
   * reached the right end state too, seconds later, after showing a wrong one.
   */
  test('releases both Area analyses when the polygons exchange roles', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Role ownership is viewport-independent');

    const targetSet = page.locator('[data-revisit-context-panel="analysis-target"]');
    await targetSet.getByRole('button', { name: 'Remove primary target' }).click();
    await targetSet.getByRole('button', { name: 'Add primary target' }).click();
    await targetSet.getByRole('menuitem', { name: 'Add Primary polygon target' }).click();
    // Polygon goes to the globe first; the editor is reached from the toolbar.
    await openAreaEditorFromDrawing(page);

    let editor = page.getByRole('region', { name: 'Area coverage' });
    await editor.getByLabel('Custom area name').fill('Alpha AOI');
    await pasteAreaBoundary(editor, '18, 30\n18, 36\n22, 36\n22, 30');
    await targetSet.getByRole('button', { name: /primary polygon/i }).first().click();

    await addSecondaryArea(page);
    editor = page.getByRole('dialog', { name: 'Define area target' });
    await editor.getByLabel('Custom area name').fill('Beta AOI');
    await pasteAreaBoundary(editor, '8, 75\n8, 82\n13, 82\n13, 75');
    // The definition dialog hangs below the Secondary row and would swallow the
    // click on the swap control under it. Selecting the Primary polygon is the
    // click-outside that dismisses it, and fixes the pre-swap selection.
    await targetSet.getByRole('button', { name: 'Select primary target polygon' }).click();
    await expect(editor).toHaveCount(0);
    await openRevisitAnalysis(page);

    const comparison = page.getByRole('region', { name: 'Target comparison' });
    const primaryRow = comparison.locator('[data-revisit-comparison-row="REFERENCE_AREA_TARGET"]');
    const secondaryRow = comparison.locator('[data-revisit-comparison-row="AREA_TARGET"]');
    const pending = /Preparing|Computing|Define area|…/;
    const settled = async (row: typeof primaryRow) => {
      await expect(row).not.toContainText(pending, { timeout: 60_000 });
      return (/\d+ h(?: \d+ min)?|\d+ min|Never seen/.exec(await row.textContent() ?? ''))?.[0];
    };

    const alphaGap = await settled(primaryRow);
    const betaGap = await settled(secondaryRow);
    await expect(primaryRow).toContainText('Alpha AOI');
    await expect(secondaryRow).toContainText('Beta AOI');
    // The whole assertion below rests on the two polygons measuring
    // differently. Fail loudly here if a fixture change ever collapses them,
    // rather than passing vacuously.
    expect(alphaGap).toBeTruthy();
    expect(betaGap).toBeTruthy();
    expect(alphaGap).not.toBe(betaGap);

    /*
     * Record every state this row renders across the swap, with a
     * MutationObserver rather than a retried assertion or a frame sampler: a
     * retried `toContainText` is no use here, because the defect also reached
     * the right end state ~450 ms later, having shown a wrong one first — the
     * assertion simply waits for it and passes. What must never exist is a
     * single RENDER carrying the promoted polygon's name over the demoted
     * polygon's figure.
     */
    await page.evaluate(() => {
      const row = document.querySelector('[data-revisit-comparison-row="REFERENCE_AREA_TARGET"]');
      if (!row) throw new Error('Primary area row not found');
      const store = [row.textContent ?? ''];
      (window as unknown as { __revisitRowSamples: string[] }).__revisitRowSamples = store;
      new MutationObserver(() => store.push(row.textContent ?? ''))
        .observe(row, { subtree: true, childList: true, characterData: true });
    });

    await targetSet.getByRole('button', { name: 'Swap Primary and Secondary targets' }).click();

    // Let each promoted polygon's own grid land. Both the fixed and the broken
    // build reach this state; the difference is only what was shown on the way.
    await expect(primaryRow).toContainText('Beta AOI');
    await expect(primaryRow).toContainText(betaGap ?? '', { timeout: 60_000 });
    await expect(secondaryRow).toContainText('Alpha AOI');
    await expect(secondaryRow).toContainText(alphaGap ?? '', { timeout: 60_000 });

    const samples = await page.evaluate(
      () => (window as unknown as { __revisitRowSamples: string[] }).__revisitRowSamples,
    );
    // The observer has to have survived the transition, or the filter below is
    // reading an empty history and proving nothing.
    expect(samples.length).toBeGreaterThan(1);
    expect(samples[samples.length - 1]).toContain(betaGap ?? '');

    const misattributed = samples.filter((sample) => sample.includes('Beta AOI')
      && (/\d+ h(?: \d+ min)?|\d+ min|Never seen/.exec(sample))?.[0] === alphaGap);
    expect(misattributed, `Alpha's result was rendered under Beta's name in \
${misattributed.length} of ${samples.length} recorded states`).toEqual([]);
  });

  test('compares Point and Area on one qualified contractual metric and synchronises selection', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop unified-lane contract');
    await configureMixedTargets(page);

    const timeline = page.getByRole('region', { name: 'Coverage timeline' });
    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(timeline).toContainText('Observation schedule comparison');
    await expect(timeline).toContainText('Point lanes + Area worst-cell lane');
    await expect(comparison).toContainText('Maximum gap');
    await expect(comparison).toContainText('Least-covered cell');
    await expect(comparison).not.toContainText('Mean');
    await expect(comparison).not.toContainText(/Select to analyse|Computing…/, { timeout: 30_000 });
    // Reference point + secondary area: two lanes, two rows.
    await expect(timeline.locator('[data-revisit-timeline-lane]')).toHaveCount(2);
    await expect(comparison.locator('[data-revisit-comparison-row]')).toHaveCount(2);

    const areaRow = comparison.locator('[data-revisit-comparison-row="AREA_TARGET"]');
    await areaRow.locator('[data-revisit-lane-result]').click();
    await expect(page.getByLabel('Active result context')).toContainText('Area result');
    await expect(areaRow).toHaveClass(/border-sky-300/);

    const pointRow = comparison.locator('[data-revisit-comparison-row]').first();
    await pointRow.locator('[data-revisit-lane-result]').click();
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Primary target');
    // The reference row carries the amber accent; comparisons carry sky.
    await expect(pointRow).toHaveClass(/border-amber-300/);
  });

  test('keeps every mixed target selectable from the compact timeline without overflow', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile timeline contract');
    await configureMixedTargets(page);
    const timeline = page.getByRole('region', { name: 'Coverage timeline' });
    /*
     * Two lanes, not three: the target set holds a reference and ONE comparison
     * slot, so this spec's reference point plus secondary area is the whole
     * set. The count was a leftover from the two-comparison era — the desktop
     * twin above already asserts 2.
     */
    await expect(timeline.locator('[data-revisit-timeline-lane]')).toHaveCount(2);
    /*
     * The comparison in this spec is the AREA `Customer AOI`, not a point — the
     * `Secondary · Singapore` lane this used to click belonged to the
     * two-secondary target set and no longer exists. Selecting the area lane is
     * what the test is named for: every mixed target reachable from the compact
     * timeline.
     */
    await timeline.getByRole('button', { name: /Secondary · Customer AOI/ }).click();
    await expect(page.getByLabel('Active result context')).toContainText('Area result');
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });
});
