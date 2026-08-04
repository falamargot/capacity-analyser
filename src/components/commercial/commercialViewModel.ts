// Re-export all public types so existing consumers can continue to import from
// this module without change.
export type {
  CommercialCustomerServiceState,
  CommercialExecutiveSummary,
  CommercialRecommendation,
  CommercialRecommendationReasonCategory,
  CommercialRecommendedTechnology,
  CommercialRouteSegment,
  CommercialRouteSegmentStatus,
  CommercialRouteSegmentType,
  CommercialScenarioViewModel,
  CommercialStatus,
  CommercialTechnology,
  CommercialTechnologyOption,
} from './commercialTypes';

import type { CandidateCoverage, MobileAnalysisMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { SatelliteData } from '../../types/satellites';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import type { GeoRouteAnalysisViewModel } from '../../utils/geoRouteAnalysisViewModel';
import type { ActiveLeoRouteEvidence } from '../../utils/activeLeoRouteEvidence';
import {
  activeCanonicalDirection,
  canonicalRouteStateIsAvailable,
  canonicalRouteStateToCommercialStatus,
  type CanonicalRouteMetricSet,
} from '../../utils/canonicalRouteMetrics';
import type { GatewayTrafficStatus } from '../../utils/geoGroundInfrastructure';
import type { RegulatoryResult } from '../../services/regulatoryService';
import {
  buildGeoConfidence,
  buildLeoSingleSiteConfidence,
  type PredictionConfidence,
} from '../../utils/predictionConfidence';
import { estimateGeoSatelliteCapacity } from '../../utils/geoCapacityModel';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from '../../utils/linkAvailabilityContext';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  routeDirectionFromMeshTab,
} from '../../utils/activeRouteViewModel';
import { type TerminalType, type WeatherType } from '../capacity';
import type {
  CommercialPoint,
  CommercialRegulatoryConfidence,
  CommercialRouteSegment,
  CommercialRouteSegmentStatus,
  CommercialScenarioViewModel,
  CommercialTechnology,
  CommercialTechnologyOption,
} from './commercialTypes';
import {
  buildOptionStrengths,
  commercialStatusFromRoute,
  customerStateFromCommercial,
  customerStateFromSegment,
  finitePositive,
  formatMaybeMbps,
  geoStatusLabel,
  linkMarginLabel,
  locationName,
  routeLimitingFactor,
  satelliteSegmentStatus,
  segmentStatusFromCommercial,
  serviceStatusLabel,
  statusFromGeoStatus,
  statusFromServiceStatus,
  toCustomerLimitation,
  weatherLabel,
} from './commercialHelpers';
import { buildExecutiveSummary, buildRecommendation } from './commercialEngine';
import { buildCommercialCriteria } from './commercialCriteriaAdapter';
import {
  buildCommercialResilienceAssessment,
  buildGeoContentionEvidence,
  buildLeoContentionEvidence,
  buildOperationalEvidence,
} from './commercialOperationalEvidence';
import { formatNumber } from '../../utils/formatters';
import type {
  CommercialObjective,
  CommercialPrimaryTechnology,
  CommercialTrafficDirection,
} from './commercialObjective';

interface BuildCommercialScenarioViewModelInput {
  activeTechnology: 'LEO' | 'GEO';
  activeMeshTab: 'forward' | 'reverse';
  activeAnalysisPoint: CommercialPoint | null;
  activeAnalysisSource?: 'earth' | 'aircraft';
  siteB: CommercialPoint | null;
  nearestLocation?: { city: string; country: string } | null;
  nearestLocationB?: { city: string; country: string } | null;
  siteALabelOverride?: string | null;
  siteBLabelOverride?: string | null;
  selectedSnpName?: string | null;
  selectedSatellite: SatelliteData | null;
  activeGeoSatellite: SatelliteData | null;
  resolvedAutoLEO: SatelliteData | null;
  metrics: MobileAnalysisMetrics;
  /**
   * Canonical physical metrics shared with ENG. REQUIRED: COMM interprets them and
   * must never recompute or second-guess them. It was previously optional, and the
   * fallbacks behind that option quietly reconstructed the pre-canonical behaviour
   * (notably "STAR is always an estimated ceiling").
   */
  canonicalRouteMetrics: CanonicalRouteMetricSet;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  activeLeoRouteEvidence?: ActiveLeoRouteEvidence | null;
  geoPointStatus: GeoPointStatus | null;
  geoRouteAnalysis?: GeoRouteAnalysisViewModel | null;
  linkMode: LinkMode;
  selectedCoverage: CandidateCoverage | null;
  weatherType: WeatherType;
  weatherTypeB: WeatherType;
  leoTerminalType: TerminalType;
  geoTerminalType: TerminalType;
  originGeoTerminalLabel?: string;
  destinationGeoTerminalLabel?: string;
  originLeoTerminalLabel?: string;
  destinationLeoTerminalLabel?: string;
  geoGatewayName?: string | null;
  geoGatewayCoverage?: string | null;
  geoGatewayTrafficStatus?: GatewayTrafficStatus | null;
  /** Simulated LEO regulatory planning result. Never presented as legal clearance. */
  leoRegulatoryResult?: RegulatoryResult | null;
  commercialObjective?: CommercialObjective;
  commercialTrafficDirection?: CommercialTrafficDirection;
  commercialPrimaryTechnology?: CommercialPrimaryTechnology;
  selectedSegmentId?: string;
}

function regulatoryConfidenceFromPlanningResult(
  result: RegulatoryResult | null | undefined,
): CommercialRegulatoryConfidence | undefined {
  if (!result) return undefined;
  if (result.status === 'BLOCKED') return 'blocked';
  if (result.status === 'RESTRICTED') return 'restricted';
  if (result.status === 'ALLOWED_ESTIMATED') return 'estimated';
  if (result.status === 'ALLOWED' || result.status === 'ALLOWED_CONFIRMED') return 'confirmed';
  return 'pending';
}

function regulatoryRankForEvidence(value: CommercialRegulatoryConfidence | undefined): number | null {
  if (value === 'confirmed') return 4;
  if (value === 'estimated') return 3;
  if (value === 'restricted') return 2;
  if (value === 'pending') return 1;
  if (value === 'blocked') return 0;
  return null;
}

