import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('critical accessibility gate', () => {
  for (const theme of ['dark', 'light'] as const) {
    for (const mode of ['engineering', 'commercial', 'revisit'] as const) {
      test(`${mode} ${theme} has no critical or serious Axe violation`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop-chromium', 'One browser is sufficient for semantic rules');
        await page.addInitScript((selectedTheme) => localStorage.setItem('vite-ui-theme', selectedTheme), theme);
        await page.goto(`/?mode=${mode}`);
        if (mode === 'revisit') {
          await expect(page.getByRole('button', { name: /Back to / })).toBeVisible({ timeout: 30_000 });
        } else {
          await expect(page.getByRole('navigation', { name: 'Application mode' })).toBeVisible({ timeout: 30_000 });
        }
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        const blocking = results.violations.filter((violation) => (
          violation.impact === 'critical' || violation.impact === 'serious'
        ));
        expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
      });
    }
  }
});
