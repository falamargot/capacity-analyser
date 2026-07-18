import type { DualSegmentResult } from '../../geoDualSegmentBudget';
import type { LeoSiteToSiteResult } from '../../leoSiteToSiteModel';
import type { LeoThroughputLeg, LeoThroughputResult } from '../../../types/leoThroughput';

export const geoSegment = (marginDb: number, cnDb = 18) => ({
  source: { label: 'Gateway' },
  destination: { label: 'Site A' },
  candidate: {
    satelliteName: 'EUTELSAT TEST',
    coverageName: 'Ku Europe',
  },
  effectiveCNDb: cnDb,
  effectiveLinkMarginDb: marginDb,
  adjustmentDb: 0,
});

const geoEndToEnd = (marginDb: number) => ({
  uplinkCNDb: marginDb < 0 ? 8 : 18,
  downlinkCNDb: marginDb < 0 ? 14 : 20,
  endToEndCNDb: marginDb < 0 ? 7 : 16,
  limitingSegment: marginDb < 0 ? 'uplink' : 'downlink',
  endToEndModcod: marginDb < 0 ? 'QPSK 1/4' : '16APSK 3/4',
  endToEndSpectralEfficiency: marginDb < 0 ? 0.49 : 2.7,
  endToEndThroughputMbps: marginDb < 0 ? 0 : 187,
  endToEndLinkMarginDb: marginDb,
  bandwidthMhz: 72,
});

const geoNetworkLayerDirection = (marginDb: number, finalThroughputMbps: number) => ({
  peakRfMbps: marginDb < 0 ? 0 : 187,
  protocolEfficiency: 0.92,
  protocolAdjustedMbps: marginDb < 0 ? 0 : 172,
  contentionRatio: marginDb < 0 ? 1 : 4.2,
  finalThroughputMbps: marginDb < 0 ? 0 : finalThroughputMbps,
  limitingFactor: marginDb < 0 ? 'rf_margin' : 'shared_capacity',
});

/**
 * DualSegmentResult fixture. `withReverse` populates the reverse path
 * (MESH / POINT_TO_POINT) with deliberately different numbers than forward so
 * direction-dependent reads are visible in golden snapshots.
 */
export const makeGeoResult = (
  marginDb: number,
  { withReverse = false }: { withReverse?: boolean } = {},
): DualSegmentResult => {
  const reverseMarginDb = marginDb - 0.6;
  return {
    forward: {
      uplink: geoSegment(marginDb, marginDb < 0 ? 8 : 18),
      downlink: geoSegment(marginDb + 1, marginDb < 0 ? 14 : 20),
      endToEnd: geoEndToEnd(marginDb),
    },
    ...(withReverse
      ? {
          reverse: {
            uplink: geoSegment(reverseMarginDb, reverseMarginDb < 0 ? 7 : 16),
            downlink: geoSegment(reverseMarginDb + 1, reverseMarginDb < 0 ? 13 : 19),
            endToEnd: {
              ...geoEndToEnd(reverseMarginDb),
              endToEndThroughputMbps: reverseMarginDb < 0 ? 0 : 141,
            },
          },
        }
      : {}),
    networkLayer: {
      forward: geoNetworkLayerDirection(marginDb, 18),
      ...(withReverse
        ? { reverse: geoNetworkLayerDirection(reverseMarginDb, 13) }
        : {}),
    },
  } as unknown as DualSegmentResult;
};

export const terminal = {
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

export const makeLeoLeg = (
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

export const makeLeoResult = (
  finalDownlinkMbps = 18,
  finalUplinkMbps = 12,
  limited = false,
): LeoThroughputResult => {
  const factor = finalDownlinkMbps <= 0 || finalUplinkMbps <= 0 ? 'rf' : limited ? 'beam sharing' : null;
  return {
    satelliteId: 'ONEWEB-TEST',
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
      scope: factor ? (finalDownlinkMbps <= finalUplinkMbps ? 'DL' : 'UL') : 'none',
      label: factor === 'rf' ? 'DL RF' : factor === 'beam sharing' ? 'DL beam sharing' : 'None',
    },
  };
};

/**
 * Partial LeoSiteToSiteResult cast, matching the established fixture pattern:
 * only the fields the view-model builder reads are populated.
 */
export const makeLeoSiteToSiteResult = (
  overrides: Partial<LeoSiteToSiteResult> = {},
): LeoSiteToSiteResult => ({
  serviceAvailable: true,
  serviceStatus: 'ALLOWED',
  failureReason: null,
  finalThroughputAtoBMbps: 18,
  finalThroughputBtoAMbps: 12,
  oneWayLatencyAtoBMs: 60,
  oneWayLatencyBtoAMs: 62,
  ...overrides,
} as LeoSiteToSiteResult);
