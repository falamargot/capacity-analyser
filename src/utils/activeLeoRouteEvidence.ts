import { JulianDate } from 'cesium';
import type { SNPData } from '../components/globe/GlobeConfig';
import { WEATHER_PROFILES, getWeatherFactor, type TerminalType, type WeatherType } from '../components/capacity';
import { getLeoTerminalProfile, computeLeoTerminalScanLossDb } from '../config/leoTerminals';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { MobileLinkMetrics } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { SimulationStateSnapshot } from '../types/simulation';
import type { BeamLoadResult } from './capacityLayer';
import { calculateElevationAngle, compute3DDistanceKm, SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { analyzeLeoConnectivity } from './leoConnectivityModel';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from './leoFootprint';
import {
  applyBeamCapacitySharing,
  applyHandoverDegradation,
  createHandoverState,
  smoothThroughputMbps,
  updateHandoverState,
  SMOOTHING_ALPHA,
  type HandoverState,
} from './leoNetworkLayer';
import {
  computeDirectionalRfChainThroughput,
  computeUplinkRfChainThroughput,
  RF_KU_FREQ_GHZ,
  RF_SATELLITE_GOT_DB_PER_K,
} from './leoLinkBudget';
import {
  computeLeoSiteToSiteResult,
  formatLeoSiteToSiteFailureReason,
  type LeoSiteToSiteFailureReason,
  type LeoSiteToSiteResult,
} from './leoSiteToSiteModel';
import { estimateCurrentLeoBeamLink, findBestConnectedBeamInfo, hasRFConnectivity } from './rfConnectivity';
import type {
  LeoBottleneckFactor,
  LeoBottleneckScope,
  LeoNetworkLayerBreakdown,
  LeoRfChainBreakdown,
  LeoThroughputLeg,
  LeoThroughputResult,
} from '../types/leoThroughput';

type LeoTopologyMode = 'SINGLE_SITE' | 'SITE_TO_SITE';
type RouteDirection = 'A_TO_B' | 'B_TO_A';

interface LeoPoint {
  lat: number;
  lng: number;
  altitude?: number;
}

interface ResolvedLeoConnectivity {
  satellite: SatelliteData;
  snp: SNPData | null;
  userLEOElevation: number;
  snpLEOElevation: number | null;
  userLEODistance: number;
  snpLEODistance: number | null;
  connectedBeamIndex: number | null;
  candidateBeamCount: number;
}

export interface ActiveLeoPerformance {
  rtt?: number;
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
  performanceFactor: number;
  footprintFactor?: number;
  weatherFactor: number;
  weatherLabel: string;
  wasTerminalLimited?: boolean;
  throughput?: LeoThroughputResult;
  debugInfo?: LeoThroughputResult;
}

export interface ActiveLeoRouteEvidence {
  topology: LeoTopologyMode;
  inputSignature: string;
  available: boolean;
  pending: boolean;
  degraded: boolean;
  serviceStatus: 'ALLOWED' | 'DEGRADED' | 'BLOCKED' | null;
  failureReason: LeoSiteToSiteFailureReason | null;
  degradationReason: string | null;
  routeResult: LeoSiteToSiteResult | null;
  metrics: MobileLinkMetrics | null;
  leoPerformance: ActiveLeoPerformance | null;
  resolvedConnectivityA: ResolvedLeoConnectivity | null;
  resolvedConnectivityB: ResolvedLeoConnectivity | null;
  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;
  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;
  throughputAtoBMbps?: number;
  throughputBtoAMbps?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  bottleneck: string | null;
  capacityLimitation: string | null;
  rfLimitation: string | null;
  routeParticipants: {
    satellites: SatelliteData[];
    snps: SNPData[];
  };
  debugEvidence: {
    siteA?: LeoThroughputResult | null;
    siteB?: LeoThroughputResult | null;
  };
}

export interface ActiveLeoRouteEvidenceState {
  smoothedDownlinkThroughputMbps: number | null;
  smoothedUplinkThroughputMbps: number | null;
  handoverState: HandoverState;
}

export interface BuildActiveLeoRouteEvidenceInput {
  topology: LeoTopologyMode;
  direction: RouteDirection;
  activePoint: LeoPoint | null;
  pointB: LeoPoint | null;
  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;
  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;
  regulatoryResultA: RegulatoryResult | null;
  regulatoryResultB: RegulatoryResult | null;
  beamLoadA: BeamLoadResult | null;
  beamLoadB: BeamLoadResult | null;
  terminalTypeA: TerminalType;
  terminalTypeB: TerminalType;
  terminalModelIdA?: string | null;
  terminalModelIdB?: string | null;
  weatherTypeA: WeatherType;
  weatherTypeB: WeatherType;
  simulationStateA: SimulationStateSnapshot;
  simulationStateB: SimulationStateSnapshot;
  failedSnps: Set<string>;
  now: JulianDate;
}

export function createActiveLeoRouteEvidenceState(): ActiveLeoRouteEvidenceState {
  return {
    smoothedDownlinkThroughputMbps: null,
    smoothedUplinkThroughputMbps: null,
    handoverState: createHandoverState(),
  };
}

export function resetActiveLeoRouteEvidenceState(state: ActiveLeoRouteEvidenceState): void {
  state.smoothedDownlinkThroughputMbps = null;
  state.smoothedUplinkThroughputMbps = null;
  state.handoverState = createHandoverState();
}

function finitePositive(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function signaturePoint(point: LeoPoint | null): string {
  if (!point) return 'none';
  return [point.lat.toFixed(5), point.lng.toFixed(5), point.altitude?.toFixed(2) ?? 'ground'].join(',');
}

function signatureSatellite(satellite: SatelliteData | null): string {
  return satellite ? `${satellite.id}:${satellite.name}` : 'none';
}

function signatureSnp(snp: SNPData | null): string {
  return snp ? `${snp.name}:${snp.lat.toFixed(4)},${snp.lng.toFixed(4)}` : 'none';
}

function signatureBeamLoad(load: BeamLoadResult | null): string {
  if (!load) return 'none';
  return [
    load.capacityStatus,
    load.estimatedActiveUsers,
    load.beamLoadFraction?.toFixed(4) ?? 'na',
  ].join(':');
}

function signatureRegulatory(result: RegulatoryResult | null): string {
  if (!result) return 'pending';
  return [result.status, result.isoA2 ?? 'none', result.isOcean ? 'ocean' : 'land'].join(':');
}

function signatureSimulation(state: SimulationStateSnapshot): string {
  return JSON.stringify({
    policy: state.coveragePolicy,
    weather: state.weatherCondition,
    beams: state.beamHealthFactors,
    hs: Array.from(state.hsBeams).sort(),
  });
}

function buildInputSignature(input: BuildActiveLeoRouteEvidenceInput): string {
  return [
    `topology:${input.topology}`,
    `direction:${input.direction}`,
    `a:${signaturePoint(input.activePoint)}`,
    `b:${signaturePoint(input.pointB)}`,
    `satA:${signatureSatellite(input.servingSatelliteA)}`,
    `satB:${signatureSatellite(input.servingSatelliteB)}`,
    `snpA:${signatureSnp(input.selectedSnpA)}`,
    `snpB:${signatureSnp(input.selectedSnpB)}`,
    `regA:${signatureRegulatory(input.regulatoryResultA)}`,
    `regB:${signatureRegulatory(input.regulatoryResultB)}`,
    `beamA:${signatureBeamLoad(input.beamLoadA)}`,
    `beamB:${signatureBeamLoad(input.beamLoadB)}`,
    `termA:${input.terminalModelIdA ?? input.terminalTypeA}`,
    `termB:${input.terminalModelIdB ?? input.terminalTypeB}`,
    `wxA:${input.weatherTypeA}`,
    `wxB:${input.weatherTypeB}`,
    `simA:${signatureSimulation(input.simulationStateA)}`,
    `simB:${signatureSimulation(input.simulationStateB)}`,
    `failed:${Array.from(input.failedSnps).sort().join(',')}`,
  ].join('|');
}

function detectThroughputBottleneck(leg: LeoThroughputLeg): LeoBottleneckFactor {
  if (leg.rf.rfChainThroughputMbps <= 0 || leg.rf.cnDb < 14.5) return 'rf';
  if (leg.rf.terminalScanLossDb <= -3) return 'scan loss';
  if (leg.rf.modcod == null || leg.rf.cnDb < 18.5) return 'modcod';
  if (leg.network.backhaulMbps < leg.network.beamSharingMbps * 0.75) return 'backhaul';
  if (leg.network.handoverMbps < leg.network.backhaulMbps * 0.99) return 'handover';
  if (leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.8) return 'beam sharing';
  if (leg.network.peakRfMbps >= leg.network.terminalCapMbps * 0.97) return 'terminal';
  return null;
}

function formatBottleneckLabel(factor: LeoBottleneckFactor, scope: LeoBottleneckScope): string {
  if (!factor || scope === 'none') return 'None';
  return `${scope === 'DL+UL' ? 'DL+UL' : scope} ${factor === 'beam sharing' ? 'beam sharing' : factor}`;
}

function chooseMainBottleneck(dl: LeoThroughputLeg, ul: LeoThroughputLeg): { factor: LeoBottleneckFactor; scope: LeoBottleneckScope; label: string } {
  const dlFactor = detectThroughputBottleneck(dl);
  const ulFactor = detectThroughputBottleneck(ul);
  let scope: LeoBottleneckScope = 'none';
  let factor: LeoBottleneckFactor = null;

  if (dlFactor && ulFactor && dlFactor === ulFactor) {
    scope = 'DL+UL';
    factor = dlFactor;
  } else if (dlFactor) {
    scope = 'DL';
    factor = dlFactor;
  } else if (ulFactor) {
    scope = 'UL';
    factor = ulFactor;
  }

  return { factor, scope, label: formatBottleneckLabel(factor, scope) };
}

function buildResolvedConnectivity(args: {
  point: LeoPoint | null;
  satellite: SatelliteData | null;
  snp: SNPData | null;
  simulationState: SimulationStateSnapshot;
  now: JulianDate;
}): ResolvedLeoConnectivity | null {
  if (!args.point || !args.satellite) return null;
  const beamInfo = findBestConnectedBeamInfo(args.point, args.satellite, args.now, args.simulationState);
  const userLEOElevation = calculateElevationAngle(args.point, args.satellite);
  const userLEODistance = compute3DDistanceKm(args.point, {
    lat: args.satellite.position.lat,
    lng: args.satellite.position.lng,
    alt: args.satellite.position.alt,
  });

  if (!args.snp) {
    return {
      satellite: args.satellite,
      snp: null,
      userLEOElevation,
      snpLEOElevation: null,
      userLEODistance,
      snpLEODistance: null,
      connectedBeamIndex: beamInfo?.beamIndex ?? null,
      candidateBeamCount: beamInfo?.candidateCount ?? 0,
    };
  }

  return {
    satellite: args.satellite,
    snp: args.snp,
    userLEOElevation,
    snpLEOElevation: calculateElevationAngle({ lat: args.snp.lat, lng: args.snp.lng }, args.satellite),
    userLEODistance,
    snpLEODistance: compute3DDistanceKm(
      { lat: args.snp.lat, lng: args.snp.lng },
      { lat: args.satellite.position.lat, lng: args.satellite.position.lng, alt: args.satellite.position.alt },
    ),
    connectedBeamIndex: beamInfo?.beamIndex ?? null,
    candidateBeamCount: beamInfo?.candidateCount ?? 0,
  };
}

function calculateApproximatePerformance(args: {
  connectivity: ResolvedLeoConnectivity;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  weatherType: WeatherType;
  estimatedRttMs: number | null;
}): ActiveLeoPerformance {
  const profile = getLeoTerminalProfile(args.terminalType, args.terminalModelId ?? undefined);
  const snpDistance = args.connectivity.snpLEODistance ?? 0;
  const snpElevation = args.connectivity.snpLEOElevation ?? 0;
  const oneWayDistanceKm = args.connectivity.userLEODistance + snpDistance;
  const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
  const rtt = args.estimatedRttMs ?? Math.max(5, fallbackPropagationRttMs);
  const weatherFactor = getWeatherFactor(args.weatherType, args.terminalType === 'aviation');

  if (args.connectivity.userLEOElevation < MIN_USER_TERMINAL_ELEVATION_DEG || snpElevation < MIN_SNP_GATEWAY_ELEVATION_DEG) {
    return {
      rtt,
      downlinkGbps: 0,
      uplinkGbps: 0,
      stability: 'Unstable',
      performanceFactor: 0,
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[args.weatherType].label,
      wasTerminalLimited: false,
    };
  }

  const limitingElevation = Math.min(args.connectivity.userLEOElevation, snpElevation);
  const limitingDistanceKm = Math.max(args.connectivity.userLEODistance, snpDistance);
  const elevationFactor = limitingElevation >= STANDARD_SERVICE_ELEVATION_DEG
    ? 1
    : (limitingElevation - MIN_SNP_GATEWAY_ELEVATION_DEG) / (STANDARD_SERVICE_ELEVATION_DEG - MIN_SNP_GATEWAY_ELEVATION_DEG);
  const distanceFactor = (() => {
    const goodKm = 800;
    const badKm = 2200;
    if (limitingDistanceKm <= goodKm) return 1;
    if (limitingDistanceKm >= badKm) return 0.4;
    const t = (limitingDistanceKm - goodKm) / (badKm - goodKm);
    return 1 - 0.6 * t;
  })();
  const estimateTimeToExitSec = (elevDeg: number) => {
    const x = Math.max(0, Math.min(1, elevDeg / 90));
    return 480 * Math.pow(x, 1.6);
  };
  const limitingTimeToExitSec = Math.min(
    estimateTimeToExitSec(args.connectivity.userLEOElevation),
    estimateTimeToExitSec(snpElevation),
  );
  const handoverFactor = limitingTimeToExitSec < 45
    ? 0.4
    : limitingTimeToExitSec < 120
      ? 0.4 + (limitingTimeToExitSec - 45) / (120 - 45) * 0.6
      : 1;
  const performanceFactor = elevationFactor * distanceFactor * handoverFactor * weatherFactor;
  const downlinkGbps = performanceFactor > 0 ? (profile.maxDlMbps / 1000) * performanceFactor : 0;
  const uplinkGbps = performanceFactor > 0 ? (profile.maxUlMbps / 1000) * performanceFactor : 0;
  const stability = performanceFactor <= 0
    ? 'Unstable'
    : args.connectivity.userLEOElevation >= STANDARD_SERVICE_ELEVATION_DEG && snpElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG && handoverFactor >= 0.9
      ? 'High'
      : args.connectivity.userLEOElevation >= MIN_USER_TERMINAL_ELEVATION_DEG && snpElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG && handoverFactor >= 0.7
        ? 'Medium'
        : args.connectivity.userLEOElevation >= MIN_USER_TERMINAL_ELEVATION_DEG || snpElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG
          ? 'Low'
          : 'Unstable';

  return {
    rtt,
    downlinkGbps,
    uplinkGbps,
    stability,
    performanceFactor,
    footprintFactor: 1,
    weatherFactor,
    weatherLabel: WEATHER_PROFILES[args.weatherType].label,
    wasTerminalLimited: false,
  };
}

function calculateBeamAwareSummary(args: {
  deliveredDownlinkMbps: number;
  limitingElevation: number;
  normalizedDistance: number;
  estimatedRttMs: number | null;
  fallbackPropagationRttMs: number;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  weatherType: WeatherType;
}): Omit<ActiveLeoPerformance, 'debugInfo' | 'throughput'> {
  const profile = getLeoTerminalProfile(args.terminalType, args.terminalModelId ?? undefined);
  const maxDlMbps = profile.maxDlMbps;
  const weatherFactor = getWeatherFactor(args.weatherType, args.terminalType === 'aviation');
  const downlinkMbps = Math.max(0, Math.min(args.deliveredDownlinkMbps, maxDlMbps));
  const wasTerminalLimited = args.deliveredDownlinkMbps > maxDlMbps;
  const performanceFactor = maxDlMbps > 0 ? Math.min(downlinkMbps / maxDlMbps, 1) : 0;
  const rtt = args.estimatedRttMs ?? Math.max(5, args.fallbackPropagationRttMs);
  const stability = performanceFactor <= 0
    ? 'Unstable'
    : args.limitingElevation >= 40 && args.normalizedDistance <= 0.35
      ? 'High'
      : args.limitingElevation >= 25 && args.normalizedDistance <= 0.7
        ? 'Medium'
        : 'Low';

  return {
    rtt,
    downlinkGbps: downlinkMbps / 1000,
    uplinkGbps: (profile.maxUlMbps / 1000) * performanceFactor,
    stability,
    performanceFactor,
    footprintFactor: Math.max(0, 1 - args.normalizedDistance),
    weatherFactor,
    weatherLabel: WEATHER_PROFILES[args.weatherType].label,
    wasTerminalLimited,
  };
}

function buildEndpointDebug(args: {
  point: LeoPoint;
  connectivity: ResolvedLeoConnectivity;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  beamLoad: BeamLoadResult | null;
  simulationState: SimulationStateSnapshot;
  now: JulianDate;
  finalDownlinkMbps?: number | null;
  finalUplinkMbps?: number | null;
  smoothingAlpha: number;
  handoverFactor: number;
}): { debugInfo: LeoThroughputResult | null; rawDownlinkMbps: number | null; rawUplinkMbps: number | null; terminalLimited: boolean } {
  if (!args.connectivity.snp || args.simulationState.coveragePolicy.type !== 'DB_THRESHOLD' || args.connectivity.connectedBeamIndex == null) {
    return { debugInfo: null, rawDownlinkMbps: null, rawUplinkMbps: null, terminalLimited: false };
  }

  const beamEstimate = estimateCurrentLeoBeamLink({
    userPosition: args.point,
    satellite: args.connectivity.satellite,
    beamIndex: args.connectivity.connectedBeamIndex,
    snpPosition: args.connectivity.snp,
    time: args.now,
    simulationState: args.simulationState,
  });
  if (!beamEstimate) {
    return { debugInfo: null, rawDownlinkMbps: null, rawUplinkMbps: null, terminalLimited: false };
  }

  const profile = getLeoTerminalProfile(args.terminalType, args.terminalModelId ?? undefined);
  const activeUsers = args.beamLoad?.estimatedActiveUsers ?? 1;
  const rxScanLossDb = computeLeoTerminalScanLossDb(profile.rxScanLossModel, beamEstimate.userElevationDeg);
  const txScanLossDb = computeLeoTerminalScanLossDb(profile.txScanLossModel, beamEstimate.userElevationDeg);
  const rxGtAfterScanDbK = profile.rxGtDbK + rxScanLossDb;
  const txEirpAfterScanDbw = profile.txEirpDbw + txScanLossDb;

  const downlinkRf = computeDirectionalRfChainThroughput({
    eirpDbw: beamEstimate.beamLink.effectiveEirpDb,
    receiverGtDbK: rxGtAfterScanDbK,
    slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
    pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
    frequencyGHz: RF_KU_FREQ_GHZ,
    noiseBwHz: profile.dlReferenceBandwidthHz,
    throughputBwHz: profile.dlReferenceBandwidthHz,
  });
  const uplinkRf = computeUplinkRfChainThroughput({
    terminalEirpDbw: txEirpAfterScanDbw,
    slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
    pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
    noiseBwHz: profile.ulReferenceBandwidthHz,
    throughputBwHz: profile.ulReferenceBandwidthHz,
  });

  const downlinkSharing = applyBeamCapacitySharing(
    downlinkRf.rfThroughputMbps,
    activeUsers,
    profile.maxDlMbps,
    profile.dlUsableBeamBandwidthHz / profile.dlReferenceBandwidthHz,
  );
  const uplinkSharing = applyBeamCapacitySharing(
    uplinkRf.rfThroughputMbps,
    activeUsers,
    profile.maxUlMbps,
    profile.ulUsableBeamBandwidthHz / profile.ulReferenceBandwidthHz,
  );
  const rawDownlinkMbps = downlinkSharing.sharedThroughputMbps * beamEstimate.backhaulFactor;
  const rawUplinkMbps = uplinkSharing.sharedThroughputMbps * beamEstimate.backhaulFactor;

  const buildLeg = (legArgs: {
    direction: 'downlink' | 'uplink';
    label: string;
    rfChainThroughputMbps: number;
    effectiveEirpDb: number;
    receiverGtDbK: number;
    rawTerminalRfDb: number;
    terminalScanLossDb: number;
    fsplDb: number;
    cnDb: number;
    modcod: string | null;
    modcodTableId: string;
    modcodTableLabel: string;
    modcodTableSourceNote: string;
    referenceBandwidthHz: number;
    usableBandwidthHz: number;
    terminalCapMbps: number;
    sharedThroughputMbps: number;
    beamTotalThroughputMbps: number;
    finalUserMbps: number;
  }): LeoThroughputLeg => {
    const backhaulMbps = legArgs.sharedThroughputMbps * beamEstimate.backhaulFactor;
    const network: LeoNetworkLayerBreakdown = {
      peakRfMbps: Math.min(legArgs.beamTotalThroughputMbps, legArgs.terminalCapMbps),
      terminalCapMbps: legArgs.terminalCapMbps,
      activeUsers,
      beamSharingMbps: legArgs.sharedThroughputMbps,
      backhaulFactor: beamEstimate.backhaulFactor,
      backhaulMbps,
      handoverFactor: args.handoverFactor,
      handoverMbps: backhaulMbps * args.handoverFactor,
      smoothingAlpha: args.smoothingAlpha,
      finalUserMbps: legArgs.finalUserMbps,
      bottleneck: null,
    };
    const rf: LeoRfChainBreakdown = {
      effectiveEirpDb: legArgs.effectiveEirpDb,
      receiverGtDbK: legArgs.receiverGtDbK,
      rawTerminalRfDb: legArgs.rawTerminalRfDb,
      terminalScanLossDb: legArgs.terminalScanLossDb,
      scanLossDb: beamEstimate.beamLink.scanLossDb,
      weatherLossDb: beamEstimate.beamLink.weatherAttenuationDb,
      fsplDb: legArgs.fsplDb,
      cnDb: legArgs.cnDb,
      modcod: legArgs.modcod,
      modcodTableId: legArgs.modcodTableId,
      modcodTableLabel: legArgs.modcodTableLabel,
      modcodTableSourceNote: legArgs.modcodTableSourceNote,
      slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
      referenceBandwidthHz: legArgs.referenceBandwidthHz,
      usableBandwidthHz: legArgs.usableBandwidthHz,
      rfChainThroughputMbps: legArgs.rfChainThroughputMbps,
    };
    const leg: LeoThroughputLeg = { direction: legArgs.direction, label: legArgs.label, rf, network };
    leg.network.bottleneck = detectThroughputBottleneck(leg);
    return leg;
  };

  const downlink = buildLeg({
    direction: 'downlink',
    label: 'Downlink',
    rfChainThroughputMbps: downlinkRf.rfThroughputMbps,
    effectiveEirpDb: beamEstimate.beamLink.effectiveEirpDb,
    receiverGtDbK: rxGtAfterScanDbK,
    rawTerminalRfDb: profile.rxGtDbK,
    terminalScanLossDb: rxScanLossDb,
    fsplDb: downlinkRf.fsplDb,
    cnDb: downlinkRf.cnDb,
    modcod: downlinkRf.modcod?.name ?? null,
    modcodTableId: downlinkRf.modcodTable.id,
    modcodTableLabel: downlinkRf.modcodTable.label,
    modcodTableSourceNote: downlinkRf.modcodTable.sourceNote,
    referenceBandwidthHz: profile.dlReferenceBandwidthHz,
    usableBandwidthHz: profile.dlUsableBeamBandwidthHz,
    terminalCapMbps: profile.maxDlMbps,
    sharedThroughputMbps: downlinkSharing.sharedThroughputMbps,
    beamTotalThroughputMbps: downlinkSharing.beamTotalThroughputMbps,
    finalUserMbps: args.finalDownlinkMbps ?? rawDownlinkMbps,
  });
  const uplink = buildLeg({
    direction: 'uplink',
    label: 'Uplink',
    rfChainThroughputMbps: uplinkRf.rfThroughputMbps,
    effectiveEirpDb: txEirpAfterScanDbw,
    receiverGtDbK: RF_SATELLITE_GOT_DB_PER_K,
    rawTerminalRfDb: profile.txEirpDbw,
    terminalScanLossDb: txScanLossDb,
    fsplDb: uplinkRf.fsplDb,
    cnDb: uplinkRf.cnDb,
    modcod: uplinkRf.modcod?.name ?? null,
    modcodTableId: uplinkRf.modcodTable.id,
    modcodTableLabel: uplinkRf.modcodTable.label,
    modcodTableSourceNote: uplinkRf.modcodTable.sourceNote,
    referenceBandwidthHz: profile.ulReferenceBandwidthHz,
    usableBandwidthHz: profile.ulUsableBeamBandwidthHz,
    terminalCapMbps: profile.maxUlMbps,
    sharedThroughputMbps: uplinkSharing.sharedThroughputMbps,
    beamTotalThroughputMbps: uplinkSharing.beamTotalThroughputMbps,
    finalUserMbps: args.finalUplinkMbps ?? rawUplinkMbps,
  });

  const debugInfo: LeoThroughputResult = {
    satelliteId: args.connectivity.satellite.name || args.connectivity.satellite.id,
    selectedBeamIndex: args.connectivity.connectedBeamIndex,
    candidateBeamCount: args.connectivity.candidateBeamCount ?? 1,
    normalizedDistance: beamEstimate.beamLink.normalizedDistance,
    userElevationDeg: beamEstimate.userElevationDeg,
    snpElevationDeg: beamEstimate.snpElevationDeg,
    limitingElevationDeg: beamEstimate.limitingElevationDeg,
    terminal: {
      id: profile.id,
      label: profile.label,
      terminalFamily: profile.terminalFamily,
      vendor: profile.vendor,
      model: profile.model,
      description: profile.description,
      category: profile.category,
      antennaType: profile.antennaType,
      mobilityClass: profile.mobilityClass,
      maxDlMbps: profile.maxDlMbps,
      maxUlMbps: profile.maxUlMbps,
      rxGtDbK: profile.rxGtDbK,
      txEirpDbw: profile.txEirpDbw,
      rxScanLossModelLabel: profile.rxScanLossModel.label,
      txScanLossModelLabel: profile.txScanLossModel.label,
      dlReferenceBandwidthHz: profile.dlReferenceBandwidthHz,
      ulReferenceBandwidthHz: profile.ulReferenceBandwidthHz,
      dlUsableBeamBandwidthHz: profile.dlUsableBeamBandwidthHz,
      ulUsableBeamBandwidthHz: profile.ulUsableBeamBandwidthHz,
      sourceType: profile.sourceType,
      sourceLabel: profile.sourceLabel,
      sourceUrl: profile.sourceUrl,
      notes: profile.notes,
      assumptions: profile.assumptions,
      certificationStatus: profile.certificationStatus,
      supportedBands: profile.supportedBands,
    },
    downlink,
    uplink,
    mainBottleneck: chooseMainBottleneck(downlink, uplink),
  };

  return {
    debugInfo,
    rawDownlinkMbps,
    rawUplinkMbps,
    terminalLimited: downlinkSharing.wasTerminalLimited || uplinkSharing.wasTerminalLimited,
  };
}

function buildSingleSitePerformance(args: {
  point: LeoPoint | null;
  connectivity: ResolvedLeoConnectivity | null;
  beamLoad: BeamLoadResult | null;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  weatherType: WeatherType;
  simulationState: SimulationStateSnapshot;
  now: JulianDate;
  state: ActiveLeoRouteEvidenceState;
}): ActiveLeoPerformance | null {
  if (!args.point || !args.connectivity || !args.connectivity.snp) return null;
  const geometry = analyzeLeoConnectivity({
    userToSatelliteDistanceKm: args.connectivity.userLEODistance,
    satelliteToGatewayDistanceKm: args.connectivity.snpLEODistance || 0,
    userToSatelliteElevationDeg: args.connectivity.userLEOElevation,
    gatewayToSatelliteElevationDeg: args.connectivity.snpLEOElevation || 0,
  });
  const oneWayDistanceKm = args.connectivity.userLEODistance + (args.connectivity.snpLEODistance || 0);
  const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

  if (args.simulationState.coveragePolicy.type === 'DB_THRESHOLD' && args.connectivity.connectedBeamIndex != null) {
    const preDebug = buildEndpointDebug({
      point: args.point,
      connectivity: args.connectivity,
      terminalType: args.terminalType,
      terminalModelId: args.terminalModelId,
      beamLoad: args.beamLoad,
      simulationState: args.simulationState,
      now: args.now,
      smoothingAlpha: SMOOTHING_ALPHA,
      handoverFactor: 1,
    });

    if (preDebug.debugInfo && preDebug.rawDownlinkMbps != null && preDebug.rawUplinkMbps != null) {
      const { state: nextHandoverState, degradationFactor } = updateHandoverState(
        args.state.handoverState,
        args.connectivity.satellite.id,
      );
      args.state.handoverState = nextHandoverState;
      const downlinkHandoverMbps = applyHandoverDegradation(preDebug.rawDownlinkMbps, degradationFactor);
      const uplinkHandoverMbps = applyHandoverDegradation(preDebug.rawUplinkMbps, degradationFactor);
      const finalDlMbps = smoothThroughputMbps(downlinkHandoverMbps, args.state.smoothedDownlinkThroughputMbps);
      const finalUlMbps = smoothThroughputMbps(uplinkHandoverMbps, args.state.smoothedUplinkThroughputMbps);
      args.state.smoothedDownlinkThroughputMbps = finalDlMbps;
      args.state.smoothedUplinkThroughputMbps = finalUlMbps;

      const debug = buildEndpointDebug({
        point: args.point,
        connectivity: args.connectivity,
        terminalType: args.terminalType,
        terminalModelId: args.terminalModelId,
        beamLoad: args.beamLoad,
        simulationState: args.simulationState,
        now: args.now,
        finalDownlinkMbps: finalDlMbps,
        finalUplinkMbps: finalUlMbps,
        smoothingAlpha: SMOOTHING_ALPHA,
        handoverFactor: degradationFactor,
      });

      return {
        ...calculateBeamAwareSummary({
          deliveredDownlinkMbps: finalDlMbps,
          limitingElevation: debug.debugInfo?.limitingElevationDeg ?? args.connectivity.userLEOElevation,
          normalizedDistance: debug.debugInfo?.normalizedDistance ?? 1,
          estimatedRttMs: geometry.rttTotalMs,
          fallbackPropagationRttMs,
          terminalType: args.terminalType,
          terminalModelId: args.terminalModelId,
          weatherType: args.weatherType,
        }),
        downlinkGbps: finalDlMbps / 1000,
        uplinkGbps: finalUlMbps / 1000,
        throughput: debug.debugInfo ?? undefined,
        debugInfo: debug.debugInfo ?? undefined,
        wasTerminalLimited: preDebug.terminalLimited,
      };
    }
  }

  args.state.smoothedDownlinkThroughputMbps = null;
  args.state.smoothedUplinkThroughputMbps = null;
  return calculateApproximatePerformance({
    connectivity: args.connectivity,
    terminalType: args.terminalType,
    terminalModelId: args.terminalModelId,
    weatherType: args.weatherType,
    estimatedRttMs: geometry.rttTotalMs,
  });
}

function buildEmptyEvidence(input: BuildActiveLeoRouteEvidenceInput, inputSignature: string, reason: string): ActiveLeoRouteEvidence {
  return {
    topology: input.topology,
    inputSignature,
    available: false,
    pending: true,
    degraded: false,
    serviceStatus: null,
    failureReason: null,
    degradationReason: reason,
    routeResult: null,
    metrics: null,
    leoPerformance: null,
    resolvedConnectivityA: null,
    resolvedConnectivityB: null,
    servingSatelliteA: input.servingSatelliteA,
    servingSatelliteB: input.servingSatelliteB,
    selectedSnpA: input.selectedSnpA,
    selectedSnpB: input.selectedSnpB,
    bottleneck: null,
    capacityLimitation: null,
    rfLimitation: null,
    routeParticipants: { satellites: [], snps: [] },
    debugEvidence: {},
  };
}

export function buildActiveLeoRouteEvidence(
  input: BuildActiveLeoRouteEvidenceInput,
  state: ActiveLeoRouteEvidenceState,
): ActiveLeoRouteEvidence {
  const inputSignature = buildInputSignature(input);
  if (!input.activePoint) {
    resetActiveLeoRouteEvidenceState(state);
    return buildEmptyEvidence(input, inputSignature, 'Select a location to calculate LEO service.');
  }

  const selectedSnpA = input.selectedSnpA && !input.failedSnps.has(input.selectedSnpA.name) ? input.selectedSnpA : null;
  const selectedSnpB = input.selectedSnpB && !input.failedSnps.has(input.selectedSnpB.name) ? input.selectedSnpB : null;
  const connectivityA = buildResolvedConnectivity({
    point: input.activePoint,
    satellite: input.servingSatelliteA,
    snp: selectedSnpA,
    simulationState: input.simulationStateA,
    now: input.now,
  });
  const leoPerformance = buildSingleSitePerformance({
    point: input.activePoint,
    connectivity: connectivityA,
    beamLoad: input.beamLoadA,
    terminalType: input.terminalTypeA,
    terminalModelId: input.terminalModelIdA,
    weatherType: input.weatherTypeA,
    simulationState: input.simulationStateA,
    now: input.now,
    state,
  });
  const rfAvailableA = input.servingSatelliteA
    ? hasRFConnectivity(input.activePoint, input.servingSatelliteA, input.now, input.simulationStateA)
    : false;

  if (input.topology === 'SINGLE_SITE') {
    const downloadMbps = finitePositive(leoPerformance?.downlinkGbps != null ? leoPerformance.downlinkGbps * 1000 : null);
    const uploadMbps = finitePositive(leoPerformance?.uplinkGbps != null ? leoPerformance.uplinkGbps * 1000 : null);
    const rttMs = finitePositive(leoPerformance?.rtt);
    const regulatoryBlocked = input.regulatoryResultA?.status === 'BLOCKED';
    const serviceStatus = regulatoryBlocked || !input.servingSatelliteA || !rfAvailableA || !selectedSnpA
      ? 'BLOCKED'
      : input.regulatoryResultA?.status === 'RESTRICTED' || input.beamLoadA?.capacityStatus === 'DEGRADED' || input.beamLoadA?.capacityStatus === 'SATURATED'
        ? 'DEGRADED'
        : 'ALLOWED';
    const metricsComplete = downloadMbps != null && uploadMbps != null && rttMs != null;
    const pending = serviceStatus !== 'BLOCKED' && !metricsComplete;
    const bottleneck = leoPerformance?.debugInfo?.mainBottleneck.label && leoPerformance.debugInfo.mainBottleneck.label !== 'None'
      ? leoPerformance.debugInfo.mainBottleneck.label
      : null;
    const degradationReason = serviceStatus === 'BLOCKED'
      ? !input.servingSatelliteA
        ? 'No LEO satellite available.'
        : !rfAvailableA
          ? 'RF unavailable at Site A.'
          : !selectedSnpA
            ? 'No SNP reachable at Site A.'
            : regulatoryBlocked
              ? 'Regulatory blocked at Site A.'
              : 'LEO service unavailable.'
      : serviceStatus === 'DEGRADED'
        ? input.beamLoadA?.capacityStatus === 'SATURATED'
          ? 'Capacity saturated at Site A.'
          : input.beamLoadA?.capacityStatus === 'DEGRADED'
            ? 'Capacity degraded at Site A.'
            : 'LEO service degraded.'
        : 'LEO route available.';

    return {
      topology: input.topology,
      inputSignature,
      available: serviceStatus !== 'BLOCKED' && metricsComplete,
      pending,
      degraded: serviceStatus === 'DEGRADED',
      serviceStatus,
      failureReason: null,
      degradationReason,
      routeResult: null,
      metrics: metricsComplete
        ? {
            rtt: rttMs ?? null,
            downlinkGbps: downloadMbps != null ? downloadMbps / 1000 : null,
            uplinkGbps: uploadMbps != null ? uploadMbps / 1000 : null,
          }
        : null,
      leoPerformance,
      resolvedConnectivityA: connectivityA,
      resolvedConnectivityB: null,
      servingSatelliteA: input.servingSatelliteA,
      servingSatelliteB: null,
      selectedSnpA,
      selectedSnpB: null,
      downloadMbps,
      uploadMbps,
      rttMs,
      bottleneck,
      capacityLimitation: input.beamLoadA?.capacityStatus && input.beamLoadA.capacityStatus !== 'AVAILABLE'
        ? input.beamLoadA.capacityStatus
        : null,
      rfLimitation: rfAvailableA ? null : 'RF_UNAVAILABLE_A',
      routeParticipants: {
        satellites: input.servingSatelliteA ? [input.servingSatelliteA] : [],
        snps: selectedSnpA ? [selectedSnpA] : [],
      },
      debugEvidence: {
        siteA: leoPerformance?.debugInfo ?? null,
      },
    };
  }

  if (!input.pointB) {
    return {
      ...buildEmptyEvidence(input, inputSignature, 'Select two locations to calculate LEO site-to-site service.'),
      leoPerformance,
      resolvedConnectivityA: connectivityA,
      selectedSnpA,
    };
  }

  const connectivityB = buildResolvedConnectivity({
    point: input.pointB,
    satellite: input.servingSatelliteB,
    snp: selectedSnpB,
    simulationState: input.simulationStateB,
    now: input.now,
  });
  const rfAvailableB = input.servingSatelliteB
    ? hasRFConnectivity(input.pointB, input.servingSatelliteB, input.now, input.simulationStateB)
    : false;

  const siteADlMbps = input.servingSatelliteA && rfAvailableA && leoPerformance?.downlinkGbps != null
    ? leoPerformance.downlinkGbps * 1000
    : null;
  const siteAUlMbps = input.servingSatelliteA && rfAvailableA && leoPerformance?.uplinkGbps != null
    ? leoPerformance.uplinkGbps * 1000
    : null;
  const beamSharedDlMbps = leoPerformance?.debugInfo?.downlink.network.beamSharingMbps ?? (leoPerformance?.downlinkGbps ?? 0) * 1000;
  const beamSharedUlMbps = leoPerformance?.debugInfo?.uplink.network.beamSharingMbps ?? (leoPerformance?.uplinkGbps ?? 0) * 1000;
  const profileB = getLeoTerminalProfile(input.terminalTypeB, input.terminalModelIdB ?? undefined);
  const siteBDlMbps = input.servingSatelliteB && rfAvailableB && leoPerformance != null
    ? Math.min(beamSharedDlMbps, profileB.maxDlMbps)
    : null;
  const siteBUlMbps = input.servingSatelliteB && rfAvailableB && leoPerformance != null
    ? Math.min(beamSharedUlMbps, profileB.maxUlMbps)
    : null;
  const debugB = input.pointB && connectivityB
    ? buildEndpointDebug({
        point: input.pointB,
        connectivity: connectivityB,
        terminalType: input.terminalTypeB,
        terminalModelId: input.terminalModelIdB,
        beamLoad: input.beamLoadB,
        simulationState: input.simulationStateB,
        now: input.now,
        finalDownlinkMbps: siteBDlMbps,
        finalUplinkMbps: siteBUlMbps,
        smoothingAlpha: 0,
        handoverFactor: 1,
      }).debugInfo
    : null;

  const routeResult = computeLeoSiteToSiteResult({
    endpointA: { lat: input.activePoint.lat, lng: input.activePoint.lng },
    endpointB: { lat: input.pointB.lat, lng: input.pointB.lng },
    servingSatelliteA: input.servingSatelliteA,
    servingSatelliteB: input.servingSatelliteB,
    rfAvailableA,
    rfAvailableB,
    selectedSnpA,
    selectedSnpB,
    regulatoryResultA: input.regulatoryResultA,
    regulatoryResultB: input.regulatoryResultB,
    beamLoadA: input.beamLoadA,
    beamLoadB: input.beamLoadB,
    userToSatDistanceAKm: connectivityA?.userLEODistance ?? null,
    satToSnpDistanceAKm: connectivityA?.snpLEODistance ?? null,
    userToSatDistanceBKm: connectivityB?.userLEODistance ?? null,
    satToSnpDistanceBKm: connectivityB?.snpLEODistance ?? null,
    elevationADeg: connectivityA?.userLEOElevation ?? null,
    elevationBDeg: connectivityB?.userLEOElevation ?? null,
    dlThroughputAMbps: siteADlMbps,
    ulThroughputAMbps: siteAUlMbps,
    dlThroughputBMbps: siteBDlMbps,
    ulThroughputBMbps: siteBUlMbps,
    debugSiteA: leoPerformance?.debugInfo ?? undefined,
    debugSiteB: debugB ?? undefined,
  });

  const throughputAtoB = finitePositive(routeResult.finalThroughputAtoBMbps);
  const throughputBtoA = finitePositive(routeResult.finalThroughputBtoAMbps);
  const rttMs = finitePositive(routeResult.rttMs);
  const metricsComplete = routeResult.serviceAvailable && (throughputAtoB != null || throughputBtoA != null) && rttMs != null;
  const bottleneck = routeResult.debugSiteA?.mainBottleneck.label && routeResult.debugSiteA.mainBottleneck.label !== 'None'
    ? routeResult.debugSiteA.mainBottleneck.label
    : routeResult.debugSiteB?.mainBottleneck.label && routeResult.debugSiteB.mainBottleneck.label !== 'None'
      ? routeResult.debugSiteB.mainBottleneck.label
      : null;
  const degradationReason = routeResult.failureReason
    ? formatLeoSiteToSiteFailureReason(routeResult.failureReason)
    : 'LEO site-to-site route available.';

  return {
    topology: input.topology,
    inputSignature,
    available: metricsComplete,
    pending: routeResult.serviceAvailable && !metricsComplete,
    degraded: routeResult.serviceStatus === 'DEGRADED',
    serviceStatus: routeResult.serviceStatus,
    failureReason: routeResult.failureReason,
    degradationReason,
    routeResult,
    metrics: metricsComplete
      ? {
          rtt: rttMs ?? null,
          downlinkGbps: throughputAtoB != null ? throughputAtoB / 1000 : null,
          uplinkGbps: throughputBtoA != null ? throughputBtoA / 1000 : null,
        }
      : null,
    leoPerformance,
    resolvedConnectivityA: connectivityA,
    resolvedConnectivityB: connectivityB,
    servingSatelliteA: routeResult.servingSatelliteA,
    servingSatelliteB: routeResult.servingSatelliteB,
    selectedSnpA: routeResult.selectedSnpA,
    selectedSnpB: routeResult.selectedSnpB,
    throughputAtoBMbps: throughputAtoB,
    throughputBtoAMbps: throughputBtoA,
    downloadMbps: throughputAtoB,
    uploadMbps: throughputBtoA,
    rttMs,
    bottleneck,
    capacityLimitation: routeResult.failureReason?.startsWith('CAPACITY') ? routeResult.failureReason : null,
    rfLimitation: routeResult.failureReason?.startsWith('RF_') ? routeResult.failureReason : null,
    routeParticipants: {
      satellites: [routeResult.servingSatelliteA, routeResult.servingSatelliteB].filter((sat): sat is SatelliteData => Boolean(sat)),
      snps: [routeResult.selectedSnpA, routeResult.selectedSnpB].filter((snp): snp is SNPData => Boolean(snp)),
    },
    debugEvidence: {
      siteA: routeResult.debugSiteA ?? null,
      siteB: routeResult.debugSiteB ?? null,
    },
  };
}
