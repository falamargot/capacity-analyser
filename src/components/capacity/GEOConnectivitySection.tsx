import { memo, useState, useMemo, useEffect, type ReactNode } from 'react';
import { Gauge, Maximize2, Minimize2, Route, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import CoverageSelector from '../CoverageSelector';
import CollapsibleSection from '../layout/CollapsibleSection';
import TerminalConfig, { TERMINAL_PROFILES, type WeatherType } from './TerminalConfig';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
import type { TerminalType, TerminalRFClassId, TerminalRFCustomParams } from './TerminalConfig';
import type { LinkMode } from '../../types/linkMode';
import DualSegmentPanel from './DualSegmentPanel';
import EngineeringAnalysisWorkspace from './EngineeringAnalysisWorkspace';
import { getDisplayedThroughput, type DualSegmentResult } from '../../utils/geoDualSegmentBudget';
import LinkModeSelector from './LinkModeSelector';
import type { ResolvedGeoGateway } from '../../utils/geoConnectivityModel';
import { formatCoordinates } from '../../utils/formatters';
import { buildGeoConfidence, type PredictionConfidence } from '../../utils/predictionConfidence';
import { estimateGeoSatelliteCapacity } from '../../utils/geoCapacityModel';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from '../../utils/linkAvailabilityContext';
import { buildGeoEngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';
import { fmtDb, fmtMbps, fmtMs } from '../../utils/engineeringFormat';
import { ENGINEERING_TERMS } from '../../constants/engineeringTerminology';
import LatencyBreakdownCard from './shared/LatencyBreakdownCard';
import LayerHeading from './shared/LayerHeading';
import { geoMarginToTone } from './shared/linkBudgetTone';
import AnswerBlock from './shared/AnswerBlock';

// ─── Sub-component: Link budget cockpit + detail drawer ──────────────────────

const displayableBeamOrCoverageName = (
  beamName: string | undefined,
  coverageName: string | undefined,
  fallback: string,
) => {
  const trimmedBeamName = beamName?.trim();
  return trimmedBeamName && !Number.isFinite(Number(trimmedBeamName))
    ? trimmedBeamName
    : coverageName ?? fallback;
};

const DirectionPill = ({ dir, aggregate = false }: { dir: string; aggregate?: boolean }) => (
  <span className={`ml-1.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
    aggregate
      ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500'
      : 'border-blue-200 bg-blue-50 text-blue-500 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400'
  }`}>{dir}</span>
);

interface LinkBudgetSummaryCardProps {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  activeMeshTab?: 'forward' | 'reverse';
  highlighted?: boolean;
  onToggle: () => void;
}

const LinkBudgetSummaryCard = ({
  linkMode,
  result,
  activeMeshTab = 'forward',
  highlighted = false,
  onToggle,
}: LinkBudgetSummaryCardProps) => {
  const direction = result
    ? (activeMeshTab === 'reverse' && result.reverse ? result.reverse : result.forward)
    : null;
  const e2e = direction?.endToEnd ?? null;
  const uplink = direction?.uplink ?? null;
  const downlink = direction?.downlink ?? null;
  const displaySegment = linkMode === 'STAR_FORWARD'
    ? (downlink ?? uplink)
    : linkMode === 'STAR_RETURN'
      ? (uplink ?? downlink)
      : (uplink ?? downlink);
  const limiting = e2e?.limitingSegment === 'uplink' ? 'Uplink' : e2e?.limitingSegment === 'downlink' ? 'Downlink' : '--';
  const margin = e2e?.endToEndLinkMarginDb;
  const tone = geoMarginToTone(margin);
  const satelliteName = displaySegment?.candidate.satelliteName ?? 'No GEO path';
  const band = displaySegment?.candidate.band ?? 'Band --';
  const beamName = displayableBeamOrCoverageName(
    displaySegment?.candidate.beamName,
    displaySegment?.candidate.coverageName,
    '--',
  );
  const linkBudgetDirectionLabel = linkMode === 'STAR_FORWARD'
    ? 'Forward'
    : linkMode === 'STAR_RETURN'
      ? 'Return'
      : activeMeshTab === 'reverse'
        ? 'B→A'
        : 'A→B';

  // Network layer — pick the direction matching the active tab
  const networkLayer = result
    ? (activeMeshTab === 'reverse' && result.networkLayer?.reverse
        ? result.networkLayer.reverse
        : result.networkLayer?.forward)
    : null;
  const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  // Use final throughput for Mesh/P2P; RF throughput for STAR
  const displayThroughput = (isMeshOrP2P && networkLayer)
    ? networkLayer.finalThroughputMbps
    : e2e?.endToEndThroughputMbps;
  const throughputLabel = (isMeshOrP2P && networkLayer) ? 'Final Thru.' : 'Throughput';

  return (
    <section
      className={[
        'relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 dark:bg-slate-900',
        highlighted
          ? 'border-blue-300 ring-2 ring-blue-500/30 dark:border-blue-500/70 dark:ring-blue-400/30'
          : 'border-slate-200 dark:border-slate-700',
      ].join(' ')}
    >
      {highlighted && <div className="absolute inset-y-0 left-0 w-1 bg-blue-500" aria-hidden="true" />}
      <div
        className={[
          'border-b px-3.5 py-3',
          highlighted
            ? 'border-blue-100 bg-blue-50/75 dark:border-blue-900/70 dark:bg-blue-950/30'
            : 'border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center text-sm font-semibold" style={{ color: '#2563eb' }}>
                Link Budget
                <DirectionPill dir={linkBudgetDirectionLabel} />
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.className}`}>
                  {tone.label}
                </span>
                <SectionTooltip content="RF link budget analysis showing end-to-end link margin and throughput. Status: Healthy (margin ≥ 2 dB), Marginal (0-2 dB), Blocked (negative margin), or No budget (insufficient data)." />
              </span>
            </div>
            {/* Topology badges for Mesh / P2P */}
            {isMeshOrP2P && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {linkMode === 'POINT_TO_POINT' ? (
                  <>
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      Dedicated SCPC
                    </span>
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      Protocol Efficiency 100%
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                      Shared Service
                    </span>
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                      Protocol Efficiency 85%
                    </span>
                  </>
                )}
              </div>
            )}
            <h4 className="mt-1.5 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
              {satelliteName}
            </h4>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {band} · {beamName}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={[
              'inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-2.5 shadow-sm transition-colors',
              highlighted
                ? 'border-blue-300 bg-blue-600 text-white hover:bg-blue-700 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
            ].join(' ')}
            aria-label={highlighted ? 'Close detailed link budget' : 'Open detailed link budget'}
            title={highlighted ? 'Close detailed link budget' : 'Open detailed link budget'}
            aria-pressed={highlighted}
          >
            {highlighted ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-slate-100 dark:bg-slate-800">
        {[
          { label: throughputLabel, value: fmtMbps(displayThroughput), icon: Gauge, primary: true },
          { label: 'Margin', value: fmtDb(margin), icon: Gauge, primary: false },
          { label: 'Limit', value: limiting, icon: Route, primary: false },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 bg-white px-3 py-3 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div
                className={`mt-1 truncate font-bold tabular-nums text-slate-950 dark:text-slate-50 ${item.primary ? 'text-lg' : 'text-sm'}`}
                style={item.label === 'Margin' ? { color: tone.accent } : undefined}
              >
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

interface LinkBudgetDrawerProps {
  open: boolean;
  onClose: () => void;
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  activeMeshTab?: 'forward' | 'reverse';
  onMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  satelliteName?: string;
  satellite?: SatelliteData | null;
  latencyMs?: number | null;
  latencyLabel?: string;
  availabilityLabel?: string;
  confidenceLabel?: string;
  confidenceDetail?: string;
  confidence?: PredictionConfidence;
  coverageLabels?: {
    forward?: {
      uplink?: string;
      downlink?: string;
    };
    reverse?: {
      uplink?: string;
      downlink?: string;
    };
  };
}

const LinkBudgetDrawer = ({
  open,
  onClose,
  linkMode,
  result,
  activeMeshTab,
  onMeshTabChange,
  satelliteName,
  latencyMs,
  latencyLabel,
  availabilityLabel,
  confidenceLabel,
  confidenceDetail,
  confidence,
  coverageLabels,
  satellite,
}: LinkBudgetDrawerProps) => {
  if (!open) return null;

  const viewModel = buildGeoEngineeringAnalysisViewModel({
    linkMode,
    result,
    activeMeshTab,
    satelliteName,
    latencyMs,
    latencyLabel,
    availabilityLabel,
    confidenceLabel,
    confidenceDetail,
    confidence,
  });

  return (
    <EngineeringAnalysisWorkspace
      open={open}
      onClose={onClose}
      viewModel={viewModel}
    >
      <DualSegmentPanel
        linkMode={linkMode}
        result={result}
        activeMeshTab={activeMeshTab}
        onMeshTabChange={onMeshTabChange}
        satelliteName={satelliteName}
        satellite={satellite}
        coverageLabels={coverageLabels}
        variant="cockpit"
      />
    </EngineeringAnalysisWorkspace>
  );
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GEOGeometry {
  userToSatellite: {
    elevationDeg: number;
    slantRangeKm: number;
    latencyMs: number;
  };
  satelliteToGateway: {
    slantRangeKm: number | null;
    latencyMs: number | null;
    gateway: { name: string } | null;
    resolvedGateway?: ResolvedGeoGateway | null;
  };
  oneWayRadioMs: number | null;
  rttPropagationMs: number | null;
  rttTotalMs: number | null;
  propagationBreakdownMs: {
    userToSatellite: number | null;
    satelliteToGateway: number | null;
    gatewayToSatellite: number | null;
    satelliteToUser: number | null;
  };
  overheadMs: {
    gatewayProcessing: number;
    modemProcessing: number;
    routing: number;
    total: number;
  };
  warnings: string[];
  isUserLinkUnstable: boolean;
}

export interface ResolvedGEOConnectivity {
  satellite: SatelliteData;
  candidate: { coverageName: string };
  geometry: GEOGeometry | null;
  elevation: number;
  distance: number;
  rtt: number | null;
  beam: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatGeoStabilityTooltip = (elevationDeg: number, isUserLinkUnstable: boolean): string => {
  const currentRule = isUserLinkUnstable
    ? 'Current status: Unstable (elevation is below 5 deg).'
    : elevationDeg >= 40
      ? 'Current status: High (elevation is at least 40 deg).'
      : elevationDeg >= 25
        ? 'Current status: Medium (elevation is between 25 deg and 40 deg).'
        : elevationDeg >= 5
          ? 'Current status: Low (elevation is between 5 deg and 25 deg).'
          : 'Current status: Unstable (elevation is below 5 deg).';

  return `GEO stability rule:
  - Unstable below 5 deg elevation
  - Low from 5 deg to below 25 deg
  - Medium from 25 deg to below 40 deg
  - High at 40 deg and above
Current elevation: ${elevationDeg.toFixed(1)} deg.
${currentRule}`;
};


// ─── GEO Service Status Card ─────────────────────────────────────────────────

const geoToneClasses = {
  success: {
    border: 'border-emerald-300/90 dark:border-emerald-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(236,253,245,0.96),rgba(255,255,255,0.94),rgba(240,253,250,0.9))] dark:bg-[linear-gradient(160deg,rgba(6,78,59,0.26),rgba(15,23,42,0.95))]',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.14),transparent_28%)]',
    iconShell: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/14 dark:text-emerald-200 dark:ring-emerald-400/20',
    badge: 'text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-400',
    tile: 'border-emerald-200/90 bg-white/74 dark:border-emerald-400/20 dark:bg-emerald-500/8',
    tileText: 'text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    border: 'border-amber-300/90 dark:border-amber-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94),rgba(255,247,237,0.9))] dark:bg-[linear-gradient(160deg,rgba(120,53,15,0.20),rgba(15,23,42,0.95))]',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.14),transparent_28%)]',
    iconShell: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/14 dark:text-amber-100 dark:ring-amber-400/20',
    badge: 'text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-200',
    dot: 'bg-amber-400',
    tile: 'border-amber-200/90 bg-white/74 dark:border-amber-400/18 dark:bg-amber-500/8',
    tileText: 'text-amber-700 dark:text-amber-200',
  },
  danger: {
    border: 'border-rose-300/90 dark:border-rose-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(255,241,242,0.98),rgba(255,255,255,0.94),rgba(254,242,242,0.9))] dark:bg-[linear-gradient(160deg,rgba(127,29,29,0.20),rgba(15,23,42,0.95))]',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,63,94,0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,63,94,0.14),transparent_28%)]',
    iconShell: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/14 dark:text-rose-100 dark:ring-rose-400/20',
    badge: 'text-[10px] font-bold uppercase tracking-[0.18em] text-rose-700 dark:text-rose-200',
    dot: 'bg-rose-400',
    tile: 'border-rose-200/90 bg-white/74 dark:border-rose-400/18 dark:bg-rose-500/8',
    tileText: 'text-rose-700 dark:text-rose-200',
  },
  neutral: {
    border: 'border-slate-300/90 dark:border-slate-400/25',
    panel: 'bg-[linear-gradient(165deg,rgba(248,250,252,0.98),rgba(255,255,255,0.95),rgba(241,245,249,0.92))] dark:bg-[linear-gradient(160deg,rgba(30,41,59,0.88),rgba(15,23,42,0.96))]',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.14),transparent_34%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.16),transparent_34%)]',
    iconShell: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-500/14 dark:text-slate-100 dark:ring-slate-400/20',
    badge: 'text-[10px] font-bold uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200',
    dot: 'bg-slate-400',
    tile: 'border-slate-200/90 bg-white/78 dark:border-slate-400/18 dark:bg-slate-500/8',
    tileText: 'text-slate-700 dark:text-slate-200',
  },
} as const;

type GeoTone = keyof typeof geoToneClasses;

interface GeoStatusTileProps {
  label: string;
  value: string;
  detail?: string;
  tone: GeoTone;
}

const GeoStatusTile = ({ label, value, detail, tone }: GeoStatusTileProps) => {
  const c = geoToneClasses[tone];
  return (
    <div className={`rounded-xl border px-3 py-2 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.9)] ${c.tile}`}>
      <div className="flex w-full flex-col items-start gap-1">
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          {label}
        </span>
        <span className={`max-w-full text-[12px] font-semibold leading-4 ${c.tileText} whitespace-normal break-words`}>
          {value}
        </span>
      </div>
      {detail && (
        <p className="mt-0.5 text-[10px] leading-3.5 text-slate-600 dark:text-slate-300/80">
          {detail}
        </p>
      )}
    </div>
  );
};

interface GeoStatusCardProps {
  dualSegmentResult: DualSegmentResult | null;
  resolvedGEOConnectivity: ResolvedGEOConnectivity | null;
  geoGeometry: GEOGeometry | null;
  linkMode: LinkMode;
  activeMeshTab: 'forward' | 'reverse';
  isMeshOrP2P: boolean;
  gatewayName: string;
}

const GeoStatusCard = memo(({
  dualSegmentResult,
  resolvedGEOConnectivity,
  geoGeometry,
  linkMode,
  activeMeshTab,
  isMeshOrP2P,
  gatewayName,
}: GeoStatusCardProps) => {
  const activeDir = dualSegmentResult
    ? (activeMeshTab === 'reverse' && dualSegmentResult.reverse
        ? dualSegmentResult.reverse
        : dualSegmentResult.forward)
    : null;
  const e2e = activeDir?.endToEnd ?? null;
  const margin = e2e?.endToEndLinkMarginDb ?? null;

  const tone: GeoTone =
    typeof margin !== 'number' || !isFinite(margin)
      ? 'neutral'
      : margin < 0 ? 'danger'
      : margin < 2 ? 'warning'
      : 'success';
  const c = geoToneClasses[tone];

  const StatusIcon = tone === 'success' ? ShieldCheck : tone === 'warning' ? ShieldAlert : tone === 'danger' ? ShieldX : ShieldX;

  const primaryStatusLabel =
    tone === 'success' ? 'Healthy'
    : tone === 'warning' ? 'Marginal'
    : tone === 'danger' ? 'Blocked'
    : 'No coverage';

  const primaryReasonLabel =
    tone === 'success' ? 'Link margin within spec'
    : tone === 'warning' ? 'Low margin — service degraded'
    : tone === 'danger' ? 'Negative margin — link cannot close'
    : resolvedGEOConnectivity ? 'No RF budget available'
    : 'No satellite path found';

  const statusSummary =
    tone === 'success' ? 'GEO RF chain is healthy end-to-end. Service is available.'
    : tone === 'warning' ? 'Link is feasible but margin is thin. Quality may be affected.'
    : tone === 'danger' ? 'RF chain cannot close. Service is not available at this time.'
    : 'No GEO beam covers this location, or no link budget has been computed.';

  // RF tile
  const rfValue = margin != null ? `${margin >= 0 ? '+' : ''}${margin.toFixed(1)} dB` : '--';
  const rfTileTone: GeoTone = tone === 'neutral' ? 'neutral' : tone;

  // Capacity tile — mode description + throughput
  const throughputMbps = activeDir
    ? (isMeshOrP2P && dualSegmentResult
        ? getDisplayedThroughput(dualSegmentResult, activeMeshTab === 'reverse' ? 'reverse' : 'forward')
        : e2e?.endToEndThroughputMbps ?? null)
    : null;
  const capacityModeLabel =
    linkMode === 'POINT_TO_POINT' ? 'Dedicated (P2P)'
    : linkMode === 'MESH' ? 'Shared (MESH)'
    : linkMode === 'STAR_RETURN' ? 'Star Return'
    : 'Star Forward';
  const capacityDetail = throughputMbps != null ? fmtMbps(throughputMbps) : '--';

  // GEO teleport tile
  const gatewayResolved = gatewayName !== 'Gateway' && gatewayName !== '';
  const gatewayValue = isMeshOrP2P ? 'Not in path' : (gatewayResolved ? gatewayName : 'Not resolved');
  const gatewayDetail = isMeshOrP2P
    ? 'Direct terminal-to-terminal'
    : gatewayResolved ? 'Reference allocation' : `No eligible ${ENGINEERING_TERMS.GEO.gateway} found`;
  const gatewayTone: GeoTone = isMeshOrP2P ? 'neutral' : gatewayResolved ? 'success' : 'warning';

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-3 shadow-[0_22px_54px_-38px_rgba(15,23,42,0.24)] dark:shadow-[0_22px_54px_-38px_rgba(15,23,42,0.9)] ${c.border} ${c.panel}`}>
      <div className={`pointer-events-none absolute inset-0 ${c.halo}`} />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-white/30" />

      <div className="relative">
        <div className="flex items-center justify-between gap-2.5">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/76 px-2.5 py-1 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.34)] dark:border-white/10 dark:bg-white/6">
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${c.iconShell}`}>
              <StatusIcon className="h-3.5 w-3.5" />
            </span>
            <span className={c.badge}>{primaryStatusLabel}</span>
          </div>
        </div>

        <div className="mt-2.5">
          <h4 className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-white">
            {primaryReasonLabel}
          </h4>
          <p className="mt-0.5 text-[12px] leading-4 text-slate-600 dark:text-slate-300/88">
            {statusSummary}
          </p>
        </div>

        <div className="mt-3 grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
          <GeoStatusTile label="RF" value={rfValue} detail={primaryStatusLabel} tone={rfTileTone} />
          <GeoStatusTile label="Capacity" value={capacityModeLabel} detail={capacityDetail} tone="neutral" />
          <GeoStatusTile label={ENGINEERING_TERMS.GEO.gateway} value={gatewayValue} detail={gatewayDetail} tone={gatewayTone} />
        </div>
      </div>
    </div>
  );
});

GeoStatusCard.displayName = 'GeoStatusCard';

// ─── Main component ───────────────────────────────────────────────────────────

interface GEOConnectivitySectionProps {
  resolvedGEOConnectivity: ResolvedGEOConnectivity | null;
  geoGeometry: GEOGeometry | null;
  calculateGEOPerformance: (elevationDeg: number) => {
    downlinkGbps: number;
    uplinkGbps: number;
    stability: string;
    performanceFactor: number;
    weatherFactor: number;
    weatherLabel: string;
  };
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  candidateCoverages: CandidateCoverage[];
  bestCoverage: CandidateCoverage | null;
  selectedCoverage: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  onSelectUplinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverage?: (coverage: CandidateCoverage) => void;
  activePoint?: { lat: number; lng: number; altitude?: number } | null;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  showEstimatedPerformance?: boolean;
  /** Active link connectivity mode — drives the dual-segment display. */
  linkMode?: LinkMode;
  onLinkModeChange?: (mode: LinkMode) => void;
  /** Dual-segment RF budget computed by geoDualSegmentBudget. Null when no path is found. */
  dualSegmentResult?: DualSegmentResult | null;
  /** Controlled direction tab for MESH/P2P — lifted to App so the globe stays in sync. */
  activeMeshTab?: 'forward' | 'reverse';
  onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  /** Second geographic point (MESH / P2P) — used only for label display. */
  pointB?: { lat: number; lng: number } | null;
  /** Terminal type for Point B — only relevant in MESH / P2P. */
  terminalTypeB?: TerminalType;
  onTerminalTypeBChange?: (type: TerminalType) => void;
  /** RF capability class for Terminal A (drives computed EIRP/G/T). */
  rfClassIdA?: TerminalRFClassId;
  onRFClassIdAChange?: (id: TerminalRFClassId) => void;
  rfPresetDisplayLabelA?: string;
  /** RF capability class for Terminal B (drives computed EIRP/G/T). */
  rfClassIdB?: TerminalRFClassId;
  onRFClassIdBChange?: (id: TerminalRFClassId) => void;
  rfPresetDisplayLabelB?: string;
  rfCustomParamsA?: TerminalRFCustomParams | null;
  onRFCustomParamsAChange?: (params: TerminalRFCustomParams | null) => void;
  rfCustomParamsB?: TerminalRFCustomParams | null;
  onRFCustomParamsBChange?: (params: TerminalRFCustomParams | null) => void;
  pointAIsUserDefined?: boolean;
  pointBIsUserDefined?: boolean;
  /** Coverage candidates at Point B — MESH / P2P only. */
  candidateCoveragesB?: CandidateCoverage[];
  /** Best uplink coverage at Point B (auto-selected). */
  uplinkCoverageAtB?: CandidateCoverage | null;
  /** Best downlink coverage at Point B (auto-selected). */
  downlinkCoverageAtB?: CandidateCoverage | null;
  onSelectUplinkCoverageB?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverageB?: (coverage: CandidateCoverage) => void;
  /** When provided, only satellites whose ID is in this set appear in the satellite dropdown. */
  validSatelliteIds?: ReadonlySet<string>;
  /** Controlled drawer open state — lift to parent so GEO/LEO share the same open/closed status. */
  isLinkBudgetDrawerOpen?: boolean;
  onLinkBudgetDrawerOpenChange?: (open: boolean) => void;
}

const ONE_WAY_VISUAL_SCALE_MAX_MS = 350;

// Speed of light used for propagation delay (km/ms)
const SPEED_OF_LIGHT_KM_PER_MS = 299.792458;

const GEOConnectivitySection = memo<GEOConnectivitySectionProps>(({
  resolvedGEOConnectivity,
  geoGeometry,
  calculateGEOPerformance: _calculateGEOPerformance,
  terminalType,
  onTerminalTypeChange,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  candidateCoverages,
  bestCoverage,
  selectedCoverage,
  onSelectCoverage,
  selectedUplinkCoverage = null,
  selectedDownlinkCoverage = null,
  onSelectUplinkCoverage,
  onSelectDownlinkCoverage,
  activePoint = null,
  analysisSource,
  aircraftCallsign,
  onSatelliteClick,
  showEstimatedPerformance = true,
  linkMode = 'STAR_FORWARD',
  onLinkModeChange,
  dualSegmentResult = null,
  pointB = null,
  pointAIsUserDefined = false,
  pointBIsUserDefined = false,
  terminalTypeB,
  onTerminalTypeBChange,
  rfClassIdA,
  onRFClassIdAChange,
  rfPresetDisplayLabelA,
  rfClassIdB,
  onRFClassIdBChange,
  rfPresetDisplayLabelB,
  rfCustomParamsA,
  onRFCustomParamsAChange,
  rfCustomParamsB,
  onRFCustomParamsBChange,
  candidateCoveragesB = [],
  uplinkCoverageAtB = null,
  downlinkCoverageAtB = null,
  onSelectUplinkCoverageB,
  onSelectDownlinkCoverageB,
  activeMeshTab: controlledMeshTab,
  onActiveMeshTabChange,
  validSatelliteIds,
  isLinkBudgetDrawerOpen: controlledDrawerOpen = false,
  onLinkBudgetDrawerOpenChange,
}) => {
  const geoCapacityEstimate = resolvedGEOConnectivity?.satellite
    ? estimateGeoSatelliteCapacity(resolvedGEOConnectivity.satellite)
    : null;
  const geoPredictionConfidence = buildGeoConfidence({
    mode: 'ENG',
    topology: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? 'Site-to-Site' : 'Single Site',
    coverageAvailable: !!(selectedCoverage ?? bestCoverage),
    rfAvailable: !!dualSegmentResult,
    publicFrequencyEvidence: !!(selectedCoverage?.band ?? bestCoverage?.band ?? selectedCoverage?.frequencyGhz ?? bestCoverage?.frequencyGhz ?? selectedCoverage?.level ?? bestCoverage?.level),
    gatewayResolved: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' || !!geoGeometry?.satelliteToGateway.resolvedGateway,
    capacityClassKnown: !!geoCapacityEstimate,
    regulatoryKnown: true,
    routePending: false,
  });
  const availabilityContext = buildLinkAvailabilityContext({
    architecture: 'GEO',
    weatherType,
    lat: activePoint?.lat,
  });
  const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const isStarForward = linkMode === 'STAR_FORWARD';
  const isStarReturn = linkMode === 'STAR_RETURN';

  // Active MESH direction tab. Uses local state for immediate UI feedback;
  // syncs to the controlled prop from App so the globe stays in sync.
  const [internalMeshTab, setInternalMeshTab] = useState<'forward' | 'reverse'>(controlledMeshTab ?? 'forward');
  const isLinkBudgetDrawerOpen = controlledDrawerOpen;
  const setIsLinkBudgetDrawerOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(controlledDrawerOpen) : value;
    onLinkBudgetDrawerOpenChange?.(next);
  };
  useEffect(() => { setInternalMeshTab('forward'); }, [linkMode]);
  // Keep local state in sync when App propagates an external change (e.g. globe click).
  useEffect(() => {
    if (controlledMeshTab && controlledMeshTab !== internalMeshTab) {
      setInternalMeshTab(controlledMeshTab);
    }
  // Only sync on external prop change, not on internal change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlledMeshTab]);
  const activeMeshTab = controlledMeshTab ?? internalMeshTab;
  const meshDirectionLabel = activeMeshTab === 'reverse' ? 'B→A' : 'A→B';
  const starDirectionLabel = isStarReturn ? 'Return' : 'Forward';
  const setActiveMeshTab = (tab: 'forward' | 'reverse') => {
    setInternalMeshTab(tab);
    onActiveMeshTabChange?.(tab);
  };
  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
  const showPerformanceBeforeRadioPath = analysisSource !== 'aircraft';
  const resolvedGateway = geoGeometry?.satelliteToGateway.resolvedGateway ?? null;
  const gatewayName = resolvedGateway?.gatewayName ?? geoGeometry?.satelliteToGateway.gateway?.name ?? 'Gateway';
  const gatewayRole = resolvedGateway?.role ?? null;
  const gatewayDisplayName = gatewayRole ? `${gatewayName} (${gatewayRole})` : gatewayName;
  const pointACoordinatesLabel = activePoint ? formatCoordinates(activePoint) : '--';
  const pointBCoordinatesLabel = pointB ? formatCoordinates(pointB) : 'Shift+click to place';
  const gatewayCoordinatesLabel = resolvedGateway
    ? formatCoordinates({ lat: resolvedGateway.latitude, lng: resolvedGateway.longitude })
    : null;
  const geoStarOneWayTotalMs = !isMeshOrP2P && geoGeometry?.oneWayRadioMs != null
    ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total
    : null;

  // ── MESH/P2P geometry — derived entirely from dualSegmentResult ──────────────
  // For MESH/P2P the gateway is NOT in the RF path. Directional latency follows
  // the selected one-way terminal-to-terminal route: A→Sat→B or B→Sat→A.
  const meshGeometry = useMemo(() => {
    if (!isMeshOrP2P || !dualSegmentResult) return null;
    if (!dualSegmentResult.reverse) return null;
    const fwUl = dualSegmentResult.forward.uplink.candidate;    // A → Sat
    const fwDl = dualSegmentResult.forward.downlink.candidate;  // Sat → B
    const rvUl = dualSegmentResult.reverse.uplink.candidate;    // B → Sat
    const rvDl = dualSegmentResult.reverse.downlink.candidate;  // Sat → A

    const toMs = (km: number) => km / SPEED_OF_LIGHT_KM_PER_MS;

    const aToSatKm = fwUl.slantRangeKm ?? 37500;
    const satToBKm = fwDl.slantRangeKm ?? 37500;
    const bToSatKm = rvUl.slantRangeKm ?? 37500;
    const satToAKm = rvDl.slantRangeKm ?? 37500;

    const aToSatMs = toMs(aToSatKm);
    const satToBMs = toMs(satToBKm);
    const bToSatMs = toMs(bToSatKm);
    const satToAMs = toMs(satToAKm);

    const modemOverheadMs = 40; // Source + destination modem processing — no gateway
    const fwTotalMs = aToSatMs + satToBMs + modemOverheadMs;
    const rvTotalMs = bToSatMs + satToAMs + modemOverheadMs;

    // Keep the 4-hop propagation reference available for diagnostics only.
    const rttPropagationMs = aToSatMs + satToBMs + bToSatMs + satToAMs;
    const rttTotalMs = rttPropagationMs + modemOverheadMs;

    // Stability = weakest link (min elevation across both endpoints)
    const elevA = fwUl.elevation;
    const elevB = fwDl.elevation;
    const minElev = Math.min(elevA, elevB);
    const stability = minElev < 5 ? 'Unstable'
      : minElev < 25 ? 'Low'
      : minElev < 40 ? 'Medium'
      : 'High';
    const isUnstable = minElev < 5;

    // Labels and endpoint data from segment descriptors (already localised)
    const pointALabel = dualSegmentResult.forward.uplink.source.label;
    const pointBLabel = dualSegmentResult.forward.downlink.destination.label;

    return {
      // Endpoint meta
      pointALabel, pointBLabel,
      satelliteName: fwUl.satelliteName,
      beamNameAtA: fwUl.beamName || fwUl.coverageName,
      beamNameAtB: fwDl.beamName || fwDl.coverageName,
      elevA, elevB,
      // Per-hop distances
      aToSatKm, aToSatMs,
      satToBKm, satToBMs,
      bToSatKm, bToSatMs,
      satToAKm, satToAMs,
      // One-way per direction
      fwOneWayKm: aToSatKm + satToBKm,
      fwOneWayMs: aToSatMs + satToBMs,
      fwTotalMs,
      rvOneWayKm: bToSatKm + satToAKm,
      rvOneWayMs: bToSatMs + satToAMs,
      rvTotalMs,
      // 4-hop diagnostic reference (not used as the selected route latency)
      rttPropagationMs,
      modemOverheadMs,
      rttTotalMs,
      stability,
      isUnstable,
      // Per-direction final throughput (after network layer protocol efficiency + contention)
      forwardThroughputMbps: getDisplayedThroughput(dualSegmentResult, 'forward'),
      reverseThroughputMbps: dualSegmentResult.reverse ? getDisplayedThroughput(dualSegmentResult, 'reverse') : null,
    };
  }, [isMeshOrP2P, dualSegmentResult]);
  const meshUnavailableMessage = pointB
    ? `No ${meshDirectionLabel} GEO path available for the active topology.`
    : 'Place Point B to compute MESH link performance';

  const estimatedPerformanceDirectionLabel = isMeshOrP2P
    ? meshDirectionLabel
    : starDirectionLabel;

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="geo-performance"
      title={<>Estimated Performance<DirectionPill dir={estimatedPerformanceDirectionLabel} aggregate={isMeshOrP2P} /><SectionTooltip content="Predicted GEO link throughput derived from the RF link budget. STAR modes show one active direction only. MESH/P2P shows the selected terminal-to-terminal direction with no gateway in the RF path." /></>}
      accentColor="#2563eb"
      defaultOpen={true}
      collapsible={false}
    >
      {isMeshOrP2P ? (
        meshGeometry ? (() => {
          const selectedThroughputMbps = activeMeshTab === 'reverse'
            ? meshGeometry.reverseThroughputMbps
            : meshGeometry.forwardThroughputMbps;
          const selectedThroughputGbps = selectedThroughputMbps != null
            ? selectedThroughputMbps / 1000
            : null;
          const isReverse = activeMeshTab === 'reverse';
          if (selectedThroughputGbps == null) {
            return (
              <PerformancePanel
                rtt={null}
                downlinkGbps={null}
                uplinkGbps={null}
                maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                accentColor="#2563eb"
                noDataMessage={meshUnavailableMessage}
              />
            );
          }
          return (
            (() => {
              const selectedLatencyMs = isReverse ? meshGeometry.rvTotalMs : meshGeometry.fwTotalMs;
              return (
            <PerformancePanel
              rtt={selectedLatencyMs}
              downlinkGbps={isReverse ? null : selectedThroughputGbps}
              uplinkGbps={isReverse ? selectedThroughputGbps : null}
              hideUplink={!isReverse}
              hideDownlink={isReverse}
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              stability={meshGeometry.isUnstable ? 'Unstable' : meshGeometry.stability}
              performanceFactor={1}
              accentColor="#2563eb"
              rttMaxMs={ONE_WAY_VISUAL_SCALE_MAX_MS}
              rttLabel={`${linkMode === 'POINT_TO_POINT' ? 'P2P' : 'Mesh'} ${meshDirectionLabel} latency`}
              downlinkLabel={`${meshDirectionLabel} throughput`}
              uplinkLabel={`${meshDirectionLabel} throughput`}
              stabilityTooltip={`MESH/P2P stability = weakest link.\nPoint A elevation: ${meshGeometry.elevA.toFixed(1)}°\nPoint B elevation: ${meshGeometry.elevB.toFixed(1)}°`}
            />
              );
            })()
          );
        })() : (
          <PerformancePanel
            rtt={null} downlinkGbps={null} uplinkGbps={null}
            maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
            maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
            accentColor="#2563eb"
            noDataMessage={meshUnavailableMessage}
          />
        )
      ) : resolvedGEOConnectivity && geoGeometry ? (
        // STAR FORWARD / RETURN: only one direction is budgeted by the RF model.
        // Show that direction's throughput (from the real link budget) + one-way latency.
        // Round-trip details are not shown here; they belong in the Latency Breakdown section.
        (() => {
          const elevDeg = geoGeometry.userToSatellite.elevationDeg;
          const stability = geoGeometry.isUserLinkUnstable ? 'Unstable'
            : elevDeg >= 40 ? 'High'
            : elevDeg >= 25 ? 'Medium'
            : elevDeg >= 5  ? 'Low'
            : 'Unstable';
          const geoStabilityTooltip = formatGeoStabilityTooltip(elevDeg, geoGeometry.isUserLinkUnstable);
          const throughputMbps = dualSegmentResult?.forward.endToEnd.endToEndThroughputMbps ?? null;
          const throughputGbps = throughputMbps != null ? throughputMbps / 1000 : null;

          if (isStarForward) {
            const gwLabel = gatewayDisplayName;
            return (
              <PerformancePanel
                rtt={geoGeometry.oneWayRadioMs}
                downlinkGbps={throughputGbps}
                uplinkGbps={null}
                hideUplink
                maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                stability={stability}
                performanceFactor={1}
                accentColor="#2563eb"
                rttMaxMs={ONE_WAY_VISUAL_SCALE_MAX_MS}
                rttLabel={`One-way latency (${gwLabel} → ${userLabel})`}
                downlinkLabel="Forward link throughput"
                stabilityTooltip={geoStabilityTooltip}
              />
            );
          }

          // STAR_RETURN
          const gwLabel = gatewayDisplayName;
          return (
            <PerformancePanel
              rtt={geoGeometry.oneWayRadioMs}
              downlinkGbps={null}
              uplinkGbps={throughputGbps}
              hideDownlink
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              stability={stability}
              performanceFactor={1}
              accentColor="#2563eb"
              rttMaxMs={ONE_WAY_VISUAL_SCALE_MAX_MS}
              rttLabel={`One-way latency (${userLabel} → ${gwLabel})`}
              uplinkLabel="Return link throughput"
              stabilityTooltip={geoStabilityTooltip}
            />
          );
        })()
      ) : (
        <PerformancePanel
          rtt={null}
          downlinkGbps={null}
          uplinkGbps={null}
          maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
          maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
          accentColor="#2563eb"
          noDataMessage="No GEO coverage available for the active target"
        />
      )}
    </CollapsibleSection>
  );

  const drawerSatelliteName = dualSegmentResult?.forward.uplink.candidate.satelliteName
    ?? resolvedGEOConnectivity?.satellite.name;

  const formatCoverageName = (coverage: CandidateCoverage | null | undefined): string | undefined => {
    if (!coverage) return undefined;
    const name = coverage.coverageName || coverage.beamName || coverage.satelliteName;
    return coverage.isSynthesized ? `${name} (estimated)` : name;
  };

  const formatHopDistance = (distanceKm: number | null | undefined, latencyMs: number | null | undefined): string => {
    const distance = distanceKm != null ? `${distanceKm.toFixed(0)} km` : '--';
    const latency = latencyMs != null ? `${latencyMs.toFixed(1)} ms` : '--';
    return `${distance} (${latency})`;
  };

  const radioPathSummary = (() => {
    if (isMeshOrP2P) {
      if (!meshGeometry) return meshUnavailableMessage;
      const isForward = activeMeshTab === 'forward';
      const oneWayKm = isForward ? meshGeometry.fwOneWayKm : meshGeometry.rvOneWayKm;
      const oneWayMs = isForward ? meshGeometry.fwOneWayMs : meshGeometry.rvOneWayMs;
      return `One-way ${meshDirectionLabel} ${oneWayKm.toFixed(0)} km (${oneWayMs.toFixed(1)} ms)`;
    }

    if (!resolvedGEOConnectivity || !geoGeometry) return 'No GEO visibility or beam coverage.';

    const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
      ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
      : null;
    const oneWayLabel = oneWayDistanceKm != null && geoGeometry.oneWayRadioMs != null
      ? `${oneWayDistanceKm.toFixed(0)} km (${geoGeometry.oneWayRadioMs.toFixed(1)} ms)`
      : '--';

    return `${isStarReturn ? 'Return' : 'Forward'} one-way ${oneWayLabel}`;
  })();

  const linkBudgetCoverageLabels = useMemo(() => {
    if (!dualSegmentResult) return undefined;

    const segmentFallback = {
      forward: {
        uplink: formatCoverageName(dualSegmentResult.forward.uplink.candidate),
        downlink: formatCoverageName(dualSegmentResult.forward.downlink.candidate),
      },
      reverse: dualSegmentResult.reverse ? {
        uplink: formatCoverageName(dualSegmentResult.reverse.uplink.candidate),
        downlink: formatCoverageName(dualSegmentResult.reverse.downlink.candidate),
      } : undefined,
    };

    if (linkMode === 'STAR_FORWARD') {
      return {
        forward: {
          // GEO teleport side: mirror the sidebar row exactly.
          uplink: `${ENGINEERING_TERMS.GEO.gateway} side - reference allocation`,
          // User side: align with the downlink row visible in the sidebar.
          downlink: formatCoverageName(selectedDownlinkCoverage ?? selectedCoverage) ?? segmentFallback.forward.downlink,
        },
      };
    }

    if (linkMode === 'STAR_RETURN') {
      return {
        forward: {
          // User side: align with the uplink row visible in the sidebar.
          uplink: formatCoverageName(selectedUplinkCoverage) ?? segmentFallback.forward.uplink,
          // GEO teleport side: mirror the sidebar row exactly.
          downlink: `${ENGINEERING_TERMS.GEO.gateway} side - reference allocation`,
        },
      };
    }

    if (isMeshOrP2P) {
      return {
        forward: {
          uplink: formatCoverageName(selectedUplinkCoverage) ?? segmentFallback.forward.uplink,
          downlink: formatCoverageName(downlinkCoverageAtB) ?? segmentFallback.forward.downlink,
        },
        reverse: {
          uplink: formatCoverageName(uplinkCoverageAtB) ?? segmentFallback.reverse?.uplink,
          downlink: formatCoverageName(selectedDownlinkCoverage) ?? segmentFallback.reverse?.downlink,
        },
      };
    }

    return segmentFallback;
  }, [
    downlinkCoverageAtB,
    dualSegmentResult,
    isMeshOrP2P,
    linkMode,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverage,
    uplinkCoverageAtB,
  ]);

  // ── Answer Block (above-the-fold summary) ─────────────────────────────────
  // Reuses the same derivation already used by LinkBudgetSummaryCard (margin,
  // displayed throughput, limiting segment) and the same headline-latency
  // expression passed to LinkBudgetDrawer below, so the compact summary never
  // disagrees with the detailed cards further down the sidebar.
  const answerDirection = dualSegmentResult
    ? (activeMeshTab === 'reverse' && dualSegmentResult.reverse ? dualSegmentResult.reverse : dualSegmentResult.forward)
    : null;
  const answerE2E = answerDirection?.endToEnd ?? null;
  const answerNetworkLayer = dualSegmentResult
    ? (activeMeshTab === 'reverse' && dualSegmentResult.networkLayer?.reverse
        ? dualSegmentResult.networkLayer.reverse
        : dualSegmentResult.networkLayer?.forward)
    : null;
  const answerTone = geoMarginToTone(answerE2E?.endToEndLinkMarginDb);
  const answerThroughputMbps = (isMeshOrP2P && answerNetworkLayer)
    ? answerNetworkLayer.finalThroughputMbps
    : answerE2E?.endToEndThroughputMbps;
  const answerThroughputLabel = (isMeshOrP2P && answerNetworkLayer) ? 'Final Thru.' : 'Throughput';
  const answerLimitingSegment = answerE2E?.limitingSegment === 'uplink'
    ? 'Uplink'
    : answerE2E?.limitingSegment === 'downlink'
      ? 'Downlink'
      : '--';
  const headlineLatencyMs = isMeshOrP2P
    ? (meshGeometry ? (activeMeshTab === 'reverse' ? meshGeometry.rvTotalMs : meshGeometry.fwTotalMs) : null)
    : geoStarOneWayTotalMs;
  const headlineLatencyLabel = isMeshOrP2P ? `${meshDirectionLabel} latency` : `${starDirectionLabel} latency`;

  return (
    <>
      {onLinkModeChange && (
        <div className="mb-4">
          <LinkModeSelector
            linkMode={linkMode}
            onChange={onLinkModeChange}
          />
        </div>
      )}

      <AnswerBlock
        accentColor="#2563eb"
        statusLabel={answerTone.label}
        statusClassName={answerTone.className}
        throughputLabel={answerThroughputLabel}
        throughputValue={fmtMbps(answerThroughputMbps)}
        latencyLabel={headlineLatencyLabel}
        latencyValue={fmtMs(headlineLatencyMs, 0)}
        bottleneckLabel="Bottleneck"
        bottleneckValue={answerLimitingSegment}
        confidenceValue={`${geoPredictionConfidence.level} · ${geoPredictionConfidence.score}/100`}
      />

      <LayerHeading title="Access Layer" detail="RF details, terminal characteristics, weather loss, elevation and visibility." />

      <div className="mb-4 mt-2">
        {isMeshOrP2P && terminalTypeB != null && onTerminalTypeBChange ? (
          <>
            <div className="grid grid-cols-2 items-stretch gap-2">
              <TerminalConfig
                terminalType={terminalType}
                onTerminalTypeChange={onTerminalTypeChange}
                rfClassId={rfClassIdA}
                onRFClassChange={onRFClassIdAChange}
                rfPresetDisplayLabel={rfPresetDisplayLabelA}
                rfCustomParams={rfCustomParamsA}
                onRFCustomParamsChange={onRFCustomParamsAChange}
                weatherType={weatherType}
                onWeatherTypeChange={onWeatherTypeChange}
                autoWeatherEnabled={autoWeatherEnabled}
                onAutoWeatherChange={onAutoWeatherChange}
                analysisSource={analysisSource}
                compact
                showWeather={false}
                showRFClass={!!onRFClassIdAChange}
                className="mb-0"
                title="Site A Advanced RF Details"
                subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                stacked
                tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
                advancedDetailsOnly
              />
              <TerminalConfig
                terminalType={terminalTypeB}
                onTerminalTypeChange={onTerminalTypeBChange}
                rfClassId={rfClassIdB}
                onRFClassChange={onRFClassIdBChange}
                rfPresetDisplayLabel={rfPresetDisplayLabelB}
                rfCustomParams={rfCustomParamsB}
                onRFCustomParamsChange={onRFCustomParamsBChange}
                weatherType={weatherType}
                onWeatherTypeChange={onWeatherTypeChange}
                autoWeatherEnabled={autoWeatherEnabled}
                onAutoWeatherChange={onAutoWeatherChange}
                compact
                showWeather={false}
                showRFClass={!!onRFClassIdBChange}
                className="mb-0"
                title="Site B Advanced RF Details"
                subtitle={<span className="font-mono">{pointBCoordinatesLabel}</span>}
                stacked
                tone={pointBIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointBIsUserDefined ? 'Manual' : 'Unset'}
                advancedDetailsOnly
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 items-stretch gap-2">
            {isStarForward ? (
              <>
                <TerminalConfig
                  terminalType="fixed"
                  onTerminalTypeChange={() => {}}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  compact
                  showWeather={false}
                  className="mb-0"
                  title={gatewayName}
                  subtitle={gatewayCoordinatesLabel ? <span className="font-mono">{gatewayCoordinatesLabel}</span> : undefined}
                  stacked
                  tone="user-defined"
                  statusLabel="Auto"
                  statusTitle="Resolved automatically"
	                  readOnly
	                  terminalDisplayLabel={ENGINEERING_TERMS.GEO.gateway}
	                  terminalDisplayIcon="📡"
	                  showMaxLabel={false}
	                />
                <TerminalConfig
                  terminalType={terminalType}
                  onTerminalTypeChange={onTerminalTypeChange}
                  rfClassId={rfClassIdA}
                  onRFClassChange={onRFClassIdAChange}
                  rfPresetDisplayLabel={rfPresetDisplayLabelA}
                  rfCustomParams={rfCustomParamsA}
                  onRFCustomParamsChange={onRFCustomParamsAChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  compact
                  showWeather={false}
                  showRFClass={!!onRFClassIdAChange}
                  className="mb-0"
                  title="Customer Advanced RF Details"
                  subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                  stacked
                  tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                  statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
                  advancedDetailsOnly
                />
              </>
            ) : (
              <>
                <TerminalConfig
                  terminalType={terminalType}
                  onTerminalTypeChange={onTerminalTypeChange}
                  rfClassId={rfClassIdA}
                  onRFClassChange={onRFClassIdAChange}
                  rfPresetDisplayLabel={rfPresetDisplayLabelA}
                  rfCustomParams={rfCustomParamsA}
                  onRFCustomParamsChange={onRFCustomParamsAChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  compact
                  showWeather={false}
                  showRFClass={!!onRFClassIdAChange}
                  className="mb-0"
                  title="Customer Advanced RF Details"
                  subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                  stacked
                  tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                  statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
                  advancedDetailsOnly
                />
                <TerminalConfig
                  terminalType="fixed"
                  onTerminalTypeChange={() => {}}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  compact
                  showWeather={false}
                  className="mb-0"
                  title={gatewayName}
                  subtitle={gatewayCoordinatesLabel ? <span className="font-mono">{gatewayCoordinatesLabel}</span> : undefined}
                  stacked
                  tone="user-defined"
                  statusLabel="Auto"
                  statusTitle="Resolved automatically"
	                  readOnly
	                  terminalDisplayLabel={ENGINEERING_TERMS.GEO.gateway}
	                  terminalDisplayIcon="📡"
	                  showMaxLabel={false}
	                />
              </>
            )}
          </div>
        )}
      </div>

      <LayerHeading title="Space Segment" detail="Serving satellite, coverage, beam, footprint and link-budget metrics." />

      {candidateCoverages.length > 0 && (!isMeshOrP2P || candidateCoveragesB.length > 0) && (() => {
        // In MESH/P2P the uplink and downlink candidates swap with the active direction:
        //   A→B: uplink = A-side (selectable), downlink = B-side (display only)
        //   B→A: uplink = B-side (display only), downlink = A-side (selectable)
        const isReverse = isMeshOrP2P && activeMeshTab === 'reverse';
        const bUplinks   = candidateCoveragesB.filter(c =>  c.isUplink);
        const bDownlinks = candidateCoveragesB.filter(c => !c.isUplink);
        return (
          <div className="mb-4 mt-2">
            <CoverageSelector
              candidateCoverages={candidateCoverages}
              bestCoverage={bestCoverage}
              linkMode={linkMode}
              selectedCoverage={selectedCoverage}
              onSelectCoverage={onSelectCoverage}
              selectedUplinkCoverage={isMeshOrP2P ? (isReverse ? uplinkCoverageAtB   : selectedUplinkCoverage)   : selectedUplinkCoverage}
              selectedDownlinkCoverage={isMeshOrP2P ? (isReverse ? selectedDownlinkCoverage : downlinkCoverageAtB) : selectedDownlinkCoverage}
              onSelectUplinkCoverage={isMeshOrP2P ? (isReverse ? onSelectUplinkCoverageB : onSelectUplinkCoverage) : onSelectUplinkCoverage}
              onSelectDownlinkCoverage={isMeshOrP2P ? (isReverse ? onSelectDownlinkCoverage : onSelectDownlinkCoverageB) : onSelectDownlinkCoverage}
              uplinkCandidatesOverride={isMeshOrP2P ? (isReverse ? bUplinks   : undefined) : undefined}
              downlinkCandidatesOverride={isMeshOrP2P ? (isReverse ? undefined : bDownlinks) : undefined}
              validSatelliteIds={validSatelliteIds}
            />
          </div>
        );
      })()}

      <GeoStatusCard
        dualSegmentResult={dualSegmentResult ?? null}
        resolvedGEOConnectivity={resolvedGEOConnectivity}
        geoGeometry={geoGeometry}
        linkMode={linkMode}
        activeMeshTab={activeMeshTab}
        isMeshOrP2P={isMeshOrP2P}
        gatewayName={gatewayName}
      />

      <LayerHeading title="End-to-End Analysis" detail="Final throughput, latency, availability, bottleneck and limiting factor." />

      <div className="mt-4 space-y-4">
        <LinkBudgetSummaryCard
          linkMode={linkMode}
          result={dualSegmentResult}
          activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
          highlighted={isLinkBudgetDrawerOpen}
          onToggle={() => setIsLinkBudgetDrawerOpen((open) => !open)}
        />

        <LinkBudgetDrawer
          open={isLinkBudgetDrawerOpen}
          onClose={() => setIsLinkBudgetDrawerOpen(false)}
          linkMode={linkMode}
          result={dualSegmentResult}
          activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
          onMeshTabChange={isMeshOrP2P ? setActiveMeshTab : undefined}
          satelliteName={drawerSatelliteName}
          satellite={resolvedGEOConnectivity?.satellite ?? null}
          latencyMs={headlineLatencyMs}
          latencyLabel={headlineLatencyLabel}
          availabilityLabel={`${availabilityContext.indicativeAvailabilityPct.toFixed(1)}% indicative`}
          confidenceLabel={`${geoPredictionConfidence.level} ${geoPredictionConfidence.score}/100`}
          confidenceDetail={[geoPredictionConfidence.summary, geoPredictionConfidence.reasons[0] ?? geoPredictionConfidence.limitation].filter(Boolean).join('. ')}
          confidence={geoPredictionConfidence}
          coverageLabels={linkBudgetCoverageLabels}
        />

        {showEstimatedPerformance && showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        {/* Radio Path */}
        <CollapsibleSection
          storageKey="geo-radio-path"
          title={
            isMeshOrP2P
              ? <> Radio Path <DirectionPill dir={meshDirectionLabel} /><SectionTooltip content="Terminal-to-terminal signal route follows the active MESH/P2P direction through the GEO satellite. No GEO teleport is in the RF path. Shows elevation, slant range and propagation delay for each hop." /></>
              : <> Radio Path <DirectionPill dir={starDirectionLabel} /><SectionTooltip content="Active one-way STAR signal route. Forward mode is GEO teleport → GEO Satellite → User; Return mode is User → GEO Satellite → GEO teleport. Round-trip reference details are shown in the latency breakdown below." /></>
          }
          subtitle={radioPathSummary}
          accentColor="#2563eb"
          defaultOpen={false}
        >
          {isMeshOrP2P ? (
            // ── MESH/P2P: A → Sat → B (no GEO teleport) ─────────────────────
            meshGeometry ? (() => {
              const isForward = activeMeshTab === 'forward';
              const srcLabel  = isForward ? meshGeometry.pointALabel : meshGeometry.pointBLabel;
              const dstLabel  = isForward ? meshGeometry.pointBLabel : meshGeometry.pointALabel;
              const srcBeam   = isForward ? meshGeometry.beamNameAtA : meshGeometry.beamNameAtB;
              const dstBeam   = isForward ? meshGeometry.beamNameAtB : meshGeometry.beamNameAtA;
              const srcElev   = isForward ? meshGeometry.elevA : meshGeometry.elevB;
              const dstElev   = isForward ? meshGeometry.elevB : meshGeometry.elevA;
              const txKm      = isForward ? meshGeometry.aToSatKm : meshGeometry.bToSatKm;
              const txMs      = isForward ? meshGeometry.aToSatMs : meshGeometry.bToSatMs;
              const rxKm      = isForward ? meshGeometry.satToBKm : meshGeometry.satToAKm;
              const rxMs      = isForward ? meshGeometry.satToBMs : meshGeometry.satToAMs;
              const oneWayKm  = isForward ? meshGeometry.fwOneWayKm : meshGeometry.rvOneWayKm;
              const oneWayMs  = isForward ? meshGeometry.fwOneWayMs : meshGeometry.rvOneWayMs;
              const srcShort  = isForward ? 'A' : 'B';
              const dstShort  = isForward ? 'B' : 'A';
              return (
                <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                    <Route className="h-4 w-4 shrink-0 text-blue-500" />
                    <div className="min-w-0 break-words leading-relaxed">
                      <span className="font-medium">{srcLabel}</span>
                      {' → '}
                      <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity?.satellite ?? null)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer">
                        {meshGeometry.satelliteName}
                      </button>
                      {' → '}
                      <span className="font-medium">{dstLabel}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                    <div>
                      <div className="break-words font-medium text-gray-600 dark:text-gray-300">Point {srcShort} → {srcBeam}</div>
                      <div className="pl-3 break-words">→ Elevation: {srcElev.toFixed(1)}° | Slant Range: {txKm.toFixed(0)} km ({txMs.toFixed(1)} ms)</div>
                    </div>
                    <div>
                      <div className="break-words font-medium text-gray-600 dark:text-gray-300">{meshGeometry.satelliteName} → Point {dstShort} ({dstBeam})</div>
                      <div className="pl-3 break-words">→ Elevation: {dstElev.toFixed(1)}° | Slant Range: {rxKm.toFixed(0)} km ({rxMs.toFixed(1)} ms)</div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
                      <span>One-way {srcShort}→{dstShort}</span>
                      <span>{oneWayKm.toFixed(0)} km ({oneWayMs.toFixed(1)} ms)</span>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center italic">
                {meshUnavailableMessage}
              </div>
            )
          ) : (
            // ── STAR Forward/Return: active one-way traffic route ────────────
            resolvedGEOConnectivity && geoGeometry ? (
              (() => {
                const gwName = gatewayName === 'Gateway' ? `No eligible ${ENGINEERING_TERMS.GEO.gateway}` : gatewayName;
                const gwDisplayName = gatewayName === 'Gateway' ? gwName : gatewayDisplayName;
                const satelliteName = resolvedGEOConnectivity.satellite.name;
                const primarySource = isStarReturn ? userLabel : gwDisplayName;
                const primaryDestination = isStarReturn ? gwDisplayName : userLabel;
                const firstHopLabel = isStarReturn
                  ? `${userLabel} → ${formatCoverageName(selectedUplinkCoverage ?? selectedCoverage) ?? resolvedGEOConnectivity.candidate.coverageName}`
                  : `${gwDisplayName} → ${satelliteName}`;
                const secondHopLabel = isStarReturn
                  ? `${satelliteName} → ${gwDisplayName}`
                  : `${satelliteName} → ${formatCoverageName(selectedDownlinkCoverage ?? selectedCoverage) ?? resolvedGEOConnectivity.candidate.coverageName}`;
                const firstHopDistanceKm = isStarReturn
                  ? geoGeometry.userToSatellite.slantRangeKm
                  : geoGeometry.satelliteToGateway.slantRangeKm;
                const firstHopLatencyMs = isStarReturn
                  ? geoGeometry.userToSatellite.latencyMs
                  : geoGeometry.satelliteToGateway.latencyMs;
                const secondHopDistanceKm = isStarReturn
                  ? geoGeometry.satelliteToGateway.slantRangeKm
                  : geoGeometry.userToSatellite.slantRangeKm;
                const secondHopLatencyMs = isStarReturn
                  ? geoGeometry.satelliteToGateway.latencyMs
                  : geoGeometry.userToSatellite.latencyMs;
                const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
                  ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
                  : null;
                return (
                  <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
                    <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      <Route className="h-4 w-4 shrink-0 text-blue-500" />
                      <div className="min-w-0 break-words leading-relaxed">
                        {primarySource}
                        {' → '}
                        <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer break-all">{satelliteName}</button>
                        {' → '}
                        {primaryDestination}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                      <div>
                        <div className="break-words">{firstHopLabel}</div>
                        <div className="pl-3 sm:pl-4 break-words">
                          → Slant Range: {formatHopDistance(firstHopDistanceKm, firstHopLatencyMs)}
                          {isStarReturn ? ` | Elevation: ${geoGeometry.userToSatellite.elevationDeg.toFixed(1)}°` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="break-words">{secondHopLabel}</div>
                        <div className="pl-3 sm:pl-4 break-words">
                          → Slant Range: {formatHopDistance(secondHopDistanceKm, secondHopLatencyMs)}
                          {isStarForward ? ` | Elevation: ${geoGeometry.userToSatellite.elevationDeg.toFixed(1)}°` : ''}
                        </div>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>{isStarReturn ? 'Return' : 'Forward'} one-way propagation</span>
                        <span className="break-words">{oneWayDistanceKm != null && geoGeometry.oneWayRadioMs != null ? `${oneWayDistanceKm.toFixed(0)} km (${geoGeometry.oneWayRadioMs.toFixed(1)} ms)` : '--'}</span>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                <div>No GEO visibility or beam coverage.</div>
              </div>
            )
          )}
        </CollapsibleSection>

        {/* Latency Breakdown */}
        {isMeshOrP2P ? (
          // ── MESH/P2P: selected one-way terminal path, no GEO teleport overhead ─
          <LatencyBreakdownCard
            storageKey="geo-latency-breakdown"
            accentColor="#2563eb"
            title={<>Latency breakdown<DirectionPill dir={meshDirectionLabel} /></>}
            tooltip="One-way propagation for the selected MESH/P2P direction: source terminal → satellite → destination terminal. No GEO teleport is in the RF path; overhead is source + destination modem processing."
            summary={meshGeometry ? `Estimated ${meshDirectionLabel} latency: ${(activeMeshTab === 'reverse' ? meshGeometry.rvTotalMs : meshGeometry.fwTotalMs).toFixed(1)} ms` : meshUnavailableMessage}
          >
            {meshGeometry ? (() => {
              const isForward = activeMeshTab === 'forward';
              const src = isForward ? 'A' : 'B';
              const dst = isForward ? 'B' : 'A';
              const hop1Ms = isForward ? meshGeometry.aToSatMs : meshGeometry.bToSatMs;
              const hop2Ms = isForward ? meshGeometry.satToBMs : meshGeometry.satToAMs;
              const selectedPropagationMs = isForward ? meshGeometry.fwOneWayMs : meshGeometry.rvOneWayMs;
              const selectedTotalMs = isForward ? meshGeometry.fwTotalMs : meshGeometry.rvTotalMs;
              return (
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <div className="font-semibold text-gray-700 dark:text-gray-200">One-way propagation</div>
                <div className="flex justify-between"><span>Point {src} → Satellite</span><span>{hop1Ms.toFixed(1)} ms</span></div>
                <div className="flex justify-between"><span>Satellite → Point {dst}</span><span>{hop2Ms.toFixed(1)} ms</span></div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                  <span>One-way propagation</span><span>{selectedPropagationMs.toFixed(1)} ms</span>
                </div>
                <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead</div>
                <div className="ml-2 flex justify-between"><span>Modem processing ({src} + {dst})</span><span>{meshGeometry.modemOverheadMs.toFixed(0)} ms</span></div>
                <div className="ml-2 text-[10px] text-gray-400 dark:text-gray-500 italic">No GEO teleport - gateway processing and routing delays do not apply.</div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                  <span>Estimated {meshDirectionLabel} latency total</span><span>{selectedTotalMs.toFixed(1)} ms</span>
                </div>
              </div>
            );
          })() : (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                {meshUnavailableMessage}
              </div>
            )}
          </LatencyBreakdownCard>
        ) : (
          // ── STAR: one-way via GEO teleport ────────────────────────────────
          <LatencyBreakdownCard
            storageKey="geo-latency-breakdown"
            accentColor="#2563eb"
            title={`Latency breakdown (${isStarReturn ? 'RETURN' : 'FORWARD'})`}
            tooltip="Breakdown of the active one-way STAR delay. Forward mode sends GEO teleport → Satellite → User; Return mode sends User → Satellite → GEO teleport. Network overhead is added after RF propagation."
            summary={geoGeometry ? `Estimated one-way total: ${geoStarOneWayTotalMs != null ? geoStarOneWayTotalMs.toFixed(1) : '--'} ms` : 'No GEO latency breakdown available'}
          >
            {geoGeometry ? (() => {
              const userSatMs = geoGeometry.propagationBreakdownMs.userToSatellite ?? geoGeometry.propagationBreakdownMs.satelliteToUser ?? null;
              const satGatewayMs = geoGeometry.propagationBreakdownMs.satelliteToGateway ?? geoGeometry.propagationBreakdownMs.gatewayToSatellite ?? null;
              const primaryRows = isStarReturn
                ? [
                    { label: `${userLabel} → Satellite`, value: userSatMs },
                    { label: `Satellite → ${ENGINEERING_TERMS.GEO.gateway}`, value: satGatewayMs },
                  ]
                : [
                    { label: `${ENGINEERING_TERMS.GEO.gateway} → Satellite`, value: satGatewayMs },
                    { label: `Satellite → ${userLabel}`, value: userSatMs },
                  ];
              const oneWayPropagationMs = geoGeometry.oneWayRadioMs
                ?? (primaryRows.every((row) => row.value != null)
                  ? primaryRows.reduce((total, row) => total + (row.value ?? 0), 0)
                  : null);
              const oneWayTotalMs = oneWayPropagationMs != null
                ? oneWayPropagationMs + geoGeometry.overheadMs.total
                : null;

              return (
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                  <div className="font-semibold text-gray-700 dark:text-gray-200">
                    {isStarReturn ? 'Return path propagation' : 'Forward path propagation'}
                  </div>
                  {primaryRows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3">
                      <span>{row.label}</span>
                      <span>{row.value != null ? `${row.value.toFixed(1)} ms` : '--'}</span>
                    </div>
                  ))}
                  <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                    <span>Propagation total</span><span>{oneWayPropagationMs != null ? oneWayPropagationMs.toFixed(1) : '--'} ms</span>
                  </div>
                  <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead</div>
                  <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{geoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                    <span>Network overhead total</span><span>{geoGeometry.overheadMs.total.toFixed(1)} ms</span>
                  </div>
                  <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                    <span>Estimated one-way total</span><span>{oneWayTotalMs != null ? oneWayTotalMs.toFixed(1) : '--'} ms</span>
                  </div>
                  {geoGeometry.warnings.length > 0 && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                      {geoGeometry.warnings.map((warning, index) => (
                        <div key={`${warning}-${index}`}>Warning: {warning}</div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : (
              <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                <div>No GEO latency breakdown available</div>
              </div>
            )}
          </LatencyBreakdownCard>
        )}
        {showEstimatedPerformance && !showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        <CollapsibleSection
          storageKey="geo-assumptions-sources"
          title="Assumptions and Sources"
          accentColor="#2563eb"
          defaultOpen={false}
        >
          <div className="space-y-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            <div className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-blue-700 dark:border-blue-800/50 dark:bg-blue-950/30 dark:text-blue-300">
              STAR-mode GEO teleport selection is a reference allocation unless the model falls back to a visible teleport.
            </div>
            <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <span className="font-semibold">Prediction confidence:</span> {geoPredictionConfidence.summary}. {geoPredictionConfidence.reasons[0] ?? geoPredictionConfidence.limitation}
            </div>
            <div className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
              <span className="font-semibold">Weather availability:</span> {formatLinkAvailabilityContext(availabilityContext)}. {availabilityContext.rationale}
            </div>
            <div className="grid gap-1.5">
              <div><span className="font-semibold text-slate-700 dark:text-slate-200">Physical:</span> WGS84 slant range, elevation, radio propagation delay and GEO RF link-budget calculations.</div>
              <div><span className="font-semibold text-slate-700 dark:text-slate-200">Approximations:</span> terminal RF class, weather attenuation, capacity sharing mode and fixed processing/routing overhead.</div>
              <div><span className="font-semibold text-slate-700 dark:text-slate-200">Heuristics:</span> reference GEO teleport allocation, visible teleport fallback and beam eligibility matching.</div>
              <div><span className="font-semibold text-slate-700 dark:text-slate-200">Sources:</span> public coverage/frequency inputs, bundled teleport registry, selected weather profile and user terminal assumptions.</div>
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </>
  );
});

GEOConnectivitySection.displayName = 'GEOConnectivitySection';
export default GEOConnectivitySection;
