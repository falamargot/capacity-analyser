import { describe, expect, it } from 'vitest';
import { computeEngineeringCameraCompensation } from '../engineeringCameraCompensation';

describe('computeEngineeringCameraCompensation', () => {
  it('does not compensate when the viewport height is effectively unchanged', () => {
    expect(computeEngineeringCameraCompensation({
      previousViewportHeight: 900,
      visibleViewportHeight: 880,
      currentRangeMeters: 1_000_000,
    })).toMatchObject({
      rangeFactor: 1,
      extraRangeMeters: 0,
    });
  });

  it('scales range from the actual remaining viewport height', () => {
    expect(computeEngineeringCameraCompensation({
      previousViewportHeight: 900,
      visibleViewportHeight: 300,
      currentRangeMeters: 1_000_000,
    })).toMatchObject({
      viewportRatio: 3,
      rangeFactor: 3,
      extraRangeMeters: 2_000_000,
    });
  });

  it('clamps extreme shrinkage to avoid excessive zoom-out', () => {
    expect(computeEngineeringCameraCompensation({
      previousViewportHeight: 1200,
      visibleViewportHeight: 100,
      currentRangeMeters: 1_000_000,
    })).toMatchObject({
      viewportRatio: 12,
      rangeFactor: 3.6,
      extraRangeMeters: 2_600_000,
    });
  });
});
