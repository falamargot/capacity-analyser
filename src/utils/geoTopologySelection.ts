import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { LinkMode } from '../types/linkMode';
import type { GeoGatewayData } from '../components/globe/GlobeConfig';
import { GEO_GATEWAYS } from '../components/globe/GlobeConfig';
import { filterCandidateCoveragesByRFClass, findCandidateCoverages } from './geoCoverageSelection';
import type { GeoBand } from './geoLinkBudget';
import {
  buildMeshResult,
  buildStarForwardResult,
  buildStarReturnResult,
  findBestDownlinkMatch,
  findBestUplinkMatch,
  synthesizeDownlinkCandidate,
  synthesizeUplinkCandidate,
  type DualSegmentResult,
} from './geoDualSegmentBudget';
import { selectTrafficGeoGateway } from './geoConnectivityModel';

export interface TopologySelectionCandidate {
  satellite: SatelliteData;
  gateway: GeoGatewayData | null;
  uplinkA: CandidateCoverage | null;
  downlinkA: CandidateCoverage | null;
  uplinkB: CandidateCoverage | null;
  downlinkB: CandidateCoverage | null;
  result: DualSegmentResult;
  score: number;
}

interface SelectBestTopologyPathArgs {
  linkMode: LinkMode;
  satellites: SatelliteData[];
  candidateCoveragesA: CandidateCoverage[];
  candidateCoveragesB?: CandidateCoverage[];
  pointB?: { lat: number; lng: number } | null;
  gateways?: GeoGatewayData[];
  terminalTypeA?: string;
  terminalTypeB?: string;
  customParamsA?: import('./geoTerminalRFModel').TerminalRFCustomParams | null;
  customParamsB?: import('./geoTerminalRFModel').TerminalRFCustomParams | null;
  pointALabel?: string;
  pointBLabel?: string;
}

const SYNTHETIC_SELECTION_PENALTY = 40;
const CROSS_CONNECT_PENALTY = 20;

export function satelliteHasModeledDirection(
  satellite: SatelliteData | null | undefined,
  wantUplink: boolean,
): boolean {
  return !!satellite && (satellite.coverages ?? []).some((coverage) => {
    const properties = coverage.feature?.properties as Record<string, unknown> | undefined;
    const isUplink = properties?.isUplink === true;
    const rawLevel = properties?.level ?? properties?.contour;
    const numericLevel = typeof rawLevel === 'number'
      ? rawLevel
      : typeof rawLevel === 'string'
        ? Number.parseFloat(rawLevel)
        : Number.NaN;

    return isUplink === wantUplink && Number.isFinite(numericLevel);
  });
}

export function augmentCandidatesWithSynthesizedDirections(
  candidates: CandidateCoverage[],
  satellites: SatelliteData[],
): CandidateCoverage[] {
  if (candidates.length === 0) return candidates;

  const synthPool: CandidateCoverage[] = [];
  const satIds = [...new Set(candidates.map((candidate) => candidate.satelliteId))];

  for (const satId of satIds) {
    const satCandidates = candidates.filter((candidate) => candidate.satelliteId === satId);
    const satellite = satellites.find((candidate) => candidate.id === satId);
    if (!satellite) continue;

    const hasUplink = satCandidates.some((candidate) => candidate.isUplink);
    const hasDownlink = satCandidates.some((candidate) => !candidate.isUplink);

    if (!hasUplink) {
      const bestDownlink = satCandidates.find((candidate) => !candidate.isUplink);
      if (bestDownlink && !satelliteHasModeledDirection(satellite, true)) {
        synthPool.push(synthesizeUplinkCandidate(bestDownlink));
      }
    }

    if (!hasDownlink) {
      const bestUplink = satCandidates.find((candidate) => candidate.isUplink);
      if (bestUplink && !satelliteHasModeledDirection(satellite, false)) {
        synthPool.push(synthesizeDownlinkCandidate(bestUplink));
      }
    }
  }

  return synthPool.length > 0 ? [...candidates, ...synthPool] : candidates;
}

function getBestDirectionCandidate(
  pool: CandidateCoverage[],
  satellite: SatelliteData,
  isUplink: boolean,
): CandidateCoverage | null {
  const sameSatellite = pool.filter((candidate) => (
    candidate.isUplink === isUplink &&
    candidate.satelliteId === satellite.id
  ));
  if (sameSatellite.length === 0) return null;

  return sameSatellite.find((candidate) => !candidate.isSynthesized) ?? null;
}

function scoreTopologyResult(result: DualSegmentResult): number {
  const forward = result.forward.endToEnd;
  const reverse = result.reverse?.endToEnd ?? null;
  const throughputScore = reverse
    ? Math.min(forward.endToEndThroughputMbps, reverse.endToEndThroughputMbps)
    : forward.endToEndThroughputMbps;
  const marginScore = reverse
    ? Math.min(forward.endToEndLinkMarginDb, reverse.endToEndLinkMarginDb)
    : forward.endToEndLinkMarginDb;

  let score = (throughputScore * 10) + (marginScore * 100);

  const segments = [
    result.forward.uplink.candidate,
    result.forward.downlink.candidate,
    result.reverse?.uplink.candidate ?? null,
    result.reverse?.downlink.candidate ?? null,
  ].filter((candidate): candidate is CandidateCoverage => candidate != null);

  const synthCount = segments.reduce((count, candidate) => count + (candidate.isSynthesized ? 1 : 0), 0);
  score -= synthCount * SYNTHETIC_SELECTION_PENALTY;

  if (result.transponderMode === 'cross-connect') {
    score -= CROSS_CONNECT_PENALTY;
  }

  return score;
}

