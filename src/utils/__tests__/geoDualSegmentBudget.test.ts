/**
 * geoDualSegmentBudget — RF data-flow integration tests.
 *
 * Verifies that terminal RF class and custom params correctly propagate
 * into every link budget calculation across all GEO topologies.
 *
 * Candidate C/N baselines used by geoCoverageSelection:
 *   Uplink   candidates: DEFAULT_TERMINAL.eirpTerminalDbw = 44.0 dBW
 *   Downlink candidates: getTerminalDownlinkGT('Ku')       = 17.0 dB/K
 *
 * These baselines define what adjDb=0 means for each segment builder.
 */
import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { TrafficTeleportCapability } from '../geoGroundInfrastructure';
import {
  buildStarForwardResult,
  buildStarReturnResult,
  buildMeshResult,
} from '../geoDualSegmentBudget';
import { resolveTerminalRFParams } from '../geoTerminalRFModel';
import type { TerminalRFCustomParams } from '../geoTerminalRFModel';

// ─── Test fixtures ─────────────────────────────────────────────────────────────

const BASE_UL_CN_DB  = 5;   // candidate C/N for an uplink candidate
const BASE_DL_CN_DB  = 10;  // candidate C/N for a downlink candidate
const BASE_DL_MARGIN = 2;
const BASE_UL_MARGIN = -3;

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
    cnDb: BASE_DL_CN_DB,
    linkMarginDb: BASE_DL_MARGIN,
    latencyMs: 560,
    status: 'available',
    scoreBreakdown: { elevation: 0, linkMargin: 0, throughput: 0, latency: 0, total: 0 },
    score: 0,
    ...overrides,
  };
}

function makeUlCandidate(overrides: Partial<CandidateCoverage> = {}): CandidateCoverage {
  return {
    satelliteId: 'SAT-1',
    satelliteName: 'Test Sat',
    missionName: 'Ku-band',
    coverageKey: 'SAT-1::ul',
    coverageName: 'Test UL Coverage',
    beamId: 'beam-1',
    beamName: 'beam',
    elevation: 40,
    distanceFromBeamCenter: 0,
    throughputEstimate: 50,
    level: 6,
    isUplink: true,
    isSynthesized: false,
    eirpDbw: undefined,
    gtDbk: 6,
    band: 'Ku',
    frequencyGhz: 14,
    bandwidthMhz: 36,
    atmosphericLossDb: 1.5,
    slantRangeKm: 37500,
    cnDb: BASE_UL_CN_DB,
    linkMarginDb: BASE_UL_MARGIN,
    latencyMs: 560,
    status: 'available',
    scoreBreakdown: { elevation: 0, linkMargin: 0, throughput: 0, latency: 0, total: 0 },
    score: 0,
    ...overrides,
  };
}

const GATEWAY: TrafficTeleportCapability = {
  capabilityId: 'test-01-traffic-teleport',
  siteId: 'test-01',
  kind: 'TRAFFIC_TELEPORT',
  confidence: 'PUBLICLY_LIKELY',
  supportedSatellites: ['SAT-1'],
  trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
  rfCapabilities: [],
  eligibleServiceClasses: ['STAR_FORWARD', 'STAR_RETURN'],
};

// ─── A. STAR_FORWARD ──────────────────────────────────────────────────────────

