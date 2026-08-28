import { expect, test } from '@playwright/test';
import {
  isCompactViewport, openRevisitAnalysis, openRevisitSetup,
  openRevisitStageControls, openRevisitSurfaces,
  openRevisitDisplayControls,
  seedReferenceTarget,
  ensureDetailsOpen,
  openRevisitAnalysisTab,
} from './revisitCompact';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('capacity-analyzer:revisit-session:v1');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

test.describe('REVISIT P0 demonstration contract', () => {
  test('opens on a business result with the complete OneWeb fleet truth', async ({ page }) => {
    // The compact-height layout hides `.revisit-context-detail` to buy back globe
    // height (index.css, `min-width:768px and max-height:700px`). The fleet truth
    // is still rendered and still correct there, so mirror the CSS condition
    // rather than assert a visibility the design deliberately removes.
    const viewport = page.viewportSize();
    const detailLineHidden = (viewport?.width ?? 0) >= 768 && (viewport?.height ?? 0) <= 700;
    const fleetTruth = page.getByText('576 active + 58 spare · 634 total');
    if (detailLineHidden) {
      await expect(fleetTruth).toBeAttached();
    } else {
      await expect(fleetTruth).toBeVisible();
    }
    await expect(page.getByText('Demo story')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
    await expect(page.getByText(/telecom workspace is preserved/i)).toHaveCount(0);
    await expect(page.getByText('Validated model')).toHaveCount(1);
    await expect(page.getByText(/not yet calibrated/i)).toHaveCount(0);

    // One panel owns the model: the chip and the settings button open the same one.
    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await expect(settings.getByRole('radiogroup', { name: 'Constellation model' })).toBeVisible();
    await expect(settings.getByRole('radio', { name: 'OneWeb' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'false');
    await expect(settings).toContainText('Propagation cross-checked vs NASA GMAT');

    // The whole specification as one sentence — the panel's first level of
    // reading since Programme 7E.
    await expect(settings.locator('.revisit-characteristics-summary'))
      .toContainText('12 planes × 48 satellites');

    // The fields themselves, and the profile detail a fitted shell cannot
    // carry, are one disclosure away and still exactly as they were.
    await settings.locator('.revisit-expert-settings summary').click();
    // HLD is a record of something external, so its fields are not editable.
    await expect(settings.getByLabel('Planes P')).toBeDisabled();
    await expect(settings).toContainText('1175–1219 km');
    await expect(settings).toContainText('58 across 12 planes');

    await expect(page.getByRole('dialog', { name: 'Model & validation' })).toHaveCount(0);
    await expect(page.locator('.revisit-model-provenance')).toHaveCount(0);
  });

  test('uses a truthful executive envelope and preserves exact topology inspection', async ({ page }) => {
    await openRevisitAnalysis(page);
    await openRevisitAnalysisTab(page, 'Analysis');
    const evidence = page.locator('details', { hasText: 'Why this recommendation?' }).first();
    await ensureDetailsOpen(evidence);
    await expect(page.getByText('best achieved with up to X payloads')).toBeVisible({ timeout: 30_000 });
    await expect(evidence.getByText('Sizing evidence')).toBeVisible();
    await expect(evidence.getByLabel('Sizing evidence legend')).toContainText('Current');
    await expect(evidence).not.toContainText('Minimum tested balanced configuration:');

    await evidence.getByRole('button', { name: 'Show exact topology points' }).click();
    await expect(page.getByText('exact topology points · lower is better')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show executive envelope' })).toBeVisible();
  });

  test('supports presenter reset and explicit simulation time controls', async ({ page }) => {
    // The slider is in the setup triad and Reset is in the stage toolbar, which
    // since Programme 7B cannot both be open on a phone. Each is opened at the
    // moment it is used, which is what the presenter does too.
    await openRevisitSetup(page);
    const payloadSlider = page.getByRole('slider', { name: 'Number of hosted payloads' });
    await expect(payloadSlider).toHaveClass(/revisit-payload-slider/);
    await expect(payloadSlider).toHaveCSS('background-image', /linear-gradient/);
    await payloadSlider.press('ArrowRight');
    await expect(payloadSlider).not.toHaveAttribute('aria-valuetext', '12 payloads');

    // Reset is a scenario operation and lives in the workspace drawer now,
    // two-step, rather than one pixel from the drawer opener in the toolbar.
    await openRevisitStageControls(page);
    await page.getByRole('button', { name: 'Scenario workspace' }).click();
    const reset = page.getByRole('button', { name: /Reset scenario/ });
    await reset.click();
    await page.getByRole('button', { name: /Confirm reset/ }).click();
    // Reset returns a compact viewport to the globe with no panel open, so the
    // slider has to be brought back to read it. A role locator needs the
    // element in the accessibility tree, which `display: none` removes.
    await openRevisitSetup(page);
    await expect(payloadSlider).toHaveAttribute('aria-valuetext', '12 payloads');

    // The clock readout is an editable UTC field now, not a read-only `<time>`.
    const timestamp = page.getByRole('textbox', { name: 'Simulation date and time UTC' });
    const initial = await timestamp.inputValue();
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await expect(page.getByRole('button', { name: 'Play simulation' })).toBeVisible();
    // Hour stepping is a `sm`-and-up affordance; on a phone the same seek is
    // done on the timeline itself, which is keyboard-operable everywhere.
    if (isCompactViewport(page)) {
      /*
       * The reset above returned the scenario to its opening state, which has
       * NO target — so there is no access lane and therefore nothing to seek
       * along. Seeking on the timeline is the contract being asserted here, so
       * the timeline has to exist: seed a target back before pressing it.
       */
      await seedReferenceTarget(page);
      await page.getByRole('slider', { name: /Seek within the .* analysis window/ })
        .press('ArrowRight');
    } else {
      await page.getByRole('button', { name: 'Step simulation forward one hour' }).click();
    }
    await expect(timestamp).not.toHaveValue(initial);
    await page.getByRole('combobox', { name: 'Simulation speed' }).selectOption('100');
    await expect(page.getByRole('combobox', { name: 'Simulation speed' })).toHaveValue('100');
  });

  /*
   * Expanded at `md` and above, one tap away on a phone — `openRevisitDisplayControls`
   * absorbs the difference. What both viewports owe is the same: every layer
   * control reachable without leaving the globe, and no reduced-load mode.
   */
  test('keeps every globe display control directly reachable', async ({ page }) => {
    await openRevisitDisplayControls(page);
    await expect(page.locator('[data-revisit-payload-count]')).toHaveClass(/revisit-payload-count/);
    await expect(page.locator('[data-revisit-payload-swath]')).toHaveClass(/text-slate-100/);
    await expect(page.getByRole('button', { name: 'Host fleet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Satellite labels' }))
      .toHaveAttribute('aria-pressed', 'true');
    const projectionCones = page.getByRole('button', { name: 'Projection cones' });
    await expect(projectionCones).toHaveAttribute('aria-pressed', 'true');
    await projectionCones.click();
    await expect(projectionCones).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Auto-rotate globe' }))
      .toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByText('Reduced globe load', { exact: true })).toHaveCount(0);
  });

  test('adds no listeners or timers across repeated presenter and clock interactions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Lifecycle counters are viewport-independent');
    await expect(page.getByText('best achieved with up to X payloads')).toBeVisible({ timeout: 30_000 });
    // Cesium initializes its shared label/glyph infrastructure asynchronously
    // even while labels are off. Let that one-time work settle before measuring
    // repeated P0 interactions; the P1 gate separately warms and measures labels.
    await page.waitForTimeout(3_000);
    const initial = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());

    // Keep this a single browser action. Per-click trace snapshots rasterise the
    // complete Cesium canvas and can make the instrumentation gate exceed its
    // timeout without reflecting application cost.
    await page.evaluate(async () => {
      const clickNamed = (name: string) => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.includes(name));
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing ${name} button`);
        button.click();
      };
      const commit = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      for (let cycle = 0; cycle < 5; cycle += 1) {
        clickNamed('Host fleet');
        await commit();
        clickNamed('Host fleet');
        await commit();
        clickNamed('Pause');
        await commit();
        clickNamed('Play');
        await commit();
      }
    });

    const final = await page.evaluate(() => (
      window as unknown as { __memStats?: () => { activeListeners: number; activeTimers: number } }
    ).__memStats?.());
    if (initial && final) {
      expect(final.activeListeners - initial.activeListeners).toBeLessThanOrEqual(0);
      expect(final.activeTimers - initial.activeTimers).toBeLessThanOrEqual(0);
    }
    await expect(page.locator('.cesium-widget canvas')).toHaveCount(1);
  });
});
