import { describe, expect, it } from 'vitest';
import { analyzeLeoConnectivity, DEFAULT_LEO_OVERHEAD_MS } from '../leoConnectivityModel';

// #6 regression: single-site LEO latency is a genuine one-way figure
// (radio + full network overhead + one-way fiber). The round trip charges the
// same propagation, overhead, and fiber leg per traversal, so the invariant is
// rttTotalMs = 2 × oneWayLatencyMs — matching the S2S model's convention.
describe('analyzeLeoConnectivity — oneWayLatencyMs', () => {
  const args = {
    userToSatelliteDistanceKm: 1000,
    satelliteToGatewayDistanceKm: 1200,
    userToSatelliteElevationDeg: 45,
    gatewayToSatelliteElevationDeg: 45,
    snpToPopFiberDelayMs: 15,
  };

  it('is oneWayRadioMs + overhead total + one-way fiber, and exactly half of rttTotalMs', () => {
    const result = analyzeLeoConnectivity(args);

    const expectedOneWay = result.oneWayRadioMs + result.overheadMs.total + args.snpToPopFiberDelayMs;
    expect(result.oneWayLatencyMs).toBeCloseTo(expectedOneWay, 5);

    // #6 invariant: RTT is the round trip, so it is exactly twice the one-way.
    expect(result.rttTotalMs).toBeCloseTo(result.oneWayLatencyMs * 2, 5);
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
