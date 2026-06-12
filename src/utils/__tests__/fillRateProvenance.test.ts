import { describe, expect, it } from 'vitest';
import { getFillRateProvenanceDescriptor } from '../fillRateProvenance';

describe('getFillRateProvenanceDescriptor', () => {
  it('describes recent operational calibration separately from raw operational data', () => {
    const calibrated = getFillRateProvenanceDescriptor({
      source: 'calibrated',
      dataMode: 'recent_operational_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(calibrated.badgeLabel).toBe('Calibrated');
    expect(calibrated.shortLabel).toBe('Recent operational calibration');
    expect(calibrated.detailLabel).toBe('P95 5-min avg · Recent ops calibration · 2026-06');
  });

  it('describes historical statistical averages distinctly', () => {
    const historical = getFillRateProvenanceDescriptor({
      source: 'calibrated',
      dataMode: 'historical_statistical_average',
      statistic: 'P50_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2025-Q4',
    });

    expect(historical.badgeLabel).toBe('Historical');
    expect(historical.shortLabel).toBe('Historical statistical average');
    expect(historical.detailLabel).toBe('P50 5-min avg · Historical baseline · 2025-Q4');
  });

  it('describes heuristic fallback as an estimate, not fill-rate statistics', () => {
    const heuristic = getFillRateProvenanceDescriptor({
      source: 'heuristic',
      dataMode: 'heuristic_estimate',
    });

    expect(heuristic.badgeLabel).toBe('Estimated');
    expect(heuristic.shortLabel).toBe('Heuristic fallback');
    expect(heuristic.statisticLabel).toBeNull();
  });
});
