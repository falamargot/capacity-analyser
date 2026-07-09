import { describe, expect, it } from 'vitest';

import type { SatelliteData } from '../../types/satellites';
import {
  HANDOVER_FREE_WINDOW_MIN,
  PASS_MAX_DURATION_ABOVE_MASK_MIN,
  STABILITY_HIGH_MIN_REMAINING_MIN,
  buildLeoPassWindowEvidence,
  expectedHandoversFromPassWindow,
  stabilityFromPassWindows,
} from '../leoPassWindow';

const makeSatellite = (position: SatelliteData['position']): SatelliteData => ({
  id: 'LEO-TEST',
  name: 'LEO TEST',
  noradId: '1',
  coverageFileId: null,
  type: 'ONEWEB',
  orbitType: 'LEO',
  opsStatus: 'operational',
  satrec: null,
  position,
  capacity: {
    maxThroughput: 7.2,
    bandwidth: { ku: 250, ka: 100 },
    availability: 0.99,
  },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
});

describe('leoPassWindow', () => {
  it('returns no evidence when satellite or point is missing', () => {
    const evidence = buildLeoPassWindowEvidence({ satellite: null, point: { lat: 0, lng: 0 } });

    expect(evidence.isCurrentlyVisible).toBe(false);
    expect(evidence.label).toBe('No pass evidence available');
  });

  it('reports current pass evidence from the current satellite position', () => {
    const evidence = buildLeoPassWindowEvidence({
      satellite: makeSatellite({ lat: 0, lng: 0, alt: 1200, isPositionValid: true }),
      point: { lat: 0, lng: 0 },
      horizonMin: 5,
      stepSec: 30,
    });

    expect(evidence.isCurrentlyVisible).toBe(true);
    expect(evidence.currentPassRemainingMin).not.toBeNull();
    expect(evidence.passApexElevationDeg).not.toBeNull();
  });

  it('derives expected handovers and stability from pass-window evidence', () => {
    const stable = {
      isCurrentlyVisible: true,
      currentPassRemainingMin: 5.5,
      nextPassInMin: null,
      nextPassDurationMin: 5.5,
      passApexElevationDeg: 80,
      sampledWindowMin: 30,
      thresholdElevationDeg: 40,
      label: 'stable',
    };
    const weak = { ...stable, currentPassRemainingMin: 1, nextPassDurationMin: 1, passApexElevationDeg: 42 };

    expect(expectedHandoversFromPassWindow(stable)).toBe(0);
    expect(expectedHandoversFromPassWindow(weak)).toBe(2);
    expect(stabilityFromPassWindows(stable, stable, 80, 80)).toBe('High');
    expect(stabilityFromPassWindows(weak, stable, 42, 80)).toBe('Low');
  });

  // L-Mo4 regression: above the 40° user mask the longest possible pass is
  // ≈ 6 min, so the good end of every scale must be reachable within that.
  describe('threshold calibration matches the 40°-mask pass reality (L-Mo4)', () => {
    const passWindow = (remainingMin: number, apexDeg: number) => ({
      isCurrentlyVisible: true,
      currentPassRemainingMin: remainingMin,
      nextPassInMin: null,
      nextPassDurationMin: remainingMin,
      passApexElevationDeg: apexDeg,
      sampledWindowMin: 30,
      thresholdElevationDeg: 40,
      label: 'test',
    });

    it('thresholds live inside the physically possible pass duration', () => {
      expect(HANDOVER_FREE_WINDOW_MIN).toBeLessThan(PASS_MAX_DURATION_ABOVE_MASK_MIN);
      expect(STABILITY_HIGH_MIN_REMAINING_MIN).toBeLessThan(PASS_MAX_DURATION_ABOVE_MASK_MIN);
    });

    it('a fresh near-overhead pass reaches High stability and 0 expected handovers', () => {
      const fresh = passWindow(5.5, 85);
      expect(expectedHandoversFromPassWindow(fresh)).toBe(0);
      expect(stabilityFromPassWindows(fresh, fresh, 85, 85)).toBe('High');
    });

    it('a mid pass reads Medium with one expected handover', () => {
      const mid = passWindow(3, 55);
      expect(expectedHandoversFromPassWindow(mid)).toBe(1);
      expect(stabilityFromPassWindows(mid, mid, 55, 55)).toBe('Medium');
    });

    it('an ending pass reads Low with imminent handovers', () => {
      const ending = passWindow(0.5, 45);
      expect(expectedHandoversFromPassWindow(ending)).toBe(2);
      expect(stabilityFromPassWindows(ending, ending, 45, 45)).toBe('Low');
    });
  });
});
