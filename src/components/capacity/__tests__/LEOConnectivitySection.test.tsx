import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LEOConnectivitySection from '../LEOConnectivitySection';
import type { LeoThroughputLeg, LeoThroughputResult } from '../../../types/leoThroughput';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import type { SatelliteData } from '../../../types/satellites';
import { buildPredictionConfidence, positiveFactor, missingFactor } from '../../../utils/predictionConfidence';
import { buildLeoEngineeringAnalysisViewModel } from '../../../utils/engineeringAnalysisViewModel';
import { EngineeringFocusProvider, type EngineeringFocusController } from '../../../contexts/EngineeringFocusContext';
import { createEngineeringFocus } from '../../../utils/engineeringFocusModel';

// Regression tripwire for the 2 LEO topology branches (SINGLE_SITE,
// SITE_TO_SITE). Smoke-tests only: assert the component renders without
// throwing for each topology and that the summary card's Final DL/UL/
// bottleneck KPIs reflect the supplied fixture. Not a refactor — written
// ahead of extracting the duplicated LatencyBreakdownCard/LayerHeading
// sub-components so a future extraction has something to fail against if it
// breaks a topology.

const terminal = {
  id: 'ow70l',
  label: 'OW70L',
  terminalFamily: 'fixed',
  vendor: 'OneWeb',
  model: 'OW70L',
  description: 'Test terminal',
  category: 'fixed',
  antennaType: 'ESA',
  mobilityClass: 'fixed',
  maxDlMbps: 200,
  maxUlMbps: 50,
  rxGtDbK: 12,
  txEirpDbw: 35,
  rxScanLossModelLabel: 'cosine',
  txScanLossModelLabel: 'cosine',
  dlReferenceBandwidthHz: 50_000_000,
  ulReferenceBandwidthHz: 25_000_000,
  dlUsableBeamBandwidthHz: 250_000_000,
  ulUsableBeamBandwidthHz: 125_000_000,
  sourceType: 'test',
  sourceLabel: 'Test',
  notes: [],
  assumptions: [],
  certificationStatus: 'test',
  supportedBands: ['Ku'],
} as const;

const makeLeoLeg = (
  direction: 'downlink' | 'uplink',
  finalUserMbps: number,
  overrides: Partial<LeoThroughputLeg['network']> = {},
): LeoThroughputLeg => ({
  direction,
  label: direction === 'downlink' ? 'Downlink' : 'Uplink',
  rf: {
    effectiveEirpDb: 46,
    receiverGtDbK: 12,
    rawTerminalRfDb: 12,
    terminalScanLossDb: -1,
    scanLossDb: -1,
    weatherLossDb: 0.5,
    fsplDb: 158,
    cnDb: finalUserMbps <= 0 ? 8 : 24,
    modcod: finalUserMbps <= 0 ? null : '16APSK 3/4',
    modcodTableId: 'test',
    modcodTableLabel: 'Test MODCOD',
    modcodTableSourceNote: 'Test',
    slantRangeKm: 1100,
    referenceBandwidthHz: 50_000_000,
    usableBandwidthHz: 50_000_000,
    rfChainThroughputMbps: finalUserMbps <= 0 ? 0 : 187,
  },
  network: {
    peakRfMbps: finalUserMbps <= 0 ? 0 : 187,
    terminalCapMbps: direction === 'downlink' ? 200 : 50,
    activeUsers: 14,
    beamSharingMbps: finalUserMbps <= 0 ? 0 : 36,
    feederCapacityMbps: 930,
    feederMarginDb: 11.5,
    feederLimited: false,
    handoverFactor: 1,
    handoverMbps: finalUserMbps <= 0 ? 0 : 32,
    smoothingAlpha: 0.3,
    finalUserMbps,
    bottleneck: finalUserMbps <= 0 ? 'rf' : 'beam sharing',
    ...overrides,
  },
});

