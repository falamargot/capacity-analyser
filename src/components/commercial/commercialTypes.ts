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
  /** Presentation-only display technology — derived from the recommendation.
   *  The single narrative source for all commercial panels and the globe. */
  commercialDisplayTechnology: 'LEO' | 'GEO';
  /** The user's active connectivity tab — shown only as context, never drives narrative. */
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

// Internal geometry point type — not part of the public commercial API but
// shared between the helpers and builder layers.
export interface CommercialPoint {
  lat: number;
  lng: number;
  altitude?: number;
}
