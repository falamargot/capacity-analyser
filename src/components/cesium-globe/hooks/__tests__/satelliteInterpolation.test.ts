import { describe, expect, it } from 'vitest';
import {
  SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS,
  SATELLITE_MAX_EXTRAPOLATION_MS,
  getInterpolatedSatellitePosition,
  resolveDisplayedSatellitePosition,
  type SatelliteSampleWindow,
} from '../satelliteInterpolation';

const position = (lat: number) => ({ lat, lng: lat * 2, alt: 1200 + lat });

describe('signed satellite interpolation', () => {
  it('resolves the same midpoint for ascending and descending sample times', () => {
    const ascending = getInterpolatedSatellitePosition(
      position(0), position(10), 0, 1000, 500,
    );
    const descending = getInterpolatedSatellitePosition(
      position(0), position(10), 1000, 0, 500,
    );

    expect(ascending).toEqual(position(5));
    expect(descending).toEqual(position(5));
  });

  it('interpolates a reverse window continuously from the newer date to the older date', () => {
    const window: SatelliteSampleWindow = {
      previousPosition: position(0),
      currentPosition: position(10),
      previousSampleTimeMs: 10_000,
      currentSampleTimeMs: 8_000,
    };

    expect(resolveDisplayedSatellitePosition(window, 10_000).lat).toBe(0);
    expect(resolveDisplayedSatellitePosition(window, 9_500).lat).toBe(2.5);
    expect(resolveDisplayedSatellitePosition(window, 9_000).lat).toBe(5);
    expect(resolveDisplayedSatellitePosition(window, 8_500).lat).toBe(7.5);
    expect(resolveDisplayedSatellitePosition(window, 8_000).lat).toBe(10);
  });

  it('keeps real-time extrapolation bounds invariant at accelerated rates', () => {
    const normalWindow: SatelliteSampleWindow = {
      previousPosition: position(0),
      currentPosition: position(10),
      previousSampleTimeMs: 0,
      currentSampleTimeMs: 1000,
    };
    const tenTimesWindow: SatelliteSampleWindow = {
      previousPosition: position(0),
      currentPosition: position(10),
      previousSampleTimeMs: 0,
      currentSampleTimeMs: 10_000,
    };

    const normalBefore = resolveDisplayedSatellitePosition(
      normalWindow,
      -SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS,
      1,
    );
    const acceleratedBefore = resolveDisplayedSatellitePosition(
      tenTimesWindow,
      -(SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS * 10),
      10,
    );
    expect(acceleratedBefore).toEqual(normalBefore);

    const normalAfter = resolveDisplayedSatellitePosition(
      normalWindow,
      1000 + SATELLITE_MAX_EXTRAPOLATION_MS,
      1,
    );
    const acceleratedAfter = resolveDisplayedSatellitePosition(
      tenTimesWindow,
      10_000 + (SATELLITE_MAX_EXTRAPOLATION_MS * 10),
      10,
    );
    expect(acceleratedAfter).toEqual(normalAfter);
  });

  it('applies the same bounded extrapolation semantics to reverse windows', () => {
    const reverseWindow: SatelliteSampleWindow = {
      previousPosition: position(0),
      currentPosition: position(10),
      previousSampleTimeMs: 10_000,
      currentSampleTimeMs: 0,
    };

    const atForwardBound = resolveDisplayedSatellitePosition(
      reverseWindow,
      -(SATELLITE_MAX_EXTRAPOLATION_MS * 10),
      10,
    );
    const beyondForwardBound = resolveDisplayedSatellitePosition(
      reverseWindow,
      -(SATELLITE_MAX_EXTRAPOLATION_MS * 10) - 50_000,
      10,
    );
    expect(beyondForwardBound).toEqual(atForwardBound);

    const atBackwardBound = resolveDisplayedSatellitePosition(
      reverseWindow,
      10_000 + (SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS * 10),
      10,
    );
    const beyondBackwardBound = resolveDisplayedSatellitePosition(
      reverseWindow,
      10_000 + (SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS * 10) + 50_000,
      10,
    );
    expect(beyondBackwardBound).toEqual(atBackwardBound);
  });

  it('uses the current position for a zero-duration sample window', () => {
    expect(getInterpolatedSatellitePosition(
      position(0), position(10), 500, 500, 500,
    )).toEqual(position(10));
  });
});
