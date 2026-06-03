import { memo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialRouteSegment, CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import { customerServiceStateLabel, formatMbps, formatMs, segmentStatusChipClassName } from './commercialDisplayUtils';

const segmentOrder: CommercialRouteSegment['type'][] = ['access', 'satellite', 'backhaul', 'destination', 'summary'];

const tabLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Access',
  satellite: 'Satellite',
  backhaul: 'Backbone',
  destination: 'Destination',
  summary: 'Summary',
};

interface CommercialInspectorPanelProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  commercialRouteModel?: CommercialRouteModel;
  onSelectedSegmentChange: (segment: string) => void;
  onViewFullAnalysis: () => void;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-slate-800/60 px-3 py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-400">{label}</div>
      </div>
      <div className="break-words text-sm font-semibold leading-5 text-white">{value}</div>
    </div>
  );
}

function StorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800/70 bg-slate-900/55">
      <div className="border-b border-slate-800/60 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-sky-300">
        {title}
      </div>
      {children}
    </section>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="rounded-lg border border-slate-800/55 bg-slate-900/35">
      <summary className="cursor-pointer px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </summary>
      <div className="border-t border-slate-800/60">{children}</div>
    </details>
  );
}

function alternativeLabel(viewModel: CommercialScenarioViewModel): string {
  const recommended = viewModel.recommendation.technology;
  if (recommended === 'hybrid') return 'Both GEO and LEO are suitable';
  if (recommended === 'not_available') return 'No active alternative';
  if (recommended === 'insufficient_data') return 'Waiting for comparable options';
  const alternative = viewModel.comparison.options.find((option) => option.technology !== recommended);
  if (!alternative) return 'Alternative pending';
  return `${alternative.label} ${alternative.available ? 'available' : alternative.statusLabel.toLowerCase()}`;
}

function primaryWhy(viewModel: CommercialScenarioViewModel): string {
  return viewModel.executiveSummary.reason || viewModel.recommendation.reason;
}

function comparisonRowValue(option: CommercialTechnologyOption): string {
  const strength = option.strengths[0] ?? option.limitingFactor ?? option.statusLabel;
  return `${option.statusLabel} - ${formatMs(option.rttMs)} RTT, ${formatMbps(option.downloadMbps)} down, ${formatMbps(option.uploadMbps)} up - ${strength}`;
}

function selectedConstraint(segment: CommercialRouteSegment | undefined, viewModel: CommercialScenarioViewModel): string {
  if (segment?.limitation) return segment.limitation;
  if (viewModel.serviceStatus !== 'active' && viewModel.primaryWarning) return viewModel.primaryWarning;
  return 'None detected';
}

function canonicalSegmentId(type: CommercialRouteSegment['type']): CommercialRouteSegmentId {
  switch (type) {
    case 'access':
      return 'access';
    case 'satellite':
      return 'satellite';
    case 'backhaul':
      return 'backhaul';
    case 'destination':
      return 'destination';
    case 'summary':
      return 'summary';
  }
}

function canonicalSegmentIdFromRaw(value: string | undefined | null): CommercialRouteSegmentId | undefined {
  switch (value) {
    case 'access':
      return 'access';
    case 'satellite':
      return 'satellite';
    case 'backhaul':
      return 'backhaul';
    case 'destination':
    case 'siteB':
      return 'destination';
    case 'summary':
      return 'summary';
    default:
      return undefined;
  }
}

function segmentForCanonicalId(
  segments: CommercialRouteSegment[],
  segmentId: CommercialRouteSegmentId | undefined,
): CommercialRouteSegment | undefined {
  if (!segmentId) return undefined;
  return segments.find((item) => canonicalSegmentId(item.type) === segmentId);
}

function destinationTabLabel(commercialRouteModel: CommercialRouteModel | undefined): string {
  return commercialRouteModel?.destinationIsPortal ? 'Portal' : tabLabel.destination;
}

