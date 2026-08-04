/**
 * Merges an hourly satellite refresh into already-propagated state.
 *
 * WHY THIS EXISTS
 * ---------------
 * `fetchSatellites` seeds every satellite with a position derived from SGP4 at
 * WALL-CLOCK now. That is the correct seed at boot, when nothing has propagated
 * anything yet. Mid-session it is not: a refresh landing an hour in would
 * replace a second-old, timeline-stamped propagation with a wall-clock position
 * that is simply wrong whenever the scenario clock is not live — a scenario set
 * to 2031 would briefly analyse today's geometry.
 *
 * It also erased `position.timelineRevision`, which the analysis layer uses as
 * its transactional recompute key, so every hourly refresh blanked the whole
 * LEO/GEO panel until the next propagation tick re-stamped it.
 *
 * Ownership is therefore split explicitly: the refresh owns everything derived
 * from the TLE and the catalogue (satrec, epoch, ops status, coverage geometry),
 * and the propagation loop owns `position`. A satellite that appears for the
 * first time in the refresh has nothing to preserve and keeps its seed position.
 */
import type { SatelliteData } from '../types/satellites';

export function mergeRefreshedSatellites(
  current: SatelliteData[],
  refreshed: SatelliteData[],
): SatelliteData[] {
  // Boot, or a refresh that resolved before anything was rendered: the seed
  // positions are the only ones there are.
  if (current.length === 0) return refreshed;

  const propagatedStateById = new Map(current.map((sat) => [sat.id, {
    position: sat.position,
    renderPosition: sat.renderPosition,
  }]));

  return refreshed.map((sat) => {
    const propagatedState = propagatedStateById.get(sat.id);
    // Keeping the previous position means it was propagated with the previous
    // satrec. Over the one second before the next tick re-propagates it with the
    // refreshed TLE, that is far smaller than the error of substituting a
    // wall-clock position for a scenario one.
    return propagatedState ? { ...sat, ...propagatedState } : sat;
  });
}
