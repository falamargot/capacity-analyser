import type { RevisitScenario } from '../domain/types';
import type { RevisitSceneOptions } from '../render/useRevisitScene';
import type { SelectionSource } from '../domain/selectionReconcile';
import { validateScenario } from '../analysis/scenarioValidation';
import { isAreaTargetDraft, type AreaTarget } from '../domain/areaTarget';
import {
  AREA_TARGET_ID, isRevisitAnalysisContext, isRevisitAreaTargetRole, isRevisitComparisonPointList,
  isSecondaryTargetOrder, MAX_PERSISTED_SECONDARY_TARGETS, MAX_SECONDARY_TARGETS, REFERENCE_POINT_ID,
  type RevisitAnalysisContext, type RevisitAreaTargetRole, type RevisitComparisonPoint,
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
  /** Primary target requirement. Kept under its v1 name for compatibility. */
  requirementMs: number;
  /**
   * Secondary target requirement. Older snapshots omit it and inherit the
   * primary value during normalisation.
   */
  comparisonRequirementMs?: number;
  selectionSource: SelectionSource;
  /** False represents the intentional zero-target state. Missing means legacy true. */
  hasReferenceTarget?: boolean;
  /** Optional P2b-A polygon draft. Kept backward-compatible inside v1. */
  customArea?: AreaTarget | null;
  /** Independent role polygons. `customArea` remains as a v1 compatibility view. */
  referenceArea?: AreaTarget | null;
  comparisonArea?: AreaTarget | null;
  /** Whether the persisted polygon occupies the reference or comparison slot. */
  areaTargetRole?: RevisitAreaTargetRole;
  /** P2b-B1: one active result context; both geometries remain persisted. */
  analysisContext?: RevisitAnalysisContext;
  /** At most one user-defined point compared with `scenario.target`. */
  comparisonPoints?: RevisitComparisonPoint[];
  /** P2c-A: point whose result owns the sidebar; reference remains benchmark. */
  selectedPointId?: string;
  /** Visual order of the single polymorphic Point/Area comparison slot. */
  secondaryTargetOrder?: string[];
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
  /**
   * P7E: who this scenario is for — a customer or opportunity name the
   * salesperson types once and that then travels with the scenario into the
   * exported summary.
   *
   * Optional, and absent on every existing snapshot, so no schema bump: the
   * same back-compatible shape `referenceRestored` uses. Free text, bounded on
   * write, and never interpreted — it is a label, not an identifier.
   */
  opportunity?: string;
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
    && (candidate.options?.showProjectionCones === undefined
      || typeof candidate.options.showProjectionCones === 'boolean')
    && typeof candidate.options?.showHostFleet === 'boolean'
    && (candidate.options?.showLabels === undefined
      || typeof candidate.options.showLabels === 'boolean')
    && typeof candidate.options?.autoRotate === 'boolean'
    && Number.isFinite(candidate.requirementMs) && (candidate.requirementMs ?? 0) > 0
    && (candidate.selectionSource === 'auto' || candidate.selectionSource === 'manual');
  const areaValid = candidate.customArea === undefined || candidate.customArea === null
    || isAreaTargetDraft(candidate.customArea);
  const referenceAreaValid = candidate.referenceArea === undefined || candidate.referenceArea === null
    || isAreaTargetDraft(candidate.referenceArea);
  const comparisonAreaValid = candidate.comparisonArea === undefined || candidate.comparisonArea === null
    || isAreaTargetDraft(candidate.comparisonArea);
  const contextValid = candidate.analysisContext === undefined
    || isRevisitAnalysisContext(candidate.analysisContext);
  const areaRoleValid = candidate.areaTargetRole === undefined
    || isRevisitAreaTargetRole(candidate.areaTargetRole);
  const comparisonValid = candidate.comparisonPoints === undefined
    || isRevisitComparisonPointList(candidate.comparisonPoints);
  const selectedPointValid = candidate.selectedPointId === undefined
    || candidate.selectedPointId === REFERENCE_POINT_ID
    || (typeof candidate.selectedPointId === 'string'
      && (candidate.comparisonPoints ?? []).some((point) => point.id === candidate.selectedPointId));
  const secondaryOrderValid = candidate.secondaryTargetOrder === undefined
    || (isSecondaryTargetOrder(candidate.secondaryTargetOrder)
      && candidate.secondaryTargetOrder.every((id) => id === AREA_TARGET_ID
        ? Boolean(candidate.comparisonArea
            ?? ((candidate.areaTargetRole ?? 'COMPARISON') === 'COMPARISON' ? candidate.customArea : null))
        : (candidate.comparisonPoints ?? []).some((point) => point.id === id)));
  const referenceRestoredValid = candidate.referenceRestored === undefined
    || typeof candidate.referenceRestored === 'boolean';
  const opportunityValid = candidate.opportunity === undefined
    || (typeof candidate.opportunity === 'string' && candidate.opportunity.length <= 120);
  const comparisonRequirementValid = candidate.comparisonRequirementMs === undefined
    || (Number.isFinite(candidate.comparisonRequirementMs)
      && (candidate.comparisonRequirementMs ?? 0) > 0);
  const referencePresenceValid = candidate.hasReferenceTarget === undefined
    || typeof candidate.hasReferenceTarget === 'boolean';
  const emptyTargetSetValid = candidate.hasReferenceTarget !== false
    || (!candidate.customArea
      && !candidate.referenceArea
      && !candidate.comparisonArea
      && (candidate.comparisonPoints ?? []).length === 0
      && (candidate.secondaryTargetOrder ?? []).length === 0);
  if (!structurallyValid || !areaValid || !referenceAreaValid || !comparisonAreaValid
    || !contextValid || !areaRoleValid || !comparisonValid || !selectedPointValid
    || !secondaryOrderValid
    || !referenceRestoredValid
    || !opportunityValid
    || !comparisonRequirementValid
    || !referencePresenceValid
    || !emptyTargetSetValid) return false;

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
    return normaliseRevisitSessionSnapshot(copy);
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRevisitSessionSnapshot(parsed)) return null;
    memorySnapshot = parsed;
    const copy = cloneSnapshot(parsed);
    return normaliseRevisitSessionSnapshot(copy);
  } catch {
    return null;
  }
}

