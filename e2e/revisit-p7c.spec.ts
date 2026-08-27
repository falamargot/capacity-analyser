import { expect, test, type Page } from '@playwright/test';
import { addSecondaryArea, openAreaEditor, openRevisitSurfaces,
  seedReferenceTarget,
} from './revisitCompact';

/**
 * Programme 7C — the freshness contract.
 *
 * A single assertion at the end of an interaction cannot catch a stale frame:
 * by the time it runs, the correct value has usually arrived. So these tests
 * record EVERY rendered state of the customer result card through a
 * MutationObserver and then assert that no recorded frame was self-
 * contradictory — the previous question's number under the new question's
 * heading.
 *
 * The complement matters just as much: a continuous change must NOT blank the
 * headline, and changing the requirement must not produce a loading state at
 * all, because it recomputes nothing (plan, Programme 7 decision 4).
 */

const CARD = '.revisit-customer-result';

declare global {
  interface Window {
    __revisitFrames?: string[];
  }
}

/** Record every rendered state of the card until `stopRecording` reads them. */
async function startRecording(page: Page): Promise<void> {
  await page.evaluate((selector) => {
    const card = document.querySelector(selector);
    if (!card) throw new Error('customer result card not mounted');
    window.__revisitFrames = [(card as HTMLElement).innerText];
    const observer = new MutationObserver(() => {
      const node = document.querySelector(selector) as HTMLElement | null;
      if (node) window.__revisitFrames!.push(node.innerText);
    });
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
    });
  }, CARD);
}

async function stopRecording(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__revisitFrames ?? []);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.clear();
    localStorage.setItem('capacity-analyzer:revisit-independent-scenario-notice', 'dismissed');
  });
  await page.goto('/?mode=revisit');
  await openRevisitSurfaces(page);
  // REVISIT opens with no target selected; these specs describe the state
  // after one has been chosen.
  await seedReferenceTarget(page);
});

