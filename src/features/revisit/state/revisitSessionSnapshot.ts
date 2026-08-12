import type { RevisitScenario } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import type { SelectionSource } from '../domain/selectionReconcile';
import { validateScenario } from '../analysis/scenarioValidation';

export const REVISIT_SESSION_SCHEMA_VERSION = 1 as const;
const STORAGE_KEY = 'capacity-analyzer:revisit-session:v1';

export interface RevisitDisplayOptions extends RevisitSceneOptions {
  autoRotate: boolean;
}

export interface RevisitSessionSnapshotV1 {
  schemaVersion: typeof REVISIT_SESSION_SCHEMA_VERSION;
  scenario: RevisitScenario;
  options: RevisitDisplayOptions;
  requirementMs: number;
  selectionSource: SelectionSource;
}

let memorySnapshot: RevisitSessionSnapshotV1 | null = null;

function cloneSnapshot(snapshot: RevisitSessionSnapshotV1): RevisitSessionSnapshotV1 {
  return JSON.parse(JSON.stringify(snapshot)) as RevisitSessionSnapshotV1;
}

function isSnapshot(value: unknown): value is RevisitSessionSnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RevisitSessionSnapshotV1>;
  const structurallyValid = candidate.schemaVersion === REVISIT_SESSION_SCHEMA_VERSION
    && Boolean(candidate.scenario?.reference)
    && Boolean(candidate.scenario?.selection)
    && Boolean(candidate.scenario?.target)
    && Boolean(candidate.scenario?.window)
    && Boolean(candidate.options)
    && typeof candidate.options?.showOrbits === 'boolean'
    && typeof candidate.options?.showSwaths === 'boolean'
    && typeof candidate.options?.showHostFleet === 'boolean'
    && typeof candidate.options?.autoRotate === 'boolean'
    && Number.isFinite(candidate.requirementMs) && (candidate.requirementMs ?? 0) > 0
    && (candidate.selectionSource === 'auto' || candidate.selectionSource === 'manual');
  if (!structurallyValid) return false;

  try {
    return validateScenario(candidate.scenario as RevisitScenario).ok;
  } catch {
    return false;
  }
}

export function writeRevisitSessionSnapshot(snapshot: RevisitSessionSnapshotV1): void {
  if (!isSnapshot(snapshot)) {
    clearRevisitSessionSnapshot();
    return;
  }
  const copy = cloneSnapshot(snapshot);
  memorySnapshot = copy;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
  } catch {
    // Module memory still preserves the in-app round trip when storage is denied.
  }
}

export function readRevisitSessionSnapshot(): RevisitSessionSnapshotV1 | null {
  if (memorySnapshot) return cloneSnapshot(memorySnapshot);
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSnapshot(parsed)) return null;
    memorySnapshot = parsed;
    return cloneSnapshot(parsed);
  } catch {
    return null;
  }
}

export function clearRevisitSessionSnapshot(): void {
  memorySnapshot = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
