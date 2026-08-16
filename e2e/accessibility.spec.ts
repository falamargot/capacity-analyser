import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

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
        const analyses = [await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()];
        if (mode === 'revisit') {
          await page.getByRole('button', { name: 'Set reference location' }).click();
          await expect(page.getByRole('dialog', { name: 'Set reference location' })).toBeVisible();
          analyses.push(await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze());
          await page.getByRole('button', { name: 'Set reference location' }).click();
          await page.getByRole('tab', { name: 'Area' }).click();
          analyses.push(await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze());
          await page.getByRole('button', { name: 'Define area target' }).click();
          analyses.push(await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze());
          const areaPanel = page.getByRole('region', { name: 'Area coverage' });
          await areaPanel.getByText('Paste coordinate list', { exact: true }).click();
          await areaPanel.getByLabel('Custom area coordinate list').fill('51, -2\n51, 9\n61, 9\n61, -2');
          await areaPanel.getByRole('button', { name: 'Apply list' }).click();
          await expect(page.getByRole('region', { name: 'Area result summary' })).toContainText('Worst cell', { timeout: 60_000 });
          analyses.push(await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze());
          await page.getByRole('button', { name: 'Scenario workspace' }).click();
          analyses.push(await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
            .analyze());
        }
        const blocking = analyses.flatMap((results) => results.violations).filter((violation) => (
          violation.impact === 'critical' || violation.impact === 'serious'
        ));
        expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
      });
    }
  }
});
