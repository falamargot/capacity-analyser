import { describe, expect, it } from 'vitest';
import {
  coverageModeToPolicy,
  coverageModeToThreshold,
  DEFAULT_COVERAGE_MODE,
  getCoverageModeFromPolicy,
  getCoverageModeLabel,
} from '../coverageMode';

describe('LEO coverage modes', () => {
  it('defaults to Balanced while preserving the previous standard threshold', () => {
    expect(DEFAULT_COVERAGE_MODE).toBe('BALANCED');
    expect(coverageModeToThreshold(DEFAULT_COVERAGE_MODE)).toBe(-10);
  });

  it('maps standard coverage intents to RF eligibility policies', () => {
    expect(coverageModeToPolicy('MAX_COVERAGE')).toEqual({ type: 'DB_THRESHOLD', thresholdDb: -12 });
    expect(coverageModeToPolicy('BALANCED')).toEqual({ type: 'DB_THRESHOLD', thresholdDb: -10 });
    expect(coverageModeToPolicy('HIGH_QUALITY')).toEqual({ type: 'DB_THRESHOLD', thresholdDb: -6 });
  });

  it('detects custom expert thresholds without losing the preset labels', () => {
    expect(getCoverageModeFromPolicy({ type: 'DB_THRESHOLD', thresholdDb: -9 })).toBe('CUSTOM');
    expect(getCoverageModeLabel('CUSTOM')).toBe('Custom RF eligibility');
  });
});
