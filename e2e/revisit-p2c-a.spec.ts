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
    // Same reason: the settled figure is the card's `Maximum revisit gap`.
    await expect(analysis.getByRole('region', { name: 'Customer result' }))
      .toContainText('Maximum revisit gap', { timeout: 30_000 });

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

  test('selects a comparison from the aligned comparison table', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop table is aligned beside the timeline');
    await addSecondaryPoint(page);
    await page.getByRole('combobox', { name: 'Secondary target', exact: true }).selectOption('Singapore');
    await page.locator('[data-revisit-context-panel="analysis-target"]')
      .getByRole('button', { name: /Primary target/ }).click();

    const comparison = page.getByRole('region', { name: 'Target comparison' });
    await expect(comparison.getByRole('button', { name: 'Singapore' })).toBeVisible({ timeout: 30_000 });
    const singaporeRow = comparison.locator('[data-revisit-comparison-row]').nth(1);
    // The KPI/goal side of the row is clickable too; selection is not confined
    // to the target-name button.
    await singaporeRow.click({ position: { x: 350, y: 14 } });
    await expect(page.getByLabel('Active result context')).toContainText('Point result · Secondary target');
    await expect(singaporeRow).toHaveClass(/border-sky-300/);
    await expect(page.locator('[data-revisit-timeline-lane]').nth(1)).toHaveClass(/border-sky-300/);
  });
});
