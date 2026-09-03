/*
 * The precipitation→weather mapping decides which rain-fade model the RF chain
 * applies, and it was untestable: two copies of it lived inside `useEffect`
 * closures in `App.tsx`. Extracting it (S-2) is what makes these assertions
 * possible at all — they are the first coverage this rule has had.
 */

import { describe, expect, it } from 'vitest';
import { precipitationToWeatherType } from '../useAutoWeather';

describe('precipitationToWeatherType', () => {
  it('maps the ITU rain-rate bands the link budget is calibrated against', () => {
    expect(precipitationToWeatherType(0)).toBe('clear');
    expect(precipitationToWeatherType(0.5)).toBe('light_rain');
    expect(precipitationToWeatherType(1.0)).toBe('light_rain');
    expect(precipitationToWeatherType(1.01)).toBe('heavy_rain');
    expect(precipitationToWeatherType(5.0)).toBe('heavy_rain');
    expect(precipitationToWeatherType(5.01)).toBe('storm');
    expect(precipitationToWeatherType(120)).toBe('storm');
  });

  /*
   * A missing or malformed reading must read as clear, never as rain: the
   * failure mode of an absent value is a link budget derated for weather that
   * was never observed.
   */
  it('treats a missing or impossible reading as clear, not as rain', () => {
    expect(precipitationToWeatherType(Number.NaN)).toBe('clear');
    expect(precipitationToWeatherType(Number.POSITIVE_INFINITY)).toBe('clear');
    expect(precipitationToWeatherType(-1)).toBe('clear');
  });

  it('is monotone — more rain never means a milder class', () => {
    const order = ['clear', 'light_rain', 'heavy_rain', 'storm'];
    let previous = -1;
    for (const mm of [0, 0.1, 0.9, 1, 2, 4.9, 5, 6, 50]) {
      const rank = order.indexOf(precipitationToWeatherType(mm));
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });
});
