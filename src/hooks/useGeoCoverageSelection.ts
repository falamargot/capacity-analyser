/**
 * useGeoCoverageSelection — which GEO transponder pair the analysis uses.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, second slice). 355 lines of
 * derivation lived in the component: the eligible candidate pool, the
 * topology-chosen default, the user's explicit uplink/downlink keys for both
 * sites, the effects that invalidate those keys when the world moves under
 * them, and the resolved pairs every downstream panel reads.
 *
 * It is split in two because the state and its derivation are needed at
 * different points of the component: the keys are user selection and are read
 * early (the manual/auto policy depends on them), while the derivation needs the
 * candidate coverages, which are computed much later. Forcing them into one call
 * would have meant moving unrelated code to satisfy hook order.
 *
 * Everything here is MOVED, not rewritten: same memos, same dependency arrays,
 * same effects in the same order. The one addition is names — a reader can now
 * see that this is one concern rather than three hundred lines between two
 * unrelated blocks.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CandidateCoverage, Selection } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import { LINK_MODE_REQUIRES_POINT_B, type LinkMode } from '../types/linkMode';
import type { TerminalRFClassId, TerminalRFCustomParams } from '../utils/geoTerminalRFModel';
import { findCandidateCoverages, getCandidateCoverageKey } from '../utils/geoCoverageSelection';
import { supportsStarTrafficTopology } from '../utils/geoGroundInfrastructure';
import { selectTrafficGeoGateway } from '../utils/geoConnectivityModel';
import { GEO_GATEWAYS } from '../components/globe/GlobeConfig';
import {
  augmentCandidatesWithSynthesizedDirections, selectBestTopologyPath,
} from '../utils/geoTopologySelection';

/**
 * Candidate ranking by link margin, moved here with the block that is its only
 * caller. `-Infinity` for a missing margin so an unmeasured candidate can never
 * outrank a measured one.
 */
const getCandidateLinkMargin = (candidate: CandidateCoverage): number => (
  Number.isFinite(candidate.linkMarginDb) ? candidate.linkMarginDb! : -Infinity
);

const compareCandidateLinkMargin = (left: CandidateCoverage, right: CandidateCoverage): number => {
  const marginDelta = getCandidateLinkMargin(right) - getCandidateLinkMargin(left);
  if (marginDelta !== 0) return marginDelta;
  return right.score - left.score;
};

const pickBestGeoLinkMargin = (candidates: CandidateCoverage[]): CandidateCoverage | null => (
  candidates.reduce<CandidateCoverage | null>(
    (best, candidate) => (!best || compareCandidateLinkMargin(candidate, best) < 0 ? candidate : best),
    null
  )
);

/** The four explicit coverage keys, as one snapshot-able value. */
export interface GeoCoverageKeySet {
  selectedUplinkKey: string | null;
  selectedDownlinkKey: string | null;
  selectedUplinkKeyB: string | null;
  selectedDownlinkKeyB: string | null;
}

export interface RestoredGeoCoverageSelection {
  selectedUplinkKey: string | null;
  selectedDownlinkKey: string | null;
  selectedUplinkKeyB: string | null;
  selectedDownlinkKeyB: string | null;
}

/**
 * The user's explicit choice, plus the two "do not reset on the next change"
 * flags the endpoint handlers set before they move the world deliberately.
 */
