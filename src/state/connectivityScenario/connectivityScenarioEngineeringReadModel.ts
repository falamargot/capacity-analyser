import type {
  ConnectivityScenario,
  ScenarioEndpoint,
  ScenarioEndpointKey,
  TerminalCapability,
} from '../../types/connectivityScenario';
import {
  terminalCapabilityToEngineeringLabel,
  terminalCapabilityToEngineeringProfileReference,
} from '../../utils/terminalCapabilityMapping';
import {
  buildEngineeringEndpointTerminalCapabilities,
  type EngineeringEndpointTerminalSelection,
} from './connectivityScenarioEngineeringSync';

export interface EngineeringGeoTerminalReadModel {
  terminalCapabilityId: string;
  rfProfileId: string;
  label: string;
}

export interface EngineeringLeoTerminalReadModel {
  terminalCapabilityId: string;
  engineeringProfileKey: string;
  label: string;
}

export interface EngineeringTerminalReadModel {
  endpoint: ScenarioEndpointKey;
  geoTerminal?: EngineeringGeoTerminalReadModel;
  leoTerminal?: EngineeringLeoTerminalReadModel;
  unsupportedTerminalIds: string[];
}

export interface EngineeringScenarioReadModel {
  origin?: EngineeringTerminalReadModel;
  destination?: EngineeringTerminalReadModel;
}

export interface LegacyEngineeringTerminalSelection extends EngineeringEndpointTerminalSelection {
  endpoint: ScenarioEndpointKey;
}

export type EngineeringReadModelParityIssueSeverity = 'error' | 'warning';

export type EngineeringReadModelParityIssueCode =
  | 'MISSING_ENDPOINT'
  | 'ENDPOINT_MISMATCH'
  | 'MISSING_GEO_TERMINAL'
  | 'MISSING_LEO_TERMINAL'
  | 'MISMATCHED_GEO_RF_PROFILE'
  | 'MISMATCHED_LEO_ENGINEERING_PROFILE'
  | 'MISMATCHED_LABEL'
  | 'UNSUPPORTED_PLACEHOLDER';

export interface EngineeringReadModelParityIssue {
  severity: EngineeringReadModelParityIssueSeverity;
  code: EngineeringReadModelParityIssueCode;
  endpoint: ScenarioEndpointKey;
  terminalCapabilityId?: string;
  message: string;
}

export interface EngineeringReadModelParitySummary {
  comparedEndpointCount: number;
  missingEndpointCount: number;
  unsupportedPlaceholderCount: number;
}

export interface EngineeringReadModelParityReport {
  ok: boolean;
  issues: EngineeringReadModelParityIssue[];
  summary: EngineeringReadModelParitySummary;
}

export interface EngineeringTerminalDisplayLabelInput {
  legacyLabel: string;
  scenarioReadModelLabel?: string | null;
  parityOk: boolean;
}

export function resolveEngineeringTerminalDisplayLabel({
  legacyLabel,
  scenarioReadModelLabel,
  parityOk,
}: EngineeringTerminalDisplayLabelInput): string {
  const candidate = scenarioReadModelLabel?.trim();
  if (parityOk && candidate) return candidate;
  return legacyLabel;
}

function emptyReadModel(endpoint: ScenarioEndpointKey): EngineeringTerminalReadModel {
  return {
    endpoint,
    unsupportedTerminalIds: [],
  };
}

function readTerminalIntoModel(
  model: EngineeringTerminalReadModel,
  terminal: TerminalCapability,
): void {
  const reference = terminalCapabilityToEngineeringProfileReference(terminal);
  if (!reference) {
    if (terminal.id.startsWith('unsupported.')) {
      model.unsupportedTerminalIds.push(terminal.id);
    }
    return;
  }

  const label = terminalCapabilityToEngineeringLabel(terminal);
  if (terminal.technology === 'geo' && reference.rfProfileId) {
    model.geoTerminal = {
      terminalCapabilityId: terminal.id,
      rfProfileId: reference.rfProfileId,
      label,
    };
    return;
  }

  if (terminal.technology === 'leo' && reference.engineeringProfileKey) {
    model.leoTerminal = {
      terminalCapabilityId: terminal.id,
      engineeringProfileKey: reference.engineeringProfileKey,
      label,
    };
  }
}

export function buildEngineeringEndpointReadModelFromScenario(
  endpointKey: ScenarioEndpointKey,
  endpoint: ScenarioEndpoint | undefined,
): EngineeringTerminalReadModel | undefined {
  if (!endpoint) return undefined;

  const model = emptyReadModel(endpointKey);
  endpoint.terminalCapabilities.forEach((terminal) => readTerminalIntoModel(model, terminal));
  return model;
}

export function buildEngineeringTerminalReadModelFromScenario(
  scenario: ConnectivityScenario,
): EngineeringScenarioReadModel {
  return {
    origin: buildEngineeringEndpointReadModelFromScenario('origin', scenario.origin),
    destination: buildEngineeringEndpointReadModelFromScenario('destination', scenario.destination),
  };
}

export function buildLegacyEngineeringTerminalReadModel(
  selection: LegacyEngineeringTerminalSelection,
): EngineeringTerminalReadModel {
  const model = emptyReadModel(selection.endpoint);
  buildEngineeringEndpointTerminalCapabilities(selection)
    .forEach((terminal) => readTerminalIntoModel(model, terminal));
  return model;
}

function readModelForEndpoint(
  scenarioReadModel: EngineeringScenarioReadModel,
  endpoint: ScenarioEndpointKey,
): EngineeringTerminalReadModel | undefined {
  return endpoint === 'origin' ? scenarioReadModel.origin : scenarioReadModel.destination;
}

function addIssue(
  issues: EngineeringReadModelParityIssue[],
  issue: EngineeringReadModelParityIssue,
): void {
  issues.push(issue);
}

