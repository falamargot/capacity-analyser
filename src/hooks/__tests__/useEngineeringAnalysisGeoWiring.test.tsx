import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { GeoModemId } from '../../utils/geoModemCatalogue';
import { useEngineeringAnalysis, type EngineeringAnalysis } from '../useEngineeringAnalysis';
import { SimulationClockProvider } from '../../contexts/SimulationClockContext';

/**
 * Production-level ENG wiring.
 *
 * Every other GEO test drives a builder or the extracted chain directly. This one
 * runs the real `useEngineeringAnalysis` hook and inspects what it actually
 * publishes, so the wiring between the canonical route, the truth view model and
 * `canonicalRouteMetrics` is covered — not just the pieces it wires together.
 *
 * The hook is pure derivation (useMemo/useCallback/useRef); its effects only fetch
 * optional regulatory/real-time overlays, so a server render exercises the whole
 * synchronous analysis path.
 */

function makeDlCandidate(overrides: Partial<CandidateCoverage> = {}): CandidateCoverage {
  return {
    satelliteId: 'SAT-1',
    satelliteName: 'Test Sat',
    missionName: 'Ku-band',
    coverageKey: 'SAT-1::dl',
    coverageName: 'Test DL Coverage',
    beamId: 'beam-1',
    beamName: 'beam',
    elevation: 40,
    distanceFromBeamCenter: 0,
    throughputEstimate: 50,
    level: 55,
    isUplink: false,
    isSynthesized: false,
    eirpDbw: 60,
    gtDbk: undefined,
    band: 'Ku',
    frequencyGhz: 11.7,
    bandwidthMhz: 36,
    atmosphericLossDb: 1.5,
    slantRangeKm: 37500,
    cnDb: 14,
    linkMarginDb: 6,
    latencyMs: 560,
    status: 'available',
    scoreBreakdown: { elevation: 0, linkMargin: 0, throughput: 0, latency: 0, total: 0 },
    score: 0,
    ...overrides,
  };
}

function makeUlCandidate(overrides: Partial<CandidateCoverage> = {}): CandidateCoverage {
  return {
    ...makeDlCandidate(),
    coverageKey: 'SAT-1::ul',
    coverageName: 'Test UL Coverage',
    isUplink: true,
    eirpDbw: undefined,
    gtDbk: 10,
    level: 10,
    frequencyGhz: 14,
    cnDb: 12,
    linkMarginDb: 5,
    ...overrides,
  };
}

const satellite = {
  id: 'SAT-1',
  name: 'Test Sat',
  noradId: 'SAT-1',
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  longitude: 7,
  tle1: '',
  tle2: '',
  position: { lat: 0, lng: 7, alt: 35786 },
  coverages: [],
} as unknown as SatelliteData;

interface Scenario {
  linkMode: 'STAR_FORWARD' | 'STAR_RETURN' | 'MESH' | 'POINT_TO_POINT';
  activeMeshTab?: 'forward' | 'reverse';
  geoModemIdA?: GeoModemId | null;
  geoModemIdB?: GeoModemId | null;
}

/** Renders the hook and hands back everything it published. */
function runHook(scenario: Scenario): EngineeringAnalysis {
  let published: EngineeringAnalysis | null = null;
  const uplink = makeUlCandidate();
  const downlink = makeDlCandidate();
  const uplinkB = makeUlCandidate({ coverageKey: 'SAT-1::ul-b' });
  const downlinkB = makeDlCandidate({ coverageKey: 'SAT-1::dl-b' });

  const Probe = () => {
    published = useEngineeringAnalysis({
      satellites: [satellite],
      selectedPoint: { lat: 48.85, lng: 2.35 },
      selectedSatellite: satellite,
      autoSelectedLEOSatellite: null,
      satelliteScope: 'GEO',
      activeConnTab: 'GEO',
      analysisSource: 'earth',
      selectedSNP: null,
      candidateCoverages: [uplink, downlink],
      selectedCoverage: downlink,
      selectedUplinkCoverage: uplink,
      selectedDownlinkCoverage: downlink,
      selectedUplinkCoverageB: uplinkB,
      selectedDownlinkCoverageB: downlinkB,
      candidateCoveragesB: [uplinkB, downlinkB],
      linkMode: scenario.linkMode,
      activeMeshTab: scenario.activeMeshTab ?? 'forward',
      pointB: { lat: 51.5, lng: -0.12 },
      leoTopologyMode: 'SINGLE_SITE',
      pointBLeo: null,
      leoTerminalType: 'fixed',
      geoTerminalType: 'fixed',
      geoTerminalTypeB: 'fixed',
      geoModemIdA: scenario.geoModemIdA ?? null,
      geoModemIdB: scenario.geoModemIdB ?? null,
      weatherType: 'clear',
      weatherTypeB: 'clear',
    });
    return null;
  };

  renderToStaticMarkup(
    <SimulationClockProvider>
      <Probe />
    </SimulationClockProvider>,
  );
  if (!published) throw new Error('hook did not publish an analysis');
  return published;
}

const geoThroughputMetrics = (analysis: EngineeringAnalysis) =>
  analysis.engineeringTruths.GEO?.primaryMetrics.filter((m) => /throughput/i.test(m.label)) ?? [];

