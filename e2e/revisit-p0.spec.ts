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
    // Two different layouts hide this line, and only the first was handled here:
    //
    //  1. The compact-HEIGHT layout drops `.revisit-context-detail` to buy back
    //     globe height (index.css, `min-width:768px and max-height:700px`).
    //     Mirror that CSS condition rather than assert a visibility the design
    //     deliberately removes.
    //  2. On a PHONE the line is inside `#revisit-mobile-setup`, the setup triad
    //     collapsed behind a one-line bar since Programme 7B. It is one tap away,
    //     not gone, so open the triad the way a presenter would and keep the
    //     visibility assertion intact.
    const viewport = page.viewportSize();
    const detailLineHidden = (viewport?.width ?? 0) >= 768 && (viewport?.height ?? 0) <= 700;
    if (isCompactViewport(page)) await openRevisitSetup(page);
    const fleetTruth = page.getByText('576 active + 58 spare · 634 total');
    if (detailLineHidden) {
      await expect(fleetTruth).toBeAttached();
    } else {
      await expect(fleetTruth).toBeVisible();
    }
    await expect(page.getByText('Demo story')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Demo scenario' })).toHaveCount(0);
    await expect(page.getByText(/telecom workspace is preserved/i)).toHaveCount(0);
    /*
     * Exactly one model chip on the opening screen — and `exact` is what makes
     * that testable. The chip's label now shares its button with the `…`
     * affordance that opens the panel, so a substring match resolves both the
     * label and the button containing it and reports two "occurrences" of a
     * label rendered once.
     */
    await expect(page.getByText('OneWeb Gen1 · HLD', { exact: true })).toHaveCount(1);
    await expect(page.getByText(/not yet calibrated/i)).toHaveCount(0);

    // One panel owns the model: the chip and the settings button open the same one.
    await page.getByRole('button', { name: 'Constellation model and settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Advanced constellation settings' });
    await expect(settings.getByRole('radiogroup', { name: 'Constellation model' })).toBeVisible();
    await expect(settings.getByRole('radio', { name: 'OneWeb' })).toHaveAttribute('aria-checked', 'true');
    await expect(settings.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'false');
    /*
     * The engine's provenance is one deliberate click away, not permanent panel
     * chrome: it lives in the Model evidence popover behind the `i` beside
     * Characteristics. The demonstration contract is that it is REACHABLE from
     * this panel, which is what this asserts.
     */
    await settings.getByRole('button', { name: 'Model evidence' }).click();
    const evidence = settings.getByRole('dialog', { name: 'Model evidence' });
    await expect(evidence).toContainText('Propagation cross-checked vs NASA GMAT');
    await evidence.getByRole('button', { name: 'Close model evidence' }).click();

    // The whole specification as one sentence — the panel's first level of
    // reading since Programme 7E.
    await expect(settings.locator('.revisit-characteristics-summary'))
      .toContainText('12 planes × 48 satellites');

    // The fields themselves, and the profile detail a fitted shell cannot
    // carry, are one disclosure away and still exactly as they were.
    // HLD is a record of something external, so its fields are not editable.
    await expect(settings.getByLabel('Planes P')).toBeDisabled();
    /*
     * The ladder's exact range moved onto the summary's hover: it belongs to
     * whoever asks for it, not to everyone who opens the panel. The spare
     * distribution stayed in the sentence itself. Both are still carried — the
     * demonstration contract is about the truth being present, not about which
     * line renders it.
     */
    await expect(settings.locator('.revisit-characteristics-summary'))
      .toHaveAttribute('title', /1175–1219 km/);
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

    await evidence.getByRole('button', { name: 'Show every measured count' }).click();
    await expect(page.getByText('exact topology points · lower is better')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show best per budget' })).toBeVisible();
  });

  /*
   * Split from the clock contract below on 2026-09-04, because it is NOT a
   * phone contract. The Scenario workspace launcher is `hidden ... md:flex`
   * with an explicit comment in `RevisitApp.tsx`: "Scenario management is
   * deliberately absent below `md` — saving and sharing scenarios is a desktop
   * workflow, while the phone rail needs to stay focused on the globe". The
   * combined test asserted a desktop-only affordance on mobile-chromium and had
   * been failing there; the phone side of the design is pinned in its own test
   * rather than dropped.
   */
  test('supports presenter reset from the scenario workspace', async ({ page }) => {
    test.skip(isCompactViewport(page), 'Scenario management is an md-and-up workflow by design');
    await openRevisitSetup(page);
    const payloadSlider = page.getByRole('slider', { name: 'Number of hosted payloads' });
    await expect(payloadSlider).toHaveClass(/revisit-payload-slider/);
    await expect(payloadSlider).toHaveCSS('background-image', /linear-gradient/);
    await payloadSlider.press('ArrowRight');
    await expect(payloadSlider).not.toHaveAttribute('aria-valuetext', '12 payloads');

    // Reset is a scenario operation and lives in the workspace drawer now,
    // two-step, rather than one pixel from the drawer opener in the toolbar.
    await openRevisitStageControls(page);
    await page.getByRole('button', { name: /^(scenario )?workspace$/i }).click();
    const reset = page.getByRole('button', { name: /Reset scenario/ });
    await reset.click();
    await page.getByRole('button', { name: /Confirm reset/ }).click();
    await openRevisitSetup(page);
    await expect(payloadSlider).toHaveAttribute('aria-valuetext', '12 payloads');
  });

  test('keeps scenario management off the phone rail', async ({ page }) => {
    test.skip(!isCompactViewport(page), 'The launcher is present and used above md');
    await openRevisitStageControls(page);
    await expect(page.getByRole('button', { name: /^(scenario )?workspace$/i })).toBeHidden();
  });

  test('supports explicit simulation time controls', async ({ page }) => {
    // The clock readout is an editable UTC field now, not a read-only `<time>`.
    const timestamp = page.getByRole('textbox', { name: 'Simulation date and time UTC' });
    const initial = await timestamp.inputValue();
    await page.getByRole('button', { name: 'Pause simulation' }).click();
    await expect(page.getByRole('button', { name: 'Play simulation' })).toBeVisible();
    // Hour stepping is a `sm`-and-up affordance; on a phone the same seek is
    // done on the timeline itself, which is keyboard-operable everywhere. The
    // target seeded in `beforeEach` is still in place — this test no longer
    // resets the scenario — so the access lane and its timeline exist.
    if (isCompactViewport(page)) {
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
