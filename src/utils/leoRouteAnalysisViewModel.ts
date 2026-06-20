import { JulianDate } from 'cesium';
import type { SNPData } from '../components/globe/GlobeConfig';
import { WEATHER_PROFILES, getWeatherFactor, type TerminalType, type WeatherType } from '../components/capacity';
import { getLeoTerminalProfile } from '../config/leoTerminals';
import { computeLeoTerminalScanLossDb } from '../config/leoTerminals';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { MobileLinkMetrics } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { SimulationStateSnapshot } from '../types/simulation';
import type { BeamLoadResult } from './capacityLayer';
import {
  RF_KU_FREQ_GHZ,
  RF_SATELLITE_GOT_DB_PER_K,
  computeDirectionalRfChainThroughput,
  computeUplinkRfChainThroughput,
} from './leoLinkBudget';
import { applyBeamCapacitySharing } from './leoNetworkLayer';
import { analyzeLeoConnectivity } from './leoConnectivityModel';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from './leoFootprint';
import type { LeoConnectivityViewModel } from './leoServiceViewModel';
import {
  computeLeoSiteToSiteResult,
  formatLeoSiteToSiteFailureReason,
  type LeoSiteToSiteResult,
} from './leoSiteToSiteModel';
import { calculateElevationAngle, compute3DDistanceKm, SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { estimateCurrentLeoBeamLink, findBestConnectedBeamInfo, hasRFConnectivity } from './rfConnectivity';

export type LeoRouteAnalysisTopology = 'SINGLE_SITE' | 'SITE_TO_SITE';

export interface LeoRouteAnalysisViewModel {
  topology: LeoRouteAnalysisTopology;
  available: boolean;
  pending: boolean;
  degraded: boolean;
  reason: string | null;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  routeSummary?: string;
  routePath?: LeoSiteToSiteResult | null;
  servingSatelliteA?: SatelliteData | null;
  servingSatelliteB?: SatelliteData | null;
  selectedSnpA?: SNPData | null;
  selectedSnpB?: SNPData | null;
  inputSignature: string;
  serviceStatus?: string | null;
  metrics: MobileLinkMetrics | null;
}

interface CommercialPoint {
  lat: number;
  lng: number;
  altitude?: number;
}

interface BuildLeoRouteAnalysisInput {
  topology: LeoRouteAnalysisTopology;
  activePoint: CommercialPoint | null;
  pointB: CommercialPoint | null;
  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;
  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;
  regulatoryResultA: RegulatoryResult | null;
  regulatoryResultB: RegulatoryResult | null;
  beamLoadA: BeamLoadResult | null;
  beamLoadB: BeamLoadResult | null;
  leoServiceViewModel: LeoConnectivityViewModel | null;
  terminalTypeA: TerminalType;
  terminalTypeB: TerminalType;
  terminalModelIdA?: string | null;
  terminalModelIdB?: string | null;
  weatherTypeA: WeatherType;
  weatherTypeB: WeatherType;
  simulationStateA: SimulationStateSnapshot;
  simulationStateB: SimulationStateSnapshot;
  siteToSiteFullResult?: LeoSiteToSiteResult | null;
  siteToSiteStructuralResult?: LeoSiteToSiteResult | null;
}

interface EndpointPerformance {
  userToSatKm: number | null;
  satToSnpKm: number | null;
  elevationDeg: number | null;
  rfAvailable: boolean;
  downlinkMbps: number | null;
  uplinkMbps: number | null;
  rttMs: number | null;
}

function finitePositive(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function signaturePoint(point: CommercialPoint | null): string {
  if (!point) return 'none';
  return [point.lat.toFixed(5), point.lng.toFixed(5), point.altitude?.toFixed(2) ?? 'ground'].join(',');
}

function signatureSatellite(satellite: SatelliteData | null): string {
  return satellite ? `${satellite.id}:${satellite.name}` : 'none';
}

function signatureSnp(snp: SNPData | null): string {
  return snp ? `${snp.name}:${snp.lat.toFixed(4)},${snp.lng.toFixed(4)}` : 'none';
}

function buildInputSignature(input: BuildLeoRouteAnalysisInput): string {
  return [
    `topology:${input.topology}`,
    `a:${signaturePoint(input.activePoint)}`,
    `b:${signaturePoint(input.pointB)}`,
    `satA:${signatureSatellite(input.servingSatelliteA)}`,
    `satB:${signatureSatellite(input.servingSatelliteB)}`,
    `snpA:${signatureSnp(input.selectedSnpA)}`,
    `snpB:${signatureSnp(input.selectedSnpB)}`,
    `termA:${input.terminalModelIdA ?? input.terminalTypeA}`,
    `termB:${input.terminalModelIdB ?? input.terminalTypeB}`,
    `wxA:${input.weatherTypeA}`,
    `wxB:${input.weatherTypeB}`,
  ].join('|');
}

function pointsMatch(left: CommercialPoint | null, right: CommercialPoint | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.lat - right.lat) < 0.0001 && Math.abs(left.lng - right.lng) < 0.0001;
}

function isFreshSiteToSiteResult(
  result: LeoSiteToSiteResult | null | undefined,
  activePoint: CommercialPoint | null,
  pointB: CommercialPoint | null,
): result is LeoSiteToSiteResult {
  if (!result || !activePoint || !pointB) return false;
  return pointsMatch(result.endpointA, activePoint) && pointsMatch(result.endpointB, pointB);
}

function calculateApproximatePerformance(args: {
  userLEODistance: number;
  snpLEODistance: number;
  userLEOElevation: number;
  snpLEOElevation: number;
  estimatedRttMs: number | null;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  weatherType: WeatherType;
}) {
  const profile = getLeoTerminalProfile(args.terminalType, args.terminalModelId ?? undefined);
  const oneWayDistanceKm = args.userLEODistance + args.snpLEODistance;
  const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
  const rtt = args.estimatedRttMs ?? Math.max(5, fallbackPropagationRttMs);
  const weatherFactor = getWeatherFactor(args.weatherType, args.terminalType === 'aviation');

  if (args.userLEOElevation < MIN_USER_TERMINAL_ELEVATION_DEG || args.snpLEOElevation < MIN_SNP_GATEWAY_ELEVATION_DEG) {
    return {
      rtt,
      downlinkMbps: 0,
      uplinkMbps: 0,
      weatherLabel: WEATHER_PROFILES[args.weatherType].label,
    };
  }

  const limitingElevation = Math.min(args.userLEOElevation, args.snpLEOElevation);
  const limitingDistanceKm = Math.max(args.userLEODistance, args.snpLEODistance);
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
    estimateTimeToExitSec(args.userLEOElevation),
    estimateTimeToExitSec(args.snpLEOElevation),
  );
  const handoverFactor = limitingTimeToExitSec < 45
    ? 0.4
    : limitingTimeToExitSec < 120
      ? 0.4 + (limitingTimeToExitSec - 45) / (120 - 45) * 0.6
      : 1;
  const performanceFactor = elevationFactor * distanceFactor * handoverFactor * weatherFactor;

  return {
    rtt,
    downlinkMbps: performanceFactor > 0 ? profile.maxDlMbps * performanceFactor : 0,
    uplinkMbps: performanceFactor > 0 ? profile.maxUlMbps * performanceFactor : 0,
    weatherLabel: WEATHER_PROFILES[args.weatherType].label,
  };
}

