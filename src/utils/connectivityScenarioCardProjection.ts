import type {
  ConnectivityEndpoint,
  ConnectivityScenarioType,
} from '../components/commercial/commercialTypes';
import type {
  ConnectivityScenario,
  ScenarioEndpointKey,
  ScenarioServicePattern,
  TerminalCapability,
} from '../types/connectivityScenario';
import {
  getDestinationCapabilities,
  getOriginCapabilities,
} from './connectivityScenarioSelectors';
import { terminalCapabilityToCommercialChip } from './terminalCapabilityMapping';

export interface ConnectivityScenarioCardProjection {
  origin?: ConnectivityEndpoint;
  destination?: ConnectivityEndpoint;
  scenarioType: ConnectivityScenarioType;
}

export interface ConnectivityScenarioCardProjectionOptions {
  originLabelOverride?: string;
  destinationLabelOverride?: string;
  fallbackScenarioType?: ConnectivityScenarioType;
}

export function getScenarioTechnologySummary(scenario: ConnectivityScenario): {
  origin: TerminalCapability[];
  destination: TerminalCapability[];
} {
  return {
    origin: getOriginCapabilities(scenario),
    destination: getDestinationCapabilities(scenario),
  };
}

export function servicePatternToConnectivityScenarioType(
  servicePattern: ScenarioServicePattern,
  fallbackScenarioType: ConnectivityScenarioType = 'site_to_site',
): ConnectivityScenarioType {
  if (servicePattern === 'network-access') return 'network_access';
  if (servicePattern === 'site-to-site') return 'site_to_site';
  return fallbackScenarioType;
}

export function connectivityScenarioTypeFromDestinationType(destinationType: string | undefined): ConnectivityScenarioType {
  const normalizedDestinationType = destinationType?.toLowerCase() ?? '';

  if (
    normalizedDestinationType.includes('snp')
    || normalizedDestinationType.includes('portal')
    || normalizedDestinationType.includes('gateway')
    || normalizedDestinationType.includes('network')
  ) {
    return 'network_access';
  }

  return 'site_to_site';
}

export function getScenarioEndpointDisplay(
  scenario: ConnectivityScenario,
  endpoint: ScenarioEndpointKey,
  labelOverride?: string,
): ConnectivityEndpoint | undefined {
  const selectedEndpoint = endpoint === 'origin' ? scenario.origin : scenario.destination;
  if (!selectedEndpoint?.location) return undefined;

  const label = labelOverride?.trim() || selectedEndpoint.location.label;
  return {
    label,
    terminals: selectedEndpoint.terminalCapabilities.map(terminalCapabilityToCommercialChip),
  };
}

export function scenarioToConnectivityScenarioCard(
  scenario: ConnectivityScenario,
  options: ConnectivityScenarioCardProjectionOptions = {},
): ConnectivityScenarioCardProjection {
  return {
    origin: getScenarioEndpointDisplay(scenario, 'origin', options.originLabelOverride),
    destination: getScenarioEndpointDisplay(scenario, 'destination', options.destinationLabelOverride),
    scenarioType: servicePatternToConnectivityScenarioType(
      scenario.servicePattern,
      options.fallbackScenarioType,
    ),
  };
}
