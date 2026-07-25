import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import GEOConnectivitySection from '../GEOConnectivitySection';
import type { DualSegmentResult } from '../../../utils/geoDualSegmentBudget';
import type { LinkMode } from '../../../types/linkMode';
import type { TrafficTeleportCapability } from '../../../utils/geoGroundInfrastructure';
import type { CandidateCoverage } from '../../../types/analysis';
import type { SatelliteData } from '../../../types/satellites';
import { GEO_GATEWAYS } from '../../globe/GlobeConfig';
import { resolveStarTrafficGatewayForCoverage, type StarTrafficGatewaySelection } from '../../../utils/geoConnectivityModel';
import { buildGeoEngineeringAnalysisViewModel } from '../../../utils/engineeringAnalysisViewModel';
import { activeGeoServiceDirection, resolveGeoRouteDelivery } from '../../../utils/geoDeliveryChain';

/**
 * Builds the GEO truth the way the app does: the canonical delivery chain first,
 * then the view model as a projection of it. The builder no longer derives a rate
 * from the RF result on its own, so a test that wants published throughput must
 * run the chain, exactly like production.
 */
const buildGeoTruthViewModel = (
  args: Parameters<typeof buildGeoEngineeringAnalysisViewModel>[0],
) => {
  const isSiteToSite = args.linkMode === 'MESH' || args.linkMode === 'POINT_TO_POINT';
  const delivery = args.result
    ? resolveGeoRouteDelivery({
        linkMode: args.linkMode,
        forwardResult: isSiteToSite || args.linkMode === 'STAR_FORWARD' ? args.result : null,
        reverseResult: isSiteToSite || args.linkMode === 'STAR_RETURN' ? args.result : null,
        modemA: null,
        modemB: null,
      })
    : null;
  const active = delivery?.[activeGeoServiceDirection(args.linkMode, args.activeMeshTab)];
  return buildGeoEngineeringAnalysisViewModel({
    ...args,
    deliveredThroughputMbps: active?.throughputMbps ?? undefined,
    throughputEstimated: active?.isEstimatedCeiling,
    forwardThroughputMbps: delivery?.forward.throughputMbps ?? undefined,
    reverseThroughputMbps: delivery?.reverse.throughputMbps ?? undefined,
    forwardThroughputEstimated: delivery?.forward.isEstimatedCeiling,
    reverseThroughputEstimated: delivery?.reverse.isEstimatedCeiling,
  });
};
import { EngineeringFocusProvider, type EngineeringFocusController } from '../../../contexts/EngineeringFocusContext';
import { createEngineeringFocus } from '../../../utils/engineeringFocusModel';

// Regression tripwire for the 4 GEO link-mode topology branches
// (STAR_FORWARD, STAR_RETURN, MESH, POINT_TO_POINT). Smoke-tests only: assert
// the component renders without throwing for each topology and that the
// summary card's throughput/margin/bottleneck KPIs reflect the supplied
// fixture. Not a refactor — written ahead of extracting the duplicated
// LatencyBreakdownCard/LayerHeading sub-components so a future extraction
// has something to fail against if it breaks a topology.

const geoSegment = (marginDb: number, cnDb = 18) => ({
  source: { label: 'Gateway' },
  destination: { label: 'Site A' },
  candidate: {
    satelliteName: 'EUTELSAT TEST',
    coverageName: 'Ku Europe',
    elevation: 45,
    slantRangeKm: 37500,
  },
  effectiveCNDb: cnDb,
  effectiveLinkMarginDb: marginDb,
  adjustmentDb: 0,
});

const TRAFFIC_TELEPORT: TrafficTeleportCapability = {
  capabilityId: 'geo-rambouillet-traffic-teleport',
  siteId: 'geo-rambouillet',
  kind: 'TRAFFIC_TELEPORT',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: ['*'],
  trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
  rfCapabilities: [],
  eligibleServiceClasses: ['STAR_FORWARD', 'STAR_RETURN'],
};

