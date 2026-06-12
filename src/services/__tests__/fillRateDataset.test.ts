import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  findFillRateCell,
  normalizeFillRateDataset,
} from '../fillRateService';

const DATASET_URL = new URL('../../../public/data/fill-rate/oneweb-leo-fillrate-grid.json', import.meta.url);

async function loadPublicDataset() {
  const raw = JSON.parse(await readFile(DATASET_URL, 'utf8'));
  return normalizeFillRateDataset(raw);
}

describe('OneWeb LEO fill-rate public dataset', () => {
  it('ships the densified v2 calibrated grid', async () => {
    const dataset = await loadPublicDataset();
    const values = dataset.cells.map((cell) => cell.fillRatePct);

    expect(dataset.metadata.id).toBe('oneweb-leo-fillrate-grid-calibrated-v2');
    expect(dataset.metadata.source).toBe('calibrated');
    expect(dataset.metadata.dataMode).toBe('recent_operational_calibration');
    expect(dataset.cells.length).toBeGreaterThanOrEqual(2500);
    expect(dataset.cells.length).toBeLessThanOrEqual(5000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
  });

  it('covers the main calibrated operational corridors', async () => {
    const dataset = await loadPublicDataset();
    const samplePoints = [
      [50, 8],
      [25, 55],
      [40, -90],
      [9, -13],
      [-23, 46],
      [12, 104],
      [-31, 148],
      [-12, -76],
    ];

    for (const [lat, lng] of samplePoints) {
      expect(findFillRateCell(dataset.cells, lat, lng, { boundsMode: 'visual' })).not.toBeNull();
    }
  });
});
