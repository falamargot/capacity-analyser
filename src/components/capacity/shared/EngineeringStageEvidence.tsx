import EngineeringClosurePipeline from '../EngineeringClosurePipeline';
import type { EngineeringAnalysisViewModel } from '../../../utils/engineeringAnalysisViewModel';

export interface EngineeringScenarioFact {
  label: string;
  value: string;
  detail?: string;
}

export const EngineeringEvidenceSummary = ({
  facts,
  ariaLabel,
}: {
  facts: EngineeringScenarioFact[];
  ariaLabel: string;
}) => (
  <dl data-engineering-evidence-summary="" className="grid gap-2 sm:grid-cols-2" aria-label={ariaLabel}>
    {facts.map((fact) => (
      <div key={fact.label} className="min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-slate-700 dark:bg-slate-950/65">
        <dt className="text-[8px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{fact.label}</dt>
        <dd className="mt-1 break-words text-[12px] font-bold leading-4 text-slate-900 dark:text-slate-100">{fact.value}</dd>
        {fact.detail && <p className="mt-0.5 text-[9px] leading-4 text-slate-500 dark:text-slate-400">{fact.detail}</p>}
      </div>
    ))}
  </dl>
);

export const EngineeringScenarioEvidence = ({ facts }: { facts: EngineeringScenarioFact[] }) => (
  <EngineeringEvidenceSummary facts={facts} ariaLabel="Scenario assumptions" />
);

export const EngineeringDeliveryEvidence = ({ viewModel }: { viewModel: EngineeringAnalysisViewModel }) => (
  <section className="min-w-0 rounded-lg border border-slate-800 bg-slate-950 p-3 text-slate-100" aria-label={viewModel.closure.title}>
    <h5 className="mb-3 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{viewModel.closure.title}</h5>
    <EngineeringClosurePipeline
      layout={viewModel.closure.layout}
      steps={viewModel.closure.steps}
      blocked={viewModel.truth.state === 'blocked'}
    />
  </section>
);
