import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import { buildGeoRouteAnalysisViewModel } from '../geoRouteAnalysisViewModel';
import { computeGeoConnectivity, findCandidateCoverages } from '../geoCoverageSelection';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';

// KVHTS with a real downlink beam over Europe (contour 29 → beam token '29' →
// Scanzano / Palermo in the beam plan; `level` is the signal level used for
// candidate gating).
const europe = [[-10, 35], [20, 35], [20, 60], [-10, 60], [-10, 35]];
const beam29Coverage = {
  name: 'Beam 29',
  feature: {
    type: 'Feature',
    properties: {
      name: 'Beam 29',
      contour: 29,
      level: 55,
      mission: 'Ka-band',
      type: 'EUTELSAT',
      isUplink: false,
      satelliteId: 'EUTELSAT KONNECT VHTS',
    },
    geometry: { type: 'Polygon', coordinates: [europe] } as Polygon,
  } as Feature,
};

const kvhts: SatelliteData = {
  id: '53765',
  name: 'EUTELSAT KONNECT VHTS',
  noradId: '53765',
  coverageFileId: 'test-kvhts',
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as SatelliteData['satrec'],
  position: { lat: 0, lng: 2.7, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [beam29Coverage] as unknown as SatelliteData['coverages'],
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 500, ka: 300, c: 200 },
    availability: 0.99,
  },
};

const paris = { lat: 48.85, lng: 2.35 };