const makeLeoResult = (finalDownlinkMbps = 18, finalUplinkMbps = 12, satelliteId = 'ONEWEB-TEST'): LeoThroughputResult => {
  const factor = finalDownlinkMbps <= 0 || finalUplinkMbps <= 0 ? 'rf' : null;
  return {
    satelliteId,
    selectedBeamIndex: 7,
    candidateBeamCount: 3,
    normalizedDistance: 0.32,
    userElevationDeg: 54,
    snpElevationDeg: 38,
    limitingElevationDeg: 38,
    terminal,
    downlink: makeLeoLeg('downlink', finalDownlinkMbps, { bottleneck: factor }),
    uplink: makeLeoLeg('uplink', finalUplinkMbps, { bottleneck: factor }),
    mainBottleneck: {
      factor,
      scope: factor ? 'DL' : 'none',
      label: factor === 'rf' ? 'DL RF' : 'None',
    },
  };
};

const makeSatellite = (name: string, overrides: Partial<SatelliteData> = {}): SatelliteData => ({
  id: name,
  name,
  noradId: name,
  coverageFileId: null,
  type: 'ONEWEB',
  orbitType: 'LEO',
  opsStatus: 'operational',
  satrec: {} as any,
  position: { lat: 10, lng: 20, alt: 1200, isPositionValid: true },
  capacity: {
    maxThroughput: 200,
    bandwidth: { ku: 200, ka: 0 },
    availability: 0.99,
  },
  referenced_coverages: { type: 'FeatureCollection', features: [] } as any,
  coverages: [],
  ...overrides,
});

const testConfidence = buildPredictionConfidence({
  architecture: 'LEO',
  topology: 'Site-to-Site',
  mode: 'ENG',
  factors: [
    positiveFactor('satellites', 'Serving satellites resolved', 18, 'Both endpoints have a serving satellite'),
    missingFactor('regulatory', 'Regulatory evidence', 'Regulatory status unavailable'),
  ],
});

const makeSiteToSiteResult = (overrides: Partial<LeoSiteToSiteResult> = {}): LeoSiteToSiteResult => ({
  endpointA: { lat: 10, lng: 20 },
  endpointB: { lat: 15, lng: 25 },
  servingSatelliteA: makeSatellite('ONEWEB-A'),
  servingSatelliteB: makeSatellite('ONEWEB-B'),
  rfAvailableA: true,
  rfAvailableB: true,
  selectedSnpA: { id: 'fairbanks', name: 'Fairbanks', lat: 64.84, lng: -147.72, region: 'Americas', status: 'active' },
  selectedSnpB: { id: 'svalbard', name: 'Svalbard', lat: 78.22, lng: 15.65, region: 'Europe', status: 'active' },
  regulatoryResultA: null,
  regulatoryResultB: null,
  failureReason: null,
  serviceStatus: 'ALLOWED',
  logicalPop: { name: 'Ashburn', lat: 39.04, lng: -77.49, region: 'Americas' },
  userLinkLatencyAms: 4,
  userLinkLatencyBms: 4,
  feederLatencyAms: 3,
  feederLatencyBms: 3,
  backboneDistanceKm: 6000,
  backboneOneWayLatencyMs: 36,
  processingMarginMs: 5,
  handoverRiskMarginMs: 0,
  oneWayLatencyAtoBMs: 60,
  oneWayLatencyBtoAMs: 60,
  rttMs: 120,
  accessThroughputAtoBMbps: 80,
  accessThroughputBtoAMbps: 60,
  finalThroughputAtoBMbps: 75,
  finalThroughputBtoAMbps: 55,
  userLinkDistanceAKm: 1100,
  feederDistanceAKm: 900,
  userLinkDistanceBKm: 1100,
  feederDistanceBKm: 900,
  elevationADeg: 45,
  elevationBDeg: 40,
  expectedHandoversA: 1,
  expectedHandoversB: 1,
  passWindowA: null,
  passWindowB: null,
  pathStability: 'High',
  confidenceLevel: 'High',
  confidenceScore: 82,
  confidenceReasons: ['Both endpoints resolved'],
  predictionConfidence: testConfidence,
  serviceAvailable: true,
  debugSiteA: null,
  debugSiteB: null,
  ...overrides,
});

