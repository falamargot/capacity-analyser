import { describe, expect, it } from 'vitest';
import { analyzeLeoConnectivity, DEFAULT_LEO_OVERHEAD_MS } from '../leoConnectivityModel';

// LEO-1 regression: single-site LEO latency must be a genuine one-way figure
// (matching GEO's convention and the LEO site-to-site path's oneWayLatencyAtoB/
// BtoAMs), not half of rttTotalMs — overhead is a one-time cost, not doubled,
// so oneWayLatencyMs must be MORE than half of rttTotalMs.
describe('analyzeLeoConnectivity — oneWayLatencyMs', () => {
  const args = {
    userToSatelliteDistanceKm: 1000,
    satelliteToGatewayDistanceKm: 1200,
    userToSatelliteElevationDeg: 45,
    gatewayToSatelliteElevationDeg: 45,
    snpToPopFiberDelayMs: 15,
  };

  it('is oneWayRadioMs + overhead total + one-way fiber (not rttTotalMs / 2)', () => {
    const result = analyzeLeoConnectivity(args);

    const expectedOneWay = result.oneWayRadioMs + result.overheadMs.total + args.snpToPopFiberDelayMs;
    expect(result.oneWayLatencyMs).toBeCloseTo(expectedOneWay, 5);

    // Overhead is charged once in oneWayLatencyMs but is NOT doubled in
    // rttTotalMs either (only propagation and fiber double), so the one-way
    // figure is more than half the round trip, not exactly half.
    expect(result.oneWayLatencyMs).toBeGreaterThan(result.rttTotalMs / 2);
    expect(result.oneWayLatencyMs).toBeLessThan(result.rttTotalMs);
  });

  it('doubling propagation distance increases oneWayLatencyMs by the propagation delta only', () => {
    const near = analyzeLeoConnectivity(args);
    const far = analyzeLeoConnectivity({
      ...args,
      userToSatelliteDistanceKm: args.userToSatelliteDistanceKm * 2,
      satelliteToGatewayDistanceKm: args.satelliteToGatewayDistanceKm * 2,
    });

    const propagationDeltaMs = far.oneWayRadioMs - near.oneWayRadioMs;
    expect(far.oneWayLatencyMs - near.oneWayLatencyMs).toBeCloseTo(propagationDeltaMs, 5);
  });

  it('reflects a custom overhead override', () => {
    const withDefaultOverhead = analyzeLeoConnectivity(args);
    const withHigherOverhead = analyzeLeoConnectivity({
      ...args,
      overheadMs: { ...DEFAULT_LEO_OVERHEAD_MS, queueingDelayMs: DEFAULT_LEO_OVERHEAD_MS.queueingDelayMs + 20 },
    });

    expect(withHigherOverhead.oneWayLatencyMs - withDefaultOverhead.oneWayLatencyMs).toBeCloseTo(20, 5);
  });
});