function estimateEndpointPerformance(args: {
  point: CommercialPoint | null;
  satellite: SatelliteData | null;
  snp: SNPData | null;
  beamLoad: BeamLoadResult | null;
  terminalType: TerminalType;
  terminalModelId?: string | null;
  weatherType: WeatherType;
  simulationState: SimulationStateSnapshot;
  time: JulianDate;
}): EndpointPerformance {
  if (!args.point || !args.satellite) {
    return {
      userToSatKm: null,
      satToSnpKm: null,
      elevationDeg: null,
      rfAvailable: false,
      downlinkMbps: null,
      uplinkMbps: null,
      rttMs: null,
    };
  }

  const userToSatKm = compute3DDistanceKm(args.point, {
    lat: args.satellite.position.lat,
    lng: args.satellite.position.lng,
    alt: args.satellite.position.alt,
  });
  const elevationDeg = calculateElevationAngle(args.point, args.satellite);
  const rfAvailable = hasRFConnectivity(args.point, args.satellite, args.time, args.simulationState);

  if (!args.snp) {
    return {
      userToSatKm,
      satToSnpKm: null,
      elevationDeg,
      rfAvailable,
      downlinkMbps: null,
      uplinkMbps: null,
      rttMs: null,
    };
  }

  const satToSnpKm = compute3DDistanceKm(
    { lat: args.snp.lat, lng: args.snp.lng },
    { lat: args.satellite.position.lat, lng: args.satellite.position.lng, alt: args.satellite.position.alt },
  );
  const snpElevationDeg = calculateElevationAngle({ lat: args.snp.lat, lng: args.snp.lng }, args.satellite);
  const leoGeometry = analyzeLeoConnectivity({
    userToSatelliteDistanceKm: userToSatKm,
    satelliteToGatewayDistanceKm: satToSnpKm,
    userToSatelliteElevationDeg: elevationDeg,
    gatewayToSatelliteElevationDeg: snpElevationDeg,
  });

  if (!rfAvailable) {
    return {
      userToSatKm,
      satToSnpKm,
      elevationDeg,
      rfAvailable,
      downlinkMbps: null,
      uplinkMbps: null,
      rttMs: leoGeometry.rttTotalMs,
    };
  }

  const beamInfo = findBestConnectedBeamInfo(args.point, args.satellite, args.time, args.simulationState);
  const profile = getLeoTerminalProfile(args.terminalType, args.terminalModelId ?? undefined);

  if (args.simulationState.coveragePolicy.type === 'DB_THRESHOLD' && beamInfo?.beamIndex != null) {
    const beamEstimate = estimateCurrentLeoBeamLink({
      userPosition: args.point,
      satellite: args.satellite,
      beamIndex: beamInfo.beamIndex,
      snpPosition: args.snp,
      time: args.time,
      simulationState: args.simulationState,
    });

    if (beamEstimate) {
      const rxScanLossDb = computeLeoTerminalScanLossDb(profile.rxScanLossModel, beamEstimate.userElevationDeg);
      const txScanLossDb = computeLeoTerminalScanLossDb(profile.txScanLossModel, beamEstimate.userElevationDeg);
      const activeUsers = args.beamLoad?.estimatedActiveUsers ?? 1;

      const downlinkRf = computeDirectionalRfChainThroughput({
        eirpDbw: beamEstimate.beamLink.effectiveEirpDb,
        receiverGtDbK: profile.rxGtDbK + rxScanLossDb,
        slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
        pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
        frequencyGHz: RF_KU_FREQ_GHZ,
        noiseBwHz: profile.dlReferenceBandwidthHz,
        throughputBwHz: profile.dlReferenceBandwidthHz,
      });
      const uplinkRf = computeUplinkRfChainThroughput({
        terminalEirpDbw: profile.txEirpDbw + txScanLossDb,
        slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
        pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
        noiseBwHz: profile.ulReferenceBandwidthHz,
        throughputBwHz: profile.ulReferenceBandwidthHz,
      });
      const downlinkSharing = applyBeamCapacitySharing(
        downlinkRf.rfThroughputMbps,
        activeUsers,
        profile.maxDlMbps,
        {
          direction: 'downlink',
          referenceBandwidthHz: profile.dlReferenceBandwidthHz,
          usableBeamBandwidthHz: profile.dlUsableBeamBandwidthHz,
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
        },
      );

      return {
        userToSatKm,
        satToSnpKm,
        elevationDeg,
        rfAvailable,
        downlinkMbps: downlinkSharing.sharedThroughputMbps * beamEstimate.backhaulFactor,
        uplinkMbps: uplinkSharing.sharedThroughputMbps * beamEstimate.backhaulFactor,
        rttMs: leoGeometry.rttTotalMs,
      };
    }
  }

  const approximate = calculateApproximatePerformance({
    userLEODistance: userToSatKm,
    snpLEODistance: satToSnpKm,
    userLEOElevation: elevationDeg,
    snpLEOElevation,
    estimatedRttMs: leoGeometry.rttTotalMs,
    terminalType: args.terminalType,
    terminalModelId: args.terminalModelId,
    weatherType: args.weatherType,
  });

  return {
    userToSatKm,
    satToSnpKm,
    elevationDeg,
    rfAvailable,
    downlinkMbps: approximate.downlinkMbps,
    uplinkMbps: approximate.uplinkMbps,
    rttMs: approximate.rtt,
  };
}

