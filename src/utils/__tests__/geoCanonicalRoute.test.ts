import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { TrafficTeleportCapability } from '../geoGroundInfrastructure';
import type { StarTrafficGatewaySelection } from '../geoConnectivityModel';
import * as dualSegmentBudget from '../geoDualSegmentBudget';
import * as physicalAssumptions from '../geoPhysicalAssumptions';
import { resolveCanonicalGeoRoute, type GeoCanonicalRouteInput } from '../geoCanonicalRoute';

// ─── Fixtures ────────────────────────────────────────────────────────────────

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
    eirpDbw: 55,
    gtDbk: undefined,
    band: 'Ku',
    frequencyGhz: 11.7,
    bandwidthMhz: 36,
    atmosphericLossDb: 1.5,
    slantRangeKm: 37500,
    cnDb: 10,
    linkMarginDb: 2,
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
    gtDbk: 6,
    level: 6,
    frequencyGhz: 14,
    cnDb: 5,
    linkMarginDb: -3,
    ...overrides,
  };
}

const satellite = { id: 'SAT-1', name: 'Test Sat' } as SatelliteData;

const gatewayCapability: TrafficTeleportCapability = {
  capabilityId: 'test-01-traffic-teleport',
  siteId: 'test-01',
  kind: 'TRAFFIC_TELEPORT',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: ['SAT-1'],
  trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
  rfCapabilities: [],
  eligibleServiceClasses: ['STAR_FORWARD', 'STAR_RETURN'],
};

const gatewaySelection = {
  gateway: { name: 'Rambouillet', lat: 48.64, lng: 1.83 },
  trafficCapability: gatewayCapability,
} as unknown as StarTrafficGatewaySelection;

function baseInput(overrides: Partial<GeoCanonicalRouteInput> = {}): GeoCanonicalRouteInput {
  return {
    linkMode: 'STAR_FORWARD',
    activeMeshTab: 'forward',
    activePoint: { lat: 48.85, lng: 2.35 },
    pointB: { lat: 51.5, lng: -0.12 },
    uplinkAtUser: makeUlCandidate(),
    downlinkAtUser: makeDlCandidate(),
    uplinkAtB: makeUlCandidate({ coverageKey: 'SAT-1::ul-b' }),
    downlinkAtB: makeDlCandidate({ coverageKey: 'SAT-1::dl-b' }),
    starGatewaySelection: gatewaySelection,
    candidateCoveragesAtGateway: [
      makeUlCandidate({ coverageKey: 'SAT-1::gw-ul', elevation: 35 }),
      makeDlCandidate({ coverageKey: 'SAT-1::gw-dl', elevation: 35 }),
    ],
    satellites: [satellite],
    geoTerminalType: 'fixed',
    geoTerminalTypeB: 'fixed',
    weatherType: 'clear',
    weatherTypeB: 'clear',
    ...overrides,
  };
}

// ─── 2. Companion directional results ────────────────────────────────────────

describe('STAR companion direction is always resolved', () => {
  it('STAR_FORWARD resolves the return direction too', () => {
    const route = resolveCanonicalGeoRoute(baseInput({ linkMode: 'STAR_FORWARD' }))!;

    expect(route).toBeTruthy();
    expect(route.forwardResult).toBeTruthy();
    // The companion return direction is modeled even though the inspector shows
    // the outbound one — COMM's route view model used to hard-null it.
    expect(route.reverseResult).toBeTruthy();
    expect(route.delivery.forward.throughputMbps).toBeGreaterThan(0);
    expect(route.delivery.reverse.throughputMbps).toBeGreaterThan(0);
    // The selected direction drives `activeResult`.
    expect(route.activeDirection).toBe('forward');
    expect(route.activeResult).toBe(route.forwardResult);
  });

  it('STAR_RETURN resolves the outbound direction too, and activates the return', () => {
    const route = resolveCanonicalGeoRoute(baseInput({ linkMode: 'STAR_RETURN' }))!;

    expect(route.forwardResult).toBeTruthy();
    expect(route.reverseResult).toBeTruthy();
    expect(route.activeDirection).toBe('reverse');
    expect(route.activeResult).toBe(route.reverseResult);
  });

  it('produces the same two directional results whichever STAR mode is selected', () => {
    const fromForward = resolveCanonicalGeoRoute(baseInput({ linkMode: 'STAR_FORWARD' }))!;
    const fromReturn = resolveCanonicalGeoRoute(baseInput({ linkMode: 'STAR_RETURN' }))!;

    // Physics does not depend on which tab is open.
    expect(fromReturn.delivery.forward.throughputMbps).toBe(fromForward.delivery.forward.throughputMbps);
    expect(fromReturn.delivery.reverse.throughputMbps).toBe(fromForward.delivery.reverse.throughputMbps);
  });

  it('leaves a direction null when its leg cannot be resolved', () => {
    const route = resolveCanonicalGeoRoute(baseInput({ uplinkAtUser: null }))!;

    expect(route.forwardResult).toBeTruthy();
    expect(route.reverseResult).toBeNull();
    // Never copied from the other direction.
    expect(route.delivery.reverse.throughputMbps).toBeNull();
  });
});

// ─── 3. MESH → STAR switch with a stale activeMeshTab ────────────────────────

