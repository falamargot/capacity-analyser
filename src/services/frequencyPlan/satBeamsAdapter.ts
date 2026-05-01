import type { FrequencyPlanSourceAdapter, PublicTransponder } from '../../types/frequencyPlan';

interface SatBeamsLikeInput {
  source: 'SATBEAMS';
  rows?: unknown[];
}

export const satBeamsAdapter: FrequencyPlanSourceAdapter<SatBeamsLikeInput> = {
  sourceName: 'SATBEAMS',
  canHandle(input: unknown): input is SatBeamsLikeInput {
    return !!input && typeof input === 'object' && (input as { source?: unknown }).source === 'SATBEAMS';
  },
  parse(): PublicTransponder[] {
    return [];
  },
};

