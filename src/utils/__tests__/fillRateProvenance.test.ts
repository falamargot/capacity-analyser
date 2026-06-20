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

    expect(networkLoad.badgeLabel).toBe('Simulated');
    expect(networkLoad.shortLabel).toBe('Simulated Network Load');
    expect(networkLoad.detailLabel).toBe('High-load planning percentile · Calibrated planning model, not live telemetry · 2026-06');
  });

  it('describes synthetic visual-reference calibration without implying raw operational data', () => {
    const calibrated = getFillRateProvenanceDescriptor({
      source: 'calibratedDemo',
      dataMode: 'synthetic_reference_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(calibrated.badgeLabel).toBe('Simulated');
    expect(calibrated.shortLabel).toBe('Simulated Network Load');
    expect(calibrated.detailLabel).toBe('High-load planning percentile · Synthetic planning calibration · 2026-06');
  });

  it('describes reference calibration without implying raw operational data', () => {
    const calibrated = getFillRateProvenanceDescriptor({
      source: 'reference',
      dataMode: 'recent_operational_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });

    expect(calibrated.badgeLabel).toBe('Reference');
    expect(calibrated.shortLabel).toBe('Simulated Network Load');
    expect(calibrated.detailLabel).toBe('High-load planning percentile · Planning reference layer · 2026-06');
  });

  it('describes historical statistical averages distinctly', () => {
    const historical = getFillRateProvenanceDescriptor({
      source: 'reference',
      dataMode: 'historical_statistical_average',
      statistic: 'P50_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2025-Q4',
    });

    expect(historical.badgeLabel).toBe('Simulated');
    expect(historical.shortLabel).toBe('Simulated Network Load');
    expect(historical.detailLabel).toBe('Typical planning percentile · Historical planning baseline, not live telemetry · 2025-Q4');
  });

  it('describes heuristic fallback as an estimate, not fill-rate statistics', () => {
    const heuristic = getFillRateProvenanceDescriptor({
      source: 'heuristic',
      dataMode: 'heuristic_estimate',
    });

    expect(heuristic.badgeLabel).toBe('Heuristic');
    expect(heuristic.shortLabel).toBe('Simulated Network Load');
    expect(heuristic.statisticLabel).toBeNull();
  });
});
