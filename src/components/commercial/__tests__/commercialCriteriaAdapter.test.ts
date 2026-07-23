import { describe, expect, it } from 'vitest';
import { buildCommercialCriteria } from '../commercialCriteriaAdapter';

const fullGeo = {
  technology: 'geo' as const,
  rttMs: 545,
  sustainedDownlinkMbps: 152,
  sustainedUplinkMbps: 48,
  theoreticalDownlinkMbps: 320,
  theoreticalUplinkMbps: 90,
  availabilityPct: 99.2,
  availabilityAsOf: '2026-05-01T00:00:00.000Z',
};

describe('buildCommercialCriteria — mapping', () => {
  it('maps a complete GEO source onto criteria and evidence', () => {
    const c = buildCommercialCriteria(fullGeo);
    expect(c.sustainedDownlinkMbps).toBe(152);
    expect(c.sustainedUplinkMbps).toBe(48);
    expect(c.theoreticalDownlinkMbps).toBe(320);
    expect(c.theoreticalUplinkMbps).toBe(90);
    expect(c.availabilityPct).toBe(99.2);
    // Not wired in E2a.
    expect(c.dutyCycle).toBeNull();
    expect(c.contentionRatio).toBeNull();
    expect(c.serviceDiversity).toBeNull();
    expect(c.mobilityCompatible).toBeNull();
    // Evidence carries provenance and units.
    expect(c.evidence.availability).toMatchObject({ value: 99.2, unit: '%', nature: 'estimated' });
    expect(c.evidence.availability?.source).toContain('GEO');
    expect(c.evidence.availability?.asOf).toBe('2026-05-01T00:00:00.000Z');
    expect(c.evidence.sustainedThroughput?.unit).toBe('Mbps');
    expect(c.evidence.latency).toMatchObject({ value: 545, unit: 'ms', nature: 'modeled' });
  });

  it('maps a complete LEO source with LEO-labelled evidence', () => {
    const c = buildCommercialCriteria({
      technology: 'leo', rttMs: 42, sustainedDownlinkMbps: 90, sustainedUplinkMbps: 30,
      theoreticalDownlinkMbps: 180, theoreticalUplinkMbps: 60, availabilityPct: 98.4,
    });
    expect(c.availabilityPct).toBe(98.4);
    expect(c.evidence.availability?.source).toContain('LEO');
    expect(c.evidence.latency?.source).toContain('LEO');
  });
});

describe('buildCommercialCriteria — no invented symmetry', () => {
  it('never fills a technology from another: availability passed to GEO only stays null for LEO', () => {
    const geo = buildCommercialCriteria({ technology: 'geo', availabilityPct: 99.2 });
    const leo = buildCommercialCriteria({ technology: 'leo' }); // no availability provided
    expect(geo.availabilityPct).toBe(99.2);
    expect(leo.availabilityPct).toBeNull();
    expect(leo.evidence.availability).toBeUndefined();
  });

  it('keeps absent values null and omits their evidence', () => {
    const c = buildCommercialCriteria({ technology: 'geo', rttMs: 500 });
    expect(c.sustainedDownlinkMbps).toBeNull();
    expect(c.availabilityPct).toBeNull();
    expect(c.evidence.sustainedThroughput).toBeUndefined();
    expect(c.evidence.availability).toBeUndefined();
    expect(c.evidence.latency).toBeDefined();
  });
});

describe('buildCommercialCriteria — directions and bounds', () => {
  it('preserves both directions and documents them in evidence', () => {
    const c = buildCommercialCriteria({ technology: 'geo', sustainedDownlinkMbps: 400, sustainedUplinkMbps: 100 });
    expect(c.sustainedDownlinkMbps).toBe(400);
    expect(c.sustainedUplinkMbps).toBe(100);
    expect(c.evidence.sustainedThroughput?.note).toContain('Downlink 400');
    expect(c.evidence.sustainedThroughput?.note).toContain('Uplink 100');
    // Conservative bidirectional value in evidence is the minimum of the two.
    expect(c.evidence.sustainedThroughput?.value).toBe(100);
  });

  it('does not copy a single known direction into the other', () => {
    const c = buildCommercialCriteria({ technology: 'geo', sustainedDownlinkMbps: 400 });
    expect(c.sustainedDownlinkMbps).toBe(400);
    expect(c.sustainedUplinkMbps).toBeNull();
    expect(c.evidence.sustainedThroughput?.value).toBeNull(); // incomplete bidirectional
    expect(c.evidence.sustainedThroughput?.note).toContain('Uplink unknown');
  });

  it('rejects out-of-range and non-finite values', () => {
    const c = buildCommercialCriteria({
      technology: 'geo', availabilityPct: 150, sustainedDownlinkMbps: -5,
      theoreticalDownlinkMbps: Number.NaN, rttMs: Number.POSITIVE_INFINITY,
    });
    expect(c.availabilityPct).toBeNull(); // > 100
    expect(c.sustainedDownlinkMbps).toBeNull(); // negative
    expect(c.theoreticalDownlinkMbps).toBeNull(); // NaN
    expect(c.evidence.latency).toBeUndefined(); // infinite RTT
  });

  it('validates operational evidence while retaining explicit unavailable reasons', () => {
    const c = buildCommercialCriteria({
      technology: 'leo',
      operationalEvidence: {
        mobilityFit: {
          value: true,
          nature: 'inferred',
          source: 'Selected mobile terminal',
        },
        contention: {
          value: 8,
          unit: 'equivalent active sessions',
          nature: 'estimated',
          source: 'Simulated beam load',
        },
        dutyCycle: {
          value: null,
          unit: '% usable time',
          nature: 'estimated',
          source: 'No canonical source',
          note: 'Not assessed.',
        },
        serviceDiversity: {
          value: 2,
          nature: 'inferred',
          source: 'Invalid fixture',
        },
      },
    });
    expect(c.mobilityCompatible).toBe(true);
    expect(c.contentionRatio).toBe(8);
    expect(c.dutyCycle).toBeNull();
    expect(c.evidence.dutyCycle?.note).toBe('Not assessed.');
    expect(c.serviceDiversity).toBeNull();
    expect(c.evidence.serviceDiversity?.value).toBeNull();
  });
});
