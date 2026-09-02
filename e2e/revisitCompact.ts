/**
 * Compact-viewport helpers (mobile UX plan).
 *
 * Below `md` (768 px) REVISIT opens globe-first: the constellation/target triad
 * is collapsed behind a one-line bar, the analysis column is a sheet closed
 * behind the result strip, and the stage toolbar is behind one button. The
 * specs describe product behaviour, not that layout, so they call these to
 * reach a surface regardless of viewport — on `md` and up each is a no-op
 * because the surface is already open.
 */

import { expect, type Locator, type Page } from '@playwright/test';

const COMPACT_MAX_WIDTH = 768;

export function isCompactViewport(page: Page): boolean {
    return (page.viewportSize()?.width ?? COMPACT_MAX_WIDTH) < COMPACT_MAX_WIDTH;
}

/**
 * Wait for REVISIT to be interactive, whichever surface the viewport opens on:
 * the analysis column on desktop, the result strip on a phone.
 */
export async function waitForRevisitReady(page: Page): Promise<void> {
    const anchor = isCompactViewport(page)
        ? page.locator('[data-revisit-result-strip]')
        : page.getByRole('region', { name: 'REVISIT analysis' });
    await expect(anchor).toBeVisible({ timeout: 30_000 });
}

/**
 * Return a compact viewport to the globe, whichever panel is open.
 *
 * Since Programme 7B exactly one panel can be open, and an open panel physically
 * covers the controls that open the others — the setup triad lives in the
 * `z-100` header and lies over the result strip. So "open X" means "go back to
 * the globe, then open X", which is also the gesture a presenter makes.
 */
export async function closeRevisitPanels(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const triad = page.locator('#revisit-mobile-setup');
    if (await triad.isVisible()) {
        await page.locator('button[aria-controls="revisit-mobile-setup"]').click();
        await expect(triad).toBeHidden();
    }
    const sheet = page.getByRole('region', { name: 'REVISIT analysis' });
    if (await sheet.isVisible()) {
        await page.getByRole('button', { name: 'Close analysis sheet and show the globe' }).click();
        await expect(sheet).toBeHidden();
    }
    // Globe display controls are intentionally always expanded and are no
    // longer one of the mutually exclusive compact panels.
}

/** The constellation / hosted payloads / analysis target triad. */
export async function openRevisitSetup(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const triad = page.locator('#revisit-mobile-setup');
    if (await triad.isVisible()) return;
    await closeRevisitPanels(page);
    await page.locator('button[aria-controls="revisit-mobile-setup"]').click();
    await expect(triad).toBeVisible();
}

/** The analysis column: KPIs, curve, details, export. */
export async function openRevisitAnalysis(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const sheet = page.getByRole('region', { name: 'REVISIT analysis' });
    if (await sheet.isVisible()) return;
    await closeRevisitPanels(page);
    await page.locator('[data-revisit-result-strip]').click();
    await expect(sheet).toBeVisible();
}

/**
 * Reach the globe display toggles, whatever the viewport.
 *
 * Expanded at `md` and above, so this is a no-op there. On a phone the column
 * is a closed disclosure — five 44 px toggles expanded were ~250 px of opaque
 * panel that buried the globe and came to rest over the footer controls, hiding
 * `Pause` behind `Auto-rotate globe`. The toggles are one tap away instead, and
 * behavioural specs should not care which of the two they got.
 */
export async function openRevisitDisplayControls(page: Page): Promise<void> {
    const controls = page.locator('#revisit-stage-controls');
    await expect(controls).toBeVisible();
    await ensureDetailsOpen(controls);
    await expect(page.getByRole('button', { name: 'Orbits', exact: true })).toBeVisible();
}

/** The scene-layer control panel over the globe, in whichever state it opens. */
export async function openRevisitStageControls(page: Page): Promise<void> {
    const controls = page.locator('#revisit-stage-controls');
    await expect(controls).toBeVisible();
}

/**
 * Ready, with the configuration surface reachable.
 *
 * ── WHY THIS NO LONGER OPENS THE ANALYSIS SHEET TOO ─────────────────────────
 * Since Programme 7B a compact viewport has exactly ONE open panel: opening the
 * analysis sheet closes the setup triad, by design. So "everything on screen at
 * once" is no longer a state the product can be in, and a helper that pretended
 * otherwise would silently leave specs asserting against a panel it had just
 * closed. Specs that need the analysis column call `openRevisitAnalysis` at the
 * point they need it — which is also closer to what a user does.
 *
 * The stage toolbar is deliberately not opened here either: several specs
 * assert on what it shows and when, so they open it themselves.
 */
export async function openRevisitSurfaces(page: Page): Promise<void> {
    await waitForRevisitReady(page);
    await openRevisitSetup(page);
}

/** Open the single consolidated analysis view. Kept as a named helper so older
 * feature specs describe their intent without depending on sidebar navigation. */
export async function openRevisitAnalysisTab(
    page: Page, _tab: 'Analysis',
): Promise<void> {
    await openRevisitAnalysis(page);
}

/**
 * Ensure a `<details>` is open.
 *
 * `getAttribute('open')` returns the EMPTY STRING for a valueless attribute,
 * which is falsy — so `if (!(await d.getAttribute('open'))) click()` closes a
 * disclosure that was already open. The sizing evidence defaults to open above
 * `md`, so that inverted guard was shutting it and then waiting 30 s for
 * content it had just hidden. Read the live property instead.
 */
