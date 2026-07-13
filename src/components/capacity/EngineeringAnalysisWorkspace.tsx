import type { ReactNode } from 'react';
import type { EngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';
import LinkBudgetWorkspaceFrame, {
  type LinkBudgetWorkspaceClosureStep,
  type LinkBudgetWorkspaceResult,
  type LinkBudgetWorkspaceWhy,
} from './LinkBudgetWorkspaceFrame';

interface EngineeringAnalysisWorkspaceProps {
  open: boolean;
  onClose: () => void;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  viewModel: EngineeringAnalysisViewModel;
  children: ReactNode;
}

const statusLabel = (state: EngineeringAnalysisViewModel['truth']['state']) => {
  if (state === 'available') return 'Available';
  if (state === 'constrained') return 'Available · constrained';
  if (state === 'degraded') return 'Degraded';
  if (state === 'blocked') return 'Blocked';
  if (state === 'incomplete') return 'Incomplete';
  if (state === 'path-unavailable') return 'Path unavailable';
  if (state === 'budget-unavailable') return 'Budget unavailable';
  return 'Uncertain';
};

const statusTone = (tone: EngineeringAnalysisViewModel['truth']['tone']): NonNullable<LinkBudgetWorkspaceResult['statusTone']> => {
  if (tone === 'good') return 'good';
  if (tone === 'warn') return 'warn';
  if (tone === 'danger') return 'danger';
  return 'neutral';
};

const confidenceLabel = (confidence: EngineeringAnalysisViewModel['truth']['confidence']) => {
  if (!confidence) return undefined;
  if (confidence.display) return confidence.display;
  if (confidence.label && confidence.score != null) return `${confidence.label} ${confidence.score}/100`;
  return confidence.label;
};

const toClosureStep = (step: EngineeringAnalysisViewModel['closure']['steps'][number]): LinkBudgetWorkspaceClosureStep => ({
  label: step.label,
  value: step.value,
  detail: step.detail,
  input: step.input,
  transformation: step.transformation,
  output: step.output,
  loss: step.loss,
  tone: step.tone,
  inputMbps: step.inputMbps,
  outputMbps: step.outputMbps,
});

const EngineeringAnalysisWorkspace = ({
  open,
  onClose,
  expanded,
  onExpandedChange,
  viewModel,
  children,
}: EngineeringAnalysisWorkspaceProps) => {
  const throughputMetric = viewModel.truth.primaryMetrics.find((metric) => /throughput/i.test(metric.label));
  const latencyMetric = viewModel.truth.primaryMetrics.find((metric) => /latency|rtt/i.test(metric.label));
  const availabilityMetric = viewModel.truth.primaryMetrics.find((metric) => /availability/i.test(metric.label));
  const marginMetric = viewModel.truth.diagnosticMetrics.find((metric) => /margin/i.test(metric.label));
  const result: LinkBudgetWorkspaceResult = {
    status: statusLabel(viewModel.truth.state),
    statusTone: statusTone(viewModel.truth.tone),
    throughput: throughputMetric?.display ?? '--',
    throughputLabel: throughputMetric?.label,
    latency: latencyMetric?.display,
    latencyLabel: latencyMetric?.label,
    availability: availabilityMetric?.display,
    confidence: confidenceLabel(viewModel.truth.confidence),
    confidenceDetail: viewModel.truth.confidence?.detail,
    bottleneck: viewModel.truth.decisiveFactor ?? '--',
    margin: marginMetric?.display,
    supportingMetrics: viewModel.truth.diagnosticMetrics.map((metric) => ({
      label: metric.label,
      value: metric.display,
      detail: metric.detail,
      tone: metric.provenance === 'rf-potential' ? 'warn' : 'default',
    })),
    confidenceBreakdown: viewModel.resultSummary.confidenceBreakdown,
  };
  const why: LinkBudgetWorkspaceWhy = {
    headline: viewModel.truth.headline,
    detail: viewModel.truth.summary,
    tone: viewModel.truth.tone === 'good' ? 'good' : viewModel.truth.tone === 'warn' ? 'warn' : viewModel.truth.tone === 'danger' ? 'danger' : 'default',
  };
  const details = viewModel.details[0];

  return (
    <LinkBudgetWorkspaceFrame
      key={viewModel.mode}
      open={open}
      onClose={onClose}
      expanded={expanded}
      onExpandedChange={onExpandedChange}
      ariaLabel={`${viewModel.mode} engineering analysis`}
      eyebrow={`${viewModel.mode} Link Budget`}
      title={viewModel.title}
      subtitle={viewModel.subtitle}
      accent={viewModel.mode === 'LEO' ? 'pink' : 'blue'}
      summaryItems={viewModel.truth.diagnosticMetrics.map((metric) => ({
        label: metric.label,
        value: metric.display,
        detail: metric.detail,
        tone: metric.provenance === 'rf-potential' ? 'warn' : 'default',
      }))}
      result={result}
      why={why}
      closureTitle={viewModel.closure.title}
      closureLayout={viewModel.closure.layout}
      closureSteps={viewModel.closure.steps.map(toClosureStep)}
      investigationTitle={details?.title ?? 'Detailed investigation'}
      investigationSummary={details?.summary ?? 'Detailed engineering investigation remains available here.'}
    >
      {children}
    </LinkBudgetWorkspaceFrame>
  );
};

export default EngineeringAnalysisWorkspace;
