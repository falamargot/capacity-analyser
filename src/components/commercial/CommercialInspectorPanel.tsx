import { memo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialRouteSegment, CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import { customerServiceStateLabel, formatMbps, formatMs, segmentStatusChipClassName } from './commercialDisplayUtils';

const segmentOrder: CommercialRouteSegment['type'][] = ['access', 'satellite', 'backhaul', 'destination', 'summary'];

const tabLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Access',
  satellite: 'Satellite',
  backhaul: 'Indicative Path',
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

type InspectorRow = { label: string; value: string };

function compactRows(rows: Array<{ label: string; value?: string | null }>): InspectorRow[] {
  return rows
    .map((row) => ({ label: row.label, value: row.value?.trim() ?? '' }))
    .filter((row) => row.value.length > 0 && row.value !== '--');
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
  const selectedStatusChipClass = segmentStatusChipClassName[segment?.status ?? 'unknown'];
  const selectedStatusLabel = segment ? customerServiceStateLabel[segment.customerStatus] : viewModel.executiveSummary.statusLabel;
  const operationalRows = [
    { label: 'Customer impact', value: segment?.story ?? viewModel.executiveSummary.expectedExperience },
    { label: 'Step output', value: segment?.summary ?? segment?.technicalSummary ?? 'Service outcome pending' },
    { label: 'Current constraint', value: selectedConstraint(segment, viewModel) },
    {
      label: 'Primary issue',
      value: segment?.isPrimaryIssue
        ? 'This step is driving the service constraint'
        : primaryIssueSegment
          ? `${primaryIssueSegment.title}: ${primaryIssueSegment.limitation ?? primaryIssueSegment.story ?? 'Primary route constraint'}`
          : 'None detected',
    },
  ];
  const technicalRows = compactRows([
    { label: 'Technical summary', value: segment?.technicalSummary ?? segment?.summary ?? '--' },
    { label: 'Technical limitation', value: segment?.technicalLimitation ?? 'None detected' },
    { label: 'Route participation', value: segment?.isRouteParticipant ? 'On active route' : 'Not on confirmed route' },
    { label: 'Step throughput', value: segment?.throughputMbps != null ? formatMbps(segment.throughputMbps) : undefined },
    { label: 'Step latency', value: segment?.latencyMs != null ? formatMs(segment.latencyMs) : undefined },
  ]);
  const journeySegments = viewModel.routeSegments.filter((item) => item.type !== 'summary');
  const selectedContextRows = (() => {
    switch (segment?.type) {
      case 'access':
        return compactRows([
          { label: 'Site', value: viewModel.siteA?.name },
          { label: 'Terminal', value: viewModel.display.terminalLabel },
          { label: 'Access weather', value: viewModel.display.weatherA },
          { label: 'LEO SNP A', value: viewModel.display.snpA },
          { label: 'Link margin', value: viewModel.display.linkMargin },
          { label: 'Regulatory state', value: viewModel.display.regulatoryState },
        ]);
      case 'satellite':
        return compactRows([
          { label: 'Satellite', value: viewModel.display.satelliteName },
          { label: 'Orbit', value: viewModel.display.satelliteOrbit },
          { label: 'Beam', value: viewModel.display.beamName },
          { label: 'Elevation', value: viewModel.display.elevation },
          { label: 'RF status', value: viewModel.display.rfStatus },
          { label: 'Satellite status', value: viewModel.display.satelliteStatus },
        ]);
      case 'backhaul':
        return compactRows([
          { label: 'Service path', value: viewModel.display.routeValue },
          { label: 'Indicative backbone distance', value: viewModel.display.backboneDistance },
          { label: 'Logical PoP', value: viewModel.display.logicalPop },
          { label: 'LEO SNP A', value: viewModel.display.snpA },
          { label: 'LEO SNP B', value: viewModel.display.snpB },
        ]);
      case 'destination':
        return compactRows([
          { label: 'Destination', value: viewModel.siteB?.name },
          { label: 'Destination type', value: viewModel.display.destinationType },
          { label: destinationWeatherLabel, value: viewModel.display.weatherB },
          { label: 'LEO SNP B', value: viewModel.display.snpB },
        ]);
      case 'summary':
      default:
        return compactRows([
          { label: 'Service path', value: viewModel.display.routeValue },
          { label: 'Availability', value: viewModel.availabilityPct != null ? `${Math.round(viewModel.availabilityPct)}%` : viewModel.display.serviceStatusLabel },
          { label: 'Path stability', value: viewModel.display.pathStability },
          { label: 'Prediction confidence', value: viewModel.display.confidenceNote ?? viewModel.display.confidence },
          { label: 'Weather availability', value: viewModel.display.availabilityContext },
          { label: 'Assumptions', value: viewModel.display.assumptionsSummary },
          { label: 'Raw service status', value: viewModel.display.rawServiceStatus },
        ]);
    }
  })();
  const comparisonRows = viewModel.comparison.options.map((option) => ({
    label: `${option.label} option`,
    value: comparisonRowValue(option),
  }));
  const availabilityRows = [
    { label: 'Service availability', value: viewModel.availabilityPct != null ? `${Math.round(viewModel.availabilityPct)}%` : viewModel.display.serviceStatusLabel },
    { label: 'Access weather', value: viewModel.display.weatherA ?? '--' },
    { label: destinationWeatherLabel, value: viewModel.display.weatherB ?? '--' },
    { label: 'Recommendation category', value: viewModel.recommendation.reasonCategory.replaceAll('_', ' ') },
    { label: 'Prediction confidence', value: viewModel.display.confidenceNote ?? viewModel.display.confidence ?? '--' },
    { label: 'Weather availability', value: viewModel.display.availabilityContext ?? '--' },
    { label: 'Assumptions', value: viewModel.display.assumptionsSummary ?? '--' },
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
    { label: 'LEO SNP A', value: viewModel.display.snpA ?? '--' },
    { label: 'LEO SNP B', value: viewModel.display.snpB ?? '--' },
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
            <h2 className="mt-1 text-lg font-semibold leading-6 text-white">{segment?.title ?? 'Service Journey'}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-400">{segment?.role ?? viewModel.scenarioName}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${selectedStatusChipClass}`}>
            {selectedStatusLabel}
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
          {segment?.type === 'summary' ? (
            <StorySection title="Journey Overview">
              <div className="divide-y divide-slate-800/60">
                {journeySegments.map((routeSegment) => (
                  <button
                    key={routeSegment.id}
                    type="button"
                    onClick={() => onSelectedSegmentChange(routeSegment.id)}
                    className="grid w-full gap-2 px-3 py-3 text-left transition-colors hover:bg-slate-800/55"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold leading-5 text-white">{routeSegment.title}</div>
                        <div className="mt-0.5 text-xs leading-4 text-slate-400">{routeSegment.role}</div>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${segmentStatusChipClassName[routeSegment.status]}`}>
                        {customerServiceStateLabel[routeSegment.customerStatus]}
                      </span>
                    </div>
                    <div className="text-xs leading-4 text-slate-300">{routeSegment.limitation ?? routeSegment.story ?? 'No constraint detected'}</div>
                  </button>
                ))}
              </div>
            </StorySection>
          ) : (
            <StorySection title="Selected Journey Step">
              {operationalRows.map((row) => (
                <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </StorySection>
          )}

          {selectedContextRows.length > 0 && (
            <StorySection title="Step Context">
              {selectedContextRows.map((row) => (
                <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </StorySection>
          )}

          {segment?.type !== 'summary' && (
            <StorySection title="Technical Evidence">
              {technicalRows.map((row) => (
                <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
              ))}
            </StorySection>
          )}

          <DetailSection title="LEO vs GEO Comparison">
            {comparisonRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </DetailSection>

          <DetailSection title="Decision Inputs">
            {availabilityRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
            {limitingRows.map((row) => (
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

    </aside>
  );
}

export default memo(CommercialInspectorPanel);