/** STAR_FORWARD / STAR_RETURN fixture — no reverse leg, no network layer reverse. */
const makeStarResult = (
  marginDb: number,
  trafficTeleportLabel = 'Rambouillet',
  trafficTeleportCapability: TrafficTeleportCapability = TRAFFIC_TELEPORT,
): DualSegmentResult => ({
  forward: {
    uplink: geoSegment(marginDb, marginDb < 0 ? 8 : 18),
    downlink: geoSegment(marginDb + 1, marginDb < 0 ? 14 : 20),
    endToEnd: {
      uplinkCNDb: marginDb < 0 ? 8 : 18,
      downlinkCNDb: marginDb < 0 ? 14 : 20,
      endToEndCNDb: marginDb < 0 ? 7 : 16,
      limitingSegment: marginDb < 0 ? 'uplink' : 'downlink',
      endToEndModcod: marginDb < 0 ? 'QPSK 1/4' : '16APSK 3/4',
      endToEndSpectralEfficiency: marginDb < 0 ? 0.49 : 2.7,
      endToEndThroughputMbps: marginDb < 0 ? 0 : 187,
      endToEndLinkMarginDb: marginDb,
      bandwidthMhz: 72,
    },
  },
  trafficTeleportEndpoint: {
    label: trafficTeleportLabel,
    capability: trafficTeleportCapability,
  },
  networkLayer: {
    forward: {
      peakRfMbps: marginDb < 0 ? 0 : 187,
      protocolEfficiency: 0.92,
      protocolAdjustedMbps: marginDb < 0 ? 0 : 172,
      contentionRatio: marginDb < 0 ? 1 : 4.2,
      finalThroughputMbps: marginDb < 0 ? 0 : 18,
      limitingFactor: marginDb < 0 ? 'rf_margin' : 'shared_capacity',
    },
  },
} as unknown as DualSegmentResult);

/** MESH / POINT_TO_POINT fixture — both forward and reverse legs populated. */
const makeMeshResult = (forwardMarginDb: number, reverseMarginDb: number): DualSegmentResult => ({
  forward: {
    uplink: geoSegment(forwardMarginDb, 18),
    downlink: geoSegment(forwardMarginDb + 1, 20),
    endToEnd: {
      uplinkCNDb: 18,
      downlinkCNDb: 20,
      endToEndCNDb: 16,
      limitingSegment: 'downlink',
      endToEndModcod: '16APSK 3/4',
      endToEndSpectralEfficiency: 2.7,
      endToEndThroughputMbps: 187,
      endToEndLinkMarginDb: forwardMarginDb,
      bandwidthMhz: 72,
    },
  },
  reverse: {
    uplink: geoSegment(reverseMarginDb, 18),
    downlink: geoSegment(reverseMarginDb + 1, 20),
    endToEnd: {
      uplinkCNDb: 18,
      downlinkCNDb: 20,
      endToEndCNDb: 16,
      limitingSegment: 'uplink',
      endToEndModcod: '16APSK 3/4',
      endToEndSpectralEfficiency: 2.7,
      endToEndThroughputMbps: 150,
      endToEndLinkMarginDb: reverseMarginDb,
      bandwidthMhz: 72,
    },
  },
  transponderMode: 'BENT_PIPE',
  networkLayer: {
    forward: {
      peakRfMbps: 187,
      protocolEfficiency: 1,
      protocolAdjustedMbps: 187,
      contentionRatio: 1,
      finalThroughputMbps: 92,
      limitingFactor: 'none',
    },
    reverse: {
      peakRfMbps: 150,
      protocolEfficiency: 1,
      protocolAdjustedMbps: 150,
      contentionRatio: 1,
      finalThroughputMbps: 74,
      limitingFactor: 'none',
    },
  },
} as unknown as DualSegmentResult);

const noop = () => undefined;

const rfFocusController: EngineeringFocusController = {
  truths: {},
  focus: createEngineeringFocus('locked', 'GEO', 'rf', 'lens'),
  preview: noop,
  lock: noop,
  clearPreview: noop,
  clear: noop,
  autoFocusCamera: true,
  setAutoFocusCamera: noop,
};

