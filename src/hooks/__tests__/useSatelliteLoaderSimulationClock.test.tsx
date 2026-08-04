// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationClockProvider } from '../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../time/SimulationClock';
import type { SatelliteData } from '../../types/satellites';
import type {
  SatellitePositionWorkerInput,
  SatellitePositionWorkerOutput,
} from '../../workers/satellitePositionProtocol';
import { useSatelliteLoader } from '../useSatelliteLoader';
import { createSatelliteRenderWindow, resolveDisplayedSatellitePosition } from '../../components/cesium-globe/hooks/satelliteInterpolation';

const satelliteFixture = {
  id: 'sat-1',
  name: 'SAT 1',
  noradId: '1',
  coverageFileId: null,
  type: 'ONEWEB',
  orbitType: 'LEO',
  opsStatus: 'operational',
  satrec: { satnum: '1' },
  position: { lat: 0, lng: 0, alt: 1200, sampleTimeMs: 0 },
  capacity: { maxThroughput: 1, bandwidth: { ku: 1, ka: 1 }, availability: 1 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
} as unknown as SatelliteData;

vi.mock('../../services/satelliteService', () => ({
  fetchSatellites: vi.fn(async () => [satelliteFixture]),
}));

vi.mock('../../utils/coverageCalculator', () => ({
  calculateCoverages: vi.fn(() => []),
}));

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent<SatellitePositionWorkerOutput>) => void) | null = null;
  onerror: (() => void) | null = null;
  readonly messages: SatellitePositionWorkerInput[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: SatellitePositionWorkerInput) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

let root: Root | null = null;
let container: HTMLDivElement;
let latestSatellites: SatelliteData[] = [];

function Harness() {
  const { satellites } = useSatelliteLoader({
    selectedSatelliteId: null,
    hoveredSatelliteId: null,
  });
  latestSatellites = satellites;
  return <output>{satellites.length}</output>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  FakeWorker.instances = [];
  latestSatellites = [];
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSatelliteLoader simulation timeline integration', () => {
  it('keeps authoritative analysis and displayed geometry aligned at -100x, pause, and +100x', async () => {
    let wallNow = 10_000;
    const clock = createSimulationClock({ now: () => wallNow });

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <Harness />
        </SimulationClockProvider>,
      );
    });
    await act(async () => Promise.resolve());
    await act(async () => vi.advanceTimersByTimeAsync(500));

    for (const [index, speed] of [-100, 0, 100].entries()) {
      wallNow += 25;
      await act(async () => clock.setSpeed(speed));
      const worker = FakeWorker.instances.at(-1)!;
      const request = worker.messages.find(
        (message): message is Extract<SatellitePositionWorkerInput, { type: 'propagate' }> => message.type === 'propagate',
      )!;
      const exactLat = 10 + index;
      const renderLat = speed === 0 ? exactLat : exactLat + Math.sign(speed) * 2;
      const exactPosition = {
        id: 'sat-1', lat: exactLat, lng: 20 + index, alt: 1200,
        sampleTimeMs: request.timestamp, isValid: true,
      };
      const renderPosition = {
        id: 'sat-1',
        lat: renderLat,
        lng: speed === 0 ? 20 + index : 22 + index,
        alt: speed === 0 ? 1200 : 1201,
        sampleTimeMs: request.renderTimestamp, isValid: true,
      };

      await act(async () => {
        worker.onmessage?.({ data: {
          requestId: request.requestId,
          timelineRevision: request.timelineRevision,
          timestamp: request.timestamp,
          renderTimestamp: request.renderTimestamp,
          positions: [exactPosition],
          renderPositions: [renderPosition],
        } } as MessageEvent<SatellitePositionWorkerOutput>);
      });

      const published = latestSatellites[0];
      // Connectivity and coverage consume the exact authoritative position.
      expect(published.position).toMatchObject({
        lat: exactLat,
        sampleTimeMs: request.timestamp,
        timelineRevision: request.timelineRevision,
      });
      // Cesium consumes the exact→lookahead bracket and must resolve the exact
      // endpoint on the very first frame after the clock command.
      const window = createSatelliteRenderWindow(
        published.position,
        published.renderPosition,
        request.timestamp,
      );
      expect(resolveDisplayedSatellitePosition(window, request.timestamp, Math.abs(speed))).toEqual({
        lat: exactLat,
        lng: 20 + index,
        alt: 1200,
      });
      expect(published.renderPosition?.sampleTimeMs).toBe(request.renderTimestamp);
    }
  });

  it('recycles the worker and posts one immediate request for each clock command', async () => {
    let wallNow = 10_000;
    const clock = createSimulationClock({ now: () => wallNow });

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <Harness />
        </SimulationClockProvider>,
      );
    });
    await act(async () => Promise.resolve());
    expect(container.textContent).toBe('1');

    // Initial worker tick waits for the async satellite load, then posts once.
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(FakeWorker.instances).toHaveLength(1);
    const initialWorker = FakeWorker.instances[0];
    expect(initialWorker.messages.map((message) => message.type)).toEqual(['init', 'propagate']);
    expect(vi.getTimerCount()).toBe(2); // hourly TLE refresh + one propagation tick

    await act(async () => clock.setDateTime(1_000_000));
    expect(initialWorker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(2);

    const seekWorker = FakeWorker.instances[1];
    expect(seekWorker.messages.map((message) => message.type)).toEqual(['init', 'propagate']);
    const seekRequest = seekWorker.messages.find(
      (message): message is Extract<SatellitePositionWorkerInput, { type: 'propagate' }> => (
        message.type === 'propagate'
      ),
    );
    expect(seekRequest).toMatchObject({
      timelineRevision: 1,
      timestamp: 1_000_000,
      renderTimestamp: 1_001_200,
    });
    expect(vi.getTimerCount()).toBe(2);

    wallNow += 100;
    await act(async () => clock.setSpeed(-5));
    expect(seekWorker.terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(3);

    const reverseRequest = FakeWorker.instances[2].messages.find(
      (message): message is Extract<SatellitePositionWorkerInput, { type: 'propagate' }> => (
        message.type === 'propagate'
      ),
    );
    // At 1x the scenario advanced 100 ms before switching direction; the
    // signed 1.2 s real lookahead becomes 6 s backwards at -5x.
    expect(reverseRequest).toMatchObject({
      timelineRevision: 2,
      timestamp: 1_000_100,
      renderTimestamp: 994_100,
    });
    expect(vi.getTimerCount()).toBe(2);

    wallNow += 100;
    await act(async () => clock.setSpeed(0));
    expect(FakeWorker.instances[2].terminated).toBe(true);
    expect(FakeWorker.instances).toHaveLength(4);
    const pauseRequest = FakeWorker.instances[3].messages.find(
      (message): message is Extract<SatellitePositionWorkerInput, { type: 'propagate' }> => (
        message.type === 'propagate'
      ),
    );
    expect(pauseRequest).toMatchObject({
      timelineRevision: 3,
      timestamp: 999_600,
      renderTimestamp: 999_600,
    });

    await act(async () => root?.unmount());
    root = null;
    expect(FakeWorker.instances[3].terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
