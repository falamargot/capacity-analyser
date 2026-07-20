/**
 * leoBottleneck.ts — single implementation of LEO throughput bottleneck
 * attribution (LEO audit L-M3/L-Mo8: previously triplicated across
 * activeLeoRouteEvidence and CapacityDetails with hardcoded MODCOD literals).
 *
 * C/N thresholds are DERIVED from the MODCOD table the leg was computed with,
 * so swapping the table cannot silently invalidate the attribution:
 *  - below the table's minimum threshold (or no MODCOD) → the link doesn't
 *    close: 'rf'
 *  - below the upper-half boundary of the table → RF quality is the binding
 *    constraint: 'rf'
 *  - below the top entry's threshold → spectral efficiency is C/N-limited:
 *    'modcod'
 */

import { ENGINEERING_MODCOD_TABLE, type ModcodTableConfig } from './leoLinkBudget';
import type { LeoBottleneckFactor, LeoBottleneckScope, LeoThroughputLeg } from '../types/leoThroughput';

/** Resolve a MODCOD table from the id recorded on an RF leg. */
export function resolveModcodTableById(tableId: string | null | undefined): ModcodTableConfig {
  // Single table today; the id-based lookup keeps leg data self-describing so
  // additional tables can be registered here without touching the detector.
  if (tableId === ENGINEERING_MODCOD_TABLE.id || tableId == null) return ENGINEERING_MODCOD_TABLE;
  return ENGINEERING_MODCOD_TABLE;
}

export interface ModcodBottleneckThresholds {
  /** Below this C/N the link quality itself is the binding constraint (dB). */
  rfLimitedBelowDb: number;
  /** Below this C/N the top MODCOD cannot be selected (dB). */
  topModcodThresholdDb: number;
  /** Below this C/N even the lowest MODCOD can't close — throughput is zero (dB). */
  closingBelowDb: number;
}

/**
 * Derive attribution thresholds from a MODCOD table:
 * rfLimitedBelowDb = threshold of the first entry in the upper half of the
 * table (for the current 6-entry DVB-S2X-like table: 16APSK 3/4 at 14.5 dB);
 * topModcodThresholdDb = threshold of the highest entry (18.5 dB);
 * closingBelowDb = threshold of the lowest entry (5.0 dB) — the actual point
 * below which rfChainThroughputMbps drops to zero.
 */
export function deriveModcodBottleneckThresholds(table: ModcodTableConfig): ModcodBottleneckThresholds {
  const entries = table.entries;
  const upperHalfIndex = Math.min(entries.length - 1, Math.ceil(entries.length / 2));
  return {
    rfLimitedBelowDb: entries[upperHalfIndex]?.cnThresholdDb ?? 0,
    topModcodThresholdDb: entries[entries.length - 1]?.cnThresholdDb ?? 0,
    closingBelowDb: entries[0]?.cnThresholdDb ?? 0,
  };
}

/**
 * Link margin above the lowest closing MODCOD threshold for a single leg —
 * the LEO analogue of GEO's endToEndLinkMarginDb. Below 0 the leg is at or
 * under the point where rfChainThroughputMbps drops to zero. Single owner so
 * every UI surface (verdict gating, "Decisive margin" evidence, per-leg
 * margin badges) reads the same physically-meaningful quantity instead of a
 * hardcoded, MODCOD-agnostic C/N offset.
 */
export function deriveLegLinkMarginDb(leg: LeoThroughputLeg): number {
  const thresholds = deriveModcodBottleneckThresholds(resolveModcodTableById(leg.rf.modcodTableId));
  return leg.rf.cnDb - thresholds.closingBelowDb;
}

export function detectThroughputBottleneck(leg: LeoThroughputLeg): LeoBottleneckFactor {
  const thresholds = deriveModcodBottleneckThresholds(resolveModcodTableById(leg.rf.modcodTableId));
  if (leg.rf.rfChainThroughputMbps <= 0 || leg.rf.cnDb < thresholds.rfLimitedBelowDb) return 'rf';
  if (leg.rf.terminalScanLossDb <= -3) return 'scan loss';
  if (leg.rf.modcod == null || leg.rf.cnDb < thresholds.topModcodThresholdDb) return 'modcod';
  // L-O2: the Ka feeder budget bounded the beam pool — an honest, modeled
  // constraint (formerly the 'backhaul' ramp artefact).
  if (leg.network.feederLimited) return 'feeder';
  if (leg.network.handoverMbps < leg.network.beamSharingMbps * 0.99) return 'handover';
  if (leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.8) return 'beam sharing';
  if (leg.network.peakRfMbps >= leg.network.terminalCapMbps * 0.97) return 'terminal';
  return null;
}

export function formatBottleneckLabel(factor: LeoBottleneckFactor, scope: LeoBottleneckScope): string {
  if (!factor || scope === 'none') return 'None';
  return `${scope === 'DL+UL' ? 'DL+UL' : scope} ${factor === 'beam sharing' ? 'beam sharing' : factor}`;
}

export function chooseMainBottleneck(
  dl: LeoThroughputLeg,
  ul: LeoThroughputLeg,
): { factor: LeoBottleneckFactor; scope: LeoBottleneckScope; label: string } {
  const dlFactor = detectThroughputBottleneck(dl);
  const ulFactor = detectThroughputBottleneck(ul);
  let scope: LeoBottleneckScope = 'none';
  let factor: LeoBottleneckFactor = null;

  if (dlFactor && ulFactor && dlFactor === ulFactor) {
    scope = 'DL+UL';
    factor = dlFactor;
  } else if (dlFactor) {
    scope = 'DL';
    factor = dlFactor;
  } else if (ulFactor) {
    scope = 'UL';
    factor = ulFactor;
  }

  return { factor, scope, label: formatBottleneckLabel(factor, scope) };
}