function siteToSiteMetrics(result: LeoSiteToSiteResult): {
  available: boolean;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  metrics: MobileLinkMetrics | null;
} {
  const downloadMbps = finitePositive(result.finalThroughputAtoBMbps);
  const uploadMbps = finitePositive(result.finalThroughputBtoAMbps);
  const rttMs = finitePositive(result.rttMs);
  const available = result.serviceAvailable && (downloadMbps != null || uploadMbps != null) && rttMs != null;
  return {
    available,
    downloadMbps,
    uploadMbps,
    rttMs,
    metrics: available
      ? {
          rtt: rttMs ?? null,
          downlinkGbps: downloadMbps != null ? downloadMbps / 1000 : null,
          uplinkGbps: uploadMbps != null ? uploadMbps / 1000 : null,
        }
      : null,
  };
}

function singleSiteStatusReason(viewModel: LeoConnectivityViewModel | null): string {
  if (!viewModel) return 'Waiting for LEO route calculation.';
  if (viewModel.finalServiceStatus === 'ALLOWED') return 'LEO route available.';
  if (viewModel.finalServiceStatus === 'DEGRADED') return viewModel.decisionDriverLabel;
  return viewModel.reasonSummary || viewModel.decisionDriverLabel;
}

export function buildLeoRouteAnalysisViewModel(input: BuildLeoRouteAnalysisInput): LeoRouteAnalysisViewModel {
  const inputSignature = buildInputSignature(input);
  const time = JulianDate.fromDate(new Date());
  const endpointA = estimateEndpointPerformance({
    point: input.activePoint,
    satellite: input.servingSatelliteA,
    snp: input.selectedSnpA,
    beamLoad: input.beamLoadA,
    terminalType: input.terminalTypeA,
    terminalModelId: input.terminalModelIdA,
    weatherType: input.weatherTypeA,
    simulationState: input.simulationStateA,
    time,
  });

  if (!input.activePoint) {
    return {
      topology: input.topology,
      available: false,
      pending: true,
      degraded: false,
      reason: 'Select a location to calculate LEO service.',
      inputSignature,
      serviceStatus: null,
      metrics: null,
    };
  }

  if (input.topology === 'SINGLE_SITE') {
    const downloadMbps = finitePositive(endpointA.downlinkMbps);
    const uploadMbps = finitePositive(endpointA.uplinkMbps);
    const rttMs = finitePositive(endpointA.rttMs);
    const metricsComplete = downloadMbps != null && uploadMbps != null && rttMs != null;
    const serviceStatus = input.leoServiceViewModel?.finalServiceStatus ?? null;
    const serviceAllowsRoute = serviceStatus === 'ALLOWED' || serviceStatus === 'DEGRADED';
    const pending = serviceAllowsRoute && !metricsComplete;
    const available = serviceAllowsRoute && metricsComplete;
    const reason = pending
      ? 'Waiting for LEO route calculation.'
      : singleSiteStatusReason(input.leoServiceViewModel);

    return {
      topology: input.topology,
      available,
      pending,
      degraded: serviceStatus === 'DEGRADED',
      reason,
      downloadMbps,
      uploadMbps,
      rttMs,
      routeSummary: available ? `LEO ${Math.round(downloadMbps ?? 0)} Mbps downlink` : undefined,
      servingSatelliteA: input.servingSatelliteA,
      selectedSnpA: input.selectedSnpA,
      inputSignature,
      serviceStatus,
      metrics: metricsComplete
        ? {
            rtt: rttMs ?? null,
            downlinkGbps: downloadMbps != null ? downloadMbps / 1000 : null,
            uplinkGbps: uploadMbps != null ? uploadMbps / 1000 : null,
          }
        : null,
    };
  }

  const freshFullResult = isFreshSiteToSiteResult(input.siteToSiteFullResult, input.activePoint, input.pointB)
    ? input.siteToSiteFullResult
    : null;
  const endpointB = estimateEndpointPerformance({
    point: input.pointB,
    satellite: input.servingSatelliteB,
    snp: input.selectedSnpB,
    beamLoad: input.beamLoadB,
    terminalType: input.terminalTypeB,
    terminalModelId: input.terminalModelIdB,
    weatherType: input.weatherTypeB,
    simulationState: input.simulationStateB,
    time,
  });

  const computedResult = input.pointB
    ? computeLeoSiteToSiteResult({
        endpointA: { lat: input.activePoint.lat, lng: input.activePoint.lng },
        endpointB: { lat: input.pointB.lat, lng: input.pointB.lng },
        servingSatelliteA: input.servingSatelliteA,
        servingSatelliteB: input.servingSatelliteB,
        rfAvailableA: endpointA.rfAvailable,
        rfAvailableB: endpointB.rfAvailable,
        selectedSnpA: input.selectedSnpA,
        selectedSnpB: input.selectedSnpB,
        regulatoryResultA: input.regulatoryResultA,
        regulatoryResultB: input.regulatoryResultB,
        beamLoadA: input.beamLoadA,
        beamLoadB: input.beamLoadB,
        userToSatDistanceAKm: endpointA.userToSatKm,
        satToSnpDistanceAKm: endpointA.satToSnpKm,
        userToSatDistanceBKm: endpointB.userToSatKm,
        satToSnpDistanceBKm: endpointB.satToSnpKm,
        elevationADeg: endpointA.elevationDeg,
        elevationBDeg: endpointB.elevationDeg,
        dlThroughputAMbps: endpointA.downlinkMbps,
        ulThroughputAMbps: endpointA.uplinkMbps,
        dlThroughputBMbps: endpointB.downlinkMbps,
        ulThroughputBMbps: endpointB.uplinkMbps,
      })
    : null;
  const routePath = freshFullResult ?? computedResult ?? input.siteToSiteStructuralResult ?? null;

  if (!input.pointB || !routePath) {
    return {
      topology: input.topology,
      available: false,
      pending: true,
      degraded: false,
      reason: 'Select two locations to calculate LEO site-to-site service.',
      routePath,
      servingSatelliteA: input.servingSatelliteA,
      servingSatelliteB: input.servingSatelliteB,
      selectedSnpA: input.selectedSnpA,
      selectedSnpB: input.selectedSnpB,
      inputSignature,
      serviceStatus: null,
      metrics: null,
    };
  }

  const metrics = siteToSiteMetrics(routePath);
  const pending = routePath.serviceAvailable && !metrics.available;
  const reason = pending
    ? 'Waiting for LEO route calculation.'
    : routePath.failureReason
      ? formatLeoSiteToSiteFailureReason(routePath.failureReason)
      : 'LEO site-to-site route available.';

  return {
    topology: input.topology,
    available: metrics.available,
    pending,
    degraded: routePath.serviceStatus === 'DEGRADED',
    reason,
    downloadMbps: metrics.downloadMbps,
    uploadMbps: metrics.uploadMbps,
    rttMs: metrics.rttMs,
    routeSummary: metrics.available
      ? `LEO site-to-site ${Math.round(metrics.downloadMbps ?? metrics.uploadMbps ?? 0)} Mbps`
      : undefined,
    routePath,
    servingSatelliteA: routePath.servingSatelliteA,
    servingSatelliteB: routePath.servingSatelliteB,
    selectedSnpA: routePath.selectedSnpA,
    selectedSnpB: routePath.selectedSnpB,
    inputSignature,
    serviceStatus: routePath.serviceStatus,
    metrics: metrics.metrics,
  };
}
