import { memo, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CommercialRouteSegment, CommercialScenarioViewModel } from './commercialViewModel';
import { customerServiceStateLabel, formatMbps, formatMs, segmentStatusChipClassName } from './commercialDisplayUtils';

const segmentOrder: CommercialRouteSegment['type'][] = ['access', 'satellite', 'backhaul', 'destination', 'summary'];

const tabLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Access',
  satellite: 'Satellite',
  backhaul: 'Backbone',
  destination: 'Site B',
  summary: 'Summary',
};

interface CommercialInspectorPanelProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  onSelectedSegmentChange: (segment: string) => void;
  onViewFullAnalysis: () => void;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-t border-slate-800 px-3 py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-xs font-medium text-slate-400">{label}</div>
      </div>
      <div className="text-sm font-semibold leading-5 text-white">{value}</div>
    </div>
  );
}

function StorySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="border-b border-slate-800 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-sky-300">
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
    <details className="rounded-lg border border-slate-800 bg-slate-900/45">
      <summary className="cursor-pointer px-3 py-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </summary>
      <div className="border-t border-slate-800">{children}</div>
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

function selectedConstraint(segment: CommercialRouteSegment | undefined, viewModel: CommercialScenarioViewModel): string {
  if (segment?.limitation) return segment.limitation;
  if (viewModel.serviceStatus !== 'active' && viewModel.primaryWarning) return viewModel.primaryWarning;
  return 'None detected';
}

function CommercialInspectorPanel({
  viewModel,
  selectedSegmentId,
  onSelectedSegmentChange,
  onViewFullAnalysis,
}: CommercialInspectorPanelProps) {
  const segment = viewModel.routeSegments.find((item) => item.id === selectedSegmentId)
    ?? viewModel.routeSegments.find((item) => item.type === 'summary')
    ?? viewModel.routeSegments[0];
  const selectedSegment = segment?.id ?? 'summary';
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
  const availabilityRows = [
    { label: 'Service availability', value: viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(2)}%` : viewModel.display.serviceStatusLabel },
    { label: 'Access weather', value: viewModel.display.weatherA ?? '--' },
    { label: 'Destination weather', value: viewModel.display.weatherB ?? '--' },
    { label: 'Recommendation category', value: viewModel.recommendation.reasonCategory.replaceAll('_', ' ') },
  ];
  const limitingRows = [
    { label: 'Segment constraint', value: segment?.limitation ?? 'None detected' },
    { label: 'Main constraint', value: viewModel.primaryWarning ?? 'None detected' },
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
    <aside className="flex h-full w-full flex-col overflow-hidden border-l border-slate-700 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
              Commercial Inspector
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">{viewModel.executiveSummary.recommendedTechnology}</h2>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-400">{viewModel.executiveSummary.expectedExperience}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${overallStatusChipClass}`}>
            {viewModel.executiveSummary.statusLabel}
          </span>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-800 px-3 py-2">
        {segmentOrder.map((type) => {
          const tabSegment = viewModel.routeSegments.find((item) => item.type === type);
          return (
          <button
            key={type}
            type="button"
            onClick={() => tabSegment && onSelectedSegmentChange(tabSegment.id)}
            disabled={!tabSegment}
            className={[
              'shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
              selectedSegment === tabSegment?.id
                ? 'bg-white text-slate-950'
                : 'text-slate-300 hover:bg-slate-800',
            ].join(' ')}
          >
            {tabLabel[type]}
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
            <div className="grid grid-cols-3 divide-x divide-slate-800">
              {performanceRows.slice(0, 3).map((row) => (
                <div key={`${row.label}-${row.value}`} className="min-w-0 px-3 py-2">
                  <div className="truncate text-sm font-semibold text-white" title={row.value}>{row.value}</div>
                  <div className="mt-0.5 truncate text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500" title={row.label}>{row.label.replace('Expected ', '')}</div>
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

      <div className="border-t border-slate-800 p-4">
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
