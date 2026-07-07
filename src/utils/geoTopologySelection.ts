import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { LinkMode } from '../types/linkMode';
import type { GeoGatewayData } from '../components/globe/GlobeConfig';
import { GEO_GATEWAYS } from '../components/globe/GlobeConfig';
import { filterCandidateCoveragesByRFClass, findCandidateCoverages } from './geoCoverageSelection';
import {
  BAND_PARAMS,
  DEFAULT_TERMINAL,
  NOMINAL_SAT_EIRP_DBW,
  NOMINAL_SAT_GT_DBK,
  computeDownlinkBudget,
  computeUplinkBudget,
  getTerminalDownlinkGT,
  type GeoBand,
} from './geoLinkBudget';
import {
  buildMeshResult,
  buildStarForwardResult,
  buildStarReturnResult,
  findBestDownlinkMatch,
  findBestStarGatewayDownlinkMatch,
  findBestStarGatewayUplinkMatch,
  findBestUplinkMatch,
  synthesizeDownlinkCandidate,
  synthesizeUplinkCandidate,
  type DualSegmentResult,
} from './geoDualSegmentBudget';
import {
  GEO_ALTITUDE_KM,
  distanceKm,
  resolveStarTrafficGatewayForCoverage,
  type StarTrafficGatewayDiagnostic,
} from './geoConnectivityModel';
import { warn } from './logger';