export function useGeoCoverageKeys(restored?: RestoredGeoCoverageSelection | null) {
  const restoredTelecomSession = restored ? { geoCoverageSelection: restored } : null;
  const [selectedUplinkKey, setSelectedUplinkKey] = useState<string | null>(restoredTelecomSession?.geoCoverageSelection.selectedUplinkKey ?? null);
  const [selectedDownlinkKey, setSelectedDownlinkKey] = useState<string | null>(restoredTelecomSession?.geoCoverageSelection.selectedDownlinkKey ?? null);
  const [selectedUplinkKeyB, setSelectedUplinkKeyB] = useState<string | null>(restoredTelecomSession?.geoCoverageSelection.selectedUplinkKeyB ?? null);
  const [selectedDownlinkKeyB, setSelectedDownlinkKeyB] = useState<string | null>(restoredTelecomSession?.geoCoverageSelection.selectedDownlinkKeyB ?? null);
  const geoSelectionPolicy = selectedUplinkKey || selectedDownlinkKey || selectedUplinkKeyB || selectedDownlinkKeyB
    ? 'manual' as const
    : 'auto' as const;
  const preserveCoverageKeysOnNextTargetResetRef = useRef(false);
  const preserveSiteBCoverageKeysOnNextPointBResetRef = useRef(false);

  /*
   * The four keys as one value, for the engineering-mode snapshot (S-2). The
   * snapshot used to take eight fields — four keys and four setters — from this
   * hook; that was half of its input surface for one concept.
   */
  const captureCoverageKeys = useCallback((): GeoCoverageKeySet => ({
    selectedUplinkKey,
    selectedDownlinkKey,
    selectedUplinkKeyB,
    selectedDownlinkKeyB,
  }), [selectedDownlinkKey, selectedDownlinkKeyB, selectedUplinkKey, selectedUplinkKeyB]);

  const restoreCoverageKeys = useCallback((keys: GeoCoverageKeySet) => {
    setSelectedUplinkKey(keys.selectedUplinkKey);
    setSelectedDownlinkKey(keys.selectedDownlinkKey);
    setSelectedUplinkKeyB(keys.selectedUplinkKeyB);
    setSelectedDownlinkKeyB(keys.selectedDownlinkKeyB);
  }, []);

  return {
    captureCoverageKeys,
    restoreCoverageKeys,
    selectedUplinkKey, setSelectedUplinkKey,
    selectedDownlinkKey, setSelectedDownlinkKey,
    selectedUplinkKeyB, setSelectedUplinkKeyB,
    selectedDownlinkKeyB, setSelectedDownlinkKeyB,
    geoSelectionPolicy,
    preserveCoverageKeysOnNextTargetResetRef,
    preserveSiteBCoverageKeysOnNextPointBResetRef,
  };
}

export type GeoCoverageKeys = ReturnType<typeof useGeoCoverageKeys>;

export interface GeoCoverageSelectionInput {
  keys: GeoCoverageKeys;
  candidateCoverages: CandidateCoverage[];
  candidateCoveragesB: CandidateCoverage[];
  geoOperationalSatellites: SatelliteData[];
  linkMode: LinkMode;
  selectedSelection: Selection;
  geoRFClassIdA: TerminalRFClassId;
  geoRFClassIdB: TerminalRFClassId;
  geoRFCustomParamsA: TerminalRFCustomParams | null;
  geoRFCustomParamsB: TerminalRFCustomParams | null;
  failedGeoGatewaySiteIds: ReadonlySet<string>;
  pointB: { lat: number; lng: number } | null;
}

