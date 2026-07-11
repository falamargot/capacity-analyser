import { describe, expect, it } from 'vitest';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { FillRateLookupResult } from '../../types/fillRate';
import { estimateBeamLoad, estimateBeamLoadWithFillRate } from '../capacityLayer';
import { deriveLeoConnectivityViewModel } from '../leoServiceViewModel';
import type { ServiceLayerResult } from '../serviceLayer';

const regulatoryResult: RegulatoryResult = {
  isoA2: 'FR',
  isoA3: 'FRA',
  countryName: 'France',
  status: 'ALLOWED_ESTIMATED',
  reason: 'Estimated allowed market.',
  confidence: 0.7,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#22c55e',
  styleOpacity: 0.2,
  isOcean: false,
};

const serviceResult = (
  overrides: Partial<ServiceLayerResult> = {},
): ServiceLayerResult => ({
  status: 'ALLOWED',
  primaryReasonLayer: 'none',
  reason: 'Service available',
  details: [],
  ...overrides,
});

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

describe('deriveLeoConnectivityViewModel — simulated-load source clarity', () => {
  it('shows Simulated Network Load from the planning model', () => {
    const beamLoadResult = estimateBeamLoadWithFillRate({
      lat: 48.8,
      lng: 2.3,
      isOcean: false,
      countryCode: 'FR',
      fillRateResult,
    });

    const vm = deriveLeoConnectivityViewModel({
      satellite: null,
      regulatoryResult,
      beamLoadResult,
      serviceLayerResult: serviceResult(),
      hasRF: true,
      hasSNP: true,
    });

    expect(vm.capacity.hasFillRate).toBe(true);
    expect(vm.capacity.fillRatePercent).toBe(76);
    expect(vm.whyRows.some((row) => row.label === 'Fill Rate')).toBe(false);
    const estimatedLoadRow = vm.whyRows.find((row) => row.label === 'Network Load');
    expect(estimatedLoadRow?.value).toContain(`${beamLoadResult.beamLoadPercent}%`);
    expect(estimatedLoadRow?.detail).toBe(
      `Network Load planning model · load input: 76% · load proxy: ~${beamLoadResult.estimatedActiveUsers} model sessions`,
    );
  });

  it('separates unavailable Fill Rate from heuristic Simulated Network Load outside calibrated cells', () => {
    const beamLoadResult = estimateBeamLoad(48.8, 2.3, false, 'FR');

    const vm = deriveLeoConnectivityViewModel({
      satellite: null,
      regulatoryResult,
      beamLoadResult,
      serviceLayerResult: serviceResult(),
      hasRF: true,
      hasSNP: true,
    });

    expect(vm.capacity.hasFillRate).toBe(false);
    expect(vm.capacity.fillRatePercent).toBeNull();
    expect(vm.capacity.loadEstimatePercent).toBe(beamLoadResult.beamLoadPercent);
    expect(vm.whyRows.some((row) => row.label === 'Fill Rate')).toBe(false);
    const estimatedLoadRow = vm.whyRows.find((row) => row.label === 'Network Load');
    expect(estimatedLoadRow?.value).toContain(`${beamLoadResult.beamLoadPercent}%`);
    expect(estimatedLoadRow?.detail).toBe(
      `Heuristic planning estimate · load proxy: ~${beamLoadResult.estimatedActiveUsers} model sessions`,
    );
  });

  it('uses simulated-load wording when heuristic load is the capacity decision driver', () => {
    const beamLoadResult = estimateBeamLoad(48.8, 2.3, false, 'FR');

    const vm = deriveLeoConnectivityViewModel({
      satellite: null,
      regulatoryResult,
      beamLoadResult,
      serviceLayerResult: serviceResult({
        status: 'DEGRADED',
        primaryReasonLayer: 'capacity',
        reason: 'Beam under load',
      }),
      hasRF: true,
      hasSNP: true,
    });

    expect(vm.decisionDriverLabel).toBe('SIMULATED LOAD LIMIT');
    expect(vm.primaryReasonLabel).toBe('Simulated load constraint');
  });
});
