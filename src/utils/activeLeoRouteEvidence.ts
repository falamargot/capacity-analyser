import { JulianDate } from 'cesium';
import type { SNPData } from '../components/globe/GlobeConfig';
import { WEATHER_PROFILES, getWeatherFactor, type TerminalType, type WeatherType } from '../components/capacity';
import { getLeoTerminalProfile, computeLeoTerminalScanLossDb } from '../config/leoTerminals';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { MobileLinkMetrics } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { SimulationStateSnapshot } from '../types/simulation';
import type { BeamLoadResult } from './capacityLayer';
import type { LeoServingAssignment } from '../data/leoGroundSegment';
import { calculateElevationAngle, compute3DDistanceKm, SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { analyzeLeoConnectivity, type LeoConnectivityResult } from './leoConnectivityModel';
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
import { chooseMainBottleneck, detectThroughputBottleneck } from './leoBottleneck';
import { computeFeederBudget, type FeederBudgetResult } from './leoFeederLinkBudget';
import { WEATHER_ATTENUATION_UL_DB } from './realisticSimulation';
import { buildLeoFeederLink } from './connectivityRules';
import { deriveLeoServiceDecision } from './leoServiceDecision';
import {
  computeLeoSiteToSiteResult,
  estimateSnpToPopFiberOneWayMs,
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
  /**
   * SINGLE_SITE only — the full one-way/RTT propagation+overhead breakdown
   * behind leoPerformance.rtt (LEO-2: this is the ONE place analyzeLeoConnectivity
   * is called for single-site LEO; consumers must read this instead of running
   * their own copy, or the two can silently diverge). Null for SITE_TO_SITE,
   * which has its own equivalent breakdown via routeResult's per-site debug info.
   */
  geometry: LeoConnectivityResult | null;
  resolvedConnectivityA: ResolvedLeoConnectivity | null;
  resolvedConnectivityB: ResolvedLeoConnectivity | null;
  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;
  /** L-O1: resolver assignments as received (identity for downstream consumers). */
  servingAssignmentA: LeoServingAssignment | null;
  servingAssignmentB: LeoServingAssignment | null;
  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;
  throughputAtoBMbps?: number;
  throughputBtoAMbps?: number;
  downloadMbps?: number;
  uploadMbps?: number;
  /**
   * One-way user latency (GEO-2: matches GEO's rttMs in the same commercial
   * cross-technology comparison — NOT a round trip despite the field name,
   * which is kept for the shared MobileLinkMetrics/commercial-option contract).
   * The only consumer is commercialViewModel.ts. For a genuine LEO round trip,
   * use leoPerformance.rtt (SINGLE_SITE) or routeResult.rttMs (SITE_TO_SITE).
   */
  rttMs?: number;
  bottleneck: string | null;
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
  /**
   * L-O1: the resolver's canonical (satellite, beam, feeder) tuple per endpoint.
   * Optional during the transition — when present it MUST agree with
   * servingSatelliteX/selectedSnpX (DEV canary enforces); Item 2 (Ka feeder
   * budget) reads the feeder geometry from here.
   */
  servingAssignmentA?: LeoServingAssignment | null;
  servingAssignmentB?: LeoServingAssignment | null;
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
  /**
   * Per-site COMM weather selector. MUST stay in sync with the matching
   * simulationState's weatherCondition (L-Mo9): App enforces this — Site A via
   * handleWeatherTypeChange ↔ SimulationContext, Site B by deriving
   * simulationStateB.weatherCondition from weatherTypeB. weatherType drives the
   * approximate-model factor and labels; weatherCondition drives beam-model RF.
   * A DEV canary in the builder logs any divergence.
   */
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
  // beamHealthByIndex is a Map (JSON.stringify would yield {}), so serialize
  // its entries explicitly — beam-health changes must invalidate the signature.
  return JSON.stringify({
    policy: state.coveragePolicy,
    weather: state.weatherCondition,
    beams: Array.from(state.beamHealthByIndex.entries()).sort((a, b) => a[0] - b[0]),
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

  // L-M2: FSPL is computed against the ACTUAL user↔satellite slant range, not the
  // beam-index cross-section range (which tops out ~1300 km while a user at the
  // 40° mask sits ~1700 km out — ≈2.3 dB of FSPL). The beam-index range remains
  // in use inside estimateCurrentLeoBeamLink for beam-level EIRP shaping only.
  const userSlantRangeKm = args.connectivity.userLEODistance > 0
    ? args.connectivity.userLEODistance
    : beamEstimate.debugInfo.slantRangeKm;

  const downlinkRf = computeDirectionalRfChainThroughput({
    eirpDbw: beamEstimate.beamLink.effectiveEirpDb,
    receiverGtDbK: rxGtAfterScanDbK,
    slantRangeKm: userSlantRangeKm,
    pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
    frequencyGHz: RF_KU_FREQ_GHZ,
    noiseBwHz: profile.dlReferenceBandwidthHz,
    throughputBwHz: profile.dlReferenceBandwidthHz,
  });
  // L-Mo7: the uplink path adjustment is the antenna-pattern term plus the
  // 14.25 GHz UL weather table — not the downlink composite (which bakes in
  // the 11.5 GHz attenuation). The satellite RECEIVE pattern is assumed
  // identical to the transmit cos^8 pattern (documented approximation; a
  // separate receive-pattern model would be a duplicated geometry path).
  const ulWeatherLossDb = WEATHER_ATTENUATION_UL_DB[args.simulationState.weatherCondition];
  const uplinkRf = computeUplinkRfChainThroughput({
    terminalEirpDbw: txEirpAfterScanDbw,
    slantRangeKm: userSlantRangeKm,
    pathAdjustmentDb: beamEstimate.beamLink.patternOnlyDb + ulWeatherLossDb,
    noiseBwHz: profile.ulReferenceBandwidthHz,
    throughputBwHz: profile.ulReferenceBandwidthHz,
  });

  // L-O2: Ka feeder link budget from the LIVE feeder geometry (per-tick SNP
  // elevation/slant range — the resolver assignment's feeder identity refreshes
  // only every 15 s). User-DOWNLINK traffic rides the feeder UP direction;
  // user-UPLINK traffic rides the feeder DOWN direction. Gateway-site weather
  // is CLEAR in v1 (no per-SNP weather state yet — see computeFeederBudget).
  const feederBudget: FeederBudgetResult | null = args.connectivity.snpLEOElevation != null
    ? computeFeederBudget(
        buildLeoFeederLink(args.connectivity.snp, args.connectivity.satellite, args.connectivity.snpLEOElevation),
        'CLEAR',
      )
    : null;

  const downlinkSharing = applyBeamCapacitySharing(
    downlinkRf.rfThroughputMbps,
    activeUsers,
    profile.maxDlMbps,
    {
      direction: 'downlink',
      referenceBandwidthHz: profile.dlReferenceBandwidthHz,
      usableBeamBandwidthHz: profile.dlUsableBeamBandwidthHz,
      feederCapacityMbps: feederBudget?.up.capacityMbps,
    },
  );
  const uplinkSharing = applyBeamCapacitySharing(
    uplinkRf.rfThroughputMbps,
    activeUsers,
    profile.maxUlMbps,
    {
      direction: 'uplink',
      referenceBandwidthHz: profile.ulReferenceBandwidthHz,
      usableBeamBandwidthHz: profile.ulUsableBeamBandwidthHz,
      feederCapacityMbps: feederBudget?.down.capacityMbps,
    },
  );
  // The former × backhaulFactor scaling is gone (L-O2): the feeder's capacity
  // impact is already inside the sharing result via the beam-pool bound.
  const rawDownlinkMbps = downlinkSharing.sharedThroughputMbps;
  const rawUplinkMbps = uplinkSharing.sharedThroughputMbps;

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
    weatherLossDb: number;
    referenceBandwidthHz: number;
    usableBandwidthHz: number;
    terminalCapMbps: number;
    sharedThroughputMbps: number;
    beamTotalThroughputMbps: number;
    feederCapacityMbps: number | null;
    feederMarginDb: number | null;
    feederLimited: boolean;
    finalUserMbps: number;
  }): LeoThroughputLeg => {
    const network: LeoNetworkLayerBreakdown = {
      peakRfMbps: Math.min(legArgs.beamTotalThroughputMbps, legArgs.terminalCapMbps),
      terminalCapMbps: legArgs.terminalCapMbps,
      activeUsers,
      beamSharingMbps: legArgs.sharedThroughputMbps,
      feederCapacityMbps: legArgs.feederCapacityMbps,
      // LEO-3: per-direction margin, not the shared weakestMarginDb — the
      // gateway-up (feeds downlink) and satellite-down (feeds uplink) paths
      // are physically different budgets that can legitimately differ, and
      // showing the same worst-of-both number on both drawer tiles obscured
      // which direction was actually closer to the Ka feeder limit.
      feederMarginDb: legArgs.feederMarginDb,
      feederLimited: legArgs.feederLimited,
      handoverFactor: args.handoverFactor,
      handoverMbps: legArgs.sharedThroughputMbps * args.handoverFactor,
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
      weatherLossDb: legArgs.weatherLossDb,
      fsplDb: legArgs.fsplDb,
      cnDb: legArgs.cnDb,
      modcod: legArgs.modcod,
      modcodTableId: legArgs.modcodTableId,
      modcodTableLabel: legArgs.modcodTableLabel,
      modcodTableSourceNote: legArgs.modcodTableSourceNote,
      // Displayed range matches the FSPL actually used by this leg (L-M2).
      slantRangeKm: userSlantRangeKm,
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
    weatherLossDb: beamEstimate.beamLink.weatherAttenuationDb,
    referenceBandwidthHz: profile.dlReferenceBandwidthHz,
    usableBandwidthHz: profile.dlUsableBeamBandwidthHz,
    terminalCapMbps: profile.maxDlMbps,
    sharedThroughputMbps: downlinkSharing.sharedThroughputMbps,
    beamTotalThroughputMbps: downlinkSharing.beamTotalThroughputMbps,
    feederCapacityMbps: feederBudget?.up.capacityMbps ?? null,
    feederMarginDb: feederBudget?.up.marginDb ?? null,
    feederLimited: downlinkSharing.wasFeederLimited,
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
    weatherLossDb: ulWeatherLossDb,
    referenceBandwidthHz: profile.ulReferenceBandwidthHz,
    usableBandwidthHz: profile.ulUsableBeamBandwidthHz,
    terminalCapMbps: profile.maxUlMbps,
    sharedThroughputMbps: uplinkSharing.sharedThroughputMbps,
    beamTotalThroughputMbps: uplinkSharing.beamTotalThroughputMbps,
    feederCapacityMbps: feederBudget?.down.capacityMbps ?? null,
    feederMarginDb: feederBudget?.down.marginDb ?? null,
    feederLimited: uplinkSharing.wasFeederLimited,
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
}): { performance: ActiveLeoPerformance; geometry: LeoConnectivityResult } | null {
  if (!args.point || !args.connectivity || !args.connectivity.snp) return null;
  const geometry = analyzeLeoConnectivity({
    userToSatelliteDistanceKm: args.connectivity.userLEODistance,
    satelliteToGatewayDistanceKm: args.connectivity.snpLEODistance || 0,
    userToSatelliteElevationDeg: args.connectivity.userLEOElevation,
    gatewayToSatelliteElevationDeg: args.connectivity.snpLEOElevation || 0,
    // L-Mo3: per-SNP fiber leg from the shared PoP catalog instead of a global constant.
    snpToPopFiberDelayMs: estimateSnpToPopFiberOneWayMs(args.connectivity.snp),
  });
  const oneWayDistanceKm = args.connectivity.userLEODistance + (args.connectivity.snpLEODistance || 0);
  const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

  if (args.simulationState.coveragePolicy.type === 'DB_THRESHOLD' && args.connectivity.connectedBeamIndex != null) {
    // Single geometry + RF-chain computation. The second call in the original code
    // (R3 profiling, hot-path 1) was identical to this one — only the three network
    // layer fields that depend on smoothed throughput differed. Those are patched
    // in-place below instead of re-running the full comb-geometry + RF chain.
    const endpointDebug = buildEndpointDebug({
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

    if (endpointDebug.debugInfo && endpointDebug.rawDownlinkMbps != null && endpointDebug.rawUplinkMbps != null) {
      const { state: nextHandoverState, degradationFactor } = updateHandoverState(
        args.state.handoverState,
        args.connectivity.satellite.id,
      );
      args.state.handoverState = nextHandoverState;
      const downlinkHandoverMbps = applyHandoverDegradation(endpointDebug.rawDownlinkMbps, degradationFactor);
      const uplinkHandoverMbps = applyHandoverDegradation(endpointDebug.rawUplinkMbps, degradationFactor);
      const finalDlMbps = smoothThroughputMbps(downlinkHandoverMbps, args.state.smoothedDownlinkThroughputMbps);
      const finalUlMbps = smoothThroughputMbps(uplinkHandoverMbps, args.state.smoothedUplinkThroughputMbps);
      args.state.smoothedDownlinkThroughputMbps = finalDlMbps;
      args.state.smoothedUplinkThroughputMbps = finalUlMbps;

      // Patch the three network-layer fields that differ from the initial computation.
      // All RF chain values (beamEstimate, RF link budgets, sharing ratios) are
      // geometry-derived and unchanged; only the post-smoothing delivery fields differ.
      const dl = endpointDebug.debugInfo.downlink;
      dl.network.handoverFactor = degradationFactor;
      dl.network.handoverMbps = dl.network.beamSharingMbps * degradationFactor;
      dl.network.finalUserMbps = finalDlMbps;
      dl.network.bottleneck = detectThroughputBottleneck(dl);
      const ul = endpointDebug.debugInfo.uplink;
      ul.network.handoverFactor = degradationFactor;
      ul.network.handoverMbps = ul.network.beamSharingMbps * degradationFactor;
      ul.network.finalUserMbps = finalUlMbps;
      ul.network.bottleneck = detectThroughputBottleneck(ul);
      endpointDebug.debugInfo.mainBottleneck = chooseMainBottleneck(dl, ul);

      return {
        performance: {
          ...calculateBeamAwareSummary({
            deliveredDownlinkMbps: finalDlMbps,
            limitingElevation: endpointDebug.debugInfo.limitingElevationDeg ?? args.connectivity.userLEOElevation,
            normalizedDistance: endpointDebug.debugInfo.normalizedDistance ?? 1,
            estimatedRttMs: geometry.rttTotalMs,
            fallbackPropagationRttMs,
            terminalType: args.terminalType,
            terminalModelId: args.terminalModelId,
            weatherType: args.weatherType,
          }),
          downlinkGbps: finalDlMbps / 1000,
          uplinkGbps: finalUlMbps / 1000,
          throughput: endpointDebug.debugInfo,
          debugInfo: endpointDebug.debugInfo,
          wasTerminalLimited: endpointDebug.terminalLimited,
        },
        geometry,
      };
    }
  }

  args.state.smoothedDownlinkThroughputMbps = null;
  args.state.smoothedUplinkThroughputMbps = null;
  return {
    performance: calculateApproximatePerformance({
      connectivity: args.connectivity,
      terminalType: args.terminalType,
      terminalModelId: args.terminalModelId,
      weatherType: args.weatherType,
      estimatedRttMs: geometry.rttTotalMs,
    }),
    geometry,
  };
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
    geometry: null,
    resolvedConnectivityA: null,
    resolvedConnectivityB: null,
    servingSatelliteA: input.servingSatelliteA,
    servingSatelliteB: input.servingSatelliteB,
    servingAssignmentA: input.servingAssignmentA ?? null,
    servingAssignmentB: input.servingAssignmentB ?? null,
    selectedSnpA: input.selectedSnpA,
    selectedSnpB: input.selectedSnpB,
    bottleneck: null,
    rfLimitation: null,
    routeParticipants: { satellites: [], snps: [] },
    debugEvidence: {},
  };
}

// ---------------------------------------------------------------------------
// DEV-ONLY profiling accumulator
// Entirely tree-shaken by Vite in production builds (import.meta.env.DEV = false).
// Access from DevTools: window.__leoEvidenceProfile
// ---------------------------------------------------------------------------
interface LeoEvidenceProfile {
  calls: number;
  lastMs: Record<string, number>;
  minMs: Record<string, number>;
  maxMs: Record<string, number>;
  sumMs: Record<string, number>;
  lastLoggedAt: number;
}
const _devProfile: LeoEvidenceProfile = import.meta.env.DEV
  ? { calls: 0, lastMs: {}, minMs: {}, maxMs: {}, sumMs: {}, lastLoggedAt: 0 }
  : (null as unknown as LeoEvidenceProfile);
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as Record<string, unknown>).__leoEvidenceProfile = _devProfile;
}
function _devMark(label: string, tStart: number): number {
  const now = performance.now();
  const dt = now - tStart;
  const p = _devProfile;
  p.lastMs[label] = dt;
  p.sumMs[label] = (p.sumMs[label] ?? 0) + dt;
  if (p.minMs[label] == null || dt < p.minMs[label]) p.minMs[label] = dt;
  if (p.maxMs[label] == null || dt > p.maxMs[label]) p.maxMs[label] = dt;
  return now;
}
function _devLogSummary(): void {
  const p = _devProfile;
  const keys = Object.keys(p.sumMs);
  const lines = keys.map((k) => {
    const avg = (p.sumMs[k] / p.calls).toFixed(3);
    const min = p.minMs[k].toFixed(3);
    const max = p.maxMs[k].toFixed(3);
    const last = p.lastMs[k].toFixed(3);
    return `  ${k.padEnd(22)} last=${last}ms  avg=${avg}ms  min=${min}ms  max=${max}ms`;
  });
  console.debug(
    `[leoEvidence] profile after ${p.calls} calls:\n${lines.join('\n')}\n` +
    `  (total avg = ${(p.sumMs['⑦ total'] / p.calls).toFixed(3)}ms)`,
  );
}

export function buildActiveLeoRouteEvidence(
  input: BuildActiveLeoRouteEvidenceInput,
  state: ActiveLeoRouteEvidenceState,
): ActiveLeoRouteEvidence {
  const _t0 = import.meta.env.DEV ? performance.now() : 0;

  const inputSignature = buildInputSignature(input);

  const _tSig = import.meta.env.DEV ? _devMark('① signature', _t0) : 0;
  if (!input.activePoint) {
    if (import.meta.env.DEV) {
      _devProfile.calls += 1;
      _devMark('⑦ total', _t0);
      if (performance.now() - _devProfile.lastLoggedAt > 30_000) {
        _devProfile.lastLoggedAt = performance.now();
        _devLogSummary();
      }
    }
    resetActiveLeoRouteEvidenceState(state);
    return buildEmptyEvidence(input, inputSignature, 'Select a location to calculate LEO service.');
  }

  if (import.meta.env.DEV) {
    // L-O1 canary: the legacy satellite/SNP props and the resolver assignment
    // must describe the same objects while both exist.
    const assignA = input.servingAssignmentA;
    if (assignA && input.servingSatelliteA && assignA.satelliteId !== input.servingSatelliteA.id) {
      console.warn(`[leoEvidence] assignment drift at Site A: satellite prop=${input.servingSatelliteA.id} vs assignment=${assignA.satelliteId}`);
    }
    if (assignA && input.selectedSnpA && assignA.feeder && assignA.feeder.snp.name !== input.selectedSnpA.name) {
      console.warn(`[leoEvidence] assignment drift at Site A: SNP prop=${input.selectedSnpA.name} vs assignment=${assignA.feeder.snp.name}`);
    }
    const assignB = input.servingAssignmentB;
    if (assignB && input.servingSatelliteB && assignB.satelliteId !== input.servingSatelliteB.id) {
      console.warn(`[leoEvidence] assignment drift at Site B: satellite prop=${input.servingSatelliteB.id} vs assignment=${assignB.satelliteId}`);
    }
    // L-Mo9 canary: the per-site weather selector and the per-site simulation
    // snapshot must agree — App keeps them in sync; log loudly if they drift.
    const expectA = WEATHER_PROFILES[input.weatherTypeA]?.condition;
    const expectB = WEATHER_PROFILES[input.weatherTypeB]?.condition;
    if (expectA && expectA !== input.simulationStateA.weatherCondition) {
      console.warn(`[leoEvidence] weather drift at Site A: weatherType=${input.weatherTypeA} (${expectA}) vs simulationState=${input.simulationStateA.weatherCondition}`);
    }
    if (input.topology === 'SITE_TO_SITE' && expectB && expectB !== input.simulationStateB.weatherCondition) {
      console.warn(`[leoEvidence] weather drift at Site B: weatherType=${input.weatherTypeB} (${expectB}) vs simulationState=${input.simulationStateB.weatherCondition}`);
    }
  }

  const selectedSnpA = input.selectedSnpA && !input.failedSnps.has(input.selectedSnpA.name) ? input.selectedSnpA : null;
  const selectedSnpB = input.selectedSnpB && !input.failedSnps.has(input.selectedSnpB.name) ? input.selectedSnpB : null;
  const _tPreConn = import.meta.env.DEV ? performance.now() : 0;
  const connectivityA = buildResolvedConnectivity({
    point: input.activePoint,
    satellite: input.servingSatelliteA,
    snp: selectedSnpA,
    simulationState: input.simulationStateA,
    now: input.now,
  });
  const _tPrePerf = import.meta.env.DEV ? _devMark('② connA (beam find)', _tPreConn) : 0;
  const singleSitePerformance = buildSingleSitePerformance({
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
  const leoPerformance = singleSitePerformance?.performance ?? null;
  const leoGeometry = singleSitePerformance?.geometry ?? null;
  const _tPreRfA = import.meta.env.DEV ? _devMark('③ perfA (RF chain)', _tPrePerf) : 0;
  const rfAvailableA = input.servingSatelliteA
    ? hasRFConnectivity(input.activePoint, input.servingSatelliteA, input.now, input.simulationStateA)
    : false;
  const _tPostRfA = import.meta.env.DEV ? _devMark('④ rfConnA', _tPreRfA) : 0;

  if (input.topology === 'SINGLE_SITE') {
    const downloadMbps = finitePositive(leoPerformance?.downlinkGbps != null ? leoPerformance.downlinkGbps * 1000 : null);
    const uploadMbps = finitePositive(leoPerformance?.uplinkGbps != null ? leoPerformance.uplinkGbps * 1000 : null);
    // COMM-1: decouple the two latency contracts.
    //  · oneWayLatencyMs → metrics.rtt, the one-way figure activeRouteViewModel
    //    labels "One-way".
    //  · rttMs → the top-level field the commercial view model consumes (scored
    //    and labeled Response/RTT). GEO's COMM latency is now the true round trip
    //    too, so the cross-technology comparison stays like-for-like.
    // NB: leoGeometry.rttTotalMs models network overhead as a one-time end-to-end
    // cost (see leoConnectivityModel), so rttTotalMs ≠ 2×oneWayLatencyMs by
    // design; reconciling that overhead convention is tracked separately (#6).
    const oneWayLatencyMs = finitePositive(leoGeometry?.oneWayLatencyMs);
    const rttMs = finitePositive(leoGeometry?.rttTotalMs);
    // Canonical gate chain shared with serviceLayer and the S2S model (L-Mo1).
    const decision = deriveLeoServiceDecision({
      regulatoryStatus: input.regulatoryResultA?.status ?? null,
      hasSatellite: !!input.servingSatelliteA,
      hasRF: rfAvailableA,
      hasSNP: !!selectedSnpA,
      capacityStatus: input.beamLoadA?.capacityStatus ?? null,
    });
    const serviceStatus = decision.status;
    const metricsComplete = downloadMbps != null && uploadMbps != null && rttMs != null;
    const pending = serviceStatus !== 'BLOCKED' && !metricsComplete;
    const bottleneck = leoPerformance?.debugInfo?.mainBottleneck.label && leoPerformance.debugInfo.mainBottleneck.label !== 'None'
      ? leoPerformance.debugInfo.mainBottleneck.label
      : null;
    const degradationReason = (() => {
      switch (decision.gate) {
        case 'REGULATORY_PENDING': return 'Regulatory status pending at Site A.';
        case 'REGULATORY_BLOCKED': return 'Regulatory blocked at Site A.';
        case 'NO_SATELLITE': return 'No LEO satellite available.';
        case 'NO_RF': return 'RF unavailable at Site A.';
        case 'NO_SNP': return 'No SNP reachable at Site A.';
        case 'REGULATORY_RESTRICTED': return 'Regulatory restricted at Site A.';
        case 'CAPACITY_SATURATED': return 'Capacity saturated at Site A.';
        case 'CAPACITY_DEGRADED': return 'Capacity degraded at Site A.';
        case null: return 'LEO route available.';
      }
    })();

    if (import.meta.env.DEV) {
      _devMark('⑦ total', _t0);
      _devProfile.calls += 1;
      if (performance.now() - _devProfile.lastLoggedAt > 30_000) {
        _devProfile.lastLoggedAt = performance.now();
        _devLogSummary();
      }
    }
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
            // Legacy field name; carries the one-way figure (COMM-1), labeled
            // "One-way" by activeRouteViewModel — NOT the round trip.
            rtt: oneWayLatencyMs ?? null,
            downlinkGbps: downloadMbps != null ? downloadMbps / 1000 : null,
            uplinkGbps: uploadMbps != null ? uploadMbps / 1000 : null,
          }
        : null,
      leoPerformance,
      geometry: leoGeometry,
      resolvedConnectivityA: connectivityA,
      resolvedConnectivityB: null,
      servingSatelliteA: input.servingSatelliteA,
      servingSatelliteB: null,
      servingAssignmentA: input.servingAssignmentA ?? null,
      servingAssignmentB: null,
      selectedSnpA,
      selectedSnpB: null,
      downloadMbps,
      uploadMbps,
      rttMs,
      bottleneck,
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

  const _tPreConnB = import.meta.env.DEV ? performance.now() : 0;
  const connectivityB = buildResolvedConnectivity({
    point: input.pointB,
    satellite: input.servingSatelliteB,
    snp: selectedSnpB,
    simulationState: input.simulationStateB,
    now: input.now,
  });
  const _tPreRfB = import.meta.env.DEV ? _devMark('⑤ connB (beam find)', _tPreConnB) : 0;
  const rfAvailableB = input.servingSatelliteB
    ? hasRFConnectivity(input.pointB, input.servingSatelliteB, input.now, input.simulationStateB)
    : false;
  const _tPreRoute = import.meta.env.DEV ? _devMark('⑥ rfConnB', _tPreRfB) : 0;

  const siteADlMbps = input.servingSatelliteA && rfAvailableA && leoPerformance?.downlinkGbps != null
    ? leoPerformance.downlinkGbps * 1000
    : null;
  const siteAUlMbps = input.servingSatelliteA && rfAvailableA && leoPerformance?.uplinkGbps != null
    ? leoPerformance.uplinkGbps * 1000
    : null;

  // L-B1: Site B's throughput comes from Site B's OWN RF chain (its geometry,
  // beam position, weather, load and terminal) — never from Site A's
  // beam-sharing figure. No EMA/handover state is maintained for Site B; this
  // is a static per-tick snapshot, so the drawer's finalUserMbps equals B's
  // raw shared value by construction (buildEndpointDebug defaults).
  let siteBDlMbps: number | null = null;
  let siteBUlMbps: number | null = null;
  let debugB: LeoThroughputResult | null = null;
  if (input.servingSatelliteB && rfAvailableB && connectivityB && input.pointB) {
    const endpointDebugB = buildEndpointDebug({
      point: input.pointB,
      connectivity: connectivityB,
      terminalType: input.terminalTypeB,
      terminalModelId: input.terminalModelIdB,
      beamLoad: input.beamLoadB,
      simulationState: input.simulationStateB,
      now: input.now,
      smoothingAlpha: 0,
      handoverFactor: 1,
    });
    if (endpointDebugB.debugInfo && endpointDebugB.rawDownlinkMbps != null && endpointDebugB.rawUplinkMbps != null) {
      siteBDlMbps = endpointDebugB.rawDownlinkMbps;
      siteBUlMbps = endpointDebugB.rawUplinkMbps;
      debugB = endpointDebugB.debugInfo;
    } else if (connectivityB.snp) {
      // No beam-model evidence at B (SERVICE_ZONE policy or no connected beam):
      // fall back to the same approximate model Site A uses in that situation.
      const approxB = calculateApproximatePerformance({
        connectivity: connectivityB,
        terminalType: input.terminalTypeB,
        terminalModelId: input.terminalModelIdB,
        weatherType: input.weatherTypeB,
        estimatedRttMs: null,
      });
      siteBDlMbps = approxB.downlinkGbps * 1000;
      siteBUlMbps = approxB.uplinkGbps * 1000;
    }
  }

  const _tPreS2S = import.meta.env.DEV ? performance.now() : 0;
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

  if (import.meta.env.DEV) _devMark('⑥b s2s route', _tPreS2S);

  const throughputAtoB = finitePositive(routeResult.finalThroughputAtoBMbps);
  const throughputBtoA = finitePositive(routeResult.finalThroughputBtoAMbps);
  // COMM-1: two distinct latency contracts, decoupled on purpose.
  //  · oneWayLatencyMs — the A→B one-way figure (symmetric by construction).
  //    Feeds metrics.rtt, which activeRouteViewModel labels explicitly "One-way".
  //  · rttMs — the true round trip (A→B + B→A, per-direction processing
  //    included). Sole consumer is the commercial view model, which scores it
  //    and labels it Response/RTT and drives use-case classification.
  const oneWayLatencyMs = finitePositive(routeResult.oneWayLatencyAtoBMs);
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

  const s2sResult: ActiveLeoRouteEvidence = {
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
          // Legacy field name; carries the ENG one-way figure (see COMM-1 above),
          // labeled "One-way" by activeRouteViewModel — NOT the round trip.
          rtt: oneWayLatencyMs ?? null,
          downlinkGbps: throughputAtoB != null ? throughputAtoB / 1000 : null,
          uplinkGbps: throughputBtoA != null ? throughputBtoA / 1000 : null,
        }
      : null,
    leoPerformance,
    // SITE_TO_SITE has its own equivalent breakdown via routeResult's per-site
    // debug info — see the geometry field's own doc comment on the interface.
    geometry: null,
    resolvedConnectivityA: connectivityA,
    resolvedConnectivityB: connectivityB,
    servingSatelliteA: routeResult.servingSatelliteA,
    servingSatelliteB: routeResult.servingSatelliteB,
    servingAssignmentA: input.servingAssignmentA ?? null,
    servingAssignmentB: input.servingAssignmentB ?? null,
    selectedSnpA: routeResult.selectedSnpA,
    selectedSnpB: routeResult.selectedSnpB,
    throughputAtoBMbps: throughputAtoB,
    throughputBtoAMbps: throughputBtoA,
    downloadMbps: throughputAtoB,
    uploadMbps: throughputBtoA,
    rttMs,
    bottleneck,
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
  if (import.meta.env.DEV) {
    _devMark('⑦ total', _t0);
    _devProfile.calls += 1;
    if (performance.now() - _devProfile.lastLoggedAt > 30_000) {
      _devProfile.lastLoggedAt = performance.now();
      _devLogSummary();
    }
  }
  return s2sResult;
}
