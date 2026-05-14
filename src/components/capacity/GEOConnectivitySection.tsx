import { memo, useState, useMemo, useEffect, type ReactNode } from 'react';
import { ChevronDown, Gauge, Maximize2, Minimize2, Route, ShieldAlert, ShieldCheck, ShieldX, X } from 'lucide-react';
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
import { getDisplayedThroughput, type DualSegmentResult } from '../../utils/geoDualSegmentBudget';
import LinkModeSelector from './LinkModeSelector';
import type { ResolvedGeoGateway } from '../../utils/geoConnectivityModel';
import { formatCoordinates } from '../../utils/formatters';

// ─── Sub-component: LatencyBreakdownCard ──────────────────────────────────────

interface LatencyBreakdownCardProps {
  accentColor: string;
  summary: string;
  title?: ReactNode;
  tooltip?: string;
  children: ReactNode;
}

const LatencyBreakdownCard = ({ accentColor, summary, title = 'Latency breakdown', tooltip, children }: LatencyBreakdownCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold flex items-center" style={{ color: accentColor }}>{title}{tooltip && <SectionTooltip content={tooltip} />}</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 px-4 py-4 dark:border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Sub-component: Link budget cockpit + detail drawer ──────────────────────

const fmtDb = (v: number | undefined | null, d = 1) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(d)} dB` : '--';

const fmtMbps = (v: number | undefined | null) => {
  if (typeof v !== 'number' || !isFinite(v)) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(0)} Mbps`;
};

