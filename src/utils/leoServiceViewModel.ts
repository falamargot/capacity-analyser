import type { SatelliteData } from '../types/satellites';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from './capacityLayer';
import { getFillRateProvenanceDescriptor } from './fillRateProvenance';
import type { ServiceLayerReason, ServiceLayerResult, ServiceStatus } from './serviceLayer';

export type LeoStatusTone = 'success' | 'warning' | 'danger' | 'neutral';
export type LeoDecisionDriver = 'REGULATORY' | 'CAPACITY' | 'NETWORK' | 'RF' | 'ALL_OK';
export type LeoCapacityLoadCategory = 'LOW' | 'MEDIUM' | 'HIGH' | 'SATURATED' | 'UNKNOWN';
export type LeoBeamVisualState = 'LOW' | 'MEDIUM' | 'HIGH' | 'SATURATED' | 'BLOCKED';
export type LeoPathVisualState = 'normal' | 'degraded' | 'blocked';
export type LeoUserMarkerState = 'normal' | 'degraded' | 'blocked';

export interface LeoInfoRow {
  label: string;
  value: string;
  tone: LeoStatusTone;
  detail?: string;
}

export type LeoStateRow = LeoInfoRow;
export type LeoContextItem = LeoInfoRow;

export interface LeoConnectivityViewModel {
  serviceStatus: ServiceStatus;
  decisionDriver: LeoDecisionDriver;
  decisionDriverLabel: string;
  reasons: {
    regulatory: LeoInfoRow;
    capacity: LeoInfoRow;
    network: LeoInfoRow;
    rf: LeoInfoRow;
  };
  physicalState: {
    rfAvailable: boolean;
    beamActive: boolean;
    satelliteActive: boolean;
    gatewayReachable: boolean;
  };
  capacity: {
    beamLoadPercent: number | null;
    fillRatePercent: number | null;
    loadEstimatePercent: number | null;
    loadCategory: LeoCapacityLoadCategory;
    estimatedUsers: number | null;
    estimatedUsersLabel: string;
    source: BeamLoadResult['loadSource'] | null;
    dataMode: BeamLoadResult['loadDataMode'] | null;
    sourceLabel: string;
    statisticLabel: string | null;
    hasFillRate: boolean;
    isEstimated: true;
  };
  regulatory: {
    status: RegulatoryResult['status'] | 'UNKNOWN';
    country: string | null;
  };
  renderingHints: {
    beamVisualState: LeoBeamVisualState;
    pathVisualState: LeoPathVisualState;
    userMarkerState: LeoUserMarkerState;
  };
  finalServiceStatus: ServiceStatus;
  primaryReasonLayer: ServiceLayerReason;
  primaryStatusLabel: string;
  primaryReasonLabel: string;
  reasonSummary: string;
  locationLabel: string | null;
  whyItems: string[];
  whyRows: LeoInfoRow[];
  regulatoryStatus: RegulatoryResult['status'] | 'UNKNOWN';
  rfStatus: 'AVAILABLE' | 'UNAVAILABLE';
  satelliteStatus: 'ACTIVE' | 'INACTIVE';
  beamStatus: 'IN_COVERAGE' | 'OUT_OF_COVERAGE' | 'UNAVAILABLE';
  gatewayStatus: 'REACHABLE' | 'UNREACHABLE' | 'NOT_APPLICABLE';
  isThroughputApplicable: boolean;
  isCapacityApplicable: boolean;
  showTechnicalDiagnostics: boolean;
  displayMode: 'normal' | 'regulatoryBlocked' | 'rfBlocked' | 'degraded';
  globeVisualMode: 'normal' | 'regulatory_blocked' | 'rf_blocked' | 'degraded';
  physicalLinkAvailable: boolean;
  payloadActive: boolean;
  gatewayReachable: boolean;
  physicalStateRows: LeoStateRow[];
  contextItems: LeoContextItem[];
}

interface DeriveLeoConnectivityViewModelInput {
  satellite: SatelliteData | null;
  regulatoryResult: RegulatoryResult | null;
  beamLoadResult: BeamLoadResult | null;
  serviceLayerResult: ServiceLayerResult | null;
  hasRF: boolean;
  hasSNP: boolean;
  activeBeamCount?: number;
}

const toneFromStatus = (status: ServiceStatus): LeoStatusTone => {
  if (status === 'ALLOWED') return 'success';
  if (status === 'DEGRADED') return 'warning';
  return 'danger';
};

