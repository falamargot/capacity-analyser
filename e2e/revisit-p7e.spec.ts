import { expect, test } from '@playwright/test';
import { openRevisitStageControls, openRevisitSurfaces,
  openRevisitDisplayControls,
  seedReferenceTarget,
} from './revisitCompact';

/**
 * Programme 7E — commercial progressive disclosure.
 *
 * The contract is about what is NOT on screen first: Walker parameters, stride
 * selectors, instrument geometry and JSON are all reachable and all one
 * disclosure away, so a salesperson opening a panel mid-call lands on an
 * answer rather than a form.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.clear();
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

test.describe('REVISIT P7E commercial progressive disclosure', () => {
  test('opens the constellation panel on a concise model summary and expert settings', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));

    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await expect(panel).toBeVisible();

    // The model selector and summary answer what is being run. Engine-validation
    // evidence belongs to technical documentation and exports, not this panel.
    await expect(panel.getByRole('radiogroup', { name: 'Constellation model' })).toBeVisible();
    await expect(panel).not.toContainText('Evidence');
    await expect(panel).not.toContainText('Kepler + J2');

    // The whole specification, as one sentence rather than seven fields.
    const summary = panel.locator('.revisit-characteristics-summary');
    await expect(summary).toContainText('12 planes × 48 satellites');
    await expect(summary).toContainText('Walker STAR');

    // Everything an engineer needs is present, and open: this section is no
    // longer a disclosure, because everyone who opens this panel came for it.
    const expert = panel.locator('.revisit-expert-settings');
    await expect(panel.getByRole('combobox', { name: 'Plane stride x' })).toBeVisible();
    await expect(expert).toContainText('Instrument geometry');
    /*
     * The analysis window is NOT here any more, deliberately: duration and
     * sampling step describe the measurement, not the constellation, and they
     * now sit with the timeline they govern. This pins both halves of that
     * move — gone from the panel, and still reachable from its own control.
     */
    await expect(expert).not.toContainText('Analysis window');
    await expect(page.getByRole('button', { name: 'Analysis window settings' }))
      .toBeAttached();
  });

  test('opens technical evidence from the Characteristics information button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Interaction is viewport-independent');

    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await panel.getByRole('button', { name: 'Model evidence' }).click();

    const evidence = panel.getByRole('dialog', { name: 'Model evidence' });
    await expect(evidence).toContainText('Kepler + J2 secular · no drag');
    await expect(evidence).toContainText('OneWeb Gen1 (HLD reference)');
    await evidence.getByRole('button', { name: 'Close model evidence' }).click();
    await expect(evidence).toBeHidden();
  });

  test('shows the HLD equality marker only beside expert settings', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Wording contract is viewport-independent');

    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await panel.getByRole('radio', { name: 'Custom' }).click();

    await expect(panel.getByText('= HLD', { exact: true })).toHaveCount(1);
    await expect(panel.locator('.revisit-expert-settings')).toContainText('= HLD');
  });

  /*
   * The sentence a salesperson reads out loud, and the one the exported summary
   * repeats. It names Eutelsat's fleet only when the model IS one: the seven
   * Walker fields are free, so on `Custom` the tool could otherwise put
   * Eutelsat's name on a 6 × 20 shell at 550 km.
   */
  test('names Eutelsat’s fleet only while the model is one', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Wording contract is viewport-independent');
    const card = page.getByRole('region', { name: 'Customer result' });
    await expect(card).toContainText('Can the Eutelsat LEO fleet observe');

    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const panel = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await panel.getByRole('radio', { name: 'Custom' }).click();

    await expect(card).toContainText('Can this custom constellation observe');
    await expect(card).not.toContainText('Eutelsat');

    await panel.getByRole('radio', { name: 'OneWeb' }).click();
    await expect(card).toContainText('Can the Eutelsat LEO fleet observe');
  });

  test('names the opportunity, branches before editing, and hides JSON', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Workspace contract is viewport-independent');

    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    const workspace = page.getByRole('region', { name: 'Saved scenario workspace' });
    await expect(workspace).toBeVisible();

    // The opportunity leads, because it is what the scenario is for.
    await workspace.getByRole('textbox', { name: 'Customer or opportunity' })
      .fill('Eutelsat / ACME Earth Observation');

    await workspace.getByRole('textbox', { name: 'Scenario name' }).fill('ACME baseline');
    await workspace.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(workspace).toContainText('Saved “ACME baseline” locally');

    /*
     * The failure `Duplicate` exists to prevent: loading the reference
     * scenario, editing it live, and overwriting the one everyone else uses.
     * The original must still be there afterwards.
     */
    await workspace.getByRole('button', { name: 'Duplicate' }).click();
    await expect(workspace).toContainText('Duplicated as “ACME baseline (copy)”');
    const saved = workspace.getByRole('combobox', { name: 'Saved scenarios' });
    await expect(saved.locator('option')).toHaveText(['ACME baseline (copy)', 'ACME baseline']);

    // JSON is real, and not part of a customer conversation.
    const sharing = workspace.locator('.revisit-technical-sharing');
    await expect(sharing).not.toHaveAttribute('open', /.*/);
    await expect(workspace.getByRole('button', { name: 'Export JSON' })).toBeHidden();
    await sharing.locator('summary').click();
    await expect(workspace.getByRole('button', { name: 'Export JSON' })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Import JSON…' })).toBeVisible();
  });

  test('keeps presenter notes out of the compact globe display controls', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));

    await openRevisitDisplayControls(page);
    await expect(page.locator('.revisit-presenter-notes')).toHaveCount(0);
    // Not a workflow that drives the tool — the plan rejects both.
    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
  });
});
