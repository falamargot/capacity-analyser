import { describe, expect, it } from 'vitest';
import type { PublicTransponder } from '../../../types/frequencyPlan';
import type { GeoRfContext } from '../../../types/geoRfContext';
import {
  matchPublicTransponders,
  normalizeBeamName,
  scorePublicTransponderCandidate,
} from '../publicTransponderMatcher';

const context = (overrides: Partial<GeoRfContext> = {}): GeoRfContext => ({
  satelliteId: '40875',
  satelliteName: 'EUTELSAT 8 WEST B',
  topology: 'RETURN',
  band: 'C',
  uplink: {
    frequencyGHz: 5.9,
    frequencyMHz: 5900,
    bandwidthMHz: 36,
    coverageName: 'E8WB C Band Receive',
    beamName: 'C Band Receive',
    source: 'SELECTED_COVERAGE',
    confidence: 'HIGH',
    warnings: [],
  },
  downlink: {
    frequencyGHz: 3.8,
    frequencyMHz: 3800,
    bandwidthMHz: 36,
    coverageName: 'E8WB C Band Europe Downlink',
    beamName: 'Europe',
    polarization: 'H',
    source: 'SELECTED_COVERAGE',
    confidence: 'HIGH',
    warnings: [],
  },
  payload: {
    selectedCoverageName: 'E8WB C Band Europe Downlink',
    selectedCoverageRole: 'DOWNLINK',
  },
  provenance: {
    rfParametersSource: ['test'],
    notes: [],
  },
  ...overrides,
});

const transponder = (overrides: Partial<PublicTransponder> = {}): PublicTransponder => ({
  id: 'tp-1',
  satelliteName: 'EUTELSAT 8 WEST B',
  orbitalPosition: '8W',
  downlink: {
    frequencyMHz: 3800.4,
    polarization: 'H',
    beamName: 'Europe beam',
    source: 'LYNGSAT',
    confidence: 'HIGH',
  },
  uplink: {
    frequencyMHz: 5900,
    beamName: 'Unknown gateway beam',
    inferenceMethod: 'NORMALIZED_BAND_POSITION',
    source: 'INFERRED',
    confidence: 'LOW',
  },
  transponder: {
    publicNumber: 'C12',
    publicName: 'TP C12',
  },
  provenance: { sources: [], notes: [] },
  warnings: [],
  groupedObservationCount: 3,
  ...overrides,
});

describe('public transponder matcher', () => {
  it('normalizes beam labels while preserving geographic terms', () => {
    expect(normalizeBeamName('Europe C-Band Receive Beam')).toBe('europe c');
    expect(normalizeBeamName('MENA Widebeam Downlink Coverage')).toBe('mena widebeam');
  });

  it('scores an exact downlink match with high confidence', () => {
    const result = scorePublicTransponderCandidate(context(), transponder());

    expect(result.status).toBe('EXACT_MATCH');
    expect(result.confidence).toBe('HIGH');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('scores a near downlink match', () => {
    const match = matchPublicTransponders(context(), [
      transponder({ id: 'near', downlink: { ...transponder().downlink, frequencyMHz: 3804 } }),
    ]);

    expect(match.status).toBe('NEAR_MATCH');
    expect(match.confidence).toBe('MEDIUM');
  });

  it('scores a beam-only match when frequency is unavailable in context', () => {
    const match = matchPublicTransponders(context({
      downlink: {
        ...context().downlink,
        frequencyGHz: undefined,
        frequencyMHz: undefined,
      },
    }), [transponder()]);

    expect(match.status).toBe('BEAM_ONLY_MATCH');
    expect(match.confidence).toBe('LOW');
  });

  it('returns no match when public candidates conflict', () => {
    const match = matchPublicTransponders(context(), [
      transponder({
        downlink: {
          ...transponder().downlink,
          frequencyMHz: 4100,
          polarization: 'V',
          beamName: 'Africa',
        },
      }),
    ]);

    expect(match.status).toBe('NO_MATCH');
    expect(match.candidateCount).toBe(1);
  });

  it('returns no public data when normalized data is empty or missing', () => {
    const match = matchPublicTransponders(context(), []);

    expect(match.status).toBe('NO_PUBLIC_DATA');
    expect(match.source).toBe('NONE');
    expect(match.warnings).toContain('No public frequency data available for this satellite.');
  });

  it('labels inferred public uplink as a warning and applies the scoring penalty', () => {
    const inferred = scorePublicTransponderCandidate(context(), transponder());
    const explicit = scorePublicTransponderCandidate(context(), transponder({
      uplink: {
        ...transponder().uplink,
        source: 'UNKNOWN',
        confidence: 'UNKNOWN',
        inferenceMethod: 'UNKNOWN',
      },
    }));

    expect(inferred.warnings).toContain('Public uplink frequency is inferred from band rules.');
    expect(explicit.score - inferred.score).toBe(20);
  });

  it('sorts candidate transponders by score', () => {
    const match = matchPublicTransponders(context(), [
      transponder({ id: 'bad', downlink: { ...transponder().downlink, frequencyMHz: 4100, beamName: 'Africa' } }),
      transponder({ id: 'best', downlink: { ...transponder().downlink, frequencyMHz: 3800.2, beamName: 'Europe beam' } }),
      transponder({ id: 'near', downlink: { ...transponder().downlink, frequencyMHz: 3803, beamName: 'Europe beam' } }),
    ]);

    expect(match.candidates?.[0].transponder.id).toBe('best');
    expect(match.selectedCandidateId).toBe('best');
  });
});
