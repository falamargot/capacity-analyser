import { describe, expect, it } from 'vitest';
import type { FillRateCell } from '../../types/fillRate';
import {
  findFillRateCell,
  getFillRateCellBounds,
  lookupFillRateFromCells,
  normalizeFillRateDataset,
} from '../fillRateService';

const cell = (overrides: Partial<FillRateCell>): FillRateCell => ({
  lat: 10,
  lng: 20,
  sizeDeg: 1,
  fillRatePct: 50,
  statistic: 'P95_5MIN_AVG',
  windowMinutes: 5,
  sampleCount: 100,
  source: 'calibrated',
  dataMode: 'recent_operational_calibration',
  sourceDate: '2026-06',
  ...overrides,
});

describe('normalizeFillRateDataset', () => {
  it('normalizes metadata and drops invalid cells', () => {
    const dataset = normalizeFillRateDataset({
      metadata: {
        id: 'test-grid',
        label: 'Test grid',
        statistic: 'P95_5MIN_AVG',
        windowMinutes: 5,
        source: 'operational',
        dataMode: 'historical_statistical_average',
        sourceDate: '2026-06',
      },
      cells: [
        { lat: 48, lng: 2, sizeDeg: 1, fillRatePct: 110 },
        { lat: 91, lng: 2, sizeDeg: 1, fillRatePct: 20 },
        { lat: 40, lng: 190, sizeDeg: 1, fillRatePct: -4, source: 'calibrated' },
      ],
    });

    expect(dataset.metadata.id).toBe('test-grid');
    expect(dataset.metadata.source).toBe('operational');
    expect(dataset.metadata.dataMode).toBe('historical_statistical_average');
    expect(dataset.cells).toHaveLength(2);
    expect(dataset.cells[0].fillRatePct).toBe(100);
    expect(dataset.cells[0].dataMode).toBe('historical_statistical_average');
    expect(dataset.cells[1]).toMatchObject({
      lng: -170,
      fillRatePct: 0,
      source: 'calibrated',
      dataMode: 'historical_statistical_average',
    });
  });
});

describe('findFillRateCell', () => {
  it('returns the cell containing the requested point', () => {
    const cells = [cell({ lat: 48, lng: 2, fillRatePct: 64 })];

    expect(findFillRateCell(cells, 48.1, 2.2)?.fillRatePct).toBe(64);
    expect(findFillRateCell(cells, 50, 2)).toBeNull();
  });

  it('prefers the smallest matching cell, then the highest sample count', () => {
    const cells = [
      cell({ lat: 48, lng: 2, sizeDeg: 2, fillRatePct: 30, sampleCount: 500 }),
      cell({ lat: 48, lng: 2, sizeDeg: 1, fillRatePct: 70, sampleCount: 10 }),
      cell({ lat: 48, lng: 2, sizeDeg: 1, fillRatePct: 80, sampleCount: 100 }),
    ];

    expect(findFillRateCell(cells, 48, 2)?.fillRatePct).toBe(80);
  });

  it('handles cells crossing the antimeridian', () => {
    const cells = [cell({ lat: 0, lng: 179.75, sizeDeg: 1, fillRatePct: 77 })];

    expect(findFillRateCell(cells, 0, -179.9)?.fillRatePct).toBe(77);
  });

  it('keeps statistical bounds strict unless visual bounds are requested', () => {
    const cells = [cell({ lat: 48, lng: 2, sizeDeg: 1, fillRatePct: 64 })];

    expect(findFillRateCell(cells, 48.6, 2)).toBeNull();
    expect(findFillRateCell(cells, 48.6, 2, { boundsMode: 'visual' })?.fillRatePct).toBe(64);
  });
});

describe('getFillRateCellBounds', () => {
  it('uses the same enlarged bounds as the visible map layer in visual mode', () => {
    const strict = getFillRateCellBounds(cell({ lat: 48, lng: 2, sizeDeg: 1 }));
    const visual = getFillRateCellBounds(cell({ lat: 48, lng: 2, sizeDeg: 1 }), 'visual');

    expect(strict.sizeDeg).toBe(1);
    expect(visual.sizeDeg).toBeCloseTo(1.35);
    expect(visual.north).toBeGreaterThan(strict.north);
    expect(visual.south).toBeLessThan(strict.south);
  });

  it('applies a minimum visible cell size for small statistical cells', () => {
    const visual = getFillRateCellBounds(cell({ lat: 48, lng: 2, sizeDeg: 0.25 }), 'visual');

    expect(visual.sizeDeg).toBe(1.15);
  });
});

describe('lookupFillRateFromCells', () => {
  it('returns a normalized lookup result for matching cells', () => {
    const result = lookupFillRateFromCells([
      cell({ lat: 25, lng: 55, fillRatePct: 88, source: 'operational' }),
    ], 25.2, 55.1);

    expect(result).toMatchObject({
      fillRatePct: 88,
      source: 'operational',
      dataMode: 'recent_operational_calibration',
      statistic: 'P95_5MIN_AVG',
      windowMinutes: 5,
      sourceDate: '2026-06',
    });
  });

  it('returns null when no statistical cell covers the point', () => {
    expect(lookupFillRateFromCells([
      cell({ lat: 25, lng: 55, fillRatePct: 88 }),
    ], -20, 55)).toBeNull();
  });

  it('can resolve the same visual bounds used by the map layer', () => {
    const result = lookupFillRateFromCells([
      cell({ lat: 25, lng: 55, sizeDeg: 1, fillRatePct: 88 }),
    ], 25.6, 55, { boundsMode: 'visual' });

    expect(result?.fillRatePct).toBe(88);
  });
});
