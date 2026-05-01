import { describe, expect, it } from 'vitest';
import type { PublicTransponder } from '../../../types/frequencyPlan';
import { inferPublicTransponder, inferUplinkFrequencyMHz } from '../inference';

const baseTransponder = (frequencyMHz: number): PublicTransponder => ({
  id: `tp-${frequencyMHz}`,
  satelliteName: 'EUTELSAT Example',
  downlink: {
    frequencyMHz,
    polarization: 'H',
    beamName: 'Europe',
    source: 'LYNGSAT',
    confidence: 'HIGH',
  },
  uplink: {
    inferenceMethod: 'UNKNOWN',
    source: 'UNKNOWN',
    confidence: 'UNKNOWN',
  },
  transponder: {
    publicNumber: '1',
  },
  serviceType: 'BROADCAST',
  provenance: {
    sources: [{
      name: 'LyngSat',
      retrievedAt: '2026-04-30T00:00:00.000Z',
      fieldsUsed: ['frequency'],
    }],
    notes: [],
  },
  warnings: [],
});

describe('inferUplinkFrequencyMHz', () => {
  it('maps Ku downlink frequency to the normalized uplink band position', () => {
    const result = inferUplinkFrequencyMHz(11725);

    expect(result.band).toBe('Ku');
    expect(result.method).toBe('BAND_OFFSET_RULE');
    expect(result.frequencyMHz).toBeCloseTo(14125, 3);
  });

  it('supports C-band and Ka-band defaults', () => {
    expect(inferUplinkFrequencyMHz(3800)).toMatchObject({ band: 'C', frequencyMHz: 6287.5 });
    expect(inferUplinkFrequencyMHz(19450)).toMatchObject({ band: 'Ka', frequencyMHz: 29250 });
  });

  it('marks out-of-band downlinks as unknown', () => {
    const result = inferUplinkFrequencyMHz(9000);

    expect(result.band).toBe('Unknown');
    expect(result.method).toBe('UNKNOWN');
    expect(result.frequencyMHz).toBeUndefined();
    expect(result.warning).toContain('outside');
  });
});

describe('inferPublicTransponder', () => {
  it('attaches inferred uplink frequency with low confidence and warnings', () => {
    const inferred = inferPublicTransponder(baseTransponder(11725));

    expect(inferred.uplink).toMatchObject({
      frequencyMHz: 14125,
      source: 'INFERRED',
      confidence: 'LOW',
      inferenceMethod: 'BAND_OFFSET_RULE',
      beamName: 'Unknown public uplink beam',
    });
    expect(inferred.warnings.some((warning) => warning.includes('inferred'))).toBe(true);
  });

  it('keeps uplink unknown when no band rule applies', () => {
    const inferred = inferPublicTransponder(baseTransponder(9000));

    expect(inferred.uplink.frequencyMHz).toBeUndefined();
    expect(inferred.uplink.source).toBe('UNKNOWN');
    expect(inferred.uplink.confidence).toBe('UNKNOWN');
  });

  it('only mirrors user beams for mesh-like service when explicitly enabled', () => {
    const transponder = { ...baseTransponder(11725), serviceType: 'MESH_LIKE' as const };

    expect(inferPublicTransponder(transponder).uplink.beamName).toBe('Unknown public uplink beam');
    expect(inferPublicTransponder(transponder, undefined, { meshLikeEnabled: true }).uplink.beamName).toBe('Europe');
  });
});

