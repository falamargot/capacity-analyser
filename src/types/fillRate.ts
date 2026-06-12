export type FillRateSource = 'operational' | 'calibrated' | 'heuristic';

export type FillRateStatistic = 'P50_5MIN_AVG' | 'P95_5MIN_AVG';

export type FillRateCellBoundsMode = 'statistical' | 'visual';

export type FillRateDataMode =
  | 'recent_operational_calibration'
  | 'historical_statistical_average'
  | 'heuristic_estimate';

export interface FillRateCell {
  /** Cell center latitude in WGS-84 degrees. */
  lat: number;
  /** Cell center longitude in WGS-84 degrees. */
  lng: number;
  /** Square cell size in degrees. */
  sizeDeg: number;
  /** Fill rate percentage in [0, 100]. */
  fillRatePct: number;
  /** Statistic represented by this cell. */
  statistic: FillRateStatistic;
  /** Aggregation window in minutes. */
  windowMinutes: number;
  /** Optional number of samples behind the aggregate. */
  sampleCount?: number;
  /** Data provenance for this cell. */
  source: FillRateSource;
  /** User-facing interpretation mode for the data behind this cell. */
  dataMode: FillRateDataMode;
  /** Date or period covered by the source data. */
  sourceDate?: string;
}

export interface FillRateDatasetMetadata {
  id: string;
  label: string;
  constellation: 'ONEWEB_LEO';
  statistic: FillRateStatistic;
  windowMinutes: number;
  source: FillRateSource;
  dataMode: FillRateDataMode;
  sourceDate?: string;
  generatedAt?: string;
  description?: string;
}

export interface FillRateDataset {
  metadata: FillRateDatasetMetadata;
  cells: FillRateCell[];
}

export interface FillRateLookupResult {
  fillRatePct: number;
  source: FillRateSource;
  dataMode: FillRateDataMode;
  statistic: FillRateStatistic;
  windowMinutes: number;
  sourceDate?: string;
  cell: FillRateCell;
}
