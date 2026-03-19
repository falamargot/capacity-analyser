import type { SatelliteData } from '../types/satellites';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from './capacityLayer';
import type { ServiceLayerReason, ServiceLayerResult, ServiceStatus } from './serviceLayer';

export type LeoStatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface LeoStateRow {
  label: string;
  value: string;
  tone: LeoStatusTone;
}

export interface LeoContextItem {
  label: string;
  value: string;
  tone?: LeoStatusTone;
}

export interface LeoConnectivityViewModel {
  finalServiceStatus: ServiceStatus;
  primaryReasonLayer: ServiceLayerReason;
  primaryStatusLabel: string;
  primaryReasonLabel: string;
  reasonSummary: string;
  locationLabel: string | null;
  whyItems: string[];
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
  isBlankingZone?: boolean;
}

const toneFromStatus = (status: ServiceStatus): LeoStatusTone => {
  if (status === 'ALLOWED') return 'success';
  if (status === 'DEGRADED') return 'warning';
  return 'danger';
};

const formatReasonLabel = (reason: ServiceLayerReason): string => {
  if (reason === 'regulatory') return 'Regulatory restriction';
  if (reason === 'capacity') return 'Capacity constraint';
  if (reason === 'network') return 'Gateway path unavailable';
  if (reason === 'rf') return 'RF coverage unavailable';
  return 'Service available';
};

