import type { RefObject } from 'react';
import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { getGatewayTrafficStatusNote } from '../components/globe/GlobeConfig';
import { formatResolvedGatewayRoleLabel } from './geoConnectivityModel';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from './linkAvailabilityContext';
import { buildDataProvenance, type DataNature, type DataProvenanceDescriptor } from './dataProvenance';
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
import type { CandidateCoverage } from '../types/analysis';
import type { BeamLoadResult } from './capacityLayer';
import type { LeoConnectivityResult } from './leoConnectivityModel';
import type { ActiveLeoPerformance } from './activeLeoRouteEvidence';
import type { LeoSiteToSiteResult } from './leoSiteToSiteModel';

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
  /**
   * Site-to-Site result and active direction — when present, the export
   * describes the full two-satellite/two-SNP S2S route instead of the
   * single-site template below. Optional and defaults to absent so every
   * existing single-site call/snapshot is unaffected (Cross-Surface
   * Consistency Audit 2026-07-21, F1: the export previously had no
   * Site-to-Site awareness at all and silently exported the single-site
   * round-trip template even while the live app showed a two-satellite route).
   */
  siteToSiteResult?: LeoSiteToSiteResult | null;
  direction?: 'A_TO_B' | 'B_TO_A';
}

/**
 * LEO Site-to-Site export branch (F1 fix). Mirrors the route construction
 * already proven correct in LEOConnectivitySection.tsx's Radio Path detail
 * and s2sLatencyHopRows — same field names, same direction-ordering — so the
 * exported route can never silently collapse to a single satellite/SNP the
 * way the old single-site template did.
 */
