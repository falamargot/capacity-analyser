import type {
  EstimatedLoadSource,
  FillRateDataMode,
  FillRateStatistic,
} from '../types/fillRate';

export interface FillRateProvenanceInput {
  source?: EstimatedLoadSource | null;
  dataMode?: FillRateDataMode | null;
  statistic?: FillRateStatistic | null;
  windowMinutes?: number | null;
  sourceDate?: string | null;
}

export interface FillRateProvenanceDescriptor {
  badgeLabel: string;
  shortLabel: string;
  detailLabel: string;
  statisticLabel: string | null;
}

export function formatFillRateStatisticLabel(
  statistic?: FillRateStatistic | null,
  windowMinutes?: number | null,
): string | null {
  if (!statistic) return null;

  const statisticLabel = statistic === 'P95_5MIN_AVG'
    ? 'P95'
    : statistic === 'P50_5MIN_AVG'
      ? 'P50'
      : statistic;

  const window = windowMinutes != null ? `${windowMinutes}-min avg` : 'avg';
  return `${statisticLabel} ${window}`;
}

export function getFillRateProvenanceDescriptor({
  source,
  dataMode,
  statistic,
  windowMinutes,
  sourceDate,
}: FillRateProvenanceInput): FillRateProvenanceDescriptor {
  const statisticLabel = formatFillRateStatisticLabel(statistic, windowMinutes);
  const period = sourceDate ? ` · ${sourceDate}` : '';

  if (dataMode === 'historical_statistical_average') {
    return {
      badgeLabel: 'Historical',
      shortLabel: 'Historical statistical average',
      detailLabel: `${statisticLabel ?? 'Statistical average'} · Historical baseline${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'calibrated_network_load_model') {
    return {
      badgeLabel: 'Calibrated model',
      shortLabel: 'Network Load model',
      detailLabel: `${statisticLabel ?? 'Network Load'} · OneWeb-calibrated model${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'synthetic_reference_calibration') {
    return {
      badgeLabel: 'Calibrated demo',
      shortLabel: 'Visual reference calibration',
      detailLabel: `${statisticLabel ?? 'Fill-rate statistic'} · Synthetic reference calibration${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'heuristic_estimate' || source === 'heuristic') {
    return {
      badgeLabel: 'Estimated',
      shortLabel: 'Heuristic fallback',
      detailLabel: 'Heuristic fallback · global network baseline',
      statisticLabel: null,
    };
  }

  if (source === 'operational') {
    return {
      badgeLabel: 'Operational',
      shortLabel: 'Recent operational stats',
      detailLabel: `${statisticLabel ?? 'Operational statistic'} · Recent operational export${period}`,
      statisticLabel,
    };
  }

  if (source === 'reference') {
    return {
      badgeLabel: 'Reference',
      shortLabel: 'Usage reference layer',
      detailLabel: `${statisticLabel ?? 'Reference statistic'} · Usage reference layer${period}`,
      statisticLabel,
    };
  }

  return {
    badgeLabel: 'Calibrated demo',
    shortLabel: 'Visual reference calibration',
    detailLabel: `${statisticLabel ?? 'Fill-rate statistic'} · Synthetic reference calibration${period}`,
    statisticLabel,
  };
}
