import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, openAreaEditor, openRevisitAnalysis, openRevisitSetup,
  openRevisitSurfaces, seedReferenceTarget,
} from './revisitCompact';

/**
 * Programme 7A — the commercial answer, end to end.
 *
 * The unit tests fix what the card renders for a given sizing outcome. What
 * only the browser can prove is the part that made the button worth building:
 * that applying the recommendation actually moves the configuration to a
 * measured one, that the requirement then reads as covered, and that the
 * presenter can get back to the previous configuration to show the contrast
 * again.
 */

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

test.describe('REVISIT P7A commercial result framing', () => {
  test('states the customer question and both configurations', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));
    // The card lives in the analysis column, which on a phone is one of the
    // mutually exclusive panels (Programme 7B).
    await openRevisitAnalysis(page);
    const card = page.getByRole('region', { name: 'Customer result' });

    await expect(card).toContainText('Can the Eutelsat LEO fleet observe London');
    await expect(card).toContainText('at least every 2 h');
    // The swath is stated as an assumption, never as an instrument datasheet.
    await expect(card).toContainText(/with an assumed \d+ km IR swath/);

    await expect(card).toContainText('Current configuration');
    await expect(card).toContainText('Maximum revisit gap');
    await expect(card).toContainText('Customer requirement');

    // The requirement is component state, not part of the scenario: changing it
    // re-derives the answer with no recomputation and therefore no wait
    // (plan, Programme 7 decision 4).
    // It now lives beside the sensor swath in the header, which on a phone is
    // the setup panel — and the panels are mutually exclusive (Programme 7B),
    // so the card has to be reopened to read the re-derived answer back.
    await openRevisitSetup(page);
    await page.getByRole('combobox', { name: 'Revisit requirement' }).selectOption(String(24 * 3600_000));
    await openRevisitAnalysis(page);
    await expect(card).toContainText('at least every 24 h');
    await expect(card).toContainText('Requirement covered');
    await expect(card.locator('.revisit-customer-status')).toHaveClass(/text-lime-200/);
  });

  test('applies the recommended configuration and returns from it', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));
    /*
     * This test is gated on the payload sweep, the slowest computation in the
     * module, and then applies its answer and waits for a second full analysis.
     * Under a full-suite run the first wait alone exceeded 60 s. The budget is
     * raised rather than the assertion weakened: the contract is that the
     * button appears once the sweep resolves, not that it appears quickly.
     */
    test.setTimeout(240_000);
    await openRevisitAnalysis(page);
    const card = page.getByRole('region', { name: 'Customer result' });
    const payloadCount = page.getByLabel('Number of hosted payloads');

    // The sweep is what turns the failure into an opportunity, and it is slow;
    // until it lands the card says so rather than proposing a stale figure.
    const apply = card.getByRole('button', { name: 'Apply recommended configuration' });
    await expect(apply).toBeVisible({ timeout: 120_000 });
    await expect(card).toContainText('More payloads required');
    await expect(card.locator('.revisit-customer-status')).toHaveClass(/text-orange-200/);

    const before = await payloadCount.inputValue();
    await apply.click();

    // Applying moves the configuration and the requirement becomes covered.
    await expect(card).toContainText('Requirement covered', { timeout: 60_000 });
    await expect(card.locator('.revisit-customer-status')).toHaveClass(/text-lime-200/);
    await expect(payloadCount).not.toHaveValue(before);
    await expect(apply).toHaveCount(0);

    // And the presenter can go back to show the contrast again.
    const undo = card.getByRole('button', { name: 'Return to previous configuration' });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(payloadCount).toHaveValue(before);
    await expect(undo).toHaveCount(0);
  });

  test('never proposes a payload count for an area', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));
    const card = page.getByRole('region', { name: 'Customer result' });

    await addSecondaryArea(page);
    // The area editor is on the configuration surface; assert its state there,
    // then move to the result sheet for the card.
    await expect(page.getByRole('region', { name: 'Area coverage' })).toBeVisible();
    await openRevisitAnalysis(page);
    // Before the area exists, the card asks the question and states what is
    // missing — it does not fall back to the primary point's figures.
    await expect(card).toContainText('Can every analysed cell in');
    await expect(card).toContainText('Maximum revisit gap · least-covered cell');
    await expect(card).toContainText('Define an area to analyse');
    await expect(card.getByRole('button', { name: 'Apply recommended configuration' })).toHaveCount(0);

    // Reading the card dismissed the editor's popover; ask for it again.
    await openAreaEditor(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    await area.getByLabel('Custom area name').fill('Customer AOI');
    await area.getByText('Paste coordinate list', { exact: true }).click();
    await area.getByLabel('Custom area coordinate list').fill('15, 35\n15, 45\n25, 45\n25, 35');
    await area.getByRole('button', { name: 'Apply list' }).click();
    await openRevisitAnalysis(page);
    await expect(page.getByRole('region', { name: 'Area result summary' }))
      .toContainText('Least-covered cell', { timeout: 60_000 });

    // Analysed: the worst cell drives the answer, and still no payload count is
    // proposed — there is no area-wide sizing sweep (Programme 5b guardrail).
    await expect(card).toContainText('Customer AOI');
    await expect(card).toContainText('Area sizing has not been calculated');
    await expect(card.getByRole('button', { name: 'Apply recommended configuration' })).toHaveCount(0);
  });
});
