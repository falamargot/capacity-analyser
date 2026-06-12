import { describe, expect, it } from 'vitest';
import { fillRateGradientCss, fillRateToColor } from '../FillRateLayer';

describe('fillRateToColor', () => {
  it('maps low fill rate toward blue and high fill rate toward red', () => {
    const low = fillRateToColor(0);
    const mid = fillRateToColor(50);
    const high = fillRateToColor(100);

    expect(low.blue).toBeGreaterThan(low.red);
    expect(mid.red).toBeGreaterThan(mid.blue);
    expect(mid.green).toBeGreaterThan(mid.blue);
    expect(high.red).toBeGreaterThan(high.green);
    expect(high.red).toBeGreaterThan(high.blue);
  });

  it('clamps values outside 0-100', () => {
    const under = fillRateToColor(-20);
    const zero = fillRateToColor(0);
    const over = fillRateToColor(120);
    const hundred = fillRateToColor(100);

    expect(under).toEqual(zero);
    expect(over).toEqual(hundred);
  });

  it('uses softer alpha for nominal cells and stronger alpha for saturated cells', () => {
    expect(fillRateToColor(20).alpha).toBeLessThan(fillRateToColor(95).alpha);
  });

  it('exposes the same color stops to the legend gradient', () => {
    expect(fillRateGradientCss()).toContain('rgb(59,130,246) 0%');
    expect(fillRateGradientCss()).toContain('rgb(234,179,8) 70%');
    expect(fillRateGradientCss()).toContain('rgb(249,115,22) 95%');
    expect(fillRateGradientCss()).toContain('rgb(239,68,68) 100%');
  });
});
