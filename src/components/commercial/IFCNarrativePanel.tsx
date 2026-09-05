import { memo } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Plane,
  Satellite,
  Wifi,
} from 'lucide-react';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import { formatMbps, formatMs, commServiceStatusLabel, serviceStatusChipClassName } from './commercialDisplayUtils';
import {
  CommercialKpiTile,
  SignalQualityBar,
} from './CommercialVisuals';
import {
  downloadSpeedTier,
  qualityFromText,
  responseTimeTier,
  uploadSpeedTier,
} from './commercialTiers';

// ── Hero SVG ─────────────────────────────────────────────────────────────────

function IFCHeroDiagram({ connected, technology }: { connected: boolean; technology: string }) {
  const arcColor = connected ? 'rgb(251,191,36)' : 'rgb(100,116,139)';
  const satColor = connected ? 'rgb(251,191,36)' : 'rgb(100,116,139)';

  return (
    <svg viewBox="0 0 340 88" className="w-full h-auto" aria-hidden="true">
      <defs>
        <linearGradient id="ifc-arc" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={arcColor} stopOpacity="0.15" />
          <stop offset="48%"  stopColor={arcColor} stopOpacity="0.85" />
          <stop offset="100%" stopColor="rgb(56,189,248)" stopOpacity="0.20" />
        </linearGradient>
        <radialGradient id="ifc-plane-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgb(251,191,36)" stopOpacity={connected ? '0.35' : '0'} />
          <stop offset="100%" stopColor="rgb(251,191,36)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Earth horizon */}
      <ellipse cx="170" cy="106" rx="230" ry="32"
        fill="rgb(56,189,248)" fillOpacity="0.05" />
      <ellipse cx="170" cy="110" rx="230" ry="28"
        fill="rgb(56,189,248)" fillOpacity="0.03" />

      {/* Satellite group */}
      <g transform="translate(272,14)">
        <circle cx="0" cy="0" r="14" fill="url(#ifc-plane-glow)" />
        <rect x="-5" y="-3.5" width="10" height="7" rx="1.5"
          fill={satColor} fillOpacity="0.9" />
        <rect x="-19" y="-1.5" width="12" height="3" rx="1"
          fill={satColor} fillOpacity="0.55" />
        <rect x="7"  y="-1.5" width="12" height="3" rx="1"
          fill={satColor} fillOpacity="0.55" />
      </g>

      {/* Signal arc */}
      <path d="M 80 66 Q 176 4 272 18"
        fill="none"
        stroke="url(#ifc-arc)"
        strokeWidth={connected ? '1.8' : '1.2'}
        strokeDasharray={connected ? 'none' : '6 4'}
        opacity={connected ? 0.95 : 0.38}
      />

      {/* Signal dots when connected */}
      {connected && (
        <>
          <circle cx="120" cy="44" r="2.2" fill="rgb(251,191,36)" opacity="0.90" />
          <circle cx="168" cy="21" r="1.6" fill="rgb(251,191,36)" opacity="0.65" />
          <circle cx="218" cy="15" r="2.0" fill="rgb(56,189,248)"  opacity="0.75" />
        </>
      )}

      {/* Aircraft */}
      <g transform="translate(80,62) rotate(-18) scale(1.1)">
        {/* Glow under aircraft */}
        <circle cx="0" cy="0" r="10"
          fill="rgb(251,191,36)"
          fillOpacity={connected ? '0.12' : '0.04'} />
        {/* Simple plane silhouette */}
        <path
          d="M0-7 L5.5 3 L0 1.5 L-5.5 3 Z M-2.5 2 L2.5 2 L3 6.5 L-3 6.5 Z"
          fill={connected ? 'rgb(251,191,36)' : 'rgb(148,163,184)'}
        />
      </g>

      {/* Labels */}
      <text x="56" y="78" fontSize="7.5" fontFamily="ui-monospace,monospace"
        fill="rgb(148,163,184)" opacity="0.55">Aircraft</text>
      <text x="248" y="34" fontSize="7" fontFamily="ui-monospace,monospace"
        fill={connected ? 'rgb(251,191,36)' : 'rgb(100,116,139)'} opacity="0.75">{technology}</text>
    </svg>
  );
}

