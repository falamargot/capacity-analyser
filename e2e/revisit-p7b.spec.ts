import { expect, test } from '@playwright/test';
import {
  openRevisitDisplayControls, seedReferenceTarget, waitForRevisitReady,
} from './revisitCompact';

/**
 * Programme 7B — presentation safety.
 *
 * The exclusivity rule can only be proved in a browser at a compact viewport:
 * it is about what four independently-mounted panels do to each other, and
 * before 7B two of them lived in different components with no way to coordinate.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await waitForRevisitReady(page);
});

test.describe('REVISIT P7B presentation safety', () => {
  test('keeps one compact content panel open while globe controls remain available', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium', 'Panel exclusivity is a compact-viewport contract');

    const setup = page.locator('#revisit-mobile-setup');
    const analysis = page.getByRole('region', { name: 'REVISIT analysis' });
    const stage = page.locator('#revisit-stage-controls');
    const workspace = page.locator('#revisit-scenario-workspace-drawer');

    const openCount = async () => {
      const states = await Promise.all([
        setup.isVisible(), analysis.isVisible(), workspace.isVisible(),
      ]);
      return states.filter(Boolean).length;
    };

    await expect(stage).toBeVisible();
    // Globe-first: no modal/content panel is stacked over the scene.
    expect(await openCount()).toBe(0);

    await page.locator('button[aria-controls="revisit-mobile-setup"]').click();
    await expect(setup).toBeVisible();
    expect(await openCount()).toBe(1);

    // Opening the analysis sheet closes the setup triad rather than stacking.
    await page.locator('[data-revisit-result-strip]').click();
    await expect(analysis).toBeVisible();
    await expect(setup).toBeHidden();
    expect(await openCount()).toBe(1);

    // The workspace is a separate header action and remains modal.
    await page.getByRole('button', { name: 'Scenario workspace', exact: true }).click();
    await expect(workspace).toBeVisible();
    await expect(analysis).toBeHidden();
    await expect(stage).toBeVisible();
    expect(await openCount()).toBe(1);

    // Every panel's dismissal lands back on the globe, not on another panel.
    await page.getByRole('button', { name: /close/i }).first().click();
    expect(await openCount()).toBe(0);

    await page.locator('[data-revisit-result-strip]').click();
    await expect(analysis).toBeVisible();
    await page.getByRole('button', { name: 'Close analysis sheet and show the globe' }).click();
    expect(await openCount()).toBe(0);
  });

  /*
   * The reason `PresentationNotice` exists. Before 7B this state put
   * `Running on the main thread — Worker unavailable` in red across the top of
   * the globe. The engine is the same pure function on both paths, so it is a
   * responsiveness caveat, not a failure — and the room should be told that.
   */
  test('states the Worker fallback as a caveat, not as a failure', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Engine-path contract, not a layout one');

    await page.addInitScript(() => {
      // Fail only the REVISIT engine workers; Cesium's own workers must still
      // construct or nothing renders and the test would prove nothing.
      const Native = window.Worker;
      class GuardedWorker extends Native {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (String(url).includes('revisit')) throw new Error('Worker blocked for test');
          super(url, options);
        }
      }
      window.Worker = GuardedWorker as unknown as typeof Worker;
    });
    await page.reload();
    await waitForRevisitReady(page);

    const notice = page.locator('[data-revisit-notice-severity]');
    await expect(notice).toHaveAttribute('data-revisit-notice-severity', 'DEGRADED');
    await expect(notice).toHaveAttribute('role', 'status');
    await expect(notice).toContainText('Running in reduced performance mode');
    await expect(notice).toContainText('Results are identical');
    // The engineering text is reachable, and only reachable on purpose: it
    // starts behind a closed disclosure rather than across the globe.
    const detail = notice.locator('details');
    await expect(detail).not.toHaveAttribute('open', /.*/);
    await expect(notice.getByText('could not create a module Worker')).toBeHidden();
    await detail.locator('summary').click();
    await expect(notice.getByText('could not create a module Worker')).toBeVisible();

    // And the readiness check names it rather than letting it be a surprise.
    const readiness = page.locator('.revisit-readiness-check');
    await expect(readiness).toHaveAttribute('data-revisit-readiness', 'Ready with limitations');
  });

  test('offers readiness and independently operable globe display controls', async ({ page }, testInfo) => {
    test.skip(!['desktop-chromium', 'mobile-chromium'].includes(testInfo.project.name));

    // Readiness reports on a real analysis, so this test needs a target. The
    // exclusivity test above deliberately does NOT seed one: it asserts the
    // globe-first opening state, with zero panels open.
    await seedReferenceTarget(page);
    const readiness = page.locator('.revisit-readiness-check');
    await expect(readiness).toBeVisible();

    // The summary must never claim readiness while the sweep is still running.
    await expect(readiness).toHaveAttribute('data-revisit-readiness', /Preparing|Ready/);
    await readiness.locator('summary').click();
    await expect(readiness).toContainText('Orbital model');
    await expect(readiness).toContainText('no network needed');
    await expect(readiness).toContainText('Background computation');

    // Once the sweep lands the check reports fully ready.
    await expect(readiness).toHaveAttribute('data-revisit-readiness', 'Ready to present', {
      timeout: 60_000,
    });

    // Start from a deliberately non-default scene so the profile exit proves
    // each layer control is independently operable.
    await openRevisitDisplayControls(page);
    const orbits = page.getByRole('button', { name: 'Orbits', exact: true });
    const hostFleet = page.getByRole('button', { name: 'Host fleet', exact: true });
    const labels = page.getByRole('button', { name: 'Satellite labels', exact: true });
    await orbits.click();
    await expect(orbits).toHaveAttribute('aria-pressed', 'false');
    await expect(hostFleet).toHaveAttribute('aria-pressed', 'true');
    await expect(labels).toHaveAttribute('aria-pressed', 'true');

    // Reduced-load mode has been removed; the explicit layer controls are the
    // only globe-load choices.
    await expect(readiness.locator('.revisit-presentation-profile')).toHaveCount(0);
    await expect(page.getByText('Reduced globe load', { exact: true })).toHaveCount(0);
    await expect(hostFleet).toHaveAttribute('aria-pressed', 'true');
    await expect(labels).toHaveAttribute('aria-pressed', 'true');
  });
});
