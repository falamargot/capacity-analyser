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
