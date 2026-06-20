import { describe, expect, it } from 'vitest';

import type { SatelliteData } from '../../types/satellites';
import { buildLeoPassWindowEvidence, expectedHandoversFromPassWindow, stabilityFromPassWindows } from '../leoPassWindow';

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
      currentPassRemainingMin: 14,
      nextPassInMin: null,
      nextPassDurationMin: 14,
      passApexElevationDeg: 60,
      sampledWindowMin: 30,
      thresholdElevationDeg: 10,
      label: 'stable',
    };
    const weak = { ...stable, currentPassRemainingMin: 4, nextPassDurationMin: 4, passApexElevationDeg: 18 };

    expect(expectedHandoversFromPassWindow(stable)).toBe(0);
    expect(expectedHandoversFromPassWindow(weak)).toBe(2);
    expect(stabilityFromPassWindows(stable, stable, 60, 60)).toBe('High');
    expect(stabilityFromPassWindows(weak, stable, 18, 60)).toBe('Low');
  });
});
