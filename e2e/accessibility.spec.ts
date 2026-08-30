import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { addSecondaryArea,
  seedReferenceTarget,
} from './revisitCompact';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Run Axe, retrying once on a harness race rather than a product defect.
 *
 * `AxeBuilder.analyze()` injects and evaluates in EVERY frame. Cesium creates
 * and tears down transient frames, so under machine load a frame can vanish
 * mid-analysis and Playwright throws "Execution context was destroyed, most
 * likely because of a navigation" from `page.evaluate`/`frame.evaluate`. That
 * surfaced as intermittent failures of `revisit dark`, `commercial dark` and
 * `commercial light` during Programme 7 — three different modes, one of them
 * untouched by any of the work, which is what gave the cause away. It is not a
 * violation, and it carries no accessibility information at all.
 *
 * Deliberately narrow: only that error is retried, and only once. Any real
 * violation still fails, and a genuinely broken page fails on the retry too.
 */
async function analyzeAccessibility(page: Page) {
    const run = () => new AxeBuilder({ page }).withTags(WCAG).analyze();
    /*
     * Axe injects and evaluates in every frame. Cesium creates and tears down
     * transient frames, so a scan can lose its execution context through no
     * fault of the page — it carries no accessibility information at all, which
     * is why it surfaced in three different modes without pattern.
     *
     * A single retry was not enough: it lands in the same window and throws
     * again. Bounded to three attempts with a settle between them; any real
     * violation still fails on the first attempt, and a genuinely broken page
     * fails on all three.
     */
    let lastCause: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await run();
        } catch (cause) {
            const message = cause instanceof Error ? cause.message : String(cause);
            if (!/Execution context was destroyed|frame was detached/i.test(message)) throw cause;
            lastCause = cause;
            await page.waitForLoadState('domcontentloaded');
            await page.waitForTimeout(500);
        }
    }
    throw lastCause;
}

test.describe('critical accessibility gate', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const mode of ['engineering', 'commercial', 'revisit'] as const) {
      test(`${mode} ${theme} has no critical or serious Axe violation`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-chromium', 'One browser is sufficient for semantic rules');
        // The REVISIT pass runs a real area analysis (allowed 60 s on its own)
        // and six Axe sweeps inside one test. Under a full-suite run that
        // exceeded the 90 s default and timed out mid-click — a scheduling
        // flake reported as a gate failure.
        if (mode === 'revisit') test.setTimeout(240_000);
        await page.addInitScript((selectedTheme) => localStorage.setItem('vite-ui-theme', selectedTheme), theme);
        await page.goto(`/?mode=${mode}`);
        if (mode === 'revisit') {
          await expect(page.getByRole('button', { name: /Back to / })).toBeVisible({ timeout: 30_000 });
        } else {
          await expect(page.getByRole('navigation', { name: 'Application mode' })).toBeVisible({ timeout: 30_000 });
        }
        const analyses = [await analyzeAccessibility(page)];
        if (mode === 'revisit') {
          // REVISIT syncs `?mode=` into history shortly after mount. Clicking
          // into that navigation lands before the app is interactive and the
          // dialog never opens — the same race as the Axe retry above, on the
          // interaction path rather than the analysis path.
          await page.waitForLoadState('domcontentloaded');
          // REVISIT opens with no target; the sizing-target controls this sweep
          // audits only exist once one is chosen.
          await seedReferenceTarget(page);
          await page.getByRole('button', { name: 'Set primary target location' }).click();
          await expect(page.getByRole('dialog', { name: 'Set primary target location' })).toBeVisible();
          analyses.push(await analyzeAccessibility(page));
          await page.getByRole('button', { name: 'Set primary target location' }).click();
          await addSecondaryArea(page);
          analyses.push(await analyzeAccessibility(page));
          await page.getByRole('button', { name: 'Define area target' }).click();
          analyses.push(await analyzeAccessibility(page));
          await page.getByRole('button', { name: 'Define area target' }).click();
          const areaPanel = page.getByRole('region', { name: 'Area coverage' });
          await areaPanel.getByText('Paste coordinate list', { exact: true }).click();
          await areaPanel.getByLabel('Custom area coordinate list').fill('51, -2\n51, 9\n61, 9\n61, -2');
          await areaPanel.getByRole('button', { name: 'Apply list' }).click();
          await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Least-covered cell', { timeout: 60_000 });
          analyses.push(await analyzeAccessibility(page));
          await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
          analyses.push(await analyzeAccessibility(page));
        }
        const blocking = analyses.flatMap((results) => results.violations).filter((violation) => (
          violation.impact === 'critical' || violation.impact === 'serious'
        ));
        expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
      });
    }
  }
});
