import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import type { CommercialRouteSegment, CommercialScenarioViewModel } from './commercialViewModel';

const segmentOrder: CommercialRouteSegment['type'][] = ['access', 'satellite', 'backhaul', 'destination', 'summary'];

const tabLabel: Record<CommercialRouteSegment['type'], string> = {
  access: 'Access',
  satellite: 'Satellite',
  backhaul: 'Backhaul',
  destination: 'Site B',
  summary: 'Summary',
};

const statusClassName: Record<CommercialRouteSegment['status'], string> = {
  healthy: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  warning: 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  blocked: 'border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200',
  unknown: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const statusLabel: Record<CommercialRouteSegment['status'], string> = {
  healthy: 'OK',
  warning: 'Check',
  blocked: 'Blocked',
  unknown: 'Pending',
};

interface CommercialInspectorPanelProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  onSelectedSegmentChange: (segment: string) => void;
  onViewFullAnalysis: () => void;
}

function formatMbps(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Gbps`;
  return `${Math.round(value)} Mbps`;
}

function formatMs(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-slate-800 px-3 py-2 first:border-t-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-300">{label}</div>
      </div>
      <div className="shrink-0 text-right text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function StorySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/70">
      <div className="border-b border-slate-800 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
        {title}
      </div>
      {children}
    </section>
  );
}

export default function CommercialInspectorPanel({
  viewModel,
  selectedSegmentId,
  onSelectedSegmentChange,
  onViewFullAnalysis,
}: CommercialInspectorPanelProps) {
  const segment = viewModel.routeSegments.find((item) => item.id === selectedSegmentId)
    ?? viewModel.routeSegments.find((item) => item.type === 'summary')
    ?? viewModel.routeSegments[0];
  const selectedSegment = segment?.id ?? 'summary';
  const selectedTechnology = viewModel.comparison.options.find((option) => option.technology === viewModel.technology);
  const serviceRows = [
    { label: 'What this is', value: segment?.story ?? 'Customer service scenario' },
    { label: 'Service state', value: viewModel.display.serviceStatusLabel },
    { label: 'Recommendation', value: viewModel.comparison.recommendation?.message ?? 'Waiting for comparable metrics' },
  ];
  const performanceRows = [
    { label: 'Expected downlink', value: formatMbps(segment?.throughputMbps ?? viewModel.downloadMbps) },
    { label: 'Expected uplink', value: formatMbps(viewModel.uploadMbps) },
    { label: 'Customer RTT', value: formatMs(segment?.latencyMs ?? viewModel.rttMs) },
    { label: 'Selected technology', value: viewModel.technology.toUpperCase() },
  ];
  const availabilityRows = [
    { label: 'Availability', value: viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(2)}%` : viewModel.display.serviceStatusLabel },
    { label: 'Access weather', value: viewModel.display.weatherA ?? '--' },
    { label: 'Destination weather', value: viewModel.display.weatherB ?? '--' },
    { label: 'Selected service', value: selectedTechnology?.statusLabel ?? viewModel.display.serviceStatusLabel },
  ];
  const limitingRows = [
    { label: 'Segment limitation', value: segment?.limitation ?? 'None detected' },
    { label: 'Main limitation', value: viewModel.primaryWarning ?? 'None detected' },
    { label: 'Bottleneck', value: viewModel.bottleneck ?? 'None detected' },
  ];
  const proofRows = [
    { label: 'Route', value: viewModel.display.routeValue ?? '--' },
    { label: 'Satellite', value: viewModel.display.satelliteName ?? '--' },
    { label: 'Orbit', value: viewModel.display.satelliteOrbit ?? viewModel.technology.toUpperCase() },
    { label: 'Elevation', value: viewModel.display.elevation ?? '--' },
    { label: 'Link margin', value: viewModel.display.linkMargin ?? '--' },
    { label: 'SNP A', value: viewModel.display.snpA ?? '--' },
    { label: 'SNP B', value: viewModel.display.snpB ?? '--' },
    { label: 'Route summary', value: viewModel.display.routeSummary ?? '--' },
  ];

  return (
    <aside className="flex h-full w-full flex-col overflow-hidden border-l border-slate-700 bg-slate-950">
      <div className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              Commercial Inspector
            </div>
            <h2 className="mt-1 truncate text-lg font-semibold text-white">{segment?.title ?? 'Summary'}</h2>
            <p className="mt-1 text-sm text-slate-400">{segment?.summary ?? viewModel.display.routeSummary}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${statusClassName[segment?.status ?? 'unknown']}`}>
            {statusLabel[segment?.status ?? 'unknown']}
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
          <StorySection title="Service Overview">
            {serviceRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>

          <StorySection title="Performance">
            {performanceRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>

          <StorySection title="Availability">
            {availabilityRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>

          <StorySection title="Limiting Factor">
            {limitingRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>

          <StorySection title="Technical Proof">
            {proofRows.map((row) => (
              <FieldRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />
            ))}
          </StorySection>
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
