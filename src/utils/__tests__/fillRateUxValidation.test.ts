import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { RegulatoryResult } from '../../services/regulatoryService';
import {
  lookupFillRateFromCells,
  normalizeFillRateDataset,
} from '../../services/fillRateService';
import { estimateBeamLoadWithFillRate } from '../capacityLayer';
import { deriveLeoConnectivityViewModel } from '../leoServiceViewModel';
import type { ServiceLayerResult } from '../serviceLayer';

const DATASET_URL = new URL('../../../public/data/fill-rate/oneweb-leo-fillrate-grid.json', import.meta.url);

const serviceResult: ServiceLayerResult = {
  status: 'ALLOWED',
  primaryReasonLayer: 'none',
  reason: 'Service available',
  details: [],
};

const regulatory = (countryCode: string | null, isOcean = false): RegulatoryResult => ({
  isoA2: countryCode,
  isoA3: countryCode ? `${countryCode}A` : null,
  countryName: countryCode ? `Country ${countryCode}` : null,
  status: 'ALLOWED_ESTIMATED',
  reason: 'Estimated allowed market.',
  confidence: 0.7,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#22c55e',
  styleOpacity: 0.2,
  isOcean,
});

async function loadDataset() {
  const raw = JSON.parse(await readFile(DATASET_URL, 'utf8'));
  return normalizeFillRateDataset(raw);
}

describe('Network Load UX validation scenarios', () => {
  it('uses the global Network Load model for calibrated and inferred regions', async () => {
    const dataset = await loadDataset();
    const siteA = { lat: 54.4, lng: 0.8 };
    const siteB = { lat: 0, lng: -30 };

    const siteAFillRate = lookupFillRateFromCells(dataset.cells, siteA.lat, siteA.lng, { boundsMode: 'visual' });
    const siteBFillRate = lookupFillRateFromCells(dataset.cells, siteB.lat, siteB.lng, { boundsMode: 'visual' });

    expect(siteAFillRate).not.toBeNull();
    expect(siteAFillRate?.dataMode).toBe('calibrated_network_load_model');
    expect(siteBFillRate).not.toBeNull();
    expect(siteBFillRate?.dataMode).toBe('calibrated_network_load_model');

    const siteABeamLoad = estimateBeamLoadWithFillRate({
      lat: siteA.lat,
      lng: siteA.lng,
      isOcean: false,
      countryCode: 'DE',
      fillRateResult: siteAFillRate,
    });
    const siteBBeamLoad = estimateBeamLoadWithFillRate({
      lat: siteB.lat,
      lng: siteB.lng,
      isOcean: true,
      countryCode: null,
      fillRateResult: siteBFillRate,
    });

    const siteAVm = deriveLeoConnectivityViewModel({
      satellite: null,
      regulatoryResult: regulatory('DE'),
      beamLoadResult: siteABeamLoad,
      serviceLayerResult: serviceResult,
      hasRF: true,
      hasSNP: true,
    });
    const siteBVm = deriveLeoConnectivityViewModel({
      satellite: null,
      regulatoryResult: regulatory(null, true),
      beamLoadResult: siteBBeamLoad,
      serviceLayerResult: serviceResult,
      hasRF: true,
      hasSNP: true,
    });

    expect(siteAVm.capacity.hasFillRate).toBe(true);
    expect(siteAVm.whyRows.some((row) => row.label === 'Fill Rate')).toBe(false);
    expect(siteAVm.whyRows.find((row) => row.label === 'Network Load')?.detail)
      .toContain('Network Load planning model');

    expect(siteBVm.capacity.hasFillRate).toBe(true);
    expect(siteBVm.whyRows.some((row) => row.label === 'Fill Rate')).toBe(false);
    expect(siteBVm.whyRows.find((row) => row.label === 'Network Load')?.detail)
      .toContain('Network Load planning model');
  });
});
