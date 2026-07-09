import { describe, expect, it } from 'vitest';

import {
  LEO_SERVICE_GATE_ORDER,
  deriveLeoServiceDecision,
  evaluateLeoServiceGates,
  leoServiceGateOrdinal,
} from '../leoServiceDecision';

const allClear = {
  regulatoryStatus: 'ALLOWED_CONFIRMED' as const,
  hasSatellite: true,
  hasRF: true,
  hasSNP: true,
  capacityStatus: 'NOMINAL' as const,
};

describe('deriveLeoServiceDecision — canonical gate ordering (L-Mo1)', () => {
  it('passes all gates when every layer is nominal', () => {
    expect(deriveLeoServiceDecision(allClear)).toEqual({ gate: null, status: 'ALLOWED' });
  });

  it('gates a pending regulatory lookup before everything else', () => {
    const decision = deriveLeoServiceDecision({ ...allClear, regulatoryStatus: null, hasRF: false });
    expect(decision.gate).toBe('REGULATORY_PENDING');
    expect(decision.status).toBe('BLOCKED');
  });

  it('regulatory BLOCKED outranks physical availability', () => {
    const decision = deriveLeoServiceDecision({ ...allClear, regulatoryStatus: 'BLOCKED', hasRF: false });
    expect(decision.gate).toBe('REGULATORY_BLOCKED');
    expect(decision.status).toBe('BLOCKED');
  });

  it('physical unavailability outranks a RESTRICTED market — the pre-audit divergence', () => {
    // serviceLayer used to report DEGRADED (regulatory) here while the route
    // evidence reported BLOCKED. Canonical answer: no RF means no service.
    const decision = deriveLeoServiceDecision({ ...allClear, regulatoryStatus: 'RESTRICTED', hasRF: false });
    expect(decision.gate).toBe('NO_RF');
    expect(decision.status).toBe('BLOCKED');
  });

  it('a RESTRICTED market with full physical availability is DEGRADED', () => {
    const decision = deriveLeoServiceDecision({ ...allClear, regulatoryStatus: 'RESTRICTED' });
    expect(decision.gate).toBe('REGULATORY_RESTRICTED');
    expect(decision.status).toBe('DEGRADED');
  });

  it('RESTRICTED outranks capacity gates', () => {
    const decision = deriveLeoServiceDecision({
      ...allClear,
      regulatoryStatus: 'RESTRICTED',
      capacityStatus: 'SATURATED',
    });
    expect(decision.gate).toBe('REGULATORY_RESTRICTED');
  });

  it('checks satellite, then RF, then SNP', () => {
    expect(evaluateLeoServiceGates({ ...allClear, hasSatellite: false, hasRF: false, hasSNP: false })).toBe('NO_SATELLITE');
    expect(evaluateLeoServiceGates({ ...allClear, hasRF: false, hasSNP: false })).toBe('NO_RF');
    expect(evaluateLeoServiceGates({ ...allClear, hasSNP: false })).toBe('NO_SNP');
  });

  it('capacity saturation outranks capacity degradation and both are DEGRADED', () => {
    expect(deriveLeoServiceDecision({ ...allClear, capacityStatus: 'SATURATED' })).toEqual({
      gate: 'CAPACITY_SATURATED',
      status: 'DEGRADED',
    });
    expect(deriveLeoServiceDecision({ ...allClear, capacityStatus: 'DEGRADED' })).toEqual({
      gate: 'CAPACITY_DEGRADED',
      status: 'DEGRADED',
    });
  });

  it('gate ordinals follow the canonical order and null sorts last', () => {
    const ordinals = LEO_SERVICE_GATE_ORDER.map(leoServiceGateOrdinal);
    expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    expect(leoServiceGateOrdinal(null)).toBeGreaterThan(leoServiceGateOrdinal('CAPACITY_DEGRADED'));
  });
});