function CommercialInspectorPanel({
  viewModel,
  selectedSegmentId,
  commercialRouteModel,
  onSelectedSegmentChange,
  onViewFullAnalysis,
}: CommercialInspectorPanelProps) {
  const focusedSegmentId = commercialRouteModel?.focusedSegmentId
    ?? canonicalSegmentIdFromRaw(selectedSegmentId);
  const primaryFailingSegmentId = commercialRouteModel?.primaryFailingSegmentId
    ?? canonicalSegmentIdFromRaw(viewModel.primaryFailingSegmentId);
  const primaryIssueSegment = segmentForCanonicalId(viewModel.routeSegments, primaryFailingSegmentId)
    ?? viewModel.routeSegments.find((item) => item.isPrimaryIssue);
  const destinationWeatherLabel = commercialRouteModel?.destinationIsPortal ? 'Portal weather' : 'Destination weather';

  const segment = segmentForCanonicalId(viewModel.routeSegments, focusedSegmentId)
    ?? viewModel.routeSegments.find((item) => item.id === selectedSegmentId)
    ?? viewModel.routeSegments.find((item) => item.type === 'summary')
    ?? viewModel.routeSegments[0];
  const selectedSegment = segment ? canonicalSegmentId(segment.type) : 'summary';
  const overallStatusChipClass = segmentStatusChipClassName[
    viewModel.serviceStatus === 'active' ? 'healthy' :
    viewModel.serviceStatus === 'degraded' ? 'warning' :
    viewModel.serviceStatus === 'blocked' ? 'blocked' : 'unknown'
  ];
  const summaryRows = [
    { label: 'Recommendation', value: viewModel.executiveSummary.recommendedTechnology },
    { label: 'Why', value: primaryWhy(viewModel) },
    { label: 'Alternative', value: alternativeLabel(viewModel) },
  ];
  const segmentRows = [
    { label: 'Service step', value: segment?.story ?? 'Customer service scenario' },
    { label: 'Status', value: segment ? customerServiceStateLabel[segment.customerStatus] : viewModel.executiveSummary.statusLabel },
    { label: 'Current constraint', value: segment?.limitation ?? 'None detected' },
    { label: 'Expected experience', value: viewModel.executiveSummary.expectedExperience },
  ];
  const performanceRows = [
    { label: 'Expected downlink', value: formatMbps(segment?.throughputMbps ?? viewModel.downloadMbps) },
    { label: 'Expected uplink', value: formatMbps(viewModel.uploadMbps) },
    { label: 'Customer RTT', value: formatMs(segment?.latencyMs ?? viewModel.rttMs) },
    { label: 'Service technology', value: viewModel.technology.toUpperCase() },
  ];
  const comparisonRows = viewModel.comparison.options.map((option) => ({
    label: `${option.label} option`,
    value: comparisonRowValue(option),
  }));
  const availabilityRows = [
    { label: 'Service availability', value: viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(2)}%` : viewModel.display.serviceStatusLabel },
    { label: 'Access weather', value: viewModel.display.weatherA ?? '--' },
    { label: destinationWeatherLabel, value: viewModel.display.weatherB ?? '--' },
    { label: 'Recommendation category', value: viewModel.recommendation.reasonCategory.replaceAll('_', ' ') },
  ];
  const limitingRows = [
    { label: 'Segment constraint', value: segment?.limitation ?? 'None detected' },
    { label: 'Main constraint', value: primaryIssueSegment?.limitation ?? viewModel.primaryWarning ?? 'None detected' },
  ];
  const proofRows = [
    { label: 'Raw service status', value: viewModel.display.rawServiceStatus ?? '--' },
    { label: 'Service path', value: viewModel.display.routeValue ?? '--' },
    { label: 'Satellite', value: viewModel.display.satelliteName ?? '--' },
    { label: 'Beam', value: viewModel.display.beamName ?? '--' },
    { label: 'Orbit', value: viewModel.display.satelliteOrbit ?? viewModel.technology.toUpperCase() },
    { label: 'Elevation', value: viewModel.display.elevation ?? '--' },
    { label: 'Link margin', value: viewModel.display.linkMargin ?? '--' },
    { label: 'RF status', value: viewModel.display.rfStatus ?? '--' },
    { label: 'Bottleneck', value: viewModel.display.rawBottleneck ?? '--' },
    { label: 'Regulatory state', value: viewModel.display.regulatoryState ?? '--' },
    { label: 'SNP A', value: viewModel.display.snpA ?? '--' },
    { label: 'SNP B', value: viewModel.display.snpB ?? '--' },
    { label: 'Route summary', value: viewModel.display.routeSummary ?? '--' },
  ];

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-l border-slate-700/80 bg-slate-950">
      <div className="border-b border-slate-800/70 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Commercial Inspector
            </div>
            <h2 className="mt-1 text-lg font-semibold leading-6 text-white">{viewModel.executiveSummary.recommendedTechnology}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">{viewModel.recommendation.reason}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${overallStatusChipClass}`}>
            {viewModel.executiveSummary.statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-800/70 px-3 py-2">
        {segmentOrder.map((type) => {
          const tabSegment = viewModel.routeSegments.find((item) => item.type === type);
          return (
          <button
            key={type}
            type="button"
            onClick={() => tabSegment && onSelectedSegmentChange(tabSegment.id)}
            disabled={!tabSegment}
            className={[
              'min-w-[4.25rem] rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
              selectedSegment === type
                ? 'bg-white text-slate-950'
                : 'text-slate-300 hover:bg-slate-800',
            ].join(' ')}
          >
            {type === 'destination' ? destinationTabLabel(commercialRouteModel) : tabLabel[type]}
          </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {viewModel.emptyState && (
          <div className="mb-4 rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-100">
            {viewModel.emptyState}
          </div>
        )}

        <div className="space-y-3">
          <StorySection title="Service Summary">
            {summaryRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>

          <StorySection title="Performance">
            <div className="grid grid-cols-3 divide-x divide-slate-800/60">
              {performanceRows.slice(0, 3).map((row) => (
                <div key={`${row.label}-${row.value}`} className="min-w-0 px-3 py-2">
                  <div className="text-sm font-semibold leading-5 text-white" title={row.value}>{row.value}</div>
                  <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500" title={row.label}>{row.label.replace('Expected ', '').replace('Customer ', '')}</div>
                </div>
              ))}
            </div>
            <FieldRow label="Service technology" value={viewModel.technology.toUpperCase()} />
          </StorySection>

          <StorySection title={segment?.type === 'summary' ? 'Service Outcome' : 'Selected Journey Step'}>
            <FieldRow label="Status" value={segment ? customerServiceStateLabel[segment.customerStatus] : viewModel.executiveSummary.statusLabel} />
            <FieldRow label="What this means" value={segment?.story ?? viewModel.executiveSummary.expectedExperience} />
            <FieldRow label="Current constraint" value={selectedConstraint(segment, viewModel)} />
          </StorySection>

          <DetailSection title="Detailed Reasoning">
            {availabilityRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
            {limitingRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </DetailSection>

          <DetailSection title="LEO vs GEO Comparison">
            {comparisonRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </DetailSection>

          <DetailSection title="Journey Details">
            {segmentRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </DetailSection>

          <DetailSection title="Technical Proof">
            {proofRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </DetailSection>
        </div>
      </div>

      <div className="border-t border-slate-800/70 p-4">
        <button
          type="button"
          onClick={onViewFullAnalysis}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
        >
          <span>View full analysis</span>
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
}

export default memo(CommercialInspectorPanel);
