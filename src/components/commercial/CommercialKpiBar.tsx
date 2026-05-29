import { AlertTriangle } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialStatus } from './commercialViewModel';

const statusClassName: Record<CommercialStatus, string> = {
  active: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  degraded: 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  blocked: 'border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200',
  unknown: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

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

function formatAvailability(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.availabilityPct != null && Number.isFinite(viewModel.availabilityPct)) {
    return `${viewModel.availabilityPct.toFixed(2)}%`;
  }
  return viewModel.display.serviceStatusLabel;
}

function KpiItem({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={`${emphasis ? 'min-w-[8rem]' : 'min-w-[6.5rem]'} border-l border-slate-700 px-4 first:border-l-0`}>
      <div className={`${emphasis ? 'text-2xl' : 'text-lg'} font-semibold tabular-nums text-white`}>{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
    </div>
  );
}

interface CommercialKpiBarProps {
  viewModel: CommercialScenarioViewModel;
}

export default function CommercialKpiBar({ viewModel }: CommercialKpiBarProps) {
  const comparisonOptions = viewModel.comparison.options;
  const showComparison = comparisonOptions.length >= 2;

  return (
    <div className="flex min-h-[6rem] flex-wrap items-center gap-4 border-b border-slate-700 bg-slate-950/94 px-5 py-3 shadow-sm backdrop-blur">
      <div className="min-w-[13rem] flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Scenario</div>
        <div className="mt-1 truncate text-xl font-semibold text-white" title={viewModel.scenarioName}>
          {viewModel.scenarioName}
        </div>
        {viewModel.comparison.recommendation && (
          <div className="mt-1 truncate text-sm font-medium text-sky-100" title={viewModel.comparison.recommendation.message}>
            {viewModel.comparison.recommendation.message}
          </div>
        )}
      </div>

      <div className={`flex min-w-[10rem] flex-col justify-center rounded-xl border px-3 py-2 ${statusClassName[viewModel.serviceStatus]}`}>
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]">Service</div>
        <div className="mt-0.5 text-base font-semibold">{viewModel.serviceMessage ?? viewModel.display.serviceStatusLabel}</div>
      </div>

      <div className="flex min-w-0 items-center overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 py-1">
        <KpiItem label="Throughput" value={formatMbps(viewModel.downloadMbps)} emphasis />
        <KpiItem label="Uplink" value={formatMbps(viewModel.uploadMbps)} />
        <KpiItem label="RTT" value={formatMs(viewModel.rttMs)} />
        <KpiItem label="Availability" value={formatAvailability(viewModel)} />
      </div>

      <div className="inline-flex min-w-0 max-w-sm items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/12 dark:text-amber-200">
        {viewModel.primaryWarning ? (
          <>
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate" title={viewModel.primaryWarning}>{viewModel.primaryWarning}</span>
          </>
        ) : (
          <span>Main limitation: none detected</span>
        )}
      </div>

      {showComparison && (
        <div className="flex min-w-[18rem] overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70">
          {comparisonOptions.map((option) => (
            <div key={option.technology} className="min-w-[8.5rem] flex-1 border-l border-slate-800 px-3 py-2 first:border-l-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">{option.label}</span>
                <span className={option.available ? 'text-[10px] font-semibold text-emerald-300' : 'text-[10px] font-semibold text-slate-500'}>
                  {option.statusLabel}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-white">{formatMbps(option.downloadMbps)}</div>
              <div className="text-xs text-slate-400">{formatMs(option.rttMs)} RTT</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
