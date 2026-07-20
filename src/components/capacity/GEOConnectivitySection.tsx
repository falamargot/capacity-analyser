import { memo, useState, useMemo, useEffect, type ReactNode } from 'react';
import { Route } from 'lucide-react';
import { SectionTooltip } from '../SectionTooltip';
import CoverageSelector from '../CoverageSelector';
import CollapsibleSection from '../layout/CollapsibleSection';
import TerminalConfig, { type WeatherType } from './TerminalConfig';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
import type { TerminalType, TerminalRFClassId, TerminalRFCustomParams } from './TerminalConfig';
import type { LinkMode } from '../../types/linkMode';
import DualSegmentPanel from './DualSegmentPanel';
import type { DualSegmentResult } from '../../utils/geoDualSegmentBudget';
import LinkModeSelector from './LinkModeSelector';
import type { ResolvedGeoGateway, StarTrafficGatewayResolution } from '../../utils/geoConnectivityModel';
import { getGatewayTrafficStatusNote, getPrimaryControlRoleLabel } from '../globe/GlobeConfig';
import { formatCoordinates } from '../../utils/formatters';
import { buildGeoConfidence, type PredictionConfidence } from '../../utils/predictionConfidence';
import { estimateGeoSatelliteCapacity } from '../../utils/geoCapacityModel';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from '../../utils/linkAvailabilityContext';
import { isEngineeringDeliveryState, type EngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';
import { fmtDb, fmtMbps, fmtMs } from '../../utils/engineeringFormat';
import { ENGINEERING_TERMS } from '../../constants/engineeringTerminology';
import LatencyBreakdownCard from './shared/LatencyBreakdownCard';
import LayerHeading from './shared/LayerHeading';
import EngineeringResultSummary from './shared/EngineeringResultSummary';
import { EngineeringDeliveryEvidence, EngineeringEvidenceSummary, EngineeringRfDecisionEvidence, EngineeringScenarioEvidence } from './shared/EngineeringStageEvidence';

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

interface GeoLinkBudgetEvidenceProps {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  activeMeshTab?: 'forward' | 'reverse';
  onMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  satelliteName?: string;
  satellite?: SatelliteData | null;
  viewModel?: EngineeringAnalysisViewModel;
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

const GeoLinkBudgetEvidence = ({
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
  viewModel: providedViewModel,
}: GeoLinkBudgetEvidenceProps) => {
  const viewModel = providedViewModel ?? buildGeoEngineeringAnalysisViewModel({
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
    <div className="min-w-0 space-y-2.5" data-engineering-embedded-evidence={viewModel.mode}>
      <EngineeringRfDecisionEvidence viewModel={viewModel} />
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
      {result?.trafficTeleportEndpoint && (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-cyan-50/70 p-2.5 dark:border-cyan-500/20 dark:bg-cyan-500/10">
          <LayerHeading
            title="RF Ground Capability"
            detail="Traffic teleport capability used by the active STAR RF calculation."
          />
          <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-cyan-950 dark:text-cyan-50 sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <span className="text-cyan-700 dark:text-cyan-200/80">Physical site</span>
              <span className="font-semibold">{result.trafficTeleportEndpoint.label}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-cyan-700 dark:text-cyan-200/80">Capability</span>
              <span className="font-semibold">{result.trafficTeleportEndpoint.capability.kind}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-cyan-700 dark:text-cyan-200/80">Capability ID</span>
              <span className="font-semibold">{result.trafficTeleportEndpoint.capability.capabilityId}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-cyan-700 dark:text-cyan-200/80">Traffic confidence</span>
              <span className="font-semibold">{result.trafficTeleportEndpoint.capability.confidence}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-cyan-700 dark:text-cyan-200/80">Traffic eligibility</span>
              <span className="font-semibold">{result.trafficTeleportEndpoint.capability.trafficEligibility}</span>
            </div>
          </div>
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

// ─── Main component ───────────────────────────────────────────────────────────

interface GEOConnectivitySectionProps {
  engineeringAnalysisViewModel: EngineeringAnalysisViewModel;
  showConfigurationControls?: boolean;
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
  /** Active link connectivity mode — drives the dual-segment display. */
  linkMode?: LinkMode;
  onLinkModeChange?: (mode: LinkMode) => void;
  /** Dual-segment RF budget computed by geoDualSegmentBudget. Null when no path is found. */
  dualSegmentResult?: DualSegmentResult | null;
  /** STAR-only traffic gateway selection resolved from the active beam when available. */
  starTrafficGatewaySelection?: StarTrafficGatewayResolution | null;
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
}

// Speed of light used for propagation delay (km/ms)
const SPEED_OF_LIGHT_KM_PER_MS = 299.792458;

const GEOConnectivitySection = memo<GEOConnectivitySectionProps>(({
  engineeringAnalysisViewModel,
  showConfigurationControls = false,
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
  linkMode = 'STAR_FORWARD',
  onLinkModeChange,
  dualSegmentResult = null,
  starTrafficGatewaySelection = null,
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
    gatewayResolved: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ||
      ((linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN')
        ? !!starTrafficGatewaySelection?.gateway
        : !!geoGeometry?.satelliteToGateway.resolvedGateway),
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
  const starTrafficGateway = !isMeshOrP2P && (isStarForward || isStarReturn)
    ? starTrafficGatewaySelection
    : null;
  const resolvedGateway = geoGeometry?.satelliteToGateway.resolvedGateway ?? null;
  const isFailoverGateway = starTrafficGateway?.beamRoute?.routingMode === 'FAILOVER';
  // Outage-unserved: the beam's nominal (and failover) site is out of service and
  // no other gateway can physically carry this beam.
  const isGatewayOutageUnserved = starTrafficGateway?.diagnostic.source === 'gateway-outage';
  const gatewayName = starTrafficGateway?.gateway?.name ??
    resolvedGateway?.gatewayName ??
    geoGeometry?.satelliteToGateway.gateway?.name ??
    'Gateway';
  const gatewayRole = starTrafficGateway ? null : resolvedGateway?.controlAssignmentRole ?? null;
  const gatewayDisplayName = isGatewayOutageUnserved
    ? 'Gateway out of service'
    : isFailoverGateway
    ? `${gatewayName} (failover)`
    : gatewayRole
    ? `${gatewayName} (${gatewayRole})`
    : gatewayName;
  const gatewayTrafficStatusNote = starTrafficGateway
    ? starTrafficGateway.gateway
      ? getGatewayTrafficStatusNote(starTrafficGateway.gateway.trafficStatus)
      : null
    : resolvedGateway
    ? getGatewayTrafficStatusNote(resolvedGateway.gateway.trafficStatus)
    : null;
  const gatewayStatusTitle = starTrafficGateway
    ? starTrafficGateway.diagnostic.source === 'gateway-outage'
      ? `Gateway outage: ${starTrafficGateway.diagnostic.message}`
      : starTrafficGateway.diagnostic.source === 'beam-gateway-assignment'
      ? isFailoverGateway
        ? `Failover gateway assignment: ${starTrafficGateway.diagnostic.message}`
        : `Beam gateway assignment: ${starTrafficGateway.diagnostic.message}`
      : `Legacy gateway fallback: ${starTrafficGateway.diagnostic.message}`
    : gatewayTrafficStatusNote ?? 'Resolved automatically';
  // Ground-infra role of the specific resolved site (SCC nominal/backup/monitoring),
  // used only where a single resolved site is actually being labeled (the gateway
  // identity cards below) — distinct from ENGINEERING_TERMS.GEO.gateway, which is
  // the neutral generic noun used in structural/non-site-specific copy.
  const gatewayInfraRoleLabel = starTrafficGateway
    ? ENGINEERING_TERMS.GEO.gateway
    : resolvedGateway
    ? getPrimaryControlRoleLabel(resolvedGateway.gateway.roles)
    : ENGINEERING_TERMS.GEO.gateway;
  const pointACoordinatesLabel = activePoint ? formatCoordinates(activePoint) : '--';
  const pointBCoordinatesLabel = pointB ? formatCoordinates(pointB) : 'Shift+click to place';
  const gatewayCoordinatesLabel = starTrafficGateway?.gateway
    ? formatCoordinates({ lat: starTrafficGateway.gateway.lat, lng: starTrafficGateway.gateway.lng })
    : resolvedGateway
    ? formatCoordinates({ lat: resolvedGateway.latitude, lng: resolvedGateway.longitude })
    : null;
  const gatewaySideLabel = gatewayName === 'Gateway'
    ? `${ENGINEERING_TERMS.GEO.gateway} side - reference allocation`
    : `${ENGINEERING_TERMS.GEO.gateway} side - ${gatewayName}`;
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

    const elevA = fwUl.elevation;
    const elevB = fwDl.elevation;

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
    };
  }, [isMeshOrP2P, dualSegmentResult]);
  const meshUnavailableMessage = pointB
    ? `No ${meshDirectionLabel} GEO path available for the active topology.`
    : 'Place Point B to compute MESH link performance';

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
          // GEO traffic gateway side: mirror the sidebar row exactly.
          uplink: gatewaySideLabel,
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
          // GEO traffic gateway side: mirror the sidebar row exactly.
          downlink: gatewaySideLabel,
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
    gatewaySideLabel,
    linkMode,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverage,
    uplinkCoverageAtB,
  ]);

  const headlineLatencyMs = isMeshOrP2P
    ? (meshGeometry ? (activeMeshTab === 'reverse' ? meshGeometry.rvTotalMs : meshGeometry.fwTotalMs) : null)
    : geoStarOneWayTotalMs;
  const headlineLatencyLabel = isMeshOrP2P ? `${meshDirectionLabel} latency` : `${starDirectionLabel} latency`;
  const scenarioEvidence = (
    <EngineeringScenarioEvidence facts={[
      { label: 'Topology', value: linkMode.replaceAll('_', ' ') },
      { label: 'Selected satellite', value: drawerSatelliteName ?? '--' },
      { label: 'Site A terminal', value: rfPresetDisplayLabelA ?? terminalType },
      ...(isMeshOrP2P ? [{ label: 'Site B terminal', value: rfPresetDisplayLabelB ?? terminalTypeB ?? '--' }] : []),
      { label: 'Weather', value: `${weatherType}${autoWeatherEnabled ? ' · automatic' : ' · manual'}` },
      { label: 'Uplink coverage', value: formatCoverageName(selectedUplinkCoverage) ?? '--' },
      { label: 'Downlink coverage', value: formatCoverageName(selectedDownlinkCoverage) ?? '--' },
      ...(!isMeshOrP2P ? [{ label: ENGINEERING_TERMS.GEO.gateway, value: gatewayName }] : []),
    ]} />
  );
  const geoPathRouteLabel = isMeshOrP2P
    ? `${meshGeometry?.pointALabel ?? 'Site A'} → ${drawerSatelliteName ?? 'GEO satellite'} → ${meshGeometry?.pointBLabel ?? 'Site B'}`
    : `${isStarReturn ? userLabel : gatewayDisplayName} → ${drawerSatelliteName ?? 'GEO satellite'} → ${isStarReturn ? gatewayDisplayName : userLabel}`;
  const pathSummaryEvidence = (
    <EngineeringEvidenceSummary
      ariaLabel="GEO route summary"
      variant="path"
      facts={[
        { label: 'Route', value: geoPathRouteLabel },
        { label: 'Propagation', value: radioPathSummary },
        { label: 'Direction', value: isMeshOrP2P ? meshDirectionLabel : starDirectionLabel },
      ]}
    />
  );
  const scenarioConfigureEvidence = showConfigurationControls && onLinkModeChange ? (
    <div className="mb-3">
      <LinkModeSelector linkMode={linkMode} onChange={onLinkModeChange} />
    </div>
  ) : null;
  if (!isEngineeringDeliveryState(engineeringAnalysisViewModel.truth.state)) {
    const showRfEvidence = engineeringAnalysisViewModel.truth.state === 'blocked'
      || engineeringAnalysisViewModel.truth.state === 'budget-unavailable';
    return (
      <>
        <EngineeringResultSummary
          technology="GEO"
          truth={engineeringAnalysisViewModel.truth}
          stageSummaries={{ path: pathSummaryEvidence }}
          stageEvidence={showRfEvidence ? {
            scenario: <>{scenarioEvidence}{scenarioConfigureEvidence}</>,
            rf: (
            <GeoLinkBudgetEvidence
              linkMode={linkMode}
              result={dualSegmentResult}
              activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
              onMeshTabChange={isMeshOrP2P ? setActiveMeshTab : undefined}
              satelliteName={drawerSatelliteName}
              satellite={resolvedGEOConnectivity?.satellite ?? null}
              viewModel={engineeringAnalysisViewModel}
              coverageLabels={linkBudgetCoverageLabels}
            />
            ),
            delivery: <EngineeringDeliveryEvidence viewModel={engineeringAnalysisViewModel} />,
          } : scenarioConfigureEvidence ? { scenario: scenarioConfigureEvidence } : undefined}
        />
      </>
    );
  }
  const scenarioAccessEvidence = showConfigurationControls ? (
    <>
      <LayerHeading title="Terminal Configuration" detail="RF class, custom parameters and weather per site." />

      <div className="mb-3 mt-1.5">
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
                  statusTitle={gatewayStatusTitle}
	                  readOnly
	                  terminalDisplayLabel={gatewayInfraRoleLabel}
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
                  statusTitle={gatewayStatusTitle}
	                  readOnly
	                  terminalDisplayLabel={gatewayInfraRoleLabel}
	                  terminalDisplayIcon="📡"
	                  showMaxLabel={false}
	                />
              </>
            )}
          </div>
        )}
      </div>
    </>
  ) : null;
  const scenarioSpaceEvidence = (
      <div className="space-y-2.5">
      <LayerHeading title="Coverage & Path Selection" detail="Resolved path plus manual coverage overrides." />

      {!isMeshOrP2P && (
        <div className="mb-3 mt-1.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900/60">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Resolved traffic path</div>
          <div className="mt-1 font-semibold text-slate-900 dark:text-slate-100">{gatewaySideLabel}</div>
          <div className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{gatewayStatusTitle}</div>
          {starTrafficGateway?.trafficCapability?.capabilityId && (
            <div className="mt-0.5 font-mono text-[10px] leading-4 text-slate-500 dark:text-slate-400">{starTrafficGateway.trafficCapability.capabilityId}</div>
          )}
          {gatewayTrafficStatusNote && <div className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{gatewayTrafficStatusNote}</div>}
        </div>
      )}

      {showConfigurationControls && candidateCoverages.length > 0 && (!isMeshOrP2P || candidateCoveragesB.length > 0) && (() => {
        // In MESH/P2P the uplink and downlink candidates swap with the active direction:
        //   A→B: uplink = A-side (selectable), downlink = B-side (display only)
        //   B→A: uplink = B-side (display only), downlink = A-side (selectable)
        const isReverse = isMeshOrP2P && activeMeshTab === 'reverse';
        const bUplinks   = candidateCoveragesB.filter(c =>  c.isUplink);
        const bDownlinks = candidateCoveragesB.filter(c => !c.isUplink);
        return (
          <div className="mb-3 mt-1.5">
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
      </div>
  );
  const pathDetailEvidence = (
    <div data-engineering-path-detail="">
        {/* Radio Path */}
        <CollapsibleSection
          storageKey="geo-radio-path"
          title={
            isMeshOrP2P
              ? <> Radio Path <DirectionPill dir={meshDirectionLabel} /><SectionTooltip content="Terminal-to-terminal signal route follows the active MESH/P2P direction through the GEO satellite. No traffic gateway is in the RF path. Shows elevation, slant range and propagation delay for each hop." /></>
              : <> Radio Path <DirectionPill dir={starDirectionLabel} /><SectionTooltip content="Active one-way STAR signal route. Forward mode is Traffic Gateway → GEO Satellite → User; Return mode is User → GEO Satellite → Traffic Gateway. Round-trip reference details are shown in the latency breakdown below." /></>
          }
          subtitle={radioPathSummary}
          accentColor="#2563eb"
          collapsible={false}
        >
          {isMeshOrP2P ? (
            // ── MESH/P2P: A → Sat → B (no traffic gateway) ─────────────────
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
                <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-2.5 min-w-0">
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
                    <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
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
                  <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-2.5 min-w-0">
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
                      <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
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
    </div>
  );
  const deliveryDetailEvidence = (
        <div className="space-y-2.5">
        <LayerHeading title="End-to-End Analysis" detail="Throughput, latency, availability and limiting factor." />
        {/* Latency Breakdown */}
        {isMeshOrP2P ? (
          // ── MESH/P2P: selected one-way terminal path, no traffic gateway overhead ─
          <LatencyBreakdownCard
            storageKey="geo-latency-breakdown"
            accentColor="#2563eb"
            collapsible={false}
            title={<>Latency breakdown<DirectionPill dir={meshDirectionLabel} /></>}
            tooltip="One-way propagation for the selected MESH/P2P direction: source terminal → satellite → destination terminal. No traffic gateway is in the RF path; overhead is source + destination modem processing."
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
                <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                  <span>One-way propagation</span><span>{selectedPropagationMs.toFixed(1)} ms</span>
                </div>
                <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead</div>
                <div className="ml-2 flex justify-between"><span>Modem processing ({src} + {dst})</span><span>{meshGeometry.modemOverheadMs.toFixed(0)} ms</span></div>
                <div className="ml-2 text-[10px] text-gray-400 dark:text-gray-500 italic">No traffic gateway - traffic gateway processing and routing delays do not apply.</div>
                <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
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
          // ── STAR: one-way via traffic gateway ────────────────────────────
          <LatencyBreakdownCard
            storageKey="geo-latency-breakdown"
            accentColor="#2563eb"
            collapsible={false}
            title={`Latency breakdown (${isStarReturn ? 'RETURN' : 'FORWARD'})`}
            tooltip="Breakdown of the active one-way STAR delay. Forward mode sends Traffic Gateway → Satellite → User; Return mode sends User → Satellite → Traffic Gateway. Network overhead is added after RF propagation."
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
                  <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                    <span>Propagation total</span><span>{oneWayPropagationMs != null ? oneWayPropagationMs.toFixed(1) : '--'} ms</span>
                  </div>
                  <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead</div>
                  <div className="ml-2 flex justify-between"><span>Traffic gateway processing delay</span><span>{geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{geoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
                  <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                    <span>Network overhead total</span><span>{geoGeometry.overheadMs.total.toFixed(1)} ms</span>
                  </div>
                  <div className="border-t border-gray-200/70 dark:border-slate-700/70 pt-1.5 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
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
        </div>
  );
  return (
    <>

      <EngineeringResultSummary
        technology="GEO"
        truth={engineeringAnalysisViewModel.truth}
        stageSummaries={{ path: pathSummaryEvidence }}
        stageEvidence={{
          scenario: <>{scenarioEvidence}{scenarioConfigureEvidence}{scenarioAccessEvidence}{scenarioSpaceEvidence}</>,
          rf: (
            <GeoLinkBudgetEvidence
              linkMode={linkMode}
              result={dualSegmentResult}
              activeMeshTab={isMeshOrP2P ? activeMeshTab : undefined}
              onMeshTabChange={isMeshOrP2P ? setActiveMeshTab : undefined}
              satelliteName={drawerSatelliteName}
              satellite={resolvedGEOConnectivity?.satellite ?? null}
              viewModel={engineeringAnalysisViewModel}
              latencyMs={headlineLatencyMs}
              latencyLabel={headlineLatencyLabel}
              availabilityLabel={`${availabilityContext.indicativeAvailabilityPct.toFixed(1)}% indicative`}
              confidenceLabel={`${geoPredictionConfidence.level} ${geoPredictionConfidence.score}/100`}
              confidenceDetail={[geoPredictionConfidence.summary, geoPredictionConfidence.reasons[0] ?? geoPredictionConfidence.limitation].filter(Boolean).join('. ')}
              confidence={geoPredictionConfidence}
              coverageLabels={linkBudgetCoverageLabels}
            />
          ),
          path: pathDetailEvidence,
          delivery: <EngineeringDeliveryEvidence viewModel={engineeringAnalysisViewModel}>{deliveryDetailEvidence}</EngineeringDeliveryEvidence>,
        }}
      />

    </>
  );
});

GEOConnectivitySection.displayName = 'GEOConnectivitySection';
export default GEOConnectivitySection;
