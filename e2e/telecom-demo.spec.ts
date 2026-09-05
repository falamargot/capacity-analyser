import { expect, test } from '@playwright/test';
import { createInitialScenarioState } from '../src/state/scenario/useScenarioState';
import { initialConnectivityScenario } from '../src/state/connectivityScenario/connectivityScenarioReducer';
import type { TelecomSessionSnapshotV1 } from '../src/state/session/telecomSessionSnapshot';

// A real geographic scenario, not a mocked engineering result or backend.
const scenario: TelecomSessionSnapshotV1 = {
  schemaVersion: 1,
  engineeringScenario: createInitialScenarioState({ autoWeatherEnabled: false }),
  connectivityScenario: initialConnectivityScenario,
  selection: { type: 'target', targetType: 'point', position: { lat: 48.85, lng: 2.35 } },
  siteB: null,
  navigation: { satelliteScope: 'GEO', activeConnectivityTab: 'GEO', commercialSelectedSegment: 'summary' },
  geoCoverageSelection: {
    selectedUplinkKey: null, selectedDownlinkKey: null,
    selectedUplinkKeyB: null, selectedDownlinkKeyB: null,
    manualVisibility: { satelliteId: null, keys: [] },
  },
  labels: { siteA: { city: 'Paris', country: 'France' }, siteB: null },
  camera: null,
};

test('mobile engineering inspector is above the result sheet and can be closed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'Mobile result-sheet stacking regression');
  await page.addInitScript(value => {
    sessionStorage.setItem('capacity-analyzer:telecom-session:v1', JSON.stringify(value));
  }, scenario);
  await page.goto('/?mode=engineering');
  await page.getByRole('button', { name: 'Open engineering result story' }).click();
  await page.getByRole('button', { name: /^Scenario:.*Open in Engineering Inspector/ }).click();
  const close = page.getByRole('button', { name: 'Close Engineering Inspector', exact: true });
  await expect(close).toBeVisible();
  await expect.poll(() => close.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit === button || button.contains(hit);
  })).toBe(true);
  await close.click();
  await expect(close).toBeHidden();
  await expect(page.getByRole('button', { name: 'Return to engineering summary' })).toBeVisible();
});
