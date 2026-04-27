import { memo, useState, useMemo, useEffect, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, ChevronDown, Gauge, Maximize2, Route, X } from 'lucide-react';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import CoverageSelector from '../CoverageSelector';
import CollapsibleSection from '../layout/CollapsibleSection';
import TerminalConfig, { TERMINAL_PROFILES, type WeatherType } from './TerminalConfig';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
import type { TerminalType } from './TerminalConfig';
import type { LinkMode } from '../../types/linkMode';
import DualSegmentPanel from './DualSegmentPanel';
import type { DualSegmentResult } from '../../utils/geoDualSegmentBudget';
import LinkModeSelector from './LinkModeSelector';

// ─── Sub-component: LatencyBreakdownCard ──────────────────────────────────────

interface LatencyBreakdownCardProps {
  accentColor: string;
  summary: string;
  title?: string;
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

const fmtMs = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${Math.round(v)} ms` : '--';

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

interface LinkBudgetSummaryCardProps {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  rttMs: number | null;
  routeLabel: string;
  activeMeshTab?: 'forward' | 'reverse';
  onOpen: () => void;
}

const LinkBudgetSummaryCard = ({
  linkMode,
  result,
  rttMs,
  routeLabel,
  activeMeshTab = 'forward',
  onOpen,
}: LinkBudgetSummaryCardProps) => {
  const direction = result
    ? (activeMeshTab === 'reverse' && result.reverse ? result.reverse : result.forward)
    : null;
  const e2e = direction?.endToEnd ?? null;
  const uplink = direction?.uplink ?? null;
  const downlink = direction?.downlink ?? null;
  const limiting = e2e?.limitingSegment === 'uplink' ? 'Uplink' : e2e?.limitingSegment === 'downlink' ? 'Downlink' : '--';
  const margin = e2e?.endToEndLinkMarginDb;
  const tone = linkMarginTone(margin);
  const satelliteName = uplink?.candidate.satelliteName ?? downlink?.candidate.satelliteName ?? 'No GEO path';
  const band = uplink?.candidate.band ?? downlink?.candidate.band ?? 'Band --';
  const beamName = uplink?.candidate.beamName ?? downlink?.candidate.beamName ?? uplink?.candidate.coverageName ?? downlink?.candidate.coverageName ?? '--';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 bg-slate-50/80 px-3.5 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.className}`}>
                {tone.label}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                Link Budget
              </span>
            </div>
            <h4 className="mt-1.5 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
              {satelliteName}
            </h4>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {band} · {beamName}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            aria-label="Open detailed link budget"
            title="Open detailed link budget"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
          <Route className="h-4 w-4 shrink-0 text-blue-500" />
          <span className="min-w-0 truncate">{routeLabel}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-slate-800 sm:grid-cols-4">
        {[
          { label: 'Throughput', value: fmtMbps(e2e?.endToEndThroughputMbps), icon: Gauge },
          { label: 'RTT', value: fmtMs(rttMs), icon: Activity },
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
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        <span className="truncate">
          {linkMode === 'MESH' || linkMode === 'POINT_TO_POINT'
            ? `Direction ${activeMeshTab === 'reverse' ? 'B -> A' : 'A -> B'}`
            : 'Selected topology budget'}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 font-semibold text-blue-600 transition-colors hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
        >
          Details
        </button>
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
}: LinkBudgetDrawerProps) => {
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
    <div className="fixed inset-0 z-[80] bg-slate-950/35 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Detailed GEO link budget">
      <div className="absolute inset-y-0 right-0 flex w-full justify-end sm:pl-10">
        <div className="flex h-full w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-blue-500 dark:text-blue-300">GEO Link Budget</p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
                {satelliteName ?? result?.forward.uplink.candidate.satelliteName ?? 'Detailed RF path'}
              </h3>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Full segment budget, unchanged from the calculation engine.
              </p>
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
              coverageLabels={coverageLabels}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface DirectionArrowControlProps {
  direction: 'forward' | 'reverse';
  interactive?: boolean;
  onToggle?: () => void;
}

const DirectionArrowControl = ({ direction, interactive = false, onToggle }: DirectionArrowControlProps) => (
  <div className="flex items-center justify-center">
    <button
      type="button"
      onClick={interactive ? onToggle : undefined}
      disabled={!interactive}
      className={[
        'inline-flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-1 transition-colors',
        interactive
          ? 'bg-blue-600 text-white ring-blue-500/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
          : 'cursor-default bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700',
      ].join(' ')}
      aria-label={interactive
        ? direction === 'forward'
          ? 'Switch direction to Terminal B to Terminal A'
          : 'Switch direction to Terminal A to Terminal B'
        : direction === 'forward'
          ? 'Forward direction'
          : 'Reverse direction'}
      title={interactive
        ? direction === 'forward'
          ? 'A -> B. Click to reverse.'
          : 'B -> A. Click to reverse.'
        : direction === 'forward'
          ? 'Forward direction'
          : 'Reverse direction'}
    >
      {direction === 'forward' ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
    </button>
  </div>
);

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
  pointAIsUserDefined?: boolean;
  pointBIsUserDefined?: boolean;
  /** Coverage candidates at Point B — MESH / P2P only. */
  candidateCoveragesB?: CandidateCoverage[];
  /** Best uplink coverage at Point B (auto-selected). */
  uplinkCoverageAtB?: CandidateCoverage | null;
  /** Best downlink coverage at Point B (auto-selected). */
  downlinkCoverageAtB?: CandidateCoverage | null;
  /** When provided, only satellites whose ID is in this set appear in the satellite dropdown. */
  validSatelliteIds?: ReadonlySet<string>;
}

const RTT_VISUAL_SCALE_MAX_MS = 600;

// Speed of light used for propagation delay (km/ms)
const SPEED_OF_LIGHT_KM_PER_MS = 299.792458;

const GEOConnectivitySection = memo<GEOConnectivitySectionProps>(({
  resolvedGEOConnectivity,
  geoGeometry,
  calculateGEOPerformance,
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
  analysisSource,
  aircraftCallsign,
  onSatelliteClick,
  showEstimatedPerformance = true,
  linkMode = 'STAR_FORWARD',
  onLinkModeChange,
  dualSegmentResult = null,
  pointAIsUserDefined = false,
  pointBIsUserDefined = false,
  terminalTypeB,
  onTerminalTypeBChange,
  candidateCoveragesB = [],
  uplinkCoverageAtB = null,
  downlinkCoverageAtB = null,
  activeMeshTab: controlledMeshTab,
  onActiveMeshTabChange,
  validSatelliteIds,
}) => {
  const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const isStarForward = linkMode === 'STAR_FORWARD';

  // Active MESH direction tab. Uses local state for immediate UI feedback;
  // syncs to the controlled prop from App so the globe stays in sync.
  const [internalMeshTab, setInternalMeshTab] = useState<'forward' | 'reverse'>(controlledMeshTab ?? 'forward');
  const [isLinkBudgetDrawerOpen, setIsLinkBudgetDrawerOpen] = useState(false);
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
  const setActiveMeshTab = (tab: 'forward' | 'reverse') => {
    setInternalMeshTab(tab);
    onActiveMeshTabChange?.(tab);
  };
  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
  const showPerformanceBeforeRadioPath = analysisSource !== 'aircraft';
  const gatewayName = geoGeometry?.satelliteToGateway.gateway?.name ?? 'Gateway';

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
      // Per-direction throughput
      forwardThroughputMbps: dualSegmentResult.forward.endToEnd.endToEndThroughputMbps,
      reverseThroughputMbps: dualSegmentResult.reverse?.endToEnd.endToEndThroughputMbps ?? null,
    };
  }, [isMeshOrP2P, dualSegmentResult]);

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="geo-performance"
      title={<>Estimated Performance<SectionTooltip content="Predicted GEO link throughput and end-to-end RTT derived from the selected GEO link budget and terminal caps. RTT remains dominated by the ~35,786 km GEO orbital altitude." /></>}
      accentColor="#2563eb"
      defaultOpen={true}
      collapsible={false}
    >
      {isMeshOrP2P ? (
        // MESH/P2P: derive performance from the dual-segment RF budget directly.
        // RTT = 4 propagation hops (A→Sat→B→Sat→A) + 2×modem overhead.
        // No gateway processing or routing delay — there is no gateway in the RF path.
        meshGeometry ? (() => {
          const isForward = activeMeshTab === 'forward';
          const srcLabel = isForward ? 'A' : 'B';
          const dstLabel = isForward ? 'B' : 'A';
          const throughput = isForward
            ? meshGeometry.forwardThroughputMbps
            : (meshGeometry.reverseThroughputMbps ?? meshGeometry.forwardThroughputMbps);
          return (
            <PerformancePanel
              rtt={meshGeometry.rttTotalMs}
              downlinkGbps={throughput / 1000}
              uplinkGbps={throughput / 1000}
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              stability={meshGeometry.isUnstable ? 'Unstable' : meshGeometry.stability}
              performanceFactor={1}
              accentColor="#2563eb"
              rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
              rttLabel={`RTT (A ↔ B) — showing ${srcLabel}→${dstLabel} direction`}
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
        (() => {
          const performance = calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
          const geoStabilityTooltip = formatGeoStabilityTooltip(
            geoGeometry.userToSatellite.elevationDeg,
            geoGeometry.isUserLinkUnstable,
          );
          return (
            <PerformancePanel
              rtt={geoGeometry.rttTotalMs}
              downlinkGbps={performance.downlinkGbps}
              uplinkGbps={performance.uplinkGbps}
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              stability={geoGeometry.isUserLinkUnstable ? 'Unstable' : performance.stability}
              performanceFactor={performance.performanceFactor}
              accentColor="#2563eb"
              rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
              rttLabel="End-to-End GEO RTT"
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

  const budgetRouteLabel = useMemo(() => {
    const satelliteName = dualSegmentResult?.forward.uplink.candidate.satelliteName
      ?? resolvedGEOConnectivity?.satellite.name
      ?? 'GEO satellite';

    if (isMeshOrP2P) {
      const pointALabel = meshGeometry?.pointALabel ?? 'Terminal A';
      const pointBLabel = meshGeometry?.pointBLabel ?? 'Terminal B';
      return activeMeshTab === 'reverse'
        ? `${pointBLabel} -> ${satelliteName} -> ${pointALabel}`
        : `${pointALabel} -> ${satelliteName} -> ${pointBLabel}`;
    }

    return linkMode === 'STAR_RETURN'
      ? `${userLabel} -> ${satelliteName} -> ${gatewayName}`
      : `${gatewayName} -> ${satelliteName} -> ${userLabel}`;
  }, [
    activeMeshTab,
    dualSegmentResult,
    gatewayName,
    isMeshOrP2P,
    linkMode,
    meshGeometry,
    resolvedGEOConnectivity,
    userLabel,
  ]);

  const budgetRttMs = isMeshOrP2P
    ? meshGeometry?.rttTotalMs ?? null
    : geoGeometry?.rttTotalMs ?? null;

  const drawerSatelliteName = dualSegmentResult?.forward.uplink.candidate.satelliteName
    ?? resolvedGEOConnectivity?.satellite.name;

  const formatCoverageName = (coverage: CandidateCoverage | null | undefined): string | undefined => {
    if (!coverage) return undefined;
    const name = coverage.coverageName || coverage.beamName || coverage.satelliteName;
    return coverage.isSynthesized ? `${name} (estimated)` : name;
  };

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
            <div className="grid grid-cols-1 items-stretch gap-1.5 xl:grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)]">
              <TerminalConfig
                terminalType={terminalType}
                onTerminalTypeChange={onTerminalTypeChange}
                weatherType={weatherType}
                onWeatherTypeChange={onWeatherTypeChange}
                autoWeatherEnabled={autoWeatherEnabled}
                onAutoWeatherChange={onAutoWeatherChange}
                analysisSource={analysisSource}
                compact
                showWeather={false}
                className="mb-0"
                title="Terminal A"
                stacked
                tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
              />
              <DirectionArrowControl
                direction={candidateCoveragesB.length > 0 ? activeMeshTab : 'forward'}
                interactive={candidateCoveragesB.length > 0}
                onToggle={() => setActiveMeshTab(activeMeshTab === 'forward' ? 'reverse' : 'forward')}
              />
              <TerminalConfig
                terminalType={terminalTypeB}
                onTerminalTypeChange={onTerminalTypeBChange}
                weatherType={weatherType}
                onWeatherTypeChange={onWeatherTypeChange}
                autoWeatherEnabled={autoWeatherEnabled}
                onAutoWeatherChange={onAutoWeatherChange}
                compact
                showWeather={false}
                className="mb-0"
                title="Terminal B"
                stacked
                tone={pointBIsUserDefined ? 'user-defined' : 'not-user-defined'}
                statusLabel={pointBIsUserDefined ? 'Manual' : 'Unset'}
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-1 items-stretch gap-1.5 xl:grid-cols-[minmax(0,1fr)_34px_minmax(0,1fr)]">
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
                  stacked
                  tone="user-defined"
                  statusLabel="Auto"
                  statusTitle="Resolved automatically"
                  readOnly
                  terminalDisplayLabel="Gateway"
                  terminalDisplayIcon="📡"
                />
                <DirectionArrowControl direction="forward" />
                <TerminalConfig
                  terminalType={terminalType}
                  onTerminalTypeChange={onTerminalTypeChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  compact
                  showWeather={false}
                  className="mb-0"
              title={userLabel === 'User' ? 'Terminal' : userLabel}
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
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  compact
                  showWeather={false}
                  className="mb-0"
                  title={userLabel === 'User' ? 'Terminal' : userLabel}
                  stacked
                  tone={pointAIsUserDefined ? 'user-defined' : 'not-user-defined'}
                  statusLabel={pointAIsUserDefined ? 'Manual' : 'Auto'}
                />
                <DirectionArrowControl direction="forward" />
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
              onSelectUplinkCoverage={isMeshOrP2P ? (isReverse ? undefined : onSelectUplinkCoverage) : onSelectUplinkCoverage}
              onSelectDownlinkCoverage={isMeshOrP2P ? (isReverse ? onSelectDownlinkCoverage : undefined) : onSelectDownlinkCoverage}
              uplinkCandidatesOverride={isMeshOrP2P ? (isReverse ? bUplinks   : undefined) : undefined}
              downlinkCandidatesOverride={isMeshOrP2P ? (isReverse ? undefined : bDownlinks) : undefined}
              validSatelliteIds={validSatelliteIds}
            />
          </div>
        );
      })()}

      <div className="space-y-4">
        <LinkBudgetSummaryCard
          linkMode={linkMode}
          result={dualSegmentResult}
          rttMs={budgetRttMs}
          routeLabel={budgetRouteLabel}
          activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
          onOpen={() => setIsLinkBudgetDrawerOpen(true)}
        />

        <LinkBudgetDrawer
          open={isLinkBudgetDrawerOpen}
          onClose={() => setIsLinkBudgetDrawerOpen(false)}
          linkMode={linkMode}
          result={dualSegmentResult}
          activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
          onMeshTabChange={isMeshOrP2P ? setActiveMeshTab : undefined}
          satelliteName={drawerSatelliteName}
          coverageLabels={linkBudgetCoverageLabels}
        />

        {showEstimatedPerformance && showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        {/* Radio Path */}
        <CollapsibleSection
          storageKey="geo-radio-path"
          title={
            isMeshOrP2P
              ? <> Radio Path <SectionTooltip content="Terminal-to-terminal signal route: Point A → GEO Satellite → Point B. No gateway in the RF path. Shows elevation, slant range and propagation delay for each hop." /></>
              : <> Radio Path <SectionTooltip content="End-to-end signal route: User → GEO Satellite → Ground Gateway and back. Shows elevation angle, slant range, and propagation delay per segment." /></>
          }
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
                  <div className="break-words leading-relaxed text-xs">
                    <span className="font-medium">{srcLabel}</span>
                    {' → '}
                    <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity?.satellite ?? null)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer">
                      {meshGeometry.satelliteName}
                    </button>
                    {' → '}
                    <span className="font-medium">{dstLabel}</span>
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
            // ── STAR Forward/Return: User → Sat → Gateway ────────────────────
            resolvedGEOConnectivity && geoGeometry ? (
              (() => {
                const gwName = geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible gateway';
                const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
                const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
                  ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
                  : null;
                return (
                  <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
                    <div className="break-words leading-relaxed">{userLabel} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer break-all">{resolvedGEOConnectivity.satellite.name}</button> → {gwName} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer break-all">{resolvedGEOConnectivity.satellite.name}</button> → {userLabel}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                      <div>
                        <div className="break-words">{userLabel} → {userToSatelliteLabel}</div>
                        <div className="pl-3 sm:pl-4 break-words">→ Elevation: {geoGeometry.userToSatellite.elevationDeg.toFixed(1)}° | Slant Range: {geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km ({geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)</div>
                      </div>
                      <div>
                        <div className="break-words">{gwName} → {resolvedGEOConnectivity.satellite.name}</div>
                        <div className="pl-3 sm:pl-4 break-words">→ Slant Range: {geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : '--'} ({geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : '--'})</div>
                      </div>
                      <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
                        <span>One-way propagation</span>
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
          // ── STAR: 4-hop via gateway ───────────────────────────────────────
          <LatencyBreakdownCard
            accentColor="#2563eb"
            tooltip="Breakdown of the full round-trip propagation delay over the GEO link: User → Satellite → Gateway → Satellite → User, plus network overhead. GEO propagation alone accounts for ~480 ms due to the 35,786 km orbital altitude."
            summary={geoGeometry ? `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms` : 'No GEO latency breakdown available'}
          >
            {geoGeometry ? (
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
                <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
                <div className="flex justify-between"><span>User {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms</span></div>
                <div className="flex justify-between"><span>Satellite {'->'} Gateway</span><span>{geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms</span></div>
                <div className="flex justify-between"><span>Gateway {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms</span></div>
                <div className="flex justify-between"><span>Satellite {'->'} User</span><span>{geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms</span></div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                  <span>RTT propagation</span><span>{geoGeometry.rttPropagationMs?.toFixed(1) ?? '--'} ms</span>
                </div>
                <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead components</div>
                <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
                <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
                <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{geoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
                <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                  <span>Network overhead total</span><span>{geoGeometry.overheadMs.total.toFixed(1)} ms</span>
                </div>
                <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                  <span>Estimated RTT total</span><span>{geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms</span>
                </div>
                {geoGeometry.warnings.length > 0 && (
                  <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                    {geoGeometry.warnings.map((warning, index) => (
                      <div key={`${warning}-${index}`}>Warning: {warning}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
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
