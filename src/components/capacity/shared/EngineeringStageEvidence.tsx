import { ChevronDown } from 'lucide-react';
import EngineeringClosurePipeline from '../EngineeringClosurePipeline';
import type { EngineeringAnalysisViewModel } from '../../../utils/engineeringAnalysisViewModel';
import { fmtDb, fmtMbps } from '../../../utils/engineeringFormat';
import type { ReactNode } from 'react';

export interface EngineeringScenarioFact {
  label: string;
  value: string;
  detail?: string;
}

export const EngineeringEvidenceSummary = ({
  facts,
  ariaLabel,
  variant = 'default',
}: {
  facts: EngineeringScenarioFact[];
  ariaLabel: string;
  variant?: 'default' | 'scenario' | 'path';
}) => (
  <dl data-engineering-evidence-summary="" data-engineering-evidence-variant={variant} className="grid gap-2 sm:grid-cols-2" aria-label={ariaLabel}>
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
  <section className="engineering-scenario-overview" aria-labelledby="engineering-scenario-overview-title">
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h4 id="engineering-scenario-overview-title" className="text-[12px] font-bold text-slate-900 dark:text-slate-100">Selected engineering context</h4>
        <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">Topology, assets and environmental assumptions applied to this analysis.</p>
      </div>
      <span className="hidden shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 sm:inline">Scenario inputs</span>
    </div>
    <EngineeringEvidenceSummary facts={facts} ariaLabel="Scenario assumptions" variant="scenario" />
  </section>
);

export const EngineeringRfDecisionEvidence = ({ viewModel }: { viewModel: EngineeringAnalysisViewModel }) => {
  const result = viewModel.resultSummary;
  const rfStage = viewModel.truth.causeChain.find((stage) => stage.id === 'rf');
  const facts = [
    result.bottleneck ? { label: 'Limiting factor', value: result.bottleneck } : null,
    result.marginLabel || result.marginDb != null
      ? { label: 'Decisive margin', value: result.marginLabel ?? fmtDb(result.marginDb) }
      : null,
    result.throughputMbps != null
      ? { label: result.throughputLabel ?? 'RF potential', value: fmtMbps(result.throughputMbps) }
      : null,
  ].filter((fact): fact is EngineeringScenarioFact => fact != null);

  if (facts.length === 0) return null;
  return (
    <section className="engineering-rf-decision" aria-label="Link budget decision evidence">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h4 className="text-[12px] font-bold text-slate-900 dark:text-slate-100">Decisive RF evidence</h4>
          <p className="mt-1 text-[10px] leading-4 text-slate-600 dark:text-slate-400">
            {rfStage?.detail ?? viewModel.why.explanation}
          </p>
        </div>
        <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Before detail</span>
      </div>
      <dl className="engineering-rf-decision__metrics">
        {facts.map((fact, index) => (
          <div key={fact.label} className={index === 0 ? 'engineering-rf-decision__metric engineering-rf-decision__metric--primary' : 'engineering-rf-decision__metric'}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export const EngineeringDeliveryEvidence = ({
  viewModel,
  children,
}: {
  viewModel: EngineeringAnalysisViewModel;
  children?: ReactNode;
}) => (
  <div className="engineering-delivery-workspace">
    <section className="engineering-delivery-transformation" aria-label={viewModel.closure.title}>
      <div className="mb-4">
        <h4 className="text-[12px] font-bold text-slate-900 dark:text-slate-100">Throughput transformation</h4>
        <p className="mt-1 text-[10px] leading-4 text-slate-600 dark:text-slate-400">How RF potential becomes the final delivered service.</p>
      </div>
      <EngineeringClosurePipeline
        layout={viewModel.closure.layout}
        steps={viewModel.closure.steps}
        blocked={viewModel.truth.state === 'blocked'}
      />
    </section>
    {children && (
      <details className="group engineering-delivery-supporting" data-engineering-secondary-investigation="">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-slate-300 [&::-webkit-details-marker]:hidden">
          <span>Latency composition &amp; supporting evidence</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-slate-200/80 py-4 dark:border-slate-700/80">{children}</div>
      </details>
    )}
  </div>
);
