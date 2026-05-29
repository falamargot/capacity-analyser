import type { CandidateCoverage, MobileAnalysisMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { SatelliteData } from '../../types/satellites';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  formatRouteMbps,
  routeDirectionFromMeshTab,
} from '../../utils/activeRouteViewModel';
import { formatCoordinates } from '../../utils/formatters';
import { WEATHER_ATTENUATION_DB } from '../../utils/realisticSimulation';
import { WEATHER_PROFILES, toWeatherCondition, type TerminalType, type WeatherType } from '../capacity';

export type CommercialStatus = 'active' | 'degraded' | 'blocked' | 'unknown';

export type CommercialTechnology = 'leo' | 'geo' | 'hybrid';

export type CommercialRouteSegmentType =
  | 'access'
  | 'satellite'
  | 'backhaul'
  | 'destination'
  | 'summary';

export type CommercialRouteSegmentStatus = 'healthy' | 'warning' | 'blocked' | 'unknown';

export interface CommercialRouteSegment {
  id: string;
  type: CommercialRouteSegmentType;
  title: string;
  status: CommercialRouteSegmentStatus;
  story?: string;
  summary?: string;
  limitation?: string;
  throughputMbps?: number;
  latencyMs?: number;
}

export interface CommercialTechnologyOption {
  technology: Exclude<CommercialTechnology, 'hybrid'>;
  label: string;
  status: CommercialStatus;
  statusLabel: string;
  available: boolean;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  routeSummary?: string;
  limitingFactor?: string;
}

export interface CommercialRecommendation {
  technology: Exclude<CommercialTechnology, 'hybrid'> | 'similar';
  message: string;
}

export interface CommercialScenarioViewModel {
  scenarioName: string;
  serviceStatus: CommercialStatus;
  serviceMessage?: string;
  technology: CommercialTechnology;
  siteA?: {
    name: string;
  };
  siteB?: {
    name: string;
  };
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  availabilityPct?: number;
  primaryWarning?: string;
  bottleneck?: string;
  routeSegments: CommercialRouteSegment[];
  selectedSegmentId?: string;
  emptyState?: string;
  comparison: {
    options: CommercialTechnologyOption[];
    recommendation?: CommercialRecommendation;
  };
  display: {
    serviceStatusLabel: string;
    weatherA?: string;
    weatherB?: string;
    linkMargin?: string;
    satelliteName?: string;
    satelliteOrbit?: string;
    satelliteStatus?: string;
    elevation?: string;
    routeValue?: string;
    routeSummary?: string;
    terminalLabel?: string;
    pathStability?: string;
    confidence?: string;
    backboneDistance?: string;
    logicalPop?: string;
    snpA?: string;
    snpB?: string;
    destinationType?: string;
  };
}

interface CommercialPoint {
  lat: number;
  lng: number;
  altitude?: number;
}

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
  leoSiteToSiteResult: LeoSiteToSiteResult | null;
  leoServiceViewModel: LeoConnectivityViewModel | null;
  geoPointStatus: GeoPointStatus | null;
  linkMode: LinkMode;
  selectedCoverage: CandidateCoverage | null;
  weatherType: WeatherType;
  weatherTypeB: WeatherType;
  leoTerminalType: TerminalType;
  selectedSegmentId?: string;
}