describe('useEngineeringAnalysis — GEO canonical wiring', () => {
  it('publishes both MESH directions through the canonical route', () => {
    const analysis = runHook({ linkMode: 'MESH' });
    const geo = analysis.canonicalRouteMetrics.GEO;

    expect(geo.topology).toBe('MESH');
    expect(geo.forward.throughputMbps).toBeGreaterThan(0);
    expect(geo.reverse.throughputMbps).toBeGreaterThan(0);
    expect(geo.activeDirection).toBe('forward');
  });

  it('publishes both POINT_TO_POINT directions through the canonical route', () => {
    const analysis = runHook({ linkMode: 'POINT_TO_POINT' });
    const geo = analysis.canonicalRouteMetrics.GEO;

    expect(geo.topology).toBe('POINT_TO_POINT');
    expect(geo.forward.throughputMbps).toBeGreaterThan(0);
    expect(geo.reverse.throughputMbps).toBeGreaterThan(0);
  });

  it('applies the single active-direction rule to STAR_RETURN', () => {
    const analysis = runHook({ linkMode: 'STAR_RETURN' });
    expect(analysis.canonicalRouteMetrics.GEO.activeDirection).toBe('reverse');
  });

  it('publishes identical MESH physics on either tab, only switching the active direction', () => {
    const onForward = runHook({ linkMode: 'MESH', activeMeshTab: 'forward' });
    const onReverse = runHook({ linkMode: 'MESH', activeMeshTab: 'reverse' });

    expect(onForward.canonicalRouteMetrics.GEO.activeDirection).toBe('forward');
    expect(onReverse.canonicalRouteMetrics.GEO.activeDirection).toBe('reverse');
    expect(onReverse.canonicalRouteMetrics.GEO.forward.throughputMbps)
      .toBe(onForward.canonicalRouteMetrics.GEO.forward.throughputMbps);
    expect(onReverse.canonicalRouteMetrics.GEO.reverse.throughputMbps)
      .toBe(onForward.canonicalRouteMetrics.GEO.reverse.throughputMbps);
  });

  it('marks a GEO route with no endpoint modems as an estimated ceiling everywhere', () => {
    const analysis = runHook({ linkMode: 'MESH' });
    const geo = analysis.canonicalRouteMetrics.GEO;

    expect(geo.forward.estimated).toBe(true);
    expect(geo.reverse.estimated).toBe(true);
    expect(geoThroughputMetrics(analysis).length).toBeGreaterThan(0);
    for (const metric of geoThroughputMetrics(analysis)) {
      expect(metric.provenance).toBe('estimated-ceiling');
    }
    expect(analysis.engineeringTruths.GEO?.summary).toContain('estimated ceiling');
  });

  it('caps a MESH route by the endpoint modems and reports it as delivered', () => {
    const uncapped = runHook({ linkMode: 'MESH' });
    const capped = runHook({
      linkMode: 'MESH',
      geoModemIdA: 'idirect_mdm5010', // TX 300 / RX 800
      geoModemIdB: 'idirect_mdm2510', // aggregate 150
    });

    const uncappedForward = uncapped.canonicalRouteMetrics.GEO.forward.throughputMbps!;
    const cappedForward = capped.canonicalRouteMetrics.GEO.forward.throughputMbps!;

    expect(cappedForward).toBeLessThanOrEqual(uncappedForward);
    expect(cappedForward).toBeLessThanOrEqual(150);
    expect(capped.canonicalRouteMetrics.GEO.forward.estimated).toBe(false);
    for (const metric of geoThroughputMetrics(capped)) {
      expect(metric.provenance).toBe('delivered');
    }
  });

  it('quotes the same figure in the truth summary as in the active-direction tile', () => {
    for (const scenario of [
      { linkMode: 'MESH' as const, activeMeshTab: 'forward' as const, label: 'A → B throughput' },
      { linkMode: 'MESH' as const, activeMeshTab: 'reverse' as const, label: 'B → A throughput' },
      { linkMode: 'POINT_TO_POINT' as const, activeMeshTab: 'forward' as const, label: 'A → B throughput' },
    ]) {
      const analysis = runHook({
        linkMode: scenario.linkMode,
        activeMeshTab: scenario.activeMeshTab,
        geoModemIdA: 'idirect_mdm5010',
        geoModemIdB: 'idirect_mdm2510',
      });
      const truth = analysis.engineeringTruths.GEO!;
      const active = truth.primaryMetrics.find((m) => m.label === scenario.label);

      expect(active, `${scenario.linkMode} should publish "${scenario.label}"`).toBeTruthy();
      expect(truth.summary).toContain(active!.display);
      expect(truth.summary).toContain(
        active!.provenance === 'estimated-ceiling' ? 'estimated ceiling' : 'delivered',
      );
    }
  });

  it('publishes ONE set of numbers: the truth tiles equal the canonical metrics', () => {
    for (const modems of [
      { geoModemIdA: null, geoModemIdB: null },
      { geoModemIdA: 'idirect_mdm5010' as const, geoModemIdB: 'idirect_mdm2510' as const },
    ]) {
      const analysis = runHook({ linkMode: 'MESH', ...modems });
      const geo = analysis.canonicalRouteMetrics.GEO;
      const truth = analysis.engineeringTruths.GEO!;
      const tile = (label: string) => truth.primaryMetrics.find((m) => m.label === label)!;

      // The inspector tiles and the object COMM/header/PDF consume are the same
      // numbers with the same provenance — not two parallel derivations.
      expect(tile('A → B throughput').value).toBe(geo.forward.throughputMbps);
      expect(tile('B → A throughput').value).toBe(geo.reverse.throughputMbps);
      expect(tile('A → B throughput').provenance)
        .toBe(geo.forward.estimated ? 'estimated-ceiling' : 'delivered');
      expect(tile('B → A throughput').provenance)
        .toBe(geo.reverse.estimated ? 'estimated-ceiling' : 'delivered');
    }
  });
});
