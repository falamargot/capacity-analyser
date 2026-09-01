import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, addSecondaryPoint, openRevisitAnalysis, openRevisitSetup,
  openRevisitSurfaces,
  seedReferenceTarget,
  ensureDetailsOpen,
  openRevisitAnalysisTab,
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

test.describe('REVISIT P2c-A selected result', () => {
  test('aligns the target setup and result column without a visible duplicate', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop column-alignment contract');
    const analysis = page.getByRole('region', { name: 'REVISIT analysis' });
    const targetPanel = page.locator('[data-revisit-context-panel="analysis-target"]');

    await openRevisitAnalysis(page);
    const activeContext = analysis.getByLabel('Active result context');
    await expect(activeContext).toContainText('Point result · Primary target');
    const contextBox = await activeContext.boundingBox();
    expect(contextBox?.width ?? 0).toBeLessThanOrEqual(1);
    expect(contextBox?.height ?? 0).toBeLessThanOrEqual(1);
    const [targetBox, analysisBox] = await Promise.all([
      targetPanel.boundingBox(),
      analysis.boundingBox(),
    ]);
    expect(Math.abs((targetBox?.width ?? 0) - (analysisBox?.width ?? 0))).toBeLessThanOrEqual(1);
    expect((analysisBox?.y ?? 0) - ((targetBox?.y ?? 0) + (targetBox?.height ?? 0)))
      .toBeLessThanOrEqual(16);

    const targetRows = targetPanel.locator('[data-revisit-target-row]');
    await expect(targetRows).toHaveCount(1);
    await expect(targetRows.first()).toHaveAttribute('data-revisit-target-selected', 'true');
    await expect(targetRows.first()).toHaveClass(/ring-2/);

    await addSecondaryPoint(page);
    await expect(targetRows).toHaveCount(2);
    await expect(targetRows.nth(0)).toHaveAttribute('data-revisit-target-selected', 'false');
    await expect(targetRows.nth(0)).toHaveClass(/opacity-70/);
    await expect(targetRows.nth(1)).toHaveAttribute('data-revisit-target-selected', 'true');
    await expect(targetRows.nth(1)).toHaveClass(/ring-2/);

    await targetPanel.getByRole('button', { name: /Primary target/ }).click();
    await expect(targetRows.nth(0)).toHaveAttribute('data-revisit-target-selected', 'true');
    await expect(targetRows.nth(1)).toHaveAttribute('data-revisit-target-selected', 'false');
  });

  test('keeps the reference as benchmark while the selected point owns the result', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));
    const analysis = page.getByRole('region', { name: 'REVISIT analysis' });
    const targetPanel = page.locator('[data-revisit-context-panel="analysis-target"]');

    await openRevisitAnalysis(page);
    await expect(analysis.getByLabel('Active result context')).toContainText('Point result · Primary target');
    await addSecondaryPoint(page);
    // Adding a target happens on the configuration surface, which closes the
    // analysis sheet on a phone; reopen it to read the result back.
    await openRevisitAnalysis(page);

    // A draft row is selected for editing but must never inherit the reference KPI.
    await expect(analysis.getByLabel('Active result context')).toContainText('Point result · Secondary target');
    // The KPI headline no longer exists as a separate block — the customer
    // result card absorbed it — so asserting its absence proves nothing. The
    // contract it stood for is the line above: a draft row states that a
    // location is required instead of inheriting the reference's figure.
    await expect(analysis).toContainText('Secondary target location required');

    /*
     * From here the flow alternates between the configuration surface and the
     * result sheet, which on a phone are mutually exclusive since Programme 7B.
     * Each `openRevisit*` below is the tap a presenter makes; the assertions
     * between them are unchanged.
     */
    await openRevisitSetup(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await openRevisitAnalysis(page);
    await expect(analysis.getByLabel('Active result context')).toContainText('Point result · Secondary target');
    // The "· same configuration as primary: London" qualifier the context used
    // to carry no longer exists; the assertion is removed rather than guessed
    // at. What the context still has to say — which target owns the result — is
    // asserted on the line above.
    await expect(analysis.getByLabel('Active result context')).toContainText('Singapore');
    // Same reason: the settled figure is the card's `Maximum gap`.
    await expect(analysis.getByRole('region', { name: 'Customer result' }))
      .toContainText('Maximum gap', { timeout: 30_000 });

    // Header selection and timeline selection both drive the same inspected id.
    await openRevisitSetup(page);
    await targetPanel.getByRole('button', { name: /Primary target/ }).click();
    await openRevisitAnalysis(page);
    await expect(analysis.getByLabel('Active result context')).toContainText('Point result · Primary target');
    // The timeline is in the footer, outside every panel, so it stays reachable.
    await page.locator('[data-revisit-timeline]')
      .getByRole('button', { name: /Secondary · Singapore/ }).click();
    await expect(analysis.getByLabel('Active result context')).toContainText('Point result · Secondary target');

    /*
     * Removed: this stretch added an AREA as a second comparison alongside the
     * point, then switched back. The target set holds one comparison slot now,
     * so a point and an area cannot coexist as comparisons and the sequence has
     * no object. Point→area context switching is covered by `revisit-p2b-b1`.
     */

    if (testInfo.project.name === 'mobile-chromium') {
      await openRevisitAnalysisTab(page, 'Analysis');
    }
    const evidence = analysis.locator('details', { hasText: 'Why this recommendation?' }).first();
    await ensureDetailsOpen(evidence);
    await expect(evidence.getByText('Sizing evidence')).toBeVisible({ timeout: 60_000 });
    // The secondary target's own sweep is lazy, so the curve arrives after the
    // section around it — same budget as the section above.
    await expect(evidence.getByRole('group', { name: /Worst-case revisit against payload count for Singapore/ }))
      .toBeVisible({ timeout: 60_000 });
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByRole('button', { name: 'Close analysis sheet and show the globe' }).click();
      await expect(page.locator('[data-revisit-result-strip]')).toContainText('Secondary target · max gap');
    }
  });

  test('selects a comparison from the result aligned with its lane', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop comparison layout contract');
    await addSecondaryPoint(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await page.locator('[data-revisit-context-panel="analysis-target"]')
      .getByRole('button', { name: /Primary target/ }).click();

    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(comparison.getByRole('button', { name: 'Singapore' })).toBeVisible({ timeout: 30_000 });
    await expect(comparison.locator('[data-revisit-lane-result]')).toHaveCount(2);
    await expect(page.getByText('Compare targets', { exact: true })).toHaveCount(0);
    const footer = page.getByRole('region', { name: 'Coverage timeline' });
    await expect(footer.locator('[data-revisit-timeline-toolbar]'))
      .toContainText('Requirement ≤ 2 h');
    expect(await footer.evaluate((element) => element.getBoundingClientRect().height))
      .toBeLessThanOrEqual(165);
    const singaporeRow = comparison.locator('[data-revisit-comparison-row]').nth(1);
    // The result at the end of the lane selects the context without turning the
    // seekable track itself into a second selection surface.
    await singaporeRow.locator('[data-revisit-lane-result]').click();
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Secondary target');
    await expect(singaporeRow).toHaveClass(/border-sky-300/);
    await expect(page.locator('[data-revisit-timeline-lane]').nth(1)).toHaveClass(/border-sky-300/);
  });
});