describe('STAR_FORWARD — terminal G/T affects downlink C/N', () => {
  it('low-G/T terminal reduces downlink C/N vs default baseline', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const resultDefault = buildStarForwardResult(dl, ul, GATEWAY, 'User');
    const resultLowGT   = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_compact_vsat');

    // ku_compact_vsat G/T < baseline (17.0) → downlink C/N must decrease
    expect(resultDefault).not.toBeNull();
    expect(resultLowGT).not.toBeNull();
    expect(resultLowGT!.forward.downlink.effectiveCNDb)
      .toBeLessThan(resultDefault!.forward.downlink.effectiveCNDb);
  });

  it('high-G/T terminal increases downlink C/N vs default baseline', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const resultDefault  = buildStarForwardResult(dl, ul, GATEWAY, 'User');
    const resultHighGT   = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_enterprise_vsat');

    // ku_enterprise_vsat G/T >> 17.0 → downlink C/N must increase
    expect(resultHighGT!.forward.downlink.effectiveCNDb)
      .toBeGreaterThan(resultDefault!.forward.downlink.effectiveCNDb);
  });

  it('C/N difference between low and high G/T class matches computed G/T delta', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const profileLow  = resolveTerminalRFParams('Ku', 'ku_compact_vsat');
    const profileHigh = resolveTerminalRFParams('Ku', 'ku_enterprise_vsat');
    const expectedDelta = profileHigh.gtDbk - profileLow.gtDbk;

    const resultLow  = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const resultHigh = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_enterprise_vsat');

    const actualDelta =
      resultHigh!.forward.downlink.effectiveCNDb -
      resultLow!.forward.downlink.effectiveCNDb;

    expect(actualDelta).toBeCloseTo(expectedDelta, 2);
  });

  it('terminal BUC change does NOT affect forward downlink C/N', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();
    const base: TerminalRFCustomParams = {
      antennaDiameterM: 1.2, antennaEfficiency: 0.6,
      bucPowerW: 4, systemLossDb: 1.5, systemNoiseTempK: 250,
    };
    const highBUC: TerminalRFCustomParams = { ...base, bucPowerW: 40 };

    const rBase    = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', base);
    const rHighBUC = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', highBUC);

    // BUC change → EIRP changes but G/T is identical → forward downlink must be unaffected
    expect(rHighBUC!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(rBase!.forward.downlink.effectiveCNDb, 5);
  });

  it('forward uplink C/N is NOT affected by terminal RF class (gateway is uplink source)', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const rCompact    = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const rEnterprise = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_enterprise_vsat');

    expect(rCompact!.forward.uplink.effectiveCNDb)
      .toBeCloseTo(rEnterprise!.forward.uplink.effectiveCNDb, 5);
  });

  it('exposes the consumed TRAFFIC_TELEPORT capability for ENG display', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const result = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, undefined, undefined, 'Rambouillet');

    expect(result?.trafficTeleportEndpoint?.label).toBe('Rambouillet');
    expect(result?.trafficTeleportEndpoint?.capability.kind).toBe('TRAFFIC_TELEPORT');
    expect(result?.trafficTeleportEndpoint?.capability.capabilityId).toBe('test-01-traffic-teleport');
    expect(result?.trafficTeleportEndpoint?.capability.confidence).toBe('PUBLICLY_LIKELY');
  });

  it('detailed panel destination G/T reflects selected RF class, not hardcoded 17 dB/K', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const profileLow  = resolveTerminalRFParams('Ku', 'ku_compact_vsat');
    const profileHigh = resolveTerminalRFParams('Ku', 'ku_enterprise_vsat');

    const rLow  = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const rHigh = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_enterprise_vsat');

    expect(rLow!.forward.downlink.destination.gtDbk).toBeCloseTo(profileLow.gtDbk, 1);
    expect(rHigh!.forward.downlink.destination.gtDbk).toBeCloseTo(profileHigh.gtDbk, 1);
    // Verify they are different from each other and from the legacy hardcoded 17.0
    expect(rLow!.forward.downlink.destination.gtDbk).not.toBeCloseTo(17.0, 1);
    expect(rHigh!.forward.downlink.destination.gtDbk).not.toBeCloseTo(17.0, 1);
  });

  // GEO-1 regression: the user's local weather fade must apply only to the
  // downlink (user) segment, never to the uplink (gateway feeder) segment —
  // the app has no independent weather model for the gateway site.
  it('applies weather fade only to the user-facing downlink segment, not the gateway uplink segment', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();
    const fadeDb = 6;

    const clear = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined);
    const storm = buildStarForwardResult(dl, ul, GATEWAY, 'User', fadeDb);

    expect(storm!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(clear!.forward.downlink.effectiveCNDb - fadeDb, 5);
    expect(storm!.forward.uplink.effectiveCNDb)
      .toBeCloseTo(clear!.forward.uplink.effectiveCNDb, 5);
  });
});

