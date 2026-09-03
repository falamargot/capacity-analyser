/**
 * useRouteAnalysis — the two expensive per-scenario route derivations.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, third slice). Both were
 * already thin over their builders — the logic lives in
 * `utils/activeLeoRouteEvidence.ts` and `utils/geoRouteAnalysisViewModel.ts`.
 * What sat in the component was the INPUT ASSEMBLY and, more importantly, the
 * memo cadence: which ticks are allowed to re-run the most expensive
 * computation in the application, and which are deliberately excluded.
 *
 * That cadence is the reason these are worth naming. Both dependency arrays are
 * hand-tuned with an eslint disable and a comment explaining what is left out
 * and why — a 16-beam comb geometry rebuilt twice a second starves Cesium's rAF
 * loop, which is a bug this codebase has already paid for once. Moving them
 * verbatim keeps that reasoning attached to the code it governs instead of
 * burying it 2 000 lines into a component.
 */

import { useMemo, type MutableRefObject } from 'react';
import { JulianDate } from 'cesium';
import {
  buildActiveLeoRouteEvidence,
  type ActiveLeoRouteEvidenceState,
  type BuildActiveLeoRouteEvidenceInput,
} from '../utils/activeLeoRouteEvidence';
import {
  buildGeoRouteAnalysisViewModel,
  type GeoRouteAnalysisInput,
} from '../utils/geoRouteAnalysisViewModel';
import type { SatelliteData } from '../types/satellites';
import {
  DECISION_GEO_ANALYSIS_SCOPE, shouldBuildGeoDecisionAnalysis,
} from '../components/commercial/decisionAnalysisPolicy';

/** The satellite-scope constant the GEO decision analysis always evaluates at. */
export type SimulationClockLike = { getTimeMs: () => number };

export interface UseActiveLeoRouteEvidenceInput
  extends Omit<BuildActiveLeoRouteEvidenceInput, 'servingSatelliteA' | 'servingSatelliteB' | 'now'> {
  isCurrentTimelinePropagated: boolean;
  satellites: SatelliteData[];
  autoSelectedLEOId: string | null;
  autoSelectedLEOIdB: string | null;
  simulationClock: SimulationClockLike;
  /** Dependency only — see the array below. */
  simulationClockRevision: number;
  leoEvidenceTick: number;
  propagatedTimelineRevision: number | null;
  stateRef: MutableRefObject<ActiveLeoRouteEvidenceState>;
}

export function useActiveLeoRouteEvidence(input: UseActiveLeoRouteEvidenceInput) {
  const {
    isCurrentTimelinePropagated, satellites, autoSelectedLEOId, autoSelectedLEOIdB,
    simulationClock, simulationClockRevision, leoEvidenceTick, propagatedTimelineRevision,
    stateRef,
    topology: leoTopologyMode, direction, activePoint: activeAnalysisPoint, pointB: pointBLeo,
    servingAssignmentA: leoServingAssignmentA, servingAssignmentB: leoServingAssignmentB,
    selectedSnpA: selectedSNP, selectedSnpB: selectedSNPB,
    regulatoryResultA: leoRegulatoryResult, regulatoryResultB: leoRegulatoryResultB,
    beamLoadA: leoBeamLoadResult, beamLoadB: leoBeamLoadResultB,
    terminalTypeA: leoTerminalType, terminalTypeB: leoTerminalTypeB,
    terminalModelIdA: leoTerminalModelId, terminalModelIdB: leoTerminalModelIdB,
    weatherTypeA: weatherType, weatherTypeB,
    simulationStateA: simulationState, simulationStateB,
    failedSnps,
  } = input;
  const activeMeshTab = direction === 'B_TO_A' ? 'reverse' : 'forward';
  const activeLeoRouteEvidenceStateRef = stateRef;
  const simulationClockSnapshot = { revision: simulationClockRevision };

  const activeLeoRouteEvidence = useMemo(() => {
    if (!isCurrentTimelinePropagated) return null;
    // Read satellite positions from the always-fresh ref rather than from resolvedAutoLEO /
    // resolvedAutoLEOB React state. Those state values depend on satelliteById which rebuilds
    // on every 1-second propagation tick, causing buildActiveLeoRouteEvidence (which runs
    // calculateCombGeometry — 16-beam polygon generation) to fire *twice* per second:
    // once from the satellite tick and once from leoEvidenceTick. That double execution
    // on the main thread starves Cesium's rAF loop and freezes satellite animation.
    // Using the ref gives identical, always-current data without adding a reactive dep.
    const satA = autoSelectedLEOId
      ? (satellites.find((s) => s.id === autoSelectedLEOId) ?? null)
      : null;
    const satB = autoSelectedLEOIdB
      ? (satellites.find((s) => s.id === autoSelectedLEOIdB) ?? null)
      : null;
    return buildActiveLeoRouteEvidence({
      topology: leoTopologyMode,
      direction: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
      activePoint: activeAnalysisPoint,
      pointB: pointBLeo,
      servingSatelliteA: satA,
      servingSatelliteB: satB,
      servingAssignmentA: leoServingAssignmentA,
      servingAssignmentB: leoServingAssignmentB,
      selectedSnpA: selectedSNP,
      selectedSnpB: selectedSNPB,
      regulatoryResultA: leoRegulatoryResult,
      regulatoryResultB: leoRegulatoryResultB,
      beamLoadA: leoBeamLoadResult,
      beamLoadB: leoBeamLoadResultB,
      terminalTypeA: leoTerminalType,
      terminalTypeB: leoTerminalTypeB,
      terminalModelIdA: leoTerminalModelId,
      terminalModelIdB: leoTerminalModelIdB,
      weatherTypeA: weatherType,
      weatherTypeB,
      simulationStateA: simulationState,
      simulationStateB,
      failedSnps,
      now: JulianDate.fromDate(new Date(simulationClock.getTimeMs())),
    }, activeLeoRouteEvidenceStateRef.current);
  // Satellite data is sampled when propagatedTimelineRevision changes while
  // leoEvidenceTick remains the sole driver during normal playback.
  // autoSelectedLEOId / autoSelectedLEOIdB retained so a satellite-selection change
  // triggers an immediate re-evaluation rather than waiting for the next tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    autoSelectedLEOId,
    autoSelectedLEOIdB,
    failedSnps,
    leoBeamLoadResult,
    leoBeamLoadResultB,
    leoEvidenceTick,
    leoRegulatoryResult,
    leoRegulatoryResultB,
    simulationClock,
    simulationClockSnapshot.revision,
    leoTerminalModelId,
    leoTerminalModelIdB,
    leoTerminalType,
    leoTerminalTypeB,
    leoTopologyMode,
    leoServingAssignmentA,
    leoServingAssignmentB,
    pointBLeo,
    propagatedTimelineRevision,
    selectedSNP,
    selectedSNPB,
    simulationState,
    simulationStateB,
    weatherType,
    weatherTypeB,
  ]);


  return {
    activeLeoRouteEvidence,
    activeLeoSiteToSiteResult: activeLeoRouteEvidence?.routeResult ?? null,
  };
}