const buildWhyItems = (
  serviceLayerResult: ServiceLayerResult | null,
  regulatoryResult: RegulatoryResult | null,
  hasRF: boolean,
  hasSNP: boolean
): string[] => {
  if (!serviceLayerResult) {
    return ['No active LEO service assessment available.'];
  }

  if (serviceLayerResult.primaryReasonLayer === 'regulatory') {
    return [
      regulatoryResult?.reason || 'Service authorization denied in this territory.',
      'Physical RF may still exist, but commercial service is denied here.',
    ];
  }

  if (serviceLayerResult.primaryReasonLayer === 'rf') {
    return [
      'No active beam currently covers the selected location.',
      'Service will resume when RF coverage becomes available.',
    ];
  }

  if (serviceLayerResult.primaryReasonLayer === 'network') {
    return [
      'A physical RF link exists, but no reachable gateway path is available.',
      hasSNP ? 'Gateway path is unstable.' : 'Gateway path is currently missing.',
    ];
  }

  if (serviceLayerResult.primaryReasonLayer === 'capacity') {
    return [
      serviceLayerResult.reason,
      'Service is limited by estimated beam congestion rather than RF or regulation.',
    ];
  }

  return serviceLayerResult.details.length > 0
    ? serviceLayerResult.details.slice(0, 2)
    : ['All required layers are healthy for this target.'];
};

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
    isBlankingZone = false,
  } = input;

  const finalServiceStatus = serviceLayerResult?.status ?? 'BLOCKED';
  const primaryReasonLayer = serviceLayerResult?.primaryReasonLayer ?? 'rf';
  const locationLabel = regulatoryResult?.isOcean
    ? 'International waters'
    : regulatoryResult?.countryName
      ? `${regulatoryResult.countryName}${regulatoryResult.isoA2 ? ` (${regulatoryResult.isoA2})` : ''}`
      : null;

  const payloadActive = !!satellite && satellite.opsStatus === 'operational' && !isBlankingZone && activeBeamCount > 0;
  const satelliteStatus = satellite?.opsStatus === 'operational' ? 'ACTIVE' : 'INACTIVE';
  const rfStatus = hasRF ? 'AVAILABLE' : 'UNAVAILABLE';
  const beamStatus = hasRF ? 'IN_COVERAGE' : payloadActive ? 'OUT_OF_COVERAGE' : 'UNAVAILABLE';
  const gatewayStatus = hasSNP ? 'REACHABLE' : hasRF ? 'UNREACHABLE' : 'NOT_APPLICABLE';
  const isRegulatoryBlocked = primaryReasonLayer === 'regulatory' && finalServiceStatus === 'BLOCKED';
  const isRfBlocked = primaryReasonLayer === 'rf' && finalServiceStatus === 'BLOCKED';

  const physicalStateRows: LeoStateRow[] = [
    {
      label: 'RF Link',
      value: hasRF ? 'Available' : 'Unavailable',
      tone: hasRF ? 'success' : 'danger',
    },
    {
      label: 'Satellite',
      value: satelliteStatus === 'ACTIVE' ? 'Active' : 'Inactive',
      tone: satelliteStatus === 'ACTIVE' ? 'success' : 'danger',
    },
    {
      label: 'Beam Coverage',
      value: beamStatus === 'IN_COVERAGE' ? 'In coverage' : beamStatus === 'OUT_OF_COVERAGE' ? 'Out of coverage' : 'Unavailable',
      tone: beamStatus === 'IN_COVERAGE' ? 'success' : beamStatus === 'OUT_OF_COVERAGE' ? 'warning' : 'danger',
    },
    {
      label: 'Gateway Path',
      value: gatewayStatus === 'REACHABLE' ? 'Reachable' : gatewayStatus === 'UNREACHABLE' ? 'Unavailable' : 'N/A',
      tone: gatewayStatus === 'REACHABLE' ? 'success' : gatewayStatus === 'UNREACHABLE' ? 'warning' : 'neutral',
    },
  ];

  const contextItems: LeoContextItem[] = [
    {
      label: 'Regulatory',
      value: regulatoryResult?.status ?? 'UNKNOWN',
      tone: regulatoryResult?.status === 'ALLOWED'
        ? 'success'
        : regulatoryResult?.status === 'RESTRICTED'
          ? 'warning'
          : regulatoryResult?.status === 'BLOCKED'
            ? 'danger'
            : 'neutral',
    },
  ];

  if (beamLoadResult) {
    contextItems.push({
      label: isRegulatoryBlocked ? 'Served Load' : 'Beam Load',
      value: isRegulatoryBlocked ? 'N/A' : `${beamLoadResult.beamLoadPercent}%`,
      tone: isRegulatoryBlocked
        ? 'neutral'
        : beamLoadResult.capacityStatus === 'NOMINAL'
          ? 'success'
          : beamLoadResult.capacityStatus === 'DEGRADED'
            ? 'warning'
            : 'danger',
    });
    contextItems.push({
      label: isRegulatoryBlocked ? 'Demand Zone' : 'Estimated Users',
      value: isRegulatoryBlocked
        ? beamLoadResult.densityZoneLabel
        : `~${beamLoadResult.estimatedActiveUsers}`,
      tone: 'neutral',
    });
  }

  return {
    finalServiceStatus,
    primaryReasonLayer,
    primaryStatusLabel: finalServiceStatus === 'ALLOWED'
      ? 'SERVICE AVAILABLE'
      : finalServiceStatus === 'DEGRADED'
        ? 'SERVICE DEGRADED'
        : 'SERVICE BLOCKED',
    primaryReasonLabel: formatReasonLabel(primaryReasonLayer),
    reasonSummary: serviceLayerResult?.reason ?? 'No valid LEO service for this location.',
    locationLabel,
    whyItems: buildWhyItems(serviceLayerResult, regulatoryResult, hasRF, hasSNP),
    regulatoryStatus: regulatoryResult?.status ?? 'UNKNOWN',
    rfStatus,
    satelliteStatus,
    beamStatus,
    gatewayStatus,
    isThroughputApplicable: !isRegulatoryBlocked && finalServiceStatus !== 'BLOCKED',
    isCapacityApplicable: !isRegulatoryBlocked,
    showTechnicalDiagnostics: !!satellite,
    displayMode: isRegulatoryBlocked
      ? 'regulatoryBlocked'
      : isRfBlocked
        ? 'rfBlocked'
        : finalServiceStatus === 'DEGRADED'
          ? 'degraded'
          : 'normal',
    globeVisualMode: isRegulatoryBlocked
      ? 'regulatory_blocked'
      : isRfBlocked
        ? 'rf_blocked'
        : finalServiceStatus === 'DEGRADED'
          ? 'degraded'
          : 'normal',
    physicalLinkAvailable: hasRF,
    payloadActive,
    gatewayReachable: hasSNP,
    physicalStateRows,
    contextItems,
  };
}
