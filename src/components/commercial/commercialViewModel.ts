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
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  routeDirectionFromMeshTab,
} from '../../utils/activeRouteViewModel';
import { type TerminalType, type WeatherType } from '../capacity';
import type {
  CommercialPoint,
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
  formatMaybeGbps,
  formatMaybeMbps,
  gbpsToMbps,
  geoStatusLabel,
  hasCompleteGeoRouteMetrics,
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

interface BuildCommercialScenarioViewModelInput {
  activeTechnology: 'LEO' | 'GEO';
  activeMeshTab: 'forward' | 'reverse';
  activeAnalysisPoint: CommercialPoint | null;
  activeAnalysisSource?: 'earth' | 'aircraft';
  siteB: CommercialPoint | null;
  nearestLocation?: { city: string; country: string } | null;
  nearestLocationB?: { city: string; country: string } | null;
  selectedSnpName?: string | null;
  selectedSatellite: SatelliteData | null;
  activeGeoSatellite: SatelliteData | null;
  resolvedAutoLEO: SatelliteData | null;
  metrics: MobileAnalysisMetrics;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  activeLeoRouteEvidence?: ActiveLeoRouteEvidence | null;
  geoPointStatus: GeoPointStatus | null;
  geoRouteAnalysis?: GeoRouteAnalysisViewModel | null;
  linkMode: LinkMode;
  selectedCoverage: CandidateCoverage | null;
  weatherType: WeatherType;
  weatherTypeB: WeatherType;
  leoTerminalType: TerminalType;
  selectedSegmentId?: string;
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

  const isLeo = input.activeTechnology === 'LEO';
  const activeRoute = isLeo ? leoRoute : geoRoute;
  const technology: CommercialTechnology = isLeo ? 'leo' : 'geo';
  const siteAName = locationName(input.nearestLocation, input.activeAnalysisPoint, 'Site A');
  const destinationIsSnp = activeRoute.destinationLabel === 'SNP';
  const siteBName = input.siteB
    ? locationName(input.nearestLocationB, input.siteB, 'Site B')
    : destinationIsSnp
      ? (input.selectedSnpName ?? 'SNP')
      : 'Site B';
  const leoServiceStatus = input.leoTopologyMode === 'SITE_TO_SITE'
    ? (leoEvidence?.serviceStatus ?? leoRoutePath?.serviceStatus ?? null)
    : (leoEvidence?.serviceStatus ?? null);
  const leoRoutePending = !leoEvidence || leoEvidence.pending === true;
  const rawLeoCommercialStatus = leoRoutePending ? 'unknown' : statusFromServiceStatus(leoServiceStatus);
  const geoUsesRouteLevelAvailability = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  const geoRoutePending = input.geoRouteAnalysis?.pending === true;
  const rawGeoCommercialStatus = geoRoutePending
    ? 'unknown'
    : geoUsesRouteLevelAvailability
    ? (geoRoute.available ? 'active' : 'blocked')
    : statusFromGeoStatus(geoStatusSource);

  const leoDownloadMbps = input.leoTopologyMode === 'SITE_TO_SITE'
    ? finitePositive(leoEvidence?.downloadMbps ?? leoRoute.throughputMbps)
    : leoEvidence?.downloadMbps;
  const leoUploadMbps = input.leoTopologyMode === 'SITE_TO_SITE'
    ? finitePositive(leoEvidence?.uploadMbps ?? leoRoute.reverseThroughputMbps)
    : leoEvidence?.uploadMbps;
  const leoRttMs = finitePositive(leoEvidence?.rttMs ?? leoRoute.latencyMs);
  const geoDownloadMbps = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT'
    ? finitePositive(input.geoRouteAnalysis?.downloadMbps ?? geoRoute.throughputMbps)
    : (input.geoRouteAnalysis?.downloadMbps ?? gbpsToMbps(geoMetricsSource.geo?.downlinkGbps));
  const geoUploadMbps = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT'
    ? finitePositive(input.geoRouteAnalysis?.uploadMbps ?? geoRoute.reverseThroughputMbps)
    : (input.geoRouteAnalysis?.uploadMbps ?? gbpsToMbps(geoMetricsSource.geo?.uplinkGbps));
  const geoRttMs = finitePositive(input.geoRouteAnalysis?.latencyMs ?? geoRoute.latencyMs ?? geoMetricsSource.geo?.rtt);

  const downloadMbps = isLeo ? leoDownloadMbps : geoDownloadMbps;
  const uploadMbps = isLeo ? leoUploadMbps : geoUploadMbps;
  const rttMs = isLeo ? leoRttMs : geoRttMs;
  const leoMetricsComplete = leoEvidence?.available === true;
  const geoMetricsComplete = input.geoRouteAnalysis
    ? input.geoRouteAnalysis.available
    : hasCompleteGeoRouteMetrics(input.linkMode, geoRoute, geoDownloadMbps, geoUploadMbps, geoRttMs);
  const activeMetricsComplete = isLeo ? leoMetricsComplete : geoMetricsComplete;
  const leoCommercialStatus = leoRoutePending ? 'unknown' : commercialStatusFromRoute(rawLeoCommercialStatus, leoRoute.available, leoMetricsComplete);
  const geoCommercialStatus = geoRoutePending ? 'unknown' : commercialStatusFromRoute(rawGeoCommercialStatus, geoRoute.available, geoMetricsComplete);
  const serviceStatus = isLeo && leoRoutePending
    ? 'unknown'
    : !isLeo && geoRoutePending
    ? 'unknown'
    : commercialStatusFromRoute(isLeo ? rawLeoCommercialStatus : rawGeoCommercialStatus, activeRoute.available, activeMetricsComplete);
  const serviceLabel = serviceStatusLabel(serviceStatus);
  const satellite = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? leoEvidence?.servingSatelliteA ?? leoRoutePath?.servingSatelliteA ?? null
        : leoEvidence?.servingSatelliteA ?? null)
    : (input.geoRouteAnalysis?.selectedSatellite ?? input.activeGeoSatellite);

  const routeMetricsWarning = activeRoute.available && !activeMetricsComplete
    ? (isLeo && leoRoutePending
        ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
        : geoRoutePending && !isLeo ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation' : 'Waiting for complete route metrics')
    : undefined;
  const primaryWarning = routeMetricsWarning ?? (isLeo
    ? (leoRoutePending
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
  const activeRouteAvailable = activeRoute.available;
  const primaryFailingSegment = primaryFailingSegmentId(
    input,
    activeRouteAvailable,
    activeMetricsComplete,
    satellite,
    primaryWarning,
  );

  const leoLimitingFactor = leoEvidence?.degradationReason && leoEvidence.degradationReason !== 'LEO route available.' && leoEvidence.degradationReason !== 'LEO site-to-site route available.'
    ? leoEvidence.degradationReason
    : input.leoTopologyMode === 'SITE_TO_SITE' && leoRoutePath?.failureReason
    ? leoRoutePath.failureReason.replaceAll('_', ' ').toLowerCase()
    : leoEvidence?.degradationReason && leoEvidence.degradationReason !== 'LEO route available.'
      ? leoEvidence.degradationReason
      : leoRoute.statusReason ?? undefined;
  const geoLimitingFactor = geoUsesRouteLevelAvailability
    ? input.geoRouteAnalysis?.reason ?? geoRoute.statusReason ?? undefined
    : geoRoutePending
    ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
    : geoStatusSource && geoStatusSource !== 'available'
    ? geoStatusLabel(geoStatusSource)
    : geoRoute.statusReason ?? undefined;
  const comparisonOptionBase: CommercialTechnologyOption[] = [
    {
      technology: 'leo',
      label: 'LEO',
      status: leoCommercialStatus,
      customerStatus: customerStateFromCommercial(leoCommercialStatus),
      statusLabel: serviceStatusLabel(leoCommercialStatus),
      available: leoRoute.available && leoCommercialStatus !== 'blocked' && leoMetricsComplete,
      downloadMbps: leoDownloadMbps,
      uploadMbps: leoUploadMbps,
      rttMs: leoRttMs,
      routeSummary: leoRoute.summary ?? undefined,
      limitingFactor: toCustomerLimitation(routeLimitingFactor(leoRoute.statusReason, leoLimitingFactor)),
      technicalLimitingFactor: routeLimitingFactor(leoRoute.statusReason, leoLimitingFactor),
      strengths: [],
    },
    {
      technology: 'geo',
      label: 'GEO',
      status: geoCommercialStatus,
      customerStatus: customerStateFromCommercial(geoCommercialStatus),
      statusLabel: geoRoutePending ? 'Pending' : serviceStatusLabel(geoCommercialStatus),
      available: geoRoute.available && geoCommercialStatus !== 'blocked' && geoMetricsComplete,
      downloadMbps: geoDownloadMbps,
      uploadMbps: geoUploadMbps,
      rttMs: geoRttMs,
      routeSummary: input.geoRouteAnalysis?.routeSummary ?? geoRoute.summary ?? undefined,
      limitingFactor: toCustomerLimitation(routeLimitingFactor(geoRoute.statusReason, geoLimitingFactor)),
      technicalLimitingFactor: routeLimitingFactor(geoRoute.statusReason, geoLimitingFactor),
      strengths: [],
    },
  ];
  const comparisonOptions: CommercialTechnologyOption[] = comparisonOptionBase.map((option) => ({
    ...option,
    strengths: buildOptionStrengths(
      option,
      comparisonOptionBase.find((peer) => peer.technology !== option.technology),
    ),
  }));
  const recommendation = buildRecommendation(comparisonOptions);
  const executiveSummary = buildExecutiveSummary(serviceStatus, recommendation, customerPrimaryWarning);

  const computedAccessStatus: CommercialRouteSegmentStatus = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? segmentStatusFromCommercial(statusFromServiceStatus(leoRoutePath?.rfAvailableA ? 'ALLOWED' : 'BLOCKED'))
        : segmentStatusFromCommercial(statusFromServiceStatus(leoEvidence?.servingSatelliteA && leoEvidence?.selectedSnpA ? 'ALLOWED' : 'BLOCKED')))
    : segmentStatusFromCommercial(geoRoutePending ? 'unknown' : statusFromGeoStatus(geoStatusSource));
  const computedSatelliteStatus = satelliteSegmentStatus(satellite);
  const computedBackhaulStatus: CommercialRouteSegmentStatus = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? (leoRoutePath?.selectedSnpA && leoRoutePath?.selectedSnpB ? 'healthy' : 'blocked')
        : (input.selectedSnpName ? 'healthy' : 'blocked'))
    : (geoRoutePending ? 'unknown' : geoStatusSource === 'gateway_unavailable' ? 'blocked' : geoStatusSource === 'available' ? 'healthy' : 'unknown');
  const computedDestinationStatus: CommercialRouteSegmentStatus = input.siteB || destinationIsSnp ? 'healthy' : 'unknown';
  const segmentStatus = (id: CommercialRouteSegment['id'], computed: CommercialRouteSegmentStatus): CommercialRouteSegmentStatus => {
    if (activeRouteAvailable) return computed;
    return primaryFailingSegment === id ? 'blocked' : 'unknown';
  };
  const accessStatus = segmentStatus('access', computedAccessStatus);
  const satelliteStatus = segmentStatus('satellite', computedSatelliteStatus);
  const backhaulStatus = segmentStatus('backhaul', computedBackhaulStatus);
  const destinationStatus = segmentStatus('siteB', computedDestinationStatus);

  const downloadLabel = isLeo && input.leoTopologyMode !== 'SITE_TO_SITE'
    ? formatMaybeGbps(leoMetricsSource?.downlinkGbps)
    : formatMaybeMbps(downloadMbps);
  const uploadLabel = isLeo && input.leoTopologyMode !== 'SITE_TO_SITE'
    ? formatMaybeGbps(leoMetricsSource?.uplinkGbps)
    : formatMaybeMbps(uploadMbps);

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
      story: activeRouteAvailable ? `The customer site connects into the ${input.activeTechnology} service.` : 'The customer site is waiting for a confirmed service path.',
      summary: activeRouteAvailable && isLeo ? `Connected via ${satellite?.name ?? 'serving satellite'}` : 'Customer access terminal',
      limitation: accessStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'Coverage is not currently available at this location',
      technicalSummary: activeRouteAvailable && isLeo ? `Access leg via ${satellite?.name ?? 'serving satellite'}` : 'Customer access terminal',
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
      story: activeRouteAvailable && satellite ? 'The serving satellite carries the customer service.' : 'A serving satellite is required for this service.',
      summary: satellite ? (activeRouteAvailable ? satellite.name : `Candidate: ${satellite.name}`) : 'No serving satellite',
      limitation: satelliteStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'No serving satellite is available for this service',
      technicalSummary: satellite ? (activeRouteAvailable ? satellite.name : `Candidate: ${satellite.name}`) : 'No serving satellite',
      technicalLimitation: satelliteStatus === 'healthy' ? undefined : primaryWarning ?? 'No serving satellite is available for this route',
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'backhaul',
      type: 'backhaul',
      title: 'Network Backbone',
      status: backhaulStatus,
      customerStatus: customerStateFromSegment(backhaulStatus),
      role: 'Core network',
      isRouteParticipant: activeRouteAvailable && backhaulStatus !== 'blocked' && backhaulStatus !== 'unknown',
      isPrimaryIssue: primaryFailingSegment === 'backhaul',
      story: activeRouteAvailable ? 'The network backbone carries traffic between the satellite service and destination.' : 'The network backbone is not confirmed until service is available.',
      summary: activeRouteAvailable && isLeo
        ? (input.leoTopologyMode === 'SITE_TO_SITE'
            ? [leoRoutePath?.selectedSnpA?.name, leoRoutePath?.selectedSnpB?.name].filter(Boolean).join(' / ') || 'SNP path pending'
            : input.selectedSnpName ?? 'SNP path pending')
        : 'Gateway path',
      limitation: backhaulStatus === 'healthy' ? undefined : customerPrimaryWarning ?? 'Network backbone unavailable',
      technicalSummary: isLeo
        ? (input.leoTopologyMode === 'SITE_TO_SITE'
            ? [leoRoutePath?.selectedSnpA?.name, leoRoutePath?.selectedSnpB?.name].filter(Boolean).join(' / ') || 'SNP path pending'
            : input.selectedSnpName ?? 'SNP path pending')
        : 'Gateway path',
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
      story: activeRouteAvailable
        ? (destinationIsSnp ? 'Traffic exits at the selected network portal.' : 'Service reaches the customer destination.')
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
    input.activeTechnology,
  ].filter(Boolean).join(' to ');

  return {
    scenarioName: scenarioName || `${input.activeTechnology} service scenario`,
    serviceStatus,
    serviceMessage: serviceLabel,
    technology,
    siteA: { name: siteAName },
    siteB: input.siteB || destinationIsSnp ? { name: siteBName } : undefined,
    downloadMbps,
    uploadMbps,
    rttMs,
    primaryWarning: customerPrimaryWarning,
    bottleneck: customerPrimaryWarning,
    routeSegments,
    selectedSegmentId: input.selectedSegmentId,
    activeRouteAvailable,
    primaryFailingSegmentId: primaryFailingSegment,
    emptyState: isLeo && leoRoutePending
      ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
      : !isLeo && geoRoutePending
      ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
      : commercialEmptyState(input, activeRoute.available && activeMetricsComplete, routeMetricsWarning ?? activeRoute.statusReason),
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
      linkMargin: linkMarginLabel(input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage),
      satelliteName: satellite?.name ?? '--',
      satelliteOrbit: satellite?.orbitType ?? input.activeTechnology,
      satelliteStatus: satellite?.opsStatus ?? '--',
      elevation: isLeo
        ? (leoRoutePath?.elevationADeg != null ? `${leoRoutePath.elevationADeg.toFixed(1)} deg` : '--')
        : ((input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.elevation != null ? `${(input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)!.elevation.toFixed(1)} deg` : '--'),
      beamName: (input.geoRouteAnalysis?.selectedCoverage ?? input.selectedCoverage)?.beamName ?? '--',
      rfStatus: isLeo
        ? (leoEvidence?.rfLimitation ? leoEvidence.rfLimitation : (leoRoutePath?.rfAvailableA || leoEvidence?.available ? 'AVAILABLE' : '--'))
        : (geoStatusSource === 'available' ? 'AVAILABLE' : geoStatusSource ?? '--'),
      regulatoryState: isLeo ? (leoEvidence?.failureReason?.startsWith('REGULATORY') ? leoEvidence.failureReason : '--') : '--',
      routeValue: activeRoute.routeValue,
      routeSummary: activeRoute.summary ?? '--',
      terminalLabel: input.activeAnalysisSource === 'aircraft' ? 'Aircraft' : input.leoTerminalType,
      pathStability: leoRoutePath?.pathStability ?? '--',
      confidence: leoRoutePath?.confidenceLevel ?? '--',
      backboneDistance: leoRoutePath?.backboneDistanceKm
        ? `${Math.round(leoRoutePath.backboneDistanceKm).toLocaleString()} km`
        : '--',
      logicalPop: leoRoutePath?.logicalPop?.name ?? '--',
      snpA: leoRoutePath?.selectedSnpA?.name ?? leoEvidence?.selectedSnpA?.name ?? input.selectedSnpName ?? '--',
      snpB: leoRoutePath?.selectedSnpB?.name ?? leoEvidence?.selectedSnpB?.name ?? '--',
      destinationType: activeRoute.destinationLabel ?? 'Site B',
      rawServiceStatus: isLeo ? (leoServiceStatus ?? '--') : (geoStatusSource ?? '--'),
      rawPrimaryWarning: primaryWarning ?? '--',
      rawBottleneck: primaryWarning ?? '--',
      rawGeoStatus: geoStatusSource ?? '--',
      rawLeoStatus: leoServiceStatus ?? '--',
    },
  };
}
