import { describe, expect, it } from 'vitest';
import {
  activeCanonicalDirection,
  canonicalDirectionalMetric,
  canonicalHeaderMetrics,
  canonicalRouteStateIsAvailable,
  canonicalRouteStateToCommercialStatus,
  type CanonicalTechnologyRouteMetrics,
} from '../canonicalRouteMetrics';

describe('canonical route metrics', () => {
  it('keeps forward, reverse, one-way latency and RTT as distinct fields', () => {
    const metrics: CanonicalTechnologyRouteMetrics = {
      technology: 'GEO',
      topology: 'MESH',
      activeDirection: 'reverse',
      forward: canonicalDirectionalMetric({
        throughputMbps: 35,
        oneWayLatencyMs: 294,
        estimated: true,
      }),
      reverse: canonicalDirectionalMetric({
        throughputMbps: 31,
        oneWayLatencyMs: 296,
        estimated: false,
      }),
      rttMs: 590,
      state: 'degraded',
      stateReason: 'Uplink RF margin is low',
    };

    expect(metrics.forward.throughputMbps).toBe(35);
    expect(metrics.reverse.throughputMbps).toBe(31);
    expect(activeCanonicalDirection(metrics).oneWayLatencyMs).toBe(296);
    expect(canonicalHeaderMetrics(metrics)).toEqual({
      downloadMbps: 35,
      uploadMbps: 31,
      oneWayLatencyMs: 296,
    });
    expect(metrics.rttMs).toBe(590);
    expect(canonicalRouteStateToCommercialStatus(metrics.state)).toBe('degraded');
  });

  it('does not manufacture availability from a single incomplete direction', () => {
    const incomplete = canonicalDirectionalMetric({
      throughputMbps: 35,
      oneWayLatencyMs: null,
    });
    expect(incomplete.available).toBe(false);
    expect(incomplete.throughputMbps).toBe(35);
    expect(incomplete.oneWayLatencyMs).toBeNull();
  });

  it('keeps uncertain physical routes selectable without calling them active', () => {
    expect(canonicalRouteStateIsAvailable('uncertain')).toBe(true);
    expect(canonicalRouteStateToCommercialStatus('uncertain')).toBe('unknown');
    expect(canonicalRouteStateIsAvailable('blocked')).toBe(false);
  });
});
