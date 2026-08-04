/**
 * The pure state transition for one batch of worker positions.
 *
 * WHY THIS IS PURE, AND WHY THAT MATTERS
 * --------------------------------------
 * This logic used to live inline in `useSatelliteLoader`'s `setSatellites`
 * updater, and it read AND WROTE two refs while it ran:
 *
 *     setSatellites((current) => {
 *       const selectionChanged = prevSelectedSatelliteRef.current !== selectedId;
 *       const prevById = new Map(prevSatellitesRef.current.map(...));   // read
 *       ...
 *       prevSelectedSatelliteRef.current = selectedId;                  // write
 *       prevSatellitesRef.current = updatedSatellites;                  // write
 *       return anyItemChanged ? updatedSatellites : current;
 *     })
 *
 * React StrictMode invokes a state updater TWICE to surface exactly this kind
 * of impurity, and keeps the SECOND result. The first invocation advanced
 * `prevSatellitesRef` to the freshly-updated array; the second then compared
 * the incoming worker positions against those same updated positions, found a
 * delta of zero for every satellite, left `anyItemChanged` false — and returned
 * the ORIGINAL array. The new positions were computed and thrown away, once per
 * tick, forever.
 *
 * That is what the 2026-07-29 always-visible soak measured: a healthy scheduler
 * (no timeouts, no recycles), fresh interpolation cells, and a worker sample age
 * climbing from 19.5 s to 79.8 s because the rendered state never advanced.
 *
 * So the transition is now a function of its arguments alone: same inputs, same
 * output, no matter how many times it runs. Selection bookkeeping happens in the
 * caller, before the updater; the previous-positions ref is gone entirely —
 * `currentSatellites` already carries the last published position of every
 * satellite, which is what the epsilon gate should have been comparing against.
 */
import type { SatelliteData } from '../types/satellites';
import type { SatellitePositionWorkerPosition } from '../workers/satellitePositionProtocol';

// ── Epsilon gate calibration ─────────────────────────────────────────────────
//
// These thresholds gate whether a satellite's new position is "different enough"
// to replace the previous object reference. Replacing the reference triggers all
// downstream useMemos that depend on the satellite array (coverage, connectivity…).
//
// IMPORTANT — do NOT tighten POSITION_EPSILON_DEG below 0.01°:
//   GEO satellites move ~0.008°/2 s  →  below 0.01°  →  reference stays stable ✓
//   LEO satellites move ~0.13°/2 s   →  well above 0.01° → always updates ✓
//   At 0.005°, GEO would exceed the gate every tick, triggering constant
//   downstream re-computation and defeating the entire stability mechanism.
export const POSITION_EPSILON_DEG = 0.01;
export const ALTITUDE_EPSILON_KM = 0.5;

export type WorkerPositionUpdate = Omit<SatellitePositionWorkerPosition, 'isValid'>;

export interface ApplyWorkerPositionsInput {
  /** Valid worker positions, keyed by satellite id. Invalid ones must be filtered out first. */
  positions: Map<string, WorkerPositionUpdate>;
  /** Visual-only lookahead samples, keyed by satellite id. */
  renderPositions?: Map<string, WorkerPositionUpdate>;
  /** Clock timeline that produced every position in this batch. */
  timelineRevision: number;
  selectedSatelliteId: string | null;
  hoveredSatelliteId: string | null;
  /**
   * Whether the selection changed since the last accepted batch. Computed by the
   * caller — deciding it in here would mean reading a ref, which is what made
   * the old updater impure.
   */
  selectionChanged: boolean;
  /** Coverage recalculation, injected so this module stays pure and cheap to test. */
  computeCoverages: (satellite: SatelliteData) => SatelliteData['coverages'];
}

/**
 * Applies one batch of worker positions to the current satellite array.
 *
 * Reference stabilisation is preserved at both levels: a satellite that has not
 * moved past the epsilon gate keeps its object identity, and if no satellite
 * changed at all the ORIGINAL array is returned rather than a new container, so
 * consumers memoised on the array itself do not re-fire.
 */
export function applyWorkerPositions(
  currentSatellites: SatelliteData[],
  input: ApplyWorkerPositionsInput,
): SatelliteData[] {
  const {
    positions,
    renderPositions,
    timelineRevision,
    selectedSatelliteId,
    hoveredSatelliteId,
    selectionChanged,
    computeCoverages,
  } = input;

  let anyItemChanged = false;
  const updatedSatellites = currentSatellites.map((sat) => {
    const workerPos = positions.get(sat.id);
    if (!workerPos) return sat;
    const workerRenderPos = renderPositions?.get(sat.id);

    const newPosition = {
      lat: workerPos.lat,
      lng: workerPos.lng,
      alt: workerPos.alt,
      sampleTimeMs: workerPos.sampleTimeMs,
      timelineRevision,
    };
    const newRenderPosition = workerRenderPos ? {
      lat: workerRenderPos.lat,
      lng: workerRenderPos.lng,
      alt: workerRenderPos.alt,
      sampleTimeMs: workerRenderPos.sampleTimeMs,
      timelineRevision,
    } : undefined;

    // Compared against the satellite's OWN current position — the last thing
    // published for it — rather than a separately-tracked previous array. Same
    // semantics, but it makes the result depend only on the arguments.
    const positionChanged =
      Math.abs(sat.position.lat - newPosition.lat) > POSITION_EPSILON_DEG ||
      Math.abs(sat.position.lng - newPosition.lng) > POSITION_EPSILON_DEG ||
      Math.abs(sat.position.alt - newPosition.alt) > ALTITUDE_EPSILON_KM;
    const timelineChanged = sat.position.timelineRevision !== timelineRevision;
    const renderPositionChanged = newRenderPosition !== undefined && (
      !sat.renderPosition
      || Math.abs(sat.renderPosition.lat - newRenderPosition.lat) > POSITION_EPSILON_DEG
      || Math.abs(sat.renderPosition.lng - newRenderPosition.lng) > POSITION_EPSILON_DEG
      || Math.abs(sat.renderPosition.alt - newRenderPosition.alt) > ALTITUDE_EPSILON_KM
      || sat.renderPosition.timelineRevision !== timelineRevision
    );

    const isSatelliteSelected = selectedSatelliteId === sat.id;
    const isSatelliteHovered = hoveredSatelliteId === sat.id;
    const shouldRecalculateCoverage =
      sat.type === 'ONEWEB' &&
      (isSatelliteSelected ||
        isSatelliteHovered ||
        selectionChanged ||
        positionChanged ||
        !sat.coverages?.length);

    // Nothing changed → return same reference (prevents downstream re-renders)
    if (!positionChanged && !timelineChanged && !renderPositionChanged && !shouldRecalculateCoverage) return sat;

    anyItemChanged = true;
    const updatedSat = positionChanged || timelineChanged || renderPositionChanged
      ? {
          ...sat,
          position: positionChanged || timelineChanged ? { ...sat.position, ...newPosition } : sat.position,
          renderPosition: newRenderPosition ?? sat.renderPosition,
        }
      : sat;
    return shouldRecalculateCoverage
      ? { ...updatedSat, coverages: computeCoverages(updatedSat) }
      : updatedSat;
  });

  // Every item is reference-identical to currentSatellites when nothing
  // changed, so returning currentSatellites here is not just "close enough" —
  // it's the exact same content, just without a new container.
  return anyItemChanged ? updatedSatellites : currentSatellites;
}