describe('buildGeoRouteAnalysisViewModel STAR latency (ENG/COMM parity)', () => {
  const candidateCoverages = findCandidateCoverages(paris, [kvhts]);
  const downlink = candidateCoverages.find((candidate) => !candidate.isUplink) ?? null;

  const viewModel = buildGeoRouteAnalysisViewModel({
    activePoint: paris,
    pointB: null,
    satellites: [kvhts],
    satelliteScope: 'GEO',
    linkMode: 'STAR_FORWARD',
    activeMeshTab: 'forward',
    candidateCoverages,
    candidateCoveragesB: [],
    selectedCoverage: downlink,
    selectedUplinkCoverage: null,
    selectedDownlinkCoverage: downlink,
    selectedUplinkCoverageB: null,
    selectedDownlinkCoverageB: null,
    geoRFClassIdA: null,
    geoRFClassIdB: null,
    geoRFCustomParamsA: null,
    geoRFCustomParamsB: null,
    geoTerminalType: 'fixed',
    geoTerminalTypeB: 'fixed',
    weatherType: 'clear',
    weatherTypeB: 'clear',
  });

  it('publishes the same headline latency expression as the ENG panel: one-way propagation + network overhead', () => {
    expect(downlink).not.toBeNull();
    const geometry = computeGeoConnectivity(downlink, paris, [kvhts], GEO_GATEWAYS, {
      gatewayReferenceCoverage: downlink,
    })?.geometry;
    expect(geometry?.oneWayRadioMs).not.toBeNull();

    // ENG authoritative result (GEOConnectivitySection.geoStarOneWayTotalMs):
    const engHeadlineMs = geometry!.oneWayRadioMs! + geometry!.overheadMs.total;
    expect(viewModel.latencyMs).toBeCloseTo(engHeadlineMs, 6);
    // Strictly greater than propagation alone — the overhead is included.
    expect(viewModel.latencyMs!).toBeGreaterThan(geometry!.oneWayRadioMs!);
  });

  it('publishes the same figure through geoMetrics and the route summary', () => {
    expect(viewModel.geoMetrics?.rtt).toBeCloseTo(viewModel.latencyMs!, 6);
    if (viewModel.routeSummary) {
      expect(viewModel.routeSummary).toContain(`latency ${Math.round(viewModel.latencyMs!)} ms`);
    }
  });

  it('exposes the existing network-layer sharing assumption without recomputing it', () => {
    expect(viewModel.networkLayer?.forward.contentionRatio).toBe(1);
    expect(viewModel.networkLayer?.forward.protocolEfficiency).toBe(1);
  });

  // ENG and COMM now resolve STAR through the same geoDeliveryChain helper, so the
  // gateway modem (endpoint B) bounds the download here exactly as it does in the
  // inspector. This pins the COMM half of that contract.
  it('bounds the STAR download by the selected gateway modem', () => {
    const starInput = (geoModemIdB: 'idirect_mdm2510' | null) => buildGeoRouteAnalysisViewModel({
      activePoint: paris,
      pointB: null,
      satellites: [kvhts],
      satelliteScope: 'GEO',
      linkMode: 'STAR_FORWARD',
      activeMeshTab: 'forward',
      candidateCoverages,
      candidateCoveragesB: [],
      selectedCoverage: downlink,
      selectedUplinkCoverage: null,
      selectedDownlinkCoverage: downlink,
      selectedUplinkCoverageB: null,
      selectedDownlinkCoverageB: null,
      geoRFClassIdA: null,
      geoRFClassIdB: null,
      geoRFCustomParamsA: null,
      geoRFCustomParamsB: null,
      geoModemIdA: 'idirect_mdm5010',
      geoModemIdB,
      geoTerminalType: 'fixed',
      geoTerminalTypeB: 'fixed',
      weatherType: 'clear',
      weatherTypeB: 'clear',
    });

    const withGateway = starInput('idirect_mdm2510');
    const withoutGateway = starInput(null);

    // Gateway unselected ⇒ one end unknown ⇒ estimated ceiling, never "delivered".
    expect(withoutGateway.geoMetrics?.downlinkEstimated).toBe(true);

    expect(withGateway.geoMetrics?.downlinkGbps).not.toBeNull();
    if (withGateway.geoMetrics?.downlinkGbps != null) {
      // Both ends known ⇒ a delivered rate, capped at the gateway's 150 Mbps.
      expect(withGateway.geoMetrics.downlinkEstimated).toBe(false);
      expect(withGateway.geoMetrics.downlinkGbps).toBeLessThanOrEqual(0.15);
      expect(withGateway.geoMetrics.downlinkGbps)
        .toBeLessThanOrEqual(withoutGateway.geoMetrics?.downlinkGbps ?? Infinity);
    }
  });

  it('invalidates the calculation signature when modem or custom RF inputs change', () => {
    const withModem = buildGeoRouteAnalysisViewModel({
      activePoint: paris,
      pointB: null,
      satellites: [kvhts],
      satelliteScope: 'GEO',
      linkMode: 'STAR_FORWARD',
      activeMeshTab: 'forward',
      candidateCoverages,
      candidateCoveragesB: [],
      selectedCoverage: downlink,
      selectedUplinkCoverage: null,
      selectedDownlinkCoverage: downlink,
      selectedUplinkCoverageB: null,
      selectedDownlinkCoverageB: null,
      geoRFClassIdA: null,
      geoRFClassIdB: null,
      geoRFCustomParamsA: null,
      geoRFCustomParamsB: null,
      geoModemIdA: 'idirect_mdm5010',
      geoModemIdB: 'idirect_mdm2510',
      geoTerminalType: 'fixed',
      geoTerminalTypeB: 'fixed',
      weatherType: 'clear',
      weatherTypeB: 'clear',
    });

    expect(withModem.inputSignature).not.toBe(viewModel.inputSignature);
    expect(withModem.inputSignature).toContain('modemCatalogue:');
    expect(withModem.inputSignature).toContain('physicalModel:');
    expect(withModem.inputSignature).toContain('modcod:');
  });

  it('keeps unpublished MESH capability unverified instead of inventing a hard block', () => {
    const mesh = buildGeoRouteAnalysisViewModel({
      activePoint: paris,
      pointB: paris,
      satellites: [kvhts],
      satelliteScope: 'GEO',
      linkMode: 'MESH',
      activeMeshTab: 'forward',
      candidateCoverages,
      candidateCoveragesB: candidateCoverages,
      selectedCoverage: downlink,
      selectedUplinkCoverage: null,
      selectedDownlinkCoverage: downlink,
      selectedUplinkCoverageB: null,
      selectedDownlinkCoverageB: downlink,
      geoRFClassIdA: null,
      geoRFClassIdB: null,
      geoRFCustomParamsA: null,
      geoRFCustomParamsB: null,
      geoModemIdA: 'idirect_iq200',
      geoModemIdB: 'idirect_mdm2510',
      geoTerminalType: 'fixed',
      geoTerminalTypeB: 'fixed',
      weatherType: 'clear',
      weatherTypeB: 'clear',
    });

    expect(mesh.meshTopology?.unverified).toBe(true);
    expect(mesh.meshTopology?.incompatibleModemIds).toEqual([]);
    expect(mesh.meshTopology?.reason).toMatch(/not published/);
  });
});