function compareGeoTerminal(
  legacy: EngineeringTerminalReadModel,
  scenario: EngineeringTerminalReadModel,
  issues: EngineeringReadModelParityIssue[],
): void {
  if (legacy.geoTerminal && !scenario.geoTerminal) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISSING_GEO_TERMINAL',
      endpoint: legacy.endpoint,
      terminalCapabilityId: legacy.geoTerminal.terminalCapabilityId,
      message: `Scenario read model is missing GEO terminal '${legacy.geoTerminal.terminalCapabilityId}'.`,
    });
    return;
  }

  if (!legacy.geoTerminal || !scenario.geoTerminal) return;

  if (legacy.geoTerminal.rfProfileId !== scenario.geoTerminal.rfProfileId) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISMATCHED_GEO_RF_PROFILE',
      endpoint: legacy.endpoint,
      terminalCapabilityId: scenario.geoTerminal.terminalCapabilityId,
      message: `Scenario GEO rfProfileId '${scenario.geoTerminal.rfProfileId}' does not match legacy '${legacy.geoTerminal.rfProfileId}'.`,
    });
  }

  if (legacy.geoTerminal.label !== scenario.geoTerminal.label) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISMATCHED_LABEL',
      endpoint: legacy.endpoint,
      terminalCapabilityId: scenario.geoTerminal.terminalCapabilityId,
      message: `Scenario GEO label '${scenario.geoTerminal.label}' does not match legacy '${legacy.geoTerminal.label}'.`,
    });
  }
}

function compareLeoTerminal(
  legacy: EngineeringTerminalReadModel,
  scenario: EngineeringTerminalReadModel,
  issues: EngineeringReadModelParityIssue[],
): void {
  if (legacy.leoTerminal && !scenario.leoTerminal) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISSING_LEO_TERMINAL',
      endpoint: legacy.endpoint,
      terminalCapabilityId: legacy.leoTerminal.terminalCapabilityId,
      message: `Scenario read model is missing LEO terminal '${legacy.leoTerminal.terminalCapabilityId}'.`,
    });
    return;
  }

  if (!legacy.leoTerminal || !scenario.leoTerminal) return;

  if (legacy.leoTerminal.engineeringProfileKey !== scenario.leoTerminal.engineeringProfileKey) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISMATCHED_LEO_ENGINEERING_PROFILE',
      endpoint: legacy.endpoint,
      terminalCapabilityId: scenario.leoTerminal.terminalCapabilityId,
      message: `Scenario LEO engineeringProfileKey '${scenario.leoTerminal.engineeringProfileKey}' does not match legacy '${legacy.leoTerminal.engineeringProfileKey}'.`,
    });
  }

  if (legacy.leoTerminal.label !== scenario.leoTerminal.label) {
    addIssue(issues, {
      severity: 'error',
      code: 'MISMATCHED_LABEL',
      endpoint: legacy.endpoint,
      terminalCapabilityId: scenario.leoTerminal.terminalCapabilityId,
      message: `Scenario LEO label '${scenario.leoTerminal.label}' does not match legacy '${legacy.leoTerminal.label}'.`,
    });
  }
}

export function compareEngineeringTerminalReadModelParity(
  legacyModels: EngineeringTerminalReadModel | EngineeringTerminalReadModel[],
  scenarioReadModel: EngineeringScenarioReadModel,
): EngineeringReadModelParityReport {
  const legacyList = Array.isArray(legacyModels) ? legacyModels : [legacyModels];
  const issues: EngineeringReadModelParityIssue[] = [];

  legacyList.forEach((legacy) => {
    const scenario = readModelForEndpoint(scenarioReadModel, legacy.endpoint);
    if (!scenario) {
      addIssue(issues, {
        severity: 'error',
        code: 'MISSING_ENDPOINT',
        endpoint: legacy.endpoint,
        message: `Scenario read model is missing endpoint '${legacy.endpoint}'.`,
      });
      return;
    }

    if (scenario.endpoint !== legacy.endpoint) {
      addIssue(issues, {
        severity: 'error',
        code: 'ENDPOINT_MISMATCH',
        endpoint: legacy.endpoint,
        message: `Scenario endpoint '${scenario.endpoint}' does not match legacy endpoint '${legacy.endpoint}'.`,
      });
    }

    scenario.unsupportedTerminalIds.forEach((terminalCapabilityId) => {
      addIssue(issues, {
        severity: 'warning',
        code: 'UNSUPPORTED_PLACEHOLDER',
        endpoint: legacy.endpoint,
        terminalCapabilityId,
        message: `Scenario read model contains unsupported terminal placeholder '${terminalCapabilityId}'.`,
      });
    });

    compareGeoTerminal(legacy, scenario, issues);
    compareLeoTerminal(legacy, scenario, issues);
  });

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
    summary: {
      comparedEndpointCount: legacyList.length,
      missingEndpointCount: issues.filter((issue) => issue.code === 'MISSING_ENDPOINT').length,
      unsupportedPlaceholderCount: issues.filter((issue) => issue.code === 'UNSUPPORTED_PLACEHOLDER').length,
    },
  };
}

export function diagnoseEngineeringReadModelParity(
  legacySelections: LegacyEngineeringTerminalSelection | LegacyEngineeringTerminalSelection[],
  scenario: ConnectivityScenario,
): EngineeringReadModelParityReport {
  const selectionList = Array.isArray(legacySelections) ? legacySelections : [legacySelections];
  const legacyModels = selectionList.map(buildLegacyEngineeringTerminalReadModel);
  return compareEngineeringTerminalReadModelParity(
    legacyModels,
    buildEngineeringTerminalReadModelFromScenario(scenario),
  );
}