const renderGeoRfEvidence = (content: ReactNode) => renderToStaticMarkup(
  <EngineeringFocusProvider controller={rfFocusController} truths={{}}>
    {content}
  </EngineeringFocusProvider>,
);

const geoPathFocusController: EngineeringFocusController = {
  ...rfFocusController,
  focus: createEngineeringFocus('locked', 'GEO', 'path', 'lens'),
};

const renderGeoPathEvidence = (content: ReactNode) => renderToStaticMarkup(
  <EngineeringFocusProvider controller={geoPathFocusController} truths={{}}>
    {content}
  </EngineeringFocusProvider>,
);

const createGeoSatellite = (
  id: string,
  name: string,
  lng: number,
): SatelliteData => ({
  id,
  name,
  noradId: id,
  coverageFileId: id,
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as SatelliteData['satrec'],
  position: { lat: 0, lng, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 500, ka: 300, c: 200 },
    availability: 0.99,
  },
});

const createBeamCandidate = (
  satellite: SatelliteData,
  beamId: string,
  isUplink: boolean,
): CandidateCoverage => ({
  satelliteId: satellite.id,
  satelliteName: satellite.name,
  missionName: 'Ka-band',
  coverageKey: `${satellite.id}::${isUplink ? 'ul' : 'dl'}::${beamId}`,
  coverageName: `${satellite.name} ${isUplink ? 'uplink' : 'downlink'}`,
  beamId: `${satellite.id}::${beamId}`,
  beamName: beamId,
  elevation: 35,
  distanceFromBeamCenter: 100,
  throughputEstimate: 100,
  level: isUplink ? 8 : 55,
  isUplink,
  isSynthesized: false,
  eirpDbw: isUplink ? undefined : 55,
  gtDbk: isUplink ? 8 : undefined,
  band: 'Ka',
  frequencyGhz: isUplink ? 29 : 19,
  bandwidthMhz: 36,
  atmosphericLossDb: 1.5,
  slantRangeKm: 38000,
  fsplDb: 200,
  cn0Dbhz: 80,
  cnDb: 10,
  linkMarginDb: 8,
  modcod: '8PSK 3/4',
  spectralEfficiency: 2.23,
  latencyMs: 560,
  status: 'available',
  scoreBreakdown: {
    elevation: 0,
    linkMargin: 0,
    throughput: 0,
    latency: 0,
    total: 0,
  },
  score: 0,
});

const legacyRambouilletGateway = GEO_GATEWAYS.find((gateway) => gateway.teleportCode === 'RAM');
if (!legacyRambouilletGateway) throw new Error('Missing Rambouillet fixture');

const makeLegacyRambouilletGeoGeometry = () => ({
  satelliteToGateway: {
    gateway: legacyRambouilletGateway,
    resolvedGateway: {
      gatewayId: legacyRambouilletGateway.gateway_id,
      gatewayName: legacyRambouilletGateway.name,
      latitude: legacyRambouilletGateway.lat,
      longitude: legacyRambouilletGateway.lng,
      controlAssignmentRole: 'nominal',
      reason: 'legacy fixture',
      assignmentSource: 'reference-gateway-allocation',
      teleportCode: legacyRambouilletGateway.teleportCode,
      region: legacyRambouilletGateway.region,
      gateway: legacyRambouilletGateway,
      gatewayElevationDeg: 35,
      satToGatewayDistanceKm: 38000,
    },
    gatewayElevationDeg: 35,
    slantRangeKm: 38000,
    latencyMs: 126.8,
  },
  userToSatellite: {
    elevationDeg: 35,
    slantRangeKm: 38000,
    latencyMs: 126.8,
  },
  oneWayRadioMs: 253.6,
  propagationBreakdownMs: {
    userToSatellite: 126.8,
    satelliteToGateway: 126.8,
    gatewayToSatellite: 126.8,
    satelliteToUser: 126.8,
  },
  overheadMs: {
    gatewayProcessing: 8,
    modemProcessing: 12,
    routing: 10,
    total: 30,
  },
  rttTotalMs: 537.2,
  warnings: [],
  isUserLinkUnstable: false,
}) as any;

