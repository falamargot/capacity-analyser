import type {
  ConnectivityScenario,
  ScenarioEndpoint,
  ScenarioEndpointKey,
  TerminalCapability,
} from '../../types/connectivityScenario';
import { getScenarioTechnologyCapabilities } from '../../utils/connectivityScenarioSelectors';
import {
  getTerminalDefinitionById,
  terminalCapabilityToEngineeringProfileReference,
} from '../../utils/terminalCapabilityMapping';

export type TerminalSyncIssueSeverity = 'error' | 'warning';

export type TerminalSyncIssueCode =
  | 'UNKNOWN_TERMINAL_CAPABILITY'
  | 'UNSUPPORTED_TERMINAL_PLACEHOLDER'
  | 'DUPLICATE_TERMINAL_CAPABILITY'
  | 'TECHNOLOGY_MISMATCH'
  | 'MISSING_ENGINEERING_REFERENCE'
  | 'MISSING_GEO_RF_PROFILE'
  | 'MISSING_LEO_ENGINEERING_PROFILE'
  | 'RF_VALUES_COPIED_TO_SCENARIO';

export interface TerminalSyncDiagnosticIssue {
  severity: TerminalSyncIssueSeverity;
  code: TerminalSyncIssueCode;
  endpointId?: string;
  terminalId?: string;
  message: string;
}

export interface TerminalSyncDiagnosticSummary {
  endpointCount: number;
  terminalCount: number;
  catalogBackedCount: number;
  unsupportedCount: number;
  geoCount: number;
  leoCount: number;
  geoEnabled: boolean;
  leoEnabled: boolean;
}

export interface TerminalSyncDiagnosticReport {
  ok: boolean;
  issues: TerminalSyncDiagnosticIssue[];
  summary: TerminalSyncDiagnosticSummary;
}

const ALLOWED_TERMINAL_CAPABILITY_KEYS = new Set<keyof TerminalCapability>([
  'id',
  'technology',
  'terminalModel',
  'category',
]);

function endpointEntries(scenario: ConnectivityScenario): Array<[ScenarioEndpointKey, ScenarioEndpoint]> {
  return [
    scenario.origin ? ['origin', scenario.origin] as const : undefined,
    scenario.destination ? ['destination', scenario.destination] as const : undefined,
  ].filter((entry): entry is [ScenarioEndpointKey, ScenarioEndpoint] => Boolean(entry));
}

function addIssue(
  issues: TerminalSyncDiagnosticIssue[],
  issue: TerminalSyncDiagnosticIssue,
): void {
  issues.push(issue);
}

function unexpectedTerminalKeys(terminal: TerminalCapability): string[] {
  return Object.keys(terminal).filter((key) => !ALLOWED_TERMINAL_CAPABILITY_KEYS.has(key as keyof TerminalCapability));
}

