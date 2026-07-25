import { describe, expect, it } from 'vitest';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { SNPData } from '../../components/globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import type { BeamLoadResult } from '../capacityLayer';
import {
  LOGICAL_POPS,
  MIN_SNP_TO_POP_FIBER_ONE_WAY_MS,
  S2S_ONE_WAY_PROCESSING_MS,
  computeLeoSiteToSiteResult,
  estimateSnpToPopFiberOneWayMs,
} from '../leoSiteToSiteModel';
import { DEFAULT_LEO_OVERHEAD_MS } from '../leoConnectivityModel';

const satA = { id: 'sat-a', name: 'Sat A' } as SatelliteData;
const satB = { id: 'sat-b', name: 'Sat B' } as SatelliteData;
const snpA = { name: 'SNP A', lat: 0, lng: 0 } as SNPData;
const snpB = { name: 'SNP B', lat: 1, lng: 1 } as SNPData;

const regulatory = (status: RegulatoryResult['status']): RegulatoryResult => ({
  isoA2: 'FR',
  isoA3: 'FRA',
  countryName: 'France',
  status,
  reason: 'Test regulatory status',
  confidence: 1,
  emitAllowed: status !== 'BLOCKED',
  serviceAllowed: status !== 'BLOCKED',
  styleFill: '#000',
  styleOpacity: 1,
  isOcean: false,
});

const beamLoad = (capacityStatus: BeamLoadResult['capacityStatus']): BeamLoadResult => ({
  estimatedActiveUsers: capacityStatus === 'SATURATED' ? 48 : capacityStatus === 'DEGRADED' ? 38 : 10,
  maxConcurrentUsers: 50,
  beamLoadFraction: capacityStatus === 'SATURATED' ? 0.96 : capacityStatus === 'DEGRADED' ? 0.76 : 0.20,
  beamLoadPercent: capacityStatus === 'SATURATED' ? 96 : capacityStatus === 'DEGRADED' ? 76 : 20,
  estimatedLoadPct: capacityStatus === 'SATURATED' ? 96 : capacityStatus === 'DEGRADED' ? 76 : 20,
  baseEstimatedLoadPct: capacityStatus === 'SATURATED' ? 96 : capacityStatus === 'DEGRADED' ? 76 : 20,
  confidence: 0,
  method: 'heuristicOnly',
  beamCapacityMbps: 200,
  estimatedUserThroughputMbps: 20,
  capacityStatus,
  loadSource: 'heuristic',
  loadDataMode: 'heuristic_estimate',
  isSimulated: true,
});

const plannedBeamLoad = (capacityStatus: BeamLoadResult['capacityStatus'] = 'NOMINAL'): BeamLoadResult => ({
  ...beamLoad(capacityStatus),
  loadSource: 'fillRate',
  loadDataMode: 'calibrated_network_load_model',
  method: 'fillRateAdjusted',
});

const baseArgs = {
  endpointA: { lat: 0, lng: 0 },
  endpointB: { lat: 1, lng: 1 },
  servingSatelliteA: satA,
  servingSatelliteB: satB,
  rfAvailableA: true,
  rfAvailableB: true,
  selectedSnpA: snpA,
  selectedSnpB: snpB,
  regulatoryResultA: regulatory('ALLOWED_CONFIRMED'),
  regulatoryResultB: regulatory('ALLOWED_CONFIRMED'),
  userToSatDistanceAKm: null,
  satToSnpDistanceAKm: null,
  userToSatDistanceBKm: null,
  satToSnpDistanceBKm: null,
  elevationADeg: null,
  elevationBDeg: null,
  dlThroughputAMbps: null,
  ulThroughputAMbps: null,
  dlThroughputBMbps: null,
  ulThroughputBMbps: null,
};

// ── Existing RF / SNP tests ───────────────────────────────────────────────────

