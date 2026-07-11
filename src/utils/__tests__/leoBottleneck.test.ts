import { describe, expect, it } from 'vitest';

import {
  chooseMainBottleneck,
  deriveModcodBottleneckThresholds,
  detectThroughputBottleneck,
} from '../leoBottleneck';
import { ENGINEERING_MODCOD_TABLE, type ModcodTableConfig } from '../leoLinkBudget';
import type { LeoThroughputLeg } from '../../types/leoThroughput';

function makeLeg(overrides: {
  cnDb: number;
  rfChainThroughputMbps?: number;
  modcod?: string | null;
  terminalScanLossDb?: number;
  network?: Partial<LeoThroughputLeg['network']>;
}): LeoThroughputLeg {
  return {
    direction: 'downlink',
    label: 'Downlink',
    rf: {
      effectiveEirpDb: 54,
      receiverGtDbK: 12,
      rawTerminalRfDb: 12,
      terminalScanLossDb: overrides.terminalScanLossDb ?? 0,
      scanLossDb: 0,
      weatherLossDb: 0,
      fsplDb: 175,
      cnDb: overrides.cnDb,
      modcod: overrides.modcod === undefined ? '32APSK 3/4' : overrides.modcod,
      modcodTableId: ENGINEERING_MODCOD_TABLE.id,
      modcodTableLabel: ENGINEERING_MODCOD_TABLE.label,
      modcodTableSourceNote: ENGINEERING_MODCOD_TABLE.sourceNote,
      slantRangeKm: 1300,
      referenceBandwidthHz: 50e6,
      usableBandwidthHz: 250e6,
      rfChainThroughputMbps: overrides.rfChainThroughputMbps ?? 187.5,
    },
    network: {
      peakRfMbps: 195,
      terminalCapMbps: 195,
      activeUsers: 1,
      beamSharingMbps: 195,
      feederCapacityMbps: 930,
      feederMarginDb: 11.5,
      feederLimited: false,
      handoverFactor: 1,
      handoverMbps: 195,
      smoothingAlpha: 0.3,
      finalUserMbps: 195,
      bottleneck: null,
      ...overrides.network,
    },
  };
}

describe('deriveModcodBottleneckThresholds — L-Mo8: table-derived, not hardcoded', () => {
  it('reproduces the former literals for the current DVB-S2X-like table', () => {
    const thresholds = deriveModcodBottleneckThresholds(ENGINEERING_MODCOD_TABLE);
    expect(thresholds.rfLimitedBelowDb).toBe(14.5); // 16APSK 3/4 — upper-half boundary
    expect(thresholds.topModcodThresholdDb).toBe(18.5); // 32APSK 3/4 — top entry
  });

  it('tracks a swapped MODCOD table instead of stale literals', () => {
    const customTable: ModcodTableConfig = {
      id: 'custom',
      label: 'custom',
      metric: 'C/N',
      sourceNote: 'test',
      entries: [
        { name: 'A', cnThresholdDb: 2, spectralEfficiencyBpHz: 1 },
        { name: 'B', cnThresholdDb: 6, spectralEfficiencyBpHz: 2 },
        { name: 'C', cnThresholdDb: 10, spectralEfficiencyBpHz: 3 },
        { name: 'D', cnThresholdDb: 14, spectralEfficiencyBpHz: 4 },
      ],
    };
    const thresholds = deriveModcodBottleneckThresholds(customTable);
    expect(thresholds.rfLimitedBelowDb).toBe(10); // entries[ceil(4/2)] = entries[2]
    expect(thresholds.topModcodThresholdDb).toBe(14);
  });
});

describe('detectThroughputBottleneck attribution', () => {
  it('attributes to rf when the link does not close or C/N is in the lower half', () => {
    expect(detectThroughputBottleneck(makeLeg({ cnDb: 3, rfChainThroughputMbps: 0, modcod: null }))).toBe('rf');
    expect(detectThroughputBottleneck(makeLeg({ cnDb: 12 }))).toBe('rf');
  });

  it('attributes to modcod when C/N closes mid-table but not the top entry', () => {
    expect(detectThroughputBottleneck(makeLeg({ cnDb: 16, modcod: '16APSK 7/8' }))).toBe('modcod');
  });

  it('attributes to scan loss before modcod', () => {
    expect(detectThroughputBottleneck(makeLeg({ cnDb: 16, terminalScanLossDb: -4 }))).toBe('scan loss');
  });

  it('attributes to beam sharing under heavy load at top MODCOD', () => {
    const leg = makeLeg({
      cnDb: 20,
      network: { peakRfMbps: 195, beamSharingMbps: 20, handoverMbps: 20, finalUserMbps: 20, terminalCapMbps: 250 },
    });
    expect(detectThroughputBottleneck(leg)).toBe('beam sharing');
  });

  it("attributes to feeder when the Ka feeder bounded the beam pool (L-O2, formerly 'backhaul')", () => {
    const leg = makeLeg({
      cnDb: 20,
      network: { feederCapacityMbps: 375, feederMarginDb: 2.9, feederLimited: true },
    });
    expect(detectThroughputBottleneck(leg)).toBe('feeder');
  });

  it('chooseMainBottleneck merges identical factors into DL+UL scope', () => {
    const dl = makeLeg({ cnDb: 12 });
    const ul = makeLeg({ cnDb: 12 });
    expect(chooseMainBottleneck(dl, ul)).toEqual({ factor: 'rf', scope: 'DL+UL', label: 'DL+UL rf' });
  });
});
