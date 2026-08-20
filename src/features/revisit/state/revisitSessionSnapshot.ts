import type { RevisitScenario } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import type { SelectionSource } from '../domain/selectionReconcile';
import { validateScenario } from '../analysis/scenarioValidation';
import { isAreaTargetDraft, type AreaTarget } from '../domain/areaTarget';
import {
  isRevisitAnalysisContext, isRevisitComparisonPointList,
  type RevisitAnalysisContext, type RevisitComparisonPoint,
} from '../domain/analysisTargets';

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
  /** Optional P2b-A polygon draft. Kept backward-compatible inside v1. */
  customArea?: AreaTarget | null;
  /** P2b-B1: one active result context; both geometries remain persisted. */
  analysisContext?: RevisitAnalysisContext;
  /** Up to two user-defined points compared with `scenario.target`. */
  comparisonPoints?: RevisitComparisonPoint[];
  /**
   * m4 provenance: true when `scenario.reference` came from a restored
   * scenario rather than from someone hand-editing the Advanced drawer.
   *
   * Carried in the snapshot itself, not re-derived from
   * `referenceModeFor(scenario.reference) === 'CUSTOM'` on read: this
   * snapshot is also restored on every ordinary remount (mode switch, page
   * reload), not only on a deliberate "Load saved scenario". Re-deriving
   * from mode alone mislabelled hand-typed CUSTOM values as "restored" after
   * any such remount. Missing on older snapshots — defaults to `false`
   * (hand-entered) on read, the safer of the two guesses.
   */
  referenceRestored?: boolean;
}

let memorySnapshot: RevisitSessionSnapshotV1 | null = null;

function cloneSnapshot(snapshot: RevisitSessionSnapshotV1): RevisitSessionSnapshotV1 {
  return JSON.parse(JSON.stringify(snapshot)) as RevisitSessionSnapshotV1;
}

export function isRevisitSessionSnapshot(value: unknown): value is RevisitSessionSnapshotV1 {
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
    && (candidate.options?.showLabels === undefined
      || typeof candidate.options.showLabels === 'boolean')
    && typeof candidate.options?.autoRotate === 'boolean'
    && Number.isFinite(candidate.requirementMs) && (candidate.requirementMs ?? 0) > 0
    && (candidate.selectionSource === 'auto' || candidate.selectionSource === 'manual');
  const areaValid = candidate.customArea === undefined || candidate.customArea === null
    || isAreaTargetDraft(candidate.customArea);
  const contextValid = candidate.analysisContext === undefined
    || isRevisitAnalysisContext(candidate.analysisContext);
  const comparisonValid = candidate.comparisonPoints === undefined
    || isRevisitComparisonPointList(candidate.comparisonPoints);
  const referenceRestoredValid = candidate.referenceRestored === undefined
    || typeof candidate.referenceRestored === 'boolean';
  if (!structurallyValid || !areaValid || !contextValid || !comparisonValid
    || !referenceRestoredValid) return false;

  try {
    return validateScenario(candidate.scenario as RevisitScenario).ok;
  } catch {
    return false;
  }
}

export function writeRevisitSessionSnapshot(snapshot: RevisitSessionSnapshotV1): void {
  if (!isRevisitSessionSnapshot(snapshot)) {
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
  if (memorySnapshot) {
    const copy = cloneSnapshot(memorySnapshot);
    copy.options.showLabels ??= false;
    copy.analysisContext ??= 'POINTS';
    copy.comparisonPoints ??= [];
    copy.referenceRestored ??= false;
    if (copy.customArea) copy.customArea.id ??= crypto.randomUUID();
    return copy;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRevisitSessionSnapshot(parsed)) return null;
    memorySnapshot = parsed;
    const copy = cloneSnapshot(parsed);
    copy.options.showLabels ??= false;
    copy.analysisContext ??= 'POINTS';
    copy.comparisonPoints ??= [];
    copy.referenceRestored ??= false;
    if (copy.customArea) copy.customArea.id ??= crypto.randomUUID();
    return copy;
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
