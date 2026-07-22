import type { PredictionConfidence } from '../../utils/predictionConfidence';

export type CommercialStatus = 'active' | 'degraded' | 'blocked' | 'unknown';

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
  rttMs?: number;
  routeSummary?: string;
  limitingFactor?: string;
  technicalLimitingFactor?: string;
  regulatoryConfidence?: CommercialRegulatoryConfidence;
  strengths: string[];
  // ── Objective-scoring criteria (E). All optional and nullable: `null`/absent
  // means "unknown", never zero. Populated by the ENG→COMM seam in E2; until
  // then they stay unknown and the objective engine excludes them from scoring.
  /** Delivered throughput under modelled load (Mbps). */
  sustainedMbps?: number | null;
  /** RF-potential throughput, clear-sky boresight (Mbps). */
  theoreticalMbps?: number | null;
  /** Indicative link availability (%). Estimated, not an SLA. */
  availabilityPct?: number | null;
  /** Fraction of time the service is usable (0-1). */
  dutyCycle?: number | null;
  /** Equivalent users sharing capacity (>= 1); lower is better. */
  contentionRatio?: number | null;
  /** Consolidated service/route diversity (0-1); satellite/gateway/route are underlying evidence. */
  serviceDiversity?: number | null;
  /** Explicit terminal-profile mobility compatibility. `null` = unknown (not eliminating). */
  mobilityCompatible?: boolean | null;
}

export interface CommercialRecommendation {
  technology: CommercialRecommendedTechnology;
  reasonCategory: CommercialRecommendationReasonCategory;
  label: string;
  chipLabel: string;
  reason: string;
  message: string;
  expectedExperience: string;
  // ── Objective-aware explainability (E). Populated only when an objective is
  // supplied; the legacy path leaves these undefined (behaviour unchanged).
  objective?: import('./commercialObjective').CommercialObjective;
  favorableFactors?: string[];
  limitingFactors?: string[];
  /** Criteria compared across BOTH technologies (used in the score). */
  commonCriteria?: string[];
  /** Weighted criteria known for exactly ONE technology (explanatory, not discriminating). */
  nonComparableCriteria?: string[];
  /** Weighted criteria unknown for BOTH technologies. */
  unknownCriteria?: string[];
  /**
   * RELATIVE comparison gap between the two options on the common base (0-1).
   * A preference signal, not an absolute-fitness gap.
   */
  scoreGap?: number;
  /**
   * Scope of the score. `relative_comparison` means the recommendation ranks the
   * present options against each other, NOT against an absolute service need.
   */
  assessmentBasis?: 'relative_comparison';
  confidence?: import('./commercialObjective').CommercialRecommendationConfidence;
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
