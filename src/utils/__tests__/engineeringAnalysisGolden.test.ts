import { describe, expect, it } from 'vitest';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  type EngineeringAnalysisViewModel,
} from '../engineeringAnalysisViewModel';
import {
  makeGeoResult,
  makeLeoResult,
  makeLeoSiteToSiteResult,
} from './fixtures/engineeringViewModelFixtures';
import { activeGeoServiceDirection, resolveGeoRouteDelivery } from '../geoDeliveryChain';
import { getGeoModemProfile, type GeoModemId } from '../geoModemCatalogue';
import type { DualSegmentResult } from '../geoDualSegmentBudget';
import type { LinkMode } from '../../types/linkMode';

/**
 * Runs the REAL delivery chain and returns the props the hook passes to the builder.
 * The goldens therefore freeze modem-limited figures with their true provenance,
 * instead of the raw un-modem-limited RF the builder used to fall back to.
 */
function deliveryProps(
  linkMode: LinkMode,
  result: DualSegmentResult,
  options: {
    activeMeshTab?: 'forward' | 'reverse';
    modemA?: GeoModemId | null;
    modemB?: GeoModemId | null;
  } = {},
) {
  const isSiteToSite = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const delivery = resolveGeoRouteDelivery({
    linkMode,
    forwardResult: isSiteToSite || linkMode === 'STAR_FORWARD' ? result : null,
    reverseResult: isSiteToSite || linkMode === 'STAR_RETURN' ? result : null,
    modemA: getGeoModemProfile(options.modemA ?? null),
    modemB: getGeoModemProfile(options.modemB ?? null),
  });
  const active = delivery[activeGeoServiceDirection(linkMode, options.activeMeshTab)];
  return {
    deliveredThroughputMbps: active.throughputMbps,
    throughputEstimated: active.isEstimatedCeiling,
    forwardThroughputMbps: delivery.forward.throughputMbps,
    reverseThroughputMbps: delivery.reverse.throughputMbps,
    forwardThroughputEstimated: delivery.forward.isEstimatedCeiling,
    reverseThroughputEstimated: delivery.reverse.isEstimatedCeiling,
  };
}

/**
 * M0 golden freeze of the published engineering contract.
 *
 * These snapshots pin the COMPLETE view model (truth, cause chain, closure
 * steps, details, quick references) for the full GEO/LEO scenario matrix.
 * They exist to make refactors of the presentation architecture (M1–M7)
 * provably semantics-preserving: any intentional change to wording, states,
 * metrics, provenance or evidence must show up as a reviewed snapshot diff.
 *
 * Inputs mirror what CapacityDetails passes to the builders today, so the
 * frozen shapes are the ones real surfaces render.
 */