describe('computeLeoSiteToSiteResult failure reasons', () => {
  it('reports no satellite at B only when B has no selected satellite', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      servingSatelliteB: null,
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('NO_SATELLITE_B');
  });

  it('reports RF unavailable at B when a B satellite is selected but RF fails', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('RF_UNAVAILABLE_B');
  });

  it('reports no gateway at B when satellite and RF are available but no SNP exists', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('NO_SNP_B');
    expect(result.serviceStatus).toBe('BLOCKED');
    expect(result.serviceAvailable).toBe(false);
  });

  it('physical blockers at B outrank a RESTRICTED market (canonical gate order, L-Mo1)', () => {
    // A restricted country with no RF has no service at all: the failure is the
    // physical one (BLOCKED), not the market restriction (DEGRADED).
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      rfAvailableB: false,
      selectedSnpB: null,
      regulatoryResultB: regulatory('RESTRICTED'),
    });

    expect(result.failureReason).toBe('RF_UNAVAILABLE_B');
    expect(result.serviceStatus).toBe('BLOCKED');
  });

  it('a RESTRICTED market with full physical availability outranks capacity gates', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultB: regulatory('RESTRICTED'),
      beamLoadB: beamLoad('SATURATED'),
    });

    expect(result.failureReason).toBe('REGULATORY_RESTRICTED_B');
    expect(result.serviceStatus).toBe('DEGRADED');
  });
});

// ── C-01: Regulatory null-bypass fix ─────────────────────────────────────────

describe('C-01 — regulatory null does not bypass the gate', () => {
  it('returns REGULATORY_PENDING_A when regulatoryResultA is null', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: null,
    });

    expect(result.failureReason).toBe('REGULATORY_PENDING_A');
    expect(result.serviceStatus).toBe('BLOCKED');
    expect(result.serviceAvailable).toBe(false);
  });

  it('returns REGULATORY_PENDING_B when regulatoryResultB is null', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultB: null,
    });

    expect(result.failureReason).toBe('REGULATORY_PENDING_B');
    expect(result.serviceStatus).toBe('BLOCKED');
    expect(result.serviceAvailable).toBe(false);
  });

  it('REGULATORY_PENDING_A takes priority over missing RF and SNP at B', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: null,
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('REGULATORY_PENDING_A');
    expect(result.serviceStatus).toBe('BLOCKED');
  });

  it('reports REGULATORY_BLOCKED_A when A is explicitly BLOCKED', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: regulatory('BLOCKED'),
    });

    expect(result.failureReason).toBe('REGULATORY_BLOCKED_A');
    expect(result.serviceStatus).toBe('BLOCKED');
    expect(result.serviceAvailable).toBe(false);
  });

  it('reports REGULATORY_BLOCKED_B when B is explicitly BLOCKED', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultB: regulatory('BLOCKED'),
      rfAvailableB: false,
      selectedSnpB: null,
    });

    expect(result.failureReason).toBe('REGULATORY_BLOCKED_B');
    expect(result.serviceStatus).toBe('BLOCKED');
  });

  it('REGULATORY_RESTRICTED is not silently treated as ALLOWED', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: regulatory('RESTRICTED'),
    });

    expect(result.failureReason).toBe('REGULATORY_RESTRICTED_A');
    expect(result.serviceStatus).toBe('DEGRADED');
    expect(result.serviceAvailable).toBe(true);
  });
});

// ── C-02: Capacity gate in site-to-site ──────────────────────────────────────

