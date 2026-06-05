import {
  getEnabledLeoTerminalCatalogEntries,
  type LeoTerminalCatalogEntry,
} from '../config/leoTerminals';
import {
  GEO_TERMINAL_RF_CATALOGUE,
  type TerminalRFClassId,
  type TerminalRFClassSpec,
  type TerminalUseCase,
} from '../utils/geoTerminalRFModel';
import type { GeoBand } from '../utils/geoLinkBudget';
import type { TerminalCapability } from '../types/connectivityScenario';

export type TerminalTechnology = TerminalCapability['technology'];
export type TerminalCategory = TerminalCapability['category'];

export interface TerminalEngineeringProfileReference {
  technology: TerminalTechnology;
  rfProfileId?: TerminalRFClassId;
  engineeringProfileKey?: string;
  sourceModelId?: string;
}

export interface TerminalCapabilityDefinition {
  id: string;
  technology: TerminalTechnology;
  terminalModel: string;
  commercialLabel: string;
  commercialShortLabel: string;
  band?: GeoBand;
  category: TerminalCategory;
  antennaType?: string;
  rfProfileId?: TerminalRFClassId;
  engineeringProfileKey?: string;
  sourceModelId?: string;
  engineeringLabel?: string;
  defaultParams?: never;
}

function definitionId(prefix: TerminalTechnology, sourceId: string): string {
  return `terminal.${prefix}.${sourceId.replace(/_/g, '-')}`;
}

function categoryFromUseCase(useCase: TerminalUseCase | undefined): TerminalCategory {
  if (useCase === 'aviation') return 'aero';
  if (useCase === 'maritime') return 'maritime';
  if (useCase === 'mobile') return 'mobility';
  return 'fixed';
}

function categoryFromLeoEntry(entry: LeoTerminalCatalogEntry): TerminalCategory {
  if (entry.uiCategory === 'aviation') return 'aero';
  if (entry.uiCategory === 'maritime') return 'maritime';
  if (entry.uiCategory === 'mobile') return 'mobility';
  return 'fixed';
}

function stripLeadingBand(label: string, band: GeoBand): string {
  return label.replace(new RegExp(`^${band}\\s+`, 'i'), '').trim();
}

function commercialLabelFromGeoSpec(spec: TerminalRFClassSpec): string {
  const withoutBand = stripLeadingBand(spec.label, spec.band);
  if (withoutBand === 'Standard VSAT') return 'VSAT';
  return withoutBand;
}

function commercialShortLabelFromGeoSpec(spec: TerminalRFClassSpec, commercialLabel: string): string {
  return `${spec.band} ${commercialLabel}`.trim();
}

function geoDefinitionFromRfSpec(spec: TerminalRFClassSpec): TerminalCapabilityDefinition {
  const commercialLabel = commercialLabelFromGeoSpec(spec);
  const commercialShortLabel = commercialShortLabelFromGeoSpec(spec, commercialLabel);

  return {
    id: definitionId('geo', spec.id),
    technology: 'geo',
    terminalModel: commercialShortLabel,
    commercialLabel,
    commercialShortLabel,
    band: spec.band,
    category: categoryFromUseCase(spec.typicalUseCases[0]),
    antennaType: spec.label,
    rfProfileId: spec.id,
    engineeringLabel: spec.label,
    sourceModelId: spec.id,
  };
}

function leoDefinitionFromCatalogEntry(entry: LeoTerminalCatalogEntry): TerminalCapabilityDefinition {
  return {
    id: definitionId('leo', entry.id),
    technology: 'leo',
    terminalModel: entry.model,
    commercialLabel: entry.model,
    commercialShortLabel: entry.model,
    band: entry.supportedBands[0],
    category: categoryFromLeoEntry(entry),
    antennaType: entry.antennaType,
    engineeringProfileKey: entry.id,
    engineeringLabel: `${entry.vendor} ${entry.model}`,
    sourceModelId: entry.id,
  };
}

export const TERMINAL_CAPABILITY_CATALOG: TerminalCapabilityDefinition[] = [
  ...GEO_TERMINAL_RF_CATALOGUE.map(geoDefinitionFromRfSpec),
  ...getEnabledLeoTerminalCatalogEntries().map(leoDefinitionFromCatalogEntry),
];

export const DEFAULT_ORIGIN_TERMINAL_DEFINITION_IDS = [
  'terminal.geo.ku-standard-vsat',
  'terminal.leo.intellian-ow70l',
] as const;

export const DEFAULT_DESTINATION_TERMINAL_DEFINITION_IDS = [
  'terminal.geo.ku-standard-vsat',
] as const;
