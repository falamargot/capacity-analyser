import { describe, expect, it } from 'vitest';
import {
  buildEngineeringExportPayload,
  buildGeoPdfDetails,
  buildLeoPdfDetails,
  type GeoPerformanceEstimate,
} from '../engineeringExportPayload';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  type EngineeringTruthSet,
} from '../engineeringAnalysisViewModel';
import { makeGeoResult, makeLeoResult } from './fixtures/engineeringViewModelFixtures';
import { getLeoTerminalProfile } from '../../config/leoTerminals';
import type { SatelliteData } from '../../types/satellites';
import type { GEOGeometry, ResolvedGEOConnectivity, ResolvedLEOConnectivity } from '../../components/capacity';

/**
 * M2.C golden freeze of the PDF/export payload contract (deferred from M0
 * until the pure seam existed). Any intentional change to the exported
 * document content must show up as a reviewed snapshot diff.
 */

const leoSatellite = { name: 'ONEWEB-0123' } as SatelliteData;
const geoSatellite = { name: 'EUTELSAT TEST' } as SatelliteData;

const resolvedLeo: ResolvedLEOConnectivity = {
  satellite: leoSatellite,
  snp: { name: 'Svalbard', lat: 78.23, lng: 15.39 },
  userLEOElevation: 54.2,
  snpLEOElevation: 38.6,
  userLEODistance: 1204,
  snpLEODistance: 1420,
  connectedBeamIndex: 7,
  candidateBeamCount: 3,
} as ResolvedLEOConnectivity;

const leoGeometry = {
  oneWayRadioMs: 9.1,
  rttPropagationMs: 18.2,
  rttTotalMs: 71.8,
  propagationBreakdownMs: {
    userToSatellite: 4.1,
    satelliteToGateway: 4.9,
    gatewayToSatellite: 4.9,
    satelliteToUser: 4.3,
  },
  overheadMs: {
    gatewayProcessing: 15,
    modemProcessing: 20,
    routing: 10,
    queueing: 8.6,
    total: 53.6,
  },
  warnings: [],
};

const leoPerformance = {
  rtt: 72,
  downlinkGbps: 0.018,
  uplinkGbps: 0.012,
  stability: 'High',
  performanceFactor: 0.62,
  weatherFactor: 0.95,
  weatherLabel: 'Clear sky',
  throughput: makeLeoResult(18, 12),
};

const mobileLeoMetrics = { rtt: 71.8, downlinkGbps: 0.018, uplinkGbps: 0.012 };

const resolvedGeo = {
  satellite: geoSatellite,
  candidate: { coverageName: 'Ku Europe' },
} as ResolvedGEOConnectivity;

const geoGeometry: GEOGeometry = {
  userToSatellite: { elevationDeg: 34.2, slantRangeKm: 38412, latencyMs: 128.1 },
  satelliteToGateway: { slantRangeKm: 37800, latencyMs: 126.1, gateway: { name: 'Rambouillet' }, resolvedGateway: null },
  oneWayRadioMs: 254.2,
  rttPropagationMs: 508.4,
  rttTotalMs: 548.4,
  propagationBreakdownMs: {
    userToSatellite: 128.1,
    satelliteToGateway: 126.1,
    gatewayToSatellite: 126.1,
    satelliteToUser: 128.1,
  },
  overheadMs: { gatewayProcessing: 15, modemProcessing: 20, routing: 5, total: 40 },
  warnings: [],
  isUserLinkUnstable: false,
};

const geoPerformance: GeoPerformanceEstimate = {
  downlinkGbps: 0.152,
  uplinkGbps: 0.048,
  stability: 'Medium',
  performanceFactor: 0.4,
  weatherFactor: 1,
  weatherLabel: 'Selected link budget',
};

