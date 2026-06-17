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

function cellsInBox(
  cells: Awaited<ReturnType<typeof loadPublicDataset>>['cells'],
  bounds: { south: number; north: number; west: number; east: number },
) {
  return cells.filter((cell) => (
    cell.lat >= bounds.south
    && cell.lat <= bounds.north
    && cell.lng >= bounds.west
    && cell.lng <= bounds.east
  ));
}

function averageFillRate(cells: Awaited<ReturnType<typeof loadPublicDataset>>['cells']) {
  return cells.reduce((sum, cell) => sum + cell.fillRatePct, 0) / Math.max(1, cells.length);
}

function distanceDeg(
  left: Awaited<ReturnType<typeof loadPublicDataset>>['cells'][number],
  right: Awaited<ReturnType<typeof loadPublicDataset>>['cells'][number],
) {
  const dLat = right.lat - left.lat;
  const dLng = (right.lng - left.lng) * Math.cos((left.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function buildSpatialIndex(
  cells: Awaited<ReturnType<typeof loadPublicDataset>>['cells'],
  bucketSizeDeg = 5,
) {
  const index = new Map<string, typeof cells>();

  for (const cell of cells) {
    const key = `${Math.floor(cell.lat / bucketSizeDeg)}:${Math.floor(cell.lng / bucketSizeDeg)}`;
    const bucket = index.get(key);
    if (bucket) {
      bucket.push(cell);
    } else {
      index.set(key, [cell]);
    }
  }

  return index;
}

function nearbyIndexedCells(
  cell: Awaited<ReturnType<typeof loadPublicDataset>>['cells'][number],
  index: Map<string, Awaited<ReturnType<typeof loadPublicDataset>>['cells']>,
  radiusDeg: number,
  bucketSizeDeg = 5,
) {
  const latBucket = Math.floor(cell.lat / bucketSizeDeg);
  const lngBucket = Math.floor(cell.lng / bucketSizeDeg);
  const bucketRadius = Math.ceil(radiusDeg / bucketSizeDeg) + 1;
  const matches: Awaited<ReturnType<typeof loadPublicDataset>>['cells'] = [];

  for (let y = latBucket - bucketRadius; y <= latBucket + bucketRadius; y += 1) {
    for (let x = lngBucket - bucketRadius; x <= lngBucket + bucketRadius; x += 1) {
      const bucket = index.get(`${y}:${x}`);
      if (!bucket) continue;
      matches.push(...bucket.filter((other) => other !== cell && distanceDeg(cell, other) <= radiusDeg));
    }
  }

  return matches;
}

describe('OneWeb LEO Network Load public dataset', () => {
  it('ships the global v6 calibrated Network Load grid', async () => {
    const dataset = await loadPublicDataset();
    const values = dataset.cells.map((cell) => cell.fillRatePct);

    expect(dataset.metadata.id).toBe('oneweb-leo-network-load-calibrated-v6');
    expect(dataset.metadata.label).toBe('OneWeb LEO network load grid');
    expect(dataset.metadata.source).toBe('calibratedDemo');
    expect(dataset.metadata.dataMode).toBe('calibrated_network_load_model');
    expect(dataset.cells.every((cell) => cell.percentile === 'P95')).toBe(true);
    expect(dataset.cells.length).toBeGreaterThanOrEqual(21000);
    expect(dataset.cells.length).toBeLessThanOrEqual(23000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
    expect(values.filter((value) => value >= 70).length / values.length).toBeLessThan(0.04);
  });

  it('keeps calibrated regional distribution while covering the globe', async () => {
    const dataset = await loadPublicDataset();

    const referenceRegions = [
      { name: 'North America', bounds: { south: 18, north: 55, west: -130, east: -65 }, minCells: 900 },
      { name: 'Europe Mediterranean', bounds: { south: 32, north: 61, west: -10, east: 35 }, minCells: 550 },
      { name: 'Middle East Gulf', bounds: { south: 16, north: 34, west: 35, east: 65 }, minCells: 180 },
      { name: 'South America', bounds: { south: -45, north: 12, west: -82, east: -35 }, minCells: 900 },
      { name: 'Africa', bounds: { south: -35, north: 16, west: -20, east: 50 }, minCells: 1100 },
      { name: 'South Asia SEA', bounds: { south: -10, north: 25, west: 72, east: 118 }, minCells: 550 },
      { name: 'Australia NZ', bounds: { south: -43, north: -20, west: 112, east: 178 }, minCells: 450 },
    ];

    for (const region of referenceRegions) {
      expect(cellsInBox(dataset.cells, region.bounds).length, region.name).toBeGreaterThanOrEqual(region.minCells);
    }

    const gulfCells = cellsInBox(dataset.cells, { south: 16, north: 34, west: 35, east: 65 });
    const europeCells = cellsInBox(dataset.cells, { south: 32, north: 61, west: -10, east: 35 });
    const remotePacific = cellsInBox(dataset.cells, { south: -25, north: 18, west: -170, east: -125 });

    expect(averageFillRate(gulfCells)).toBeGreaterThan(65);
    expect(gulfCells.filter((cell) => cell.fillRatePct >= 70).length / gulfCells.length).toBeGreaterThan(0.45);
    expect(averageFillRate(europeCells)).toBeGreaterThan(30);
    expect(averageFillRate(remotePacific)).toBeLessThan(12);
  });

  it('forms contiguous statistical patches with rare isolated cells', async () => {
    const dataset = await loadPublicDataset();
    const index = buildSpatialIndex(dataset.cells);
    const cellsWithNeighbors = dataset.cells.filter((cell) => nearbyIndexedCells(cell, index, 2.6).length > 0);
    const cellsWithPatch = dataset.cells.filter((cell) => nearbyIndexedCells(cell, index, 4.4).length >= 2);

    expect(cellsWithNeighbors.length / dataset.cells.length).toBeGreaterThan(0.98);
    expect(cellsWithPatch.length / dataset.cells.length).toBeGreaterThan(0.9);
  });

  it('keeps adjacent cell values locally correlated', async () => {
    const dataset = await loadPublicDataset();
    const index = buildSpatialIndex(dataset.cells);
    const neighborDeltas = dataset.cells.flatMap((cell) => (
      nearbyIndexedCells(cell, index, 2.6).map((neighbor) => Math.abs(cell.fillRatePct - neighbor.fillRatePct))
    ));
    const averageDelta = neighborDeltas.reduce((sum, delta) => sum + delta, 0) / Math.max(1, neighborDeltas.length);

    expect(averageDelta).toBeLessThan(12);
  });

  it('does not synthesize saturated Madagascar and Reunion hotspots', async () => {
    const dataset = await loadPublicDataset();
    const madagascar = findFillRateCell(dataset.cells, -21, 46, { boundsMode: 'visual' });
    const reunion = findFillRateCell(dataset.cells, -21.1, 55.5, { boundsMode: 'visual' });

    expect([madagascar, reunion].every((cell) => !cell || cell.fillRatePct < 70)).toBe(true);
  });

  it('keeps central Africa and remote oceans low unless calibrated continuity lifts them', async () => {
    const dataset = await loadPublicDataset();
    const centralAfrica = cellsInBox(dataset.cells, { south: -10, north: 15, west: 10, east: 32 });
    const openAtlantic = cellsInBox(dataset.cells, { south: -35, north: 20, west: -55, east: -20 });
    const indianOcean = cellsInBox(dataset.cells, { south: -35, north: 5, west: 55, east: 95 });
    const europe = cellsInBox(dataset.cells, { south: 32, north: 61, west: -10, east: 35 });

    expect(averageFillRate(centralAfrica)).toBeLessThan(26);
    expect(averageFillRate(openAtlantic)).toBeLessThan(32);
    expect(averageFillRate(indianOcean)).toBeLessThan(26);
    expect(averageFillRate(europe)).toBeLessThan(42);
    expect(europe.filter((cell) => cell.fillRatePct >= 70).length / europe.length).toBeLessThan(0.06);
  });

  it('estimates unsupported Indian Ocean trunk points as low-load model cells', async () => {
    const dataset = await loadPublicDataset();
    const unsupportedOpenOceanPoints = [
      [2, 55],
      [-10, 60],
      [-20, 75],
      [-28, 90],
      [-31, 82],
    ];

    for (const [lat, lng] of unsupportedOpenOceanPoints) {
      const cell = findFillRateCell(dataset.cells, lat, lng, { boundsMode: 'statistical' });
      expect(cell).not.toBeNull();
      expect(cell?.fillRatePct).toBeLessThanOrEqual(40);
    }
  });

  it('keeps only sparse visible South Indian Ocean reference cells', async () => {
    const dataset = await loadPublicDataset();
    const visibleTracePoints = [
      [-21.25, 57],
      [-25, 70.5],
      [-32.5, 88],
      [-35, 103],
      [-37.5, 115.5],
    ];

    for (const [lat, lng] of visibleTracePoints) {
      expect(findFillRateCell(dataset.cells, lat, lng, { boundsMode: 'statistical' })).not.toBeNull();
    }
  });
});
