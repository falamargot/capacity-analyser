/**
 * Lot-2 regression tests:
 *
 *  L-M4  — calculateCombGeometry caches per (satrec, time, simulation state):
 *          repeated calls in the same tick return the same reference instead of
 *          re-running SGP4 + 16-ellipse generation (~10×/s before the fix).
 *  L-Mo5 — selectSnpForSatellite is the canonical max-feeder-elevation SNP
 *          selector shared by route resolution, inspection and rendering.
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

import { SNPS_DATA } from '../../components/globe/GlobeConfig';
import { calculateElevationAngle } from '../capacityCalculator';
import { MIN_SNP_GATEWAY_ELEVATION_DEG } from '../leoFootprint';
import { calculateCombGeometry } from '../oneWebComb';
import { selectSnpForSatellite } from '../connectivityRules';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import { DEFAULT_BEAM_HEALTH } from '../realisticSimulation';
import { buildOrbitFixture, makeOneWebSatellite } from './helpers/leoOrbitFixture';

const orbit = buildOrbitFixture();
const simulationState = buildSimulationStateSnapshot({
  coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
  weatherCondition: 'CLEAR',
  beamHealthFactors: DEFAULT_BEAM_HEALTH,
  hsBeams: new Set<number>(),
});

describe('L-M4 — comb geometry cache', () => {
  it('returns the identical polygon array for repeated calls with the same inputs', () => {
    const time = JulianDate.fromDate(orbit.time);
    const first = calculateCombGeometry(orbit.satrec, time, simulationState);
    const second = calculateCombGeometry(orbit.satrec, time, simulationState);
    expect(first).not.toBeNull();
    expect(second).toBe(first); // same reference — cache hit
  });

  it('recomputes when the time advances', () => {
    const t1 = JulianDate.fromDate(orbit.time);
    const t2 = JulianDate.fromDate(new Date(orbit.time.getTime() + 1000));
    const first = calculateCombGeometry(orbit.satrec, t1, simulationState);
    const second = calculateCombGeometry(orbit.satrec, t2, simulationState);
    expect(second).not.toBe(first);
  });

  it('recomputes when the simulation state changes (weather)', () => {
    const time = JulianDate.fromDate(orbit.time);
    const clear = calculateCombGeometry(orbit.satrec, time, simulationState);
    const rain = calculateCombGeometry(orbit.satrec, time, {
      ...simulationState,
      weatherCondition: 'RAIN',
    });
    expect(rain).not.toBe(clear);
  });

  it('recomputes when beam health changes (signature covers the health map)', () => {
    const time = JulianDate.fromDate(orbit.time);
    const healthy = calculateCombGeometry(orbit.satrec, time, simulationState);
    const degraded = calculateCombGeometry(orbit.satrec, time, {
      ...simulationState,
      beamHealthByIndex: new Map([[7, 0.4]]),
    });
    expect(degraded).not.toBe(healthy);
  });
});

describe('L-Mo5 — canonical SNP selector', () => {
  it('selects the maximum-feeder-elevation SNP above the 15° mask', () => {
    const sat = makeOneWebSatellite(orbit);
    const selected = selectSnpForSatellite(sat, new Set(), orbit.time);

    expect(selected).not.toBeNull();
    expect(selected!.elevationDeg).toBeGreaterThanOrEqual(MIN_SNP_GATEWAY_ELEVATION_DEG);
    // No other non-failed SNP may have a strictly higher elevation.
    for (const snp of SNPS_DATA) {
      const elevation = calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, sat);
      expect(elevation).toBeLessThanOrEqual(selected!.elevationDeg + 1e-9);
    }
    expect(selected!.oneWayLatencyMs).toBeGreaterThan(0);
    expect(selected!.slantRangeKm).toBeGreaterThanOrEqual(orbit.altKm - 50);
    expect(selected!.band).toBe('Ka');
    expect(selected!.satelliteId).toBe(sat.id);
  });

  it('skips failed SNPs', () => {
    const sat = makeOneWebSatellite(orbit);
    const nominal = selectSnpForSatellite(sat, new Set(), orbit.time);
    expect(nominal).not.toBeNull();

    const failed = new Set([nominal!.snp.name]);
    const fallback = selectSnpForSatellite(sat, failed, orbit.time);
    if (fallback) {
      expect(fallback.snp.name).not.toBe(nominal!.snp.name);
      expect(fallback.elevationDeg).toBeLessThanOrEqual(nominal!.elevationDeg + 1e-9);
    }
  });

  it('feeder remains selectable at the equatorial node (blackout retired, Lot 3 Item 4)', () => {
    // Pre-Item-4 the blanking gate returned null here; with the geometric
    // per-beam keep-out the satellite keeps transmitting beams through the
    // node, so its Ka feeder relationship stays valid.
    const equatorial = buildOrbitFixture(0, 4);
    const sat = makeOneWebSatellite(equatorial, 'LEO-NODE');
    const feeder = selectSnpForSatellite(sat, new Set(), equatorial.time);
    expect(feeder).not.toBeNull();
    expect(feeder!.elevationDeg).toBeGreaterThanOrEqual(MIN_SNP_GATEWAY_ELEVATION_DEG);
  });
});
