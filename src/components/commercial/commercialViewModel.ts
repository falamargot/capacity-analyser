import type { CandidateCoverage, MobileAnalysisMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { SatelliteData } from '../../types/satellites';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import type { GeoRouteAnalysisViewModel } from '../../utils/geoRouteAnalysisViewModel';
import type { ActiveLeoRouteEvidence } from '../../utils/activeLeoRouteEvidence';
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

export type CommercialCustomerServiceState =
  | 'available'
  | 'limited'
  | 'degraded'
  | 'alternative_available'
  | 'unavailable';

export type CommercialRecommendedTechnology =
  | 'leo'
  | 'geo'
  | 'hybrid'
  | 'not_available'
  | 'insufficient_data';

export type CommercialRecommendationReasonCategory =
  | 'LOWEST_LATENCY'
  | 'HIGHEST_THROUGHPUT'
  | 'BEST_AVAILABILITY'
  | 'BEST_RESILIENCE'
  | 'SIMILAR_PERFORMANCE'
  | 'INSUFFICIENT_DATA';

export interface CommercialRouteSegment {
  id: string;
  type: CommercialRouteSegmentType;
  title: string;
  status: CommercialRouteSegmentStatus;
  customerStatus: CommercialCustomerServiceState;
  role: string;
  isRouteParticipant?: boolean;
  isPrimaryIssue?: boolean;
  story?: string;
  summary?: string;
  limitation?: string;
  technicalSummary?: string;
  technicalLimitation?: string;
  throughputMbps?: number;
  latencyMs?: number;
}

export interface CommercialTechnologyOption {
  technology: Exclude<CommercialTechnology, 'hybrid'>;
  label: string;
  status: CommercialStatus;
  customerStatus: CommercialCustomerServiceState;
  statusLabel: string;
  available: boolean;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  routeSummary?: string;
  limitingFactor?: string;
  technicalLimitingFactor?: string;
  strengths: string[];
}

export interface CommercialRecommendation {
  technology: CommercialRecommendedTechnology;
  reasonCategory: CommercialRecommendationReasonCategory;
  label: string;
  chipLabel: string;
  reason: string;
  message: string;
  expectedExperience: string;
}

export interface CommercialExecutiveSummary {
  status: CommercialCustomerServiceState;
  statusLabel: string;
  recommendedTechnology: string;
  expectedExperience: string;
  reason: string;
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
  activeRouteAvailable: boolean;
  primaryFailingSegmentId?: string;
  emptyState?: string;
  recommendation: CommercialRecommendation;
  executiveSummary: CommercialExecutiveSummary;
  comparison: {
    options: CommercialTechnologyOption[];
    recommendation: CommercialRecommendation;
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
    beamName?: string;
    rfStatus?: string;
    regulatoryState?: string;
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
    rawServiceStatus?: string;
    rawPrimaryWarning?: string;
    rawBottleneck?: string;
    rawGeoStatus?: string;
    rawLeoStatus?: string;
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

function commercialStatusFromRoute(
  sourceStatus: CommercialStatus,
  routeAvailable: boolean,
  metricsComplete: boolean,
): CommercialStatus {
  if (sourceStatus === 'blocked') return 'blocked';
  if (!routeAvailable) return 'blocked';
  if (!metricsComplete) return 'unknown';
  return sourceStatus;
}

function serviceStatusLabel(status: CommercialStatus): string {
  if (status === 'active') return 'Available';
  if (status === 'degraded') return 'Degraded';
  if (status === 'blocked') return 'Unavailable';
  return 'Limited';
}

function geoStatusLabel(status: GeoPointStatus | null): string {
  if (status === 'available') return 'Available';
  if (status === 'unstable') return 'Degraded';
  if (status === 'gateway_unavailable') return 'Limited';
  if (status === 'out_of_coverage') return 'Unavailable';
  return 'Limited';
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

function customerStateFromCommercial(status: CommercialStatus): CommercialCustomerServiceState {
  if (status === 'active') return 'available';
  if (status === 'degraded') return 'degraded';
  if (status === 'blocked') return 'unavailable';
  return 'limited';
}

function customerStateFromSegment(status: CommercialRouteSegmentStatus): CommercialCustomerServiceState {
  if (status === 'healthy') return 'available';
  if (status === 'warning') return 'limited';
  if (status === 'blocked') return 'unavailable';
  return 'limited';
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

function customerStatusLabel(status: CommercialCustomerServiceState): string {
  if (status === 'available') return 'Available';
  if (status === 'limited') return 'Limited';
  if (status === 'degraded') return 'Degraded';
  if (status === 'alternative_available') return 'Alternative Available';
  return 'Unavailable';
}

function recommendedTechnologyLabel(technology: CommercialRecommendedTechnology): string {
  if (technology === 'leo') return 'LEO';
  if (technology === 'geo') return 'GEO';
  if (technology === 'hybrid') return 'Hybrid';
  if (technology === 'insufficient_data') return 'Insufficient Data';
  return 'Not Available';
}

function toCustomerLimitation(reason: string | null | undefined): string | undefined {
  if (!reason) return undefined;
  const normalized = reason.toLowerCase().replaceAll('_', ' ');

  if (normalized.includes('rf unavailable a') || normalized.includes('rf unavailable at a')) {
    return 'Coverage unavailable at source site';
  }
  if (normalized.includes('rf unavailable b') || normalized.includes('rf unavailable at b')) {
    return 'Coverage unavailable at destination site';
  }
  if (normalized.includes('rf') || normalized.includes('coverage') || normalized.includes('no signal') || normalized.includes('out of coverage')) {
    return 'Coverage unavailable at selected location';
  }
  if (normalized.includes('capacity') || normalized.includes('saturated') || normalized.includes('congestion')) {
    return 'Network congestion reducing performance';
  }
  if (normalized.includes('regulatory') || normalized.includes('restricted') || normalized.includes('blocked')) {
    return 'Regulatory restriction in selected area';
  }
  if (normalized.includes('snp') || normalized.includes('gateway') || normalized.includes('backhaul')) {
    return 'Backhaul path unavailable';
  }
  if (normalized.includes('throughput')) {
    return 'Throughput is not currently available';
  }
  if (normalized.includes('route') || normalized.includes('path')) {
    return 'No active connectivity path was found';
  }

  return reason.charAt(0).toUpperCase() + reason.slice(1);
}

function routeLimitingFactor(routeReason: string | null | undefined, fallback: string | undefined): string | undefined {
  return routeReason ?? fallback;
}

function hasCompleteDisplayedMetrics(
  downloadMbps: number | undefined,
  uploadMbps: number | undefined,
  rttMs: number | undefined,
): boolean {
  return downloadMbps != null && uploadMbps != null && rttMs != null;
}

function hasCompleteGeoRouteMetrics(
  linkMode: LinkMode,
  route: ReturnType<typeof buildGeoRouteViewModel>,
  downloadMbps: number | undefined,
  uploadMbps: number | undefined,
  latencyMs: number | undefined,
): boolean {
  if (linkMode === 'STAR_FORWARD') return downloadMbps != null && latencyMs != null;
  if (linkMode === 'STAR_RETURN') return uploadMbps != null && latencyMs != null;
  if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
    return route.throughputMbps != null
      && Number.isFinite(route.throughputMbps)
      && route.throughputMbps > 0
      && route.latencyMs != null
      && Number.isFinite(route.latencyMs)
      && route.latencyMs > 0;
  }
  return hasCompleteDisplayedMetrics(downloadMbps, uploadMbps, latencyMs);
}

function optionHasRecommendationEvidence(option: CommercialTechnologyOption): boolean {
  return option.available && option.downloadMbps != null && option.rttMs != null;
}

function serviceQualityRank(option: CommercialTechnologyOption): number {
  if (option.status === 'active' && option.available) return 3;
  if (option.status === 'degraded' && option.available) return 2;
  if (option.status === 'unknown') return 1;
  return 0;
}

function isMeaningfullyHigher(left: number | undefined, right: number | undefined, toleranceRatio: number): boolean {
  if (left == null || right == null || left <= 0 || right <= 0) return false;
  return left > right * (1 + toleranceRatio);
}

function isMeaningfullyLower(left: number | undefined, right: number | undefined, toleranceRatio: number): boolean {
  if (left == null || right == null || left <= 0 || right <= 0) return false;
  return left < right * (1 - toleranceRatio);
}

function hasLimitation(option: CommercialTechnologyOption): boolean {
  return Boolean(option.limitingFactor || option.technicalLimitingFactor || option.status === 'degraded');
}

function buildOptionStrengths(
  option: CommercialTechnologyOption,
  peer: CommercialTechnologyOption | undefined,
): string[] {
  if (option.status === 'blocked') return ['Unavailable'];
  if (option.status === 'unknown') return ['Pending calculation'];

  const strengths: string[] = [];
  if (option.status === 'active') strengths.push('Service available');
  if (option.status === 'degraded') strengths.push('Service degraded');
  if (peer && isMeaningfullyLower(option.rttMs, peer.rttMs, 0.2)) strengths.push('Lowest latency');
  if (peer && isMeaningfullyHigher(option.downloadMbps, peer.downloadMbps, 0.15)) strengths.push('Highest throughput');
  if (option.status === 'active' && peer?.status === 'degraded') strengths.push('Better service quality');
  if (!hasLimitation(option) && option.available) strengths.push('No major limitation');

  return strengths.slice(0, 3);
}

function insufficientDataRecommendation(reason = 'Not enough comparable route metrics are available'): CommercialRecommendation {
  return {
    technology: 'insufficient_data',
    reasonCategory: 'INSUFFICIENT_DATA',
    label: 'Insufficient Data',
    chipLabel: 'Insufficient data',
    reason,
    message: 'Recommendation requires more route data',
    expectedExperience: 'Waiting for route calculation.',
  };
}

function buildRecommendation(options: CommercialTechnologyOption[]): CommercialRecommendation {
  const leo = options.find((option) => option.technology === 'leo');
  const geo = options.find((option) => option.technology === 'geo');
  if (!leo || !geo) {
    return insufficientDataRecommendation('Waiting for comparable service options');
  }

  const leoHasEvidence = optionHasRecommendationEvidence(leo);
  const geoHasEvidence = optionHasRecommendationEvidence(geo);

  if (leoHasEvidence && !geoHasEvidence && geo.status === 'blocked') {
    return {
      technology: 'leo',
      reasonCategory: 'BEST_AVAILABILITY',
      label: 'LEO',
      chipLabel: 'Recommended: LEO for availability',
      reason: 'GEO service is unavailable',
      message: 'LEO recommended because GEO service is unavailable',
      expectedExperience: 'Low latency connectivity available.',
    };
  }
  if (geoHasEvidence && !leoHasEvidence && leo.status === 'blocked') {
    return {
      technology: 'geo',
      reasonCategory: 'BEST_AVAILABILITY',
      label: 'GEO',
      chipLabel: 'Recommended: GEO for availability',
      reason: 'LEO coverage is unavailable',
      message: 'GEO recommended because LEO coverage is unavailable',
      expectedExperience: 'Alternative GEO service available.',
    };
  }
  if (!leo.available && !geo.available) {
    return {
      technology: 'not_available',
      reasonCategory: 'INSUFFICIENT_DATA',
      label: 'Not Available',
      chipLabel: 'No viable recommendation',
      reason: 'No active connectivity path was found',
      message: 'No service currently available',
      expectedExperience: 'No active service path available.',
    };
  }
  if (!leoHasEvidence || !geoHasEvidence) {
    return insufficientDataRecommendation();
  }

  const leoQuality = serviceQualityRank(leo);
  const geoQuality = serviceQualityRank(geo);
  if (leoQuality !== geoQuality) {
    const winner = leoQuality > geoQuality ? leo : geo;
    const loser = leoQuality > geoQuality ? geo : leo;
    return {
      technology: winner.technology,
      reasonCategory: 'BEST_AVAILABILITY',
      label: winner.label,
      chipLabel: `Recommended: ${winner.label} for service quality`,
      reason: `${winner.label} has the stronger service state`,
      message: `${winner.label} recommended because ${loser.label} is ${loser.statusLabel.toLowerCase()}`,
      expectedExperience: winner.status === 'degraded'
        ? `${winner.label} service is available with reduced quality.`
        : `${winner.label} service is available with stronger quality.`,
    };
  }

  if (isMeaningfullyHigher(leo.downloadMbps, geo.downloadMbps, 0.15) || isMeaningfullyHigher(geo.downloadMbps, leo.downloadMbps, 0.15)) {
    return (leo.downloadMbps ?? 0) > (geo.downloadMbps ?? 0)
      ? {
          technology: 'leo',
          reasonCategory: 'HIGHEST_THROUGHPUT',
          label: 'LEO',
          chipLabel: 'Recommended: LEO for throughput',
          reason: 'LEO has higher throughput',
          message: 'LEO recommended for bandwidth-intensive services',
          expectedExperience: hasLimitation(leo) ? 'LEO available but currently capacity constrained.' : 'Higher throughput available through LEO.',
        }
      : {
          technology: 'geo',
          reasonCategory: 'HIGHEST_THROUGHPUT',
          label: 'GEO',
          chipLabel: 'Recommended: GEO for throughput',
          reason: 'GEO has higher throughput',
          message: 'GEO recommended for bandwidth-intensive services',
          expectedExperience: hasLimitation(geo) ? 'GEO service available with reduced throughput.' : 'Higher throughput available through GEO.',
        };
  }

  if (isMeaningfullyLower(leo.rttMs, geo.rttMs, 0.2) || isMeaningfullyLower(geo.rttMs, leo.rttMs, 0.2)) {
    return (leo.rttMs ?? Infinity) < (geo.rttMs ?? Infinity)
      ? {
          technology: 'leo',
          reasonCategory: 'LOWEST_LATENCY',
          label: 'LEO',
          chipLabel: 'Recommended: LEO for latency',
          reason: 'LEO has lower latency',
          message: 'LEO recommended for latency-sensitive services',
          expectedExperience: hasLimitation(leo) ? 'Low latency service available with current limitations.' : 'Low latency service available.',
        }
      : {
          technology: 'geo',
          reasonCategory: 'LOWEST_LATENCY',
          label: 'GEO',
          chipLabel: 'Recommended: GEO for latency',
          reason: 'GEO has lower latency in this scenario',
          message: 'GEO recommended for latency-sensitive services',
          expectedExperience: hasLimitation(geo) ? 'GEO service available with current limitations.' : 'Stable GEO connectivity available.',
        };
  }

  if (leo.status === 'active' && geo.status === 'active' && !hasLimitation(leo) && !hasLimitation(geo)) {
    return {
      technology: 'hybrid',
      reasonCategory: 'BEST_RESILIENCE',
      label: 'Hybrid',
      chipLabel: 'Both suitable',
      reason: 'Both service options are available',
      message: 'Both suitable; hybrid service improves resilience',
      expectedExperience: 'Resilient connectivity available across GEO and LEO.',
    };
  }

  return {
    technology: 'hybrid',
    reasonCategory: 'SIMILAR_PERFORMANCE',
    label: 'Hybrid',
    chipLabel: 'Both suitable',
    reason: 'GEO and LEO perform similarly',
    message: 'GEO and LEO perform similarly for this scenario',
    expectedExperience: 'Both service options can support the customer scenario.',
  };
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

function buildExecutiveSummary(
  activeStatus: CommercialStatus,
  recommendation: CommercialRecommendation,
  customerLimitation: string | undefined,
): CommercialExecutiveSummary {
  let status = customerStateFromCommercial(activeStatus);
  if (status === 'unavailable' && recommendation.technology !== 'not_available' && recommendation.technology !== 'insufficient_data') {
    status = 'alternative_available';
  }

  return {
    status,
    statusLabel: customerStatusLabel(status),
    recommendedTechnology: recommendation.label,
    expectedExperience: recommendation.expectedExperience,
    reason: customerLimitation ? `${recommendation.reason}. Limitation: ${customerLimitation}` : recommendation.reason,
  };
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