const truths: EngineeringTruthSet = {
  GEO: buildGeoEngineeringAnalysisViewModel({
    linkMode: 'STAR_FORWARD',
    result: makeGeoResult(4.5),
    satelliteName: 'EUTELSAT TEST',
    latencyMs: 548,
    confidenceLabel: 'High 89/100',
    scenarioComplete: true,
    pathResolved: true,
  }).truth,
  LEO: buildLeoEngineeringAnalysisViewModel({
    debugInfo: makeLeoResult(18, 12),
    topology: 'SINGLE_SITE',
    latencyMs: 72,
    confidenceLabel: 'High 91/100',
    scenarioComplete: true,
    pathResolved: true,
    rfStatus: 'available',
    serviceStatus: 'ALLOWED',
  }).truth,
};

const leoPdfDetails = buildLeoPdfDetails({
  resolvedLEOConnectivity: resolvedLeo,
  selectedLeoTerminalProfile: getLeoTerminalProfile('fixed'),
  leoPerformance,
  leoGeometry: leoGeometry as never,
  mobileLeoMetrics,
});

const geoPdfDetails = buildGeoPdfDetails({
  resolvedGEOConnectivity: resolvedGeo,
  geoGeometry,
  geoTerminalType: 'fixed',
  geoPerformance,
});

describe('M2 export payload golden', () => {
  it('freezes the LEO PDF details contract', () => {
    expect(leoPdfDetails).toMatchSnapshot();
  });

  it('freezes the LEO PDF details no-SNP fallback', () => {
    expect(buildLeoPdfDetails({
      resolvedLEOConnectivity: { ...resolvedLeo, snp: null, snpLEOElevation: null, snpLEODistance: null },
      selectedLeoTerminalProfile: getLeoTerminalProfile('fixed'),
      leoPerformance: null,
      leoGeometry: null,
      mobileLeoMetrics: null,
    })).toMatchSnapshot();
  });

  it('freezes the GEO PDF details contract', () => {
    expect(geoPdfDetails).toMatchSnapshot();
  });

  it('freezes the full export payload for an ALL-scope LEO-focused scenario', () => {
    expect(buildEngineeringExportPayload({
      activePoint: { lat: 48.86, lng: 2.35 },
      satelliteScope: 'ALL',
      activeConnTab: 'LEO',
      engineeringTruths: truths,
      weatherType: 'clear',
      nearestLocation: { city: 'Paris', country: 'France' },
      resolvedLEOConnectivity: resolvedLeo,
      leoGeometry: leoGeometry as never,
      leoPerformance,
      resolvedGEOConnectivity: resolvedGeo,
      geoGeometry,
      geoPerformance,
      linkMode: 'STAR_FORWARD',
      leoPdfDetails,
      geoPdfDetails,
    })).toMatchSnapshot();
  });

  it('freezes the GEO-scope star-return payload direction mapping', () => {
    expect(buildEngineeringExportPayload({
      activePoint: { lat: 48.86, lng: 2.35 },
      satelliteScope: 'GEO',
      activeConnTab: 'GEO',
      engineeringTruths: truths,
      weatherType: 'light_rain',
      nearestLocation: null,
      resolvedLEOConnectivity: null,
      leoGeometry: null,
      leoPerformance: null,
      resolvedGEOConnectivity: resolvedGeo,
      geoGeometry,
      geoPerformance,
      linkMode: 'STAR_RETURN',
      leoPdfDetails: null,
      geoPdfDetails,
    })).toMatchSnapshot();
  });

  it('returns null without an analysis point', () => {
    expect(buildEngineeringExportPayload({
      activePoint: null,
      satelliteScope: 'ALL',
      activeConnTab: 'LEO',
      engineeringTruths: truths,
      weatherType: 'clear',
      nearestLocation: null,
      resolvedLEOConnectivity: null,
      leoGeometry: null,
      leoPerformance: null,
      resolvedGEOConnectivity: null,
      geoGeometry: null,
      geoPerformance: null,
      linkMode: 'STAR_FORWARD',
      leoPdfDetails: null,
      geoPdfDetails: null,
    })).toBeNull();
  });
});
