import { memo, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Gauge, Maximize2, Minimize2, Route, X } from 'lucide-react';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import PassBeamTimeline from '../PassBeamTimeline';
import CollapsibleSection from '../layout/CollapsibleSection';
import TerminalConfig, { TERMINAL_PROFILES, type WeatherType } from './TerminalConfig';
import { SPEED_OF_LIGHT_RADIO_KM_S } from '../../utils/capacityCalculator';
import type { SatelliteData } from '../../types/satellites';
import type { BeamHealthData, WeatherCondition } from '../../utils/realisticSimulation';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { BeamLoadResult } from '../../utils/capacityLayer';
import type { ServiceLayerResult } from '../../utils/serviceLayer';
import type { TerminalType } from './TerminalConfig';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import LeoStatusCards from './LeoStatusCards';
import type { LeoBottleneckFactor, LeoThroughputLeg, LeoThroughputResult } from '../../types/leoThroughput';

// ─────────────────────────────────────────────────────────────────────────────
// TODO: DC Level / Throughput / Power synchronisation (Q2-Q3-Q4)
//
// The tooltip in the "Estimated Performance" section already mentions
// "corridor DC level", but no calculation linking it to effective throughput
// or power budget has been implemented.
//
// When the formulas are specified, implement:
//   1. dcLevelToThroughputMbps(dcLevel: number, nominalMbps: number): number
//      Maps the corridor duty-cycle level [0..1] to an effective throughput,
//      accounting for TDM scheduling efficiency.
//   2. dcLevelToPowerW(dcLevel: number, nominalPowerW: number): number
//      Maps DC level to active beam power consumption, feeding the dynamic
//      power budget model in realisticSimulation.ts.
//   3. Wire these functions into LeoConnectivityViewModel and expose the
//      results in the Estimated Performance panel.
//
// Do NOT implement without a precise specification — an incorrect model would
// silently degrade simulation fidelity.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Sub-component: LatencyBreakdownCard ──────────────────────────────────────

interface LatencyBreakdownCardProps {
  accentColor: string;
  summary: string;
  title?: string;
  tooltip?: string;
  children: ReactNode;
}

const LatencyBreakdownCard = ({ accentColor, summary, title = 'Latency breakdown', tooltip, children }: LatencyBreakdownCardProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-200 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold flex items-center" style={{ color: accentColor }}>{title}{tooltip && <SectionTooltip content={tooltip} />}</h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summary}</p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="border-t border-gray-200 px-4 py-4 dark:border-slate-700">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Types for resolved connectivity data ─────────────────────────────────────

export interface ResolvedLEOConnectivity {
  satellite: SatelliteData;
  snp: { name: string; lat: number; lng: number } | null;
  userLEOElevation: number;
  snpLEOElevation: number | null;
  userLEODistance: number;
  snpLEODistance: number | null;
  connectedBeamIndex: number | null;
  /** Number of active beam polygons that contained the user; >1 means best-beam selection ran. */
  candidateBeamCount?: number;
}

/** Shared LEO throughput result captured for all Link Budget UI. */
export type LeoRFDebugInfo = LeoThroughputResult;

export interface LEOGeometry {
  rttTotalMs: number;
  rttPropagationMs: number;
  oneWayRadioMs: number;
  propagationBreakdownMs: {
    userToSatellite: number;
    satelliteToGateway: number;
    gatewayToSatellite: number;
    satelliteToUser: number;
  };
  overheadMs: {
    gatewayProcessing: number;
    modemProcessing: number;
    routing: number;
    queueing: number;
    total: number;
  };
  /** Round-trip fiber delay SNP ↔ internet PoP. Present because OneWeb has no ISL. */
  snpToPopFiberRttMs?: number;
  warnings: string[];
}

export interface LEOPerformance {
  rtt: number;
  downlinkGbps: number;
  uplinkGbps: number;
  stability: string;
  performanceFactor: number;
  footprintFactor: number;
  weatherFactor: number;
  weatherLabel: string;
  /**
   * True when the simulated beam throughput exceeded the selected terminal hardware limit
   * and was capped. The displayed value is the terminal-limited figure, not the raw model output.
   */
  wasTerminalLimited?: boolean;
  /** Single source of truth for final DL/UL throughput and budget details. */
  throughput?: LeoThroughputResult;
  /** Link Budget panel data — absent in SERVICE_ZONE mode or when no beam is connected. */
  debugInfo?: LeoRFDebugInfo;
}

// ─── Link Budget panel helpers ─────────────────────────────────────────────

type LimitingFactor = Exclude<LeoBottleneckFactor, 'regulatory' | 'service gate' | null> | null;

function detectLegLimitingFactor(leg: LeoThroughputLeg): LimitingFactor {
  return leg.network.bottleneck === 'regulatory' || leg.network.bottleneck === 'service gate'
    ? null
    : leg.network.bottleneck;
}

function detectLimitingFactor(d: LeoRFDebugInfo): LimitingFactor {
  return d.mainBottleneck.factor === 'regulatory' || d.mainBottleneck.factor === 'service gate'
    ? null
    : d.mainBottleneck.factor;
}

function deriveLegLimitingFactor(leg: LeoThroughputLeg): LimitingFactor {
  // Backhaul: SNP elevation reduces throughput by >25% after sharing
  const backhaulRatio = leg.network.beamSharingMbps > 0
    ? leg.network.backhaulMbps / leg.network.beamSharingMbps
    : 1;
  if (backhaulRatio < 0.75) return 'backhaul';

  // Load: many concurrent users reduce per-user share >20% below single-user peak
  const loadRatio = leg.network.peakRfMbps > 0
    ? leg.network.beamSharingMbps / leg.network.peakRfMbps
    : 1;
  if (loadRatio < 0.8) return 'beam sharing';

  if (leg.rf.terminalScanLossDb <= -3) return 'scan loss';
  if (leg.rf.modcod == null || leg.rf.cnDb < 18.5) return 'modcod';

  // RF: low C/N or low MODCOD (carrier below 16APSK territory)
  if (leg.rf.cnDb < 14.5 || leg.rf.rfChainThroughputMbps < 50) return 'rf';

  // Terminal: hardware ceiling is the active constraint (sharing result is at cap)
  if (leg.network.beamSharingMbps >= leg.network.terminalCapMbps * 0.97) return 'terminal';

  return null;
}

const LIMITING_FACTOR_BADGE: Record<NonNullable<LimitingFactor>, { label: string; className: string }> = {
  backhaul: {
    label: 'Backhaul limited',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  },
  'beam sharing': {
    label: 'Beam sharing limited',
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  },
  rf: {
    label: 'RF limited',
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  },
  'scan loss': {
    label: 'Scan loss limited',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
  },
  modcod: {
    label: 'MODCOD limited',
    className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
  },
  terminal: {
    label: 'Terminal limited',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  },
};

const fmtDb = (v: number | undefined | null, d = 1) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(d)} dB` : '--';

const fmtMbps = (v: number | undefined | null) => {
  if (typeof v !== 'number' || !isFinite(v)) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(0)} Mbps`;
};