const makeResolvedGeoConnectivity = (satellite: SatelliteData, selectedCoverage: CandidateCoverage) => ({
  satellite,
  candidate: selectedCoverage,
  geometry: makeLegacyRambouilletGeoGeometry(),
}) as any;

const resolveSelection = (
  satellite: SatelliteData,
  beamId: string,
  linkMode: 'STAR_FORWARD' | 'STAR_RETURN' = 'STAR_FORWARD',
): {
  selection: StarTrafficGatewaySelection;
  selectedCoverage: CandidateCoverage;
} => {
  const selectedCoverage = createBeamCandidate(satellite, beamId, linkMode === 'STAR_RETURN');
  const selection = resolveStarTrafficGatewayForCoverage(satellite, selectedCoverage, GEO_GATEWAYS);
  if (!selection) throw new Error(`Missing STAR gateway selection for ${satellite.name} beam ${beamId}`);
  return { selection, selectedCoverage };
};

const renderGeoWithStarGateway = ({
  linkMode,
  satellite,
  beamId,
}: {
  linkMode: 'STAR_FORWARD' | 'STAR_RETURN';
  satellite: SatelliteData;
  beamId: string;
}) => {
  const { selection, selectedCoverage } = resolveSelection(satellite, beamId, linkMode);
  const result = makeStarResult(4.5, selection.gateway.name, selection.trafficCapability);
  return {
    selection,
    html: renderGeoRfEvidence(
      <GEOConnectivitySection
        {...baseProps}
        resolvedGEOConnectivity={makeResolvedGeoConnectivity(satellite, selectedCoverage)}
        geoGeometry={makeLegacyRambouilletGeoGeometry()}
        linkMode={linkMode}
        dualSegmentResult={result}
        starTrafficGatewaySelection={selection}
        selectedCoverage={selectedCoverage}
        selectedUplinkCoverage={linkMode === 'STAR_RETURN' ? selectedCoverage : null}
        selectedDownlinkCoverage={linkMode === 'STAR_FORWARD' ? selectedCoverage : null}
      />
    ),
  };
};

const baseProps = {
  engineeringAnalysisViewModel: buildGeoTruthViewModel({
    linkMode: 'STAR_FORWARD',
    result: makeStarResult(4.5),
    confidenceLabel: 'High 90/100',
    scenarioComplete: true,
    pathResolved: true,
  }),
  resolvedGEOConnectivity: null,
  geoGeometry: null,
  calculateGEOPerformance: () => ({
    downlinkGbps: 0,
    uplinkGbps: 0,
    stability: 'High',
    performanceFactor: 1,
    weatherFactor: 1,
    weatherLabel: 'Clear',
  }),
  terminalType: 'fixed' as const,
  onTerminalTypeChange: noop,
  weatherType: 'clear' as const,
  onWeatherTypeChange: noop,
  autoWeatherEnabled: false,
  onAutoWeatherChange: noop,
  candidateCoverages: [],
  bestCoverage: null,
  selectedCoverage: null,
};

const renderGeo = (linkMode: LinkMode, dualSegmentResult: DualSegmentResult | null) =>
  renderGeoRfEvidence(
    <GEOConnectivitySection
      {...baseProps}
      linkMode={linkMode}
      dualSegmentResult={dualSegmentResult}
      engineeringAnalysisViewModel={buildGeoTruthViewModel({
        linkMode,
        result: dualSegmentResult,
        confidenceLabel: 'High 90/100',
        latencyMs: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? 290 : 280,
        scenarioComplete: true,
        pathResolved: dualSegmentResult != null,
      })}
      pointB={linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? { lat: 10, lng: 20 } : null}
    />
  );