function buildLeoS2SPdfDetails(
  siteToSiteResult: LeoSiteToSiteResult,
  direction: 'A_TO_B' | 'B_TO_A',
  terminalProfile: LeoTerminalProfile,
): PDFConnectionDetails {
  const isAtoB = direction === 'A_TO_B';
  if (!siteToSiteResult.serviceAvailable) {
    return {
      radioPath: 'No complete LEO Site-to-Site path for the current beam coverage.',
      emptyState: 'No complete LEO Site-to-Site path for the current beam coverage.',
    };
  }

  const sourceSite = isAtoB ? 'Site A' : 'Site B';
  const destinationSite = isAtoB ? 'Site B' : 'Site A';
  const sourceSatName = (isAtoB ? siteToSiteResult.servingSatelliteA : siteToSiteResult.servingSatelliteB)?.name ?? 'Unresolved satellite';
  const destinationSatName = (isAtoB ? siteToSiteResult.servingSatelliteB : siteToSiteResult.servingSatelliteA)?.name ?? 'Unresolved satellite';
  const sourceSnpName = (isAtoB ? siteToSiteResult.selectedSnpA : siteToSiteResult.selectedSnpB)?.name ?? 'Unresolved SNP';
  const destinationSnpName = (isAtoB ? siteToSiteResult.selectedSnpB : siteToSiteResult.selectedSnpA)?.name ?? 'Unresolved SNP';
  const sameSNP = sourceSnpName === destinationSnpName;
  const popName = siteToSiteResult.logicalPop?.name ?? 'Core PoP';

  const sourceUserLatencyMs = isAtoB ? siteToSiteResult.userLinkLatencyAms : siteToSiteResult.userLinkLatencyBms;
  const sourceFeederLatencyMs = isAtoB ? siteToSiteResult.feederLatencyAms : siteToSiteResult.feederLatencyBms;
  const destinationFeederLatencyMs = isAtoB ? siteToSiteResult.feederLatencyBms : siteToSiteResult.feederLatencyAms;
  const destinationUserLatencyMs = isAtoB ? siteToSiteResult.userLinkLatencyBms : siteToSiteResult.userLinkLatencyAms;
  const sourceUserDistanceKm = isAtoB ? siteToSiteResult.userLinkDistanceAKm : siteToSiteResult.userLinkDistanceBKm;
  const sourceFeederDistanceKm = isAtoB ? siteToSiteResult.feederDistanceAKm : siteToSiteResult.feederDistanceBKm;
  const destinationFeederDistanceKm = isAtoB ? siteToSiteResult.feederDistanceBKm : siteToSiteResult.feederDistanceAKm;
  const destinationUserDistanceKm = isAtoB ? siteToSiteResult.userLinkDistanceBKm : siteToSiteResult.userLinkDistanceAKm;

  const oneWayLatencyMs = isAtoB ? siteToSiteResult.oneWayLatencyAtoBMs : siteToSiteResult.oneWayLatencyBtoAMs;
  const oneWayPropagationMs = sourceUserLatencyMs + sourceFeederLatencyMs + siteToSiteResult.backboneOneWayLatencyMs
    + destinationFeederLatencyMs + destinationUserLatencyMs;
  const oneWayDistanceKm = sourceUserDistanceKm + sourceFeederDistanceKm + siteToSiteResult.backboneDistanceKm
    + destinationFeederDistanceKm + destinationUserDistanceKm;
  const throughputMbps = isAtoB ? siteToSiteResult.finalThroughputAtoBMbps : siteToSiteResult.finalThroughputBtoAMbps;
  const reverseThroughputMbps = isAtoB ? siteToSiteResult.finalThroughputBtoAMbps : siteToSiteResult.finalThroughputAtoBMbps;

  return {
    radioPath: sameSNP
      ? `${sourceSite} -> ${sourceSatName} -> SNP ${sourceSnpName} -> ${destinationSatName} -> ${destinationSite}`
      : `${sourceSite} -> ${sourceSatName} -> SNP ${sourceSnpName} -> ${popName} -> SNP ${destinationSnpName} -> ${destinationSatName} -> ${destinationSite}`,
    routeLines: [
      `${sourceSite} -> ${sourceSatName}`,
      `Distance: ${sourceUserDistanceKm.toFixed(0)} km (${sourceUserLatencyMs.toFixed(1)} ms)`,
      `${sourceSatName} -> SNP ${sourceSnpName}`,
      `Distance: ${sourceFeederDistanceKm.toFixed(0)} km (${sourceFeederLatencyMs.toFixed(1)} ms)`,
      ...(sameSNP
        ? ['Same SNP — internal OneWeb routing, no backbone hop.']
        : [
            `SNP ${sourceSnpName} -> ${popName} -> SNP ${destinationSnpName}`,
            `Distance: ${siteToSiteResult.backboneDistanceKm.toFixed(0)} km (${siteToSiteResult.backboneOneWayLatencyMs.toFixed(1)} ms)`,
          ]),
      `SNP ${destinationSnpName} -> ${destinationSatName}`,
      `Distance: ${destinationFeederDistanceKm.toFixed(0)} km (${destinationFeederLatencyMs.toFixed(1)} ms)`,
      `${destinationSatName} -> ${destinationSite}`,
      `Distance: ${destinationUserDistanceKm.toFixed(0)} km (${destinationUserLatencyMs.toFixed(1)} ms)`,
    ],
    oneWayPropagation: {
      distanceKm: oneWayDistanceKm,
      latencyMs: oneWayPropagationMs,
    },
    latency: {
      summary: `Estimated ${isAtoB ? 'A → B' : 'B → A'} one-way latency: ${oneWayLatencyMs.toFixed(1)} ms · round-trip reference: ${siteToSiteResult.rttMs.toFixed(1)} ms`,
      propagationRows: [
        { label: `Access ${sourceSite === 'Site A' ? 'A' : 'B'} (${sourceSite} -> ${sourceSatName})`, value: `${sourceUserLatencyMs.toFixed(1)} ms` },
        { label: `Feeder ${sourceSite === 'Site A' ? 'A' : 'B'} (${sourceSatName} -> SNP)`, value: `${sourceFeederLatencyMs.toFixed(1)} ms` },
        ...(sameSNP ? [] : [{ label: 'Backbone (SNP -> PoP -> SNP)', value: `${siteToSiteResult.backboneOneWayLatencyMs.toFixed(1)} ms` }]),
        { label: `Feeder ${destinationSite === 'Site A' ? 'A' : 'B'} (SNP -> ${destinationSatName})`, value: `${destinationFeederLatencyMs.toFixed(1)} ms` },
        { label: `Access ${destinationSite === 'Site A' ? 'A' : 'B'} (${destinationSatName} -> ${destinationSite})`, value: `${destinationUserLatencyMs.toFixed(1)} ms` },
      ],
      propagationTotal: `${oneWayPropagationMs.toFixed(1)} ms`,
      overheadRows: [
        { label: 'Processing margin', value: `${siteToSiteResult.processingMarginMs.toFixed(0)} ms` },
      ],
      overheadTotal: `${siteToSiteResult.processingMarginMs.toFixed(1)} ms`,
      total: `${oneWayLatencyMs.toFixed(1)} ms one-way`,
      warnings: [],
    },
    performance: {
      // Genuine round-trip time, matching the single-site export's own
      // rttLabel/rttMs convention (see the comment on that branch below) — the
      // direction-selected one-way figure is the primary number, surfaced in
      // `latency.summary` above instead, mirroring how the live Inspector
      // shows both (one-way primary, round-trip as a secondary reference).
      rttLabel: 'Round-trip reference',
      rttMs: siteToSiteResult.rttMs,
      // S2S has no real downlink/uplink distinction (it's A→B / B→A through a
      // satellite relay) — the fixed PDF template only has "Downlink"/"Uplink"
      // rows, so the selected direction's throughput is reported as
      // "Downlink" and the reverse direction's as "Uplink", clarified in notes.
      downlinkGbps: throughputMbps != null ? throughputMbps / 1000 : null,
      uplinkGbps: reverseThroughputMbps != null ? reverseThroughputMbps / 1000 : null,
      maxDlGbps: terminalProfile.maxDlMbps / 1000,
      maxUlGbps: terminalProfile.maxUlMbps / 1000,
      notes: [
        `"Downlink" = ${isAtoB ? 'A → B' : 'B → A'} (selected direction) throughput; "Uplink" = ${isAtoB ? 'B → A' : 'A → B'} (reverse direction) throughput — Site-to-Site has no physical downlink/uplink distinction.`,
      ],
    },
  };
}

