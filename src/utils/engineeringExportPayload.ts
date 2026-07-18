import type { RefObject } from 'react';
import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { getGatewayTrafficStatusNote } from '../components/globe/GlobeConfig';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from './linkAvailabilityContext';
import type { PDFConnectionDetails, PDFEvidenceSummary } from './pdfExport';
import type { ExportButtonPayload } from '../components/ExportButton';
import type { EngineeringTruthSet } from './engineeringAnalysisViewModel';
import type { LinkMode } from '../types/linkMode';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type {
  GEOGeometry,
  LEOGeometry,
  LEOPerformance,
  ResolvedGEOConnectivity,
  ResolvedLEOConnectivity,
  TerminalType,
  WeatherType,
} from '../components/capacity';
import { TERMINAL_PROFILES } from '../components/capacity';
import type { LeoTerminalProfile } from '../config/leoTerminals';
import type { LeoConnectivityResult } from './leoConnectivityModel';
import type { ActiveLeoPerformance } from './activeLeoRouteEvidence';

/**
 * Pure builders for the PDF/export payload — extracted verbatim from
 * CapacityDetails so the export contract has a testable seam (M2). These
 * functions must never derive an engineering outcome themselves: every value
 * is read from the already-published analysis results.
 */

export interface GeoPerformanceEstimate {
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
  performanceFactor: number;
  weatherFactor: number;
  weatherLabel: string;
}

export interface MobileLeoMetricsSummary {
  rtt?: number | null;
  downlinkGbps?: number | null;
  uplinkGbps?: number | null;
}

/**
 * The two live LEO performance shapes (section-level LEOPerformance and the
 * App evidence pipeline's ActiveLeoPerformance) share the fields read here.
 */
export type LeoPerformanceLike = LEOPerformance | ActiveLeoPerformance;

export interface BuildLeoPdfDetailsInputs {
  resolvedLEOConnectivity: ResolvedLEOConnectivity | null;
  selectedLeoTerminalProfile: LeoTerminalProfile;
  leoPerformance: LeoPerformanceLike | null;
  leoGeometry: LeoConnectivityResult | LEOGeometry | null;
  mobileLeoMetrics: MobileLeoMetricsSummary | null;
}