function buildGatewayCandidatePool(
  satellite: SatelliteData,
  gateway: GeoGatewayData,
  compatibleBand?: GeoBand | null,
): CandidateCoverage[] {
  return augmentCandidatesWithSynthesizedDirections(
    findCandidateCoverages({ lat: gateway.lat, lng: gateway.lng }, [satellite], { compatibleBand }),
    [satellite],
  );
}

export function selectBestTopologyPath({
  linkMode,
  satellites,
  candidateCoveragesA,
  candidateCoveragesB = [],
  pointB = null,
  gateways = GEO_GATEWAYS,
  terminalTypeA,
  terminalTypeB,
  customParamsA,
  customParamsB,
  pointALabel,
  pointBLabel,
}: SelectBestTopologyPathArgs): TopologySelectionCandidate | null {
  const compatibleCoveragesA = filterCandidateCoveragesByRFClass(candidateCoveragesA, terminalTypeA);
  const compatibleCoveragesB = filterCandidateCoveragesByRFClass(candidateCoveragesB, terminalTypeB ?? terminalTypeA);

  if (compatibleCoveragesA.length === 0) return null;

  const satelliteIds = [...new Set(compatibleCoveragesA.map((candidate) => candidate.satelliteId))];
  let best: TopologySelectionCandidate | null = null;

  for (const satelliteId of satelliteIds) {
    const satellite = satellites.find((candidate) => candidate.id === satelliteId);
    if (!satellite) continue;

    const downlinkA = getBestDirectionCandidate(compatibleCoveragesA, satellite, false);
    const uplinkA = getBestDirectionCandidate(compatibleCoveragesA, satellite, true);

    let candidate: TopologySelectionCandidate | null = null;

    if (linkMode === 'STAR_FORWARD') {
      const gatewaySelection = selectTrafficGeoGateway(satellite, gateways);
      if (!gatewaySelection || !downlinkA) continue;

      const gatewayPool = buildGatewayCandidatePool(satellite, gatewaySelection.gateway, downlinkA.band ?? null);
      const uplinkGateway = findBestUplinkMatch(
        downlinkA,
        gatewayPool,
      ) ?? (!satelliteHasModeledDirection(satellite, true) ? synthesizeUplinkCandidate(downlinkA) : null);
      if (!uplinkGateway) continue;

      const result = buildStarForwardResult(
        downlinkA,
        uplinkGateway,
        gatewaySelection.gateway,
        pointALabel,
        undefined,
        terminalTypeA,
        customParamsA,
      );
      if (!result) continue;

      candidate = {
        satellite,
        gateway: gatewaySelection.gateway,
        uplinkA: uplinkA,
        downlinkA: downlinkA,
        uplinkB: null,
        downlinkB: null,
        score: scoreTopologyResult(result),
        result,
      };
    } else if (linkMode === 'STAR_RETURN') {
      const gatewaySelection = selectTrafficGeoGateway(satellite, gateways);
      if (!gatewaySelection || !uplinkA) continue;

      const gatewayPool = buildGatewayCandidatePool(satellite, gatewaySelection.gateway, uplinkA.band ?? null);
      const downlinkGateway = findBestDownlinkMatch(
        uplinkA,
        gatewayPool,
      ) ?? (!satelliteHasModeledDirection(satellite, false) ? synthesizeDownlinkCandidate(uplinkA) : null);
      if (!downlinkGateway) continue;

      const result = buildStarReturnResult(
        uplinkA,
        downlinkGateway,
        gatewaySelection.gateway,
        pointALabel,
        undefined,
        terminalTypeA,
        customParamsA,
      );
      if (!result) continue;

      candidate = {
        satellite,
        gateway: gatewaySelection.gateway,
        uplinkA: uplinkA,
        downlinkA: downlinkA,
        uplinkB: null,
        downlinkB: null,
        score: scoreTopologyResult(result),
        result,
      };
    } else if ((linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && pointB) {
      const downlinkB = getBestDirectionCandidate(compatibleCoveragesB, satellite, false);
      const uplinkB = getBestDirectionCandidate(compatibleCoveragesB, satellite, true);

      if (!uplinkA || !downlinkA || !uplinkB || !downlinkB) {
        continue;
      }

      let result: DualSegmentResult;
      try {
        result = buildMeshResult(
          uplinkA,
          downlinkB,
          uplinkB,
          downlinkA,
          {
            pointA: pointALabel,
            pointB: pointBLabel,
          },
          terminalTypeA,
          terminalTypeB,
          undefined,
          customParamsA,
          customParamsB,
          linkMode,
        );
      } catch {
        continue;
      }

      candidate = {
        satellite,
        gateway: null,
        uplinkA: uplinkA,
        downlinkA: downlinkA,
        uplinkB: uplinkB,
        downlinkB: downlinkB,
        score: scoreTopologyResult(result),
        result,
      };
    }

    if (!candidate) continue;
    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}
