import type {
  ConnectivityScenario,
  GeoServiceTopology,
  LocationReference,
  ScenarioEndpoint,
  ScenarioEndpointKind,
  ScenarioEndpointRole,
  ScenarioServicePattern,
  ScenarioTrafficIntent,
  TerminalCapability,
} from '../types/connectivityScenario';
import {
  commercialTerminalChipToScenarioCapability,
  terminalCapabilityToCommercialChip,
} from './terminalCapabilityMapping';

export type LegacyLinkMode = 'STAR_FORWARD' | 'STAR_RETURN' | 'MESH' | 'POINT_TO_POINT';
export type LegacyLeoTopologyMode = 'SINGLE_SITE' | 'SITE_TO_SITE';
export type LegacyMeshTab = 'forward' | 'reverse';
export type LegacyDestinationType = 'site' | 'gateway' | 'snp' | 'network';

export interface LegacyPointReference {
  lat: number;
  lng: number;
  altitude?: number;
}

export interface LegacyCommercialTerminal {
  id: string;
  technology: 'geo' | 'leo';
  band?: string;
  label?: string;
  model?: string;
}

export interface LegacyConnectivityScenarioInput {
  id?: string;
  activeAnalysisPoint?: LegacyPointReference | null;
  activeAnalysisPointLabel?: string | null;
  activeAnalysisPointSource?: LocationReference['source'];
  siteB?: LegacyPointReference | null;
  siteBLabel?: string | null;
  linkMode?: LegacyLinkMode;
  activeMeshTab?: LegacyMeshTab;
  leoTopologyMode?: LegacyLeoTopologyMode;
  destinationType?: LegacyDestinationType;
  originRole?: ScenarioEndpointRole;
  originKind?: ScenarioEndpointKind;
  destinationRole?: ScenarioEndpointRole;
  destinationKind?: ScenarioEndpointKind;
  originTerminals?: LegacyCommercialTerminal[];
  destinationTerminals?: LegacyCommercialTerminal[];
}

export interface CommercialRouteSelectorEndpoint {
  label?: string;
  terminals?: LegacyCommercialTerminal[];
}

export interface CommercialRouteSelectorRoute {
  origin?: CommercialRouteSelectorEndpoint;
  destination?: CommercialRouteSelectorEndpoint;
}

function formatFallbackCoordinates(point: LegacyPointReference): string {
  return `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`;
}

function locationFromLegacyPoint(
  point: LegacyPointReference,
  label: string | null | undefined,
  source: LocationReference['source'] = 'globe-click',
): LocationReference {
  return {
    label: label?.trim() || formatFallbackCoordinates(point),
    lat: point.lat,
    lng: point.lng,
    altitudeKm: point.altitude,
    source,
  };
}

function endpointKindFromLegacyDestinationType(type: LegacyDestinationType | undefined): ScenarioEndpointKind {
  if (type === 'gateway') return 'gateway';
  if (type === 'snp') return 'snp';
  if (type === 'network') return 'network';
  return 'site';
}

function endpointRoleFromKind(kind: ScenarioEndpointKind): ScenarioEndpointRole {
  if (kind === 'gateway' || kind === 'snp' || kind === 'pop') return 'infrastructure';
  if (kind === 'network') return 'network-access';
  return 'customer';
}

function servicePatternFromLegacy(input: LegacyConnectivityScenarioInput, destinationKind: ScenarioEndpointKind): ScenarioServicePattern {
  if (destinationKind === 'network' || destinationKind === 'gateway' || destinationKind === 'snp' || destinationKind === 'pop') {
    return 'network-access';
  }

  const hasSiteDestination = Boolean(input.siteB);
  const isLeoSiteToSite = input.leoTopologyMode === 'SITE_TO_SITE';
  const isGeoSiteToSite = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';

  if (hasSiteDestination || isLeoSiteToSite || isGeoSiteToSite) return 'site-to-site';
  return 'single-endpoint';
}

