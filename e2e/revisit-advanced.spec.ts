import { expect, test } from '@playwright/test';
import {
  addSecondaryArea, pasteAreaBoundary, seedReferenceTarget,
} from './revisitCompact';

const openAdvanced = async (page: import('@playwright/test').Page) => {
  await page.goto('/?mode=revisit');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
  // REVISIT opens with no target; these tests describe engine behaviour that
  // only runs once one exists.
  await seedReferenceTarget(page);
  await page.getByRole('button', { name: 'Constellation model and settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Advanced constellation settings' });
  await expect(dialog).toBeVisible();
  // Since Programme 7E the panel opens on Model + Evidence; the Walker fields,
  // strides, instrument geometry and window are behind `Expert settings`, which
  // is what every test in this file is about.
  await expect(page.getByRole('spinbutton', { name: 'Planes P' })).toBeVisible();
  // The characteristics are read-only for the HLD reference and the measured
  // shell — they are records of something external. Editing is a Custom-mode
  // act, so every advanced test has to say so first.
  await dialog.getByRole('radio', { name: 'Custom' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Planes P' })).toBeEnabled();
};

test.describe('REVISIT Advanced stabilization', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Advanced interactions are viewport-independent');
    await page.addInitScript(() => {
      localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
      localStorage.setItem('collapsible:revisit-advanced', '1');
    });
  });

  test('detaches HLD per-plane data when the plane count changes', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openAdvanced(page);

    const satellitesPerPlane = page.getByRole('spinbutton', { name: 'Sats / plane S' });
    await expect(satellitesPerPlane).toHaveValue('48');
    expect(await satellitesPerPlane.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(true);

    await page.getByRole('spinbutton', { name: 'Planes P' }).fill('13', { force: true });
    await expect(page.locator('[data-revisit-context-panel="constellation"]')).toContainText('13 × 48');
    await expect(page.getByText('Custom HLD').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('bounds pasted numbers and keeps the application alive', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openAdvanced(page);

    const altitude = page.getByRole('spinbutton', { name: 'Altitude km' });
    await altitude.fill('0', { force: true });
    await expect(altitude).toHaveValue('200');

    const inclination = page.getByRole('spinbutton', { name: 'Inclination °' });
    await inclination.fill('999', { force: true });
    await expect(inclination).toHaveValue('180');

    // The window moved to the coverage ribbon, beside the axis it defines.
    await page.getByRole('button', { name: 'Analysis window settings' }).click();
    const duration = page.getByRole('spinbutton', { name: /Duration h/ });
    await duration.fill('99999', { force: true });
    await expect(duration).toHaveValue('240');

    const step = page.getByRole('spinbutton', { name: /Step s/ });
    await step.fill('999', { force: true });
    await expect(step).toHaveValue('120');

    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('makes altitude, pattern and fudge edits explicit custom inputs', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await openAdvanced(page);

    await page.getByRole('spinbutton', { name: 'Altitude km' }).fill('1300', { force: true });
    await expect(page.locator('[data-revisit-context-panel="constellation"]')).toContainText('1300 km');
    await page.getByRole('combobox', { name: 'Pattern' }).selectOption('DELTA');
    await page.getByRole('spinbutton', { name: /Fudge/ }).fill('1.5', { force: true });

    await expect(page.locator('[data-revisit-context-panel="constellation"]')).toContainText('DELTA');
    await expect(page.getByText('Custom HLD').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('surfaces engine warnings produced by an advanced edit', async ({ page }) => {
    await openAdvanced(page);
    await page.getByRole('spinbutton', { name: 'Phasing f' }).fill('1.5', { force: true });
    await expect(page.getByText(/non-standard Walker phasing/).first()).toBeVisible({ timeout: 30_000 });
  });

  test('offers real cancellation while the first area grid is running', async ({ page }) => {
    await page.goto('/?mode=revisit');
    await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible({ timeout: 30_000 });
    // A secondary target can only be added once a primary target exists.
    await seedReferenceTarget(page);
    /*
     * The run has to still BE running when the click lands, and this test kept
     * losing that race: area analysis has become several times cheaper (shared
     * target track, cells batched over one propagation pass, one shared
     * Earth-rotation grid), so the grid it used to interrupt now finishes
     * first. Chasing the engine with a slightly bigger grid each time is how a
     * gate becomes flaky — it passed alone and failed in a batch — so the
     * workload is set near the app's own ceiling: a 2 s sampling step over the
     * largest grid the area validator accepts, about seven times the original
     * case. A 1 s step is NOT usable here: it also multiplies the point sweep,
     * which holds the area run behind "waiting for the final topology" past the
     * timeout, so the test would fail for the opposite reason.
     */
    await page.getByRole('button', { name: 'Analysis window settings' }).click();
    await page.getByRole('dialog', { name: 'Analysis window' }).getByLabel('Step s').fill('2');
    await page.getByRole('button', { name: 'Analysis window settings' }).click();
    await addSecondaryArea(page);
    const areaPanel = page.getByRole('region', { name: 'Area coverage' });
    // 0.42° is 408 cells and the validator refuses it; 0.43° is 391, just
    // under the 400-cell cap.
    await areaPanel.getByLabel('Custom area grid spacing').fill('0.43');
    await pasteAreaBoundary(areaPanel, '68, 20\n68, 30\n75, 30\n75, 20');
    const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeVisible({ timeout: 10_000 });
    await cancel.click();
    await expect(cancel).toBeHidden();
    await expect(areaPanel.getByRole('button', { name: 'Run custom area' })).toHaveCount(0);
    await expect(areaPanel).toContainText('analysed automatically');
  });
});

test('rejects an invalid restored REVISIT session before render', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Session validation is viewport-independent');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem('capacity-analyzer:revisit-session:v1', JSON.stringify({
      schemaVersion: 1,
      scenario: {
        reference: {
          pattern: 'STAR', planes: 13, satsPerPlane: 48,
          inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
          planeAltitudesKm: Array.from({ length: 12 }, (_, index) => 1175 + 4 * index),
          raanOffsetsDeg: Array.from({ length: 12 }, (_, index) => 15.225 * index),
          sparesPerPlane: Array.from({ length: 12 }, () => 5),
        },
        selection: { planeStride: 1, satStride: 1, planeShift: 0 },
        payload: {
          biasDeg: { alongTrack: 0, crossTrack: 0 }, shape: 'ELLIPSE',
          halfAngle1Deg: 10, halfAngle2Deg: 10, clockingDeg: 0,
        },
        target: { kind: 'POINT', name: 'London', latDeg: 51.5074, lonDeg: -0.1278 },
        window: { startMs: 1_700_000_000_000, durationHours: 72, stepSeconds: 10 },
      },
      options: { showOrbits: true, showSwaths: true, showHostFleet: true, autoRotate: false },
      requirementMs: 7_200_000,
      selectionSource: 'auto',
    }));
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });

  await page.goto('/?mode=revisit');
  await expect(page.locator('[data-revisit-context-panel="constellation"]')).toContainText('12 × 48');
  await expect(page.getByRole('region', { name: 'REVISIT analysis' })).toBeVisible();
  expect(pageErrors).toEqual([]);
});
