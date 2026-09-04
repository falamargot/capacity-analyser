import { useCallback, useEffect, useState, type RefObject } from 'react';
import { JulianDate } from 'cesium';
import { resolveAutoSelectedSatellites } from '../utils/satelliteResolution';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SatelliteData } from '../types/satellites';
import type { buildSimulationStateSnapshot } from '../types/simulation';
import type { LeoServingAssignment } from '../data/leoGroundSegment';

type SimulationStateSnapshot = ReturnType<typeof buildSimulationStateSnapshot>;

interface ResolutionPoint {
  lat: number;
  lng: number;
  source?: string;
}

/**
 * LEO serving resolution for both route endpoints (S-2 slice: MOVED out of
 * `App.tsx`, not rewritten — the three effects keep their bodies, their
 * comments, their dependency arrays and their two deliberate
 * `exhaustive-deps` suppressions).
 *
 * L-O1: `LeoServingAssignment` is the single source of the (satellite, beam,
 * feeder) tuple; the selected SNP is DERIVED from it at the call site.
 *
 * `clearLeoServingA` / `clearLeoServingB` name the pair-clearing that the
 * selection handlers spelled out as two setter calls. NOTE the asymmetry they
 * do NOT cover: `handleSnpClick(null)` clears the assignment while KEEPING
 * `autoSelectedLEOId`. That is why both raw setters are still returned — making
 * that call site symmetric would change behaviour and has to be a decision, not
 * a refactor side effect.
 */