export interface TopologySelectionCandidate {
  satellite: SatelliteData;
  gateway: GeoGatewayData | null;
  uplinkA: CandidateCoverage | null;
  downlinkA: CandidateCoverage | null;
  uplinkB: CandidateCoverage | null;
  downlinkB: CandidateCoverage | null;
  result: DualSegmentResult;
  score: number;
  gatewayResolutionDiagnostic?: StarTrafficGatewayDiagnostic;
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
export const ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB = 3;

export type StarGatewayFeederResolutionSource =
  | 'modeled-gateway-contour'
  | 'estimated-star-feeder'
  | 'unavailable';

export interface StarGatewayFeederResolution {
  candidate: CandidateCoverage | null;
  source: StarGatewayFeederResolutionSource;
  dataPenaltyDb: number;
}

const estimatedStarFeederWarningKeys = new Set<string>();

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
  allowSynthesized = false,
): CandidateCoverage | null {
  const sameSatellite = pool.filter((candidate) => (
    candidate.isUplink === isUplink &&
    candidate.satelliteId === satellite.id
  ));
  if (sameSatellite.length === 0) return null;

  return sameSatellite.find((candidate) => !candidate.isSynthesized)
    ?? (allowSynthesized ? sameSatellite[0] : null);
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

const getGatewaySatelliteSlantRangeKm = (
  satellite: SatelliteData,
  gateway: GeoGatewayData,
): number => distanceKm(
  { lat: gateway.lat, lng: gateway.lng, altKm: 0 },
  {
    lat: Number.isFinite(satellite.position.lat) ? satellite.position.lat : 0,
    lng: Number.isFinite(satellite.position.lng) ? satellite.position.lng : gateway.lng,
    altKm: Number.isFinite(satellite.position.alt) && satellite.position.alt > 1000
      ? satellite.position.alt
      : GEO_ALTITUDE_KM,
  },
);

const warnEstimatedStarFeederOnce = ({
  satellite,
  gateway,
  band,
  linkMode,
  direction,
}: {
  satellite: SatelliteData;
  gateway: GeoGatewayData;
  band: GeoBand;
  linkMode: Extract<LinkMode, 'STAR_FORWARD' | 'STAR_RETURN'>;
  direction: 'uplink' | 'downlink';
}) => {
  const key = [
    satellite.id,
    gateway.gateway_id,
    band,
    linkMode,
    direction,
  ].join('|');

  if (estimatedStarFeederWarningKeys.has(key)) return;
  estimatedStarFeederWarningKeys.add(key);

  warn(
    `[Geo STAR feeder] Missing modeled gateway ${direction} contour for ${satellite.name} via ${gateway.name} `
    + `(${band}, ${linkMode}); using estimated feeder with -${ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB} dB data penalty.`
  );
};

export function synthesizeStarGatewayUplinkCandidate(
  from: CandidateCoverage,
  satellite: SatelliteData,
  gateway: GeoGatewayData,
): CandidateCoverage {
  const band = (from.band ?? 'Ku') as GeoBand;
  const bandParams = BAND_PARAMS[band];
  const nominalGT = NOMINAL_SAT_GT_DBK[band];
  const bandwidthMhz = from.bandwidthMhz ?? bandParams.defaultBwMhz;
  const slantRangeKm = getGatewaySatelliteSlantRangeKm(satellite, gateway);
  const atmosphericLossDb = bandParams.atmosLossDb + ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB;

  const budget = computeUplinkBudget(
    DEFAULT_TERMINAL.eirpTerminalDbw,
    nominalGT,
    slantRangeKm,
    bandParams.freqUpGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );

  return {
    ...from,
    isUplink: true,
    isSynthesized: true,
    syntheticSource: 'estimated-star-feeder',
    dataPenaltyDb: ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB,
    coverageKey: `${from.coverageKey}::estimated-star-feeder-ul`,
    coverageName: `${from.coverageName} estimated gateway uplink`,
    beamId: `${from.beamId}::estimated-star-feeder-ul`,
    beamName: `${from.beamName} gateway feeder`,
    distanceFromBeamCenter: 0,
    gtDbk: nominalGT,
    eirpDbw: undefined,
    frequencyGhz: bandParams.freqUpGhz,
    bandwidthMhz,
    atmosphericLossDb,
    slantRangeKm: budget.slantRangeKm,
    fsplDb: budget.fsplDb,
    cn0Dbhz: budget.cn0Dbhz,
    cnDb: budget.cnDb,
    linkMarginDb: budget.linkMarginDb,
    modcod: budget.modcod,
    spectralEfficiency: budget.spectralEfficiency,
    throughputEstimate: budget.achievableThroughputMbps,
  };
}

export function synthesizeStarGatewayDownlinkCandidate(
  from: CandidateCoverage,
  satellite: SatelliteData,
  gateway: GeoGatewayData,
): CandidateCoverage {
  const band = (from.band ?? 'Ku') as GeoBand;
  const bandParams = BAND_PARAMS[band];
  const nominalEIRP = NOMINAL_SAT_EIRP_DBW[band];
  const bandwidthMhz = from.bandwidthMhz ?? bandParams.defaultBwMhz;
  const slantRangeKm = getGatewaySatelliteSlantRangeKm(satellite, gateway);
  const atmosphericLossDb = bandParams.atmosLossDb + ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB;

  const budget = computeDownlinkBudget(
    nominalEIRP,
    getTerminalDownlinkGT(band),
    slantRangeKm,
    bandParams.freqDownGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );

  return {
    ...from,
    isUplink: false,
    isSynthesized: true,
    syntheticSource: 'estimated-star-feeder',
    dataPenaltyDb: ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB,
    coverageKey: `${from.coverageKey}::estimated-star-feeder-dl`,
    coverageName: `${from.coverageName} estimated gateway downlink`,
    beamId: `${from.beamId}::estimated-star-feeder-dl`,
    beamName: `${from.beamName} gateway feeder`,
    distanceFromBeamCenter: 0,
    eirpDbw: nominalEIRP,
    gtDbk: undefined,
    frequencyGhz: bandParams.freqDownGhz,
    bandwidthMhz,
    atmosphericLossDb,
    slantRangeKm: budget.slantRangeKm,
    fsplDb: budget.fsplDb,
    cn0Dbhz: budget.cn0Dbhz,
    cnDb: budget.cnDb,
    linkMarginDb: budget.linkMarginDb,
    modcod: budget.modcod,
    spectralEfficiency: budget.spectralEfficiency,
    throughputEstimate: budget.achievableThroughputMbps,
  };
}

export function resolveStarGatewayFeederCandidate({
  reference,
  gatewayPool,
  satellite,
  gateway,
  linkMode,
}: {
  reference: CandidateCoverage | null;
  gatewayPool: CandidateCoverage[];
  satellite: SatelliteData;
  gateway: GeoGatewayData;
  linkMode: Extract<LinkMode, 'STAR_FORWARD' | 'STAR_RETURN'>;
}): StarGatewayFeederResolution {
  if (!reference) {
    return { candidate: null, source: 'unavailable', dataPenaltyDb: 0 };
  }

  if (linkMode === 'STAR_FORWARD') {
    const modeled = findBestStarGatewayUplinkMatch(reference, gatewayPool);
    if (modeled) return { candidate: modeled, source: 'modeled-gateway-contour', dataPenaltyDb: 0 };

    warnEstimatedStarFeederOnce({
      satellite,
      gateway,
      band: (reference.band ?? 'Ku') as GeoBand,
      linkMode,
      direction: 'uplink',
    });
    return {
      candidate: synthesizeStarGatewayUplinkCandidate(reference, satellite, gateway),
      source: 'estimated-star-feeder',
      dataPenaltyDb: ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB,
    };
  }

  const modeled = findBestStarGatewayDownlinkMatch(reference, gatewayPool);
  if (modeled) return { candidate: modeled, source: 'modeled-gateway-contour', dataPenaltyDb: 0 };

  warnEstimatedStarFeederOnce({
    satellite,
    gateway,
    band: (reference.band ?? 'Ku') as GeoBand,
    linkMode,
    direction: 'downlink',
  });
  return {
    candidate: synthesizeStarGatewayDownlinkCandidate(reference, satellite, gateway),
    source: 'estimated-star-feeder',
    dataPenaltyDb: ESTIMATED_STAR_FEEDER_DATA_PENALTY_DB,
  };
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

    const allowStarSynthesizedUserDirection = linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN';
    const downlinkA = getBestDirectionCandidate(compatibleCoveragesA, satellite, false, allowStarSynthesizedUserDirection);
    const uplinkA = getBestDirectionCandidate(compatibleCoveragesA, satellite, true, allowStarSynthesizedUserDirection);

    let candidate: TopologySelectionCandidate | null = null;

    if (linkMode === 'STAR_FORWARD') {
      // gatewaySelection is null when the satellite's SCC site has no CONFIRMED
      // or PUBLICLY_LIKELY traffic role — the satellite is skipped rather than
      // building a link budget against an unconfirmed/SCC-only site.
      const gatewaySelection = resolveStarTrafficGatewayForCoverage(satellite, downlinkA, gateways);
      if (!gatewaySelection || !downlinkA) continue;

      const gatewayPool = buildGatewayCandidatePool(satellite, gatewaySelection.gateway);
      const uplinkGateway = resolveStarGatewayFeederCandidate({
        reference: downlinkA,
        gatewayPool,
        satellite,
        gateway: gatewaySelection.gateway,
        linkMode,
      }).candidate;
      if (!uplinkGateway) continue;

      const result = buildStarForwardResult(
        downlinkA,
        uplinkGateway,
        gatewaySelection.trafficCapability,
        pointALabel,
        undefined,
        terminalTypeA,
        customParamsA,
        gatewaySelection.gateway.name,
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
        gatewayResolutionDiagnostic: gatewaySelection.diagnostic,
      };
    } else if (linkMode === 'STAR_RETURN') {
      // Same trafficStatus gating as STAR_FORWARD above.
      const gatewaySelection = resolveStarTrafficGatewayForCoverage(satellite, uplinkA, gateways);
      if (!gatewaySelection || !uplinkA) continue;

      const gatewayPool = buildGatewayCandidatePool(satellite, gatewaySelection.gateway);
      const downlinkGateway = resolveStarGatewayFeederCandidate({
        reference: uplinkA,
        gatewayPool,
        satellite,
        gateway: gatewaySelection.gateway,
        linkMode,
      }).candidate;
      if (!downlinkGateway) continue;

      const result = buildStarReturnResult(
        uplinkA,
        downlinkGateway,
        gatewaySelection.trafficCapability,
        pointALabel,
        undefined,
        terminalTypeA,
        customParamsA,
        gatewaySelection.gateway.name,
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
        gatewayResolutionDiagnostic: gatewaySelection.diagnostic,
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
          undefined, // weatherAdjDbA — not applied during topology scoring
          undefined, // weatherAdjDbB
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