export function buildLeoPdfDetails({
  resolvedLEOConnectivity,
  selectedLeoTerminalProfile,
  leoPerformance,
  leoGeometry,
  mobileLeoMetrics,
}: BuildLeoPdfDetailsInputs): PDFConnectionDetails | null {
  if (!resolvedLEOConnectivity) {
    return {
      radioPath: 'No valid LEO/SNP connectivity for this location.',
      emptyState: 'No valid LEO/SNP connectivity for this location.',
    };
  }

  const userLabel = 'Site A';
  const terminalProfile = selectedLeoTerminalProfile;

  if (!resolvedLEOConnectivity.snp) {
    return {
      radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} (-> No SNP connectivity)`,
      routeLines: [
        `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
        `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km`,
      ],
      oneWayPropagation: {
        distanceKm: resolvedLEOConnectivity.userLEODistance,
        latencyMs: resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
      },
      performance: {
        rttLabel: 'End-to-End LEO RTT',
        rttMs: null,
        downlinkGbps: null,
        uplinkGbps: null,
        maxDlGbps: terminalProfile.maxDlMbps / 1000,
        maxUlGbps: terminalProfile.maxUlMbps / 1000,
        notes: ['No performance data is available without SNP connectivity.'],
      },
    };
  }

  const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
  const effectivePerformanceFactor = leoPerformance?.performanceFactor ?? null;

  return {
    radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} -> SNP ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name} -> ${userLabel}`,
    routeLines: [
      `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
      `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
      `SNP ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name}`,
      `Elevation: ${(resolvedLEOConnectivity.snpLEOElevation || 0).toFixed(1)} deg | Distance: ${(resolvedLEOConnectivity.snpLEODistance || 0).toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
    ],
    oneWayPropagation: {
      distanceKm: oneWayDistanceKm,
      latencyMs: leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000),
    },
    latency: leoGeometry ? {
      summary: `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`,
      propagationRows: [
        { label: 'Site A -> Satellite', value: `${leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms` },
        { label: 'Satellite -> SNP', value: `${leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms` },
        { label: 'SNP -> Satellite', value: `${leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms` },
        { label: 'Satellite -> Site A', value: `${leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms` },
      ],
      propagationTotal: `${leoGeometry.rttPropagationMs.toFixed(1)} ms`,
      overheadRows: [
        { label: 'Gateway processing delay', value: `${leoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
        { label: 'Modem processing delay', value: `${leoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
        { label: 'Routing delay', value: `${leoGeometry.overheadMs.routing.toFixed(0)} ms` },
        { label: 'Queueing delay', value: `${leoGeometry.overheadMs.queueing.toFixed(0)} ms` },
      ],
      overheadTotal: `${leoGeometry.overheadMs.total.toFixed(1)} ms`,
      total: `${leoGeometry.rttTotalMs.toFixed(1)} ms`,
      warnings: leoGeometry.warnings,
    } : null,
    performance: {
      rttLabel: 'End-to-End LEO RTT',
      rttMs: mobileLeoMetrics?.rtt ?? null,
      downlinkGbps: mobileLeoMetrics?.downlinkGbps ?? null,
      uplinkGbps: mobileLeoMetrics?.uplinkGbps ?? null,
      maxDlGbps: terminalProfile.maxDlMbps / 1000,
      maxUlGbps: terminalProfile.maxUlMbps / 1000,
      stability: leoPerformance?.stability ?? null,
      performanceFactor: effectivePerformanceFactor,
      notes: [
        leoPerformance ? `Weather profile: ${leoPerformance.weatherLabel} (${Math.round(leoPerformance.weatherFactor * 100)}% link factor)` : '',
        leoPerformance?.throughput ? `Main bottleneck: ${leoPerformance.throughput.mainBottleneck.label}` : '',
      ].filter(Boolean),
    },
  };
}

export interface BuildGeoPdfDetailsInputs {
  resolvedGEOConnectivity: ResolvedGEOConnectivity | null;
  geoGeometry: GEOGeometry | null;
  geoTerminalType: TerminalType;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  geoPerformance: GeoPerformanceEstimate | null;
}

