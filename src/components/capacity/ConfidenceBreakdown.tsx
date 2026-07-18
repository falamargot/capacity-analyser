import type { PredictionConfidence, PredictionConfidenceFactor } from '../../utils/predictionConfidence';

interface ConfidenceBreakdownProps {
  confidence: PredictionConfidence;
}

const statusColor: Record<PredictionConfidenceFactor['status'], string> = {
  positive: '#2dd4bf',
  partial: '#fbbf24',
  missing: '#475569',
  risk: '#fb7185',
};

const statusLabel: Record<PredictionConfidenceFactor['status'], string> = {
  positive: 'Earned',
  partial: 'Partial',
  missing: 'Missing',
  risk: 'At risk',
};

/**
 * Renders the factor-by-factor evidence that produced a PredictionConfidence
 * score, plus any applied cap. Pure rendering of an already-computed
 * scoring object — no new scoring logic here.
 */
const MISSING_FACTOR_WIDTH = 6;

const ConfidenceBreakdown = ({ confidence }: ConfidenceBreakdownProps) => {
  const appliedCap = confidence.caps[0];
  const widths = confidence.factors.map((factor) => (factor.contribution > 0 ? factor.contribution : MISSING_FACTOR_WIDTH));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) || 1;

  return (
    <div className="mt-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full border border-slate-300 bg-slate-200 dark:border-slate-800 dark:bg-slate-900">
        {confidence.factors.map((factor, index) => (
          <div
            key={factor.id}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{
              width: `${(widths[index] / totalWidth) * 100}%`,
              backgroundColor: statusColor[factor.status],
              opacity: factor.status === 'missing' ? 0.5 : 1,
            }}
            title={`${factor.label}: ${statusLabel[factor.status]} (+${factor.contribution}) — ${factor.reason}`}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {confidence.factors.map((factor) => (
          <div key={factor.id} className="flex items-center gap-1 text-[9px] leading-snug text-slate-500 dark:text-slate-500">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: statusColor[factor.status], opacity: factor.status === 'missing' ? 0.5 : 1 }} />
            <span className="font-semibold text-slate-600 dark:text-slate-400">{factor.label}</span>
            <span>+{factor.contribution}</span>
          </div>
        ))}
      </div>
      {appliedCap && (
        <div className="mt-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[9px] leading-snug text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-300">
          Capped at {appliedCap.maxScore}/100 — {appliedCap.reason}
        </div>
      )}
    </div>
  );
};

export default ConfidenceBreakdown;