const fmtMhz = (hz: number) => `${(hz / 1e6).toFixed(0)} MHz`;

const NO_LEO_BUDGET_TONE = {
  label: 'No budget',
  className: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  accent: '#64748b',
};

const linkBudgetTone = (d: LeoRFDebugInfo | null) => {
  if (!d) return NO_LEO_BUDGET_TONE;

  if (
    d.downlink.network.finalUserMbps <= 0 ||
    d.uplink.network.finalUserMbps <= 0 ||
    Math.min(d.downlink.rf.cnDb, d.uplink.rf.cnDb) < 10
  ) {
    return {
      label: 'Blocked',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300',
      accent: '#dc2626',
    };
  }

  if (detectLimitingFactor(d)) {
    return {
      label: 'Limited',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
      accent: '#d97706',
    };
  }

  return {
    label: 'Healthy',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    accent: '#059669',
  };
};

interface LeoLinkBudgetSummaryCardProps {
  debugInfo: LeoRFDebugInfo | null;
  highlighted?: boolean;
  onToggle: () => void;
}

const LeoLinkBudgetSummaryCard = ({ debugInfo, highlighted = false, onToggle }: LeoLinkBudgetSummaryCardProps) => {
  const limitingLabel = debugInfo?.mainBottleneck.label ?? '--';
  const tone = linkBudgetTone(debugInfo);
  const satelliteName = debugInfo?.satelliteId ?? 'No LEO path';
  const budgetSubtitle = debugInfo
    ? `Beam ${debugInfo.selectedBeamIndex} · DL ${debugInfo.downlink.rf.modcod ?? 'MODCOD --'} · UL ${debugInfo.uplink.rf.modcod ?? 'MODCOD --'}`
    : 'Satellite -- · Beam --';

  return (
    <section
      className={[
        'relative overflow-hidden rounded-xl border bg-white shadow-sm transition-all duration-200 dark:bg-slate-900',
        highlighted
          ? 'border-pink-300 ring-2 ring-pink-500/30 dark:border-pink-500/70 dark:ring-pink-400/30'
          : 'border-slate-200 dark:border-slate-700',
      ].join(' ')}
    >
      {highlighted && <div className="absolute inset-y-0 left-0 w-1 bg-pink-500" aria-hidden="true" />}
      <div
        className={[
          'border-b px-3.5 py-3',
          highlighted
            ? 'border-pink-100 bg-pink-50/75 dark:border-pink-900/70 dark:bg-pink-950/30'
            : 'border-slate-100 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/70',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center text-sm font-semibold" style={{ color: '#db2777' }}>
                Link Budget
                <span className={`ml-2 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.className}`}>
                  {tone.label}
                </span>
                <SectionTooltip content="LEO RF and network summary. Open the detail panel to inspect beam geometry, FSPL, C/N, MODCOD, RF chain throughput, beam sharing, backhaul, handover, and smoothing." />
              </span>
            </div>
            <h4 className="mt-1.5 truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
              {satelliteName}
            </h4>
            <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              {budgetSubtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={[
              'inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-2.5 shadow-sm transition-colors',
              highlighted
                ? 'border-pink-300 bg-pink-600 text-white hover:bg-pink-700 dark:border-pink-400 dark:bg-pink-500 dark:hover:bg-pink-400'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
            ].join(' ')}
            aria-label={highlighted ? 'Close detailed link budget' : 'Open detailed link budget'}
            title={highlighted ? 'Close detailed link budget' : 'Open detailed link budget'}
            aria-pressed={highlighted}
          >
            {highlighted ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px bg-slate-100 dark:bg-slate-800">
        {[
          { label: 'Final DL', value: fmtMbps(debugInfo?.downlink.network.finalUserMbps), icon: Gauge, color: undefined },
          { label: 'Final UL', value: fmtMbps(debugInfo?.uplink.network.finalUserMbps), icon: Gauge, color: undefined },
          { label: 'Main bottleneck', value: limitingLabel, icon: Route, color: undefined },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 bg-white px-3 py-3 dark:bg-slate-900">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </div>
              <div className="mt-1 truncate text-sm font-bold tabular-nums text-slate-950 dark:text-slate-50" style={item.color ? { color: item.color } : undefined}>
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// Atom: one label + value row used in the geometry and RF sections
const MetricRow = ({ label, value, mono = true }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <span className="block text-[10px] text-slate-400 dark:text-slate-500">{label}</span>
    <span className={`text-xs text-slate-700 dark:text-slate-200 font-medium ${mono ? 'tabular-nums font-mono' : ''}`}>{value}</span>
  </div>
);

// Pipeline step: a single throughput value row
const PipelineStep = ({ value, dimmed = false }: { value: number; dimmed?: boolean }) => (
  <div className={`flex justify-end py-0.5 ${dimmed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
    <span className="tabular-nums font-mono text-xs">{value.toFixed(1)} Mbps</span>
  </div>
);

// Pipeline arrow + step label; when isLimiting=false the step does not reduce throughput
const PipelineArrow = ({ label, isLimiting = true }: { label: string; isLimiting?: boolean }) => (
  <div className="flex items-center gap-1.5 py-px pl-1">
    <span className={`text-[11px] leading-none ${isLimiting ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'}`}>↓</span>
    <span className={`text-[10px] italic ${isLimiting ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-600'}`}>{label}</span>
    {!isLimiting && (
      <span className="text-[9px] text-slate-300 dark:text-slate-600 ml-0.5">no effect</span>
    )}
  </div>
);

const DirectionBudgetSection = ({ leg }: { leg: LeoThroughputLeg }) => {
  const limitingFactor = detectLegLimitingFactor(leg) ?? deriveLegLimitingFactor(leg);
  const badge = limitingFactor ? LIMITING_FACTOR_BADGE[limitingFactor] : null;
  const sharingLimiting = leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.99;
  const backhaulLimiting = leg.network.backhaulMbps < leg.network.beamSharingMbps * 0.99;
  const handoverLimiting = leg.network.handoverMbps < leg.network.backhaulMbps * 0.99;

  return (
    <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 overflow-hidden">
      <div className="px-3 py-1.5 bg-blue-100/70 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-900/60">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {leg.label} Budget
          </span>
          <span className="text-[9px] text-blue-400/70 dark:text-blue-500/60 italic">physical + network</span>
        </div>
      </div>
      <div className="px-3 py-2.5 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {leg.direction === 'downlink' ? (
            <>
              <MetricRow label="Satellite EIRP" value={`${leg.rf.effectiveEirpDb.toFixed(1)} dBW`} />
              <MetricRow label="DL G/T used" value={`${leg.rf.receiverGtDbK.toFixed(1)} dB/K`} />
              <MetricRow label="Raw terminal G/T" value={`${leg.rf.rawTerminalRfDb.toFixed(1)} dB/K`} />
              <MetricRow label="Rx terminal scan loss" value={`${leg.rf.terminalScanLossDb.toFixed(2)} dB`} />
            </>
          ) : (
            <>
              <MetricRow label="UL EIRP used" value={`${leg.rf.effectiveEirpDb.toFixed(1)} dBW`} />
              <MetricRow label="Satellite Rx G/T" value={`${leg.rf.receiverGtDbK.toFixed(1)} dB/K`} />
              <MetricRow label="Raw terminal EIRP" value={`${leg.rf.rawTerminalRfDb.toFixed(1)} dBW`} />
              <MetricRow label="Tx terminal scan loss" value={`${leg.rf.terminalScanLossDb.toFixed(2)} dB`} />
            </>
          )}
          <MetricRow label="FSPL" value={`${leg.rf.fsplDb.toFixed(1)} dB`} />
          <MetricRow label="C/N" value={`${leg.rf.cnDb.toFixed(1)} dB`} />
          <MetricRow label="Satellite beam scan" value={`${leg.rf.scanLossDb.toFixed(2)} dB`} />
          <MetricRow label="Weather loss" value={`${leg.rf.weatherLossDb.toFixed(1)} dB`} />
          <div className="col-span-2">
            <MetricRow label="MODCOD" value={leg.rf.modcod ?? '—'} mono={false} />
          </div>
          <div className="col-span-2">
            <MetricRow label="MODCOD table" value={leg.rf.modcodTableLabel} mono={false} />
          </div>
        </div>

        <div className="rounded-md bg-blue-100 dark:bg-blue-900/40 px-3 py-2 border border-blue-200/60 dark:border-blue-800/40">
          <div className="flex items-center justify-between gap-2">
            <span className="text-blue-700 dark:text-blue-300 text-[11px] font-semibold flex items-center gap-0.5">
              RF chain throughput
              <SectionTooltip content="Physical-layer throughput on the reference carrier/allocation. It comes from FSPL, C/N and MODCOD before beam sharing, backhaul, handover or smoothing." />
            </span>
            <span className="text-blue-800 dark:text-blue-200 font-bold text-sm tabular-nums shrink-0">
              {leg.rf.rfChainThroughputMbps.toFixed(1)}{' '}
              <span className="text-[10px] font-normal text-blue-600 dark:text-blue-400">Mbps</span>
            </span>
          </div>
          <span className="block text-[9px] text-blue-500/70 dark:text-blue-400/50 mt-0.5">
            MODCOD-driven · {(leg.rf.referenceBandwidthHz / 1e6).toFixed(0)} MHz reference allocation
          </span>
          <span className="block text-[9px] text-blue-500/70 dark:text-blue-400/50 mt-0.5">
            {leg.rf.modcodTableSourceNote}
          </span>
        </div>

        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 overflow-hidden">
          <div className="px-3 py-1.5 bg-emerald-100/70 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-900/60">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                Network Layer Effects
              </span>
              <span className="text-[9px] text-emerald-500/60 dark:text-emerald-400/50 italic">network layer</span>
            </div>
          </div>
          <div className="px-3 py-2.5 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-0">
            <p className="text-[9px] text-slate-400 dark:text-slate-500 italic pb-1.5 mb-1.5 border-b border-emerald-100 dark:border-emerald-900/40">
              Derived from RF capacity after beam sharing, gateway constraints and smoothing.
            </p>
            <div className="flex items-baseline justify-between py-0.5">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                Peak RF throughput
                <SectionTooltip content="RF ceiling after scaling the reference allocation to usable beam bandwidth, then applying the direction-specific terminal cap." />
              </span>
              <span className="tabular-nums font-mono text-xs text-slate-600 dark:text-slate-300">
                {leg.network.peakRfMbps.toFixed(1)} Mbps
              </span>
            </div>
            <PipelineArrow label="÷ beam sharing" isLimiting={sharingLimiting} />
            <PipelineStep value={leg.network.beamSharingMbps} dimmed />
            <PipelineArrow label={leg.direction === 'downlink' ? '× backhaul factor' : '× feeder/gateway factor'} isLimiting={backhaulLimiting} />
            <PipelineStep value={leg.network.backhaulMbps} dimmed />
            <PipelineArrow label="× handover" isLimiting={handoverLimiting} />
            <PipelineStep value={leg.network.handoverMbps} dimmed />
            <PipelineArrow label="EMA smoothing" />

            <div className="mt-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200/70 dark:border-emerald-800/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] flex items-center gap-0.5">
                    Final user throughput
                    <SectionTooltip content="Effective user throughput after all network constraints: beam sharing, gateway/backhaul factor, handover transient and EMA temporal smoothing." />
                  </span>
                  {badge && (
                    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                      {leg.direction === 'downlink' ? 'DL' : 'UL'} {badge.label}
                    </span>
                  )}
                </div>
                <span className="text-emerald-800 dark:text-emerald-200 font-bold text-base tabular-nums shrink-0">
                  {leg.network.finalUserMbps.toFixed(1)}{' '}
                  <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">Mbps</span>
                </span>
              </div>
            </div>

            <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
              <span>Terminal cap</span>
              <span className="tabular-nums font-mono">{leg.network.terminalCapMbps.toFixed(0)} Mbps</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const TerminalAssumptionsSection = ({ d }: { d: LeoRFDebugInfo }) => (
  <div className="rounded-lg border border-violet-200 dark:border-violet-900/60 overflow-hidden">
    <div className="px-3 py-1.5 bg-violet-100/70 dark:bg-violet-900/30 border-b border-violet-200 dark:border-violet-900/60">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
          Terminal Assumptions
        </span>
        <span className="text-[9px] text-violet-500/60 dark:text-violet-400/50 italic">selected terminal</span>
      </div>
    </div>
    <div className="px-3 py-2.5 bg-violet-50/40 dark:bg-violet-950/20 space-y-2.5">
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        <MetricRow label="Terminal family" value={d.terminal.terminalFamily} mono={false} />
        <MetricRow label="Vendor" value={d.terminal.vendor} mono={false} />
        <MetricRow label="Model" value={d.terminal.model} mono={false} />
        <MetricRow label="Source type" value={d.terminal.sourceType.replace(/_/g, ' ')} mono={false} />
        <MetricRow label="Certification" value={d.terminal.certificationStatus.replace(/_/g, ' ')} mono={false} />
        <MetricRow label="Antenna type" value={d.terminal.antennaType} mono={false} />
        <MetricRow label="Mobility class" value={d.terminal.mobilityClass} mono={false} />
        <MetricRow label="Bands" value={d.terminal.supportedBands.join(', ')} mono={false} />
        <MetricRow label="DL raw G/T" value={`${d.terminal.rxGtDbK.toFixed(1)} dB/K`} />
        <MetricRow label="UL raw EIRP" value={`${d.terminal.txEirpDbw.toFixed(1)} dBW`} />
        <MetricRow label="Rx scan model" value={d.terminal.rxScanLossModelLabel} mono={false} />
        <MetricRow label="Tx scan model" value={d.terminal.txScanLossModelLabel} mono={false} />
        <MetricRow label="DL terminal cap" value={`${d.terminal.maxDlMbps.toFixed(0)} Mbps`} />
        <MetricRow label="UL terminal cap" value={`${d.terminal.maxUlMbps.toFixed(0)} Mbps`} />
        <MetricRow label="DL reference BW" value={fmtMhz(d.terminal.dlReferenceBandwidthHz)} />
        <MetricRow label="UL reference BW" value={fmtMhz(d.terminal.ulReferenceBandwidthHz)} />
        <MetricRow label="DL usable beam BW" value={fmtMhz(d.terminal.dlUsableBeamBandwidthHz)} />
        <MetricRow label="UL usable beam BW" value={fmtMhz(d.terminal.ulUsableBeamBandwidthHz)} />
      </div>
      <div className="rounded-md border border-violet-200/70 bg-white/70 px-3 py-1.5 text-[10px] leading-snug text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-200">
        <div>
          <span className="font-semibold">Representative terminal model.</span>{' '}
          RF values are assumptions unless backed by a datasheet; throughput is estimated, not an SLA.
        </div>
        <div className="mt-0.5 text-violet-700/80 dark:text-violet-300/80">
          Source: {d.terminal.sourceLabel}{d.terminal.sourceUrl ? ` · ${d.terminal.sourceUrl}` : ''}
        </div>
      </div>
    </div>
  </div>
);

// The full Link Budget panel — geometry + separate DL/UL budgets
const LeoRFLinkBudgetPanel = ({ d }: { d: LeoRFDebugInfo }) => {
  const beamPosPercent = Math.round(Math.min(d.normalizedDistance, 1) * 100);

  return (
    <div className="space-y-3 text-xs">

      {/* ── Section 1: Beam Geometry ─────────────────────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Beam Geometry
          </span>
        </div>
        <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800/40">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <MetricRow label="Satellite" value={d.satelliteId} mono={false} />
            <MetricRow label="User elevation" value={`${d.userElevationDeg.toFixed(1)} °`} />
            <MetricRow label="Beam index" value={d.selectedBeamIndex} />
            <MetricRow label="Slant range" value={`${d.downlink.rf.slantRangeKm.toFixed(0)} km`} />
            <MetricRow label="Candidate beams" value={d.candidateBeamCount} />
            {/* Beam position progress bar */}
            <div>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500 mb-1">
                Beam position
              </span>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-slate-400 dark:bg-slate-500 transition-all"
                    style={{ width: `${beamPosPercent}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-300 w-7 text-right">
                  {d.normalizedDistance.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between mt-0.5 text-[9px] text-slate-300 dark:text-slate-600">
                <span>center</span><span>edge</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <TerminalAssumptionsSection d={d} />
      <DirectionBudgetSection leg={d.downlink} />
      <DirectionBudgetSection leg={d.uplink} />
    </div>
  );
};

interface LeoLinkBudgetDrawerProps {
  open: boolean;
  onClose: () => void;
  debugInfo: LeoRFDebugInfo | null;
}

const LeoLinkBudgetDrawer = ({ open, onClose, debugInfo }: LeoLinkBudgetDrawerProps) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="leo-link-budget-drawer fixed z-[80] max-[1099px]:inset-0 max-[1099px]:bg-slate-950/35 max-[1099px]:backdrop-blur-sm min-[1100px]:pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Detailed LEO link budget"
    >
      <div className="absolute inset-y-0 right-0 flex w-full justify-end max-[1099px]:sm:pl-10 min-[1100px]:pointer-events-none">
        <div className="flex h-full w-full max-w-[38rem] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 min-[1100px]:pointer-events-auto min-[1100px]:overflow-hidden min-[1100px]:rounded-[24px] min-[1100px]:border">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-pink-500 dark:text-pink-300">LEO Link Budget</p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
                {debugInfo?.satelliteId ?? 'No LEO path'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Close link budget detail"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {debugInfo ? (
              <LeoRFLinkBudgetPanel d={debugInfo} />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
                <div className="font-semibold text-slate-900 dark:text-slate-100">No LEO budget available</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  No serving LEO satellite and SNP path is currently selected for this instant. The detail panel stays open and will refresh automatically when a valid LEO RF budget is available again.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

interface LEOConnectivitySectionProps {
  resolvedLEOConnectivity: ResolvedLEOConnectivity | null;
  leoGeometry: LEOGeometry | null;
  leoPerformance: LEOPerformance | null;
  mobileLeoMetrics: { rtt: number; downlinkGbps: number; uplinkGbps: number } | null;
  activePoint: { lat: number; lng: number; altitude?: number } | null;
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  terminalModelId?: string | null;
  onTerminalModelIdChange?: (id: string) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  // Simulation state for PassBeamTimeline
  failedSnps: ReadonlySet<string>;
  hsBeamsSet: ReadonlySet<number>;
  weatherCondition: WeatherCondition;
  beamHealthFactors: BeamHealthData[];
  // New simulation layers
  regulatoryResult?: RegulatoryResult | null;
  beamLoadResult?: BeamLoadResult | null;
  serviceLayerResult?: ServiceLayerResult | null;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  showEstimatedPerformance?: boolean;
}

const RTT_VISUAL_SCALE_MAX_MS = 600;

const formatHopDistance = (distanceKm: number | null | undefined, latencyMs: number | null | undefined): string => {
  const distance = distanceKm != null ? `${distanceKm.toFixed(0)} km` : '--';
  const latency = latencyMs != null ? `${latencyMs.toFixed(1)} ms` : '--';
  return `${distance} (${latency})`;
};

const LEOConnectivitySection = memo<LEOConnectivitySectionProps>(({
  resolvedLEOConnectivity,
  leoGeometry,
  leoPerformance,
  mobileLeoMetrics,
  activePoint,
  terminalType,
  onTerminalTypeChange,
  terminalModelId,
  onTerminalModelIdChange,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  analysisSource,
  aircraftCallsign,
  onSatelliteClick,
  failedSnps,
  hsBeamsSet,
  weatherCondition,
  beamHealthFactors,
  leoServiceViewModel,
  showEstimatedPerformance = true,
}) => {
  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
  const showPerformanceBeforeRadioPath = analysisSource !== 'aircraft';
  const [isLinkBudgetDrawerOpen, setIsLinkBudgetDrawerOpen] = useState(false);

  const isRegulatoryBlocked = leoServiceViewModel?.decisionDriver === 'REGULATORY'
    && leoServiceViewModel.serviceStatus === 'BLOCKED';
  const blockedDiagnosticMessage = 'Underlying RF geometry only — service blocked by regulation.';

  const diagnosticOnlyNotice = (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      {blockedDiagnosticMessage}
    </div>
  );

  const terminalLimitedNotice = leoPerformance?.wasTerminalLimited ? (
    <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
      At least one direction is terminal-limited. Final DL/UL values use the direction-specific terminal cap.
    </div>
  ) : null;

  const simulatedNotice = (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 space-y-0.5">
      <div>Smoothed user throughput · shared beam capacity · EMA-smoothed · simulation model · no SLA guarantee</div>
      <div>Downlink and uplink use separate RF chains, terminal caps, beam sharing, gateway factor, handover and EMA smoothing.</div>
    </div>
  );

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="leo-performance"
      title={<>{isRegulatoryBlocked ? 'Estimated Performance (Diagnostic only)' : 'Estimated Performance (simulated)'}<SectionTooltip content="Final post-network user throughput. Downlink and uplink are computed from separate RF chains, then passed through beam sharing, gateway/backhaul factor, handover transient and EMA smoothing. NOT a measured or guaranteed value." /></>}
      subtitle={isRegulatoryBlocked ? blockedDiagnosticMessage : undefined}
      accentColor="#db2777"
      defaultOpen={true}
      collapsible={false}
    >
      {leoPerformance ? (
        <>
          {isRegulatoryBlocked && <div className="mb-3">{diagnosticOnlyNotice}</div>}
          {terminalLimitedNotice && <div className="mb-2">{terminalLimitedNotice}</div>}
          <PerformancePanel
            rtt={mobileLeoMetrics?.rtt ?? null}
            downlinkGbps={mobileLeoMetrics?.downlinkGbps ?? null}
            uplinkGbps={mobileLeoMetrics?.uplinkGbps ?? null}
            maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
            maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
            performanceFactor={leoPerformance.performanceFactor}
            accentColor="#db2777"
            rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
            rttLabel="End-to-End LEO RTT"
          />
          <div className="mt-2">{simulatedNotice}</div>
        </>
      ) : resolvedLEOConnectivity ? (
        <PerformancePanel
          rtt={null}
          downlinkGbps={null}
          uplinkGbps={null}
          maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
          maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
          accentColor="#db2777"
          noDataMessage="No performance data available without SNP connectivity"
        />
      ) : (
        <PerformancePanel
          rtt={null}
          downlinkGbps={null}
          uplinkGbps={null}
          maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
          maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
          accentColor="#db2777"
        />
      )}
    </CollapsibleSection>
  );

  return (
    <>
      <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#db2777' }}>
        LEO Connectivity
        <SectionTooltip content="Low Earth Orbit connectivity block. Shows how the user terminal connects through the nearest OneWeb LEO satellite and its associated SNP (Satellite Network Point) backhaul gateway." />
      </h3>
      <div className="space-y-4">
        <TerminalConfig
          terminalType={terminalType}
          onTerminalTypeChange={onTerminalTypeChange}
          leoTerminalModelId={terminalModelId}
          onLeoTerminalModelIdChange={onTerminalModelIdChange}
          showLeoTerminalModelSelector
          weatherType={weatherType}
          onWeatherTypeChange={onWeatherTypeChange}
          autoWeatherEnabled={autoWeatherEnabled}
          onAutoWeatherChange={onAutoWeatherChange}
          analysisSource={analysisSource}
          compact
          showWeather={false}
          className="mb-0"
        />
        <div className="pt-1">
          <LeoStatusCards viewModel={leoServiceViewModel ?? null} />
        </div>
        {showEstimatedPerformance && showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        {/* Link Budget — compact sidebar summary + detailed drawer */}
        <LeoLinkBudgetSummaryCard
          debugInfo={leoPerformance?.debugInfo ?? null}
          highlighted={isLinkBudgetDrawerOpen}
          onToggle={() => setIsLinkBudgetDrawerOpen((open) => !open)}
        />
        <LeoLinkBudgetDrawer
          open={isLinkBudgetDrawerOpen}
          onClose={() => setIsLinkBudgetDrawerOpen(false)}
          debugInfo={leoPerformance?.debugInfo ?? null}
        />

        {/* LEO Radio Path */}
        <CollapsibleSection
          storageKey="leo-radio-path"
          title={<>{isRegulatoryBlocked ? 'Radio Path (Diagnostic only)' : 'Radio Path'}<SectionTooltip content="Active one-way LEO signal route: User → LEO Satellite → SNP gateway. RTT details are shown in the latency breakdown below. No SNP means no service is available." /></>}
          subtitle={isRegulatoryBlocked ? blockedDiagnosticMessage : undefined}
          accentColor="#db2777"
          defaultOpen={true}
        >
          {resolvedLEOConnectivity ? (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
              {isRegulatoryBlocked && diagnosticOnlyNotice}
              {resolvedLEOConnectivity.snp ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <Route className="h-4 w-4 shrink-0 text-pink-500" />
                  <div className="min-w-0 break-words leading-relaxed">
                    {userLabel}
                    {' → '}
                    <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button>
                    {' → '}
                    {resolvedLEOConnectivity.snp.name}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <Route className="h-4 w-4 shrink-0 text-pink-500" />
                  <div className="min-w-0 break-words leading-relaxed">
                    {userLabel}
                    {' → '}
                    <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button>
                    {' → No SNP connectivity'}
                  </div>
                </div>
              )}
              {resolvedLEOConnectivity.snp ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                  <div>
                    <div className="break-words">{userLabel} → {resolvedLEOConnectivity.satellite.name}{resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</div>
                    <div className="pl-3 sm:pl-4 break-words">
                      → Slant Range: {formatHopDistance(
                        resolvedLEOConnectivity.userLEODistance,
                        leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
                      )} | Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}°
                    </div>
                  </div>
                  <div>
                    <div className="break-words">{resolvedLEOConnectivity.satellite.name} → {resolvedLEOConnectivity.snp.name}</div>
                    <div className="pl-3 sm:pl-4 break-words">
                      → Slant Range: {formatHopDistance(
                        resolvedLEOConnectivity.snpLEODistance,
                        leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
                      )} | Elevation: {resolvedLEOConnectivity.snpLEOElevation?.toFixed(1)}°
                    </div>
                  </div>
                  <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
                    <span>One-way propagation</span>
                    <span className="break-words">
                      {(() => {
                        const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
                        const oneWayDelayMs = leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000);
                        return `${oneWayDistanceKm.toFixed(0)} km (${oneWayDelayMs.toFixed(1)} ms)`;
                      })()}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-left break-words">
                  <div>
                    → Slant Range: {formatHopDistance(
                      resolvedLEOConnectivity.userLEODistance,
                      resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000
                    )} | Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}°
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
              <div>No valid LEO/SNP connectivity for this location.</div>
            </div>
          )}
        </CollapsibleSection>

        {/* LEO Latency Breakdown */}
        <LatencyBreakdownCard
          accentColor="#db2777"
          tooltip="Breakdown of the full round-trip propagation delay over the LEO link: User → Satellite → SNP → Satellite → User, plus network overhead (gateway processing, modem, routing)."
          title={isRegulatoryBlocked ? 'Latency breakdown (Diagnostic only)' : 'Latency breakdown'}
          summary={isRegulatoryBlocked
            ? `Diagnostic only — estimated RTT total: ${leoGeometry ? leoGeometry.rttTotalMs.toFixed(1) : 'N/A'} ms`
            : leoGeometry
              ? `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`
              : 'No LEO latency breakdown available without SNP connectivity.'}
        >
          {leoGeometry ? (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              {isRegulatoryBlocked && diagnosticOnlyNotice}
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                Propagation delays are physics-derived from slant range. Overhead values are model estimates.
              </div>
              <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
              <div className="flex justify-between"><span>User {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} SNP</span><span>{leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>SNP {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} User</span><span>{leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms</span></div>
              <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                <span>RTT propagation</span><span>{leoGeometry.rttPropagationMs.toFixed(1)} ms</span>
              </div>
              <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead components</div>
              <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{leoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{leoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{leoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between"><span>Queueing delay</span><span>{leoGeometry.overheadMs.queueing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                <span>Network overhead total</span><span>{leoGeometry.overheadMs.total.toFixed(1)} ms</span>
              </div>
              {leoGeometry.snpToPopFiberRttMs !== undefined && (
                <>
                  <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Ground infrastructure (no ISL)</div>
                  <div className="ml-2 flex justify-between"><span>SNP → Internet PoP (fiber RTT)</span><span>{leoGeometry.snpToPopFiberRttMs.toFixed(0)} ms</span></div>
                </>
              )}
              <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                <span>Estimated RTT total</span><span>{leoGeometry.rttTotalMs.toFixed(1)} ms</span>
              </div>
              {leoGeometry.warnings.length > 0 && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                  {leoGeometry.warnings.map((warning, index) => (
                    <div key={`${warning}-${index}`}>Warning: {warning}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
              <div>No LEO latency breakdown available without SNP connectivity.</div>
            </div>
          )}
        </LatencyBreakdownCard>

        {/* Pass Beam Timeline */}
        {resolvedLEOConnectivity?.satellite && activePoint && (
          <div className="space-y-2">
            {isRegulatoryBlocked && diagnosticOnlyNotice}
            <PassBeamTimeline
              satellite={resolvedLEOConnectivity.satellite}
              userPosition={activePoint}
              failedSnps={failedSnps}
              hsBeams={hsBeamsSet}
              weatherCondition={weatherCondition}
              beamHealthFactors={beamHealthFactors}
              maxDlMbps={TERMINAL_PROFILES[terminalType].maxDlGbps * 1000}
            />
          </div>
        )}
        {showEstimatedPerformance && !showPerformanceBeforeRadioPath && estimatedPerformanceSection}

      </div>
    </>
  );
});

LEOConnectivitySection.displayName = 'LEOConnectivitySection';
export default LEOConnectivitySection;