const linkMarginTone = (margin: number | undefined | null) => {
  if (typeof margin !== 'number' || !isFinite(margin)) {
    return {
      label: 'No budget',
      className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      accent: '#64748b',
    };
  }
  if (margin < 0) {
    return {
      label: 'Blocked',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
      accent: '#dc2626',
    };
  }
  if (margin < 2) {
    return {
      label: 'Marginal',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      accent: '#d97706',
    };
  }
  return {
    label: 'Healthy',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    accent: '#059669',
  };
};

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
  const tone = linkMarginTone(margin);
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
          { label: throughputLabel, value: fmtMbps(displayThroughput), icon: Gauge },
          { label: 'Margin', value: fmtDb(margin), icon: Gauge },
          { label: 'Limit', value: limiting, icon: Route },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 bg-white px-3 py-3 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div className="mt-1 truncate text-sm font-bold tabular-nums text-slate-950 dark:text-slate-50" style={item.label === 'Margin' ? { color: tone.accent } : undefined}>
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
  coverageLabels,
  satellite,
}: LinkBudgetDrawerProps) => {
  // Entrance animation: translate from right edge on mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { cancelAnimationFrame(raf); setMounted(false); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="geo-link-budget-drawer fixed inset-y-0 right-0 z-[80] max-[1099px]:inset-0 max-[1099px]:bg-slate-950/30 max-[1099px]:backdrop-blur-sm min-[1100px]:pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Detailed GEO link budget"
      // On ≥1100px: constrain to sidebar width so the drawer never covers the globe
      style={{ ['--sw' as string]: 'var(--desktop-sidebar-width, 420px)' }}
    >
      {/* Mobile: click backdrop to close */}
      <div
        className="absolute inset-0 max-[1099px]:block min-[1100px]:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end max-[1099px]:sm:pl-10 min-[1100px]:pointer-events-none min-[1100px]:w-[var(--desktop-sidebar-width,420px)]">
        <div
          className={[
            'flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950',
            'transition-[transform,opacity] duration-200 ease-out will-change-transform',
            'min-[1100px]:pointer-events-auto min-[1100px]:overflow-hidden min-[1100px]:rounded-[24px] min-[1100px]:border',
            mounted ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-500 dark:text-blue-300">GEO Link Budget</p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
                {satelliteName ?? result?.forward.uplink.candidate.satelliteName ?? 'Detailed RF path'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Close link budget detail"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <DualSegmentPanel
              linkMode={linkMode}
              result={result}
              activeMeshTab={activeMeshTab}
              onMeshTabChange={onMeshTabChange}
              satelliteName={satelliteName}
              satellite={satellite}
              coverageLabels={coverageLabels}
            />
          </div>
        </div>
      </div>
    </div>
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

  // Gateway tile
  const gatewayResolved = gatewayName !== 'Gateway' && gatewayName !== '';
  const gatewayValue = isMeshOrP2P ? 'Not in path' : (gatewayResolved ? gatewayName : 'Not resolved');
  const gatewayDetail = isMeshOrP2P
    ? 'Direct terminal-to-terminal (no gateway)'
    : gatewayResolved ? 'Auto-resolved' : 'No eligible gateway found';
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
          <GeoStatusTile label="Gateway" value={gatewayValue} detail={gatewayDetail} tone={gatewayTone} />
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
  /** RF capability class for Terminal B (drives computed EIRP/G/T). */
  rfClassIdB?: TerminalRFClassId;
  onRFClassIdBChange?: (id: TerminalRFClassId) => void;
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

const RTT_VISUAL_SCALE_MAX_MS = 600;
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
  rfClassIdB,
  onRFClassIdBChange,
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
  const activeMeshTab = internalMeshTab;
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
  // For MESH/P2P the gateway is NOT in the RF path. All propagation figures
  // come from the A→Sat→B (forward) and B→Sat→A (reverse) segment candidates.
  const meshGeometry = useMemo(() => {
    if (!isMeshOrP2P || !dualSegmentResult) return null;
    const fwUl = dualSegmentResult.forward.uplink.candidate;    // A → Sat
    const fwDl = dualSegmentResult.forward.downlink.candidate;  // Sat → B
    const rvUl = dualSegmentResult.reverse?.uplink.candidate;   // B → Sat
    const rvDl = dualSegmentResult.reverse?.downlink.candidate; // Sat → A

    const toMs = (km: number) => km / SPEED_OF_LIGHT_KM_PER_MS;

    const aToSatKm = fwUl.slantRangeKm ?? 37500;
    const satToBKm = fwDl.slantRangeKm ?? 37500;
    const bToSatKm = rvUl?.slantRangeKm ?? satToBKm;
    const satToAKm = rvDl?.slantRangeKm ?? aToSatKm;

    const aToSatMs = toMs(aToSatKm);
    const satToBMs = toMs(satToBKm);
    const bToSatMs = toMs(bToSatKm);
    const satToAMs = toMs(satToAKm);

    // RTT is always the full round-trip regardless of active direction tab
    const rttPropagationMs = aToSatMs + satToBMs + bToSatMs + satToAMs;
    const modemOverheadMs = 40; // 2 × 20 ms modem processing — no gateway
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
      rvOneWayKm: bToSatKm + satToAKm,
      rvOneWayMs: bToSatMs + satToAMs,
      // RTT (symmetric — same regardless of active tab)
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

  const estimatedPerformanceDirectionLabel = isMeshOrP2P
    ? 'A↔B'
    : starDirectionLabel;

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="geo-performance"
      title={<>Estimated Performance<DirectionPill dir={estimatedPerformanceDirectionLabel} aggregate={isMeshOrP2P} /><SectionTooltip content="Predicted GEO link throughput derived from the RF link budget. STAR modes show one active direction only. MESH/P2P shows RTT for the full round-trip (4 hops, no gateway)." /></>}
      accentColor="#2563eb"
      defaultOpen={true}
      collapsible={false}
    >
      {isMeshOrP2P ? (
        // MESH/P2P: both directions are budgeted separately — show full RTT
        // and the forward/return bottleneck throughput side by side.
        meshGeometry ? (() => {
          return (
            <PerformancePanel
              rtt={meshGeometry.rttTotalMs}
              downlinkGbps={meshGeometry.forwardThroughputMbps / 1000}
              uplinkGbps={meshGeometry.reverseThroughputMbps != null ? meshGeometry.reverseThroughputMbps / 1000 : null}
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              stability={meshGeometry.isUnstable ? 'Unstable' : meshGeometry.stability}
              performanceFactor={1}
              accentColor="#2563eb"
              rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
              rttLabel="Mesh/P2P RTT (4-hop)"
              downlinkLabel="Forward A→B throughput"
              uplinkLabel="Return B→A throughput"
              stabilityTooltip={`MESH/P2P stability = weakest link.\nPoint A elevation: ${meshGeometry.elevA.toFixed(1)}°\nPoint B elevation: ${meshGeometry.elevB.toFixed(1)}°`}
            />
          );
        })() : (
          <PerformancePanel
            rtt={null} downlinkGbps={null} uplinkGbps={null}
            maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
            maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
            accentColor="#2563eb"
            noDataMessage="Place Point B to compute MESH link performance"
          />
        )
      ) : resolvedGEOConnectivity && geoGeometry ? (
        // STAR FORWARD / RETURN: only one direction is budgeted by the RF model.
        // Show that direction's throughput (from the real link budget) + one-way latency.
        // RTT is not shown here — it belongs in the Latency Breakdown section.
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
      if (!meshGeometry) return 'Place Point B to compute the MESH radio path.';
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
          // Gateway side: mirror the sidebar row exactly.
          uplink: 'Gateway side — resolved automatically',
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
          // Gateway side: mirror the sidebar row exactly.
          downlink: 'Gateway side — resolved automatically',
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

  return (
    <>
      <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#2563eb' }}>
        GEO Connectivity
        <SectionTooltip content="Geostationary orbit connectivity block. Shows how the user terminal connects through a Eutelsat GEO satellite and its nearest eligible ground gateway." />
      </h3>

      {onLinkModeChange && (
        <div className="mb-4">
          <LinkModeSelector
            linkMode={linkMode}
            onChange={onLinkModeChange}
          />
        </div>
      )}

<div className="mb-4">
        {isMeshOrP2P && terminalTypeB != null && onTerminalTypeBChange ? (
          <>
            <div className="grid grid-cols-1 items-stretch gap-2 xl:grid-cols-2">
              <TerminalConfig
                terminalType={terminalType}
                onTerminalTypeChange={onTerminalTypeChange}
                rfClassId={rfClassIdA}
                onRFClassChange={onRFClassIdAChange}
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
                title="Terminal A"
                subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                stacked
                tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
              />
              <TerminalConfig
                terminalType={terminalTypeB}
                onTerminalTypeChange={onTerminalTypeBChange}
                rfClassId={rfClassIdB}
                onRFClassChange={onRFClassIdBChange}
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
                title="Terminal B"
                subtitle={<span className="font-mono">{pointBCoordinatesLabel}</span>}
                stacked
                tone={pointBIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointBIsUserDefined ? 'Manual' : 'Unset'}
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-2 xl:grid-cols-2">
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
                  terminalDisplayLabel="Gateway"
                  terminalDisplayIcon="📡"
                />
                <TerminalConfig
                  terminalType={terminalType}
                  onTerminalTypeChange={onTerminalTypeChange}
                  rfClassId={rfClassIdA}
                  onRFClassChange={onRFClassIdAChange}
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
                  title={userLabel === 'User' ? 'Terminal' : userLabel}
                  subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                  stacked
                  tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                  statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
                />
              </>
            ) : (
              <>
                <TerminalConfig
                  terminalType={terminalType}
                  onTerminalTypeChange={onTerminalTypeChange}
                  rfClassId={rfClassIdA}
                  onRFClassChange={onRFClassIdAChange}
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
                  title={userLabel === 'User' ? 'Terminal' : userLabel}
                  subtitle={<span className="font-mono">{pointACoordinatesLabel}</span>}
                  stacked
                  tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                  statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
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
                  terminalDisplayLabel="Gateway"
                  terminalDisplayIcon="📡"
                />
              </>
            )}
          </div>
        )}
      </div>

      {candidateCoverages.length > 0 && (!isMeshOrP2P || candidateCoveragesB.length > 0) && (() => {
        // In MESH/P2P the uplink and downlink candidates swap with the active direction:
        //   A→B: uplink = A-side (selectable), downlink = B-side (display only)
        //   B→A: uplink = B-side (display only), downlink = A-side (selectable)
        const isReverse = isMeshOrP2P && activeMeshTab === 'reverse';
        const bUplinks   = candidateCoveragesB.filter(c =>  c.isUplink);
        const bDownlinks = candidateCoveragesB.filter(c => !c.isUplink);
        return (
          <div className="mb-4">
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
          coverageLabels={linkBudgetCoverageLabels}
        />

        {showEstimatedPerformance && showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        {/* Radio Path */}
        <CollapsibleSection
          storageKey="geo-radio-path"
          title={
            isMeshOrP2P
              ? <> Radio Path <DirectionPill dir={meshDirectionLabel} /><SectionTooltip content="Terminal-to-terminal signal route: Point A → GEO Satellite → Point B. No gateway in the RF path. Shows elevation, slant range and propagation delay for each hop." /></>
              : <> Radio Path <DirectionPill dir={starDirectionLabel} /><SectionTooltip content="Active one-way STAR signal route. Forward mode is Gateway → GEO Satellite → User; Return mode is User → GEO Satellite → Gateway. RTT details are shown in the latency breakdown below." /></>
          }
          subtitle={radioPathSummary}
          accentColor="#2563eb"
          defaultOpen={false}
        >
          {isMeshOrP2P ? (
            // ── MESH/P2P: A → Sat → B (no gateway) ──────────────────────────
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
                Place Point B to compute the MESH radio path.
              </div>
            )
          ) : (
            // ── STAR Forward/Return: active one-way traffic route ────────────
            resolvedGEOConnectivity && geoGeometry ? (
              (() => {
                const gwName = gatewayName === 'Gateway' ? 'No eligible gateway' : gatewayName;
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
          // ── MESH/P2P: 4-hop propagation, no gateway overhead ─────────────
          <LatencyBreakdownCard
            accentColor="#2563eb"
            title={<>Latency breakdown<DirectionPill dir="A↔B" aggregate /></>}
            tooltip="Round-trip propagation for a MESH/P2P link: Point A → Satellite → Point B → Satellite → Point A (4 hops). No gateway in the path — overhead is modem processing only (2 × 20 ms)."
            summary={meshGeometry ? `Estimated RTT: ${meshGeometry.rttTotalMs.toFixed(1)} ms` : 'Place Point B to compute MESH latency'}
          >
            {meshGeometry ? (() => {
              const isForward = activeMeshTab === 'forward';
              const src = isForward ? 'A' : 'B';
              const dst = isForward ? 'B' : 'A';
              const hop1Ms = isForward ? meshGeometry.aToSatMs : meshGeometry.bToSatMs;
              const hop2Ms = isForward ? meshGeometry.satToBMs : meshGeometry.satToAMs;
              const hop3Ms = isForward ? meshGeometry.bToSatMs : meshGeometry.aToSatMs;
              const hop4Ms = isForward ? meshGeometry.satToAMs : meshGeometry.satToBMs;
              return (
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation (4 hops)</div>
                <div className="flex justify-between"><span>Point {src} → Satellite</span><span>{hop1Ms.toFixed(1)} ms</span></div>
                <div className="flex justify-between"><span>Satellite → Point {dst}</span><span>{hop2Ms.toFixed(1)} ms</span></div>
                <div className="flex justify-between"><span>Point {dst} → Satellite</span><span>{hop3Ms.toFixed(1)} ms</span></div>
                <div className="flex justify-between"><span>Satellite → Point {src}</span><span>{hop4Ms.toFixed(1)} ms</span></div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                  <span>RTT propagation</span><span>{meshGeometry.rttPropagationMs.toFixed(1)} ms</span>
                </div>
                <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead</div>
                <div className="ml-2 flex justify-between"><span>Modem processing (A + B)</span><span>{meshGeometry.modemOverheadMs.toFixed(0)} ms</span></div>
                <div className="ml-2 text-[10px] text-gray-400 dark:text-gray-500 italic">No gateway — gateway processing and routing delays do not apply.</div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                  <span>Estimated RTT total</span><span>{meshGeometry.rttTotalMs.toFixed(1)} ms</span>
                </div>
              </div>
            );
          })() : (
              <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                Place Point B to compute MESH latency.
              </div>
            )}
          </LatencyBreakdownCard>
        ) : (
          // ── STAR: one-way via gateway ─────────────────────────────────────
          <LatencyBreakdownCard
            accentColor="#2563eb"
            title={`Latency breakdown (${isStarReturn ? 'RETURN' : 'FORWARD'})`}
            tooltip="Breakdown of the active one-way STAR delay. Forward mode sends Gateway → Satellite → User; Return mode sends User → Satellite → Gateway. Network overhead is added after RF propagation."
            summary={geoGeometry ? `Estimated one-way total: ${geoStarOneWayTotalMs != null ? geoStarOneWayTotalMs.toFixed(1) : '--'} ms` : 'No GEO latency breakdown available'}
          >
            {geoGeometry ? (() => {
              const userSatMs = geoGeometry.propagationBreakdownMs.userToSatellite ?? geoGeometry.propagationBreakdownMs.satelliteToUser ?? null;
              const satGatewayMs = geoGeometry.propagationBreakdownMs.satelliteToGateway ?? geoGeometry.propagationBreakdownMs.gatewayToSatellite ?? null;
              const primaryRows = isStarReturn
                ? [
                    { label: `${userLabel} → Satellite`, value: userSatMs },
                    { label: 'Satellite → Gateway', value: satGatewayMs },
                  ]
                : [
                    { label: 'Gateway → Satellite', value: satGatewayMs },
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
      </div>
    </>
  );
});

GEOConnectivitySection.displayName = 'GEOConnectivitySection';
export default GEOConnectivitySection;