const noop = () => undefined;

const rfFocusController: EngineeringFocusController = {
  truths: {},
  focus: createEngineeringFocus('locked', 'LEO', 'rf', 'lens'),
  lensPosture: 'reasoning',
  surfaceMode: 'result',
  preview: noop,
  lock: noop,
  clearPreview: noop,
  clear: noop,
  setLensPosture: noop,
  setSurfaceMode: noop,
};

const renderLeoRfEvidence = (content: ReactNode) => renderToStaticMarkup(
  <EngineeringFocusProvider controller={rfFocusController} truths={{}}>
    {content}
  </EngineeringFocusProvider>,
);

const baseProps = {
  engineeringAnalysisViewModel: buildLeoEngineeringAnalysisViewModel({
    debugInfo: makeLeoResult(18, 12),
    topology: 'SINGLE_SITE',
    latencyMs: 72,
    confidenceLabel: 'High 90/100',
    scenarioComplete: true,
    pathResolved: true,
    rfStatus: 'available',
  }),
  resolvedLEOConnectivity: null,
  leoGeometry: null,
  leoPerformance: null,
  mobileLeoMetrics: null,
  activePoint: null,
  terminalType: 'fixed' as const,
  onTerminalTypeChange: noop,
  weatherType: 'clear' as const,
  onWeatherTypeChange: noop,
  autoWeatherEnabled: false,
  onAutoWeatherChange: noop,
  failedSnps: new Set<string>(),
  hsBeamsSet: new Set<number>(),
  weatherCondition: 'CLEAR' as const,
  beamHealthFactors: [],
};

/** True when the nearest <details> tag preceding `text` carries the `open` attribute. */
const detailsOpenStateBeforeText = (html: string, text: string): boolean => {
  const textIndex = html.indexOf(text);
  const detailsIndex = html.lastIndexOf('<details', textIndex);
  const tagEnd = html.indexOf('>', detailsIndex);
  const tag = html.slice(detailsIndex, tagEnd);
  return /\sopen(=|\s|>|$)/.test(tag);
};