export function buildGeoPdfDetails({
  resolvedGEOConnectivity,
  geoGeometry,
  geoTerminalType,
  analysisSource,
  aircraftCallsign,
  geoPerformance,
}: BuildGeoPdfDetailsInputs): PDFConnectionDetails | null {
  if (!resolvedGEOConnectivity || !geoGeometry) {
    return {
      radioPath: 'No GEO visibility or beam coverage',
      emptyState: 'No GEO visibility or beam coverage',
      performance: {
        rttLabel: 'End-to-End GEO RTT',
        rttMs: null,
        downlinkGbps: null,
        uplinkGbps: null,
        maxDlGbps: TERMINAL_PROFILES[geoTerminalType].maxDlGbps,
        maxUlGbps: TERMINAL_PROFILES[geoTerminalType].maxUlGbps,
        notes: ['No GEO coverage available'],
      },
    };
  }

  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
  const resolvedGateway = geoGeometry.satelliteToGateway.resolvedGateway;
  const gatewayName = resolvedGateway
    ? `${resolvedGateway.gatewayName} (${resolvedGateway.controlAssignmentRole})`
    : geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible traffic gateway';
  const gatewayTrafficStatusNote = resolvedGateway
    ? getGatewayTrafficStatusNote(resolvedGateway.gateway.trafficStatus)
    : null;
  const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
  const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
    ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
    : null;

  return {
    radioPath: `${userLabel} -> ${resolvedGEOConnectivity.satellite.name} -> ${gatewayName} -> ${resolvedGEOConnectivity.satellite.name} -> ${userLabel}`,
    routeLines: [
      `${userLabel} -> ${userToSatelliteLabel}`,
      `Elevation: ${geoGeometry.userToSatellite.elevationDeg.toFixed(1)} deg | Slant range: ${geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km (${geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)`,
      `${gatewayName} -> ${resolvedGEOConnectivity.satellite.name}`,
      `Slant range: ${geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : 'N/A'} (${geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : 'N/A'})`,
      ...(gatewayTrafficStatusNote ? [gatewayTrafficStatusNote] : []),
    ],
    oneWayPropagation: {
      distanceKm: oneWayDistanceKm,
      latencyMs: geoGeometry.oneWayRadioMs,
    },
    latency: {
      summary: `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms`,
      propagationRows: [
        { label: 'User -> Satellite', value: `${geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms` },
        { label: 'Satellite -> Traffic Gateway', value: `${geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms` },
        { label: 'Traffic Gateway -> Satellite', value: `${geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms` },
        { label: 'Satellite -> User', value: `${geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms` },
      ],
      propagationTotal: geoGeometry.rttPropagationMs != null ? `${geoGeometry.rttPropagationMs.toFixed(1)} ms` : undefined,
      overheadRows: [
        { label: 'Traffic gateway processing delay', value: `${geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
        { label: 'Modem processing delay', value: `${geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
        { label: 'Routing delay', value: `${geoGeometry.overheadMs.routing.toFixed(0)} ms` },
      ],
      overheadTotal: `${geoGeometry.overheadMs.total.toFixed(1)} ms`,
      total: geoGeometry.rttTotalMs != null ? `${geoGeometry.rttTotalMs.toFixed(1)} ms` : undefined,
      warnings: geoGeometry.warnings,
    },
    performance: {
      rttLabel: 'End-to-End GEO RTT',
      rttMs: geoGeometry.rttTotalMs,
      downlinkGbps: geoPerformance?.downlinkGbps ?? null,
      uplinkGbps: geoPerformance?.uplinkGbps ?? null,
      maxDlGbps: TERMINAL_PROFILES[geoTerminalType].maxDlGbps,
      maxUlGbps: TERMINAL_PROFILES[geoTerminalType].maxUlGbps,
      stability: geoGeometry.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? null,
      performanceFactor: geoPerformance?.performanceFactor ?? null,
      notes: geoPerformance ? [`Basis: ${geoPerformance.weatherLabel}`] : [],
    },
  };
}

export interface BuildEngineeringExportPayloadInputs {
  activePoint: { lat: number; lng: number } | null;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  satelliteScope: SatelliteScope;
  activeConnTab: 'LEO' | 'GEO';
  engineeringTruths: EngineeringTruthSet;
  weatherType: WeatherType;
  nearestLocation: { city: string; country: string } | null;
  resolvedLEOConnectivity: ResolvedLEOConnectivity | null;
  leoGeometry: LeoConnectivityResult | LEOGeometry | null;
  leoPerformance: LeoPerformanceLike | null;
  resolvedGEOConnectivity: ResolvedGEOConnectivity | null;
  geoGeometry: GEOGeometry | null;
  geoPerformance: GeoPerformanceEstimate | null;
  linkMode: LinkMode;
  activeMeshTab?: 'forward' | 'reverse';
  leoPdfDetails: PDFConnectionDetails | null;
  geoPdfDetails: PDFConnectionDetails | null;
  globeRef?: RefObject<HTMLDivElement | null>;
  cesiumViewerRef?: RefObject<any>;
}

export function buildEngineeringExportPayload({
  activePoint,
  analysisSource,
  aircraftCallsign,
  satelliteScope,
  activeConnTab,
  engineeringTruths,
  weatherType,
  nearestLocation,
  resolvedLEOConnectivity,
  leoGeometry,
  leoPerformance,
  resolvedGEOConnectivity,
  geoGeometry,
  geoPerformance,
  linkMode,
  activeMeshTab,
  leoPdfDetails,
  geoPdfDetails,
  globeRef,
  cesiumViewerRef,
}: BuildEngineeringExportPayloadInputs): ExportButtonPayload | null {
  if (!activePoint) {
    return null;
  }

  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
  const preferLeo = satelliteScope === 'LEO' || (satelliteScope === 'ALL' && activeConnTab === 'LEO');
  const chosenTruth = engineeringTruths[preferLeo ? 'LEO' : 'GEO'];
  const throughputMetrics = chosenTruth?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
  const chosenPerformance = throughputMetrics.length > 0
    ? throughputMetrics.map((metric) => `${metric.label}: ${metric.display}`).join(' / ')
    : chosenTruth?.headline ?? 'No deliverable performance';
  const leoTruthThroughputs = engineeringTruths.LEO?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
  const geoTruthThroughputs = engineeringTruths.GEO?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
  const leoDownlinkMbps = leoTruthThroughputs.find((metric) => /downlink/i.test(metric.label))?.value ?? leoTruthThroughputs[0]?.value ?? null;
  const leoUplinkMbps = leoTruthThroughputs.find((metric) => /uplink/i.test(metric.label))?.value ?? null;
  const geoForwardMbps = geoTruthThroughputs[0]?.value ?? null;
  const availabilityContext = buildLinkAvailabilityContext({
    architecture: preferLeo ? 'LEO' : 'GEO',
    weatherType,
    lat: activePoint.lat,
  });
  const evidenceSummary: PDFEvidenceSummary = {
    architectureChoice: preferLeo ? 'LEO feasibility path' : 'GEO feasibility path',
    limitingFactor: chosenTruth?.decisiveFactor ?? (chosenTruth?.state === 'available' ? 'No primary limiter detected' : chosenTruth?.headline ?? 'Not evaluated'),
    expectedPerformance: chosenPerformance,
    confidence: chosenTruth?.confidence?.display ?? chosenTruth?.confidence?.label ?? 'Not evaluated',
    confidenceReasons: chosenTruth?.causeChain.map((stage) => `${stage.label}: ${stage.summary}`) ?? [],
    availabilityContext: formatLinkAvailabilityContext(availabilityContext),
  };

  return {
    location: {
      lat: activePoint.lat,
      lng: activePoint.lng,
      name: [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ') || undefined
    },
    scope: satelliteScope,
    leoData: resolvedLEOConnectivity ? {
      name: resolvedLEOConnectivity.satellite.name,
      elevation: resolvedLEOConnectivity.userLEOElevation || 0,
      rtt: resolvedLEOConnectivity.snp
        ? (leoGeometry?.rttTotalMs ?? (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
        : resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
      downlinkGbps: leoDownlinkMbps != null ? leoDownlinkMbps / 1000 : 0,
      uplinkGbps: leoUplinkMbps != null ? leoUplinkMbps / 1000 : 0,
      stability: resolvedLEOConnectivity.snp
        ? (leoPerformance?.stability ?? 'Unstable')
        : 'Unstable',
      distance: resolvedLEOConnectivity.userLEODistance,
      radioPath: resolvedLEOConnectivity.snp
        ? `${userLabel} → ${resolvedLEOConnectivity.satellite.name} → SNP ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${userLabel}`
        : `${userLabel} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
    } : null,
    geoData: resolvedGEOConnectivity ? {
      name: resolvedGEOConnectivity.satellite.name,
      elevation: geoGeometry?.userToSatellite.elevationDeg || 0,
      rtt: geoGeometry?.rttTotalMs || 0,
      downlinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse' ? 0 : (geoForwardMbps ?? 0) / 1000,
      uplinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse' ? (geoForwardMbps ?? 0) / 1000 : 0,
      stability: (() => {
        return geoGeometry?.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? 'Unstable';
      })(),
      distance: geoGeometry?.userToSatellite.slantRangeKm || 0,
      radioPath: `${userLabel} → ${resolvedGEOConnectivity.satellite.name} → ${userLabel}`
    } : null,
    leoDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
    geoDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
    evidenceSummary,
    globeRef,
    cesiumViewerRef,
  };
}