// ─── B. STAR_RETURN ───────────────────────────────────────────────────────────

describe('STAR_RETURN — terminal EIRP affects uplink C/N', () => {
  it('higher-EIRP terminal increases uplink C/N', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, gtDbk: undefined, eirpDbw: 50, cnDb: 8 });

    const rCompact  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const rStandard = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat');

    expect(rStandard!.forward.uplink.effectiveCNDb)
      .toBeGreaterThan(rCompact!.forward.uplink.effectiveCNDb);
  });

  it('uplink C/N delta equals EIRP delta between two RF classes', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });

    const pCompact  = resolveTerminalRFParams('Ku', 'ku_compact_vsat');
    const pStandard = resolveTerminalRFParams('Ku', 'ku_standard_vsat');
    const expectedDelta = pStandard.eirpDbw - pCompact.eirpDbw;

    const rCompact  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const rStandard = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat');

    const actualDelta =
      rStandard!.forward.uplink.effectiveCNDb -
      rCompact!.forward.uplink.effectiveCNDb;

    expect(actualDelta).toBeCloseTo(expectedDelta, 2);
  });

  it('gateway downlink C/N is not affected by terminal RF class change', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });

    const rCompact  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    const rStandard = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat');

    expect(rCompact!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(rStandard!.forward.downlink.effectiveCNDb, 5);
  });

  it('exposes the consumed TRAFFIC_TELEPORT capability for return-path ENG display', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });

    const result = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, undefined, undefined, 'Rambouillet');

    expect(result?.trafficTeleportEndpoint?.label).toBe('Rambouillet');
    expect(result?.trafficTeleportEndpoint?.capability.kind).toBe('TRAFFIC_TELEPORT');
    expect(result?.trafficTeleportEndpoint?.capability.capabilityId).toBe('test-01-traffic-teleport');
    expect(result?.trafficTeleportEndpoint?.capability.trafficEligibility).toBe('ELIGIBLE_PUBLICLY_LIKELY');
  });

  it('increasing receiver noise temp does NOT change uplink C/N', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });
    const baseParms: TerminalRFCustomParams = {
      antennaDiameterM: 1.2, antennaEfficiency: 0.6,
      bucPowerW: 4, systemLossDb: 1.5, systemNoiseTempK: 250,
    };
    const hotReceiver: TerminalRFCustomParams = { ...baseParms, systemNoiseTempK: 1000 };

    const rBase = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', baseParms);
    const rHot  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', hotReceiver);

    // Noise temp changes G/T but not EIRP → uplink C/N must be equal
    expect(rHot!.forward.uplink.effectiveCNDb)
      .toBeCloseTo(rBase!.forward.uplink.effectiveCNDb, 5);
  });

  // GEO-1 regression: the user's local weather fade must apply only to the
  // uplink (user) segment, never to the downlink (gateway) segment.
  it('applies weather fade only to the user-facing uplink segment, not the gateway downlink segment', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });
    const fadeDb = 6;

    const clear = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined);
    const storm = buildStarReturnResult(ul, dl, GATEWAY, 'User', fadeDb);

    expect(storm!.forward.uplink.effectiveCNDb)
      .toBeCloseTo(clear!.forward.uplink.effectiveCNDb - fadeDb, 5);
    expect(storm!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(clear!.forward.downlink.effectiveCNDb, 5);
  });
});

// ─── C. MESH ─────────────────────────────────────────────────────────────────