describe('LEOConnectivitySection topology render smoke tests', () => {
  it.each([
    ['incomplete', buildLeoEngineeringAnalysisViewModel({ debugInfo: null, topology: 'SITE_TO_SITE', scenarioComplete: false, scenarioIncompleteReason: 'Site B is required' })],
    ['path-unavailable', buildLeoEngineeringAnalysisViewModel({ debugInfo: null, scenarioComplete: true, pathResolved: false })],
    ['budget-unavailable', buildLeoEngineeringAnalysisViewModel({ debugInfo: null, scenarioComplete: true, pathResolved: true, rfStatus: 'unavailable' })],
    ['blocked', buildLeoEngineeringAnalysisViewModel({ debugInfo: makeLeoResult(18, 12), scenarioComplete: true, pathResolved: true, rfStatus: 'blocked', rfReason: 'No active RF beam' })],
  ])('renders the %s boundary without downstream service sections', (_state, engineeringAnalysisViewModel) => {
    const html = renderToStaticMarkup(<LEOConnectivitySection {...baseProps} engineeringAnalysisViewModel={engineeringAnalysisViewModel} />);
    expect(html).toContain('Review · LEO result');
    expect(html).not.toContain('Access Layer');
    expect(html).not.toContain('Estimated Performance');
  });

  it('renders SINGLE_SITE with Final DL/UL throughput and bottleneck', () => {
    const html = renderToStaticMarkup(
      <LEOConnectivitySection
        {...baseProps}
        leoTopologyMode="SINGLE_SITE"
        leoPerformance={{
          rtt: 72,
          downlinkGbps: 0.018,
          uplinkGbps: 0.012,
          stability: 'High',
          performanceFactor: 1,
          footprintFactor: 1,
          weatherFactor: 1,
          weatherLabel: 'Clear',
          debugInfo: makeLeoResult(18, 12),
        }}
      />
    );

    expect(html).toContain('18 Mbps');
    expect(html).toContain('12 Mbps');
  });

  it('renders SINGLE_SITE blocked tone when downlink/uplink cannot close', () => {
    const html = renderToStaticMarkup(
      <LEOConnectivitySection
        {...baseProps}
        engineeringAnalysisViewModel={buildLeoEngineeringAnalysisViewModel({
          debugInfo: makeLeoResult(0, 0),
          topology: 'SINGLE_SITE',
          scenarioComplete: true,
          pathResolved: true,
          rfStatus: 'blocked',
          rfReason: 'RF closure failed',
        })}
        leoTopologyMode="SINGLE_SITE"
        leoPerformance={{
          rtt: 72,
          downlinkGbps: 0,
          uplinkGbps: 0,
          stability: 'Low',
          performanceFactor: 0,
          footprintFactor: 1,
          weatherFactor: 1,
          weatherLabel: 'Storm',
          debugInfo: makeLeoResult(0, 0),
        }}
      />
    );

    expect(html).toContain('Service blocked');
  });

  it('renders SINGLE_SITE without throwing when no satellite/beam is resolved yet', () => {
    expect(() => renderToStaticMarkup(
      <LEOConnectivitySection {...baseProps} leoTopologyMode="SINGLE_SITE" />
    )).not.toThrow();
  });

  it('renders SITE_TO_SITE with only the active direction as the primary throughput', () => {
    const html = renderToStaticMarkup(
      <LEOConnectivitySection
        {...baseProps}
        leoTopologyMode="SITE_TO_SITE"
        engineeringAnalysisViewModel={buildLeoEngineeringAnalysisViewModel({
          debugInfo: makeLeoResult(75, 55),
          siteToSiteResult: makeSiteToSiteResult(),
          topology: 'SITE_TO_SITE',
          latencyMs: 60,
          latencyLabel: 'A → B latency',
          confidenceLabel: 'High 90/100',
          scenarioComplete: true,
          pathResolved: true,
          rfStatus: 'available',
        })}
        pointBLeo={{ lat: 15, lng: 25 }}
        activeMeshTab="forward"
        siteToSiteResult={makeSiteToSiteResult()}
        leoPerformance={{
          rtt: 120,
          downlinkGbps: 0.075,
          uplinkGbps: 0.055,
          stability: 'High',
          performanceFactor: 1,
          footprintFactor: 1,
          weatherFactor: 1,
          weatherLabel: 'Clear',
          debugInfo: makeLeoResult(75, 55),
        }}
      />
    );

    expect(html).toContain('75 Mbps');
    const resultHtml = html.slice(html.indexOf('Review · LEO result'));
    expect(resultHtml).not.toContain('55 Mbps');
  });

  it('renders SITE_TO_SITE without throwing when the route is structurally incomplete', () => {
    expect(() => renderToStaticMarkup(
      <LEOConnectivitySection
        {...baseProps}
        leoTopologyMode="SITE_TO_SITE"
        pointBLeo={{ lat: 15, lng: 25 }}
        siteToSiteResult={makeSiteToSiteResult({
          serviceAvailable: false,
          failureReason: 'RF_UNAVAILABLE_A',
          finalThroughputAtoBMbps: null,
          finalThroughputBtoAMbps: null,
        })}
      />
    )).not.toThrow();
  });

  it('renders SITE_TO_SITE without throwing before Site B has been placed', () => {
    expect(() => renderToStaticMarkup(
      <LEOConnectivitySection {...baseProps} leoTopologyMode="SITE_TO_SITE" />
    )).not.toThrow();
  });

  describe('Level 4 detailed investigation drawer', () => {
    it('SINGLE_SITE: shows Site A and Terminal investigation sections collapsed by default', () => {
      const html = renderLeoRfEvidence(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SINGLE_SITE"
          leoPerformance={{
            rtt: 72,
            downlinkGbps: 0.018,
            uplinkGbps: 0.012,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(18, 12),
          }}
        />
      );

      expect(html).toContain('Site A Investigation');
      expect(html).toContain('Terminal Investigation');
      expect(html).not.toContain('Site B Investigation');
      expect(html).not.toContain('Backbone Investigation');
      expect(detailsOpenStateBeforeText(html, 'Site A Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Terminal Investigation')).toBe(false);
      expect(html).toContain('Show details');
      expect(html).toContain('Hide details');
      expect(html).not.toContain('>Open</span>');
      expect(html).not.toContain('>Collapse</span>');
    });

    it('SITE_TO_SITE: shows Site A, Site B, Backbone and Terminal investigation sections collapsed by default', () => {
      const html = renderLeoRfEvidence(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SITE_TO_SITE"
          engineeringAnalysisViewModel={buildLeoEngineeringAnalysisViewModel({
            debugInfo: makeLeoResult(75, 55),
            siteToSiteResult: makeSiteToSiteResult(),
            topology: 'SITE_TO_SITE',
            latencyMs: 60,
            latencyLabel: 'A → B latency',
            confidenceLabel: 'High 90/100',
            scenarioComplete: true,
            pathResolved: true,
            rfStatus: 'available',
          })}
          pointBLeo={{ lat: 15, lng: 25 }}
          activeMeshTab="forward"
          siteToSiteResult={makeSiteToSiteResult()}
          leoPerformance={{
            rtt: 120,
            downlinkGbps: 0.075,
            uplinkGbps: 0.055,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(75, 55),
          }}
        />
      );

      expect(html).toContain('Site A Investigation');
      expect(html).toContain('Site B Investigation');
      expect(html).toContain('Backbone Investigation');
      expect(html).toContain('Terminal Investigation');
      expect(detailsOpenStateBeforeText(html, 'Site A Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Site B Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Backbone Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Terminal Investigation')).toBe(false);
    });

    it('SINGLE_SITE: keeps Terminal Investigation collapsed when terminal is the detected bottleneck', () => {
      const html = renderLeoRfEvidence(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SINGLE_SITE"
          leoPerformance={{
            rtt: 72,
            downlinkGbps: 0.018,
            uplinkGbps: 0.012,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: {
              ...makeLeoResult(18, 12),
              mainBottleneck: { factor: 'terminal', scope: 'DL', label: 'Terminal cap' },
            } as LeoThroughputResult,
          }}
        />
      );

      expect(detailsOpenStateBeforeText(html, 'Site A Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Terminal Investigation')).toBe(false);
    });

    it('SITE_TO_SITE: keeps Site B Investigation collapsed when failureReason ends with _B', () => {
      const html = renderLeoRfEvidence(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SITE_TO_SITE"
          pointBLeo={{ lat: 15, lng: 25 }}
          activeMeshTab="forward"
          siteToSiteResult={makeSiteToSiteResult({
            // serviceAvailable must stay true so the drawer receives siteToSiteResult
            // (LEOConnectivitySection passes undefined when !s2sServiceActive)
            failureReason: 'CAPACITY_DEGRADED_B',
          })}
          leoPerformance={{
            rtt: 120,
            downlinkGbps: 0.075,
            uplinkGbps: 0.055,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(75, 55),
          }}
        />
      );

      expect(detailsOpenStateBeforeText(html, 'Site A Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Site B Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Backbone Investigation')).toBe(false);
    });

    it('SITE_TO_SITE: keeps Backbone Investigation collapsed when the feeder is the detected bottleneck', () => {
      const feederDebug = {
        ...makeLeoResult(10, 8),
        mainBottleneck: { factor: 'feeder' as const, scope: 'DL' as const, label: 'DL feeder' },
      } as LeoThroughputResult;
      const html = renderLeoRfEvidence(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SITE_TO_SITE"
          pointBLeo={{ lat: 15, lng: 25 }}
          activeMeshTab="forward"
          siteToSiteResult={makeSiteToSiteResult({ debugSiteA: feederDebug })}
          leoPerformance={{
            rtt: 120,
            downlinkGbps: 0.010,
            uplinkGbps: 0.008,
            stability: 'Medium',
            performanceFactor: 0.5,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(10, 8),
          }}
        />
      );

      expect(detailsOpenStateBeforeText(html, 'Site A Investigation')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Backbone Investigation')).toBe(false);
    });
  });

  describe('authoritative result (above-the-fold summary)', () => {
    it('SINGLE_SITE: renders before proof content and keeps configuration out of the result surface', () => {
      const html = renderToStaticMarkup(
        <LEOConnectivitySection
          {...baseProps}
          leoTopologyMode="SINGLE_SITE"
          leoPerformance={{
            rtt: 72,
            downlinkGbps: 0.018,
            uplinkGbps: 0.012,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(18, 12),
          }}
        />
      );

      expect(html).toContain('Review · LEO result');
      expect(html).not.toContain('Space Segment');
      expect(html).not.toContain('Access Layer');
      expect(html).not.toContain('Site ↔ LEO ↔ SNP');
      expect(html).toContain('Service available');
      expect(html).toContain('Why this result');
      expect(html).toMatch(/\d+\/100/);

      const resultHtml = html.slice(html.indexOf('Review · LEO result'));
      expect(resultHtml).toContain('18 Mbps');
    });

    it('SITE_TO_SITE: shows direction-aware latency in the Answer Block, not only in End-to-End Analysis', () => {
      const html = renderToStaticMarkup(
        <LEOConnectivitySection
          {...baseProps}
          engineeringAnalysisViewModel={buildLeoEngineeringAnalysisViewModel({
            debugInfo: makeLeoResult(75, 55),
            siteToSiteResult: makeSiteToSiteResult(),
            topology: 'SITE_TO_SITE',
            latencyMs: 60,
            latencyLabel: 'A → B latency',
            confidenceLabel: 'High 90/100',
            scenarioComplete: true,
            pathResolved: true,
            rfStatus: 'available',
          })}
          leoTopologyMode="SITE_TO_SITE"
          pointBLeo={{ lat: 15, lng: 25 }}
          activeMeshTab="forward"
          siteToSiteResult={makeSiteToSiteResult()}
          leoPerformance={{
            rtt: 120,
            downlinkGbps: 0.075,
            uplinkGbps: 0.055,
            stability: 'High',
            performanceFactor: 1,
            footprintFactor: 1,
            weatherFactor: 1,
            weatherLabel: 'Clear',
            debugInfo: makeLeoResult(75, 55),
          }}
        />
      );

      const resultHtml = html.slice(html.indexOf('Review · LEO result'));
      expect(resultHtml).toContain('75 Mbps');
      expect(resultHtml).toContain('60.0 ms');
    });

    it('presents service evidence as readable labels without exposing implementation status tokens', () => {
      const html = renderToStaticMarkup(
        <LEOConnectivitySection
          {...baseProps}
          engineeringAnalysisViewModel={buildLeoEngineeringAnalysisViewModel({
            debugInfo: makeLeoResult(18, 12),
            topology: 'SINGLE_SITE',
            scenarioComplete: true,
            pathResolved: true,
            rfStatus: 'available',
            serviceStatus: 'ALLOWED',
            serviceReason: 'CONNECTED',
            serviceEvidence: [
              { label: 'Regulatory · Site A', value: 'ALLOWED_CONFIRMED', state: 'passed' },
              { label: 'Regulatory · Site B', value: 'ALLOWED_ESTIMATED', state: 'passed' },
            ],
          })}
        />
      );

      expect(html).toContain('Allowed · confirmed');
      expect(html).toContain('Allowed · estimated');
      expect(html).not.toContain('ALLOWED_CONFIRMED');
      expect(html).not.toContain('ALLOWED_ESTIMATED');
      expect(html).not.toContain('CONNECTED');
    });

    it('Radio Path defaults to collapsed, matching GEO', () => {
      const html = renderToStaticMarkup(
        <LEOConnectivitySection {...baseProps} leoTopologyMode="SINGLE_SITE" />
      );

      expect(html).not.toContain('No valid LEO/SNP connectivity for this location.');
    });
  });
});
