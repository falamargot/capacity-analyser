import { describe, expect, it } from 'vitest';

import {
  buildGeoConfidence,
  buildLeoSingleSiteConfidence,
  buildPredictionConfidence,
  missingFactor,
  positiveFactor,
} from '../predictionConfidence';

describe('buildPredictionConfidence', () => {
  it('scores evidence factors and applies active caps', () => {
    const confidence = buildPredictionConfidence({
      architecture: 'LEO',
      topology: 'Site-to-Site',
      mode: 'ENG',
      factors: [
        positiveFactor('a', 'A', 50, 'A present'),
        positiveFactor('b', 'B', 40, 'B present'),
      ],
      caps: [{ id: 'cap', maxScore: 44, reason: 'Cap applied', applies: true }],
    });

    expect(confidence.score).toBe(44);
    expect(confidence.level).toBe('Low');
    expect(confidence.reasons).toContain('Cap applied');
    expect(confidence.limitation).toContain('not an SLA');
  });

  it('preserves missing factors as reasons without adding score', () => {
    const confidence = buildPredictionConfidence({
      architecture: 'GEO',
      topology: 'Single Site',
      mode: 'COMM',
      factors: [
        positiveFactor('coverage', 'Coverage', 40, 'Coverage available'),
        missingFactor('rf', 'RF', 'RF unavailable'),
      ],
    });

    expect(confidence.score).toBe(40);
    expect(confidence.level).toBe('Low');
    expect(confidence.factors.find((factor) => factor.id === 'rf')?.status).toBe('missing');
  });
});

describe('domain confidence builders', () => {
  it('builds high-confidence LEO single-site evidence when structural, RF, regulatory and load inputs exist', () => {
    const confidence = buildLeoSingleSiteConfidence({
      mode: 'ENG',
      satelliteResolved: true,
      snpResolved: true,
      rfAvailable: true,
      debugAvailable: true,
      regulatoryStatus: 'ALLOWED_CONFIRMED',
      loadSource: 'calibratedDemo',
      elevationDeg: 40,
    });

    expect(confidence.architecture).toBe('LEO');
    expect(confidence.topology).toBe('Single Site');
    expect(confidence.level).toBe('High');
    expect(confidence.score).toBeGreaterThanOrEqual(75);
  });

  it('caps LEO confidence when structural route evidence is missing', () => {
    const confidence = buildLeoSingleSiteConfidence({
      mode: 'COMM',
      satelliteResolved: true,
      snpResolved: false,
      rfAvailable: true,
      debugAvailable: false,
      regulatoryStatus: 'ALLOWED_CONFIRMED',
      loadSource: 'heuristic',
      elevationDeg: 30,
    });

    expect(confidence.level).toBe('Low');
    expect(confidence.score).toBeLessThanOrEqual(44);
    expect(confidence.caps.map((cap) => cap.id)).toContain('missing-structural-evidence');
  });

  it('builds GEO confidence from coverage, RF, public frequency, gateway and payload-class evidence', () => {
    const confidence = buildGeoConfidence({
      mode: 'COMM',
      topology: 'Single Site',
      coverageAvailable: true,
      rfAvailable: true,
      publicFrequencyEvidence: true,
      gatewayResolved: true,
      capacityClassKnown: true,
      regulatoryKnown: true,
      routePending: false,
    });

    expect(confidence.architecture).toBe('GEO');
    expect(confidence.level).toBe('High');
    expect(confidence.factors.find((factor) => factor.id === 'capacity-class')?.reason).toBe('Satellite payload capacity class identified');
  });
});
