import { describe, expect, it } from 'vitest';

import { buildRecommendation } from '../commercialEngine';
import type { CommercialTechnologyOption } from '../commercialTypes';

const makeOption = (overrides: Partial<CommercialTechnologyOption>): CommercialTechnologyOption => ({
  technology: 'leo',
  label: 'LEO',
  status: 'active',
  customerStatus: 'available',
  statusLabel: 'Available',
  available: true,
  downloadMbps: 100,
  uploadMbps: 20,
  rttMs: 70,
  strengths: [],
  regulatoryConfidence: 'confirmed',
  ...overrides,
});

describe('commercial recommendation regulatory confidence', () => {
  it('prefers the available option with stronger regulatory evidence', () => {
    const recommendation = buildRecommendation([
      makeOption({ technology: 'leo', label: 'LEO', regulatoryConfidence: 'pending', rttMs: 60 }),
      makeOption({ technology: 'geo', label: 'GEO', regulatoryConfidence: 'confirmed', rttMs: 620, downloadMbps: 80 }),
    ]);

    expect(recommendation.technology).toBe('geo');
    expect(recommendation.reason).toContain('regulatory evidence');
  });

  it('returns insufficient data when all available paths have uncertain sellability', () => {
    const recommendation = buildRecommendation([
      makeOption({ technology: 'leo', label: 'LEO', regulatoryConfidence: 'pending' }),
      makeOption({ technology: 'geo', label: 'GEO', regulatoryConfidence: 'restricted' }),
    ]);

    expect(recommendation.technology).toBe('insufficient_data');
    expect(recommendation.reason).toContain('regulatory');
  });
});