export function diagnoseEndpointTerminalSync(
  endpoint: ScenarioEndpoint,
  endpointKey?: ScenarioEndpointKey,
): TerminalSyncDiagnosticReport {
  const issues: TerminalSyncDiagnosticIssue[] = [];
  let catalogBackedCount = 0;
  let unsupportedCount = 0;
  let geoCount = 0;
  let leoCount = 0;
  const seen = new Set<string>();

  endpoint.terminalCapabilities.forEach((terminal) => {
    if (terminal.technology === 'geo') geoCount += 1;
    if (terminal.technology === 'leo') leoCount += 1;

    const duplicateKey = `${terminal.technology}:${terminal.id}`;
    if (seen.has(duplicateKey)) {
      addIssue(issues, {
        severity: 'error',
        code: 'DUPLICATE_TERMINAL_CAPABILITY',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `Duplicate ${terminal.technology.toUpperCase()} terminal capability '${terminal.id}'.`,
      });
    }
    seen.add(duplicateKey);

    const extraKeys = unexpectedTerminalKeys(terminal);
    if (extraKeys.length > 0) {
      addIssue(issues, {
        severity: 'error',
        code: 'RF_VALUES_COPIED_TO_SCENARIO',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `Scenario terminal capability contains non-model fields: ${extraKeys.join(', ')}.`,
      });
    }

    const definition = getTerminalDefinitionById(terminal.id);
    if (!definition) {
      if (terminal.id.startsWith('unsupported.')) {
        unsupportedCount += 1;
        addIssue(issues, {
          severity: 'warning',
          code: 'UNSUPPORTED_TERMINAL_PLACEHOLDER',
          endpointId: endpointKey ?? endpoint.id,
          terminalId: terminal.id,
          message: `Terminal capability '${terminal.id}' is an unsupported placeholder.`,
        });
      } else {
        addIssue(issues, {
          severity: 'error',
          code: 'UNKNOWN_TERMINAL_CAPABILITY',
          endpointId: endpointKey ?? endpoint.id,
          terminalId: terminal.id,
          message: `Terminal capability '${terminal.id}' has no shared catalog definition.`,
        });
      }
      return;
    }

    catalogBackedCount += 1;
    if (definition.technology !== terminal.technology) {
      addIssue(issues, {
        severity: 'error',
        code: 'TECHNOLOGY_MISMATCH',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `Terminal capability '${terminal.id}' is '${terminal.technology}' but catalog definition is '${definition.technology}'.`,
      });
    }

    const reference = terminalCapabilityToEngineeringProfileReference(terminal);
    if (!reference) {
      addIssue(issues, {
        severity: 'error',
        code: 'MISSING_ENGINEERING_REFERENCE',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `Terminal capability '${terminal.id}' does not map to an engineering profile reference.`,
      });
      return;
    }

    if (terminal.technology === 'geo' && !reference.rfProfileId) {
      addIssue(issues, {
        severity: 'error',
        code: 'MISSING_GEO_RF_PROFILE',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `GEO terminal capability '${terminal.id}' is missing an rfProfileId reference.`,
      });
    }

    if (terminal.technology === 'leo' && !reference.engineeringProfileKey) {
      addIssue(issues, {
        severity: 'error',
        code: 'MISSING_LEO_ENGINEERING_PROFILE',
        endpointId: endpointKey ?? endpoint.id,
        terminalId: terminal.id,
        message: `LEO terminal capability '${terminal.id}' is missing an engineeringProfileKey reference.`,
      });
    }
  });

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
    summary: {
      endpointCount: 1,
      terminalCount: endpoint.terminalCapabilities.length,
      catalogBackedCount,
      unsupportedCount,
      geoCount,
      leoCount,
      geoEnabled: geoCount > 0,
      leoEnabled: leoCount > 0,
    },
  };
}

export function getScenarioTerminalSyncReport(scenario: ConnectivityScenario): TerminalSyncDiagnosticReport {
  const entries = endpointEntries(scenario);
  const endpointReports = entries.map(([key, endpoint]) => diagnoseEndpointTerminalSync(endpoint, key));
  const issues = endpointReports.flatMap((report) => report.issues);
  const capabilities = getScenarioTechnologyCapabilities(scenario);

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
    summary: {
      endpointCount: entries.length,
      terminalCount: endpointReports.reduce((sum, report) => sum + report.summary.terminalCount, 0),
      catalogBackedCount: endpointReports.reduce((sum, report) => sum + report.summary.catalogBackedCount, 0),
      unsupportedCount: endpointReports.reduce((sum, report) => sum + report.summary.unsupportedCount, 0),
      geoCount: endpointReports.reduce((sum, report) => sum + report.summary.geoCount, 0),
      leoCount: endpointReports.reduce((sum, report) => sum + report.summary.leoCount, 0),
      geoEnabled: capabilities.geoEnabled,
      leoEnabled: capabilities.leoEnabled,
    },
  };
}

export function diagnoseScenarioTerminalSync(scenario: ConnectivityScenario): TerminalSyncDiagnosticReport {
  return getScenarioTerminalSyncReport(scenario);
}

export function assertScenarioTerminalCatalogConsistency(scenario: ConnectivityScenario): TerminalSyncDiagnosticReport {
  return getScenarioTerminalSyncReport(scenario);
}
