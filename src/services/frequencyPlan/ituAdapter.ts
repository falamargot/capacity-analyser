import type { FrequencyPlanSourceAdapter, PublicTransponder } from '../../types/frequencyPlan';

interface ItuLikeInput {
  source: 'ITU';
  filings?: unknown[];
}

export const ituAdapter: FrequencyPlanSourceAdapter<ItuLikeInput> = {
  sourceName: 'ITU',
  canHandle(input: unknown): input is ItuLikeInput {
    return !!input && typeof input === 'object' && (input as { source?: unknown }).source === 'ITU';
  },
  parse(): PublicTransponder[] {
    return [];
  },
};

