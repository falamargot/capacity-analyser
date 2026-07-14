import { Check, CircleDashed } from 'lucide-react';
import type { EngineeringCauseStageId } from '../../utils/engineeringAnalysisViewModel';

const LABELS: Record<EngineeringCauseStageId, string> = {
  scenario: 'Scenario',
  path: 'Path',
  rf: 'RF closure',
  service: 'Service gates',
  delivery: 'Delivery',
};

export interface EngineeringRecalculationStatusProps {
  revision: number;
  status: 'updating' | 'settled';
  stages: EngineeringCauseStageId[];
  changedInputs: string[];
}

export default function EngineeringRecalculationStatus({
  revision,
  status,
  stages,
  changedInputs,
}: EngineeringRecalculationStatusProps) {
  const updating = status === 'updating';
  return (
    <div
      className={`mb-3 rounded-lg border px-3 py-2 ${updating ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30' : 'border-emerald-200 bg-emerald-50/45 dark:border-emerald-800 dark:bg-emerald-950/15'}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div className={`flex min-w-0 items-center gap-2 text-[11px] font-bold ${updating ? 'text-sky-800 dark:text-sky-200' : 'text-emerald-800 dark:text-emerald-200'}`}>
          {updating ? <CircleDashed className="h-3.5 w-3.5 shrink-0" /> : <Check className="h-3.5 w-3.5 shrink-0" />}
          {updating ? 'Recalculating affected engineering stages' : 'Result revision updated'}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-slate-500 dark:text-slate-400">Rev {revision}</span>
      </div>
      {updating && stages.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Recalculation cause chain">
          {stages.map((stage, index) => (
            <span key={stage} className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
              {index > 0 && <span className="text-slate-400" aria-hidden="true">→</span>}
              {LABELS[stage]}
            </span>
          ))}
        </div>
      )}
      <p className="mt-1 truncate text-[9px] text-slate-500 dark:text-slate-400" title={changedInputs.join(', ')}>
        {updating ? 'Triggered by' : 'Updated from'} {changedInputs.join(', ')}
      </p>
    </div>
  );
}
