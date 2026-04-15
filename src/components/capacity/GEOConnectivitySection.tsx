import { memo, useState, useMemo, useEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
}) => {
  const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const isStarForward = linkMode === 'STAR_FORWARD';

  // Active MESH direction tab — controlled by parent (App) when provided so the
  // globe can reflect the same direction. Falls back to internal state otherwise.
  const [internalMeshTab, setInternalMeshTab] = useState<'forward' | 'reverse'>('forward');
  useEffect(() => { setInternalMeshTab('forward'); }, [linkMode]);
  const activeMeshTab = controlledMeshTab ?? internalMeshTab;
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
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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

      {candidateCoverages.length > 0 && (() => {
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
            />
          </div>
        );
      })()}

      <div className="space-y-4">
        {/* Dual-segment RF budget */}
        <DualSegmentPanel
          linkMode={linkMode}
          result={dualSegmentResult}
          activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
          onMeshTabChange={isMeshOrP2P ? setActiveMeshTab : undefined}
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
          defaultOpen={true}
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