const toneFromRegulatoryStatus = (status: RegulatoryResult['status'] | 'UNKNOWN'): LeoStatusTone => {
  if (status === 'ALLOWED' || status === 'ALLOWED_CONFIRMED' || status === 'ALLOWED_ESTIMATED') return 'success';
  if (status === 'RESTRICTED') return 'warning';
  if (status === 'BLOCKED') return 'danger';
  return 'neutral';
};

const formatRegulatoryStatusLabel = (status: RegulatoryResult['status'] | 'UNKNOWN'): string => {
  if (status === 'ALLOWED_CONFIRMED') return 'Allowed';
  if (status === 'ALLOWED_ESTIMATED') return 'Allowed (est.)';
  if (status === 'ALLOWED') return 'Allowed';
  if (status === 'RESTRICTED') return 'Restricted';
  if (status === 'BLOCKED') return 'Blocked';
  return 'Unknown';
};

const toneFromCapacityLoad = (category: LeoCapacityLoadCategory): LeoStatusTone => {
  if (category === 'LOW' || category === 'MEDIUM') return 'success';
  if (category === 'HIGH') return 'warning';
  if (category === 'SATURATED') return 'danger';
  return 'neutral';
};

const getDecisionDriver = (reason: ServiceLayerReason): LeoDecisionDriver => {
  if (reason === 'regulatory') return 'REGULATORY';
  if (reason === 'capacity') return 'CAPACITY';
  if (reason === 'network') return 'NETWORK';
  if (reason === 'rf') return 'RF';
  return 'ALL_OK';
};

const getDecisionDriverLabel = (driver: LeoDecisionDriver): string => {
  if (driver === 'REGULATORY') return 'REGULATORY RESTRICTION';
  if (driver === 'CAPACITY') return 'SIMULATED LOAD LIMIT';
  if (driver === 'NETWORK') return 'SNP PATH UNAVAILABLE';
  if (driver === 'RF') return 'RF COVERAGE UNAVAILABLE';
  return 'CONNECTED';
};

const formatReasonLabel = (driver: LeoDecisionDriver): string => {
  if (driver === 'REGULATORY') return 'Regulatory restriction';
  if (driver === 'CAPACITY') return 'Simulated load constraint';
  if (driver === 'NETWORK') return 'SNP path unavailable';
  if (driver === 'RF') return 'RF coverage unavailable';
  return 'Connected';
};

const getLoadCategory = (beamLoadResult: BeamLoadResult | null): LeoCapacityLoadCategory => {
  if (!beamLoadResult) return 'UNKNOWN';
  if (beamLoadResult.capacityStatus === 'SATURATED' || beamLoadResult.beamLoadFraction >= 0.95) return 'SATURATED';
  if (beamLoadResult.beamLoadFraction >= 0.75) return 'HIGH';
  if (beamLoadResult.beamLoadFraction >= 0.35) return 'MEDIUM';
  return 'LOW';
};

const buildCapacityValue = (
  beamLoadResult: BeamLoadResult | null,
  loadCategory: LeoCapacityLoadCategory
): string => {
  if (!beamLoadResult) return 'Unknown';
  if (loadCategory === 'SATURATED') return `Saturated · ${beamLoadResult.beamLoadPercent}%`;
  if (loadCategory === 'HIGH') return `Constrained · ${beamLoadResult.beamLoadPercent}%`;
  return `OK · ${beamLoadResult.beamLoadPercent}%`;
};

const formatEstimatedUsersLabel = (beamLoadResult: BeamLoadResult | null): string => {
  if (!beamLoadResult) return 'Unknown';
  return `~${beamLoadResult.estimatedActiveUsers} model sessions`;
};

const hasStatisticalFillRate = (beamLoadResult: BeamLoadResult | null): boolean =>
  beamLoadResult?.fillRatePct != null && beamLoadResult.loadSource !== 'heuristic';

