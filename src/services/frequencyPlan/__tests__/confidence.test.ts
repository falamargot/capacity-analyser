import { describe, expect, it } from 'vitest';
import type { PublicTransponder } from '../../../types/frequencyPlan';
import { getOverallConfidence, getTransponderBand, getTransponderEvidenceLabel, summarizeFrequencyPlan } from '../confidence';

const makeTransponder = (overrides: Partial<PublicTransponder>): PublicTransponder => ({
  id: 'tp-1',
  satelliteName: 'EUTELSAT Example',
  downlink: {
    frequencyMHz: 11727,
    polarization: 'H',
    beamName: 'Widebeam',
    source: 'LYNGSAT',
    confidence: 'HIGH',
  },
  uplink: {
    frequencyMHz: 14125,
    beamName: 'Unknown public uplink beam',
    inferenceMethod: 'BAND_OFFSET_RULE',
    source: 'INFERRED',
    confidence: 'LOW',
  },
  transponder: {},
  provenance: { sources: [], notes: [] },
  warnings: [],
  ...overrides,
});

describe('frequency plan confidence helpers', () => {
  it('summarizes known, inferred, and unknown field coverage', () => {
    const summary = summarizeFrequencyPlan([
      makeTransponder({ id: 'tp-1' }),
      makeTransponder({
        id: 'tp-2',
        downlink: {
          frequencyMHz: 9000,
          source: 'LYNGSAT',
          confidence: 'MEDIUM',
        },
        uplink: {
          inferenceMethod: 'UNKNOWN',
          source: 'UNKNOWN',
          confidence: 'UNKNOWN',
        },
      }),
    ]);

    expect(summary).toEqual({
      total: 2,
      downlinkKnown: 2,
      downlinkBeamKnown: 1,
      uplinkInferred: 1,
      uplinkUnknown: 1,
    });
  });

  it('labels bands, evidence, and aggregate confidence for UI badges', () => {
    const transponder = makeTransponder({});

    expect(getTransponderBand(transponder)).toBe('Ku');
    expect(getTransponderEvidenceLabel(transponder)).toBe('Inferred');
    expect(getOverallConfidence(transponder)).toBe('LOW');
  });
});