test.describe('REVISIT P7C freshness contract', () => {
  test('never shows the previous target’s number under the new target’s question', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Engine-freshness contract, not a layout one');
    const card = page.locator(CARD);
    const gapOf = (text: string) => text.match(/Maximum revisit gap\s*\n?\s*([^\n]+)/)?.[1]?.trim();

    await expect(card).toContainText('London');
    await expect(card).toContainText(/Maximum revisit gap\s*\n?\s*\d/, { timeout: 60_000 });
    const londonGap = gapOf(await card.innerText());
    expect(londonGap).toBeTruthy();

    await startRecording(page);
    await page.getByRole('combobox', { name: 'Target', exact: true }).selectOption('Singapore');
    await expect(card).toContainText('Singapore');
    await expect(card).toContainText(/Maximum revisit gap\s*\n?\s*\d/, { timeout: 60_000 });
    const frames = await stopRecording(page);
    const singaporeGap = gapOf(await card.innerText());

    // The identity change must have been observable at all — otherwise the
    // recording proves nothing.
    const singaporeFrames = frames.filter((frame) => frame.includes('Singapore'));
    expect(singaporeFrames.length).toBeGreaterThan(0);

    /*
     * The STRUCTURAL assertion, and the one that matters: between the question
     * changing and the new figure arriving, the card must have passed through a
     * state with no figure at all. Comparing the two cities' formatted gaps
     * cannot stand alone — they can coincide, and did: at one epoch London and
     * Singapore both measured 6 h 7 min, which made an earlier version of this
     * test report a defect that was not there.
     */
    const withoutFigure = singaporeFrames.filter(
      (frame) => /Maximum revisit gap\s*\n\s*(—|measuring…)/.test(frame)
    );
    expect(
      withoutFigure.length,
      `no empty-figure frame between the two targets:\n${singaporeFrames.slice(0, 3).join('\n---\n')}`
    ).toBeGreaterThan(0);

    // And the value-based check, kept but only where it can discriminate.
    if (singaporeGap !== londonGap) {
      const contradictory = singaporeFrames.filter(
        (frame) => frame.includes(`Maximum revisit gap\n${londonGap}`)
      );
      expect(contradictory, `stale frames:\n${contradictory.slice(0, 3).join('\n---\n')}`).toEqual([]);
    }
  });

  /*
   * Decision 4: the requirement is component state, not part of the scenario.
   * Changing it re-derives the verdict and the recommendation from results that
   * already exist, so a loading state here would be a regression, not caution.
   */
  test('changes the requirement with no loading state anywhere', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Engine-freshness contract, not a layout one');
    const card = page.locator(CARD);

    // Wait for a fully settled result, sweep included.
    await expect(card).toContainText('Recommended configuration');
    await expect(card).not.toContainText('Calculating fleet sizing', { timeout: 60_000 });

    await startRecording(page);
    await page.getByRole('combobox', { name: 'Revisit requirement' }).selectOption(String(24 * 3600_000));
    await expect(card).toContainText('at least every 24 h');
    await expect(card).toContainText('Requirement covered');
    const frames = await stopRecording(page);

    expect(frames.some((frame) => frame.includes('Calculating fleet sizing'))).toBe(false);
    expect(frames.some((frame) => frame.includes('measuring…'))).toBe(false);
  });

  /*
   * The other half of the contract. Retention across a CONTINUOUS change is
   * deliberate: blanking the headline on every cran of the payload slider would
   * strobe the one number the room is looking at.
   */
  test('keeps the headline readable across a continuous change', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Engine-freshness contract, not a layout one');
    const card = page.locator(CARD);
    await expect(card).toContainText(/Maximum revisit gap\s*\n?\s*\d/, { timeout: 60_000 });

    await startRecording(page);
    const slider = page.getByRole('slider', { name: 'Number of hosted payloads' });
    for (let step = 0; step < 3; step += 1) await slider.press('ArrowRight');
    await expect(card).toContainText(/Maximum revisit gap\s*\n?\s*\d/, { timeout: 60_000 });
    const frames = await stopRecording(page);

    // The subject never changed, so no frame may have lost the figure.
    const blanked = frames.filter((frame) => /Maximum revisit gap\s*\n\s*(—|measuring…)/.test(frame));
    expect(blanked, `blanked frames:\n${blanked.slice(0, 3).join('\n---\n')}`).toEqual([]);
  });

  test('drops the previous area’s result the moment the polygon changes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium', 'Engine-freshness contract, not a layout one');
    const card = page.locator(CARD);
    const summary = page.getByRole('region', { name: 'Area result summary' });

    await addSecondaryArea(page);
    const area = page.getByRole('region', { name: 'Area coverage' });
    await area.getByLabel('Custom area name').fill('Customer AOI');
    await area.getByText('Paste coordinate list', { exact: true }).click();
    await area.getByLabel('Custom area coordinate list').fill('15, 35\n15, 45\n25, 45\n25, 35');
    await area.getByRole('button', { name: 'Apply list' }).click();
    await expect(summary).toContainText('Least-covered cell', { timeout: 60_000 });
    await expect(card).toContainText(/Maximum revisit gap · least-covered cell\s*\n?\s*\d/, { timeout: 60_000 });
    const firstGap = (await card.innerText())
      .match(/Maximum revisit gap · least-covered cell\s*\n?\s*([^\n]+)/)?.[1]?.trim();
    expect(firstGap).toBeTruthy();

    // A different polygon, far enough north that its worst cell cannot be the
    // same measurement — and the previous figure must not survive the change.
    await startRecording(page);
    await openAreaEditor(page);
    await area.getByLabel('Custom area coordinate list').fill('58, -10\n58, 10\n70, 10\n70, -10');
    await area.getByRole('button', { name: 'Apply list' }).click();

    // Immediately after applying, the old worst cell must already be gone.
    await expect(card).not.toContainText(`Maximum revisit gap · least-covered cell\n${firstGap}`, {
      timeout: 10_000,
    });
    await expect(summary).toContainText('Least-covered cell', { timeout: 60_000 });
    const frames = await stopRecording(page);
    expect(frames.length).toBeGreaterThan(0);
  });
});
