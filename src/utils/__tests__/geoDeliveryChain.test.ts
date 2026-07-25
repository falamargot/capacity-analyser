import { describe, expect, it } from 'vitest';
import {
  activeGeoServiceDirection,
  applyGeoRouteDeliveryToPerformance,
  buildGeoMeshLinkMetrics,
  geoDirectionEndpoints,
  geoMeshLatencyMs,
  geoStabilityFromMarginDb,
  resolveGeoRouteDelivery,
} from '../geoDeliveryChain';
import { getGeoModemProfile } from '../geoModemCatalogue';
import type { DualSegmentResult } from '../geoDualSegmentBudget';
import type { GeoPerformanceEstimate } from '../engineeringExportPayload';

// MDM5010: TX 300 (return) / RX 800 (outbound) — directional, both known.
const MDM5010 = getGeoModemProfile('idirect_mdm5010')!;
// MDM2510: single aggregate 150 Mbps ceiling, applied to either direction.
const MDM2510 = getGeoModemProfile('idirect_mdm2510')!;
// iQ 200: published as a FLOOR ("300+"), so it has NO usable ceiling.
const IQ200 = getGeoModemProfile('idirect_iq200')!;

function segment(slantRangeKm: number) {
  return {
    candidate: { slantRangeKm } as never,
    effectiveCNDb: 12,
  } as never;
}

/** Minimal dual-segment result: only the fields the delivery chain reads. */
function result({
  forwardMbps,
  reverseMbps,
  marginDb = 6,
  envelope,
}: {
  forwardMbps: number;
  reverseMbps?: number;
  marginDb?: number;
  envelope?: { nominal: number; conservative: number };
}): DualSegmentResult {
  return {
    forward: {
      uplink: segment(37000),
      downlink: segment(38000),
      endToEnd: { endToEndThroughputMbps: forwardMbps, endToEndLinkMarginDb: marginDb },
    },
    reverse: reverseMbps != null
      ? {
          uplink: segment(37500),
          downlink: segment(38500),
          endToEnd: { endToEndThroughputMbps: reverseMbps, endToEndLinkMarginDb: marginDb },
        }
      : undefined,
    planningEnvelope: envelope
      ? {
          nominal: { forwardMbps: envelope.nominal, reverseMbps: envelope.nominal },
          conservative: { forwardMbps: envelope.conservative, reverseMbps: envelope.conservative },
        }
      : undefined,
  } as unknown as DualSegmentResult;
}

// ── The invariant that used to diverge between ENG and COMM ──────────────────

describe('geoDirectionEndpoints — one topology-aware source/destination mapping', () => {
  it('MESH forward is A→B and reverse is B→A', () => {
    expect(geoDirectionEndpoints('MESH', 'forward')).toEqual({ source: 'A', destination: 'B' });
    expect(geoDirectionEndpoints('MESH', 'reverse')).toEqual({ source: 'B', destination: 'A' });
    expect(geoDirectionEndpoints('POINT_TO_POINT', 'forward')).toEqual({ source: 'A', destination: 'B' });
  });

  it('STAR forward is gateway→customer: endpoint B transmits, endpoint A receives', () => {
    // B IS the gateway in STAR. The outbound/download direction therefore has the
    // gateway as source — not a hard-coded null, which is how the two former
    // pipelines ended up disagreeing about the same route.
    expect(geoDirectionEndpoints('STAR_FORWARD', 'forward')).toEqual({ source: 'B', destination: 'A' });
    expect(geoDirectionEndpoints('STAR_RETURN', 'forward')).toEqual({ source: 'B', destination: 'A' });
  });

  it('STAR reverse is customer→gateway: endpoint A transmits, endpoint B receives', () => {
    expect(geoDirectionEndpoints('STAR_FORWARD', 'reverse')).toEqual({ source: 'A', destination: 'B' });
    expect(geoDirectionEndpoints('STAR_RETURN', 'reverse')).toEqual({ source: 'A', destination: 'B' });
  });
});

