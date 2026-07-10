/**
 * Regression tests — LEO capacity terminology and SGP4 failure handling.
 *
 * Guards against the following regressions:
 *  1. Satellite aggregate (7.2 Gbps) displayed as per-point user capacity.
 *  2. Delivered throughput exceeding selected terminal hardware maximum.
 *  3. SGP4 propagation failure producing a fake satellite at (0°N, 0°E).
 *  4. All capacity/load estimates being labelled as simulated.
 */

import { describe, expect, it } from 'vitest';

import {
  NOMINAL_TERMINAL_PEAK_MBPS,
  SATELLITE_AGGREGATE_CAPACITY_GBPS,
  SHARED_BEAM_AGGREGATE_CAPACITY_MBPS,
} from '../../config/oneweb';

import {
  applyBeamCapacitySharing,
} from '../leoNetworkLayer';

import {
  calculateRealTimeCapacity,
} from '../capacityCalculator';

import {
  estimateBeamLoad,
  estimateBeamLoadWithFillRate,
} from '../capacityLayer';

import {
  calculatePosition,
} from '../../services/satelliteService';

import type { SatelliteData } from '../../types/satellites';
import type { FillRateLookupResult } from '../../types/fillRate';

// ─── 1. Terminology constants ────────────────────────────────────────────────

describe('OneWeb capacity constants — terminology', () => {
  it('NOMINAL_TERMINAL_PEAK_MBPS is 200 Mbps (terminal ceiling, not beam aggregate)', () => {
    expect(NOMINAL_TERMINAL_PEAK_MBPS).toBe(200);
  });

  it('SATELLITE_AGGREGATE_CAPACITY_GBPS is 7.2 Gbps (all 16 beams)', () => {
    expect(SATELLITE_AGGREGATE_CAPACITY_GBPS).toBe(7.2);
  });

  it('SHARED_BEAM_AGGREGATE_CAPACITY_MBPS is approximately 450 Mbps (7200 / 16)', () => {
    expect(SHARED_BEAM_AGGREGATE_CAPACITY_MBPS).toBeCloseTo(450, 0);
  });

  it('terminal peak is strictly less than satellite aggregate', () => {
    expect(NOMINAL_TERMINAL_PEAK_MBPS).toBeLessThan(SATELLITE_AGGREGATE_CAPACITY_GBPS * 1000);
  });
});

// ─── 2. No per-point LEO capacity equals satellite aggregate ─────────────────

describe('calculateRealTimeCapacity — LEO must not return satellite aggregate', () => {
  const makeOneweb = (id: string): SatelliteData => ({
    id,
    name: `ONEWEB-${id}`,
    noradId: id,
    coverageFileId: null,
    type: 'ONEWEB',
    orbitType: 'LEO',
    opsStatus: 'operational',
    satrec: null as any,
    position: { lat: 0, lng: 0, alt: 1200, isPositionValid: true },
    capacity: {
      maxThroughput: SATELLITE_AGGREGATE_CAPACITY_GBPS, // 7.2 Gbps aggregate
      bandwidth: { ku: 250, ka: 150 },
      availability: 0.99,
      officialAggregateCapacityGbps: SATELLITE_AGGREGATE_CAPACITY_GBPS,
      simulatedEffectiveBeamCapacityMbps: NOMINAL_TERMINAL_PEAK_MBPS,
    },
    referenced_coverages: { type: 'FeatureCollection', features: [] },
    coverages: [],
  });

  it('returns totalCapacity well below 1 Gbps when LEO is in coverage (not 6–7.2 Gbps)', () => {
    // Point directly under the satellite at (0, 0) — guaranteed coverage at the sub-sat point.
    const sat = makeOneweb('TEST-1');
    const point = { lat: 0, lng: 0 };
    const result = calculateRealTimeCapacity([sat], point, null);

    // If any OneWeb satellite is in coverage, totalCapacity should be terminal peak (0.2 Gbps)
    // not the satellite aggregate (6–7.2 Gbps).
    if (result.hasLeoCoverage) {
      expect(result.totalCapacity).toBeLessThan(1); // < 1 Gbps
      expect(result.totalCapacity).toBeCloseTo(NOMINAL_TERMINAL_PEAK_MBPS / 1000, 3); // ≈ 0.2 Gbps
    }
  });

  it('leoCapacityIsTerminalPeak is true when a point is selected and LEO is in scope', () => {
    const sat = makeOneweb('TEST-2');
    const point = { lat: 0, lng: 0 };
    const result = calculateRealTimeCapacity([sat], point, null);
    expect(result.leoCapacityIsTerminalPeak).toBe(true);
  });

  it('satellite with isPositionValid=false contributes 0 capacity', () => {
    const sat = makeOneweb('TEST-3');
    sat.position.isPositionValid = false;
    const point = { lat: 0, lng: 0 };
    const result = calculateRealTimeCapacity([sat], point, null);
    // An invalid-position satellite must be excluded entirely.
    expect(result.totalCapacity).toBe(0);
    expect(result.hasLeoCoverage).toBe(false);
    expect(result.coveredSatellites).toHaveLength(0);
  });

  it('no-point query with selected satellite uses satellite aggregate (context display)', () => {
    const sat = makeOneweb('TEST-4');
    // When no point is selected, we show satellite aggregate as context — not terminal peak.
    const result = calculateRealTimeCapacity([sat], null, sat);
    expect(result.leoCapacityIsTerminalPeak).toBe(false);
    expect(result.totalCapacity).toBe(SATELLITE_AGGREGATE_CAPACITY_GBPS);
  });
});

