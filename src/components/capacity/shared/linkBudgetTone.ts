import type { LeoThroughputResult } from '../../../types/leoThroughput';

/**
 * Shared color vocabulary for link-budget health badges. GEO and LEO derive
 * this from different domain signals (margin dB vs bottleneck factor) — only
 * the resulting tone/color mapping is unified, not the input.
 */
export type LinkBudgetTone = 'good' | 'warn' | 'danger' | 'neutral';

export interface LinkBudgetToneStyle {
  tone: LinkBudgetTone;
  label: string;
  className: string;
  accent: string;
}

const TONE_STYLES: Record<LinkBudgetTone, { className: string; accent: string }> = {
  neutral: {
    className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    accent: '#64748b',
  },
  danger: {
    className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
    accent: '#dc2626',
  },
  warn: {
    className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
    accent: '#d97706',
  },
  good: {
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    accent: '#059669',
  },
};

const buildToneStyle = (tone: LinkBudgetTone, label: string): LinkBudgetToneStyle => ({
  tone,
  label,
  ...TONE_STYLES[tone],
});

/** GEO link budget tone — derived from end-to-end RF link margin (dB). */
export function geoMarginToTone(margin: number | undefined | null): LinkBudgetToneStyle {
  if (typeof margin !== 'number' || !Number.isFinite(margin)) return buildToneStyle('neutral', 'No budget');
  if (margin < 0) return buildToneStyle('danger', 'Blocked');
  if (margin < 2) return buildToneStyle('warn', 'Marginal');
  return buildToneStyle('good', 'Healthy');
}

/** LEO link budget tone — derived from final user throughput, C/N floor and bottleneck factor. */
export function leoBottleneckToTone(debugInfo: LeoThroughputResult | null): LinkBudgetToneStyle {
  if (!debugInfo) return buildToneStyle('neutral', 'No budget');

  if (
    debugInfo.downlink.network.finalUserMbps <= 0 ||
    debugInfo.uplink.network.finalUserMbps <= 0 ||
    Math.min(debugInfo.downlink.rf.cnDb, debugInfo.uplink.rf.cnDb) < 10
  ) {
    return buildToneStyle('danger', 'Blocked');
  }

  const limitingFactor = debugInfo.mainBottleneck.factor;
  const hasLimitingFactor = limitingFactor != null
    && limitingFactor !== 'regulatory'
    && limitingFactor !== 'service gate';
  if (hasLimitingFactor) return buildToneStyle('warn', 'Limited');

  return buildToneStyle('good', 'Healthy');
}
