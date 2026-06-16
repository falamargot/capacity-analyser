import type {
  FillRateCellBoundsMode,
  FillRateCell,
  FillRateDataMode,
  FillRateDataset,
  FillRateLookupResult,
  FillRatePercentile,
  FillRateSource,
  FillRateStatistic,
} from '../types/fillRate';

export const ONEWEB_LEO_FILL_RATE_GRID_URL = '/data/fill-rate/oneweb-leo-fillrate-grid.json';
export const FILL_RATE_CELL_VISUAL_SCALE = 1.35;
export const FILL_RATE_CELL_MIN_VISUAL_SIZE_DEG = 1.15;

const VALID_SOURCES = new Set<FillRateSource>(['operational', 'reference', 'calibratedDemo']);
const VALID_STATISTICS = new Set<FillRateStatistic>(['P50_5MIN_AVG', 'P95_5MIN_AVG']);
const VALID_PERCENTILES = new Set<FillRatePercentile>(['P50', 'P95']);
const VALID_DATA_MODES = new Set<FillRateDataMode>([
  'synthetic_reference_calibration',
  'recent_operational_calibration',
  'historical_statistical_average',
  'heuristic_estimate',
]);

const datasetPromiseByUrl = new Map<string, Promise<FillRateDataset>>();
const cellsPromiseByUrl = new Map<string, Promise<FillRateCell[]>>();

interface FillRateCellBounds {
  west: number;
  east: number;
  south: number;
  north: number;
  sizeDeg: number;
}

