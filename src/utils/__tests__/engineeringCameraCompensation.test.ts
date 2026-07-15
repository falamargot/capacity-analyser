import { describe, expect, it } from 'vitest';
import { computeEngineeringCameraCompensation, shouldApplyEngineeringCameraFocus } from '../engineeringCameraCompensation';

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

describe('shouldApplyEngineeringCameraFocus', () => {
  it('keeps visible evidence stationary and gives recent manual camera input priority', () => {
    expect(shouldApplyEngineeringCameraFocus({ nowMs: 2_000, lastManualInputMs: 0, allTargetsVisible: true })).toBe(false);
    expect(shouldApplyEngineeringCameraFocus({ nowMs: 2_000, lastManualInputMs: 1_500, allTargetsVisible: false })).toBe(false);
  });

  it('reframes obscured locked evidence and permits an explicit route-view reset', () => {
    expect(shouldApplyEngineeringCameraFocus({ nowMs: 2_000, lastManualInputMs: 0, allTargetsVisible: false })).toBe(true);
    expect(shouldApplyEngineeringCameraFocus({ nowMs: 2_000, lastManualInputMs: 0, allTargetsVisible: true, forceRouteView: true })).toBe(true);
  });
});
