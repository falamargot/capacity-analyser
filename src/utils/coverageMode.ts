import type { CoveragePolicy } from './leoFootprint';

export type CoverageMode = 'MAX_COVERAGE' | 'BALANCED' | 'HIGH_QUALITY';
export type CoverageModeSelection = CoverageMode | 'CUSTOM';

export const DEFAULT_COVERAGE_MODE: CoverageMode = 'BALANCED';

export const COVERAGE_MODE_THRESHOLDS_DB: Record<CoverageMode, number> = {
  MAX_COVERAGE: -12,
  BALANCED: -10,
  HIGH_QUALITY: -6,
};

const COVERAGE_MODE_LABELS: Record<CoverageModeSelection, string> = {
  MAX_COVERAGE: 'Max Coverage',
  BALANCED: 'Balanced',
  HIGH_QUALITY: 'High Quality',
  CUSTOM: 'Custom RF eligibility',
};

const COVERAGE_MODE_DESCRIPTIONS: Record<CoverageModeSelection, string> = {
  MAX_COVERAGE: 'Broader usable area, lower signal margin.',
  BALANCED: 'Recommended operational compromise.',
  HIGH_QUALITY: 'Stricter RF quality, more conservative coverage.',
  CUSTOM: 'Expert-defined service eligibility cutoff.',
};

export function coverageModeToThreshold(mode: CoverageMode): number {
  return COVERAGE_MODE_THRESHOLDS_DB[mode];
}

export function coverageModeToPolicy(mode: CoverageMode): CoveragePolicy {
  return { type: 'DB_THRESHOLD', thresholdDb: coverageModeToThreshold(mode) };
}

export function getCoverageModeLabel(mode: CoverageModeSelection): string {
  return COVERAGE_MODE_LABELS[mode];
}

export function getCoverageModeDescription(mode: CoverageModeSelection): string {
  return COVERAGE_MODE_DESCRIPTIONS[mode];
}

export function getCoverageModeFromThreshold(thresholdDb: number): CoverageModeSelection {
  const preset = (Object.keys(COVERAGE_MODE_THRESHOLDS_DB) as CoverageMode[])
    .find((mode) => COVERAGE_MODE_THRESHOLDS_DB[mode] === thresholdDb);
  return preset ?? 'CUSTOM';
}

export function getCoverageModeFromPolicy(policy: CoveragePolicy): CoverageModeSelection {
  if (policy.type !== 'DB_THRESHOLD') return 'CUSTOM';
  return getCoverageModeFromThreshold(policy.thresholdDb);
}