function commercialGatewayConfidenceLabel(status: GatewayTrafficStatus | null | undefined): string {
  if (status === 'CONFIRMED') return 'Confirmed traffic gateway';
  if (status === 'PUBLICLY_LIKELY') return 'Reference / unconfirmed traffic gateway';
  return 'No commercial gateway resolved';
}

function primaryFailingSegmentId(
  input: BuildCommercialScenarioViewModelInput,
  activeRouteAvailable: boolean,
  metricsComplete: boolean,
  satellite: SatelliteData | null,
  reason: string | undefined,
): CommercialRouteSegment['id'] | undefined {
  if (activeRouteAvailable && metricsComplete) return undefined;
  if (!input.activeAnalysisPoint) return 'access';
  const requiresTwoSites = input.leoTopologyMode === 'SITE_TO_SITE' || input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  if (requiresTwoSites && !input.siteB) return 'siteB';
  if (!satellite) return 'satellite';
  if (activeRouteAvailable && !metricsComplete) return 'summary';

  const normalized = (reason ?? '').toLowerCase();
  if (normalized.includes('site b') || normalized.includes('destination')) return 'siteB';
  if (normalized.includes('backhaul') || normalized.includes('gateway') || normalized.includes('snp') || normalized.includes('portal')) return 'backhaul';
  if (normalized.includes('satellite') || normalized.includes('coverage') || normalized.includes('beam')) return 'satellite';
  if (normalized.includes('rf') || normalized.includes('terminal') || normalized.includes('source') || normalized.includes('site a') || normalized.includes('regulatory')) return 'access';
  return 'summary';
}

function commercialEmptyState(input: BuildCommercialScenarioViewModelInput, activeRouteAvailable: boolean, activeRouteReason: string | null | undefined): string | undefined {
  const requiresTwoSites = input.leoTopologyMode === 'SITE_TO_SITE' || input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  if (!input.activeAnalysisPoint || (requiresTwoSites && !input.siteB)) {
    return 'Select two locations to compare connectivity options';
  }
  if (activeRouteAvailable) return undefined;
  if (activeRouteReason?.includes('GEO')) return 'GEO service unavailable. No active connectivity path was found.';
  if (activeRouteReason?.includes('LEO')) return 'LEO service unavailable. Alternative GEO service may remain available.';
  if (!input.metrics.geo && !input.activeLeoRouteEvidence?.metrics) return 'Waiting for route calculation';
  return 'No active connectivity path was found.';
}

function deriveDisplayTechnology(activeTechnology: 'LEO' | 'GEO'): 'LEO' | 'GEO' {
  return activeTechnology;
}