/**
 * Apply the defaults a v1 snapshot may omit, then TRIM it to what this build's
 * target set can hold.
 *
 * Trimming rather than rejecting is the whole point. `MAX_SECONDARY_TARGETS`
 * dropped from 2 to 1 with the single-slot target set, and a snapshot written
 * by the previous build legitimately holds two comparison points. Refusing it
 * would discard the entire session — scenario, requirement, display options,
 * opportunity name — and make every saved scenario containing one vanish from
 * the workspace and fail to import. So validation accepts up to
 * `MAX_PERSISTED_SECONDARY_TARGETS` and this function reduces what it accepted
 * to what the UI can show, keeping the order, the points and the selection
 * mutually consistent.
 *
 * Exported because saved scenarios are read through their own store and must be
 * normalised the same way.
 */
export function normaliseRevisitSessionSnapshot(
  snapshot: RevisitSessionSnapshotV1,
): RevisitSessionSnapshotV1 {
  const copy = cloneSnapshot(snapshot);
  copy.options.showLabels ??= false;
  copy.options.showProjectionCones ??= true;
  copy.analysisContext ??= 'POINTS';
  copy.comparisonRequirementMs ??= copy.requirementMs;
  copy.areaTargetRole ??= 'COMPARISON';
  copy.comparisonPoints ??= [];
  copy.secondaryTargetOrder ??= legacySecondaryTargetOrder(copy);
  copy.referenceRestored ??= false;
  if (copy.customArea) copy.customArea.id ??= crypto.randomUUID();
  if (copy.referenceArea) copy.referenceArea.id ??= crypto.randomUUID();
  if (copy.comparisonArea) copy.comparisonArea.id ??= crypto.randomUUID();

  /*
   * Trim by COUNT, keeping whichever targets the stored order put first. It is
   * deliberately not "drop everything the order does not mention": the order is
   * a later addition and older snapshots carry comparison points with an empty
   * one, so filtering by it would delete the user's only comparison target —
   * the very kind of silent data loss this function exists to prevent.
   */
  const points = copy.comparisonPoints;
  const orderedPointIds = copy.secondaryTargetOrder.filter((id) => id !== AREA_TARGET_ID);
  const named = orderedPointIds
    .map((id) => points.find((point) => point.id === id))
    .filter((point): point is RevisitComparisonPoint => Boolean(point));
  const unnamed = points.filter((point) => !orderedPointIds.includes(point.id));
  copy.comparisonPoints = [...named, ...unnamed].slice(0, MAX_SECONDARY_TARGETS);

  const keptPointIds = new Set(copy.comparisonPoints.map((point) => point.id));
  copy.secondaryTargetOrder = copy.secondaryTargetOrder
    .filter((id) => id === AREA_TARGET_ID || keptPointIds.has(id))
    .slice(0, MAX_SECONDARY_TARGETS);
  // A selection naming a dropped point would leave the sidebar addressing a
  // target that is no longer in the set.
  if (copy.selectedPointId !== undefined
    && copy.selectedPointId !== REFERENCE_POINT_ID
    && !keptPointIds.has(copy.selectedPointId)) {
    copy.selectedPointId = REFERENCE_POINT_ID;
  }
  return copy;
}

/** Old P2c-B snapshots stored points and area independently. Preserve their
 * visible order while adopting the single-slot target model: whichever
 * secondary was already first is the one the bounded UI can still show. */
function legacySecondaryTargetOrder(snapshot: RevisitSessionSnapshotV1): string[] {
  const pointIds = (snapshot.comparisonPoints ?? []).map((point) => point.id);
  const comparisonArea = snapshot.comparisonArea
    ?? ((snapshot.areaTargetRole ?? 'COMPARISON') === 'COMPARISON' ? snapshot.customArea : null);
  const ordered = snapshot.analysisContext === 'AREA' && comparisonArea
    ? [AREA_TARGET_ID, ...pointIds]
    : [...pointIds, ...(comparisonArea ? [AREA_TARGET_ID] : [])];
  return ordered.slice(0, MAX_PERSISTED_SECONDARY_TARGETS);
}

export function clearRevisitSessionSnapshot(): void {
  memorySnapshot = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