describe('C-02 — capacity gate is evaluated in site-to-site mode', () => {
  it('returns CAPACITY_SATURATED_A when beam at A is saturated', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('SATURATED'),
      beamLoadB: beamLoad('NOMINAL'),
    });

    expect(result.failureReason).toBe('CAPACITY_SATURATED_A');
    expect(result.serviceStatus).toBe('DEGRADED');
    expect(result.serviceAvailable).toBe(true);
  });

  it('returns CAPACITY_SATURATED_B when beam at B is saturated and A is nominal', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('NOMINAL'),
      beamLoadB: beamLoad('SATURATED'),
    });

    expect(result.failureReason).toBe('CAPACITY_SATURATED_B');
    expect(result.serviceStatus).toBe('DEGRADED');
  });

  it('A saturated takes priority over B saturated', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('SATURATED'),
      beamLoadB: beamLoad('SATURATED'),
    });

    expect(result.failureReason).toBe('CAPACITY_SATURATED_A');
  });

  it('returns CAPACITY_DEGRADED_A when beam at A is degraded', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('DEGRADED'),
      beamLoadB: beamLoad('NOMINAL'),
    });

    expect(result.failureReason).toBe('CAPACITY_DEGRADED_A');
    expect(result.serviceStatus).toBe('DEGRADED');
    expect(result.serviceAvailable).toBe(true);
  });

  it('returns CAPACITY_DEGRADED_B when beam at B is degraded and A is nominal', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('NOMINAL'),
      beamLoadB: beamLoad('DEGRADED'),
    });

    expect(result.failureReason).toBe('CAPACITY_DEGRADED_B');
    expect(result.serviceStatus).toBe('DEGRADED');
  });

  it('saturation takes priority over degradation', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('DEGRADED'),
      beamLoadB: beamLoad('SATURATED'),
    });

    // A is checked first for saturation, B saturation follows
    expect(result.failureReason).toBe('CAPACITY_SATURATED_B');
  });

  it('regulatory blocked takes priority over capacity saturated', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: regulatory('BLOCKED'),
      beamLoadA: beamLoad('SATURATED'),
      beamLoadB: beamLoad('SATURATED'),
    });

    expect(result.failureReason).toBe('REGULATORY_BLOCKED_A');
  });

  it('no failure when both beams are nominal and all checks pass', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: beamLoad('NOMINAL'),
      beamLoadB: beamLoad('NOMINAL'),
    });

    expect(result.failureReason).toBe(null);
    expect(result.serviceStatus).toBe('ALLOWED');
    expect(result.serviceAvailable).toBe(true);
  });

  it('omitting beamLoad params does not cause capacity gate to fire', () => {
    const result = computeLeoSiteToSiteResult({ ...baseArgs });

    expect(result.failureReason).toBe(null);
    expect(result.serviceStatus).toBe('ALLOWED');
  });
});

// ── L-Mo3: reconciled latency decomposition ───────────────────────────────────

describe('L-Mo3 — S2S latency shares the single-site overhead constants', () => {
  it('S2S one-way processing is derived from DEFAULT_LEO_OVERHEAD_MS (2 modems + 2 gateways + routing + queueing)', () => {
    const expected =
      2 * (DEFAULT_LEO_OVERHEAD_MS.gatewayProcessingDelayMs + DEFAULT_LEO_OVERHEAD_MS.modemProcessingDelayMs)
      + DEFAULT_LEO_OVERHEAD_MS.routingDelayMs
      + DEFAULT_LEO_OVERHEAD_MS.queueingDelayMs;
    expect(S2S_ONE_WAY_PROCESSING_MS).toBe(expected);
    expect(S2S_ONE_WAY_PROCESSING_MS).toBe(28);
  });

  it('computeLeoSiteToSiteResult applies the derived processing budget per one-way', () => {
    const result = computeLeoSiteToSiteResult({ ...baseArgs });
    expect(result.processingMarginMs).toBe(S2S_ONE_WAY_PROCESSING_MS);
    expect(result.rttMs).toBeCloseTo(2 * result.oneWayLatencyAtoBMs, 9);
  });

  it('estimateSnpToPopFiberOneWayMs floors at the last-mile minimum for a PoP-co-located SNP', () => {
    const london = LOGICAL_POPS.find((pop) => pop.name === 'London')!;
    expect(estimateSnpToPopFiberOneWayMs({ lat: london.lat, lng: london.lng }))
      .toBe(MIN_SNP_TO_POP_FIBER_ONE_WAY_MS);
  });

  it('estimateSnpToPopFiberOneWayMs grows with distance from the nearest PoP', () => {
    // Svalbard-like SNP — ~2 400 km from London/Frankfurt PoPs.
    const remote = estimateSnpToPopFiberOneWayMs({ lat: 78.2, lng: 15.6 });
    expect(remote).toBeGreaterThan(MIN_SNP_TO_POP_FIBER_ONE_WAY_MS);
    expect(remote).toBeLessThan(55); // stays inside the APNIC-observed one-way band
  });
});

