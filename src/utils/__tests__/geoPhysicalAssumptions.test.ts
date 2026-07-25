import { describe, expect, it } from 'vitest';
import {
  GEO_PAYLOAD_LOSS_PROFILES,
  applyGeoPayloadLosses,
  estimateP618PlanningAttenuation,
} from '../geoPhysicalAssumptions';

describe('GEO physical planning assumptions', () => {
  it('combines payload interference in the power domain and conservative is worse', () => {
    const nominal = applyGeoPayloadLosses(16, 15, GEO_PAYLOAD_LOSS_PROFILES.nominal);
    const conservative = applyGeoPayloadLosses(16, 15, GEO_PAYLOAD_LOSS_PROFILES.conservative);

    expect(nominal.effectiveCnDb).toBeLessThan(nominal.uplinkAfterBackoffDb);
    expect(nominal.effectiveCnDb).toBeLessThan(nominal.downlinkAfterBackoffDb);
    expect(conservative.effectiveCnDb).toBeLessThan(nominal.effectiveCnDb);
    expect(conservative.totalEquivalentPenaltyDb).toBeGreaterThan(nominal.totalEquivalentPenaltyDb);
  });

  it('P.618 planning loss is site/elevation/frequency aware', () => {
    const kuHigh = estimateP618PlanningAttenuation({
      band: 'Ku', direction: 'downlink', latitudeDeg: 45, elevationDeg: 50, weatherType: 'heavy_rain',
    });
    const kuLow = estimateP618PlanningAttenuation({
      band: 'Ku', direction: 'downlink', latitudeDeg: 45, elevationDeg: 10, weatherType: 'heavy_rain',
    });
    const kaLow = estimateP618PlanningAttenuation({
      band: 'Ka', direction: 'downlink', latitudeDeg: 45, elevationDeg: 10, weatherType: 'heavy_rain',
    });

    expect(kuLow.excessLossDb).toBeGreaterThan(kuHigh.excessLossDb);
    expect(kaLow.excessLossDb).toBeGreaterThan(kuLow.excessLossDb);
    expect(kaLow.model).toBe('ITU-R P.618-14 planning approximation');
  });

  it('clear sky adds no excess weather loss', () => {
    expect(estimateP618PlanningAttenuation({
      band: 'Ka', direction: 'uplink', latitudeDeg: 0, elevationDeg: 5, weatherType: 'clear',
    }).excessLossDb).toBe(0);
  });
});