const geoScenarios: Array<{ name: string; viewModel: () => EngineeringAnalysisViewModel }> = [
  {
    name: 'geo-star-forward-constrained',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      ...deliveryProps('STAR_FORWARD', makeGeoResult(4.5)),
      satelliteName: 'EUTELSAT TEST',
      latencyMs: 548,
      latencyLabel: 'Forward latency',
      availabilityLabel: '99.2% indicative',
      confidenceLabel: 'High 89/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'ALLOWED',
      serviceReason: 'Traffic gateway Rambouillet serves this beam',
      serviceEvidence: [
        { label: 'Traffic gateway', value: 'Rambouillet', state: 'passed' },
        { label: 'Capability', value: 'RBT-KU-01', state: 'passed' },
      ],
    }),
  },
  {
    name: 'geo-star-return-degraded-low-margin',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_RETURN',
      result: makeGeoResult(0.8),
      ...deliveryProps('STAR_RETURN', makeGeoResult(0.8)),
      satelliteName: 'EUTELSAT TEST',
      latencyMs: 552,
      latencyLabel: 'Return latency',
      confidenceLabel: 'Medium 71/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'ALLOWED',
      serviceReason: 'Traffic gateway Rambouillet serves this beam',
      serviceEvidence: [
        { label: 'Traffic gateway', value: 'Rambouillet', state: 'passed' },
        { label: 'Capability', value: 'RBT-KU-01', state: 'passed' },
      ],
    }),
  },
  {
    name: 'geo-mesh-forward',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: makeGeoResult(3.2, { withReverse: true }),
      activeMeshTab: 'forward',
      ...deliveryProps('MESH', makeGeoResult(3.2, { withReverse: true }), { activeMeshTab: 'forward' }),
      latencyMs: 271,
      latencyLabel: 'A → B latency',
      confidenceLabel: 'High 84/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'NOT_EVALUATED',
      serviceReason: 'Site-to-site GEO uses no shared service gate',
    }),
  },
  {
    name: 'geo-mesh-reverse',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: makeGeoResult(3.2, { withReverse: true }),
      activeMeshTab: 'reverse',
      ...deliveryProps('MESH', makeGeoResult(3.2, { withReverse: true }), { activeMeshTab: 'reverse' }),
      latencyMs: 273,
      latencyLabel: 'B → A latency',
      confidenceLabel: 'High 84/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'NOT_EVALUATED',
      serviceReason: 'Site-to-site GEO uses no shared service gate',
    }),
  },
  {
    name: 'geo-point-to-point',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'POINT_TO_POINT',
      result: makeGeoResult(4.5, { withReverse: true }),
      activeMeshTab: 'forward',
      ...deliveryProps('POINT_TO_POINT', makeGeoResult(4.5, { withReverse: true }), { activeMeshTab: 'forward' }),
      latencyMs: 268,
      latencyLabel: 'A → B latency',
      scenarioComplete: true,
      pathResolved: true,
    }),
  },
  {
    // Both endpoint modems known ⇒ a modem-limited DELIVERED rate.
    name: 'geo-mesh-modem-limited-delivered',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: makeGeoResult(3.2, { withReverse: true }),
      ...deliveryProps('MESH', makeGeoResult(3.2, { withReverse: true }), {
        activeMeshTab: 'forward',
        modemA: 'idirect_mdm5010',
        modemB: 'idirect_mdm2510',
      }),
      activeMeshTab: 'forward',
      latencyMs: 271,
      latencyLabel: 'A → B latency',
      confidenceLabel: 'High 84/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'NOT_EVALUATED',
      serviceReason: 'Site-to-site GEO uses no shared service gate',
    }),
  },
  {
    // Modems selected but their ceilings are unpublished ⇒ ESTIMATED ceiling.
    name: 'geo-mesh-modem-ceiling-unpublished-estimated',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: makeGeoResult(3.2, { withReverse: true }),
      ...deliveryProps('MESH', makeGeoResult(3.2, { withReverse: true }), {
        activeMeshTab: 'forward',
        modemA: 'idirect_iq200',
        modemB: 'comtech_cdm780',
      }),
      activeMeshTab: 'forward',
      latencyMs: 271,
      latencyLabel: 'A → B latency',
      confidenceLabel: 'High 84/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'NOT_EVALUATED',
      serviceReason: 'Site-to-site GEO uses no shared service gate',
    }),
  },
  {
    // STAR with a known customer AND gateway modem is a delivered rate too.
    name: 'geo-star-forward-gateway-modem-delivered',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      ...deliveryProps('STAR_FORWARD', makeGeoResult(4.5), {
        modemA: 'idirect_mdm5010',
        modemB: 'idirect_mdm2510',
      }),
      satelliteName: 'EUTELSAT TEST',
      latencyMs: 548,
      latencyLabel: 'Forward latency',
      confidenceLabel: 'High 89/100',
      scenarioComplete: true,
      pathResolved: true,
      serviceStatus: 'ALLOWED',
      serviceReason: 'Traffic gateway Rambouillet serves this beam',
    }),
  },
  {
    name: 'geo-star-forward-blocked-negative-margin',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(-1.4),
      ...deliveryProps('STAR_FORWARD', makeGeoResult(-1.4)),
      latencyMs: 548,
      confidenceLabel: 'Medium 74/100',
      scenarioComplete: true,
      pathResolved: true,
    }),
  },
  {
    name: 'geo-incomplete-site-b-required',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: null,
      scenarioComplete: false,
      scenarioIncompleteReason: 'Site B is required',
    }),
  },
  {
    name: 'geo-path-unavailable-no-gateway',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: null,
      scenarioComplete: true,
      pathResolved: false,
      pathReason: 'No eligible traffic gateway path',
    }),
  },
  {
    name: 'geo-budget-unavailable',
    viewModel: () => buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: null,
      scenarioComplete: true,
      pathResolved: true,
    }),
  },
];