describe('resolveGeoRouteDelivery — STAR', () => {
  it('bounds the download by the gateway TX and the customer RX', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: MDM5010, // customer: RX 800
      modemB: MDM2510, // gateway: aggregate 150
    });

    // min(RF 400, gateway TX 150, customer RX 800) = 150.
    expect(delivery.forward.throughputMbps).toBe(150);
    expect(delivery.forward.limitedBy).toBe('source_tx');
    // Both ends have a known ceiling ⇒ this is a delivered rate, not an estimate.
    expect(delivery.forward.isEstimatedCeiling).toBe(false);
  });

  it('stays an estimated ceiling while the gateway modem is unselected', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: null,
    });

    expect(delivery.forward.throughputMbps).toBe(400);
    expect(delivery.forward.isEstimatedCeiling).toBe(true);
  });

  it('resolves both STAR directions from their own results without copying across', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: result({ forwardMbps: 90 }),
      modemA: MDM5010, // TX 300 on the return leg
      modemB: MDM2510,
    });

    expect(delivery.forward.throughputMbps).toBe(150);
    // Return: min(RF 90, customer TX 300, gateway RX 150) = 90 — RF-bound.
    expect(delivery.reverse.throughputMbps).toBe(90);
    expect(delivery.reverse.limitedBy).toBe('rf');
  });

  it('leaves a direction null rather than inferring it from the other one', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510,
    });

    expect(delivery.reverse.throughputMbps).toBeNull();
  });
});

describe('resolveGeoRouteDelivery — MESH', () => {
  it('is directional: A TX bounds A→B, B TX bounds B→A', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'MESH',
      forwardResult: result({ forwardMbps: 900, reverseMbps: 900 }),
      reverseResult: result({ forwardMbps: 900, reverseMbps: 900 }),
      modemA: MDM5010, // TX 300 / RX 800
      modemB: MDM2510, // aggregate 150 both ways
    });

    // A→B: min(900, A TX 300, B RX 150) = 150.
    expect(delivery.forward.throughputMbps).toBe(150);
    // B→A: min(900, B TX 150, A RX 800) = 150.
    expect(delivery.reverse.throughputMbps).toBe(150);
    expect(delivery.forward.isEstimatedCeiling).toBe(false);
  });

  it('nulls the reverse direction when the route models no reverse leg', () => {
    const single = result({ forwardMbps: 200 });
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'MESH',
      forwardResult: single,
      reverseResult: single,
      modemA: MDM5010,
      modemB: MDM5010,
    });

    expect(delivery.forward.throughputMbps).toBe(200);
    expect(delivery.reverse.throughputMbps).toBeNull();
  });
});

describe('utilization factor', () => {
  it('is null — never 0 — when no endpoint ceiling is published', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: null,
      modemB: null,
    });

    // A 0 here previously reached the PDF as "Effective performance factor: 0%"
    // for a perfectly healthy link with no modem selected.
    expect(delivery.forward.utilizationFactor).toBeNull();
  });

  it('is null when a selected modem publishes no usable ceiling', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'MESH',
      forwardResult: result({ forwardMbps: 400, reverseMbps: 400 }),
      reverseResult: result({ forwardMbps: 400, reverseMbps: 400 }),
      modemA: IQ200,
      modemB: IQ200,
    });

    expect(delivery.forward.utilizationFactor).toBeNull();
    expect(delivery.forward.throughputMbps).toBe(400);
    expect(delivery.forward.isEstimatedCeiling).toBe(true);
  });

  it('measures against the binding ceiling and never exceeds 1', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 75 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510, // binding ceiling = 150
    });

    expect(delivery.forward.utilizationFactor).toBeCloseTo(0.5, 6);

    const saturated = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 4000 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510,
    });
    expect(saturated.forward.utilizationFactor).toBe(1);
  });
});

describe('planning envelope', () => {
  it('is modem-limited on the SAME endpoints as the figure it brackets', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400, envelope: { nominal: 500, conservative: 120 } }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510,
    });

    // Both the delivered figure and the envelope top out at the same 150 ceiling.
    expect(delivery.forward.throughputMbps).toBe(150);
    expect(delivery.forward.planningRangeMbps.nominal).toBe(150);
    expect(delivery.forward.planningRangeMbps.conservative).toBe(120);
  });
});

