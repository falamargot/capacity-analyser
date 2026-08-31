import type { PredictionConfidence } from '../../utils/predictionConfidence';

export type CommercialStatus = 'active' | 'degraded' | 'blocked' | 'unknown';

/**
 * Lifecycle of the customer-facing COMM evaluation. Missing inputs and a
 * completed negative result must never share the same presentation state.
 */
export type CommercialEvaluationState =
  | 'NOT_CONFIGURED'
  | 'COMPUTING'
  | 'EVALUATED_AVAILABLE'
  | 'EVALUATED_LIMITED'
  | 'EVALUATED_UNAVAILABLE'
  | 'ERROR';

export type CommercialTechnology = 'leo' | 'geo' | 'hybrid';

export type ConnectivityScenarioType = 'site_to_site' | 'network_access';

export type TerminalCapabilityTechnology = 'geo' | 'leo';

export interface TerminalCapability {
  id: string;
  technology: TerminalCapabilityTechnology;
  band?: string;
  label?: string;
  model?: string;
}

export interface ConnectivityEndpoint {
  label?: string;
  terminals?: TerminalCapability[];
}

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

export type CommercialRegulatoryConfidence =
  | 'confirmed'
  | 'estimated'
  | 'restricted'
  | 'pending'
  | 'blocked';

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
  /** Active service direction one-way latency used by LAT-labelled surfaces. */
  oneWayLatencyMs?: number;
  rttMs?: number;
  downloadEstimated?: boolean;
  uploadEstimated?: boolean;
  /**
   * #4: true when the throughput is an RF-limited ESTIMATED CEILING (no known modem
   * cap at both endpoints), not a delivered rate. UIs must mark it as estimated.
   */
  throughputEstimated?: boolean;
  routeSummary?: string;
  limitingFactor?: string;
  technicalLimitingFactor?: string;
  regulatoryConfidence?: CommercialRegulatoryConfidence;
  strengths: string[];
  /** Indicative link availability (%, 0-100) for THIS technology. Estimated, not an SLA. */
  availabilityPct?: number | null;
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
  evaluationState: CommercialEvaluationState;
  serviceStatus: CommercialStatus;
  serviceMessage?: string;
  technology: CommercialTechnology;
  /** Presentation-only display technology — selected by the customer-facing GEO/LEO frame.
   *  The single narrative source for all commercial panels and the globe. */
  commercialDisplayTechnology: 'LEO' | 'GEO';
  /** The user's active connectivity tab captured for context/debugging. */
  contextTechnology: 'LEO' | 'GEO';
  siteA?: {
    name: string;
  };
  siteB?: {
    name: string;
  };
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  downloadEstimated?: boolean;
  uploadEstimated?: boolean;
  /** #4: throughput above is an RF-limited estimated ceiling, not a delivered rate. */
  throughputEstimated?: boolean;
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
    satelliteNameA?: string;
    satelliteNameB?: string;
    satelliteOrbit?: string;
    satelliteStatus?: string;
    elevation?: string;
    elevationA?: string;
    elevationB?: string;
    linkQualityA?: string;
    linkQualityB?: string;
    capacityContributionA?: string;
    capacityContributionB?: string;
    beamName?: string;
    rfStatus?: string;
    regulatoryState?: string;
    routeValue?: string;
    routeSummary?: string;
    terminalLabel?: string;
    pathStability?: string;
    confidence?: string;
    confidenceNote?: string;
    predictionConfidence?: PredictionConfidence;
    availabilityContext?: string;
    assumptionsSummary?: string;
    backboneDistance?: string;
    logicalPop?: string;
    snpA?: string;
    snpB?: string;
    destinationType?: string;
    destinationEndpointRole?: string;
    destinationEndpointKind?: 'customer' | 'geo_gateway';
    destinationTechnology?: string;
    destinationStationModel?: string;
    destinationLocation?: string;
    destinationGatewayName?: string;
    destinationGatewayCoverage?: string;
    destinationGatewayConfidence?: string;
    destinationReceivingSide?: string;
    destinationDirection?: 'satellite_to_gateway' | 'satellite_to_site';
    rawServiceStatus?: string;
    rawPrimaryWarning?: string;
    rawBottleneck?: string;
    rawGeoStatus?: string;
    rawLeoStatus?: string;
  };
}

// Internal geometry point type — not part of the public commercial API but
// shared between the helpers and builder layers.
export interface CommercialPoint {
  lat: number;
  lng: number;
  altitude?: number;
}