function finitePositive(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function gbpsToMbps(value: number | null | undefined): number | undefined {
  const finite = finitePositive(value);
  return finite == null ? undefined : finite * 1000;
}

function formatMaybeMbps(value: number | null | undefined): string {
  const finite = finitePositive(value);
  return finite == null ? '--' : formatRouteMbps(finite);
}

function formatMaybeGbps(value: number | null | undefined): string {
  return formatMaybeMbps(gbpsToMbps(value));
}

function statusFromServiceStatus(status: string | null | undefined): CommercialStatus {
  if (status === 'ALLOWED') return 'active';
  if (status === 'DEGRADED') return 'degraded';
  if (status === 'BLOCKED') return 'blocked';
  return 'unknown';
}

function statusFromGeoStatus(status: GeoPointStatus | null): CommercialStatus {
  if (status === 'available') return 'active';
  if (status === 'unstable' || status === 'gateway_unavailable') return 'degraded';
  if (status === 'out_of_coverage') return 'blocked';
  return 'unknown';
}

function segmentStatusFromCommercial(status: CommercialStatus): CommercialRouteSegmentStatus {
  if (status === 'active') return 'healthy';
  if (status === 'degraded') return 'warning';
  if (status === 'blocked') return 'blocked';
  return 'unknown';
}

function serviceStatusLabel(status: CommercialStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'degraded') return 'Degraded';
  if (status === 'blocked') return 'Blocked';
  return 'Unknown';
}

function geoStatusLabel(status: GeoPointStatus | null): string {
  if (status === 'available') return 'Active';
  if (status === 'unstable') return 'Degraded';
  if (status === 'gateway_unavailable') return 'No gateway';
  if (status === 'out_of_coverage') return 'No signal';
  return 'Unknown';
}

function locationName(location: { city: string; country: string } | null | undefined, point: CommercialPoint | null, fallback: string): string {
  const label = [location?.city, location?.country].filter(Boolean).join(', ');
  if (label) return label;
  if (point) return formatCoordinates(point);
  return fallback;
}

function weatherLabel(weatherType: WeatherType): string {
  return `${WEATHER_PROFILES[weatherType].label} (${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB)`;
}

function linkMarginLabel(coverage: CandidateCoverage | null): string {
  return coverage?.linkMarginDb != null && Number.isFinite(coverage.linkMarginDb)
    ? `${coverage.linkMarginDb.toFixed(1)} dB`
    : '--';
}

function satelliteSegmentStatus(satellite: SatelliteData | null): CommercialRouteSegmentStatus {
  if (!satellite) return 'unknown';
  return satellite.opsStatus === 'operational' ? 'healthy' : 'warning';
}

function routeLimitingFactor(routeReason: string | null | undefined, fallback: string | undefined): string | undefined {
  return routeReason ?? fallback;
}

function buildRecommendation(options: CommercialTechnologyOption[]): CommercialRecommendation | undefined {
  const leo = options.find((option) => option.technology === 'leo');
  const geo = options.find((option) => option.technology === 'geo');
  if (!leo || !geo) return undefined;

  if (leo.available && !geo.available) {
    return { technology: 'leo', message: 'Recommended: LEO because GEO service is unavailable' };
  }
  if (geo.available && !leo.available) {
    return { technology: 'geo', message: 'Recommended: GEO because LEO service is unavailable' };
  }
  if (!leo.available && !geo.available) return undefined;

  if (leo.rttMs != null && geo.rttMs != null && leo.rttMs !== geo.rttMs) {
    return leo.rttMs < geo.rttMs
      ? { technology: 'leo', message: 'Recommended: LEO for lower latency' }
      : { technology: 'geo', message: 'Recommended: GEO for lower latency' };
  }

  if (leo.downloadMbps != null && geo.downloadMbps != null && leo.downloadMbps !== geo.downloadMbps) {
    return leo.downloadMbps > geo.downloadMbps
      ? { technology: 'leo', message: 'Recommended: LEO for higher downlink throughput' }
      : { technology: 'geo', message: 'Recommended: GEO for higher downlink throughput' };
  }

  return { technology: 'similar', message: 'Recommended: GEO and LEO perform similarly' };
}

function commercialEmptyState(input: BuildCommercialScenarioViewModelInput, activeRouteAvailable: boolean, activeRouteReason: string | null | undefined): string | undefined {
  const requiresTwoSites = input.leoTopologyMode === 'SITE_TO_SITE' || input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  if (!input.activeAnalysisPoint || (requiresTwoSites && !input.siteB)) {
    return 'Select two locations to compare connectivity options';
  }
  if (activeRouteAvailable) return undefined;
  if (activeRouteReason?.includes('GEO')) return 'GEO service unavailable';
  if (activeRouteReason?.includes('LEO')) return 'LEO service unavailable';
  if (!input.metrics.geo && !input.metrics.leo) return 'Waiting for route calculation';
  return 'No satellite service currently available';
}

