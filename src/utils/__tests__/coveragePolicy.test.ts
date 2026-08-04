import { describe, expect, it } from 'vitest';
import {
  STANDARD_SERVICE_ELEVATION_DEG,
  STANDARD_ELEVATION_DEG,
  footprintRadiusKm,
  getRadiusAtPowerLevel,
  isRfCoverageSatisfied,
  type CoveragePolicy,
} from '../leoFootprint';

describe('LEO coverage policies', () => {
  const testPoint = { lat: 0, lng: 0 };
  const subSatPoint = { lat: 0, lng: 0 };
  const altitude1200Km = 1200;
  const equatorPointAtRadius = (radiusKm: number) => ({
    lat: 0,
    lng: radiusKm / 6371 * 180 / Math.PI,
  });

  it('keeps guaranteed service-zone radius above the -12 dB threshold radius at 1200 km altitude', () => {
    const serviceZoneRadius = footprintRadiusKm(altitude1200Km, STANDARD_SERVICE_ELEVATION_DEG);
    const thresholdRadius = getRadiusAtPowerLevel(-12);

    // At 55° elevation, 1200 km altitude: footprintRadiusKm ≈ 688 km
    expect(serviceZoneRadius).toBeGreaterThan(thresholdRadius);
    expect(serviceZoneRadius).toBeGreaterThan(600);
    expect(serviceZoneRadius).toBeLessThan(800);
  });

  it('shrinks the service-zone radius when altitude decreases', () => {
    const radiusAt1200Km = footprintRadiusKm(1200, STANDARD_SERVICE_ELEVATION_DEG);
    const radiusAt800Km = footprintRadiusKm(800, STANDARD_SERVICE_ELEVATION_DEG);

    expect(radiusAt800Km).toBeLessThan(radiusAt1200Km);
  });

  it('keeps DB_THRESHOLD behavior unchanged for a near-center point', () => {
    const thresholdPolicy: CoveragePolicy = { type: 'DB_THRESHOLD', thresholdDb: -10 };
    const pointNearSatellite = { lat: 0.001, lng: 0.001 };

    expect(
      isRfCoverageSatisfied(pointNearSatellite, subSatPoint, altitude1200Km, thresholdPolicy)
    ).toBe(true);
  });

  it('supports SERVICE_ZONE policy for near-center coverage checks', () => {
    const serviceZonePolicy: CoveragePolicy = { type: 'SERVICE_ZONE' };
    const pointNearSatellite = { lat: 0.001, lng: 0.001 };

    expect(
      isRfCoverageSatisfied(pointNearSatellite, subSatPoint, altitude1200Km, serviceZonePolicy)
    ).toBe(true);
  });

  it('keeps the guaranteed-zone radius aligned with the standard 55 degree radius', () => {
    const serviceZoneRadius = footprintRadiusKm(altitude1200Km, STANDARD_SERVICE_ELEVATION_DEG);
    const standardRadius = footprintRadiusKm(altitude1200Km, 55);

    expect(serviceZoneRadius).toBeCloseTo(standardRadius, 6);
  });

  it('uses 40 degrees, not 55 degrees, as the SERVICE_ZONE RF availability cutoff', () => {
    const serviceZonePolicy: CoveragePolicy = { type: 'SERVICE_ZONE' };
    const at45Deg = equatorPointAtRadius(footprintRadiusKm(altitude1200Km, 45));
    const at54Deg = equatorPointAtRadius(footprintRadiusKm(altitude1200Km, 54));

    expect(
      isRfCoverageSatisfied(at45Deg, subSatPoint, altitude1200Km, serviceZonePolicy)
    ).toBe(true);
    expect(
      isRfCoverageSatisfied(at54Deg, subSatPoint, altitude1200Km, serviceZonePolicy)
    ).toBe(true);
  });

  it('rejects SERVICE_ZONE RF below the 40 degree terminal threshold', () => {
    const serviceZonePolicy: CoveragePolicy = { type: 'SERVICE_ZONE' };
    const below40 = equatorPointAtRadius(footprintRadiusKm(altitude1200Km, 39));

    expect(
      isRfCoverageSatisfied(below40, subSatPoint, altitude1200Km, serviceZonePolicy)
    ).toBe(false);
  });

  it('handles invalid policies safely', () => {
    const invalidPolicy = { type: 'INVALID' } as any;

    expect(
      isRfCoverageSatisfied(testPoint, subSatPoint, altitude1200Km, invalidPolicy)
    ).toBe(false);
  });

  it('keeps service-zone radius calculation deterministic', () => {
    const serviceZoneRadius1 = footprintRadiusKm(altitude1200Km, STANDARD_ELEVATION_DEG);
    const serviceZoneRadius2 = footprintRadiusKm(altitude1200Km, STANDARD_ELEVATION_DEG);

    expect(Math.abs(serviceZoneRadius1 - serviceZoneRadius2)).toBeLessThan(0.001);
  });

  it('returns booleans for SERVICE_ZONE and DB_THRESHOLD at edge cases', () => {
    const serviceZonePolicy: CoveragePolicy = { type: 'SERVICE_ZONE' };
    const strictThresholdPolicy: CoveragePolicy = { type: 'DB_THRESHOLD', thresholdDb: -3 };
    const moderateDistancePoint = { lat: 2, lng: 2 };

    const serviceZoneResult = isRfCoverageSatisfied(
      moderateDistancePoint,
      subSatPoint,
      altitude1200Km,
      serviceZonePolicy
    );
    const strictResult = isRfCoverageSatisfied(
      moderateDistancePoint,
      subSatPoint,
      altitude1200Km,
      strictThresholdPolicy
    );

    expect(typeof serviceZoneResult).toBe('boolean');
    expect(typeof strictResult).toBe('boolean');
  });
});
