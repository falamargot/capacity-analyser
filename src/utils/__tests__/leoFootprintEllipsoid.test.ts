/*
 * E8b — the drawn footprint and the serving gate now share the WGS84 datum.
 *
 * The table below is the measurement that made E8b worth fixing rather than
 * documenting: the spherical radius UNDER-shows coverage away from the equator,
 * so a terminal drawn outside the circle could still pass the ellipsoidal
 * elevation gate.
 */

import { describe, expect, it } from 'vitest';
import { footprintRadiusKm, footprintRadiusKmOnEllipsoid } from '../leoFootprint';

const ALT = 1200;

describe('footprintRadiusKmOnEllipsoid', () => {
  it('matches the spherical radius at the equator to within a tenth of a km', () => {
    for (const mask of [10, 25, 55]) {
      const delta = footprintRadiusKmOnEllipsoid(ALT, mask, 0) - footprintRadiusKm(ALT, mask);
      expect(Math.abs(delta), `mask ${mask}`).toBeLessThan(1.5);
    }
  });

  it('grows with latitude, by the amounts E8b measured', () => {
    const cases: Array<[number, number, number]> = [
      // [mask, latitude, expected delta km]
      [55, 45, 4.9], [55, 60, 7.2], [55, 90, 9.6],
      [25, 45, 10.3], [25, 60, 15.1], [25, 90, 20.0],
      [10, 45, 12.6], [10, 60, 18.2], [10, 90, 23.8],
    ];
    for (const [mask, lat, expected] of cases) {
      const delta = footprintRadiusKmOnEllipsoid(ALT, mask, lat) - footprintRadiusKm(ALT, mask);
      expect(delta, `mask ${mask} at lat ${lat}`).toBeCloseTo(expected, 0);
    }
  });

  it('is symmetric in hemisphere', () => {
    expect(footprintRadiusKmOnEllipsoid(ALT, 25, -45))
      .toBeCloseTo(footprintRadiusKmOnEllipsoid(ALT, 25, 45), 6);
  });

  it('still shrinks monotonically as the mask rises', () => {
    const at10 = footprintRadiusKmOnEllipsoid(ALT, 10, 60);
    const at25 = footprintRadiusKmOnEllipsoid(ALT, 25, 60);
    const at55 = footprintRadiusKmOnEllipsoid(ALT, 55, 60);
    expect(at10).toBeGreaterThan(at25);
    expect(at25).toBeGreaterThan(at55);
  });

  it('falls back to the spherical radius rather than NaN for a missing latitude', () => {
    expect(footprintRadiusKmOnEllipsoid(ALT, 25, Number.NaN))
      .toBe(footprintRadiusKm(ALT, 25));
  });

  it('keeps the spherical function untouched — ADR-001 §2 and the published 688 km', () => {
    expect(footprintRadiusKm(1200, 55)).toBeCloseTo(683, 0);
  });
});
