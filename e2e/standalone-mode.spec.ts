import { expect, test } from '@playwright/test';
import { waitForRevisitReady } from './revisitCompact';

/**
 * `?standalone=1` — the deployment IS the mode it opened in.
 *
 * The contract is about what the interface OFFERS, not about what is reachable:
 * the URL stays editable and all three modes are in one bundle. What these
 * specs pin down is that no surface hands the user a way out — including the
 * crash boundaries, which is where a lock of this kind is most likely to be
 * forgotten and where it matters most.
 */

const telecomShellReady = async (page: import('@playwright/test').Page) => {
  await expect(page.locator('[data-global-app-header]')).toBeVisible({ timeout: 30_000 });
};

const modeSwitch = (page: import('@playwright/test').Page) =>
  page.getByRole('navigation', { name: 'Application mode' });

test.describe('standalone deployments', () => {
  test('REVISIT alone: no return control, and the help button takes the rail', async ({ page }, testInfo) => {
    // The chrome column needs `md` and more than 640 px of height, which rules
    // out the phone and the wide-but-short window by design.
    test.skip(!['desktop-chromium', 'tablet-chromium'].includes(testInfo.project.name),
      'The chrome column needs md width and 640 px of height');
    await page.goto('/?mode=revisit&standalone=1');
    await waitForRevisitReady(page);

    await expect(page.getByRole('button', { name: /^Back to (Engineering|Commercial)$/ })).toHaveCount(0);

    // The `?` is the whole column now, not a 32 px strip at the top of it.
    const rail = page.locator('.revisit-context-rail');
    const help = page.getByRole('button', { name: 'How this works' });
    await expect(help).toBeVisible();
    const [railBox, helpBox] = await Promise.all([rail.boundingBox(), help.boundingBox()]);
    expect(railBox && helpBox).toBeTruthy();
    // Within the rail's own 8 px padding, top and bottom.
    expect(Math.abs((helpBox!.y - railBox!.y) - 8)).toBeLessThanOrEqual(1);
    expect(Math.abs((railBox!.y + railBox!.height) - (helpBox!.y + helpBox!.height) - 8))
      .toBeLessThanOrEqual(1);

    // And it still opens what it opens.
    await help.click();
    await expect(page.getByRole('dialog', { name: 'How this works' })).toBeVisible();
  });

  test('REVISIT without the flag keeps its return control', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'tablet-chromium'].includes(testInfo.project.name),
      'Paired with the standalone case above');
    await page.goto('/?mode=revisit');
    await waitForRevisitReady(page);
    await expect(page.getByRole('button', { name: /^Back to (Engineering|Commercial)$/ })).toHaveCount(1);
  });

  test('Engineering alone: the mode switch is gone from every placement', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Placement matrix is viewport-independent');
    await page.goto('/?mode=eng&standalone=1');
    await telecomShellReady(page);

    // Four call sites render this switch (desktop header, compact header, two
    // HUD variants). None of them may survive the flag.
    await expect(modeSwitch(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revisit', exact: true })).toHaveCount(0);
  });

  test('Commercial alone: the short spelling selects the mode and the switch is gone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'One shell assertion is enough');
    await page.goto('/?mode=comm&standalone=1');
    await telecomShellReady(page);
    await expect(modeSwitch(page)).toHaveCount(0);
  });

  test('without the flag the switch is present and names the mode from the short spelling', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'One shell assertion is enough');
    await page.goto('/?mode=comm');
    await telecomShellReady(page);
    await expect(modeSwitch(page)).toHaveCount(1);
    await expect(page.getByRole('button', { name: /^(Comm|Commercial)$/ }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});
