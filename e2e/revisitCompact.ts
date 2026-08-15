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

import { expect, type Page } from '@playwright/test';

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

/** The constellation / hosted payloads / analysis target triad. */
export async function openRevisitSetup(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const triad = page.locator('#revisit-mobile-setup');
    if (await triad.isVisible()) return;
    await page.locator('button[aria-controls="revisit-mobile-setup"]').click();
    await expect(triad).toBeVisible();
}

/** The analysis column: KPIs, curve, details, export. */
export async function openRevisitAnalysis(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const sheet = page.getByRole('region', { name: 'REVISIT analysis' });
    if (await sheet.isVisible()) return;
    await page.locator('[data-revisit-result-strip]').click();
    await expect(sheet).toBeVisible();
}

/** Back / presenter / scenarios / reset and the scene-layer toggles. */
export async function openRevisitStageControls(page: Page): Promise<void> {
    if (!isCompactViewport(page)) return;
    const controls = page.locator('#revisit-stage-controls');
    if (await controls.isVisible()) return;
    await page.getByRole('button', { name: 'Globe and scenario controls' }).click();
    await expect(controls).toBeVisible();
}

/**
 * Everything a spec written against the desktop layout expects to be on screen.
 * The stage toolbar is deliberately NOT opened here — several specs assert on
 * what it shows and when, so they open it themselves.
 */
export async function openRevisitSurfaces(page: Page): Promise<void> {
    await waitForRevisitReady(page);
    await openRevisitSetup(page);
    await openRevisitAnalysis(page);
}
