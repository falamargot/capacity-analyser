import type { TerminalCapability as CommercialTerminalCapability } from '../components/commercial/commercialTypes';
import {
  DEFAULT_DESTINATION_TERMINAL_DEFINITION_IDS,
  DEFAULT_ORIGIN_TERMINAL_DEFINITION_IDS,
  TERMINAL_CAPABILITY_CATALOG,
  type TerminalCapabilityDefinition,
  type TerminalEngineeringProfileReference,
  type TerminalTechnology,
} from '../data/terminalCapabilityCatalog';
import type { ScenarioEndpoint, TerminalCapability } from '../types/connectivityScenario';

export interface CommercialTerminalChipInput {
  id: string;
  technology: TerminalTechnology;
  band?: string;
  label?: string;
  model?: string;
}

export function getTerminalDefinitionById(id: string | null | undefined): TerminalCapabilityDefinition | undefined {
  if (!id) return undefined;
  return TERMINAL_CAPABILITY_CATALOG.find((definition) => definition.id === id);
}

export function getTerminalDefinitionsByTechnology(technology: TerminalTechnology): TerminalCapabilityDefinition[] {
  return TERMINAL_CAPABILITY_CATALOG.filter((definition) => definition.technology === technology);
}

function normalize(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function findDefinitionByCommercialChip(terminal: CommercialTerminalChipInput): TerminalCapabilityDefinition | undefined {
  const directMatch = getTerminalDefinitionById(terminal.id);
  if (directMatch) return directMatch;

  if (terminal.technology === 'geo') {
    const band = normalize(terminal.band);
    const label = normalize(terminal.label);
    const combinedLabel = normalize([terminal.band, terminal.label].filter(Boolean).join(' '));

    return TERMINAL_CAPABILITY_CATALOG.find((definition) => (
      definition.technology === 'geo'
      && (
        normalize(definition.commercialShortLabel) === combinedLabel
        || (
          normalize(definition.band) === band
          && normalize(definition.commercialLabel) === label
        )
      )
    ));
  }

  const model = normalize(terminal.model ?? terminal.label);
  return TERMINAL_CAPABILITY_CATALOG.find((definition) => (
    definition.technology === 'leo'
    && (
      normalize(definition.commercialShortLabel) === model
      || normalize(definition.terminalModel) === model
      || normalize(definition.engineeringLabel) === model
    )
  ));
}

function findDefinitionForCapability(capability: TerminalCapability): TerminalCapabilityDefinition | undefined {
  const directMatch = getTerminalDefinitionById(capability.id);
  if (directMatch) return directMatch;

  const terminalModel = normalize(capability.terminalModel);
  return TERMINAL_CAPABILITY_CATALOG.find((definition) => (
    definition.technology === capability.technology
    && (
      normalize(definition.terminalModel) === terminalModel
      || normalize(definition.commercialShortLabel) === terminalModel
      || normalize(definition.engineeringLabel) === terminalModel
    )
  ));
}

export function terminalDefinitionToScenarioCapability(
  definition: TerminalCapabilityDefinition,
): TerminalCapability {
  return {
    id: definition.id,
    technology: definition.technology,
    terminalModel: definition.terminalModel,
    category: definition.category,
  };
}

export function commercialTerminalChipToScenarioCapability(
  terminal: CommercialTerminalChipInput,
): TerminalCapability {
  const definition = findDefinitionByCommercialChip(terminal);
  if (definition) return terminalDefinitionToScenarioCapability(definition);

  const fallbackModel = terminal.model?.trim()
    || [terminal.band, terminal.label].filter(Boolean).join(' ').trim()
    || terminal.label?.trim()
    || (terminal.technology === 'geo' ? 'GEO terminal' : 'LEO terminal');

  return {
    id: terminal.id,
    technology: terminal.technology,
    terminalModel: fallbackModel,
    category: 'fixed',
  };
}

export function terminalCapabilityToCommercialChip(
  capability: TerminalCapability,
): CommercialTerminalCapability {
  const definition = findDefinitionForCapability(capability);
  if (definition?.technology === 'geo') {
    return {
      id: capability.id,
      technology: 'geo',
      band: definition.band,
      label: definition.commercialLabel,
    };
  }

  if (definition?.technology === 'leo') {
    return {
      id: capability.id,
      technology: 'leo',
      model: definition.commercialShortLabel,
    };
  }

  if (capability.technology === 'geo') {
    return {
      id: capability.id,
      technology: 'geo',
      label: capability.terminalModel,
    };
  }

  return {
    id: capability.id,
    technology: 'leo',
    model: capability.terminalModel,
  };
}

export function terminalDefinitionToCommercialChip(
  definition: TerminalCapabilityDefinition,
): CommercialTerminalCapability {
  return terminalCapabilityToCommercialChip(terminalDefinitionToScenarioCapability(definition));
}

export function terminalCapabilityToShortLabel(capability: TerminalCapability): string {
  return findDefinitionForCapability(capability)?.commercialShortLabel ?? capability.terminalModel;
}

export function terminalCapabilityToEngineeringLabel(capability: TerminalCapability): string {
  return findDefinitionForCapability(capability)?.engineeringLabel ?? capability.terminalModel;
}

export function terminalCapabilityToEngineeringProfileReference(
  capability: TerminalCapability,
): TerminalEngineeringProfileReference | undefined {
  const definition = findDefinitionForCapability(capability);
  if (!definition) return undefined;

  return {
    technology: definition.technology,
    rfProfileId: definition.rfProfileId,
    engineeringProfileKey: definition.engineeringProfileKey,
    sourceModelId: definition.sourceModelId,
  };
}

function definitionsByIds(ids: readonly string[]): TerminalCapabilityDefinition[] {
  return ids.map((id) => getTerminalDefinitionById(id)).filter((definition): definition is TerminalCapabilityDefinition => Boolean(definition));
}

export function getDefaultCommercialTerminalsForEndpoint(
  endpoint: 'origin' | 'destination',
): CommercialTerminalCapability[] {
  const ids = endpoint === 'origin'
    ? DEFAULT_ORIGIN_TERMINAL_DEFINITION_IDS
    : DEFAULT_DESTINATION_TERMINAL_DEFINITION_IDS;

  return definitionsByIds(ids).map(terminalDefinitionToCommercialChip);
}

export function getEndpointTerminalCapabilities(endpoint: ScenarioEndpoint | undefined): TerminalCapability[] {
  return endpoint?.terminalCapabilities ?? [];
}

export function getEndpointTerminalDefinitions(endpoint: ScenarioEndpoint | undefined): TerminalCapabilityDefinition[] {
  return getEndpointTerminalCapabilities(endpoint)
    .map(findDefinitionForCapability)
    .filter((definition): definition is TerminalCapabilityDefinition => Boolean(definition));
}

export function getCommercialTerminalChips(endpoint: ScenarioEndpoint | undefined): CommercialTerminalCapability[] {
  return getEndpointTerminalCapabilities(endpoint).map(terminalCapabilityToCommercialChip);
}

export function hasGeoTerminal(endpoint: ScenarioEndpoint | undefined): boolean {
  return getEndpointTerminalCapabilities(endpoint).some((terminal) => terminal.technology === 'geo');
}

export function hasLeoTerminal(endpoint: ScenarioEndpoint | undefined): boolean {
  return getEndpointTerminalCapabilities(endpoint).some((terminal) => terminal.technology === 'leo');
}