export function useLeoServingResolution({
  analyzisPosition,
  pointBLeo,
  leoTopologyMode,
  leoAnalysisScope,
  satellites,
  satellitesForResolutionRef,
  simulationState,
  simulationClock,
  simulationClockSnapshot,
  isCurrentTimelinePropagated,
  propagatedTimelineRevision,
  failedSnps,
  geoRFClassIdA,
}: {
  analyzisPosition: ResolutionPoint | null;
  pointBLeo: ResolutionPoint | null;
  leoTopologyMode: string;
  leoAnalysisScope: SatelliteScope;
  satellites: SatelliteData[];
  satellitesForResolutionRef: RefObject<SatelliteData[]>;
  simulationState: SimulationStateSnapshot;
  simulationClock: { getTimeMs: () => number };
  simulationClockSnapshot: { revision: number; speed: number };
  isCurrentTimelinePropagated: boolean;
  propagatedTimelineRevision: number | null;
  failedSnps: ReadonlySet<string>;
  geoRFClassIdA: string | null;
}) {
  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  // L-O1: the resolver's LeoServingAssignment is the single source of the
  // serving (satellite, beam, feeder) tuple; the selected SNP is DERIVED from
  // it, so no surface can hold an SNP that disagrees with the assignment.
  const [leoServingAssignmentA, setLeoServingAssignmentA] = useState<LeoServingAssignment | null>(null);
  const [autoSelectedLEOIdB, setAutoSelectedLEOIdB] = useState<string | null>(null);
  const [leoServingAssignmentB, setLeoServingAssignmentB] = useState<LeoServingAssignment | null>(null);

  // §1.1 — Re-resolve on explicit position/scope/policy changes and exactly
  // once when the first propagated batch for a new timeline is published.
  useEffect(() => {
    if (!analyzisPosition || !isCurrentTimelinePropagated) return;
    const now = JulianDate.fromDate(new Date(simulationClock.getTimeMs()));
    const { autoSelectedLEOSat, servingAssignment } = resolveAutoSelectedSatellites(
      { lat: analyzisPosition.lat, lng: analyzisPosition.lng },
      satellites,
      leoAnalysisScope,
      simulationState,
      now,
      failedSnps,
      autoSelectedLEOId,
      geoRFClassIdA
    );
    setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
    setLeoServingAssignmentA(servingAssignment);
  // `satellites` is deliberately sampled without depending on its per-second
  // array identity; propagatedTimelineRevision is the transactional trigger.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    analyzisPosition,
    autoSelectedLEOId,
    failedSnps,
    geoRFClassIdA,
    leoAnalysisScope,
    propagatedTimelineRevision,
    simulationClock,
    simulationClockSnapshot.revision,
    simulationState,
  ]);

  // §1.3 — Periodic re-resolution for fixed positions (earth / vessel).
  //
  // Problem: LEO satellites orbit at ~7 km/s. A satellite that covered a user position
  // at T=0 may have left its beam footprint by T=60s, while a new satellite arrives from
  // the north — but the auto-selection was never re-evaluated because analyzisPosition
  // didn't change (no user interaction). The panel then shows 0 Mbps with an outdated
  // satellite still displayed, until the user clicks again.
  //
  // Fix: for source='earth' (and 'vessel'), re-run the full satellite resolution every
  // RESOLUTION_INTERVAL_MS. Aircraft positions already re-resolve via their own 5s interval
  // (updateSelectedAircraftPosition) so they are explicitly excluded here.
  //
  // Interval choice: 15s — fast enough to catch satellite transitions (~105 km orbital travel),
  // conservative enough to avoid overloading the SGP4 beam-polygon engine.
  // satellitesForResolutionRef.current always holds the latest propagated positions,
  // so there is no latency mismatch with the globe display.
  useEffect(() => {
    // Only run for static earth/vessel points — aircraft handles its own periodic update
    if (!analyzisPosition || analyzisPosition.source === 'aircraft') return;

    // Preserve the 15-second scenario cadence when playback is accelerated,
    // without running faster than the one-second satellite propagation cadence.
    const resolutionIntervalMs = Math.max(
      1_000,
      15_000 / Math.max(1, Math.abs(simulationClockSnapshot.speed)),
    );

    const reResolve = () => {
      // Re-read position from ref in case it was cleared between ticks
      const pos = analyzisPosition;
      if (!pos || pos.source === 'aircraft') return;

      const now = JulianDate.fromDate(new Date(simulationClock.getTimeMs()));
      const { autoSelectedLEOSat, servingAssignment } = resolveAutoSelectedSatellites(
        { lat: pos.lat, lng: pos.lng },
        satellitesForResolutionRef.current,  // always-fresh satellite positions
        leoAnalysisScope,
        simulationState,
        now,
        failedSnps,
        autoSelectedLEOId,
        geoRFClassIdA
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setLeoServingAssignmentA(servingAssignment);
    };

    const interval = setInterval(reResolve, resolutionIntervalMs);
    return () => clearInterval(interval);
  }, [
    analyzisPosition,
    autoSelectedLEOId,
    failedSnps,
    geoRFClassIdA,
    leoAnalysisScope,
    simulationClock,
    simulationClockSnapshot.revision,
    simulationClockSnapshot.speed,
    simulationState,
    satellitesForResolutionRef,
  ]); // re-arm when position/policy changes

  // Resolve satellite + SNP for Point B (LEO site-to-site) whenever it changes.
  useEffect(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') {
      setAutoSelectedLEOIdB(null);
      setLeoServingAssignmentB(null);
      return;
    }
    if (!isCurrentTimelinePropagated) return;

    const resolutionIntervalMs = Math.max(
      1_000,
      15_000 / Math.max(1, Math.abs(simulationClockSnapshot.speed)),
    );

    const reResolve = (availableSatellites = satellitesForResolutionRef.current) => {
      const now = JulianDate.fromDate(new Date(simulationClock.getTimeMs()));
      const { autoSelectedLEOSat, servingAssignment } = resolveAutoSelectedSatellites(
        { lat: pointBLeo.lat, lng: pointBLeo.lng },
        availableSatellites,
        leoAnalysisScope,
        simulationState,
        now,
        failedSnps,
        autoSelectedLEOIdB,
        null
      );
      setAutoSelectedLEOIdB(autoSelectedLEOSat?.id ?? null);
      setLeoServingAssignmentB(servingAssignment);
    };

    reResolve(satellites);
    const interval = setInterval(reResolve, resolutionIntervalMs);
    return () => clearInterval(interval);
  // `satellites` is sampled only for the first batch of a new timeline;
  // periodic refreshes continue to use the stable live ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoSelectedLEOIdB,
    failedSnps,
    leoAnalysisScope,
    leoTopologyMode,
    pointBLeo,
    propagatedTimelineRevision,
    satellitesForResolutionRef,
    simulationClock,
    simulationClockSnapshot.revision,
    simulationClockSnapshot.speed,
    simulationState,
  ]);

  const clearLeoServingA = useCallback(() => {
    setAutoSelectedLEOId(null);
    setLeoServingAssignmentA(null);
  }, []);

  const clearLeoServingB = useCallback(() => {
    setAutoSelectedLEOIdB(null);
    setLeoServingAssignmentB(null);
  }, []);

  return {
    autoSelectedLEOId,
    leoServingAssignmentA,
    setLeoServingAssignmentA,
    autoSelectedLEOIdB,
    leoServingAssignmentB,
    clearLeoServingA,
    clearLeoServingB,
  };
}