export function buildLeoPdfDetails({
  resolvedLEOConnectivity,
  selectedLeoTerminalProfile,
  leoPerformance,
  leoGeometry,
  mobileLeoMetrics,
  siteToSiteResult = null,
  direction = 'A_TO_B',
}: BuildLeoPdfDetailsInputs): PDFConnectionDetails | null {
  if (siteToSiteResult) {
    return buildLeoS2SPdfDetails(siteToSiteResult, direction, selectedLeoTerminalProfile);
  }

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
      // Genuine round-trip time, matching its "RTT" label and the detailed
      // latency breakdown above (leoGeometry.rttTotalMs) — mirrors GEO's
      // equivalent field (geoGeometry.rttTotalMs, also honestly RTT-labeled).
      // mobileLeoMetrics.rtt is a ONE-WAY latency (see mobileLeoMetrics in
      // useEngineeringAnalysis.ts) and is not used here for that reason.
      rttLabel: 'End-to-End LEO RTT',
      rttMs: leoGeometry?.rttTotalMs ?? null,
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
    ? formatResolvedGatewayRoleLabel(resolvedGateway)
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
  selectedLeoTerminalProfile?: LeoTerminalProfile | null;
  geoTerminalType?: TerminalType;
  geoCoverage?: CandidateCoverage | null;
  beamLoadResult?: BeamLoadResult | null;
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
  selectedLeoTerminalProfile,
  geoTerminalType = 'fixed',
  geoCoverage = null,
  beamLoadResult = null,
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
  const leoTruth = engineeringTruths.LEO;
  const geoTruth = engineeringTruths.GEO;
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

  // Canonical provenance model — the single source of truth shared by this PDF
  // export and the in-app verdict summary (see buildDataProvenance).
  const provenanceSatellite = preferLeo ? resolvedLEOConnectivity?.satellite : resolvedGEOConnectivity?.satellite;
  const terminalProvenance: DataProvenanceDescriptor = preferLeo && selectedLeoTerminalProfile
    ? {
        source: `${selectedLeoTerminalProfile.vendor} ${selectedLeoTerminalProfile.model} · ${selectedLeoTerminalProfile.sourceLabel}`,
        nature: terminalNatureFromLeoSource(selectedLeoTerminalProfile.sourceType),
        asOf: null,
        note: selectedLeoTerminalProfile.sourceType === 'OFFICIAL_DATASHEET'
          ? 'Public terminal specification'
          : selectedLeoTerminalProfile.sourceType === 'ENGINEERING_ESTIMATE'
            ? 'Public references supplemented by engineering assumptions'
            : 'Representative generic planning profile',
      }
    : {
        source: `Capacity Analyzer GEO terminal assumption · ${TERMINAL_PROFILES[geoTerminalType].label}`,
        nature: 'estimated',
        asOf: null,
        note: 'Representative planning profile, not a selected equipment datasheet',
      };
  const coverageFrequency: DataProvenanceDescriptor | undefined = !preferLeo && geoCoverage
    ? {
        source: `${geoCoverage.isSynthesized ? 'Synthesized GEO coverage' : 'Public GEO coverage contour'} · ${geoCoverage.satelliteName} · ${geoCoverage.coverageName}`,
        nature: geoCoverage.isSynthesized ? 'estimated' : 'published',
        asOf: null,
        note: geoCoverage.isSynthesized
          ? `Missing directional contour inferred from ${geoCoverage.syntheticSource ?? 'the opposite-direction coverage'}`
          : 'Public, non-operational planning reference',
      }
    : undefined;
  const capacityLoad: DataProvenanceDescriptor = preferLeo && beamLoadResult
    ? {
        source: `Network Load model · ${beamLoadResult.loadSource}`,
        nature: 'modeled',
        asOf: beamLoadResult.fillRateSourceDate ?? null,
        note: `${beamLoadResult.loadDataMode}; simulated user load, not live subscriber telemetry`,
      }
    : {
        source: preferLeo ? 'Simulation engine (5-pillar model)' : 'GEO link-budget and capacity model',
        nature: 'modeled',
        asOf: null,
        note: 'Computed for this analysis; no live operational load telemetry',
      };
  const dataProvenance = buildDataProvenance({
    architecture: preferLeo ? 'LEO' : 'GEO',
    satelliteName: provenanceSatellite?.name ?? null,
    tleEpochAsOf: provenanceSatellite?.tleEpochMs ?? null,
    coverageFrequency,
    capacityLoad,
    terminal: terminalProvenance,
    weatherLabel: formatWeatherLabel(weatherType),
  });

  return {
    location: {
      lat: activePoint.lat,
      lng: activePoint.lng,
      name: [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ') || undefined
    },
    scope: satelliteScope,
    leoData: resolvedLEOConnectivity ? {
      name: resolvedLEOConnectivity.satellite.name,
      serviceState: leoTruth?.state ?? 'incomplete',
      serviceReason: leoTruth?.headline,
      elevation: Number.isFinite(resolvedLEOConnectivity.userLEOElevation) ? resolvedLEOConnectivity.userLEOElevation : null,
      rtt: resolvedLEOConnectivity.snp
        ? (leoGeometry?.rttTotalMs ?? (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
        : null,
      downlinkGbps: leoDownlinkMbps != null && leoDownlinkMbps > 0 ? leoDownlinkMbps / 1000 : null,
      uplinkGbps: leoUplinkMbps != null && leoUplinkMbps > 0 ? leoUplinkMbps / 1000 : null,
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
      serviceState: geoTruth?.state ?? 'incomplete',
      serviceReason: geoTruth?.headline,
      elevation: geoGeometry?.userToSatellite.elevationDeg ?? null,
      rtt: geoGeometry?.rttTotalMs ?? null,
      downlinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse' || geoForwardMbps == null || geoForwardMbps <= 0 ? null : geoForwardMbps / 1000,
      uplinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse'
        ? (geoForwardMbps != null && geoForwardMbps > 0 ? geoForwardMbps / 1000 : null)
        : null,
      stability: (() => {
        return geoGeometry?.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? 'Unstable';
      })(),
      distance: geoGeometry?.userToSatellite.slantRangeKm ?? null,
      radioPath: `${userLabel} → ${resolvedGEOConnectivity.satellite.name} → ${userLabel}`
    } : null,
    leoDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
    geoDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
    evidenceSummary,
    dataProvenance,
    globeRef,
    cesiumViewerRef,
  };
}

/** Human-readable weather label from the raw weather type (decoupled from COMM). */
function formatWeatherLabel(weatherType: WeatherType): string {
  const spaced = String(weatherType).replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function terminalNatureFromLeoSource(sourceType: LeoTerminalProfile['sourceType']): DataNature {
  if (sourceType === 'OFFICIAL_DATASHEET') return 'published';
  if (sourceType === 'ENGINEERING_ESTIMATE') return 'estimated';
  return 'estimated';
}
