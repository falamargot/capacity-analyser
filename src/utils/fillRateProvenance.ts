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

  if (statistic === 'P95_5MIN_AVG') return 'High-load planning percentile';
  if (statistic === 'P50_5MIN_AVG') return 'Typical planning percentile';

  return windowMinutes != null ? `Planning statistic (${windowMinutes} min)` : 'Planning statistic';
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
      badgeLabel: 'Simulated',
      shortLabel: 'Simulated Network Load',
      detailLabel: `${statisticLabel ?? 'Planning baseline'} · Historical planning baseline, not live telemetry${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'calibrated_network_load_model') {
    return {
      badgeLabel: 'Simulated',
      shortLabel: 'Simulated Network Load',
      detailLabel: `${statisticLabel ?? 'Network load'} · Calibrated planning model, not live telemetry${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'synthetic_reference_calibration') {
    return {
      badgeLabel: 'Simulated',
      shortLabel: 'Simulated Network Load',
      detailLabel: `${statisticLabel ?? 'Reference load'} · Synthetic planning calibration${period}`,
      statisticLabel,
    };
  }

  if (dataMode === 'heuristic_estimate' || source === 'heuristic') {
    return {
      badgeLabel: 'Heuristic',
      shortLabel: 'Simulated Network Load',
      detailLabel: 'Heuristic planning fallback · global network baseline, not telemetry',
      statisticLabel: null,
    };
  }

  if (source === 'operational') {
    return {
      badgeLabel: 'Simulated',
      shortLabel: 'Simulated Network Load',
      detailLabel: `${statisticLabel ?? 'Imported planning layer'} · Imported load reference, not live telemetry${period}`,
      statisticLabel,
    };
  }

  if (source === 'reference') {
    return {
      badgeLabel: 'Reference',
      shortLabel: 'Simulated Network Load',
      detailLabel: `${statisticLabel ?? 'Reference load'} · Planning reference layer${period}`,
      statisticLabel,
    };
  }

  return {
    badgeLabel: 'Simulated',
    shortLabel: 'Simulated Network Load',
    detailLabel: `${statisticLabel ?? 'Reference load'} · Synthetic planning calibration${period}`,
    statisticLabel,
  };
}