describe('GEOConnectivitySection topology render smoke tests', () => {
  it.each([
    ['incomplete', buildGeoEngineeringAnalysisViewModel({ linkMode: 'MESH', result: null, scenarioComplete: false, scenarioIncompleteReason: 'Site B is required' })],
    ['path-unavailable', buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: null, scenarioComplete: true, pathResolved: false })],
    ['budget-unavailable', buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: null, scenarioComplete: true, pathResolved: true })],
    ['blocked', buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: makeStarResult(-1.4), scenarioComplete: true, pathResolved: true })],
  ])('renders the %s boundary without downstream service sections', (_state, engineeringAnalysisViewModel) => {
    const html = renderToStaticMarkup(<GEOConnectivitySection {...baseProps} engineeringAnalysisViewModel={engineeringAnalysisViewModel} />);
    expect(html).toContain('Review · GEO result');
    expect(html).not.toContain('Access Layer');
    expect(html).not.toContain('Estimated Performance');
  });

  describe('beam-resolved STAR traffic gateway labels', () => {
    const kvhts = createGeoSatellite('53765', 'EUTELSAT KONNECT VHTS', 2.7);
    const e10b = createGeoSatellite('54259', 'EUTELSAT 10B', 10);

    it.each([
      ['STAR_FORWARD', kvhts, '29', 'Scanzano / Palermo'],
      ['STAR_RETURN', kvhts, '29', 'Scanzano / Palermo'],
      ['STAR_FORWARD', kvhts, '132', 'Rambouillet'],
      ['STAR_RETURN', kvhts, '132', 'Rambouillet'],
      ['STAR_FORWARD', e10b, '66', 'Cagliari'],
      ['STAR_RETURN', e10b, '66', 'Cagliari'],
      ['STAR_FORWARD', e10b, '110', 'Makarios'],
      ['STAR_RETURN', e10b, '110', 'Makarios'],
    ] satisfies Array<['STAR_FORWARD' | 'STAR_RETURN', SatelliteData, string, string]>)(
      'displays %s %s beam %s as %s in ENG panels',
      (linkMode, satellite, beamId, expectedGatewayName) => {
        const { html, selection } = renderGeoWithStarGateway({ linkMode, satellite, beamId });

        expect(selection.diagnostic.source).toBe('beam-gateway-assignment');
        expect(html).toContain(expectedGatewayName);
        expect(html).toContain(`Traffic Gateway side - ${expectedGatewayName}`);
        expect(html).toContain(selection.trafficCapability.capabilityId);
        if (expectedGatewayName !== 'Rambouillet') {
          expect(html).not.toContain('Traffic Gateway side - Rambouillet');
        }
      }
    );

    it('falls back to legacy gateway labels with diagnostics when no beam mapping exists', () => {
      const { html, selection } = renderGeoWithStarGateway({
        linkMode: 'STAR_FORWARD',
        satellite: kvhts,
        beamId: '9999',
      });

      expect(selection.gateway.name).toBe('Rambouillet');
      expect(selection.diagnostic).toEqual(expect.objectContaining({
        source: 'legacy-traffic-gateway',
        reason: 'BEAM_ASSIGNMENT_NOT_FOUND',
      }));
      expect(html).toContain('Traffic Gateway side - Rambouillet');
      expect(selection.diagnostic.message).toContain('No beam gateway assignment found for KVHTS beam 9999.');
    });

    it('does not apply STAR gateway overrides to MESH panels', () => {
      const { selection } = resolveSelection(kvhts, '29');
      const html = renderToStaticMarkup(
        <GEOConnectivitySection
          {...baseProps}
          linkMode="MESH"
          dualSegmentResult={makeMeshResult(3.2, 2.1)}
          engineeringAnalysisViewModel={buildGeoTruthViewModel({
            linkMode: 'MESH',
            result: makeMeshResult(3.2, 2.1),
            confidenceLabel: 'High 90/100',
            latencyMs: 290,
            latencyLabel: 'A → B latency',
            scenarioComplete: true,
            pathResolved: true,
          })}
          pointB={{ lat: 10, lng: 20 }}
          starTrafficGatewaySelection={selection}
        />
      );

      expect(html).toContain('Review · GEO result');
      expect(html).toContain('A → B throughput');
      expect(html).not.toContain('Scanzano / Palermo');
      expect(html).not.toContain('Traffic Gateway side - Scanzano / Palermo');
    });
  });

  it('renders STAR_FORWARD with delivered throughput, RF margin and limiting segment', () => {
    const html = renderGeo('STAR_FORWARD', makeStarResult(4.5));
    expect(html).toContain('18 Mbps');
    expect(html).toContain('Delivered');
    expect(html).toContain('4.5 dB');
    expect(html).toContain('Downlink');
  });

  it('renders STAR_RETURN with a blocked tone when margin is negative', () => {
    const html = renderGeo('STAR_RETURN', makeStarResult(-1.4));
    expect(html).toContain('Service blocked');
    expect(html).toContain('-1.4 dB');
  });

  it('renders MESH with the delivered label and forward-direction network throughput', () => {
    const html = renderGeo('MESH', makeMeshResult(3.2, 2.1));
    expect(html).toContain('A → B throughput');
    expect(html).toContain('Delivered');
    expect(html).toContain('92 Mbps');
  });

  it('renders POINT_TO_POINT with the delivered label and forward-direction network throughput', () => {
    const html = renderGeo('POINT_TO_POINT', makeMeshResult(3.2, 2.1));
    expect(html).toContain('A → B throughput');
    expect(html).toContain('Delivered');
    expect(html).toContain('92 Mbps');
  });

  it('renders every topology without throwing when no link budget result is available yet', () => {
    const modes: LinkMode[] = ['STAR_FORWARD', 'STAR_RETURN', 'MESH', 'POINT_TO_POINT'];
    for (const mode of modes) {
      expect(() => renderGeo(mode, null)).not.toThrow();
    }
  });

  describe('Level 4 investigation subsections', () => {
    /** True when the nearest <details> tag preceding `text` carries the `open` attribute. */
    const detailsOpenStateBeforeText = (html: string, text: string): boolean => {
      const textIndex = html.indexOf(text);
      const detailsIndex = html.lastIndexOf('<details', textIndex);
      const tagEnd = html.indexOf('>', detailsIndex);
      const tag = html.slice(detailsIndex, tagEnd);
      return /\sopen(=|\s|>|$)/.test(tag);
    };

    const renderGeoWithDrawer = (linkMode: LinkMode, dualSegmentResult: DualSegmentResult | null) =>
      renderGeoRfEvidence(
        <GEOConnectivitySection
          {...baseProps}
          linkMode={linkMode}
          dualSegmentResult={dualSegmentResult}
          pointB={linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? { lat: 10, lng: 20 } : null}
        />
      );

    it('opens only the uplink investigation by default when uplink is limiting', () => {
      const html = renderGeoWithDrawer('STAR_FORWARD', makeStarResult(-2));

      expect(detailsOpenStateBeforeText(html, 'Uplink Segment')).toBe(true);
      expect(detailsOpenStateBeforeText(html, 'Downlink Segment')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Satellite / Payload')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'End-to-End Diagnostic')).toBe(false);
      expect(html).toContain('Show details');
      expect(html).toContain('Hide details');
      expect(html).not.toContain('>Open</span>');
      expect(html).not.toContain('>Collapse</span>');
    });

    it('opens only the downlink investigation by default when downlink is limiting', () => {
      const html = renderGeoWithDrawer('STAR_FORWARD', makeStarResult(4.5));

      expect(detailsOpenStateBeforeText(html, 'Uplink Segment')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'Downlink Segment')).toBe(true);
      expect(detailsOpenStateBeforeText(html, 'Satellite / Payload')).toBe(false);
      expect(detailsOpenStateBeforeText(html, 'End-to-End Diagnostic')).toBe(false);
    });

    it('identifies the consumed TRAFFIC_TELEPORT capability in the RF panel', () => {
      const html = renderGeoWithDrawer('STAR_FORWARD', makeStarResult(4.5));

      expect(html).toContain('RF Ground Capability');
      expect(html).toContain('Rambouillet');
      expect(html).toContain('TRAFFIC_TELEPORT');
      expect(html).toContain('geo-rambouillet-traffic-teleport');
      expect(html).toContain('PUBLICLY_LIKELY');
      expect(html).toContain('ELIGIBLE_PUBLICLY_LIKELY');
    });

    it('does not show a traffic RF capability panel for MESH routes', () => {
      const html = renderGeoWithDrawer('MESH', makeMeshResult(3.2, 2.1));

      expect(html).not.toContain('RF Ground Capability');
      expect(html).not.toContain('TRAFFIC_TELEPORT');
    });

  });

  describe('authoritative result (above-the-fold summary)', () => {
    it('renders before proof content and keeps configuration out of the result surface', () => {
      const html = renderGeo('STAR_FORWARD', makeStarResult(4.5));

      expect(html).toContain('Review · GEO result');
      expect(html).not.toContain('Space Segment');
      expect(html).not.toContain('Access Layer');
      expect(html).not.toContain('STAR · Hub &amp; Spoke');
      expect(html).toContain('Service available — constrained by shared capacity');
      expect(html).toContain('Why this result');
      expect(html).toContain('Downlink');
      expect(html).toMatch(/\d+\/100/);
    });

    it('shows a non-zero latency for MESH, derived the same way as the link budget drawer', () => {
      const html = renderGeo('MESH', makeMeshResult(3.2, 2.1));
      const resultHtml = html.slice(html.indexOf('Review · GEO result'));

      expect(resultHtml).toContain('latency');
      expect(resultHtml).toMatch(/\d+(\.\d+)? ms/);
    });
  });

  describe('Path stage route diagram (kept symmetric with LEO — Cross-Surface Consistency Audit 2026-07-21)', () => {
    it('STAR_FORWARD: names the gateway, satellite and user without dropping either hop', () => {
      const satellite = createGeoSatellite('star-test', 'EUTELSAT STAR TEST', 10);
      const selectedCoverage = createBeamCandidate(satellite, 'beam-1', false);
      const html = renderGeoPathEvidence(
        <GEOConnectivitySection
          {...baseProps}
          linkMode="STAR_FORWARD"
          dualSegmentResult={makeStarResult(4.5)}
          resolvedGEOConnectivity={makeResolvedGeoConnectivity(satellite, selectedCoverage)}
          geoGeometry={makeLegacyRambouilletGeoGeometry()}
          engineeringAnalysisViewModel={buildGeoTruthViewModel({
            linkMode: 'STAR_FORWARD',
            result: makeStarResult(4.5),
            confidenceLabel: 'High 90/100',
            latencyMs: 280,
            scenarioComplete: true,
            pathResolved: true,
          })}
        />
      );

      expect(html).toContain('EUTELSAT STAR TEST');
      expect(html.match(/data-route-diagram-node=""/g)?.length).toBe(3);
    });

    it('MESH: names one shared satellite between both sites — confirmed correct, not the LEO-style two-satellite case', () => {
      const html = renderGeoPathEvidence(
        <GEOConnectivitySection
          {...baseProps}
          linkMode="MESH"
          dualSegmentResult={makeMeshResult(3.2, 2.1)}
          engineeringAnalysisViewModel={buildGeoTruthViewModel({
            linkMode: 'MESH',
            result: makeMeshResult(3.2, 2.1),
            confidenceLabel: 'High 90/100',
            latencyMs: 290,
            scenarioComplete: true,
            pathResolved: true,
          })}
        />
      );

      expect(html).toContain('Gateway');
      expect(html).toContain('Site A');
      expect(html).toContain('EUTELSAT TEST');
      // Exactly one satellite node — GEO Mesh genuinely uses one satellite
      // for both sites (unlike LEO Site-to-Site), so this is the correct
      // shape, not a regression of the F2-style bug.
      expect(html.match(/data-route-diagram-node=""/g)?.length).toBe(3);
    });
  });
});