export interface UseGeoRouteAnalysisInput
  extends Omit<GeoRouteAnalysisInput, 'satelliteScope' | 'candidateCoverages'> {
  isCurrentTimelinePropagated: boolean;
  uiMode: Parameters<typeof shouldBuildGeoDecisionAnalysis>[0]['uiMode'];
  propagatedTimelineRevision: number | null;
  eligibleCandidateCoverages: GeoRouteAnalysisInput['candidateCoverages'];
  simulationClockRevision: number;
}

export function useGeoRouteAnalysis(input: UseGeoRouteAnalysisInput) {
  const {
    isCurrentTimelinePropagated, uiMode, eligibleCandidateCoverages, simulationClockRevision,
    propagatedTimelineRevision,
    activePoint: activeAnalysisPoint, pointB, satellites, linkMode, activeMeshTab,
    candidateCoveragesB, selectedCoverage,
    selectedUplinkCoverage, selectedDownlinkCoverage,
    selectedUplinkCoverageB, selectedDownlinkCoverageB,
    geoRFClassIdA, geoRFClassIdB, geoRFCustomParamsA, geoRFCustomParamsB,
    geoModemIdA, geoModemIdB, geoTerminalType, geoTerminalTypeB,
    weatherType, weatherTypeB, nearestLocation, nearestLocationB,
    failedGeoGatewaySiteIds,
  } = input;
  const simulationClockSnapshot = { revision: simulationClockRevision };

  const geoRouteAnalysis = useMemo(() => {
    // COMM needs stable cross-technology truth independently of the globe's
    // display scope. ENG keeps this expensive GEO candidate analysis off.
    if (!isCurrentTimelinePropagated || !shouldBuildGeoDecisionAnalysis({
      uiMode,
    })) return null;

    // Keep GEO commercial analysis off the per-second satellite state tick.
    // The live ref is fresh when the scenario changes, without forcing a
    // constellation-wide route recomputation for every visual propagation sample.
    const routeSatellites = satellites;

    return buildGeoRouteAnalysisViewModel({
      activePoint: activeAnalysisPoint,
      pointB,
      satellites: routeSatellites,
      // Header scope is presentation state. Decision Support always evaluates
      // the GEO route against the full analytical satellite set.
      satelliteScope: DECISION_GEO_ANALYSIS_SCOPE,
      linkMode,
      activeMeshTab,
      candidateCoverages: eligibleCandidateCoverages,
      candidateCoveragesB,
      selectedCoverage,
      selectedUplinkCoverage,
      selectedDownlinkCoverage,
      selectedUplinkCoverageB,
      selectedDownlinkCoverageB,
      geoRFClassIdA,
      geoRFClassIdB,
      geoRFCustomParamsA,
      geoRFCustomParamsB,
      geoModemIdA,
      geoModemIdB,
      geoTerminalType,
      geoTerminalTypeB,
      weatherType,
      weatherTypeB,
      nearestLocation,
      nearestLocationB,
      failedGeoGatewaySiteIds,
    });
  // satellites / satellitesForResolutionRef intentionally omitted so this stays off
  // the visual propagation tick; routeSatellites is read at execution time above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    candidateCoveragesB,
    eligibleCandidateCoverages,
    failedGeoGatewaySiteIds,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    geoModemIdA,
    geoModemIdB,
    geoTerminalType,
    geoTerminalTypeB,
    linkMode,
    nearestLocation,
    nearestLocationB,
    pointB,
    propagatedTimelineRevision,
    // Paired with propagatedTimelineRevision so the gate above closes on the
    // clock command and reopens on the first propagated batch. Without it, a
    // seek left GEO showing the previous timeline's route while every LEO
    // surface had already blanked.
    simulationClockSnapshot.revision,
    satellites.length,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedDownlinkCoverageB,
    selectedUplinkCoverage,
    selectedUplinkCoverageB,
    uiMode,
    weatherType,
    weatherTypeB,
  ]);

  return geoRouteAnalysis;
}