describe('MESH — directional RF sensitivity', () => {
  function makeSymmetricMesh(
    terminalTypeA = 'ku_standard_vsat',
    terminalTypeB = 'ku_standard_vsat',
    customParamsA?: TerminalRFCustomParams | null,
    customParamsB?: TerminalRFCustomParams | null,
  ) {
    const ulA = makeUlCandidate({ coverageKey: 'SAT-1::ulA', coverageName: 'UL-A' });
    const dlB = makeDlCandidate({ coverageKey: 'SAT-1::dlB', coverageName: 'DL-B' });
    const ulB = makeUlCandidate({ coverageKey: 'SAT-1::ulB', coverageName: 'UL-B' });
    const dlA = makeDlCandidate({ coverageKey: 'SAT-1::dlA', coverageName: 'DL-A' });
    return buildMeshResult(
      ulA, dlB, ulB, dlA,
      { pointA: 'Point A', pointB: 'Point B' },
      terminalTypeA, terminalTypeB,
      undefined, undefined, customParamsA, customParamsB,
    );
  }

  // A.1: A→B forward — Terminal A EIRP
  it('increasing Terminal A EIRP improves A→B uplink C/N only', () => {
    const rLow  = makeSymmetricMesh('ku_compact_vsat',  'ku_standard_vsat');
    const rHigh = makeSymmetricMesh('ku_enterprise_vsat', 'ku_standard_vsat');

    expect(rHigh.forward.uplink.effectiveCNDb)
      .toBeGreaterThan(rLow.forward.uplink.effectiveCNDb);
    // B→A reverse uplink (Terminal B) is unaffected
    expect(rHigh.reverse!.uplink.effectiveCNDb)
      .toBeCloseTo(rLow.reverse!.uplink.effectiveCNDb, 5);
  });

  // A.2: A→B forward — Terminal B G/T
  it('improving Terminal B G/T improves A→B downlink C/N only', () => {
    const rLow  = makeSymmetricMesh('ku_standard_vsat', 'ku_compact_vsat');
    const rHigh = makeSymmetricMesh('ku_standard_vsat', 'ku_enterprise_vsat');

    expect(rHigh.forward.downlink.effectiveCNDb)
      .toBeGreaterThan(rLow.forward.downlink.effectiveCNDb);
    // A→B uplink (Terminal A) is unaffected
    expect(rHigh.forward.uplink.effectiveCNDb)
      .toBeCloseTo(rLow.forward.uplink.effectiveCNDb, 5);
  });

  // A.3: B→A reverse — Terminal B EIRP
  it('increasing Terminal B EIRP improves B→A uplink C/N only', () => {
    const rLow  = makeSymmetricMesh('ku_standard_vsat', 'ku_compact_vsat');
    const rHigh = makeSymmetricMesh('ku_standard_vsat', 'ku_enterprise_vsat');

    expect(rHigh.reverse!.uplink.effectiveCNDb)
      .toBeGreaterThan(rLow.reverse!.uplink.effectiveCNDb);
    // A→B downlink (Terminal B receive) also affected by G/T change — check it separately
  });

  // A.4: B→A reverse — Terminal A G/T
  it('improving Terminal A G/T improves B→A downlink C/N only', () => {
    const rLow  = makeSymmetricMesh('ku_compact_vsat',  'ku_standard_vsat');
    const rHigh = makeSymmetricMesh('ku_enterprise_vsat', 'ku_standard_vsat');

    expect(rHigh.reverse!.downlink.effectiveCNDb)
      .toBeGreaterThan(rLow.reverse!.downlink.effectiveCNDb);
    // B→A uplink (Terminal B) is unaffected
    expect(rHigh.reverse!.uplink.effectiveCNDb)
      .toBeCloseTo(rLow.reverse!.uplink.effectiveCNDb, 5);
  });

  it('C/N deltas match computed RF profile differences', () => {
    const pCompact    = resolveTerminalRFParams('Ku', 'ku_compact_vsat');
    const pEnterprise = resolveTerminalRFParams('Ku', 'ku_enterprise_vsat');

    const rLow  = makeSymmetricMesh('ku_compact_vsat',  'ku_compact_vsat');
    const rHigh = makeSymmetricMesh('ku_enterprise_vsat', 'ku_enterprise_vsat');

    const expectedUplinkDelta   = pEnterprise.eirpDbw - pCompact.eirpDbw;
    const expectedDownlinkDelta = pEnterprise.gtDbk   - pCompact.gtDbk;

    expect(rHigh.forward.uplink.effectiveCNDb - rLow.forward.uplink.effectiveCNDb)
      .toBeCloseTo(expectedUplinkDelta, 2);
    expect(rHigh.forward.downlink.effectiveCNDb - rLow.forward.downlink.effectiveCNDb)
      .toBeCloseTo(expectedDownlinkDelta, 2);
  });
});

