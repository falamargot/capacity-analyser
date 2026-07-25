import { describe, expect, it } from 'vitest';
import { computeNetworkLayer } from '../geoNetworkLayer';
import { GEO_SERVICE_PLANS } from '../geoPhysicalAssumptions';

describe('GEO network/service planning layer', () => {
  it('applies allocation, beam load, protocol and contention in a traceable order', () => {
    const result = computeNetworkLayer(
      100,
      'MESH',
      undefined,
      undefined,
      undefined,
      {
        servicePlan: GEO_SERVICE_PLANS.business_shared,
        allocatedCapacityFraction: 0.5,
        beamLoadFraction: 0.2,
      },
    );

    expect(result.protocolAdjustedMbps).toBeCloseTo(100 * 0.5 * 0.8 * result.protocolEfficiency);
    expect(result.effectiveThroughputMbps).toBeCloseTo(
      result.protocolAdjustedMbps / GEO_SERVICE_PLANS.business_shared.contentionRatio,
    );
    expect(result.allocatedCapacityFraction).toBe(0.5);
    expect(result.beamLoadFraction).toBe(0.2);
    expect(result.servicePlanId).toBe('business_shared');
  });

  it('caps the modeled throughput at the service-plan peak', () => {
    const result = computeNetworkLayer(
      1000,
      'STAR_FORWARD',
      undefined,
      undefined,
      undefined,
      {
        servicePlan: { ...GEO_SERVICE_PLANS.dedicated, peakRateMbps: 25 },
      },
    );
    expect(result.finalThroughputMbps).toBe(25);
    expect(result.limitingFactor).toBe('service_plan');
  });
});