export function buildCommercialScenarioViewModel(input: BuildCommercialScenarioViewModelInput): CommercialScenarioViewModel {
  const activeDirection = routeDirectionFromMeshTab(input.activeMeshTab);
  const geoMetricsSource = input.geoRouteAnalysis
    ? {
        ...input.metrics,
        geo: input.geoRouteAnalysis.geoMetrics,
        mesh: input.geoRouteAnalysis.meshMetrics,
        geoSiteToSitePath: input.geoRouteAnalysis.geoSiteToSitePath,
      }
    : input.metrics;
  const geoStatusSource = input.geoRouteAnalysis?.geoStatus ?? input.geoPointStatus;
  const leoEvidence = input.activeLeoRouteEvidence ?? null;
  const leoRoutePath = leoEvidence?.routeResult ?? null;
  const leoMetricsSource = leoEvidence?.metrics ?? null;
  const leoRoute = buildLeoRouteViewModel({
    topologyMode: input.leoTopologyMode,
    direction: activeDirection,
    siteToSiteResult: leoRoutePath,
    metrics: leoMetricsSource,
  });
  const geoRoute = buildGeoRouteViewModel({
    linkMode: input.linkMode,
    direction: activeDirection,
    metrics: geoMetricsSource,
    geoStatus: geoStatusSource,
  });

  // ── Per-tech metrics — independent of which technology drives the narrative ──

  const siteAName = input.siteALabelOverride
    ?? locationName(input.nearestLocation, input.activeAnalysisPoint, 'Site A');
  const leoServiceStatus = input.leoTopologyMode === 'SITE_TO_SITE'
    ? (leoEvidence?.serviceStatus ?? leoRoutePath?.serviceStatus ?? null)
    : (leoEvidence?.serviceStatus ?? null);
  const leoRoutePending = !leoEvidence || leoEvidence.pending === true;
  const canonicalLeo = input.canonicalRouteMetrics.LEO;
  const canonicalGeo = input.canonicalRouteMetrics.GEO;
  const rawLeoCommercialStatus = canonicalRouteStateToCommercialStatus(canonicalLeo.state);
  const geoUsesRouteLevelAvailability = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  const geoRoutePending = input.geoRouteAnalysis?.pending === true;
  const rawGeoCommercialStatus = canonicalRouteStateToCommercialStatus(canonicalGeo.state);

  // Every customer-facing figure below is read straight off the canonical metrics.
  // `activeCanonicalDirection` is the single active-direction rule, so COMM and ENG
  // cannot disagree about which direction "the" latency belongs to.
  const leoDownloadMbps = finitePositive(canonicalLeo.forward.throughputMbps);
  const leoUploadMbps = finitePositive(canonicalLeo.reverse.throughputMbps);
  const leoOneWayLatencyMs = finitePositive(activeCanonicalDirection(canonicalLeo).oneWayLatencyMs);
  const leoRttMs = finitePositive(canonicalLeo.rttMs);
  const geoDownloadMbps = finitePositive(canonicalGeo.forward.throughputMbps);
  const geoUploadMbps = finitePositive(canonicalGeo.reverse.throughputMbps);
  const geoOneWayLatencyMs = finitePositive(activeCanonicalDirection(canonicalGeo).oneWayLatencyMs);
  // The canonical GEO RTT is the true round trip for every topology (MESH:
  // forward + reverse; STAR: 2 x one-way), matching LEO's contract so the
  // cross-technology comparison stays like-for-like.
  const geoRttMs = finitePositive(canonicalGeo.rttMs);
  // A GEO direction is an estimated ceiling exactly when the canonical delivery says
  // so — i.e. when no known modem ceiling bounds both of its ends. There is no
  // topology special case: a STAR route with a known customer AND gateway modem is a
  // delivered rate, and one without is not, on every surface alike.
  const geoDownloadEstimated = canonicalGeo.forward.estimated;
  const geoUploadEstimated = canonicalGeo.reverse.estimated;
  const geoThroughputEstimated = geoDownloadEstimated || geoUploadEstimated;

  // COMM LEO presentation is gated only by the final App-level evidence. Route-view
  // fallbacks may describe candidates, but cannot activate service or expose KPIs.
  const leoPhysicalRouteAvailable = canonicalRouteStateIsAvailable(canonicalLeo.state);
  const geoPhysicalRouteAvailable = canonicalRouteStateIsAvailable(canonicalGeo.state);
  const leoFinalRouteAvailable = !leoRoutePending
    && leoPhysicalRouteAvailable
    && rawLeoCommercialStatus !== 'blocked';
  const leoMetricsComplete = leoFinalRouteAvailable
    && leoDownloadMbps != null
    && leoUploadMbps != null
    && leoRttMs != null;
  // Completeness is a property of the canonical route, not of the legacy route
  // object or of a per-topology rule: the presented direction has a displayable
  // throughput AND latency. The single active-direction rule already maps
  // STAR_FORWARD→forward, STAR_RETURN→reverse and MESH/P2P→the open tab.
  const geoMetricsComplete = activeCanonicalDirection(canonicalGeo).available;
  const leoCommercialStatus = leoRoutePending
    ? 'unknown'
    : commercialStatusFromRoute(rawLeoCommercialStatus, leoFinalRouteAvailable, leoMetricsComplete);
  const geoCommercialStatus = geoRoutePending ? 'unknown' : commercialStatusFromRoute(rawGeoCommercialStatus, geoPhysicalRouteAvailable, geoMetricsComplete);

  const leoLimitingFactor = canonicalLeo.stateReason
    ?? (leoEvidence?.degradationReason && leoEvidence.degradationReason !== 'LEO route available.' && leoEvidence.degradationReason !== 'LEO site-to-site route available.'
    ? leoEvidence.degradationReason
    : input.leoTopologyMode === 'SITE_TO_SITE' && leoRoutePath?.failureReason
    ? leoRoutePath.failureReason.replaceAll('_', ' ').toLowerCase()
    : leoEvidence?.degradationReason && leoEvidence.degradationReason !== 'LEO route available.'
      ? leoEvidence.degradationReason
      : leoRoute.statusReason ?? undefined);
  const geoLimitingFactor = canonicalGeo.stateReason
    ?? (geoUsesRouteLevelAvailability
    ? input.geoRouteAnalysis?.reason ?? geoRoute.statusReason ?? undefined
    : geoRoutePending
    ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
    : geoStatusSource && geoStatusSource !== 'available'
    ? geoStatusLabel(geoStatusSource)
    : geoRoute.statusReason ?? undefined);
  const leoRegulatoryConfidence: CommercialRegulatoryConfidence = leoRoutePending
    ? 'pending'
    : leoEvidence?.failureReason?.startsWith('REGULATORY')
      ? 'blocked'
      : leoServiceStatus === 'DEGRADED'
        ? 'restricted'
        : leoServiceStatus === 'ALLOWED'
          ? 'confirmed'
          : 'pending';
  const geoRegulatoryConfidence: CommercialRegulatoryConfidence = geoRoutePending
    ? 'pending'
    : geoStatusSource === 'available'
      ? 'confirmed'
      : geoStatusSource
        ? 'blocked'
        : 'pending';

  // Objective-aware recommendations use only regulatory evidence that is
  // actually available to this application. The LEO overlay is explicitly a
  // simulated planning input; GEO sellability is not evaluated by that OneWeb
  // dataset and therefore stays unknown instead of being inferred from RF
  // coverage. The legacy path below retains its historical fields unchanged.
  const leoObjectiveRegulatoryConfidence = regulatoryConfidenceFromPlanningResult(input.leoRegulatoryResult);
  const leoAvailabilityContext = buildLinkAvailabilityContext({
    architecture: 'LEO',
    weatherType: input.weatherType,
    lat: input.activeAnalysisPoint?.lat,
  });
  const geoAvailabilityContext = buildLinkAvailabilityContext({
    architecture: 'GEO',
    weatherType: input.weatherType,
    lat: input.activeAnalysisPoint?.lat,
  });
  // E2c evidence is built only while the opt-in decision feature is active.
  // The default/legacy path therefore retains both its object shape and its
  // previous allocation cost.
  const leoOperationalEvidence = input.commercialObjective
    ? buildOperationalEvidence({
        mobility: {
          technology: 'leo',
          terminalType: input.leoTerminalType,
          terminalLabel: input.originLeoTerminalLabel,
          requiredClass: input.activeAnalysisSource === 'aircraft' ? 'aviation' : 'generic',
        },
        contention: buildLeoContentionEvidence(leoEvidence),
      })
    : undefined;
  const leoCriteria = buildCommercialCriteria({
    technology: 'leo',
    rttMs: leoFinalRouteAvailable ? leoRttMs : null,
    sustainedDownlinkMbps: leoMetricsComplete ? leoDownloadMbps : null,
    sustainedUplinkMbps: leoMetricsComplete ? leoUploadMbps : null,
    // RF-potential values are not exposed directionally by the canonical COMM
    // view model today. Keep them unknown rather than copying delivered rates.
    theoreticalDownlinkMbps: null,
    theoreticalUplinkMbps: null,
    availabilityPct: leoAvailabilityContext.indicativeAvailabilityPct,
    operationalEvidence: leoOperationalEvidence,
  });
  const geoFinalMetricsAvailable = geoPhysicalRouteAvailable && geoMetricsComplete;
  const geoOperationalEvidence = input.commercialObjective
    ? buildOperationalEvidence({
        mobility: {
          technology: 'geo',
          terminalType: input.geoTerminalType,
          terminalLabel: input.originGeoTerminalLabel,
          requiredClass: input.activeAnalysisSource === 'aircraft' ? 'aviation' : 'generic',
        },
        contention: buildGeoContentionEvidence(input.geoRouteAnalysis?.networkLayer),
      })
    : undefined;
  const geoCriteria = buildCommercialCriteria({
    technology: 'geo',
    rttMs: geoFinalMetricsAvailable ? geoRttMs : null,
    sustainedDownlinkMbps: geoFinalMetricsAvailable ? geoDownloadMbps : null,
    sustainedUplinkMbps: geoFinalMetricsAvailable ? geoUploadMbps : null,
    theoreticalDownlinkMbps: null,
    theoreticalUplinkMbps: null,
    availabilityPct: geoAvailabilityContext.indicativeAvailabilityPct,
    operationalEvidence: geoOperationalEvidence,
  });
  if (leoObjectiveRegulatoryConfidence) {
    leoCriteria.evidence.regulatory = {
      value: regulatoryRankForEvidence(leoObjectiveRegulatoryConfidence),
      unit: 'planning rank',
      nature: 'estimated',
      source: 'Simulated country-level regulatory planning overlay',
      asOf: null,
      note: input.leoRegulatoryResult?.reason
        ? `${input.leoRegulatoryResult.reason} Not legal clearance.`
        : 'Planning heuristic, not legal clearance.',
    };
  }

  // ── Comparison options + recommendation + display technology ─────────────
  // These are derived from per-tech data only — no activeTechnology fork.

  const comparisonOptionBase: CommercialTechnologyOption[] = [
    {
      technology: 'leo',
      label: 'LEO',
      status: leoCommercialStatus,
      customerStatus: customerStateFromCommercial(leoCommercialStatus),
      statusLabel: serviceStatusLabel(leoCommercialStatus),
      available: leoFinalRouteAvailable && leoCommercialStatus !== 'blocked' && leoMetricsComplete,
      downloadMbps: leoFinalRouteAvailable ? leoDownloadMbps : undefined,
      uploadMbps: leoFinalRouteAvailable ? leoUploadMbps : undefined,
      oneWayLatencyMs: leoFinalRouteAvailable ? leoOneWayLatencyMs : undefined,
      rttMs: leoFinalRouteAvailable ? leoRttMs : undefined,
      routeSummary: leoRoute.summary ?? undefined,
      limitingFactor: leoFinalRouteAvailable && leoCommercialStatus === 'active'
        ? undefined
        : toCustomerLimitation(routeLimitingFactor(leoRoute.statusReason, leoLimitingFactor)),
      technicalLimitingFactor: leoFinalRouteAvailable && leoCommercialStatus === 'active'
        ? undefined
        : routeLimitingFactor(leoRoute.statusReason, leoLimitingFactor),
      regulatoryConfidence: input.commercialObjective
        ? leoObjectiveRegulatoryConfidence
        : leoRegulatoryConfidence,
      strengths: [],
      ...leoCriteria,
    },
    {
      technology: 'geo',
      label: 'GEO',
      status: geoCommercialStatus,
      customerStatus: customerStateFromCommercial(geoCommercialStatus),
      statusLabel: geoRoutePending ? 'Pending' : serviceStatusLabel(geoCommercialStatus),
      available: geoPhysicalRouteAvailable && geoCommercialStatus !== 'blocked' && geoMetricsComplete,
      // COMM presents deliverable service metrics only. RF/geometry diagnostics
      // remain in ENG and must not appear as customer throughput on a blocked path.
      downloadMbps: geoFinalMetricsAvailable ? geoDownloadMbps : undefined,
      uploadMbps: geoFinalMetricsAvailable ? geoUploadMbps : undefined,
      oneWayLatencyMs: geoFinalMetricsAvailable ? geoOneWayLatencyMs : undefined,
      rttMs: geoFinalMetricsAvailable ? geoRttMs : undefined,
      downloadEstimated: geoFinalMetricsAvailable ? geoDownloadEstimated : undefined,
      uploadEstimated: geoFinalMetricsAvailable ? geoUploadEstimated : undefined,
      throughputEstimated: geoFinalMetricsAvailable ? geoThroughputEstimated : undefined,
      routeSummary: input.geoRouteAnalysis?.routeSummary ?? geoRoute.summary ?? undefined,
      limitingFactor: toCustomerLimitation(routeLimitingFactor(geoRoute.statusReason, geoLimitingFactor)),
      technicalLimitingFactor: routeLimitingFactor(geoRoute.statusReason, geoLimitingFactor),
      // GEO RF/coverage status is not regulatory sellability evidence. Keep it
      // only on the legacy path until a GEO regulatory dataset is connected.
      regulatoryConfidence: input.commercialObjective ? undefined : geoRegulatoryConfidence,
      strengths: [],
      ...geoCriteria,
    },
  ];
  const comparisonOptions: CommercialTechnologyOption[] = comparisonOptionBase.map((option) => ({
    ...option,
    strengths: buildOptionStrengths(
      option,
      comparisonOptionBase.find((peer) => peer.technology !== option.technology),
    ),
  }));
  const recommendation = buildRecommendation(
    comparisonOptions,
    input.commercialObjective,
    {
      trafficDirection: input.commercialTrafficDirection ?? 'BIDIRECTIONAL',
      primaryTechnology: input.commercialPrimaryTechnology,
      resilienceAssessment: input.commercialObjective === 'RESILIENCE'
        ? buildCommercialResilienceAssessment({
            geoRouteAvailable: geoFinalMetricsAvailable,
            leoRouteAvailable: leoMetricsComplete,
            geoGroundNode: input.geoGatewayName,
            leoGroundNodes: [
              leoEvidence?.selectedSnpA?.name,
              leoEvidence?.selectedSnpB?.name,
              input.selectedSnpName,
            ],
            geoBand: (input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.band,
            leoBand: leoEvidence?.debugEvidence.siteA?.terminal.supportedBands[0] ?? null,
          })
        : undefined,
    },
  );
  const commercialDisplayTechnology = deriveDisplayTechnology(input.activeTechnology);

  // ── Narrative layer: follow the selected commercial display technology ──
  // isDisplayLeo is the single fork for all customer-facing data selection.

  const isDisplayLeo = commercialDisplayTechnology === 'LEO';
  const activeRoute = isDisplayLeo ? leoRoute : geoRoute;
  const technology: CommercialTechnology = isDisplayLeo ? 'leo' : 'geo';
  const destinationIsSnp = activeRoute.destinationLabel === 'SNP';
  const isGeoStar = !isDisplayLeo && (input.linkMode === 'STAR_FORWARD' || input.linkMode === 'STAR_RETURN');
  const geoTrafficGatewayResolved = isGeoStar
    ? !!input.geoGatewayName && (input.geoGatewayTrafficStatus === 'CONFIRMED' || input.geoGatewayTrafficStatus === 'PUBLICLY_LIKELY')
    : false;
  const geoGatewayConfidence = commercialGatewayConfidenceLabel(input.geoGatewayTrafficStatus);
  const geoGatewayIsReference = input.geoGatewayTrafficStatus === 'PUBLICLY_LIKELY';
  const siteBName = input.siteB
    ? input.siteBLabelOverride
      ?? locationName(input.nearestLocationB, input.siteB, 'Site B')
    : destinationIsSnp
      ? (input.selectedSnpName ?? 'SNP')
      : 'Site B';
  const destinationEndpointKind = !isDisplayLeo && activeRoute.destinationLabel === 'Gateway'
    ? 'geo_gateway'
    : 'customer';
  const destinationCustomerSide: 'A' | 'B' = activeRoute.destinationLabel === 'Site B'
    ? 'B'
    : activeRoute.destinationLabel === 'Site A'
    ? 'A'
    : activeRoute.activeDirection === 'B_TO_A'
    ? 'A'
    : input.siteB
    ? 'B'
    : 'A';
  const destinationTechnology = isDisplayLeo ? 'LEO' : 'GEO';
  const destinationStationModel = destinationEndpointKind === 'geo_gateway'
    ? undefined
    : isDisplayLeo
    ? (destinationCustomerSide === 'B' ? input.destinationLeoTerminalLabel : input.originLeoTerminalLabel)
    : (destinationCustomerSide === 'B' ? input.destinationGeoTerminalLabel : input.originGeoTerminalLabel);
  const destinationLocation = destinationEndpointKind === 'geo_gateway'
    ? input.geoGatewayName ?? 'No commercial gateway resolved'
    : destinationCustomerSide === 'B'
    ? siteBName
    : siteAName;
  const destinationReceivingSide = destinationEndpointKind === 'geo_gateway'
    ? 'Traffic Gateway'
    : destinationCustomerSide === 'B'
    ? 'Site B'
    : input.siteB
    ? 'Site A'
    : 'Customer endpoint';

  const geoFinalRouteAvailable = geoPhysicalRouteAvailable && geoMetricsComplete;
  const activeRouteAvailable = isDisplayLeo ? leoFinalRouteAvailable : geoFinalRouteAvailable;
  const downloadMbps = activeRouteAvailable ? (isDisplayLeo ? leoDownloadMbps : geoDownloadMbps) : undefined;
  const uploadMbps = activeRouteAvailable ? (isDisplayLeo ? leoUploadMbps : geoUploadMbps) : undefined;
  const rttMs = activeRouteAvailable ? (isDisplayLeo ? leoRttMs : geoRttMs) : undefined;
  const downloadEstimated = activeRouteAvailable && !isDisplayLeo ? geoDownloadEstimated : undefined;
  const uploadEstimated = activeRouteAvailable && !isDisplayLeo ? geoUploadEstimated : undefined;
  const throughputEstimated = activeRouteAvailable && !isDisplayLeo
    ? downloadEstimated === true || uploadEstimated === true
    : undefined;
  const activeMetricsComplete = isDisplayLeo ? leoMetricsComplete : geoMetricsComplete;
  const serviceStatus = isDisplayLeo
    ? leoCommercialStatus
    : geoRoutePending
      ? 'unknown'
      : commercialStatusFromRoute(rawGeoCommercialStatus, geoFinalRouteAvailable, activeMetricsComplete);
  const serviceLabel = serviceStatusLabel(serviceStatus);
  const satellite = isDisplayLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? leoEvidence?.servingSatelliteA ?? leoRoutePath?.servingSatelliteA ?? null
        : leoEvidence?.servingSatelliteA ?? null)
    : (input.geoRouteAnalysis?.selectedSatellite ?? input.activeGeoSatellite);
  const servingSatelliteA = isDisplayLeo
    ? (leoEvidence?.servingSatelliteA ?? leoRoutePath?.servingSatelliteA ?? null)
    : satellite;
  const servingSatelliteB = isDisplayLeo
    ? (leoEvidence?.servingSatelliteB ?? leoRoutePath?.servingSatelliteB ?? null)
    : null;
  const leoElevationADeg = leoRoutePath?.elevationADeg ?? leoEvidence?.resolvedConnectivityA?.userLEOElevation ?? null;
  const leoElevationBDeg = leoRoutePath?.elevationBDeg ?? leoEvidence?.resolvedConnectivityB?.userLEOElevation ?? null;
  const leoRfAvailableA = leoRoutePath?.rfAvailableA ?? (leoEvidence?.servingSatelliteA ? leoEvidence.available : false);
  const leoRfAvailableB = leoRoutePath?.rfAvailableB ?? (leoEvidence?.servingSatelliteB ? leoEvidence.available : false);
  const formatElevation = (value: number | null | undefined): string => (
    value != null && Number.isFinite(value) ? `${value.toFixed(1)} deg` : '--'
  );
  const activeLeoEndpointCapacity = leoRoutePath?.accessThroughputAtoBMbps
    ?? leoRoutePath?.finalThroughputAtoBMbps
    ?? leoEvidence?.downloadMbps;
  const geoCoverageEvidence = input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage;
  const geoCapacityEstimate = !isDisplayLeo && satellite ? estimateGeoSatelliteCapacity(satellite) : null;
  const predictionConfidence: PredictionConfidence = isDisplayLeo
    ? (leoRoutePath?.predictionConfidence ?? buildLeoSingleSiteConfidence({
        mode: 'COMM',
        satelliteResolved: !!(leoEvidence?.servingSatelliteA ?? servingSatelliteA),
        snpResolved: !!(leoEvidence?.selectedSnpA ?? input.selectedSnpName),
        rfAvailable: !!leoRfAvailableA,
        debugAvailable: !!leoEvidence?.debugEvidence.siteA || !!leoEvidence?.leoPerformance?.debugInfo,
        regulatoryStatus: leoEvidence?.failureReason?.startsWith('REGULATORY') ? 'BLOCKED' : leoEvidence?.serviceStatus,
        loadSource: null,
        elevationDeg: leoElevationADeg,
      }))
    : buildGeoConfidence({
        mode: 'COMM',
        topology: input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT' ? 'Site-to-Site' : 'Single Site',
        coverageAvailable: !!geoCoverageEvidence && geoStatusSource !== 'unstable',
        rfAvailable: geoStatusSource === 'available' || !!geoMetricsSource.geo,
        publicFrequencyEvidence: !!geoCoverageEvidence?.band || !!geoCoverageEvidence?.frequencyGhz || !!geoCoverageEvidence?.level,
        gatewayResolved: isGeoStar
          ? geoTrafficGatewayResolved
          : !!input.geoRouteAnalysis?.geoSiteToSitePath || geoStatusSource === 'available',
        capacityClassKnown: !!geoCapacityEstimate,
        regulatoryKnown: geoStatusSource !== null,
        routePending: geoRoutePending,
        // #7: unconfirmed MESH payload cross-connect (sites on different beams).
        crossConnectUnconfirmed: (input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT')
          && input.geoRouteAnalysis?.transponderMode === 'cross-connect',
      });

  const routeMetricsWarning = activeRouteAvailable && !activeMetricsComplete
    ? (isDisplayLeo && leoRoutePending
        ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
        : geoRoutePending && !isDisplayLeo ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation' : 'Waiting for complete route metrics')
    : undefined;
  const primaryWarning = routeMetricsWarning ?? (isDisplayLeo
    ? (activeRouteAvailable && serviceStatus === 'active'
        ? undefined
        : leoRoutePending
        ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
        : input.leoTopologyMode === 'SITE_TO_SITE' && leoRoutePath?.failureReason
        ? leoRoutePath.failureReason.replaceAll('_', ' ').toLowerCase()
        : leoEvidence?.degradationReason && leoEvidence.degradationReason !== 'LEO route available.'
          ? leoEvidence.degradationReason
          : activeRoute.statusReason ?? undefined)
    : (geoRoutePending
        ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
        : geoStatusSource && geoStatusSource !== 'available'
          ? geoStatusLabel(geoStatusSource)
          : activeRoute.statusReason ?? undefined));
  const customerPrimaryWarning = toCustomerLimitation(primaryWarning);
  const primaryFailingSegment = primaryFailingSegmentId(
    input,
    activeRouteAvailable,
    activeMetricsComplete,
    satellite,
    primaryWarning,
  );

  const executiveSummary = buildExecutiveSummary(serviceStatus, recommendation, customerPrimaryWarning);

  const computedAccessStatus: CommercialRouteSegmentStatus = isDisplayLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? segmentStatusFromCommercial(statusFromServiceStatus(leoRoutePath?.rfAvailableA ? 'ALLOWED' : 'BLOCKED'))
        : segmentStatusFromCommercial(statusFromServiceStatus(leoEvidence?.servingSatelliteA && leoEvidence?.selectedSnpA ? 'ALLOWED' : 'BLOCKED')))
    : segmentStatusFromCommercial(geoRoutePending ? 'unknown' : statusFromGeoStatus(geoStatusSource));
  const computedSatelliteStatus = satelliteSegmentStatus(satellite);
  const computedBackhaulStatus: CommercialRouteSegmentStatus = isDisplayLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? (leoRoutePath?.selectedSnpA && leoRoutePath?.selectedSnpB ? 'healthy' : 'blocked')
        : (input.selectedSnpName ? 'healthy' : 'blocked'))
    : (geoRoutePending ? 'unknown' : isGeoStar && !geoTrafficGatewayResolved ? 'blocked' : geoStatusSource === 'gateway_unavailable' ? 'blocked' : geoStatusSource === 'available' ? 'healthy' : 'unknown');
  const computedDestinationStatus: CommercialRouteSegmentStatus = input.siteB || destinationIsSnp ? 'healthy' : 'unknown';
  const segmentStatus = (id: CommercialRouteSegment['id'], computed: CommercialRouteSegmentStatus): CommercialRouteSegmentStatus => {
    if (activeRouteAvailable) return computed;
    return primaryFailingSegment === id ? 'blocked' : 'unknown';
  };
  const accessStatus = segmentStatus('access', computedAccessStatus);
  const satelliteStatus = segmentStatus('satellite', computedSatelliteStatus);
  const backhaulStatus = segmentStatus('backhaul', computedBackhaulStatus);
  const destinationStatus = segmentStatus('siteB', computedDestinationStatus);

  const confidenceNote = [
    predictionConfidence.summary,
    predictionConfidence.reasons[0] ?? predictionConfidence.limitation,
  ].filter(Boolean).join(' - ');
  const availabilityContext = isDisplayLeo ? leoAvailabilityContext : geoAvailabilityContext;
  const assumptionsSummary = isDisplayLeo
    ? 'Assumes simulated network load, beam sharing, selected LEO SNP path, public terminal profile, weather profile, and indicative backbone routing.'
    : geoGatewayIsReference
      ? 'Assumes selected weather profile, public frequency data, terminal RF class, and a reference / unconfirmed GEO traffic gateway.'
      : 'Assumes selected weather profile, public frequency data, terminal RF class, and reference traffic gateway allocation.';

  const routeSegments: CommercialRouteSegment[] = [
    {
      id: 'access',
      type: 'access',
      title: 'Customer Site',
      status: accessStatus,
      customerStatus: customerStateFromSegment(accessStatus),
      role: siteAName,
      isRouteParticipant: activeRouteAvailable,
      isPrimaryIssue: primaryFailingSegment === 'access',
      story: activeRouteAvailable ? `The customer site connects into the ${commercialDisplayTechnology} service.` : 'The customer site is waiting for a confirmed service path.',
      summary: activeRouteAvailable && isDisplayLeo ? `Connected via ${satellite?.name ?? 'serving satellite'}` : 'Customer access terminal',
      limitation: accessStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'Coverage is not currently available at this location',
      technicalSummary: activeRouteAvailable && isDisplayLeo ? `Access leg via ${satellite?.name ?? 'serving satellite'}` : 'Customer access terminal',
      technicalLimitation: accessStatus === 'healthy' ? undefined : primaryWarning,
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'satellite',
      type: 'satellite',
      title: 'Satellite Service',
      status: satelliteStatus,
      customerStatus: customerStateFromSegment(satelliteStatus),
      role: activeRouteAvailable && satellite ? 'Serving satellite' : satellite ? 'Candidate satellite' : 'Satellite service',
      isRouteParticipant: activeRouteAvailable && !!satellite,
      isPrimaryIssue: primaryFailingSegment === 'satellite',
      story: activeRouteAvailable && satellite
        ? 'The serving satellite is carrying the customer service.'
        : satellite
          ? 'A candidate satellite is available but service is not yet confirmed.'
          : 'No satellite coverage is available for this location.',
      summary: satellite ? (activeRouteAvailable ? satellite.name : `Candidate: ${satellite.name}`) : 'No coverage available',
      limitation: satelliteStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'No satellite coverage is available for this service',
      technicalSummary: satellite ? (activeRouteAvailable ? satellite.name : `Candidate: ${satellite.name}`) : 'No coverage available',
      technicalLimitation: satelliteStatus === 'healthy' ? undefined : primaryWarning ?? 'No satellite coverage is available for this route',
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'backhaul',
      type: 'backhaul',
      title: 'Indicative Backbone',
      status: backhaulStatus,
      customerStatus: customerStateFromSegment(backhaulStatus),
      role: isDisplayLeo ? 'LEO SNP and backbone path' : geoTrafficGatewayResolved ? geoGatewayConfidence : 'No commercial gateway resolved',
      isRouteParticipant: activeRouteAvailable && backhaulStatus !== 'blocked' && backhaulStatus !== 'unknown',
      isPrimaryIssue: primaryFailingSegment === 'backhaul',
      story: activeRouteAvailable
        ? !isDisplayLeo && geoGatewayIsReference
          ? 'The GEO service path uses a reference traffic gateway; the traffic gateway role is not internally confirmed.'
          : 'The network backbone carries traffic between the satellite service and destination.'
        : !isDisplayLeo && !geoTrafficGatewayResolved
          ? 'No commercial gateway resolved for this GEO service path.'
          : 'The network backbone is not confirmed until service is available.',
      summary: activeRouteAvailable && isDisplayLeo
        ? (input.leoTopologyMode === 'SITE_TO_SITE'
            ? [leoRoutePath?.selectedSnpA?.name, leoRoutePath?.selectedSnpB?.name].filter(Boolean).join(' / ') || 'SNP path pending'
            : input.selectedSnpName ?? 'SNP path pending')
        : !isDisplayLeo && geoTrafficGatewayResolved
          ? `${input.geoGatewayName} - ${geoGatewayConfidence}`
          : 'No commercial gateway resolved',
      limitation: backhaulStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'Network backbone unavailable',
      technicalSummary: isDisplayLeo
        ? (input.leoTopologyMode === 'SITE_TO_SITE'
            ? [leoRoutePath?.selectedSnpA?.name, leoRoutePath?.selectedSnpB?.name].filter(Boolean).join(' / ') || 'SNP path pending'
            : input.selectedSnpName ?? 'SNP path pending')
        : !isDisplayLeo && geoTrafficGatewayResolved
          ? `${input.geoGatewayName} - ${geoGatewayConfidence}`
          : 'No commercial gateway resolved',
      technicalLimitation: backhaulStatus === 'healthy' ? undefined : primaryWarning,
      latencyMs: rttMs,
    },
    {
      id: 'siteB',
      type: 'destination',
      title: destinationIsSnp ? 'Destination' : 'Site B',
      status: destinationStatus,
      customerStatus: customerStateFromSegment(destinationStatus),
      role: 'Destination',
      isRouteParticipant: activeRouteAvailable && destinationStatus !== 'blocked' && destinationStatus !== 'unknown',
      isPrimaryIssue: primaryFailingSegment === 'siteB',
      // Only claim the service reaches a customer destination when one is actually
      // resolved. A GEO single-point route can be "available" (coverage at the origin)
      // with no Site B and no gateway destination — asserting delivery there would be
      // a phantom-destination claim.
      story: activeRouteAvailable
        ? destinationIsSnp
          ? 'Traffic exits at the selected network portal.'
          : destinationEndpointKind === 'geo_gateway'
            ? 'Traffic reaches the serving gateway.'
            : input.siteB
              ? 'Service reaches the customer destination.'
              : 'Coverage is confirmed at the origin; no destination site is defined.'
        : 'Destination is shown as an endpoint until service is confirmed.',
      summary: siteBName,
      limitation: destinationStatus === 'healthy' ? undefined : input.siteB || destinationIsSnp ? 'Service to destination is not confirmed' : 'Destination is not selected yet',
      technicalSummary: siteBName,
      technicalLimitation: destinationStatus === 'healthy' ? undefined : input.siteB || destinationIsSnp ? 'Service to destination is not confirmed' : 'Destination is not selected yet',
      throughputMbps: uploadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'summary',
      type: 'summary',
      title: 'Summary',
      status: segmentStatusFromCommercial(serviceStatus),
      customerStatus: executiveSummary.status,
      role: 'Service outcome',
      isRouteParticipant: activeRouteAvailable,
      isPrimaryIssue: primaryFailingSegment === 'summary',
      story: executiveSummary.expectedExperience,
      summary: activeRoute.summary ?? 'Service experience summary pending',
      limitation: customerPrimaryWarning,
      technicalSummary: activeRoute.summary ?? 'Service experience summary pending',
      technicalLimitation: primaryWarning,
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
  ];

  const scenarioName = [
    siteAName,
    input.siteB || destinationIsSnp ? siteBName : null,
    commercialDisplayTechnology,
  ].filter(Boolean).join(' to ');

  return {
    scenarioName: scenarioName || `${commercialDisplayTechnology} service scenario`,
    serviceStatus,
    serviceMessage: serviceLabel,
    technology,
    commercialDisplayTechnology,
    contextTechnology: input.activeTechnology,
    commercialIntent: {
      objective: input.commercialObjective,
      trafficDirection: input.commercialTrafficDirection ?? 'BIDIRECTIONAL',
      primaryTechnology: input.commercialPrimaryTechnology,
    },
    siteA: { name: siteAName },
    siteB: input.siteB || destinationIsSnp ? { name: siteBName } : undefined,
    downloadMbps,
    uploadMbps,
    rttMs,
    downloadEstimated,
    uploadEstimated,
    throughputEstimated,
    // Indicative model-derived availability (weather/rain-region heuristic, not an SLA
    // or ITU-R statistic). Surfaced numerically so the availability tile renders a
    // value instead of "--"; consumers label it "Indicative availability" so the
    // estimated, non-SLA nature is explicit next to the figure.
    availabilityPct: availabilityContext.indicativeAvailabilityPct,
    primaryWarning: customerPrimaryWarning,
    bottleneck: customerPrimaryWarning,
    routeSegments,
    selectedSegmentId: input.selectedSegmentId,
    activeRouteAvailable,
    primaryFailingSegmentId: primaryFailingSegment,
    emptyState: isDisplayLeo && leoRoutePending
      ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
      : !isDisplayLeo && geoRoutePending
      ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
      : commercialEmptyState(input, activeRouteAvailable, routeMetricsWarning ?? activeRoute.statusReason),
    recommendation,
    executiveSummary,
    comparison: {
      options: comparisonOptions,
      recommendation,
    },
    display: {
      serviceStatusLabel: serviceLabel,
      weatherA: weatherLabel(input.weatherType),
      weatherB: input.siteB ? weatherLabel(input.weatherTypeB) : '--',
      linkMargin: isDisplayLeo ? '--' : linkMarginLabel(input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage),
      satelliteName: satellite?.name ?? '--',
      satelliteNameA: servingSatelliteA?.name ?? '--',
      satelliteNameB: servingSatelliteB?.name ?? '--',
      satelliteOrbit: satellite?.orbitType ?? commercialDisplayTechnology,
      satelliteStatus: satellite?.opsStatus ?? '--',
      elevation: isDisplayLeo
        ? formatElevation(leoElevationADeg)
        : ((input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.elevation != null ? `${(input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)!.elevation.toFixed(1)} deg` : '--'),
      elevationA: isDisplayLeo
        ? formatElevation(leoElevationADeg)
        : ((input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.elevation != null ? `${(input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)!.elevation.toFixed(1)} deg` : '--'),
      elevationB: isDisplayLeo ? formatElevation(leoElevationBDeg) : '--',
      linkQualityA: isDisplayLeo ? (leoRfAvailableA ? 'Available' : '--') : (geoStatusSource === 'available' ? 'Available' : '--'),
      linkQualityB: isDisplayLeo ? (leoRfAvailableB ? 'Available' : '--') : (geoStatusSource === 'available' ? 'Available' : '--'),
      capacityContributionA: isDisplayLeo ? formatMaybeMbps(activeLeoEndpointCapacity) : formatMaybeMbps(downloadMbps),
      capacityContributionB: isDisplayLeo ? formatMaybeMbps(activeLeoEndpointCapacity) : formatMaybeMbps(downloadMbps),
      beamName: isDisplayLeo ? '--' : ((input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.beamName ?? '--'),
      rfStatus: isDisplayLeo
        ? (leoEvidence?.rfLimitation ? leoEvidence.rfLimitation : (leoRoutePath?.rfAvailableA || leoEvidence?.available ? 'AVAILABLE' : '--'))
        : (geoStatusSource === 'available' ? 'AVAILABLE' : geoStatusSource ?? '--'),
      regulatoryState: isDisplayLeo ? (leoEvidence?.failureReason?.startsWith('REGULATORY') ? leoEvidence.failureReason : '--') : '--',
      routeValue: activeRoute.routeValue,
      routeSummary: activeRoute.summary ?? '--',
      terminalLabel: input.activeAnalysisSource === 'aircraft' ? 'Aircraft' : input.leoTerminalType,
      pathStability: isDisplayLeo ? (leoRoutePath?.pathStability ?? '--') : '--',
      confidence: predictionConfidence.level,
      confidenceNote,
      predictionConfidence,
      availabilityContext: formatLinkAvailabilityContext(availabilityContext),
      assumptionsSummary,
      backboneDistance: isDisplayLeo && leoRoutePath?.backboneDistanceKm
        ? `${formatNumber(Math.round(leoRoutePath.backboneDistanceKm))} km`
        : '--',
      logicalPop: isDisplayLeo ? (leoRoutePath?.logicalPop?.name ?? '--') : '--',
      snpA: isDisplayLeo ? (leoRoutePath?.selectedSnpA?.name ?? leoEvidence?.selectedSnpA?.name ?? input.selectedSnpName ?? '--') : '--',
      snpB: isDisplayLeo ? (leoRoutePath?.selectedSnpB?.name ?? leoEvidence?.selectedSnpB?.name ?? '--') : '--',
      destinationType: destinationEndpointKind === 'geo_gateway' ? 'Traffic Gateway' : activeRoute.destinationLabel ?? 'Site B',
      destinationEndpointRole: destinationEndpointKind === 'geo_gateway' ? 'Traffic Gateway' : 'Customer station',
      destinationEndpointKind,
      destinationTechnology,
      destinationStationModel: destinationStationModel ?? '--',
      destinationLocation,
      destinationGatewayName: destinationEndpointKind === 'geo_gateway' ? input.geoGatewayName ?? '--' : '--',
      destinationGatewayCoverage: destinationEndpointKind === 'geo_gateway' ? input.geoGatewayCoverage ?? '--' : '--',
      destinationGatewayConfidence: destinationEndpointKind === 'geo_gateway' || isGeoStar ? geoGatewayConfidence : '--',
      destinationReceivingSide,
      destinationDirection: destinationEndpointKind === 'geo_gateway' ? 'satellite_to_gateway' : 'satellite_to_site',
      rawServiceStatus: isDisplayLeo ? (leoServiceStatus ?? '--') : (geoStatusSource ?? '--'),
      rawPrimaryWarning: primaryWarning ?? '--',
      rawBottleneck: primaryWarning ?? '--',
      rawGeoStatus: geoStatusSource ?? '--',
      rawLeoStatus: leoServiceStatus ?? '--',
    },
  };
}
