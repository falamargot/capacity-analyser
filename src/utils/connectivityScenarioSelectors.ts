import type {
  ConnectivityScenario,
  GeoServiceTopology,
  ScenarioEndpoint,
  ScenarioEndpointKey,
  ScenarioTechnologyCapabilities,
  TerminalCapability,
} from '../types/connectivityScenario';

function hasTerminalTechnology(endpoint: ScenarioEndpoint | undefined, technology: TerminalCapability['technology']): boolean {
  return endpoint?.terminalCapabilities.some((terminal) => terminal.technology === technology) ?? false;
}

function isCustomerEndpoint(endpoint: ScenarioEndpoint | undefined): boolean {
  return endpoint?.endpointRole === 'customer';
}

function isInfrastructureDestination(endpoint: ScenarioEndpoint | undefined): boolean {
  return endpoint?.endpointRole === 'infrastructure';
}

function isNetworkAccessDestination(endpoint: ScenarioEndpoint | undefined): boolean {
  return endpoint?.endpointRole === 'network-access' || endpoint?.endpointKind === 'network';
}

function isSnpOrPopDestination(endpoint: ScenarioEndpoint | undefined): boolean {
  return endpoint?.endpointKind === 'snp' || endpoint?.endpointKind === 'pop';
}

function geoTopologyNeedsGateway(topology: GeoServiceTopology | undefined): boolean {
  return topology === 'gateway-access' || topology === 'forward' || topology === 'return';
}

export function scenarioRequiresDestination(scenario: ConnectivityScenario): boolean {
  return scenario.servicePattern === 'site-to-site' || scenario.servicePattern === 'network-access';
}

export function getGeoServiceTopology(scenario: ConnectivityScenario): GeoServiceTopology | undefined {
  if (scenario.geoServiceTopology) return scenario.geoServiceTopology;

  if (scenario.servicePattern === 'site-to-site') return 'mesh';
  if (scenario.servicePattern === 'network-access') return 'gateway-access';

  return undefined;
}

export function geoTopologyRequiresGateway(scenario: ConnectivityScenario): boolean {
  return geoTopologyNeedsGateway(getGeoServiceTopology(scenario));
}

export function canAnalyzeGeo(scenario: ConnectivityScenario): boolean {
  if (!hasTerminalTechnology(scenario.origin, 'geo')) return false;

  const topology = getGeoServiceTopology(scenario);
  if (topology === 'mesh' || topology === 'p2p') {
    return hasTerminalTechnology(scenario.destination, 'geo');
  }

  if (geoTopologyNeedsGateway(topology)) {
    return true;
  }

  if (scenario.servicePattern === 'network-access') {
    return true;
  }

  if (scenario.servicePattern === 'site-to-site' && isCustomerEndpoint(scenario.destination)) {
    return hasTerminalTechnology(scenario.destination, 'geo');
  }

  if (isInfrastructureDestination(scenario.destination) || isNetworkAccessDestination(scenario.destination)) {
    return true;
  }

  return !scenarioRequiresDestination(scenario);
}

export function canAnalyzeLeo(scenario: ConnectivityScenario): boolean {
  if (!hasTerminalTechnology(scenario.origin, 'leo')) return false;

  if (scenario.servicePattern === 'site-to-site' && isCustomerEndpoint(scenario.destination)) {
    return hasTerminalTechnology(scenario.destination, 'leo');
  }

  if (
    scenario.servicePattern === 'network-access'
    || isNetworkAccessDestination(scenario.destination)
    || isSnpOrPopDestination(scenario.destination)
  ) {
    return true;
  }

  return !scenarioRequiresDestination(scenario);
}

export function getScenarioTechnologyCapabilities(scenario: ConnectivityScenario): ScenarioTechnologyCapabilities {
  return {
    geoEnabled: canAnalyzeGeo(scenario),
    leoEnabled: canAnalyzeLeo(scenario),
  };
}

export function getScenarioEndpointCapabilities(
  scenario: ConnectivityScenario,
  endpoint: ScenarioEndpointKey,
): TerminalCapability[] {
  const selectedEndpoint = endpoint === 'origin' ? scenario.origin : scenario.destination;
  return selectedEndpoint?.terminalCapabilities ?? [];
}

export function getOriginCapabilities(scenario: ConnectivityScenario): TerminalCapability[] {
  return getScenarioEndpointCapabilities(scenario, 'origin');
}

export function getDestinationCapabilities(scenario: ConnectivityScenario): TerminalCapability[] {
  return getScenarioEndpointCapabilities(scenario, 'destination');
}

export function hasGeoTerminal(endpoint: ScenarioEndpoint | undefined): boolean {
  return hasTerminalTechnology(endpoint, 'geo');
}

export function hasLeoTerminal(endpoint: ScenarioEndpoint | undefined): boolean {
  return hasTerminalTechnology(endpoint, 'leo');
}

export function getScenarioEndpointLabel(scenario: ConnectivityScenario, endpoint: ScenarioEndpointKey): string {
  const selectedEndpoint = endpoint === 'origin' ? scenario.origin : scenario.destination;
  if (selectedEndpoint?.location?.label?.trim()) return selectedEndpoint.location.label;
  return endpoint === 'origin' ? 'Set origin' : 'Set destination';
}

export function getScenarioSummaryLabel(scenario: ConnectivityScenario): string {
  const origin = getScenarioEndpointLabel(scenario, 'origin');

  if (scenario.servicePattern === 'single-endpoint' && !scenario.destination?.location) {
    return origin;
  }

  const destination = getScenarioEndpointLabel(scenario, 'destination');
  const arrow = scenario.trafficIntent === 'b-to-a' ? '<-' : '->';
  return `${origin} ${arrow} ${destination}`;
}