// ─── 3. Terminal throughput cap ───────────────────────────────────────────────
// The terminal hardware clamp lives in the beam-sharing pipeline
// (applyBeamCapacitySharing terminalMaxMbps); the former standalone
// capDeliveredToTerminal helper was dead code and was removed (L-Mi4).

describe('terminal hardware cap (via applyBeamCapacitySharing)', () => {
  it('mobile-class terminal (100 Mbps) caps NOMINAL_TERMINAL_PEAK_MBPS output', () => {
    const result = applyBeamCapacitySharing(NOMINAL_TERMINAL_PEAK_MBPS, 1, 100);
    expect(result.sharedThroughputMbps).toBe(100);
    expect(result.wasTerminalLimited).toBe(true);
  });

  it('does not cap when the per-user share is below the terminal maximum', () => {
    // 20 Mbps RF × 5 bandwidth scale = 100 Mbps beam pool / 4 users = 25 Mbps < 200 cap
    const result = applyBeamCapacitySharing(20, 4, 200);
    expect(result.sharedThroughputMbps).toBeLessThanOrEqual(200);
    expect(result.wasTerminalLimited).toBe(false);
  });

  it('never returns a negative throughput', () => {
    const result = applyBeamCapacitySharing(-10, 1, 100);
    expect(result.sharedThroughputMbps).toBeGreaterThanOrEqual(0);
  });
});

// ─── 4. SGP4 failure — no fake position at (0°N, 0°E) ───────────────────────

describe('calculatePosition — SGP4 failure handling', () => {
  it('returns isPositionValid=false when satrec is null', () => {
    const result = calculatePosition({ satrec: null });
    expect(result.isPositionValid).toBe(false);
  });

  it('returns isPositionValid=false when satrec is undefined', () => {
    const result = calculatePosition({ satrec: undefined });
    expect(result.isPositionValid).toBe(false);
  });

  it('returns isPositionValid=false for a completely invalid satrec object', () => {
    const result = calculatePosition({ satrec: { broken: true } });
    expect(result.isPositionValid).toBe(false);
  });

  it('does not throw on propagation failure — returns gracefully', () => {
    expect(() => calculatePosition({ satrec: null })).not.toThrow();
  });

  it('when isPositionValid=false, position is NOT silently (0, 0, 0) treated as Gulf of Guinea', () => {
    const result = calculatePosition({ satrec: null });
    // The lat/lng/alt may be 0, but isPositionValid=false signals consumers to ignore it.
    // The important invariant: isPositionValid must be false, not true.
    expect(result.isPositionValid).not.toBe(true);
  });
});

// ─── 5. Simulated label — BeamLoadResult ────────────────────────────────────