const leoServiceEvidence = [
  { label: 'RF', value: 'Available', state: 'passed' as const },
  { label: 'SNP', value: 'Connected', state: 'passed' as const },
  { label: 'Regulatory', value: 'ALLOWED', state: 'passed' as const },
  { label: 'Capacity', value: 'No blocking constraint', state: 'passed' as const },
];

const leoScenarios: Array<{ name: string; viewModel: () => EngineeringAnalysisViewModel }> = [
  {
    name: 'leo-single-available',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SINGLE_SITE',
      latencyMs: 72,
      latencyLabel: 'End-to-end RTT',
      availabilityLabel: '98.6% indicative',
      confidenceLabel: 'High 91/100',
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'ALLOWED',
      serviceEvidence: leoServiceEvidence,
    }),
  },
  {
    name: 'leo-single-constrained-beam-sharing',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12, true),
      topology: 'SINGLE_SITE',
      latencyMs: 74,
      latencyLabel: 'End-to-end RTT',
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'ALLOWED',
      deliveryConstraint: 'Beam sharing',
    }),
  },
  {
    name: 'leo-single-service-blocked-regulatory',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SINGLE_SITE',
      latencyMs: 72,
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'BLOCKED',
      serviceReason: 'Regulatory restriction',
      serviceEvidence: [
        { label: 'RF', value: 'Available', state: 'passed' },
        { label: 'Regulatory', value: 'BLOCKED', state: 'blocked' },
      ],
    }),
  },
  {
    name: 'leo-single-rf-blocked',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SINGLE_SITE',
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'blocked',
      rfReason: 'No active RF beam at Site A',
    }),
  },
  {
    name: 'leo-site-to-site-a-to-b',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SITE_TO_SITE',
      siteToSiteResult: makeLeoSiteToSiteResult(),
      siteToSiteDirection: 'A_TO_B',
      debugInfoSiteA: makeLeoResult(18, 9),
      debugInfoSiteB: makeLeoResult(15, 12),
      snpAName: 'SNP-A',
      snpBName: 'SNP-B',
      popName: 'Core PoP',
      latencyMs: 60,
      latencyLabel: 'A → B latency',
      confidenceLabel: 'High 88/100',
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'ALLOWED',
    }),
  },
  {
    name: 'leo-site-to-site-b-to-a',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SITE_TO_SITE',
      siteToSiteResult: makeLeoSiteToSiteResult(),
      siteToSiteDirection: 'B_TO_A',
      debugInfoSiteA: makeLeoResult(18, 9),
      debugInfoSiteB: makeLeoResult(15, 12),
      snpAName: 'SNP-A',
      snpBName: 'SNP-B',
      popName: 'Core PoP',
      latencyMs: 62,
      latencyLabel: 'B → A latency',
      confidenceLabel: 'High 88/100',
      scenarioComplete: true,
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'ALLOWED',
    }),
  },
  {
    name: 'leo-path-unavailable',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: null,
      topology: 'SINGLE_SITE',
      latencyLabel: 'End-to-end RTT',
      confidenceLabel: 'Low 52/100',
    }),
  },
  {
    name: 'leo-incomplete-site-b-required',
    viewModel: () => buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      topology: 'SITE_TO_SITE',
      scenarioComplete: false,
      scenarioIncompleteReason: 'Site B is required',
    }),
  },
];

describe('M0 golden scenario matrix', () => {
  describe('GEO', () => {
    it.each(geoScenarios)('$name', ({ viewModel }) => {
      expect(viewModel()).toMatchSnapshot();
    });
  });

  describe('LEO', () => {
    it.each(leoScenarios)('$name', ({ viewModel }) => {
      expect(viewModel()).toMatchSnapshot();
    });
  });

  it('mesh direction actually changes the published result (fixture sanity)', () => {
    const forward = geoScenarios.find((item) => item.name === 'geo-mesh-forward')!.viewModel();
    const reverse = geoScenarios.find((item) => item.name === 'geo-mesh-reverse')!.viewModel();
    expect(forward.truth.primaryMetrics).not.toEqual(reverse.truth.primaryMetrics);
  });

  it('s2s direction actually changes the published result (fixture sanity)', () => {
    const aToB = leoScenarios.find((item) => item.name === 'leo-site-to-site-a-to-b')!.viewModel();
    const bToA = leoScenarios.find((item) => item.name === 'leo-site-to-site-b-to-a')!.viewModel();
    expect(aToB.truth.primaryMetrics).not.toEqual(bToA.truth.primaryMetrics);
  });
});
