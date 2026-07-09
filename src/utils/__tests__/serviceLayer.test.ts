import { describe, expect, it } from 'vitest';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { BeamLoadResult } from '../capacityLayer';
import { computeServiceStatus } from '../serviceLayer';

const regulatoryResult: RegulatoryResult = {
  isoA2: 'FR',
  isoA3: 'FRA',
  countryName: 'France',
  status: 'ALLOWED_CONFIRMED',
  reason: 'Allowed for test',
  confidence: 1,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#000',
  styleOpacity: 1,
  isOcean: false,
};

const beamLoadResult = {
  capacityStatus: 'NOMINAL',
  beamLoadPercent: 25,
  estimatedActiveUsers: 10,
  beamLoadFraction: 0.25,
  loadSource: 'heuristic',
  loadDataMode: 'heuristic_estimate',
} as BeamLoadResult;

describe('computeServiceStatus OneWeb bent-pipe requirements', () => {
  it('blocks RF-only service when no SNP is reachable', () => {
    const result = computeServiceStatus({
      hasRF: true,
      hasSNP: false,
      regulatoryResult,
      beamLoadResult,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.primaryReasonLayer).toBe('network');
    expect(result.reason).toBe('No gateway reachable — OneWeb bent-pipe service requires simultaneous SNP visibility.');
  });
});

describe('computeServiceStatus canonical gate ordering (L-Mo1)', () => {
  const restricted: RegulatoryResult = { ...regulatoryResult, status: 'RESTRICTED' };

  it('no RF in a RESTRICTED market is BLOCKED (rf), not DEGRADED (regulatory)', () => {
    // Pre-audit divergence: this surface returned DEGRADED/regulatory while the
    // route evidence returned BLOCKED for the same inputs.
    const result = computeServiceStatus({
      hasRF: false,
      hasSNP: false,
      regulatoryResult: restricted,
      beamLoadResult,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.primaryReasonLayer).toBe('rf');
  });

  it('a RESTRICTED market with full physical availability is DEGRADED (regulatory)', () => {
    const result = computeServiceStatus({
      hasRF: true,
      hasSNP: true,
      regulatoryResult: restricted,
      beamLoadResult,
    });

    expect(result.status).toBe('DEGRADED');
    expect(result.primaryReasonLayer).toBe('regulatory');
  });

  it('RESTRICTED outranks capacity saturation and surfaces the load in details', () => {
    const result = computeServiceStatus({
      hasRF: true,
      hasSNP: true,
      regulatoryResult: restricted,
      beamLoadResult: { ...beamLoadResult, capacityStatus: 'SATURATED', beamLoadPercent: 97 } as BeamLoadResult,
    });

    expect(result.status).toBe('DEGRADED');
    expect(result.primaryReasonLayer).toBe('regulatory');
    expect(result.details.some((line) => line.includes('SATURATED'))).toBe(true);
  });

  it('regulatory BLOCKED still outranks everything', () => {
    const result = computeServiceStatus({
      hasRF: false,
      hasSNP: false,
      regulatoryResult: { ...regulatoryResult, status: 'BLOCKED' },
      beamLoadResult,
    });

    expect(result.status).toBe('BLOCKED');
    expect(result.primaryReasonLayer).toBe('regulatory');
  });
});