// ── Row helper ───────────────────────────────────────────────────────────────

function FactRow({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`text-xs font-medium ${dim ? 'text-slate-400' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

export interface IFCNarrativePanelProps {
  aircraft: Aircraft;
  viewModel: CommercialScenarioViewModel;
  isOpen: boolean;
  onViewFullAnalysis?: () => void;
}

const IFCNarrativePanel = memo(function IFCNarrativePanel({
  aircraft,
  viewModel,
  isOpen,
  onViewFullAnalysis,
}: IFCNarrativePanelProps) {
  // Flight display values
  // altitude_km × 32.8084 = flight level (FL = feet / 100)
  const altFl = aircraft.altitude_km != null
    ? String(Math.round(aircraft.altitude_km * 32.8084)).padStart(3, '0')
    : null;
  const speedKts = aircraft.speed_kmh != null
    ? Math.round(aircraft.speed_kmh / 1.852)
    : null;

  // Connectivity
  const isConnected  = viewModel.serviceStatus === 'active';
  const dlTier = downloadSpeedTier(viewModel.downloadMbps);
  const ulTier = uploadSpeedTier(viewModel.uploadMbps);
  const rtTier = responseTimeTier(viewModel.rttMs);
  const signalQuality = qualityFromText(viewModel.display.linkQualityA);
  const satelliteName = viewModel.display.satelliteNameA ?? viewModel.display.satelliteName;
  const elevationStr  = viewModel.display.elevationA ?? viewModel.display.elevation;
  const isLeo = viewModel.commercialDisplayTechnology === 'LEO';

  return (
    <div
      data-site-tooltip-occluder="true"
      className={[
        'ifc-narrative-panel',
        'absolute right-0 top-0 z-40 w-[380px]',
        'bottom-[5.75rem]',
        'transition-transform duration-200',
        isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      style={{
        transitionTimingFunction: isOpen
          ? 'cubic-bezier(0.16,1,0.3,1)'
          : 'cubic-bezier(0.4,0,1,1)',
      }}
      aria-hidden={!isOpen}
    >
      {/* Left shadow cast on globe */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-10 -translate-x-full"
        style={{ background: 'linear-gradient(to right, transparent, rgba(6,10,22,0.35))' }}
      />

      {/* Panel body */}
      <div className="flex h-full flex-col overflow-hidden border-l border-amber-400/14 bg-[linear-gradient(180deg,rgba(28,20,4,0.98),rgba(6,10,22,0.97)_36%,rgba(2,6,20,0.97))] backdrop-blur-2xl">

        {/* ── Header ── */}
        <div className="flex-shrink-0 border-b border-amber-500/12 px-5 pb-4 pt-5">
          {/* Eyebrow + live badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Plane className="h-3 w-3 text-amber-400" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-400/75">
                In-Flight Connectivity
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="text-[9px] font-semibold uppercase tracking-widest text-emerald-400/70">
                Planning estimate
              </span>
            </div>
          </div>

          {/* Flight identity */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[22px] font-black tracking-tight text-white">
                {aircraft.callsign}
              </div>
              <div className="mt-0.5 text-[11px] font-semibold text-amber-300/65">Tracked aircraft</div>
            </div>
            <div className="flex flex-col items-end gap-0.5 pb-0.5 text-right">
              {altFl != null && (
                <span className="font-mono text-[13px] font-semibold text-slate-200">
                  FL{altFl}
                </span>
              )}
              {speedKts != null && (
                <span className="font-mono text-[10px] text-slate-400">
                  {speedKts} kt
                </span>
              )}
            </div>
          </div>

          {/* Status chip */}
          <div className="mt-3">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${serviceStatusChipClassName[viewModel.serviceStatus]}`}
            >
              {commServiceStatusLabel[viewModel.serviceStatus]}
            </span>
          </div>
        </div>

        {/* ── Hero diagram ── */}
        <div className="flex-shrink-0 border-b border-slate-800/50 bg-slate-950/50 px-3 pb-1 pt-2">
          <IFCHeroDiagram connected={isConnected} technology={viewModel.commercialDisplayTechnology} />
        </div>

        {/* ── Scrollable content ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Link performance */}
          <div className="border-b border-slate-800/50 px-5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Wifi className="h-3 w-3 text-sky-400" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-sky-400/70">
                Link Performance
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <CommercialKpiTile
                label="Download"
                value={formatMbps(viewModel.downloadMbps)}
                sublabel={dlTier.label}
                sublabelTone={dlTier.tone}
              />
              <CommercialKpiTile
                label="Upload"
                value={formatMbps(viewModel.uploadMbps)}
                sublabel={ulTier.label}
                sublabelTone={ulTier.tone}
              />
              <CommercialKpiTile
                label="Latency"
                value={formatMs(viewModel.rttMs)}
                sublabel={rtTier.label}
                sublabelTone={rtTier.tone}
              />
            </div>
            {signalQuality !== 'unknown' && (
              <div className="mt-3 rounded-lg border border-slate-800/60 bg-slate-900/40 px-3 py-2">
                <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400/80">
                  Signal quality
                </div>
                <SignalQualityBar quality={signalQuality} />
              </div>
            )}
          </div>

          {/* Space segment */}
          <div className="border-b border-slate-800/50 px-5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <Satellite className="h-3 w-3 text-indigo-400" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-indigo-400/70">
                Space Segment
              </span>
            </div>
            <div className="rounded-lg border border-indigo-300/16 bg-[linear-gradient(180deg,rgba(30,27,75,0.30),rgba(15,23,42,0.40))] p-3">
              <div className="space-y-1.5">
                {satelliteName && (
                  <FactRow label="Serving satellite" value={satelliteName} />
                )}
                {elevationStr && (
                  <FactRow label="Elevation" value={elevationStr} />
                )}
                <FactRow
                  label="Orbit"
                  value={isLeo ? 'Low Earth Orbit (LEO)' : 'Geostationary (GEO)'}
                />
                <FactRow
                  label="Round-trip latency"
                  value={formatMs(viewModel.rttMs)}
                  dim={viewModel.rttMs == null}
                />
              </div>
            </div>
            <div className="mt-2 rounded-lg border border-emerald-500/18 bg-emerald-950/25 px-3 py-2">
                <p className="text-[10px] leading-[1.6] text-emerald-300/80">
                  This point-in-time planning result does not establish continuous in-flight service.
                  Terminal certification, beam handover, regulatory approval, gateway reachability and
                  operator capacity must be confirmed for the complete route.
                </p>
            </div>
          </div>

          {/* Mobility evidence — no passenger/revenue claims are inferred from a callsign. */}
          <div className="border-b border-slate-800/50 px-5 py-4">
            <div className="mb-2.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-amber-400" aria-hidden="true" />
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-amber-400/70">
                Mobility assessment limits
              </span>
            </div>
            <div className="rounded-lg border border-amber-300/18 bg-amber-950/16 px-3 py-2.5">
              <p className="text-[10px] leading-[1.6] text-slate-300">
                Aircraft type, certified satcom terminal, passenger load and commercial revenue are not
                present in the tracking feed. They are therefore not estimated from the callsign.
              </p>
            </div>
          </div>

          {/* CTA */}
          {onViewFullAnalysis && (
            <div className="px-5 py-4">
              <button
                onClick={onViewFullAnalysis}
                className="flex w-full items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-2.5 text-xs font-medium text-slate-200 transition-colors hover:border-amber-500/30 hover:bg-amber-950/20 hover:text-amber-100"
              >
                <span>Full Engineering Analysis</span>
                <ChevronRight className="h-4 w-4 text-slate-500" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default IFCNarrativePanel;