describe('mesh latency closure', () => {
  it('charges modem processing once per traversal, so RTT is forward + reverse', () => {
    const meshResult = result({ forwardMbps: 100, reverseMbps: 80 });
    const { forwardLatencyMs, reverseLatencyMs, rttMs } = geoMeshLatencyMs(meshResult);

    expect(rttMs).toBeCloseTo(forwardLatencyMs + reverseLatencyMs, 9);
    // 40 ms per traversal ⇒ 80 ms of processing in the round trip.
    expect(rttMs).toBeGreaterThan((37000 + 38000 + 37500 + 38500) / 299.792458 + 79);
  });

  it('publishes the shared delivery figures as the mesh link metrics', () => {
    const meshResult = result({ forwardMbps: 900, reverseMbps: 900 });
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'MESH',
      forwardResult: meshResult,
      reverseResult: meshResult,
      modemA: MDM5010,
      modemB: MDM2510,
    });
    const metrics = buildGeoMeshLinkMetrics(meshResult, delivery);

    expect(metrics.forwardMbps).toBe(delivery.forward.throughputMbps);
    expect(metrics.reverseMbps).toBe(delivery.reverse.throughputMbps);
    expect(metrics.forwardEstimatedCeiling).toBe(delivery.forward.isEstimatedCeiling);
    expect(metrics.rttMs).toBeCloseTo((metrics.forwardLatencyMs ?? 0) + (metrics.reverseLatencyMs ?? 0), 9);
  });
});

describe('applyGeoRouteDeliveryToPerformance', () => {
  const base: GeoPerformanceEstimate = {
    downlinkGbps: 0.195,
    uplinkGbps: 0.032,
    stability: 'High',
    performanceFactor: 0.87, // elevation × weather heuristic — a different quantity
    weatherFactor: 1,
    weatherLabel: 'Selected link budget',
  };

  it('replaces the heuristic performanceFactor with modem utilization', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 75 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510,
    });
    const performance = applyGeoRouteDeliveryToPerformance(base, delivery);

    expect(performance.downlinkGbps).toBeCloseTo(0.075, 9);
    expect(performance.performanceFactor).toBeCloseTo(0.5, 6);
    expect(performance.downloadEstimated).toBe(false);
  });

  it('reports an unknown performanceFactor as null, not as the elevation heuristic', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: null,
      modemB: null,
    });
    const performance = applyGeoRouteDeliveryToPerformance(base, delivery);

    expect(performance.performanceFactor).toBeNull();
    expect(performance.performanceFactor).not.toBe(base.performanceFactor);
  });

  it('keeps the baseline value for a direction the route does not model', () => {
    const delivery = resolveGeoRouteDelivery({
      linkMode: 'STAR_FORWARD',
      forwardResult: result({ forwardMbps: 400 }),
      reverseResult: null,
      modemA: MDM5010,
      modemB: MDM2510,
    });
    const performance = applyGeoRouteDeliveryToPerformance(base, delivery);

    expect(performance.uplinkGbps).toBe(base.uplinkGbps);
    expect(performance.uploadEstimated).toBeUndefined();
  });
});

describe('helpers', () => {
  it('maps margin to the stability ladder', () => {
    expect(geoStabilityFromMarginDb(-1)).toBe('Unstable');
    expect(geoStabilityFromMarginDb(1)).toBe('Low');
    expect(geoStabilityFromMarginDb(3)).toBe('Medium');
    expect(geoStabilityFromMarginDb(9)).toBe('High');
    expect(geoStabilityFromMarginDb(null)).toBe('Low');
  });

  it('resolves the presented direction from topology, then the mesh tab', () => {
    expect(activeGeoServiceDirection('STAR_RETURN', 'forward')).toBe('reverse');
    expect(activeGeoServiceDirection('STAR_FORWARD', 'reverse')).toBe('forward');
    expect(activeGeoServiceDirection('MESH', 'reverse')).toBe('reverse');
    expect(activeGeoServiceDirection('MESH', undefined)).toBe('forward');
  });
});