// ─── D. POINT_TO_POINT (uses buildMeshResult) ─────────────────────────────────

describe('POINT_TO_POINT — same RF dependency rules as MESH', () => {
  it('both directions update when RF class changes', () => {
    const ulA = makeUlCandidate({ coverageKey: 'SAT-1::ulA' });
    const dlB = makeDlCandidate({ coverageKey: 'SAT-1::dlB' });
    const ulB = makeUlCandidate({ coverageKey: 'SAT-1::ulB' });
    const dlA = makeDlCandidate({ coverageKey: 'SAT-1::dlA' });

    const rCompact    = buildMeshResult(ulA, dlB, ulB, dlA, undefined, 'ku_compact_vsat',    'ku_compact_vsat');
    const rEnterprise = buildMeshResult(ulA, dlB, ulB, dlA, undefined, 'ku_enterprise_vsat', 'ku_enterprise_vsat');

    expect(rEnterprise.forward.uplink.effectiveCNDb)
      .toBeGreaterThan(rCompact.forward.uplink.effectiveCNDb);
    expect(rEnterprise.forward.downlink.effectiveCNDb)
      .toBeGreaterThan(rCompact.forward.downlink.effectiveCNDb);
    expect(rEnterprise.reverse!.uplink.effectiveCNDb)
      .toBeGreaterThan(rCompact.reverse!.uplink.effectiveCNDb);
    expect(rEnterprise.reverse!.downlink.effectiveCNDb)
      .toBeGreaterThan(rCompact.reverse!.downlink.effectiveCNDb);
  });
});

// ─── E. Custom params ─────────────────────────────────────────────────────────

