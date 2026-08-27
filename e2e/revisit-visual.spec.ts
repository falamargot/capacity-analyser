import { expect, test } from '@playwright/test';
import { waitForRevisitReady,
  seedReferenceTarget, closeRevisitPanels, waitForRevisitResultSettled,
} from './revisitCompact';

const viewports = [
  { name: 'phone-390x844', width: 390, height: 844 },
  { name: 'phone-430x932', width: 430, height: 932 },
  { name: 'tablet-768x1024', width: 768, height: 1024 },
  { name: 'tablet-1024x768', width: 1024, height: 768 },
  { name: 'laptop-1280x800', width: 1280, height: 800 },
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'wide-1920x1080', width: 1920, height: 1080 },
  { name: 'short-wide-2048x560', width: 2048, height: 560 },
  { name: 'short-wide-2048x320', width: 2048, height: 320 },
] as const;

test.describe('REVISIT visual baselines', () => {
  for (const viewport of viewports) {
    for (const theme of ['dark', 'light'] as const) {
      test(`${viewport.name} ${theme}`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-chromium', 'One project captures the explicit viewport matrix');
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.clock.setFixedTime(new Date('2026-08-11T12:00:00.000Z'));
        await page.addInitScript((selectedTheme) => {
          localStorage.setItem('vite-ui-theme', selectedTheme);
          localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
        }, theme);
        await page.goto('/?mode=revisit');
        // Phone widths open globe-first: the analysis column is a closed sheet
        // and the result strip is the ready signal (mobile UX plan §5).
        await waitForRevisitReady(page);
        // REVISIT opens with no target selected, so nothing is computed until
        // one is chosen. Seeding it is what makes these baselines show a real
        // result; closing the panels afterwards restores the globe-first
        // opening state the compact captures are meant to record.
        await seedReferenceTarget(page);
        await closeRevisitPanels(page);
        // Capture only after the asynchronous payload sweep has settled. At
        // wide resolutions it could previously land between Playwright's two
        // stability screenshots and make snapshot regeneration time out.
        await expect(page.getByText('best achieved with up to X payloads')).toHaveCount(1, { timeout: 60_000 });
        /*
         * The sweep landing is not the end of it: `reconcileToMeasuredBest`
         * then moves the selection to the measured-best topology and the
         * analysis recomputes, so a capture taken in between records a
         * worst-case figure that the next run will not reproduce — 21 746
         * differing pixels in the result strip, which is what made this gate
         * unstable. The readiness chip is necessary but not sufficient: it
         * already reads "Ready to present" while the reconcile is pending, so
         * the helper also waits for the rendered text to stop changing.
         */
        await waitForRevisitResultSettled(page);
        await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);

        // Cesium animates continuously, but masking its canvas is not safe: the
        // canvas fills the viewport and Playwright paints masks by bounding box,
        // above every HTML overlay. That used to turn every baseline into one
        // solid magenta rectangle and made the visual gate blind. Making only
        // the pixels transparent keeps Cesium's real box in layout while the
        // header, sidebar, footer and mobile sheets remain observable.
        await page.addStyleTag({
          content: '.cesium-widget canvas { opacity: 0 !important; }',
        });

        // The shell fills the viewport. A page screenshot avoids locator-stability
        // retries caused by Cesium's continuously moving canvas while preserving
        // the exact visual contract under test.
        await expect(page).toHaveScreenshot(
          `${viewport.name}-${theme}.png`,
          {
            animations: 'disabled',
            timeout: 30_000,
            mask: [page.locator('.cesium-credit-logoContainer')],
            maxDiffPixelRatio: 0.01,
          },
        );
      });
    }
  }
});
