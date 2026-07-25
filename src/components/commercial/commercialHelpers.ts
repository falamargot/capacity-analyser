import type { CandidateCoverage } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { SatelliteData } from '../../types/satellites';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import { buildGeoRouteViewModel, formatRouteMbps } from '../../utils/activeRouteViewModel';
import { formatCoordinates } from '../../utils/formatters';
import { WEATHER_ATTENUATION_DB } from '../../utils/realisticSimulation';
import { WEATHER_PROFILES, toWeatherCondition, type WeatherType } from '../capacity';
import type {
  CommercialCustomerServiceState,
  CommercialPoint,
  CommercialRecommendedTechnology,
  CommercialRouteSegment,
  CommercialRouteSegmentStatus,
  CommercialStatus,
  CommercialTechnologyOption,
} from './commercialTypes';

export function finitePositive(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function gbpsToMbps(value: number | null | undefined): number | undefined {
  const finite = finitePositive(value);
  return finite == null ? undefined : finite * 1000;
}

export function formatMaybeMbps(value: number | null | undefined): string {
  const finite = finitePositive(value);
  return finite == null ? '--' : formatRouteMbps(finite);
}

export function formatMaybeGbps(value: number | null | undefined): string {
  return formatMaybeMbps(gbpsToMbps(value));
}

export function statusFromServiceStatus(status: string | null | undefined): CommercialStatus {
  if (status === 'ALLOWED') return 'active';
  if (status === 'DEGRADED') return 'degraded';
  if (status === 'BLOCKED') return 'blocked';
  return 'unknown';
}

export function statusFromGeoStatus(status: GeoPointStatus | null): CommercialStatus {
  if (status === 'available') return 'active';
  if (status === 'unstable' || status === 'gateway_unavailable') return 'degraded';
  if (status === 'out_of_coverage') return 'blocked';
  return 'unknown';
}

export function segmentStatusFromCommercial(status: CommercialStatus): CommercialRouteSegmentStatus {
  if (status === 'active') return 'healthy';
  if (status === 'degraded') return 'warning';
  if (status === 'blocked') return 'blocked';
  return 'unknown';
}

export function commercialStatusFromRoute(
  sourceStatus: CommercialStatus,
  routeAvailable: boolean,
  metricsComplete: boolean,
): CommercialStatus {
  if (sourceStatus === 'blocked') return 'blocked';
  if (!routeAvailable) return 'blocked';
  if (!metricsComplete) return 'unknown';
  return sourceStatus;
}

export function serviceStatusLabel(status: CommercialStatus): string {
  if (status === 'active') return 'Available';
  if (status === 'degraded') return 'Degraded';
  if (status === 'blocked') return 'Unavailable';
  return 'Limited';
}

export function geoStatusLabel(status: GeoPointStatus | null): string {
  if (status === 'available') return 'Available';
  if (status === 'unstable') return 'Degraded';
  if (status === 'gateway_unavailable') return 'Limited';
  if (status === 'out_of_coverage') return 'Unavailable';
  return 'Limited';
}

export function locationName(location: { city: string; country: string } | null | undefined, point: CommercialPoint | null, fallback: string): string {
  const label = [location?.city, location?.country].filter(Boolean).join(', ');
  if (label) return label;
  if (point) return formatCoordinates(point);
  return fallback;
}

export function weatherLabel(weatherType: WeatherType): string {
  return `${WEATHER_PROFILES[weatherType].label} (${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB)`;
}

export function linkMarginLabel(coverage: CandidateCoverage | null): string {
  return coverage?.linkMarginDb != null && Number.isFinite(coverage.linkMarginDb)
    ? `${coverage.linkMarginDb.toFixed(1)} dB`
    : '--';
}

export function satelliteSegmentStatus(satellite: SatelliteData | null): CommercialRouteSegmentStatus {
  if (!satellite) return 'unknown';
  return satellite.opsStatus === 'operational' ? 'healthy' : 'warning';
}

export function customerStateFromCommercial(status: CommercialStatus): CommercialCustomerServiceState {
  if (status === 'active') return 'available';
  if (status === 'degraded') return 'degraded';
  if (status === 'blocked') return 'unavailable';
  return 'limited';
}

export function customerStateFromSegment(status: CommercialRouteSegmentStatus): CommercialCustomerServiceState {
  if (status === 'healthy') return 'available';
  if (status === 'warning') return 'limited';
  if (status === 'blocked') return 'unavailable';
  return 'limited';
}

export function customerStatusLabel(status: CommercialCustomerServiceState): string {
  if (status === 'available') return 'Available';
  if (status === 'limited') return 'Limited';
  if (status === 'degraded') return 'Degraded';
  if (status === 'alternative_available') return 'Alternative Available';
  return 'Unavailable';
}

export function recommendedTechnologyLabel(technology: CommercialRecommendedTechnology): string {
  if (technology === 'leo') return 'LEO';
  if (technology === 'geo') return 'GEO';
  if (technology === 'hybrid') return 'Hybrid';
  if (technology === 'insufficient_data') return 'Insufficient Data';
  return 'Not Available';
}

export function toCustomerLimitation(reason: string | null | undefined): string | undefined {
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

export function routeLimitingFactor(routeReason: string | null | undefined, fallback: string | undefined): string | undefined {
  return routeReason ?? fallback;
}

export function hasCompleteDisplayedMetrics(
  downloadMbps: number | undefined,
  uploadMbps: number | undefined,
  rttMs: number | undefined,
): boolean {
  return downloadMbps != null && uploadMbps != null && rttMs != null;
}

export function optionHasRecommendationEvidence(option: CommercialTechnologyOption): boolean {
  return option.available && option.downloadMbps != null && option.rttMs != null;
}

export function serviceQualityRank(option: CommercialTechnologyOption): number {
  if (option.status === 'active' && option.available) return 3;
  if (option.status === 'degraded' && option.available) return 2;
  if (option.status === 'unknown') return 1;
  return 0;
}

export function isMeaningfullyHigher(left: number | undefined, right: number | undefined, toleranceRatio: number): boolean {
  if (left == null || right == null || left <= 0 || right <= 0) return false;
  return left > right * (1 + toleranceRatio);
}

export function isMeaningfullyLower(left: number | undefined, right: number | undefined, toleranceRatio: number): boolean {
  if (left == null || right == null || left <= 0 || right <= 0) return false;
  return left < right * (1 - toleranceRatio);
}

export function hasLimitation(option: CommercialTechnologyOption): boolean {
  return Boolean(option.limitingFactor || option.technicalLimitingFactor || option.status === 'degraded');
}

export function buildOptionStrengths(
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