describe('site-to-site confidence scoring', () => {
  it('returns high confidence when structural, RF, regulatory, load, and geometry evidence are complete', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      beamLoadA: plannedBeamLoad(),
      beamLoadB: plannedBeamLoad(),
      debugSiteA: {} as any,
      debugSiteB: {} as any,
      elevationADeg: 45,
      elevationBDeg: 42,
    });

    expect(result.confidenceLevel).toBe('High');
    expect(result.confidenceScore).toBeGreaterThanOrEqual(75);
    expect(result.confidenceReasons).toContain('Both LEO SNP paths resolved');
    expect(result.confidenceReasons).toContain('Detailed RF debug chains available');
  });

  it('caps confidence to low when a structural route component is missing', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      selectedSnpB: null,
      beamLoadA: plannedBeamLoad(),
      beamLoadB: plannedBeamLoad(),
      debugSiteA: {} as any,
      debugSiteB: {} as any,
      elevationADeg: 45,
      elevationBDeg: 42,
    });

    expect(result.failureReason).toBe('NO_SNP_B');
    expect(result.confidenceLevel).toBe('Low');
    expect(result.confidenceScore).toBeLessThan(45);
    expect(result.confidenceReasons).toContain('LEO SNP path missing at one endpoint');
  });

  it('caps confidence to low while regulatory evidence is pending', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      regulatoryResultA: null,
      beamLoadA: plannedBeamLoad(),
      beamLoadB: plannedBeamLoad(),
      debugSiteA: {} as any,
      debugSiteB: {} as any,
      elevationADeg: 45,
      elevationBDeg: 42,
    });

    expect(result.failureReason).toBe('REGULATORY_PENDING_A');
    expect(result.confidenceLevel).toBe('Low');
    expect(result.confidenceScore).toBeLessThan(45);
  });
});

// ── #3 — strict two-leg closure for directional throughput ───────────────────

describe('#3 — directional throughput requires both RF legs present and positive', () => {
  it('closes each direction to min(uplink leg, downlink leg) when all four legs are positive', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      dlThroughputAMbps: 10,
      ulThroughputAMbps: 5,
      dlThroughputBMbps: 8,
      ulThroughputBMbps: 4,
    });

    // A→B = min(uplink A = 5, downlink B = 8) = 5
    expect(result.accessThroughputAtoBMbps).toBe(5);
    expect(result.finalThroughputAtoBMbps).toBe(5);
    // B→A = min(uplink B = 4, downlink A = 10) = 4
    expect(result.accessThroughputBtoAMbps).toBe(4);
    expect(result.finalThroughputBtoAMbps).toBe(4);
  });

  it('nulls a direction whose downlink leg was never computed — no single-leg fallback', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      dlThroughputAMbps: 10,
      ulThroughputAMbps: 5,
      dlThroughputBMbps: null, // B's downlink leg missing → A→B cannot close
      ulThroughputBMbps: 4,
    });

    // A→B has no valid end-to-end rate even though uplink A = 5 exists.
    expect(result.accessThroughputAtoBMbps).toBeNull();
    expect(result.finalThroughputAtoBMbps).toBeNull();
    // B→A still closes: min(uplink B = 4, downlink A = 10) = 4.
    expect(result.accessThroughputBtoAMbps).toBe(4);
  });

  it('treats a non-positive leg as an unclosed direction (null, not 0)', () => {
    const result = computeLeoSiteToSiteResult({
      ...baseArgs,
      dlThroughputAMbps: 10,
      ulThroughputAMbps: 0, // uplink A collapsed → A→B is not a valid rate
      dlThroughputBMbps: 8,
      ulThroughputBMbps: 4,
    });

    expect(result.accessThroughputAtoBMbps).toBeNull();
    expect(result.accessThroughputBtoAMbps).toBe(4);
  });
});