export function useGeoCoverageSelection(input: GeoCoverageSelectionInput) {
  const {
    candidateCoverages, candidateCoveragesB, geoOperationalSatellites, linkMode,
    selectedSelection, geoRFClassIdA, geoRFClassIdB, geoRFCustomParamsA,
    geoRFCustomParamsB, failedGeoGatewaySiteIds, pointB,
  } = input;
  const {
    selectedUplinkKey, setSelectedUplinkKey,
    selectedDownlinkKey, setSelectedDownlinkKey,
    selectedUplinkKeyB, setSelectedUplinkKeyB,
    selectedDownlinkKeyB, setSelectedDownlinkKeyB,
    preserveCoverageKeysOnNextTargetResetRef,
    preserveSiteBCoverageKeysOnNextPointBResetRef,
  } = input.keys;

  const eligibleCandidateCoverages = useMemo(() => {
    if (candidateCoverages.length === 0) return candidateCoverages;

    const candidatePoolForMode = (linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN')
      ? augmentCandidatesWithSynthesizedDirections(candidateCoverages, geoOperationalSatellites)
      : candidateCoverages;

    const hasRealDirectionPair = (pool: CandidateCoverage[], satelliteId: string) => {
      const satelliteCandidates = pool.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isSynthesized
      ));

      return satelliteCandidates.some((candidate) => candidate.isUplink)
        && satelliteCandidates.some((candidate) => !candidate.isUplink);
    };

    const candidateSatelliteIds = [...new Set(candidateCoverages.map((candidate) => candidate.satelliteId))];
    const candidateSatelliteIdsWithRequiredUserDirection = new Set(
      candidateSatelliteIds.filter((satelliteId) => {
        if (linkMode === 'STAR_FORWARD') return candidatePoolForMode.some((candidate) => (
          candidate.satelliteId === satelliteId && !candidate.isUplink
        ));
        if (linkMode === 'STAR_RETURN') return candidatePoolForMode.some((candidate) => (
          candidate.satelliteId === satelliteId && candidate.isUplink
        ));
        return hasRealDirectionPair(candidateCoverages, satelliteId);
      })
    );

    if (candidateSatelliteIdsWithRequiredUserDirection.size === 0) return [];

    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      if (candidateCoveragesB.length === 0) {
        return candidatePoolForMode.filter((candidate) => candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId));
      }
      const pointBSatelliteIdsWithPair = new Set(
        [...new Set(candidateCoveragesB.map((candidate) => candidate.satelliteId))]
          .filter((satelliteId) => hasRealDirectionPair(candidateCoveragesB, satelliteId))
      );
      return candidatePoolForMode.filter((candidate) => (
        candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId) &&
        pointBSatelliteIdsWithPair.has(candidate.satelliteId)
      ));
    }

    if (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN') {
      return candidateCoverages.filter((candidate) => candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId));
    }

    const candidateSatellites = geoOperationalSatellites.filter((satellite) => candidateSatelliteIdsWithRequiredUserDirection.has(satellite.id));

    const gatewayByPosition = new Map<string, { lat: number; lng: number }>();
    const gatewayPositionBySatelliteId = new Map<string, string>();

    for (const satellite of candidateSatellites) {
      if (!supportsStarTrafficTopology(satellite)) continue;

      // null here means the satellite's resolved SCC site has no CONFIRMED or
      // PUBLICLY_LIKELY traffic role (see GatewayTrafficStatus). The satellite is
      // intentionally excluded from STAR eligibility rather than falling back to
      // the SCC site as if it were a confirmed teleport — this corresponds to
      // CandidateCoverageStatus 'teleport_unconfirmed' conceptually, though no
      // satellite reaches this branch with current reference allocation data
      // (verified: every nominalSccCode/backupSccCode resolves to a
      // PUBLICLY_LIKELY site as of this refactor).
      const gatewaySelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS);
      if (!gatewaySelection) continue;

      const gatewayPosition = {
        lat: gatewaySelection.gateway.lat,
        lng: gatewaySelection.gateway.lng,
      };
      const positionKey = `${gatewayPosition.lat},${gatewayPosition.lng}`;
      gatewayByPosition.set(positionKey, gatewayPosition);
      gatewayPositionBySatelliteId.set(satellite.id, positionKey);
    }

    if (gatewayPositionBySatelliteId.size === 0) return [];

    const coveredSatelliteIdsByGatewayPosition = new Map<string, Set<string>>();
    for (const [positionKey, gatewayPosition] of gatewayByPosition) {
      const gatewayCandidates = augmentCandidatesWithSynthesizedDirections(
        findCandidateCoverages(
          gatewayPosition,
          geoOperationalSatellites
        ),
        geoOperationalSatellites,
      );
      coveredSatelliteIdsByGatewayPosition.set(
        positionKey,
        new Set(gatewayCandidates
          .filter((candidate) => (
            linkMode === 'STAR_FORWARD'
              ? candidate.isUplink
              : !candidate.isUplink
          ))
          .map((candidate) => candidate.satelliteId))
      );
    }

    const eligibleSatelliteIds = new Set<string>();
    const candidateSatelliteById = new Map(candidateSatellites.map((satellite) => [satellite.id, satellite]));
    for (const [satelliteId, positionKey] of gatewayPositionBySatelliteId) {
      const satellite = candidateSatelliteById.get(satelliteId);
      const hasModeledGatewayContour = coveredSatelliteIdsByGatewayPosition.get(positionKey)?.has(satelliteId) === true;
      const canUseEstimatedStarFeeder = satellite ? supportsStarTrafficTopology(satellite) : false;
      if (hasModeledGatewayContour || canUseEstimatedStarFeeder) {
        eligibleSatelliteIds.add(satelliteId);
      }
    }

    return candidatePoolForMode.filter((candidate) => (
      candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId) &&
      eligibleSatelliteIds.has(candidate.satelliteId)
    ));
  }, [candidateCoverages, candidateCoveragesB, linkMode, geoOperationalSatellites]);

  const targetSelectionResetKey = useMemo(() => (
    selectedSelection.type === 'target'
      ? [
          selectedSelection.targetType,
          selectedSelection.position.lat,
          selectedSelection.position.lng,
          selectedSelection.position.altitude ?? 'ground',
        ].join('::')
      : selectedSelection.type
  ), [selectedSelection]);

  /*
   * The setters and the preserve-refs are in the dependency arrays below only to
   * satisfy the exhaustive-deps rule: they come through the `keys` object now, so
   * the linter can no longer see that they are `useState` setters and `useRef`
   * boxes, both stable by contract. Listing them changes nothing at runtime and
   * keeps the repository at zero lint warnings.
   */
  // Reset both keys whenever the target point changes
  useEffect(() => {
    if (preserveCoverageKeysOnNextTargetResetRef.current) {
      preserveCoverageKeysOnNextTargetResetRef.current = false;
      return;
    }
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    setSelectedUplinkKeyB(null);
    setSelectedDownlinkKeyB(null);
  }, [
    targetSelectionResetKey, geoRFClassIdA, geoRFClassIdB,
    preserveCoverageKeysOnNextTargetResetRef,
    setSelectedUplinkKey, setSelectedDownlinkKey, setSelectedUplinkKeyB, setSelectedDownlinkKeyB,
  ]);

  useEffect(() => {
    if (preserveSiteBCoverageKeysOnNextPointBResetRef.current) {
      preserveSiteBCoverageKeysOnNextPointBResetRef.current = false;
      return;
    }
    setSelectedUplinkKeyB(null);
    setSelectedDownlinkKeyB(null);
  }, [
    linkMode, pointB, preserveSiteBCoverageKeysOnNextPointBResetRef,
    setSelectedUplinkKeyB, setSelectedDownlinkKeyB,
  ]);

  // Invalidate stale keys when the candidate list changes.
  useEffect(() => {
    if (selectedSelection.type !== 'target') return;
    if (selectedUplinkKey) {
      const c = eligibleCandidateCoverages.find(cc => getCandidateCoverageKey(cc) === selectedUplinkKey);
      if (!c) setSelectedUplinkKey(null);
    }
    if (selectedDownlinkKey) {
      const c = eligibleCandidateCoverages.find(cc => getCandidateCoverageKey(cc) === selectedDownlinkKey);
      if (!c) setSelectedDownlinkKey(null);
    }
  }, [
    eligibleCandidateCoverages, selectedSelection.type, selectedUplinkKey, selectedDownlinkKey,
    setSelectedUplinkKey, setSelectedDownlinkKey,
  ]);

  useEffect(() => {
    if (selectedSelection.type !== 'target') return;
    if (selectedUplinkKeyB) {
      const c = candidateCoveragesB.find(cc => getCandidateCoverageKey(cc) === selectedUplinkKeyB);
      if (!c) setSelectedUplinkKeyB(null);
    }
    if (selectedDownlinkKeyB) {
      const c = candidateCoveragesB.find(cc => getCandidateCoverageKey(cc) === selectedDownlinkKeyB);
      if (!c) setSelectedDownlinkKeyB(null);
    }
  }, [
    candidateCoveragesB, selectedSelection.type, selectedUplinkKeyB, selectedDownlinkKeyB,
    setSelectedUplinkKeyB, setSelectedDownlinkKeyB,
  ]);

  const topologyDefaultSelection = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (eligibleCandidateCoverages.length === 0) return null;

    return selectBestTopologyPath({
      linkMode,
      satellites: geoOperationalSatellites,
      candidateCoveragesA: eligibleCandidateCoverages,
      candidateCoveragesB,
      pointB,
      terminalTypeA: geoRFClassIdA,
      terminalTypeB: geoRFClassIdB,
      customParamsA: geoRFCustomParamsA,
      customParamsB: geoRFCustomParamsB,
      pointALabel: 'Terminal A',
      pointBLabel: 'Terminal B',
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
    });
  }, [
    eligibleCandidateCoverages,
    candidateCoveragesB,
    failedGeoGatewaySiteIds,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    linkMode,
    pointB,
    geoOperationalSatellites,
    selectedSelection.type,
  ]);

  const defaultCoveragePair = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return { uplink: null, downlink: null };
    }

    const satelliteIds = [...new Set(eligibleCandidateCoverages.map((candidate) => candidate.satelliteId))];
    let best: {
      uplink: CandidateCoverage;
      downlink: CandidateCoverage;
      limitingMargin: number;
      score: number;
    } | null = null;

    for (const satelliteId of satelliteIds) {
      const uplink = pickBestGeoLinkMargin(eligibleCandidateCoverages.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        candidate.isUplink &&
        !candidate.isSynthesized
      )));
      const downlink = pickBestGeoLinkMargin(eligibleCandidateCoverages.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isUplink &&
        !candidate.isSynthesized
      )));

      if (!uplink || !downlink) continue;

      const limitingMargins = [getCandidateLinkMargin(uplink), getCandidateLinkMargin(downlink)];
      if (LINK_MODE_REQUIRES_POINT_B.has(linkMode) && candidateCoveragesB.length > 0) {
        const uplinkB = pickBestGeoLinkMargin(candidateCoveragesB.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          candidate.isUplink &&
          !candidate.isSynthesized
        )));
        const downlinkB = pickBestGeoLinkMargin(candidateCoveragesB.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          !candidate.isUplink &&
          !candidate.isSynthesized
        )));

        if (!uplinkB || !downlinkB) continue;
        limitingMargins.push(getCandidateLinkMargin(uplinkB), getCandidateLinkMargin(downlinkB));
      }

      const limitingMargin = Math.min(...limitingMargins);
      const score = uplink.score + downlink.score;
      if (
        !best ||
        limitingMargin > best.limitingMargin ||
        (limitingMargin === best.limitingMargin && score > best.score)
      ) {
        best = { uplink, downlink, limitingMargin, score };
      }
    }

    return {
      uplink: best?.uplink ?? topologyDefaultSelection?.uplinkA ?? null,
      downlink: best?.downlink ?? topologyDefaultSelection?.downlinkA ?? null,
    };
  }, [candidateCoveragesB, eligibleCandidateCoverages, linkMode, selectedSelection.type, topologyDefaultSelection]);

  // Default uplink / downlink when nothing is explicitly selected.
  const defaultDownlinkCoverage = defaultCoveragePair.downlink;
  const defaultUplinkCoverage = defaultCoveragePair.uplink;

  const rawSelectedUplinkCoverage = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (selectedUplinkKey) return eligibleCandidateCoverages.find(c => getCandidateCoverageKey(c) === selectedUplinkKey) ?? defaultUplinkCoverage;
    return defaultUplinkCoverage;
  }, [eligibleCandidateCoverages, defaultUplinkCoverage, selectedSelection.type, selectedUplinkKey]);

  const rawSelectedDownlinkCoverage = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (selectedDownlinkKey) return eligibleCandidateCoverages.find(c => getCandidateCoverageKey(c) === selectedDownlinkKey) ?? defaultDownlinkCoverage;
    return defaultDownlinkCoverage;
  }, [eligibleCandidateCoverages, defaultDownlinkCoverage, selectedSelection.type, selectedDownlinkKey]);

  const selectedUplinkCoverageB = useMemo(() => {
    if (selectedSelection.type !== 'target' || !selectedUplinkKeyB) return null;
    return candidateCoveragesB.find(c => getCandidateCoverageKey(c) === selectedUplinkKeyB) ?? null;
  }, [candidateCoveragesB, selectedSelection.type, selectedUplinkKeyB]);

  const selectedDownlinkCoverageB = useMemo(() => {
    if (selectedSelection.type !== 'target' || !selectedDownlinkKeyB) return null;
    return candidateCoveragesB.find(c => getCandidateCoverageKey(c) === selectedDownlinkKeyB) ?? null;
  }, [candidateCoveragesB, selectedSelection.type, selectedDownlinkKeyB]);

  const selectedCoveragePair = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return { uplink: null, downlink: null };
    }

    const findCompanion = (anchor: CandidateCoverage, wantUplink: boolean) => {
      const sameSatellite = eligibleCandidateCoverages.filter((candidate) => (
        candidate.isUplink === wantUplink &&
        candidate.satelliteId === anchor.satelliteId
      ));

      return pickBestGeoLinkMargin(sameSatellite.filter((candidate) => candidate.band === anchor.band && !candidate.isSynthesized))
        ?? pickBestGeoLinkMargin(sameSatellite.filter((candidate) => !candidate.isSynthesized))
        ?? pickBestGeoLinkMargin(sameSatellite.filter((candidate) => candidate.band === anchor.band))
        ?? pickBestGeoLinkMargin(sameSatellite)
        ?? null;
    };

    if (rawSelectedUplinkCoverage && rawSelectedDownlinkCoverage) {
      if (
        rawSelectedUplinkCoverage.satelliteId === rawSelectedDownlinkCoverage.satelliteId &&
        rawSelectedUplinkCoverage.band === rawSelectedDownlinkCoverage.band
      ) {
        return { uplink: rawSelectedUplinkCoverage, downlink: rawSelectedDownlinkCoverage };
      }

      const anchor = linkMode === 'STAR_RETURN'
        ? rawSelectedUplinkCoverage
        : rawSelectedDownlinkCoverage;
      const companion = findCompanion(anchor, !anchor.isUplink);

      return anchor.isUplink
        ? { uplink: anchor, downlink: companion }
        : { uplink: companion, downlink: anchor };
    }

    if (rawSelectedDownlinkCoverage) {
      return {
        uplink: findCompanion(rawSelectedDownlinkCoverage, true),
        downlink: rawSelectedDownlinkCoverage,
      };
    }

    if (rawSelectedUplinkCoverage) {
      return {
        uplink: rawSelectedUplinkCoverage,
        downlink: findCompanion(rawSelectedUplinkCoverage, false),
      };
    }

    return { uplink: null, downlink: null };
  }, [
    eligibleCandidateCoverages,
    linkMode,
    rawSelectedDownlinkCoverage,
    rawSelectedUplinkCoverage,
    selectedSelection.type,
  ]);

  const selectedUplinkCoverage = selectedCoveragePair.uplink;
  const selectedDownlinkCoverage = selectedCoveragePair.downlink;

  return {
    eligibleCandidateCoverages,
    topologyDefaultSelection,
    defaultCoveragePair,
    defaultUplinkCoverage,
    defaultDownlinkCoverage,
    selectedCoveragePair,
    selectedUplinkCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverageB,
    selectedDownlinkCoverageB,
  };
}
