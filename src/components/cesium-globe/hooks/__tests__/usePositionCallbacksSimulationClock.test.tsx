// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Cartographic, JulianDate, Math as CesiumMath, type CallbackPositionProperty } from 'cesium';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClockProvider } from '../../../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../../../time/SimulationClock';
import type { SatelliteData } from '../../../../types/satellites';
import { usePositionCallbacks } from '../usePositionCallbacks';

// usePositionCallbacks shares a module with aircraft dead reckoning. Those
// helpers create canvas glyphs at module load, which jsdom intentionally does
// not implement and which are unrelated to this satellite-only test.
vi.mock('../../utils', () => ({
  getPosition: vi.fn(),
  calculateDeadReckoning: vi.fn(),
}));

const makeSatellite = (
  lat: number,
  sampleTimeMs: number,
  timelineRevision: number,
): SatelliteData => ({
  id: 'sat-1',
  name: 'SAT 1',
  noradId: '1',
  coverageFileId: null,
  type: 'ONEWEB',
  orbitType: 'LEO',
  opsStatus: 'operational',
  satrec: null,
  position: { lat, lng: 0, alt: 1200, sampleTimeMs, timelineRevision },
  capacity: { maxThroughput: 1, bandwidth: { ku: 1, ka: 1 }, availability: 1 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
} as unknown as SatelliteData);

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('usePositionCallbacks simulation timeline integration', () => {
  it('freezes across a seek and resets the interpolation window on the fresh revision', async () => {
    let wallNow = 1_500;
    const clock = createSimulationClock({ now: () => wallNow });
    let callback: CallbackPositionProperty | null = null;

    function Harness({ satellite }: { satellite: SatelliteData }) {
      const { getSatellitePositionCallback } = usePositionCallbacks(
        [satellite], [], undefined, 'test',
      );
      callback = getSatellitePositionCallback(satellite);
      return null;
    }

    const renderSatellite = async (satellite: SatelliteData) => {
      await act(async () => {
        root?.render(
          <SimulationClockProvider clock={clock}>
            <Harness satellite={satellite} />
          </SimulationClockProvider>,
        );
      });
    };

    const callbackLatitude = () => {
      const value = callback?.getValue(JulianDate.now());
      if (!value) throw new Error('position callback returned no value');
      return CesiumMath.toDegrees(Cartographic.fromCartesian(value).latitude);
    };

    await renderSatellite(makeSatellite(0, 1_000, 0));
    const stableCallback = callback;
    await renderSatellite(makeSatellite(10, 2_000, 0));
    expect(callback).toBe(stableCallback);
    expect(callbackLatitude()).toBeCloseTo(5, 6);

    clock.setDateTime(1_000_000);
    wallNow += 50;
    // The old window must not be extrapolated hundreds of kilometres toward
    // the selected date while the new worker response is in flight.
    expect(callbackLatitude()).toBeCloseTo(10, 6);

    await renderSatellite(makeSatellite(48, 1_001_200, 1));
    expect(callback).toBe(stableCallback);
    expect(callbackLatitude()).toBeCloseTo(48, 6);
  });
});