describe('estimateBeamLoad — all outputs are explicitly simulated', () => {
  it('isSimulated is always true', () => {
    const result = estimateBeamLoad(51.5, 0, false, 'GB');
    expect(result.isSimulated).toBe(true);
  });

  it('estimatedUserThroughputMbps never exceeds NOMINAL_TERMINAL_PEAK_MBPS', () => {
    // Minimum user count (polar / ocean) still must not exceed terminal peak.
    const ocean = estimateBeamLoad(85, 0, true, null);
    expect(ocean.estimatedUserThroughputMbps).toBeLessThanOrEqual(NOMINAL_TERMINAL_PEAK_MBPS);

    const urban = estimateBeamLoad(48.8, 2.3, false, 'FR');
    expect(urban.estimatedUserThroughputMbps).toBeLessThanOrEqual(NOMINAL_TERMINAL_PEAK_MBPS);
  });

  it('beamCapacityMbps equals the shared beam aggregate — not terminal peak', () => {
    const result = estimateBeamLoad(0, 0, true, null);
    expect(result.beamCapacityMbps).toBe(SHARED_BEAM_AGGREGATE_CAPACITY_MBPS);
    expect(result.beamCapacityMbps).not.toBe(NOMINAL_TERMINAL_PEAK_MBPS);
    expect(result.beamCapacityMbps).not.toBe(SATELLITE_AGGREGATE_CAPACITY_GBPS * 1000);
  });
});

describe('estimateBeamLoadWithFillRate — fill-rate calibration', () => {
  const fillRateResult: FillRateLookupResult = {
    fillRatePct: 76,
    percentile: 'P95',
    source: 'calibratedDemo',
    dataMode: 'calibrated_network_load_model',
    statistic: 'P95_5MIN_AVG',
    windowMinutes: 5,
    sourceDate: '2026-06',
    cell: {
      lat: 48,
      lng: 2,
      sizeDeg: 1,
      fillRatePct: 76,
      percentile: 'P95',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sampleCount: 240,
      source: 'calibratedDemo',
      dataMode: 'calibrated_network_load_model',
      sourceDate: '2026-06',
    },
  };

  it('falls back to the legacy heuristic when no fill-rate cell is available', () => {
    const legacy = estimateBeamLoad(48.8, 2.3, false, 'FR');
    const result = estimateBeamLoadWithFillRate({
      lat: 48.8,
      lng: 2.3,
      isOcean: false,
      countryCode: 'FR',
      fillRateResult: null,
    });

    expect(result).toEqual(legacy);
    expect(result.loadSource).toBe('heuristic');
    expect(result.loadDataMode).toBe('heuristic_estimate');
    expect(result.method).toBe('heuristicOnly');
    expect(result.confidence).toBe(0);
    expect(result.estimatedLoadPct).toBe(result.beamLoadPercent);
    expect(result.baseEstimatedLoadPct).toBe(result.beamLoadPercent);
    expect(result.fillRateInfluencePct).toBeUndefined();
  });

  it('uses the Network Load model directly when a model cell is present', () => {
    const base = estimateBeamLoad(48.8, 2.3, false, 'FR');
    const result = estimateBeamLoadWithFillRate({
      lat: 48.8,
      lng: 2.3,
      isOcean: false,
      countryCode: 'FR',
      fillRateResult,
    });

    expect(result.beamLoadPercent).toBe(76);
    expect(result.estimatedLoadPct).toBe(76);
    expect(result.baseEstimatedLoadPct).toBe(base.beamLoadPercent);
    expect(result.fillRateInfluencePct).toBe(76);
    expect(result.confidence).toBe(1);
    expect(result.method).toBe('networkLoadModel');
    expect(result.loadSource).toBe('calibratedDemo');
    expect(result.loadDataMode).toBe('calibrated_network_load_model');
    expect(result.fillRatePct).toBe(76);
    expect(result.fillRateStatistic).toBe('P95_5MIN_AVG');
    expect(result.fillRateWindowMinutes).toBe(5);
    expect(result.fillRateSourceDate).toBe('2026-06');
  });
});