interface FillRateLookupOptions {
  boundsMode?: FillRateCellBoundsMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeLng(lng: number): number {
  let normalized = lng;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function getCellSizeForBounds(cell: FillRateCell, boundsMode: FillRateCellBoundsMode): number {
  if (boundsMode === 'visual') {
    return Math.max(cell.sizeDeg * FILL_RATE_CELL_VISUAL_SCALE, FILL_RATE_CELL_MIN_VISUAL_SIZE_DEG);
  }
  return cell.sizeDeg;
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeSource(value: unknown, fallback: FillRateSource): FillRateSource {
  const source = getString(value);
  if (source === 'calibrated') return 'calibratedDemo';
  if (source === 'heuristic') return 'reference';
  return source && VALID_SOURCES.has(source as FillRateSource)
    ? source as FillRateSource
    : fallback;
}

function normalizeStatistic(value: unknown, fallback: FillRateStatistic): FillRateStatistic {
  const statistic = getString(value);
  return statistic && VALID_STATISTICS.has(statistic as FillRateStatistic)
    ? statistic as FillRateStatistic
    : fallback;
}

function percentileFromStatistic(statistic: FillRateStatistic): FillRatePercentile {
  return statistic === 'P50_5MIN_AVG' ? 'P50' : 'P95';
}

function normalizePercentile(value: unknown, statistic: FillRateStatistic): FillRatePercentile {
  const percentile = getString(value);
  return percentile && VALID_PERCENTILES.has(percentile as FillRatePercentile)
    ? percentile as FillRatePercentile
    : percentileFromStatistic(statistic);
}

function defaultDataModeForSource(source: FillRateSource): FillRateDataMode {
  if (source === 'operational') return 'recent_operational_calibration';
  if (source === 'calibratedDemo') return 'synthetic_reference_calibration';
  return 'historical_statistical_average';
}

function normalizeDataMode(value: unknown, fallback: FillRateDataMode): FillRateDataMode {
  const dataMode = getString(value);
  return dataMode && VALID_DATA_MODES.has(dataMode as FillRateDataMode)
    ? dataMode as FillRateDataMode
    : fallback;
}

function normalizeCell(
  value: unknown,
  datasetDefaults: Pick<FillRateDataset['metadata'], 'source' | 'dataMode' | 'sourceDate' | 'statistic' | 'windowMinutes'>,
): FillRateCell | null {
  if (!isRecord(value)) return null;

  const lat = asFiniteNumber(value['lat']);
  const lng = asFiniteNumber(value['lng']);
  const sizeDeg = asFiniteNumber(value['sizeDeg']);
  const fillRatePct = asFiniteNumber(value['fillRatePct']);

  if (lat == null || lng == null || sizeDeg == null || fillRatePct == null) return null;
  if (lat < -90 || lat > 90 || sizeDeg <= 0 || sizeDeg > 10) return null;

  const sampleCount = asFiniteNumber(value['sampleCount']);
  const source = normalizeSource(value['source'], datasetDefaults.source);
  const statistic = normalizeStatistic(value['statistic'], datasetDefaults.statistic);

  return {
    lat,
    lng: normalizeLng(lng),
    sizeDeg,
    fillRatePct: clampPercent(fillRatePct),
    percentile: normalizePercentile(value['percentile'], statistic),
    statistic,
    windowMinutes: asFiniteNumber(value['windowMinutes']) ?? datasetDefaults.windowMinutes,
    sampleCount: sampleCount != null && sampleCount >= 0 ? Math.round(sampleCount) : undefined,
    source,
    dataMode: normalizeDataMode(value['dataMode'], datasetDefaults.dataMode),
    sourceDate: getString(value['sourceDate']) ?? datasetDefaults.sourceDate,
  };
}

export function normalizeFillRateDataset(raw: unknown): FillRateDataset {
  const root = isRecord(raw) ? raw : {};
  const metadataRaw = isRecord(root['metadata']) ? root['metadata'] : {};
  const source = normalizeSource(metadataRaw['source'], 'calibratedDemo');
  const dataMode = normalizeDataMode(metadataRaw['dataMode'], defaultDataModeForSource(source));
  const statistic = normalizeStatistic(metadataRaw['statistic'], 'P95_5MIN_AVG');
  const windowMinutes = asFiniteNumber(metadataRaw['windowMinutes']) ?? 5;
  const sourceDate = getString(metadataRaw['sourceDate']);

  const metadata: FillRateDataset['metadata'] = {
    id: getString(metadataRaw['id']) ?? 'oneweb-leo-fillrate-grid',
    label: getString(metadataRaw['label']) ?? 'OneWeb LEO fill rate grid',
    constellation: 'ONEWEB_LEO',
    statistic,
    windowMinutes,
    source,
    dataMode,
    sourceDate,
    generatedAt: getString(metadataRaw['generatedAt']),
    description: getString(metadataRaw['description']),
  };

  const rawCells = Array.isArray(root['cells']) ? root['cells'] : [];
  const cells = rawCells
    .map((cell) => normalizeCell(cell, {
      source,
      dataMode,
      sourceDate,
      statistic,
      windowMinutes,
    }))
    .filter((cell): cell is FillRateCell => cell !== null);

  return { metadata, cells };
}

export function getFillRateCellBounds(
  cell: FillRateCell,
  boundsMode: FillRateCellBoundsMode = 'statistical',
): FillRateCellBounds {
  const sizeDeg = getCellSizeForBounds(cell, boundsMode);
  const half = sizeDeg / 2;
  return {
    west: normalizeLng(cell.lng - half),
    east: normalizeLng(cell.lng + half),
    south: Math.max(-90, cell.lat - half),
    north: Math.min(90, cell.lat + half),
    sizeDeg,
  };
}

function cellContains(
  cell: FillRateCell,
  lat: number,
  lng: number,
  boundsMode: FillRateCellBoundsMode,
): boolean {
  const normalizedLngValue = normalizeLng(lng);
  const { west, east, south, north } = getFillRateCellBounds(cell, boundsMode);

  const latInCell = lat >= south && lat < north;
  const lngInCell = west <= east
    ? normalizedLngValue >= west && normalizedLngValue < east
    : normalizedLngValue >= west || normalizedLngValue < east;

  return latInCell && lngInCell;
}

export function findFillRateCell(
  cells: readonly FillRateCell[],
  lat: number,
  lng: number,
  options: FillRateLookupOptions = {},
): FillRateCell | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90) return null;

  const boundsMode = options.boundsMode ?? 'statistical';
  const matches = cells.filter((cell) => cellContains(cell, lat, lng, boundsMode));
  if (matches.length === 0) return null;

  return matches.sort((left, right) => {
    if (left.sizeDeg !== right.sizeDeg) return left.sizeDeg - right.sizeDeg;
    return (right.sampleCount ?? 0) - (left.sampleCount ?? 0);
  })[0] ?? null;
}

export function lookupFillRateFromCells(
  cells: readonly FillRateCell[],
  lat: number,
  lng: number,
  options: FillRateLookupOptions = {},
): FillRateLookupResult | null {
  const cell = findFillRateCell(cells, lat, lng, options);
  if (!cell) return null;

  return {
    fillRatePct: cell.fillRatePct,
    percentile: cell.percentile,
    source: cell.source,
    dataMode: cell.dataMode,
    statistic: cell.statistic,
    windowMinutes: cell.windowMinutes,
    sourceDate: cell.sourceDate,
    cell,
  };
}

export async function loadFillRateDataset(
  url = ONEWEB_LEO_FILL_RATE_GRID_URL,
): Promise<FillRateDataset> {
  const cached = datasetPromiseByUrl.get(url);
  if (cached) return cached;

  const promise = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load fill-rate dataset (${response.status})`);
      }
      return response.json();
    })
    .then(normalizeFillRateDataset);

  datasetPromiseByUrl.set(url, promise);
  return promise;
}

export async function loadFillRateCells(url = ONEWEB_LEO_FILL_RATE_GRID_URL): Promise<FillRateCell[]> {
  const cached = cellsPromiseByUrl.get(url);
  if (cached) return cached;

  const promise = loadFillRateDataset(url).then((dataset) => dataset.cells);
  cellsPromiseByUrl.set(url, promise);
  return promise;
}

export async function lookupFillRate(
  lat: number,
  lng: number,
  options: FillRateLookupOptions = {},
): Promise<FillRateLookupResult | null> {
  const cells = await loadFillRateCells();
  return lookupFillRateFromCells(cells, lat, lng, options);
}

export function clearFillRateCacheForTests(): void {
  datasetPromiseByUrl.clear();
  cellsPromiseByUrl.clear();
}