export function deriveLeoConnectivityViewModel(
  input: DeriveLeoConnectivityViewModelInput
): LeoConnectivityViewModel {
  const {
    satellite,
    regulatoryResult,
    beamLoadResult,
    serviceLayerResult,
    hasRF,
    hasSNP,
    activeBeamCount = 0,
  } = input;

  const serviceStatus = serviceLayerResult?.status ?? 'BLOCKED';
  const primaryReasonLayer = serviceLayerResult?.primaryReasonLayer ?? 'rf';
  const decisionDriver = getDecisionDriver(primaryReasonLayer);
  const locationLabel = regulatoryResult?.isOcean
    ? 'International waters'
    : regulatoryResult?.countryName
      ? `${regulatoryResult.countryName}${regulatoryResult.isoA2 ? ` (${regulatoryResult.isoA2})` : ''}`
      : null;

  const satelliteActive = !!satellite && satellite.opsStatus === 'operational';
  const beamActive = satelliteActive && activeBeamCount > 0;
  const payloadActive = beamActive;
  const regulatoryStatus = regulatoryResult?.status ?? 'UNKNOWN';
  const loadCategory = getLoadCategory(beamLoadResult);
  const hasFillRate = hasStatisticalFillRate(beamLoadResult);
  const decisionDriverLabel = getDecisionDriverLabel(decisionDriver);
  const provenance = getFillRateProvenanceDescriptor({
    source: beamLoadResult?.loadSource,
    dataMode: beamLoadResult?.loadDataMode,
    statistic: beamLoadResult?.fillRateStatistic,
    windowMinutes: beamLoadResult?.fillRateWindowMinutes,
    sourceDate: beamLoadResult?.fillRateSourceDate,
  });
  const isRegulatoryBlocked = decisionDriver === 'REGULATORY' && serviceStatus === 'BLOCKED';
  const isRfBlocked = decisionDriver === 'RF' && serviceStatus === 'BLOCKED';

  const regulatory: LeoConnectivityViewModel['regulatory'] = {
    status: regulatoryStatus,
    country: locationLabel,
  };

  const capacity: LeoConnectivityViewModel['capacity'] = {
    beamLoadPercent: beamLoadResult?.beamLoadPercent ?? null,
    fillRatePercent: hasFillRate ? beamLoadResult?.fillRatePct ?? beamLoadResult?.beamLoadPercent ?? null : null,
    loadEstimatePercent: beamLoadResult?.beamLoadPercent ?? null,
    loadCategory,
    estimatedUsers: beamLoadResult?.estimatedActiveUsers ?? null,
    estimatedUsersLabel: formatEstimatedUsersLabel(beamLoadResult),
    source: beamLoadResult?.loadSource ?? null,
    dataMode: beamLoadResult?.loadDataMode ?? null,
    sourceLabel: provenance.shortLabel,
    statisticLabel: provenance.statisticLabel,
    hasFillRate,
    isEstimated: true,
  };

  const loadEstimateDetail = beamLoadResult
    ? hasFillRate
      ? [
          'Network Load planning model',
          beamLoadResult.fillRateInfluencePct != null ? `load input: ${beamLoadResult.fillRateInfluencePct}%` : null,
          `load proxy: ${capacity.estimatedUsersLabel}`,
        ].filter(Boolean).join(' · ')
      : ['Heuristic planning estimate', `load proxy: ${capacity.estimatedUsersLabel}`].join(' · ')
    : 'No load estimate available';

  const estimatedLoadRow: LeoInfoRow | null = beamLoadResult
    ? {
        label: 'Network Load',
        value: buildCapacityValue(beamLoadResult, loadCategory),
        tone: toneFromCapacityLoad(loadCategory),
        detail: loadEstimateDetail,
      }
    : null;

  const reasons: LeoConnectivityViewModel['reasons'] = {
    rf: {
      label: 'RF',
      value: hasRF ? 'OK' : 'Unavailable',
      tone: hasRF ? 'success' : 'danger',
      detail: hasRF
        ? 'A serving beam currently covers the selected target'
        : 'No active beam currently covers the selected target',
    },
    network: {
      label: 'SNP',
      value: hasSNP ? 'Reachable' : hasRF ? 'Unreachable' : 'Not applicable',
      tone: hasSNP ? 'success' : hasRF ? 'danger' : 'neutral',
      detail: hasSNP
        ? 'SNP backhaul is available for end-to-end service.'
        : hasRF
          ? 'No gateway reachable — OneWeb bent-pipe service requires simultaneous SNP visibility.'
          : 'SNP path depends on an RF link first',
    },
    capacity: {
      ...(estimatedLoadRow ?? {
        label: 'Network Load',
        value: 'Unknown',
        tone: 'neutral' as const,
        detail: 'No load estimate available',
      }),
    },
    regulatory: {
      label: 'Regulatory',
      value: formatRegulatoryStatusLabel(regulatoryStatus),
      tone: toneFromRegulatoryStatus(regulatoryStatus),
      detail: regulatoryResult?.reason
        || (locationLabel ? `Policy context for ${locationLabel}.` : 'No regulatory context available'),
    },
  };

  const whyRows: LeoInfoRow[] = [
    reasons.rf,
    ...(estimatedLoadRow ? [estimatedLoadRow] : []),
    reasons.network,
    reasons.regulatory,
  ];

  const physicalState: LeoConnectivityViewModel['physicalState'] = {
    rfAvailable: hasRF,
    beamActive,
    satelliteActive,
    gatewayReachable: hasSNP,
  };

  const physicalStateRows: LeoStateRow[] = [
    {
      label: 'RF Link',
      value: physicalState.rfAvailable ? 'Available' : 'Unavailable',
      tone: physicalState.rfAvailable ? 'success' : 'danger',
    },
    {
      label: 'Satellite',
      value: physicalState.satelliteActive ? 'Active' : 'Inactive',
      tone: physicalState.satelliteActive ? 'success' : 'danger',
    },
    {
      label: 'Beam',
      value: physicalState.beamActive ? 'Active' : 'Inactive',
      tone: physicalState.beamActive ? 'success' : 'warning',
    },
    {
      label: 'SNP Path',
      value: physicalState.gatewayReachable ? 'Reachable' : 'Unavailable',
      tone: physicalState.gatewayReachable ? 'success' : hasRF ? 'danger' : 'neutral',
    },
  ];

  const contextItems: LeoContextItem[] = [
    {
      label: 'Decision Driver',
      value: decisionDriverLabel,
      tone: toneFromStatus(serviceStatus),
    },
    {
      label: 'Network Load',
      value: capacity.loadEstimatePercent != null ? `${capacity.loadEstimatePercent}%` : 'Unknown',
      tone: toneFromCapacityLoad(capacity.loadCategory),
      detail: hasFillRate ? 'Planning model, not telemetry' : 'Heuristic planning estimate',
    },
    {
      label: 'Load proxy',
      value: capacity.estimatedUsersLabel,
      tone: 'neutral',
      detail: `${capacity.sourceLabel} · planning proxy`,
    },
    {
      label: 'Country',
      value: regulatory.country ?? 'Unknown',
      tone: 'neutral',
    },
  ];

  const renderingHints: LeoConnectivityViewModel['renderingHints'] = {
    beamVisualState: serviceStatus === 'BLOCKED'
      ? 'BLOCKED'
      : loadCategory === 'UNKNOWN'
        ? 'LOW'
        : loadCategory,
    pathVisualState: serviceStatus === 'BLOCKED'
      ? 'blocked'
      : serviceStatus === 'DEGRADED'
        ? 'degraded'
        : 'normal',
    userMarkerState: serviceStatus === 'BLOCKED'
      ? 'blocked'
      : serviceStatus === 'DEGRADED'
        ? 'degraded'
        : 'normal',
  };

  return {
    serviceStatus,
    decisionDriver,
    decisionDriverLabel,
    reasons,
    physicalState,
    capacity,
    regulatory,
    renderingHints,
    finalServiceStatus: serviceStatus,
    primaryReasonLayer,
    primaryStatusLabel: serviceStatus === 'ALLOWED'
      ? 'SERVICE AVAILABLE'
      : serviceStatus === 'DEGRADED'
        ? 'SERVICE DEGRADED'
        : 'SERVICE BLOCKED',
    primaryReasonLabel: formatReasonLabel(decisionDriver),
    reasonSummary: serviceLayerResult?.reason ?? 'No valid LEO service for this location.',
    locationLabel,
    whyItems: whyRows.map((row) => `${row.label}: ${row.value}`),
    whyRows,
    regulatoryStatus,
    rfStatus: hasRF ? 'AVAILABLE' : 'UNAVAILABLE',
    satelliteStatus: satelliteActive ? 'ACTIVE' : 'INACTIVE',
    beamStatus: hasRF ? 'IN_COVERAGE' : beamActive ? 'OUT_OF_COVERAGE' : 'UNAVAILABLE',
    gatewayStatus: hasSNP ? 'REACHABLE' : hasRF ? 'UNREACHABLE' : 'NOT_APPLICABLE',
    isThroughputApplicable: !isRegulatoryBlocked && serviceStatus !== 'BLOCKED',
    isCapacityApplicable: !!beamLoadResult,
    showTechnicalDiagnostics: !!satellite,
    displayMode: isRegulatoryBlocked
      ? 'regulatoryBlocked'
      : isRfBlocked
        ? 'rfBlocked'
        : serviceStatus === 'DEGRADED'
          ? 'degraded'
          : 'normal',
    globeVisualMode: isRegulatoryBlocked
      ? 'regulatory_blocked'
      : isRfBlocked
        ? 'rf_blocked'
        : serviceStatus === 'DEGRADED'
          ? 'degraded'
          : 'normal',
    physicalLinkAvailable: hasRF,
    payloadActive,
    gatewayReachable: hasSNP,
    physicalStateRows,
    contextItems,
  };
}
