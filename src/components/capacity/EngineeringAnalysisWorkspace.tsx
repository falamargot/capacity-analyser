import type { ReactNode } from 'react';
import type { EngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';
import { fmtDb, fmtMbps, fmtMs, fmtPct } from '../../utils/engineeringFormat';
import LinkBudgetWorkspaceFrame, {
  type LinkBudgetWorkspaceClosureStep,
  type LinkBudgetWorkspaceMetric,
  type LinkBudgetWorkspaceResult,
  type LinkBudgetWorkspaceWhy,
} from './LinkBudgetWorkspaceFrame';

interface EngineeringAnalysisWorkspaceProps {
  open: boolean;
  onClose: () => void;
  viewModel: EngineeringAnalysisViewModel;
  children: ReactNode;
}

const statusLabel = (status: EngineeringAnalysisViewModel['status']) => {
  if (status === 'available') return 'Available';
  if (status === 'marginal') return 'Marginal';
  if (status === 'blocked') return 'Blocked';
  return 'No budget';
};

const statusTone = (status: EngineeringAnalysisViewModel['status']): NonNullable<LinkBudgetWorkspaceResult['statusTone']> => {
  if (status === 'available') return 'good';
  if (status === 'marginal') return 'warn';
  if (status === 'blocked') return 'danger';
  return 'neutral';
};

const confidenceLabel = (confidence: EngineeringAnalysisViewModel['resultSummary']['confidence']) => {
  if (!confidence) return undefined;
  if (confidence.display) return confidence.display;
  if (confidence.label && confidence.score != null) return `${confidence.label} ${confidence.score}/100`;
  return confidence.label;
};

const toMetric = (metric: EngineeringAnalysisViewModel['quickReferences'][number]): LinkBudgetWorkspaceMetric => ({
  label: metric.label,
  value: metric.value,
  detail: metric.detail,
  tone: metric.tone,
});

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
  viewModel,
  children,
}: EngineeringAnalysisWorkspaceProps) => {
  const result: LinkBudgetWorkspaceResult = {
    status: statusLabel(viewModel.status),
    statusTone: statusTone(viewModel.status),
    throughput: fmtMbps(viewModel.resultSummary.throughputMbps),
    throughputLabel: viewModel.resultSummary.throughputLabel,
    latency: fmtMs(viewModel.resultSummary.latencyMs),
    latencyLabel: viewModel.resultSummary.latencyLabel,
    availability: viewModel.resultSummary.availabilityLabel ?? fmtPct(viewModel.resultSummary.availabilityPct),
    confidence: confidenceLabel(viewModel.resultSummary.confidence),
    confidenceDetail: viewModel.resultSummary.confidence?.detail,
    bottleneck: viewModel.resultSummary.bottleneck ?? '--',
    margin: viewModel.resultSummary.marginLabel ??
      (typeof viewModel.resultSummary.marginDb === 'number' && Number.isFinite(viewModel.resultSummary.marginDb)
        ? fmtDb(viewModel.resultSummary.marginDb)
        : undefined),
    supportingMetrics: viewModel.resultSummary.supportingMetrics?.map(toMetric),
    confidenceBreakdown: viewModel.resultSummary.confidenceBreakdown,
  };
  const why: LinkBudgetWorkspaceWhy = {
    headline: viewModel.why.headline,
    detail: viewModel.why.explanation,
    tone: viewModel.why.tone,
  };
  const details = viewModel.details[0];

  return (
    <LinkBudgetWorkspaceFrame
      key={viewModel.mode}
      open={open}
      onClose={onClose}
      ariaLabel={`${viewModel.mode} engineering analysis`}
      eyebrow={`${viewModel.mode} Link Budget`}
      title={viewModel.title}
      subtitle={viewModel.subtitle}
      accent={viewModel.mode === 'LEO' ? 'pink' : 'blue'}
      summaryItems={viewModel.quickReferences.map(toMetric)}
      result={result}
      why={why}
      closureTitle={viewModel.closure.title}
      closureSteps={viewModel.closure.steps.map(toClosureStep)}
      investigationTitle={details?.title ?? 'Detailed investigation'}
      investigationSummary={details?.summary ?? 'Detailed engineering investigation remains available here.'}
    >
      {children}
    </LinkBudgetWorkspaceFrame>
  );
};

export default EngineeringAnalysisWorkspace;