export function buildCommercialScenarioViewModel(input: BuildCommercialScenarioViewModelInput): CommercialScenarioViewModel {
  const activeDirection = routeDirectionFromMeshTab(input.activeMeshTab);
  const leoRoute = buildLeoRouteViewModel({
    topologyMode: input.leoTopologyMode,
    direction: activeDirection,
    siteToSiteResult: input.leoSiteToSiteResult,
    metrics: input.metrics.leo,
  });
  const geoRoute = buildGeoRouteViewModel({
    linkMode: input.linkMode,
    direction: activeDirection,
    metrics: input.metrics,
    geoStatus: input.geoPointStatus,
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
  const satellite = isLeo
    ? (input.resolvedAutoLEO ?? input.selectedSatellite)
    : (input.activeGeoSatellite ?? input.selectedSatellite);

  const leoServiceStatus = input.leoTopologyMode === 'SITE_TO_SITE'
    ? (input.leoSiteToSiteResult?.serviceStatus ?? null)
    : (input.leoServiceViewModel?.finalServiceStatus ?? null);
  const leoCommercialStatus = statusFromServiceStatus(leoServiceStatus);
  const geoCommercialStatus = statusFromGeoStatus(input.geoPointStatus);
  const serviceStatus = isLeo ? leoCommercialStatus : geoCommercialStatus;
  const serviceLabel = isLeo ? serviceStatusLabel(serviceStatus) : geoStatusLabel(input.geoPointStatus);

  const leoDownloadMbps = input.leoTopologyMode === 'SITE_TO_SITE'
    ? finitePositive(leoRoute.throughputMbps)
    : gbpsToMbps(input.metrics.leo?.downlinkGbps);
  const leoUploadMbps = input.leoTopologyMode === 'SITE_TO_SITE'
    ? finitePositive(leoRoute.reverseThroughputMbps)
    : gbpsToMbps(input.metrics.leo?.uplinkGbps);
  const leoRttMs = finitePositive(leoRoute.latencyMs ?? input.metrics.leo?.rtt);
  const geoDownloadMbps = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT'
    ? finitePositive(geoRoute.throughputMbps)
    : gbpsToMbps(input.metrics.geo?.downlinkGbps);
  const geoUploadMbps = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT'
    ? finitePositive(geoRoute.reverseThroughputMbps)
    : gbpsToMbps(input.metrics.geo?.uplinkGbps);
  const geoRttMs = finitePositive(geoRoute.latencyMs ?? input.metrics.geo?.rtt);

  const downloadMbps = isLeo ? leoDownloadMbps : geoDownloadMbps;
  const uploadMbps = isLeo ? leoUploadMbps : geoUploadMbps;
  const rttMs = isLeo ? leoRttMs : geoRttMs;

  const primaryWarning = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE' && input.leoSiteToSiteResult?.failureReason
        ? input.leoSiteToSiteResult.failureReason.replaceAll('_', ' ').toLowerCase()
        : input.leoServiceViewModel?.finalServiceStatus && input.leoServiceViewModel.finalServiceStatus !== 'ALLOWED'
          ? input.leoServiceViewModel.decisionDriverLabel
          : activeRoute.statusReason ?? undefined)
    : (input.geoPointStatus && input.geoPointStatus !== 'available'
        ? geoStatusLabel(input.geoPointStatus)
        : activeRoute.statusReason ?? undefined);

  const leoLimitingFactor = input.leoTopologyMode === 'SITE_TO_SITE' && input.leoSiteToSiteResult?.failureReason
    ? input.leoSiteToSiteResult.failureReason.replaceAll('_', ' ').toLowerCase()
    : input.leoServiceViewModel?.finalServiceStatus && input.leoServiceViewModel.finalServiceStatus !== 'ALLOWED'
      ? input.leoServiceViewModel.decisionDriverLabel
      : leoRoute.statusReason ?? undefined;
  const geoLimitingFactor = input.geoPointStatus && input.geoPointStatus !== 'available'
    ? geoStatusLabel(input.geoPointStatus)
    : geoRoute.statusReason ?? undefined;
  const comparisonOptions: CommercialTechnologyOption[] = [
    {
      technology: 'leo',
      label: 'LEO',
      status: leoCommercialStatus,
      statusLabel: serviceStatusLabel(leoCommercialStatus),
      available: leoRoute.available && leoCommercialStatus !== 'blocked',
      downloadMbps: leoDownloadMbps,
      uploadMbps: leoUploadMbps,
      rttMs: leoRttMs,
      routeSummary: leoRoute.summary ?? undefined,
      limitingFactor: routeLimitingFactor(leoRoute.statusReason, leoLimitingFactor),
    },
    {
      technology: 'geo',
      label: 'GEO',
      status: geoCommercialStatus,
      statusLabel: geoStatusLabel(input.geoPointStatus),
      available: geoRoute.available && geoCommercialStatus !== 'blocked',
      downloadMbps: geoDownloadMbps,
      uploadMbps: geoUploadMbps,
      rttMs: geoRttMs,
      routeSummary: geoRoute.summary ?? undefined,
      limitingFactor: routeLimitingFactor(geoRoute.statusReason, geoLimitingFactor),
    },
  ];
  const recommendation = buildRecommendation(comparisonOptions);

  const accessStatus = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? segmentStatusFromCommercial(statusFromServiceStatus(input.leoSiteToSiteResult?.rfAvailableA ? 'ALLOWED' : 'BLOCKED'))
        : segmentStatusFromCommercial(statusFromServiceStatus(input.leoServiceViewModel?.physicalLinkAvailable ? 'ALLOWED' : 'BLOCKED')))
    : segmentStatusFromCommercial(statusFromGeoStatus(input.geoPointStatus));
  const backhaulStatus: CommercialRouteSegmentStatus = isLeo
    ? (input.leoTopologyMode === 'SITE_TO_SITE'
        ? (input.leoSiteToSiteResult?.selectedSnpA && input.leoSiteToSiteResult?.selectedSnpB ? 'healthy' : 'blocked')
        : (input.selectedSnpName ? 'healthy' : 'blocked'))
    : (input.geoPointStatus === 'gateway_unavailable' ? 'blocked' : input.geoPointStatus === 'available' ? 'healthy' : 'unknown');
  const destinationStatus: CommercialRouteSegmentStatus = input.siteB || destinationIsSnp ? 'healthy' : 'unknown';

  const downloadLabel = isLeo && input.leoTopologyMode !== 'SITE_TO_SITE'
    ? formatMaybeGbps(input.metrics.leo?.downlinkGbps)
    : formatMaybeMbps(downloadMbps);
  const uploadLabel = isLeo && input.leoTopologyMode !== 'SITE_TO_SITE'
    ? formatMaybeGbps(input.metrics.leo?.uplinkGbps)
    : formatMaybeMbps(uploadMbps);

  const routeSegments: CommercialRouteSegment[] = [
    {
      id: 'access',
      type: 'access',
      title: siteAName,
      status: accessStatus,
      story: `Customer site connects into the ${input.activeTechnology} service.`,
      summary: isLeo ? `Access leg via ${satellite?.name ?? 'serving satellite'}` : 'Customer access terminal',
      limitation: accessStatus === 'healthy' ? undefined : primaryWarning ?? 'Access path is not currently healthy',
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'satellite',
      type: 'satellite',
      title: 'Satellite',
      status: satelliteSegmentStatus(satellite),
      story: satellite?.name ? `${satellite.name} carries the customer service path.` : 'A serving satellite is required for this service path.',
      summary: satellite?.name ?? 'No satellite selected',
      limitation: satellite ? undefined : 'No serving satellite selected',
      throughputMbps: downloadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'backhaul',
      type: 'backhaul',
      title: 'Backhaul',
      status: backhaulStatus,
      story: isLeo ? 'Traffic is handed into the terrestrial network through the SNP path.' : 'Traffic is handed into the terrestrial network through the GEO gateway path.',
      summary: isLeo
        ? (input.leoTopologyMode === 'SITE_TO_SITE'
            ? [input.leoSiteToSiteResult?.selectedSnpA?.name, input.leoSiteToSiteResult?.selectedSnpB?.name].filter(Boolean).join(' / ') || 'SNP path pending'
            : input.selectedSnpName ?? 'SNP path pending')
        : 'Gateway path',
      limitation: backhaulStatus === 'healthy' ? undefined : primaryWarning ?? 'Backhaul path is not confirmed',
      latencyMs: rttMs,
    },
    {
      id: 'siteB',
      type: 'destination',
      title: destinationIsSnp ? 'Destination' : 'Site B',
      status: destinationStatus,
      story: destinationIsSnp ? 'Traffic exits at the selected network portal.' : 'Traffic reaches the customer destination site.',
      summary: siteBName,
      limitation: destinationStatus === 'healthy' ? undefined : 'Destination is not selected yet',
      throughputMbps: uploadMbps,
      latencyMs: rttMs,
    },
    {
      id: 'summary',
      type: 'summary',
      title: 'Summary',
      status: segmentStatusFromCommercial(serviceStatus),
      story: `${input.activeTechnology} service outcome for this customer scenario.`,
      summary: activeRoute.summary ?? 'Service experience summary pending',
      limitation: primaryWarning,
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
    primaryWarning,
    bottleneck: primaryWarning,
    routeSegments,
    selectedSegmentId: input.selectedSegmentId,
    emptyState: commercialEmptyState(input, activeRoute.available, activeRoute.statusReason),
    comparison: {
      options: comparisonOptions,
      recommendation,
    },
    display: {
      serviceStatusLabel: serviceLabel,
      weatherA: weatherLabel(input.weatherType),
      weatherB: input.siteB ? weatherLabel(input.weatherTypeB) : '--',
      linkMargin: linkMarginLabel(input.selectedCoverage),
      satelliteName: satellite?.name ?? '--',
      satelliteOrbit: satellite?.orbitType ?? input.activeTechnology,
      satelliteStatus: satellite?.opsStatus ?? '--',
      elevation: isLeo
        ? (input.leoSiteToSiteResult?.elevationADeg != null ? `${input.leoSiteToSiteResult.elevationADeg.toFixed(1)} deg` : '--')
        : (input.selectedCoverage?.elevation != null ? `${input.selectedCoverage.elevation.toFixed(1)} deg` : '--'),
      routeValue: activeRoute.routeValue,
      routeSummary: activeRoute.summary ?? '--',
      terminalLabel: input.activeAnalysisSource === 'aircraft' ? 'Aircraft' : input.leoTerminalType,
      pathStability: input.leoSiteToSiteResult?.pathStability ?? '--',
      confidence: input.leoSiteToSiteResult?.confidenceLevel ?? '--',
      backboneDistance: input.leoSiteToSiteResult?.backboneDistanceKm
        ? `${Math.round(input.leoSiteToSiteResult.backboneDistanceKm).toLocaleString()} km`
        : '--',
      logicalPop: input.leoSiteToSiteResult?.logicalPop?.name ?? '--',
      snpA: input.leoSiteToSiteResult?.selectedSnpA?.name ?? input.selectedSnpName ?? '--',
      snpB: input.leoSiteToSiteResult?.selectedSnpB?.name ?? '--',
      destinationType: activeRoute.destinationLabel ?? 'Site B',
    },
  };
}
