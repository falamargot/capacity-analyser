import {
    isRevisitSessionSnapshot, normaliseRevisitSessionSnapshot,
    type RevisitSessionSnapshotV1,
} from './revisitSessionSnapshot';

export const REVISIT_SAVED_SCENARIOS_SCHEMA_VERSION = 1 as const;
export const MAX_SAVED_REVISIT_SCENARIOS = 12;
const STORAGE_KEY = 'capacity-analyzer:revisit-saved-scenarios:v1';

export interface SavedRevisitScenario {
    id: string;
    name: string;
    savedAt: string;
    snapshot: RevisitSessionSnapshotV1;
}

export interface RevisitScenarioExchangeV1 {
    kind: 'capacity-analyzer/revisit-scenario';
    schemaVersion: typeof REVISIT_SAVED_SCENARIOS_SCHEMA_VERSION;
    scenario: SavedRevisitScenario;
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function cleanName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function isSavedScenario(value: unknown): value is SavedRevisitScenario {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<SavedRevisitScenario>;
    return typeof candidate.id === 'string' && candidate.id.length > 0
        && typeof candidate.name === 'string' && cleanName(candidate.name).length > 0
        && typeof candidate.savedAt === 'string' && Number.isFinite(Date.parse(candidate.savedAt))
        && isRevisitSessionSnapshot(candidate.snapshot);
}

function readRaw(): SavedRevisitScenario[] {
    try {
        const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isSavedScenario)
            .slice(0, MAX_SAVED_REVISIT_SCENARIOS)
            .map(clone)
            // A scenario saved by an earlier build may hold more comparison
            // targets than this one can show. Normalising here means it loads,
            // trimmed, instead of disappearing from the workspace list.
            .map((saved) => ({
                ...saved,
                snapshot: normaliseRevisitSessionSnapshot(saved.snapshot),
            }));
    } catch {
        return [];
    }
}

function writeRaw(items: SavedRevisitScenario[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX_SAVED_REVISIT_SCENARIOS)));
}

export function listSavedRevisitScenarios(): SavedRevisitScenario[] {
    return readRaw();
}

export function saveRevisitScenario(
    name: string,
    snapshot: RevisitSessionSnapshotV1,
    id: string = crypto.randomUUID(),
): SavedRevisitScenario {
    const normalized = cleanName(name);
    if (!normalized) throw new Error('Scenario name is required');
    if (!isRevisitSessionSnapshot(snapshot)) throw new Error('Scenario is invalid');
    const saved: SavedRevisitScenario = {
        id,
        name: normalized,
        savedAt: new Date().toISOString(),
        snapshot: clone(snapshot),
    };
    const existing = readRaw().filter((item) => item.id !== id);
    writeRaw([saved, ...existing]);
    return clone(saved);
}

export function deleteSavedRevisitScenario(id: string): void {
    writeRaw(readRaw().filter((item) => item.id !== id));
}

export function serializeSavedRevisitScenario(saved: SavedRevisitScenario): string {
    if (!isSavedScenario(saved)) throw new Error('Scenario is invalid');
    const exchange: RevisitScenarioExchangeV1 = {
        kind: 'capacity-analyzer/revisit-scenario',
        schemaVersion: REVISIT_SAVED_SCENARIOS_SCHEMA_VERSION,
        scenario: clone(saved),
    };
    return JSON.stringify(exchange, null, 2);
}

export function parseSavedRevisitScenario(raw: string): SavedRevisitScenario {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid scenario file');
    const exchange = parsed as Partial<RevisitScenarioExchangeV1>;
    if (exchange.kind !== 'capacity-analyzer/revisit-scenario'
        || exchange.schemaVersion !== REVISIT_SAVED_SCENARIOS_SCHEMA_VERSION
        || !isSavedScenario(exchange.scenario)) {
        throw new Error('Unsupported or invalid REVISIT scenario file');
    }
    return clone(exchange.scenario);
}

export function importSavedRevisitScenario(raw: string): SavedRevisitScenario {
    const parsed = parseSavedRevisitScenario(raw);
    return saveRevisitScenario(parsed.name, parsed.snapshot, parsed.id);
}