export async function ensureDetailsOpen(details: Locator): Promise<void> {
    if (await details.evaluate((node) => (node as HTMLDetailsElement).open)) return;
    await details.locator('summary').first().click();
    await expect(details).toHaveAttribute('open', /.*/);
}

/**
 * Activate the primary target.
 *
 * REVISIT opens with NO target selected — a deliberate, validated behaviour:
 * the module starts on an empty analysis and the user chooses a point or a
 * polygon to begin. The scenario still carries the default location, so
 * choosing `Point` here starts the analysis on it; this helper exists purely so
 * specs written before that change can reach the state they were describing,
 * in the same two taps a user makes.
 *
 * Idempotent: a spec that already has a target can call it safely.
 */
export async function seedReferenceTarget(page: Page): Promise<void> {
    await openRevisitSetup(page);
    const add = page.getByRole('button', { name: 'Add primary target' });
    if (await add.count() === 0) return;
    await add.click();
    await page.getByRole('menuitem', { name: 'Add Primary point target' }).click();
    const canvas = page.locator('.cesium-widget canvas');
    await expect(canvas).toHaveCSS('cursor', 'crosshair');
    const box = await canvas.boundingBox();
    if (!box) throw new Error('Revisit globe canvas is not visible');
    await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 }, force: true });
    await expect(add).toHaveCount(0);
}

/** Create an empty secondary Point row through the polymorphic add control. */
export async function addSecondaryPoint(page: Page): Promise<void> {
    await openRevisitSetup(page);
    const addReference = page.getByRole('button', { name: 'Add primary target' });
    if (await addReference.isVisible()) {
        await addReference.click({ force: true });
        await page.getByRole('menuitem', { name: 'Add Primary point target' }).click({ force: true });
        const canvas = page.locator('.cesium-widget canvas');
        const box = await canvas.boundingBox();
        if (!box) throw new Error('Revisit globe canvas is not visible');
        await canvas.click({ position: { x: box.width * 0.5, y: box.height * 0.5 }, force: true });
    }
    await page.getByRole('button', { name: 'Add secondary target' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Add Secondary point target' }).click({ force: true });
}

/**
 * Reopen the area editor after navigating away.
 *
 * Its popover is dismissed by a click outside, which since Programme 7B
 * includes every panel switch — so a spec that leaves the configuration surface
 * and comes back has to ask for it again, exactly as a user would.
 */
export async function openAreaEditor(page: Page): Promise<void> {
    await openRevisitSetup(page);
    const editor = page.getByRole('dialog', { name: 'Define area target' });
    if (await editor.isVisible()) return;
    await page.getByRole('button', { name: 'Define area target' }).click();
    await expect(editor).toBeVisible();
}

/**
 * Create the unique Area row and leave its definition panel open.
 *
 * `Polygon` now goes straight to the globe — manual drawing is the default
 * path — so the editor is reached the way a user with a coordinate list reaches
 * it: from the drawing toolbar, which is where import and paste live.
 */
export async function addSecondaryArea(page: Page): Promise<void> {
    await openRevisitSetup(page);
    await page.getByRole('button', { name: 'Add secondary target' }).click({ force: true });
    await page.getByRole('menuitem', { name: 'Add Secondary polygon target' }).click({ force: true });
    await openAreaEditorFromDrawing(page);
    await expect(page.getByRole('dialog', { name: 'Define area target' })).toBeVisible();
}


/**
 * Paste a boundary into an area editor and apply it.
 *
 * The coordinate box is a disclosure whose state depends on how the editor was
 * reached — open when the user asked for "Import or paste a boundary instead",
 * collapsed otherwise — so a spec that always clicks the summary toggled it
 * shut half the time. Ask for the box, not for the click.
 */
export async function pasteAreaBoundary(scope: Locator, coordinates: string): Promise<void> {
    const box = scope.getByLabel('Custom area coordinate list');
    if (!(await box.isVisible())) {
        await scope.getByText('Paste coordinate list', { exact: true }).click({ force: true });
    }
    await box.fill(coordinates);
    await scope.getByRole('button', { name: 'Apply list' }).click();
}

/**
 * Leave the polygon drawing toolbar for the editor. Drawing ends and the empty
 * draft is kept, which is what "import or paste instead" means.
 */
export async function openAreaEditorFromDrawing(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Import or paste', exact: true })
        .click({ force: true });
}

/**
 * Wait until nothing on the page is still being computed.
 *
 * The readiness chip is not the last word. `reconcileToMeasuredBest` moves the
 * selection to the measured-best topology AFTER the fleet sizing lands, and the
 * chip already reads "Ready to present" during that window — a capture taken
 * there records the pre-reconcile worst case. On phone-390x844 that was 5 h 49
 * min against the settled 3 h 26 min, which is what made the visual gate
 * unstable; the failure snapshot, taken moments later, showed 3 h 26 min.
 *
 * The visual captures freeze the clock, so rendered text changes only when a
 * computation lands. Two identical samples a second apart therefore mean every
 * pending recomputation has been applied.
 */
export async function waitForRevisitResultSettled(page: Page): Promise<void> {
  await expect(page.locator('[data-revisit-readiness]'))
    .toHaveAttribute('data-revisit-readiness', 'Ready to present', { timeout: 60_000 });
  let previous = '';
  await expect.poll(async () => {
    const current = await page.evaluate(() => document.body.innerText);
    const settled = current.length > 0 && current === previous;
    previous = current;
    return settled;
  }, { timeout: 60_000, intervals: [1_000] }).toBe(true);
}
