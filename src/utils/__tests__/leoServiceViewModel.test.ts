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
  dataMode: 'recent_operational_calibration',
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
    dataMode: 'recent_operational_calibration',
    sourceDate: '2026-06',
  },
};

describe('deriveLeoConnectivityViewModel — estimated-load source clarity', () => {
  it('shows Estimated Load calibrated by OneWeb reference when a statistical cell is available', () => {
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
    const estimatedLoadRow = vm.whyRows.find((row) => row.label === 'Estimated Load');
    expect(estimatedLoadRow?.value).toContain(`${beamLoadResult.beamLoadPercent}%`);
    expect(estimatedLoadRow?.detail).toBe(
      `Calibrated by OneWeb usage reference · base heuristic: ${beamLoadResult.baseEstimatedLoadPct}% · reference cell: 76% · confidence: 50% · equiv. users: ~${beamLoadResult.estimatedActiveUsers}`,
    );
  });

  it('separates unavailable Fill Rate from heuristic Estimated Load outside calibrated cells', () => {
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
    const estimatedLoadRow = vm.whyRows.find((row) => row.label === 'Estimated Load');
    expect(estimatedLoadRow?.value).toContain(`${beamLoadResult.beamLoadPercent}%`);
    expect(estimatedLoadRow?.detail).toBe(
      `Heuristic estimate · equiv. users: ~${beamLoadResult.estimatedActiveUsers}`,
    );
  });

  it('uses estimated-load wording when heuristic load is the capacity decision driver', () => {
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

    expect(vm.decisionDriverLabel).toBe('ESTIMATED LOAD LIMIT');
    expect(vm.primaryReasonLabel).toBe('Estimated load constraint');
  });
});