describe('stale activeMeshTab across a MESH → STAR switch', () => {
  it('STAR_FORWARD stays on the outbound direction even with activeMeshTab="reverse"', () => {
    const stale = resolveCanonicalGeoRoute(baseInput({
      linkMode: 'STAR_FORWARD',
      activeMeshTab: 'reverse', // left over from a MESH session
    }))!;
    const clean = resolveCanonicalGeoRoute(baseInput({
      linkMode: 'STAR_FORWARD',
      activeMeshTab: 'forward',
    }))!;

    // Topology wins over the tab: STAR_FORWARD is the outbound service direction.
    expect(stale.activeDirection).toBe('forward');
    expect(stale.activeResult).toBe(stale.forwardResult);
    expect(stale.delivery.forward.throughputMbps).toBe(clean.delivery.forward.throughputMbps);
  });

  it('STAR_RETURN stays on the return direction even with activeMeshTab="forward"', () => {
    const route = resolveCanonicalGeoRoute(baseInput({
      linkMode: 'STAR_RETURN',
      activeMeshTab: 'forward',
    }))!;

    expect(route.activeDirection).toBe('reverse');
    expect(route.activeResult).toBe(route.reverseResult);
  });

  it('MESH honours the tab, since it has no topology-level direction', () => {
    const forward = resolveCanonicalGeoRoute(baseInput({ linkMode: 'MESH', activeMeshTab: 'forward' }))!;
    const reverse = resolveCanonicalGeoRoute(baseInput({ linkMode: 'MESH', activeMeshTab: 'reverse' }))!;

    expect(forward.activeDirection).toBe('forward');
    expect(reverse.activeDirection).toBe('reverse');
    // Same physics, only the presented direction differs.
    expect(reverse.delivery.forward.throughputMbps).toBe(forward.delivery.forward.throughputMbps);
    expect(reverse.delivery.reverse.throughputMbps).toBe(forward.delivery.reverse.throughputMbps);
  });
});

// ─── 4. Site fades are independent of the UI tab ─────────────────────────────

describe('site weather is a property of the site, not of the open tab', () => {
  it('applies identical Site A/B fades regardless of activeMeshTab', () => {
    const spy = vi.spyOn(physicalAssumptions, 'estimateP618PlanningAttenuation');
    const capture = (activeMeshTab: 'forward' | 'reverse') => {
      spy.mockClear();
      resolveCanonicalGeoRoute(baseInput({
        linkMode: 'MESH',
        activeMeshTab,
        weatherType: 'heavy_rain',
        weatherTypeB: 'storm',
      }));
      return spy.mock.calls.map(([args]) => ({
        direction: args.direction,
        latitudeDeg: args.latitudeDeg,
        elevationDeg: args.elevationDeg,
        weatherType: args.weatherType,
      }));
    };

    const onForwardTab = capture('forward');
    const onReverseTab = capture('reverse');

    // The COMM copy previously chose Site B's fade direction from activeMeshTab,
    // so flipping the inspector tab silently changed Site B's modeled attenuation.
    expect(onReverseTab).toEqual(onForwardTab);
    // Both RF directions are modeled for each site, every time.
    expect(onForwardTab.filter((c) => c.direction === 'uplink')).toHaveLength(2);
    expect(onForwardTab.filter((c) => c.direction === 'downlink')).toHaveLength(2);
    spy.mockRestore();
  });

  it('gives each site its own weather, and never reuses Site A for Site B', () => {
    const spy = vi.spyOn(physicalAssumptions, 'estimateP618PlanningAttenuation');
    resolveCanonicalGeoRoute(baseInput({
      linkMode: 'MESH',
      weatherType: 'clear',
      weatherTypeB: 'storm',
    }));

    const byLatitude = new Map<number, Set<string>>();
    for (const [args] of spy.mock.calls) {
      const set = byLatitude.get(args.latitudeDeg) ?? new Set<string>();
      set.add(args.weatherType);
      byLatitude.set(args.latitudeDeg, set);
    }
    expect([...(byLatitude.get(48.85) ?? [])]).toEqual(['clear']);
    expect([...(byLatitude.get(51.5) ?? [])]).toEqual(['storm']);
    spy.mockRestore();
  });
});

// ─── 8. No unnecessary STAR construction in MESH ─────────────────────────────

describe('route construction does only the work the topology needs', () => {
  let starForward: ReturnType<typeof vi.spyOn>;
  let starReturn: ReturnType<typeof vi.spyOn>;
  let mesh: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    starForward = vi.spyOn(dualSegmentBudget, 'buildStarForwardResult');
    starReturn = vi.spyOn(dualSegmentBudget, 'buildStarReturnResult');
    mesh = vi.spyOn(dualSegmentBudget, 'buildMeshResult');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds no STAR link budget in MESH, even with a served STAR gateway available', () => {
    resolveCanonicalGeoRoute(baseInput({ linkMode: 'MESH' }));

    expect(mesh).toHaveBeenCalledTimes(1);
    expect(starForward).not.toHaveBeenCalled();
    expect(starReturn).not.toHaveBeenCalled();
  });

  it('builds no STAR link budget in POINT_TO_POINT either', () => {
    resolveCanonicalGeoRoute(baseInput({ linkMode: 'POINT_TO_POINT' }));

    expect(mesh).toHaveBeenCalledTimes(1);
    expect(starForward).not.toHaveBeenCalled();
    expect(starReturn).not.toHaveBeenCalled();
  });

  it('builds exactly one budget per STAR direction and no mesh budget', () => {
    resolveCanonicalGeoRoute(baseInput({ linkMode: 'STAR_FORWARD' }));

    expect(starForward).toHaveBeenCalledTimes(1);
    expect(starReturn).toHaveBeenCalledTimes(1);
    expect(mesh).not.toHaveBeenCalled();
  });
});
