export interface ConnectivityScenario {
  id: string;
  origin?: ScenarioEndpoint;
  destination?: ScenarioEndpoint;
  servicePattern: ScenarioServicePattern;
  trafficIntent?: ScenarioTrafficIntent;
  geoServiceTopology?: GeoServiceTopology;
  /** Optional customer priority. Absent keeps the historical recommendation path. */
  commercialObjective?: ScenarioCommercialObjective;
  /** Throughput direction used by objective-aware scoring. */
  commercialTrafficDirection?: ScenarioCommercialTrafficDirection;
  /** Explicit primary link for BACKUP. Never inferred. */
  commercialPrimaryTechnology?: ScenarioCommercialPrimaryTechnology;
}

export type ScenarioCommercialObjective =
  | 'REALTIME'
  | 'BROADCAST'
  | 'MOBILITY'
  | 'BACKUP'
  | 'BULK'
  | 'RESILIENCE';

export type ScenarioCommercialTrafficDirection = 'DOWNLINK' | 'UPLINK' | 'BIDIRECTIONAL';

export type ScenarioCommercialPrimaryTechnology = 'GEO' | 'LEO' | 'TERRESTRIAL' | 'OTHER';

export interface ScenarioEndpoint {
  id: string;
  location?: LocationReference;
  endpointRole: ScenarioEndpointRole;
  endpointKind: ScenarioEndpointKind;
  terminalCapabilities: TerminalCapability[];
}

export interface LocationReference {
  label: string;
  lat: number;
  lng: number;
  altitudeKm?: number;
  source?: LocationReferenceSource;
  externalId?: string;
}

export type LocationReferenceSource =
  | 'location-search'
  | 'globe-click'
  | 'saved-site'
  | 'aircraft'
  | 'vessel'
  | 'gateway'
  | 'snp';

export type ScenarioServicePattern =
  | 'single-endpoint'
  | 'network-access'
  | 'site-to-site';

export type ScenarioTrafficIntent =
  | 'bidirectional'
  | 'a-to-b'
  | 'b-to-a';

export type ScenarioEndpointRole =
  | 'customer'
  | 'infrastructure'
  | 'network-access';

export type ScenarioEndpointKind =
  | 'site'
  | 'gateway'
  | 'snp'
  | 'pop'
  | 'network'
  | 'aircraft'
  | 'vessel';

export type GeoServiceTopology =
  | 'gateway-access'
  | 'forward'
  | 'return'
  | 'mesh'
  | 'p2p';

export interface ScenarioTechnologyCapabilities {
  geoEnabled: boolean;
  leoEnabled: boolean;
}

export interface TerminalCapability {
  id: string;
  technology: 'geo' | 'leo';
  terminalModel: string;
  category: 'fixed' | 'mobility' | 'maritime' | 'aviation';
}

export type ScenarioEndpointKey = 'origin' | 'destination';
