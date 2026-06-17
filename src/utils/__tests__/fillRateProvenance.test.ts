import { describe, expect, it } from 'vitest';
import { getFillRateProvenanceDescriptor } from '../fillRateProvenance';

describe('getFillRateProvenanceDescriptor', () => {
  it('describes the calibrated Network Load model as the product metric', () => {
    const networkLoad = getFillRateProvenanceDescriptor({
      source: 'calibratedDemo',
      dataMode: 'calibrated_network_load_model',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(networkLoad.badgeLabel).toBe('Calibrated model');
    expect(networkLoad.shortLabel).toBe('Network Load model');
    expect(networkLoad.detailLabel).toBe('P95 5-min avg · OneWeb-calibrated model · 2026-06');
  });

  it('describes synthetic visual-reference calibration without implying raw operational data', () => {
    const calibrated = getFillRateProvenanceDescriptor({
      source: 'calibratedDemo',
      dataMode: 'synthetic_reference_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(calibrated.badgeLabel).toBe('Calibrated demo');
    expect(calibrated.shortLabel).toBe('Visual reference calibration');
    expect(calibrated.detailLabel).toBe('P95 5-min avg · Synthetic reference calibration · 2026-06');
  });

  it('describes recent operational calibration separately from raw operational data', () => {
    const calibrated = getFillRateProvenanceDescriptor({
      source: 'reference',
      dataMode: 'recent_operational_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(calibrated.badgeLabel).toBe('Reference');
    expect(calibrated.shortLabel).toBe('Usage reference layer');
    expect(calibrated.detailLabel).toBe('P95 5-min avg · Usage reference layer · 2026-06');
  });

  it('describes historical statistical averages distinctly', () => {
    const historical = getFillRateProvenanceDescriptor({
      source: 'reference',
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