function trafficIntentFromLegacy(input: LegacyConnectivityScenarioInput, servicePattern: ScenarioServicePattern): ScenarioTrafficIntent | undefined {
  if (servicePattern !== 'site-to-site') return undefined;
  if (input.activeMeshTab === 'reverse') return 'b-to-a';
  if (input.activeMeshTab === 'forward') return 'a-to-b';
  return 'bidirectional';
}

function geoServiceTopologyFromLegacy(
  input: LegacyConnectivityScenarioInput,
  servicePattern: ScenarioServicePattern,
  destinationKind: ScenarioEndpointKind,
): GeoServiceTopology | undefined {
  const topology = input.linkMode ? geoServiceTopologyFromLegacyLinkMode(input.linkMode) : undefined;
  if (topology) return topology;
  if (destinationKind === 'gateway' || destinationKind === 'network') return 'gateway-access';
  if (servicePattern === 'site-to-site') return 'mesh';
  return undefined;
}

export function geoServiceTopologyFromLegacyLinkMode(linkMode: LegacyLinkMode): GeoServiceTopology {
  if (linkMode === 'STAR_FORWARD') return 'forward';
  if (linkMode === 'STAR_RETURN') return 'return';
  if (linkMode === 'MESH') return 'mesh';
  return 'p2p';
}

export function legacyCommercialTerminalsToScenarioTerminals(
  terminals: LegacyCommercialTerminal[] | undefined,
): TerminalCapability[] {
  return terminals?.map((terminal) => commercialTerminalChipToScenarioCapability(terminal)) ?? [];
}

function legacyTerminalFromScenarioTerminal(terminal: TerminalCapability): LegacyCommercialTerminal {
  return terminalCapabilityToCommercialChip(terminal);
}

function buildEndpoint(
  id: string,
  point: LegacyPointReference | null | undefined,
  label: string | null | undefined,
  endpointRole: ScenarioEndpointRole,
  endpointKind: ScenarioEndpointKind,
  terminals: LegacyCommercialTerminal[] | undefined,
  source?: LocationReference['source'],
): ScenarioEndpoint | undefined {
  if (!point) return undefined;

  return {
    id,
    location: locationFromLegacyPoint(point, label, source),
    endpointRole,
    endpointKind,
    terminalCapabilities: legacyCommercialTerminalsToScenarioTerminals(terminals),
  };
}

export function buildConnectivityScenarioFromLegacyState(input: LegacyConnectivityScenarioInput): ConnectivityScenario {
  const destinationKind = input.destinationKind ?? endpointKindFromLegacyDestinationType(input.destinationType);
  const destinationRole = input.destinationRole ?? endpointRoleFromKind(destinationKind);
  const servicePattern = servicePatternFromLegacy(input, destinationKind);
  const trafficIntent = trafficIntentFromLegacy(input, servicePattern);
  const geoServiceTopology = geoServiceTopologyFromLegacy(input, servicePattern, destinationKind);

  return {
    id: input.id ?? 'legacy-current-scenario',
    origin: buildEndpoint(
      'origin',
      input.activeAnalysisPoint,
      input.activeAnalysisPointLabel,
      input.originRole ?? 'customer',
      input.originKind ?? 'site',
      input.originTerminals,
      input.activeAnalysisPointSource,
    ),
    destination: buildEndpoint(
      'destination',
      input.siteB,
      input.siteBLabel,
      destinationRole,
      destinationKind,
      input.destinationTerminals,
    ),
    servicePattern,
    trafficIntent,
    geoServiceTopology,
  };
}

export function scenarioToCommercialRouteSelector(scenario: ConnectivityScenario): CommercialRouteSelectorRoute {
  return {
    origin: scenario.origin?.location
      ? {
        label: scenario.origin.location.label,
        terminals: scenario.origin.terminalCapabilities.map(legacyTerminalFromScenarioTerminal),
      }
      : undefined,
    destination: scenario.destination?.location
      ? {
        label: scenario.destination.location.label,
        terminals: scenario.destination.terminalCapabilities.map(legacyTerminalFromScenarioTerminal),
      }
      : undefined,
  };
}