describe('custom params — physical parameter sensitivity', () => {
  const baseParams: TerminalRFCustomParams = {
    antennaDiameterM: 1.2, antennaEfficiency: 0.6,
    bucPowerW: 4, systemLossDb: 1.5, systemNoiseTempK: 250,
  };

  it('increasing BUC power raises EIRP (STAR_RETURN uplink C/N increases)', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });

    const rBase  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', baseParams);
    const rMoreW = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', { ...baseParams, bucPowerW: 40 });

    expect(rMoreW!.forward.uplink.effectiveCNDb)
      .toBeGreaterThan(rBase!.forward.uplink.effectiveCNDb);
  });

  it('increasing BUC power does NOT change terminal G/T (STAR_FORWARD downlink unchanged)', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const rBase  = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', baseParams);
    const rMoreW = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', { ...baseParams, bucPowerW: 40 });

    expect(rMoreW!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(rBase!.forward.downlink.effectiveCNDb, 5);
  });

  it('increasing receiver noise temperature reduces G/T (STAR_FORWARD downlink decreases)', () => {
    const dl = makeDlCandidate();
    const ul = makeUlCandidate();

    const rBase = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', baseParams);
    const rHot  = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_standard_vsat', { ...baseParams, systemNoiseTempK: 2000 });

    expect(rHot!.forward.downlink.effectiveCNDb)
      .toBeLessThan(rBase!.forward.downlink.effectiveCNDb);
  });

  it('increasing receiver noise temperature does NOT change uplink EIRP (STAR_RETURN uplink unchanged)', () => {
    const ul = makeUlCandidate();
    const dl = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });

    const rBase = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', baseParams);
    const rHot  = buildStarReturnResult(ul, dl, GATEWAY, 'User', undefined, 'ku_standard_vsat', { ...baseParams, systemNoiseTempK: 2000 });

    expect(rHot!.forward.uplink.effectiveCNDb)
      .toBeCloseTo(rBase!.forward.uplink.effectiveCNDb, 5);
  });

  it('larger antenna diameter increases both EIRP and G/T', () => {
    const pSmall = resolveTerminalRFParams('Ku', 'ku_standard_vsat', { ...baseParams, antennaDiameterM: 0.6 });
    const pLarge = resolveTerminalRFParams('Ku', 'ku_standard_vsat', { ...baseParams, antennaDiameterM: 2.4 });

    expect(pLarge.eirpDbw).toBeGreaterThan(pSmall.eirpDbw);
    expect(pLarge.gtDbk).toBeGreaterThan(pSmall.gtDbk);
  });

  it('larger antenna diameter improves both STAR_FORWARD downlink and STAR_RETURN uplink', () => {
    const smallDish: TerminalRFCustomParams = { ...baseParams, antennaDiameterM: 0.6 };
    const largeDish: TerminalRFCustomParams = { ...baseParams, antennaDiameterM: 2.4 };

    const dlFwd = makeDlCandidate();
    const ulGw  = makeUlCandidate();
    const rSmall = buildStarForwardResult(dlFwd, ulGw, GATEWAY, 'User', undefined, 'ku_standard_vsat', smallDish);
    const rLarge = buildStarForwardResult(dlFwd, ulGw, GATEWAY, 'User', undefined, 'ku_standard_vsat', largeDish);
    expect(rLarge!.forward.downlink.effectiveCNDb)
      .toBeGreaterThan(rSmall!.forward.downlink.effectiveCNDb);

    const ulRet = makeUlCandidate();
    const dlGw  = makeDlCandidate({ isUplink: false, eirpDbw: 50, cnDb: 8 });
    const rSmallR = buildStarReturnResult(ulRet, dlGw, GATEWAY, 'User', undefined, 'ku_standard_vsat', smallDish);
    const rLargeR = buildStarReturnResult(ulRet, dlGw, GATEWAY, 'User', undefined, 'ku_standard_vsat', largeDish);
    expect(rLargeR!.forward.uplink.effectiveCNDb)
      .toBeGreaterThan(rSmallR!.forward.uplink.effectiveCNDb);
  });

  it('lower antenna efficiency reduces both EIRP and G/T', () => {
    const pHigh = resolveTerminalRFParams('Ku', 'ku_standard_vsat', { ...baseParams, antennaEfficiency: 0.75 });
    const pLow  = resolveTerminalRFParams('Ku', 'ku_standard_vsat', { ...baseParams, antennaEfficiency: 0.30 });

    expect(pLow.eirpDbw).toBeLessThan(pHigh.eirpDbw);
    expect(pLow.gtDbk).toBeLessThan(pHigh.gtDbk);
  });

  it('adjustmentDb in STAR_FORWARD downlink equals (terminalGT - baseline)', () => {
    const dl = makeDlCandidate({ cnDb: 0 });
    const ul = makeUlCandidate();
    const profile = resolveTerminalRFParams('Ku', 'ku_compact_vsat');

    const result = buildStarForwardResult(dl, ul, GATEWAY, 'User', undefined, 'ku_compact_vsat');
    // cnDb=0, so effectiveCNDb equals the adjustment
    const kuBaseline = 17.0; // getTerminalDownlinkGT('Ku') for 'fixed'
    expect(result!.forward.downlink.effectiveCNDb)
      .toBeCloseTo(profile.gtDbk - kuBaseline, 1);
    expect(result!.forward.downlink.adjustmentDb)
      .toBeCloseTo(profile.gtDbk - kuBaseline, 1);
  });
});
