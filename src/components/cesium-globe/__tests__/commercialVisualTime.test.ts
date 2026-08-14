import { describe, expect, it, vi } from 'vitest';
import { elapsedVisualSeconds, visualNowSeconds } from '../commercialVisualTime';

describe('commercial visual animation clock', () => {
  it('measures elapsed wall time independently of the Cesium simulation date', () => {
    expect(elapsedVisualSeconds(100, 100.18)).toBeCloseTo(0.18, 8);
  });

  it('does not produce negative reveal progress if the wall clock moves backwards', () => {
    expect(elapsedVisualSeconds(100, 42)).toBe(0);
  });

  it('uses the current wall clock as its default source', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123_450);
    expect(visualNowSeconds()).toBe(123.45);
    expect(elapsedVisualSeconds(120)).toBeCloseTo(3.45, 8);
    vi.restoreAllMocks();
  });
});
