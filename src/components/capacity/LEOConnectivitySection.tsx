import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Gauge, Maximize2, Minimize2, Route, X } from 'lucide-react';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import { formatLeoSiteToSiteFailureReason } from '../../utils/leoSiteToSiteModel';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import PassBeamTimeline from '../PassBeamTimeline';
import CollapsibleSection from '../layout/CollapsibleSection';
import TerminalConfig, { TERMINAL_PROFILES, type WeatherType } from './TerminalConfig';
import { SPEED_OF_LIGHT_RADIO_KM_S } from '../../utils/capacityCalculator';
import { MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from '../../utils/leoFootprint';
import { formatCoordinates } from '../../utils/formatters';
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

type DirectionBudgetUsage = 'primary' | 'reference';

const DirectionBudgetSection = ({
  leg,
  usage = null,
  primaryDirectionLabel,
}: {
  leg: LeoThroughputLeg;
  usage?: DirectionBudgetUsage | null;
  primaryDirectionLabel?: string;
}) => {
  const limitingFactor = detectLegLimitingFactor(leg) ?? deriveLegLimitingFactor(leg);
  const badge = limitingFactor ? LIMITING_FACTOR_BADGE[limitingFactor] : null;
  const sharingLimiting = leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.99;
  const backhaulLimiting = leg.network.backhaulMbps < leg.network.beamSharingMbps * 0.99;
  const handoverLimiting = leg.network.handoverMbps < leg.network.backhaulMbps * 0.99;
  const usageLabel = usage === 'primary'
    ? `PRIMARY FOR ${primaryDirectionLabel ?? ''}`.trim()
    : usage === 'reference'
      ? 'Reference only'
      : null;
  const usageClassName = usage === 'primary'
    ? 'border-pink-200 bg-pink-100 text-pink-700 dark:border-pink-800/70 dark:bg-pink-900/30 dark:text-pink-200'
    : 'border-slate-200 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-950/40 dark:text-slate-400';

  return (
    <div className={[
      'rounded-lg border overflow-hidden',
      usage === 'primary'
        ? 'border-pink-300 shadow-[0_0_0_1px_rgba(219,39,119,0.10)] dark:border-pink-800'
        : 'border-blue-200 dark:border-blue-900/60',
    ].join(' ')}>
      <div className="px-3 py-1.5 bg-blue-100/70 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-900/60">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {leg.label} Budget
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {usageLabel && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${usageClassName}`}>
                {usageLabel}
              </span>
            )}
            <span className="text-[9px] text-blue-400/70 dark:text-blue-500/60 italic">physical + network</span>
          </div>
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

const TerminalSummaryMetric = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-violet-200/70 bg-white/70 px-2 py-1 text-[10px] text-violet-700 dark:border-violet-800/60 dark:bg-violet-950/40 dark:text-violet-200">
    <span className="font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400">{label}</span>
    <span className="font-mono tabular-nums text-violet-900 dark:text-violet-100">{value}</span>
  </span>
);

const TerminalAssumptionsSection = ({ d }: { d: LeoRFDebugInfo }) => {
  const terminal = d.terminal;
  const terminalSummary = [
    terminal.vendor,
    terminal.model,
    terminal.terminalFamily,
    terminal.supportedBands.join('/'),
  ].filter(Boolean).join(' · ');

  return (
    <details className="group overflow-hidden rounded-lg border border-violet-200 dark:border-violet-900/60">
      <summary className="cursor-pointer list-none bg-violet-100/70 px-3 py-2.5 transition-colors hover:bg-violet-100 dark:bg-violet-900/30 dark:hover:bg-violet-900/45 group-open:border-b group-open:border-violet-200 group-open:dark:border-violet-900/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                Terminal Assumptions
              </span>
              <span className="shrink-0 text-[9px] italic text-violet-500/60 dark:text-violet-400/50">selected terminal</span>
            </div>
            <p className="mt-1 truncate text-[11px] text-violet-700/80 dark:text-violet-300/80">
              {terminalSummary}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <TerminalSummaryMetric label="DL cap" value={`${terminal.maxDlMbps.toFixed(0)} Mbps`} />
              <TerminalSummaryMetric label="UL cap" value={`${terminal.maxUlMbps.toFixed(0)} Mbps`} />
              <TerminalSummaryMetric label="G/T" value={`${terminal.rxGtDbK.toFixed(1)} dB/K`} />
              <TerminalSummaryMetric label="EIRP" value={`${terminal.txEirpDbw.toFixed(1)} dBW`} />
            </div>
          </div>
          <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-violet-500/70 transition-transform duration-200 group-open:rotate-180 dark:text-violet-400/70" />
        </div>
      </summary>
      <div className="space-y-2.5 bg-violet-50/40 px-3 py-2.5 dark:bg-violet-950/20">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          <MetricRow label="Terminal family" value={terminal.terminalFamily} mono={false} />
          <MetricRow label="Vendor" value={terminal.vendor} mono={false} />
          <MetricRow label="Model" value={terminal.model} mono={false} />
          <MetricRow label="Source type" value={terminal.sourceType.replace(/_/g, ' ')} mono={false} />
          <MetricRow label="Certification" value={terminal.certificationStatus.replace(/_/g, ' ')} mono={false} />
          <MetricRow label="Antenna type" value={terminal.antennaType} mono={false} />
          <MetricRow label="Mobility class" value={terminal.mobilityClass} mono={false} />
          <MetricRow label="Bands" value={terminal.supportedBands.join(', ')} mono={false} />
          <MetricRow label="DL raw G/T" value={`${terminal.rxGtDbK.toFixed(1)} dB/K`} />
          <MetricRow label="UL raw EIRP" value={`${terminal.txEirpDbw.toFixed(1)} dBW`} />
          <MetricRow label="Rx scan model" value={terminal.rxScanLossModelLabel} mono={false} />
          <MetricRow label="Tx scan model" value={terminal.txScanLossModelLabel} mono={false} />
          <MetricRow label="DL terminal cap" value={`${terminal.maxDlMbps.toFixed(0)} Mbps`} />
          <MetricRow label="UL terminal cap" value={`${terminal.maxUlMbps.toFixed(0)} Mbps`} />
          <MetricRow label="DL reference BW" value={fmtMhz(terminal.dlReferenceBandwidthHz)} />
          <MetricRow label="UL reference BW" value={fmtMhz(terminal.ulReferenceBandwidthHz)} />
          <MetricRow label="DL usable beam BW" value={fmtMhz(terminal.dlUsableBeamBandwidthHz)} />
          <MetricRow label="UL usable beam BW" value={fmtMhz(terminal.ulUsableBeamBandwidthHz)} />
        </div>
        <div className="rounded-md border border-violet-200/70 bg-white/70 px-3 py-1.5 text-[10px] leading-snug text-violet-800 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-200">
          <div>
            <span className="font-semibold">Representative terminal model.</span>{' '}
            RF values are assumptions unless backed by a datasheet; throughput is estimated, not an SLA.
          </div>
          <div className="mt-0.5 text-violet-700/80 dark:text-violet-300/80">
            Source: {terminal.sourceLabel}{terminal.sourceUrl ? ` · ${terminal.sourceUrl}` : ''}
          </div>
        </div>
      </div>
    </details>
  );
};

// The full Link Budget panel — geometry + separate DL/UL budgets
const LeoRFLinkBudgetPanel = ({
  d,
  directionUsage,
  primaryDirectionLabel,
}: {
  d: LeoRFDebugInfo;
  directionUsage?: Partial<Record<'downlink' | 'uplink', DirectionBudgetUsage>>;
  primaryDirectionLabel?: string;
}) => {
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
      <DirectionBudgetSection
        leg={d.downlink}
        usage={directionUsage?.downlink}
        primaryDirectionLabel={primaryDirectionLabel}
      />
      <DirectionBudgetSection
        leg={d.uplink}
        usage={directionUsage?.uplink}
        primaryDirectionLabel={primaryDirectionLabel}
      />
    </div>
  );
};

interface LeoLinkBudgetDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Single-site mode: full RF debug chain for the active terminal. Also used as
   *  fallback in S2S mode when per-site debug chains are unavailable. */
  debugInfo: LeoRFDebugInfo | null;
  siteToSiteResult?: LeoSiteToSiteResult | null;
  siteToSiteDirection?: 'A_TO_B' | 'B_TO_A';
  /** S2S mode: independent RF debug chain for Site A's terminal. When present,
   *  the Site A Access Budget panel uses this instead of the fallback debugInfo. */
  debugInfoSiteA?: LeoRFDebugInfo | null;
  /** S2S mode: independent RF debug chain for Site B's terminal. When present,
   *  the Site B Access Budget panel uses this instead of the fallback debugInfo. */
  debugInfoSiteB?: LeoRFDebugInfo | null;
  snpAName?: string;
  snpBName?: string;
  popName?: string;
}

const NoBudgetPlaceholder = () => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
    <div className="font-semibold text-slate-900 dark:text-slate-100">No LEO budget available</div>
    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      No serving LEO satellite and SNP path is currently selected for this instant. The detail panel stays open and will refresh automatically when a valid LEO RF budget is available again.
    </p>
  </div>
);

const LeoLinkBudgetDrawer = ({ open, onClose, debugInfo, siteToSiteResult, siteToSiteDirection = 'A_TO_B', debugInfoSiteA, debugInfoSiteB, snpAName, snpBName, popName }: LeoLinkBudgetDrawerProps) => {
  // Entrance animation: slide in from right on mount
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => { cancelAnimationFrame(raf); setMounted(false); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  const isS2S = siteToSiteResult != null;
  const s2sIsAtoB = siteToSiteDirection === 'A_TO_B';
  const s2sDirectionLabel = s2sIsAtoB ? 'A → B' : 'B → A';
  const sourceSiteId = s2sIsAtoB ? 'A' : 'B';
  const destinationSiteId = s2sIsAtoB ? 'B' : 'A';
  const sourceAccentClass = sourceSiteId === 'A'
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-pink-600 dark:text-pink-400';
  const sourceBadgeClass = sourceSiteId === 'A'
    ? 'bg-emerald-100 dark:bg-emerald-900/60'
    : 'bg-pink-100 dark:bg-pink-900/60';
  const destinationAccentClass = destinationSiteId === 'A'
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-pink-600 dark:text-pink-400';
  const destinationBadgeClass = destinationSiteId === 'A'
    ? 'bg-emerald-100 dark:bg-emerald-900/60'
    : 'bg-pink-100 dark:bg-pink-900/60';

  const primaryThroughputMbps = siteToSiteResult
    ? (s2sIsAtoB ? siteToSiteResult.finalThroughputAtoBMbps : siteToSiteResult.finalThroughputBtoAMbps)
    : null;
  const primaryLatencyMs = siteToSiteResult
    ? (s2sIsAtoB ? siteToSiteResult.oneWayLatencyAtoBMs : siteToSiteResult.oneWayLatencyBtoAMs)
    : null;
  // In S2S mode, use the per-site debug chains for bottleneck identification so that
  // the source uplink always comes from the transmitting site and the destination
  // downlink from the receiving site. Falls back to the combined debugInfo when per-site
  // chains are not yet available (e.g. non-beam-model coverage mode).
  const sourceDebugInfo  = isS2S ? (s2sIsAtoB ? (debugInfoSiteA ?? debugInfo) : (debugInfoSiteB ?? debugInfo)) : debugInfo;
  const destDebugInfo    = isS2S ? (s2sIsAtoB ? (debugInfoSiteB ?? debugInfo) : (debugInfoSiteA ?? debugInfo)) : debugInfo;
  const sourceUplinkMbps = sourceDebugInfo?.uplink.network.finalUserMbps ?? null;
  const destinationDownlinkMbps = destDebugInfo?.downlink.network.finalUserMbps ?? null;
  const sourceIsBottleneck =
    sourceUplinkMbps != null && destinationDownlinkMbps != null
      ? sourceUplinkMbps <= destinationDownlinkMbps
      : sourceUplinkMbps != null;
  const bottleneckLeg = sourceIsBottleneck
    ? (sourceDebugInfo?.uplink ?? null)
    : (destDebugInfo?.downlink ?? null);
  const bottleneckFactor = bottleneckLeg
    ? (detectLegLimitingFactor(bottleneckLeg) ?? deriveLegLimitingFactor(bottleneckLeg))
    : null;
  const bottleneckBadge = bottleneckFactor ? LIMITING_FACTOR_BADGE[bottleneckFactor] : null;
  const bottleneckLabel = bottleneckLeg
    ? `${sourceIsBottleneck ? `Site ${sourceSiteId} uplink` : `Site ${destinationSiteId} downlink`}${bottleneckBadge ? ` · ${bottleneckBadge.label}` : ''}`
    : '—';

  const renderS2SAccessBudget = (
    siteId: 'A' | 'B',
    role: 'source' | 'destination',
    accentClass: string,
    badgeClass: string,
  ) => {
    const directionUsage = role === 'source'
      ? { uplink: 'primary' as const, downlink: 'reference' as const }
      : { downlink: 'primary' as const, uplink: 'reference' as const };

    // Use the independent per-site debug chain when available so each panel shows
    // that site's own RF geometry (slant range, elevation, C/N, MODCOD, terminal).
    // Falls back to the combined debugInfo for backward compatibility.
    const siteDebugInfo = siteId === 'A'
      ? (debugInfoSiteA ?? debugInfo)
      : (debugInfoSiteB ?? debugInfo);

    return (
    <div>
      <h4 className={`mb-1 flex items-center gap-2 text-sm font-bold ${accentClass}`}>
        <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-extrabold ${badgeClass}`}>{siteId}</span>
        Site {siteId} Access Budget
        <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {role}
        </span>
      </h4>
      <LeoRFLinkBudgetPanel
        d={siteDebugInfo!}
        directionUsage={directionUsage}
        primaryDirectionLabel={s2sDirectionLabel}
      />
    </div>
    );
  };

  return (
    <div
      className="leo-link-budget-drawer fixed inset-y-0 right-0 z-[80] max-[1099px]:inset-0 max-[1099px]:bg-slate-950/30 max-[1099px]:backdrop-blur-sm min-[1100px]:pointer-events-none"
      role="dialog"
      aria-modal="true"
      aria-label="Detailed LEO link budget"
      style={{ ['--sw' as string]: 'var(--desktop-sidebar-width, 420px)' }}
    >
      {/* Mobile: click backdrop to close */}
      <div
        className="absolute inset-0 max-[1099px]:block min-[1100px]:hidden"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end max-[1099px]:sm:pl-10 min-[1100px]:pointer-events-none min-[1100px]:w-[var(--desktop-sidebar-width,420px)]">
        <div
          className={[
            'flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950',
            'transition-[transform,opacity] duration-200 ease-out will-change-transform',
            'min-[1100px]:pointer-events-auto min-[1100px]:overflow-hidden min-[1100px]:rounded-[24px] min-[1100px]:border',
            mounted ? 'translate-x-0 opacity-100' : 'translate-x-6 opacity-0',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-pink-500 dark:text-pink-300">
                {isS2S ? 'LEO Link Budget — Site-to-Site' : 'LEO Link Budget'}
              </p>
              <h3 className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">
                {isS2S ? `End-to-End Budget (${s2sDirectionLabel})` : (debugInfo?.satelliteId ?? 'No LEO path')}
              </h3>
              {isS2S && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Site {sourceSiteId} source · backbone · Site {destinationSiteId} destination
                </p>
              )}
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
            {isS2S ? (
              debugInfo ? (
                <div className="space-y-8">
                  <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-pink-200 bg-pink-100 dark:border-pink-900/60 dark:bg-pink-950/40">
                    {[
                      { label: `${s2sDirectionLabel} throughput`, value: fmtMbpsSafe(primaryThroughputMbps), tone: 'text-pink-700 dark:text-pink-200' },
                      { label: 'Primary bottleneck', value: bottleneckLabel, tone: 'text-slate-900 dark:text-slate-100' },
                      { label: 'One-way latency', value: fmtMs(primaryLatencyMs), tone: 'text-slate-900 dark:text-slate-100' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 bg-white px-3 py-3 dark:bg-slate-950">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {item.label}
                        </div>
                        <div className={`mt-1 truncate text-sm font-bold tabular-nums ${item.tone}`}>
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {renderS2SAccessBudget(sourceSiteId, 'source', sourceAccentClass, sourceBadgeClass)}

                  {/* Capacity model disclosure — shown only when per-site RF chains are available,
                      so the user knows the RF geometry rows are site-specific while the final
                      throughput still uses the shared-beam capacity model. */}
                  {debugInfoSiteB != null && (
                    <p className="text-[10px] italic text-slate-400 dark:text-slate-500 -mt-4">
                      RF parameters (elevation, C/N, MODCOD) are computed independently for each site.
                      Final throughput uses a shared-beam capacity model — per-beam contention at Site B is approximated from Site A's constellation geometry.
                    </p>
                  )}

                  <div>
                    <h4 className="mb-3 text-sm font-bold text-violet-600 dark:text-violet-400">Backbone Network Layer</h4>
                    <div className="rounded-lg border border-violet-200 dark:border-violet-800/60 overflow-hidden text-xs">
                      <div className="px-3 py-1.5 bg-violet-100/70 dark:bg-violet-900/30 border-b border-violet-200 dark:border-violet-800/60">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">Ground Segment</span>
                          <span className="text-[9px] text-violet-400/70 dark:text-violet-500/60 italic">fiber / IP core</span>
                        </div>
                      </div>
                      <div className="px-3 py-2.5 bg-violet-50/40 dark:bg-violet-950/20 space-y-2.5">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          <MetricRow label="SNP A" value={snpAName ?? '—'} mono={false} />
                          <MetricRow label="SNP B" value={snpBName ?? '—'} mono={false} />
                          <MetricRow label="Logical PoP" value={popName ?? 'Core PoP'} mono={false} />
                          <MetricRow label="Ground distance" value={`${Math.round(siteToSiteResult.backboneDistanceKm).toLocaleString()} km`} />
                          <MetricRow label="Route factor" value="×1.20 (fiber)" mono={false} />
                          <MetricRow label="Fiber speed" value="200 km/ms" mono={false} />
                        </div>
                        <div className="rounded-md bg-violet-100 dark:bg-violet-900/40 border border-violet-200/60 dark:border-violet-800/40 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-violet-700 dark:text-violet-300 font-semibold text-[11px]">One-way latency</span>
                            <span className="text-violet-800 dark:text-violet-200 font-bold text-sm tabular-nums">
                              {typeof siteToSiteResult.backboneOneWayLatencyMs === 'number'
                                ? `${siteToSiteResult.backboneOneWayLatencyMs.toFixed(1)} ms`
                                : '--'}
                            </span>
                          </div>
                        </div>
                        {snpAName && snpBName && snpAName === snpBName ? (
                          <p className="text-[10px] italic text-violet-600/70 dark:text-violet-400/60">Same SNP for both sites — no terrestrial backbone hop required.</p>
                        ) : (
                          <p className="text-[10px] italic text-violet-600/70 dark:text-violet-400/60">Routing estimated via logical PoP. Actual OneWeb backbone topology is proprietary.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {renderS2SAccessBudget(destinationSiteId, 'destination', destinationAccentClass, destinationBadgeClass)}
                </div>
              ) : <NoBudgetPlaceholder />
            ) : (
              debugInfo ? <LeoRFLinkBudgetPanel d={debugInfo} /> : <NoBudgetPlaceholder />
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
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  onLeoTopologyModeChange?: (mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => void;
  // ── Site-to-site extension ──
  siteToSiteResult?: LeoSiteToSiteResult | null;
  pointBLeo?: { lat: number; lng: number } | null;
  onArmPointBLeo?: () => void;
  isPointBLeoArmed?: boolean;
  activeMeshTab?: 'forward' | 'reverse';
  onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  /** Controlled drawer open state — shared with GEO so mode switches preserve open/closed status. */
  isLinkBudgetDrawerOpen?: boolean;
  onLinkBudgetDrawerOpenChange?: (open: boolean) => void;
  // ── Site B terminal (S2S only) ──
  terminalTypeB?: TerminalType;
  onTerminalTypeBChange?: (type: TerminalType) => void;
  terminalModelIdB?: string | null;
  onTerminalModelIdBChange?: (id: string) => void;
}

// ─── Site-to-Site sub-components ─────────────────────────────────────────────

const fmtMs = (v: number | null | undefined, d = 1) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(d)} ms` : '--';

const fmtMbpsSafe = (v: number | null | undefined) => {
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(0)} Mbps`;
};

const fmtDeg = (v: number | null | undefined) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(1)}°` : '--';

const formatLeoServiceZoneLabel = (elevationDeg: number | null | undefined): string => {
  if (typeof elevationDeg !== 'number' || !Number.isFinite(elevationDeg)) return 'Below terminal elevation threshold';
  if (elevationDeg < MIN_USER_TERMINAL_ELEVATION_DEG) return 'Below terminal elevation threshold';
  if (elevationDeg < STANDARD_SERVICE_ELEVATION_DEG) return 'Service possible, below guaranteed elevation';
  return 'Guaranteed service zone';
};

const S2SMetricRow = ({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 py-0.5">
    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</span>
    <span className={`tabular-nums font-mono text-xs ${accent ? 'font-semibold text-pink-700 dark:text-pink-300' : 'text-slate-700 dark:text-slate-200'}`}>
      {value}
    </span>
  </div>
);

const StabilityBadge = ({ stability }: { stability: 'High' | 'Medium' | 'Low' }) => {
  const cfg = {
    High: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
    Low: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  }[stability];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cfg}`}>
      {stability}
    </span>
  );
};

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
  onSatelliteClick,
  failedSnps,
  hsBeamsSet,
  weatherCondition,
  beamHealthFactors,
  leoServiceViewModel,
  showEstimatedPerformance = true,
  leoTopologyMode,
  onLeoTopologyModeChange,
  siteToSiteResult = undefined,
  pointBLeo = null,
  isPointBLeoArmed = false,
  activeMeshTab,
  isLinkBudgetDrawerOpen: controlledDrawerOpen = false,
  onLinkBudgetDrawerOpenChange,
  terminalTypeB,
  onTerminalTypeBChange,
  terminalModelIdB,
  onTerminalModelIdBChange,
}) => {
  const siteALabel = 'Site A';
  const showPerformanceBeforeRadioPath = analysisSource !== 'aircraft';
  const isLinkBudgetDrawerOpen = controlledDrawerOpen;
  const setIsLinkBudgetDrawerOpen = (value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(controlledDrawerOpen) : value;
    onLinkBudgetDrawerOpenChange?.(next);
  };
  const [s2sDirection, setS2SDirection] = useState<'A_TO_B' | 'B_TO_A'>(
    activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B'
  );

  // ── Site-to-site derived values ───────────────────────────────────────────
  const isS2S = siteToSiteResult !== undefined;
  const s2sActive = isS2S && siteToSiteResult != null;
  const s2sServiceActive = s2sActive && siteToSiteResult!.serviceAvailable;
  const isAtoB = s2sDirection === 'A_TO_B';

  useEffect(() => {
    if (!isS2S || !activeMeshTab) return;
    setS2SDirection(activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B');
  }, [activeMeshTab, isS2S]);

  // Single directional view derived from s2sDirection.
  // Final throughput values (primaryMbps / secondaryMbps) are direction-aware:
  //   A→B picks finalThroughputAtoBMbps as the primary end-to-end value, B→A as secondary.
  //   B→A reverses the assignment.
  // NOTE: the underlying debugInfo RF chain rows (per-hop UL/DL RF parameters) still
  // reflect Site A's terminal geometry — the engine does not yet expose per-site S2S
  // debug chains. Only the top-level finalUserMbps override is direction-corrected here.
  // Extending the full RF chain to be direction-aware is a follow-up engine improvement.
  const s2sView = useMemo(() => {
    if (!s2sServiceActive || !siteToSiteResult) return null;
    const primaryMbps = isAtoB
      ? siteToSiteResult.finalThroughputAtoBMbps
      : siteToSiteResult.finalThroughputBtoAMbps;
    const secondaryMbps = isAtoB
      ? siteToSiteResult.finalThroughputBtoAMbps
      : siteToSiteResult.finalThroughputAtoBMbps;
    return {
      primaryLabel:   isAtoB ? 'A → B' : 'B → A',
      secondaryLabel: isAtoB ? 'B → A' : 'A → B',
      primaryMbps,
      secondaryMbps,
      oneWayLatencyMs: isAtoB
        ? siteToSiteResult.oneWayLatencyAtoBMs
        : siteToSiteResult.oneWayLatencyBtoAMs,
      // Per-site RF debug chains for the Detailed Link Budget drawer.
      // Populated by CapacityDetails when beam-model RF is available for each site.
      debugSiteA: siteToSiteResult.debugSiteA ?? null,
      debugSiteB: siteToSiteResult.debugSiteB ?? null,
    };
  }, [s2sServiceActive, siteToSiteResult, isAtoB]);

  // Convenience aliases kept for existing consumers that predate s2sView.
  const s2sPrimaryLabel   = s2sView?.primaryLabel   ?? (isAtoB ? 'A → B' : 'B → A');
  const s2sPrimaryLatency = s2sView?.oneWayLatencyMs ?? null;

  // S2S-adapted debug info used exclusively by the Link Budget Summary card (collapsed view).
  // Overrides finalUserMbps in the direction-selected leg so the card shows the correct
  // end-to-end throughput. The detailed drawer uses per-site chains (debugInfoSiteA/B) instead.
  const s2sLinkBudgetDebugInfo: LeoRFDebugInfo | null = useMemo(() => {
    if (!isS2S || !s2sView || !leoPerformance?.debugInfo) {
      return leoPerformance?.debugInfo ?? null;
    }
    return {
      ...leoPerformance.debugInfo,
      downlink: {
        ...leoPerformance.debugInfo.downlink,
        network: { ...leoPerformance.debugInfo.downlink.network, finalUserMbps: s2sView.primaryMbps ?? 0 },
      },
      uplink: {
        ...leoPerformance.debugInfo.uplink,
        network: { ...leoPerformance.debugInfo.uplink.network, finalUserMbps: s2sView.secondaryMbps ?? 0 },
      },
    };
  }, [isS2S, s2sView, leoPerformance]);

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

  // ── S2S derived display values ────────────────────────────────────────────
  const s2sSameSNP = s2sActive && siteToSiteResult!.selectedSnpA?.name === siteToSiteResult!.selectedSnpB?.name && siteToSiteResult!.selectedSnpA != null;
  const s2sSnpAName = s2sActive ? (siteToSiteResult!.selectedSnpA?.name ?? '—') : '—';
  const s2sSnpBName = s2sActive ? (siteToSiteResult!.selectedSnpB?.name ?? '—') : '—';
  const s2sSatAName = s2sActive ? (siteToSiteResult!.servingSatelliteA?.name ?? '—') : '—';
  const s2sSatBName = s2sActive ? (siteToSiteResult!.servingSatelliteB?.name ?? '—') : '—';
  const s2sPopName  = s2sActive ? (siteToSiteResult!.logicalPop?.name ?? 'Core PoP') : 'Core PoP';
  const s2sStatusLabel = s2sActive
    ? siteToSiteResult!.serviceStatus === 'ALLOWED'
      ? 'End-to-end available'
      : siteToSiteResult!.serviceStatus === 'DEGRADED'
        ? 'End-to-end degraded'
        : 'Service unavailable'
    : null;
  const s2sFailureLabel = s2sActive
    ? formatLeoSiteToSiteFailureReason(siteToSiteResult!.failureReason)
    : null;
  const siteACoordinatesLabel = activePoint
    ? formatCoordinates(activePoint)
    : '--';
  const siteBCoordinatesLabel = pointBLeo
    ? formatCoordinates(pointBLeo)
    : 'Shift+click to place';
  const s2sServiceStatusBanner = isS2S && s2sActive ? (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
      siteToSiteResult!.serviceStatus === 'ALLOWED'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-400'
        : siteToSiteResult!.serviceStatus === 'DEGRADED'
          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-400'
        : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-400'
    }`}>
      <span className={`h-2 w-2 rounded-full shrink-0 ${
        siteToSiteResult!.serviceStatus === 'ALLOWED'
          ? 'bg-emerald-500'
          : siteToSiteResult!.serviceStatus === 'DEGRADED'
            ? 'bg-amber-500'
            : 'bg-red-500'
      }`} />
      <span>
        {siteToSiteResult!.serviceStatus === 'ALLOWED'
          ? `${s2sStatusLabel} · ${s2sSatAName} ↔ ${s2sSatBName}`
          : `${s2sStatusLabel} — ${s2sFailureLabel}`
        }
      </span>
    </div>
  ) : null;
  const singleSiteLeoSatelliteBanner = !isS2S && resolvedLEOConnectivity?.satellite ? (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-400">
      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      <span>
        Connected · {resolvedLEOConnectivity.satellite.name}
      </span>
    </div>
  ) : null;

  return (
    <>
      {leoTopologyMode && onLeoTopologyModeChange && (
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            LEO Topology
          </p>
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => onLeoTopologyModeChange('SINGLE_SITE')}
              className={[
                'rounded px-2 py-2 text-left leading-tight transition-colors',
                leoTopologyMode === 'SINGLE_SITE'
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              <p className="text-xs font-semibold leading-none">Single Site</p>
              <p className={`mt-0.5 font-mono text-[10px] leading-none ${leoTopologyMode === 'SINGLE_SITE' ? 'text-pink-100' : 'text-gray-400 dark:text-gray-500'}`}>
                Site ↔ LEO ↔ SNP
              </p>
            </button>
            <button
              type="button"
              onClick={() => onLeoTopologyModeChange('SITE_TO_SITE')}
              className={[
                'rounded px-2 py-2 text-left leading-tight transition-colors',
                leoTopologyMode === 'SITE_TO_SITE'
                  ? 'bg-pink-500 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600',
              ].join(' ')}
            >
              <p className="text-xs font-semibold leading-none">Site-to-Site</p>
              <p className={`mt-0.5 font-mono text-[10px] leading-none ${leoTopologyMode === 'SITE_TO_SITE' ? 'text-pink-100' : 'text-gray-400 dark:text-gray-500'}`}>
                Site A ↔ Site B
              </p>
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* ── S2S mode: two independent terminal cards ── */}
        {isS2S && terminalTypeB != null && onTerminalTypeBChange != null ? (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-400 dark:text-slate-500 select-none">
              Click to move Site A · Shift+click to move Site B
            </p>
            <div className="grid grid-cols-2 items-stretch gap-2">
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
              title="Terminal A"
              subtitle={<span className="font-mono">{siteACoordinatesLabel}</span>}
              tone={activePoint ? 'user-defined' : 'not-user-defined'}
              statusLabel={activePoint ? 'Manual' : 'Unset'}
              statusTitle={activePoint ? 'Terminal A position is defined' : 'Terminal A position is not defined'}
              stacked
            />
            <TerminalConfig
              terminalType={terminalTypeB}
              onTerminalTypeChange={onTerminalTypeBChange}
              leoTerminalModelId={terminalModelIdB}
              onLeoTerminalModelIdChange={onTerminalModelIdBChange}
              showLeoTerminalModelSelector
              weatherType={weatherType}
              onWeatherTypeChange={onWeatherTypeChange}
              autoWeatherEnabled={autoWeatherEnabled}
              onAutoWeatherChange={onAutoWeatherChange}
              compact
              showWeather={false}
              className="mb-0"
              title="Terminal B"
              subtitle={<span className="font-mono">{siteBCoordinatesLabel}</span>}
              tone={pointBLeo ? 'user-defined' : 'not-user-defined'}
              statusLabel={pointBLeo ? 'Manual' : 'Unset'}
              statusTitle={pointBLeo ? 'Terminal B position is defined' : 'Terminal B position is not defined'}
              stacked
            />
            </div>
          </div>
        ) : (
          /* ── Single-site mode: one terminal selector ── */
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
            subtitle={<span className="font-mono">{siteACoordinatesLabel}</span>}
            tone={activePoint ? 'user-defined' : 'not-user-defined'}
            statusLabel={activePoint ? 'Manual' : 'Unset'}
            statusTitle={activePoint ? 'Terminal position is defined' : 'Terminal position is not defined'}
          />
        )}

        <div className="space-y-2">
          {s2sServiceStatusBanner ?? (
            singleSiteLeoSatelliteBanner ? (
              <div className="pt-2">
                {singleSiteLeoSatelliteBanner}
              </div>
            ) : null
          )}
          <LeoStatusCards viewModel={leoServiceViewModel ?? null} />
        </div>

        {/* Estimated Performance — single-site only; S2S version rendered after Latency Breakdown */}
        {!isS2S && showEstimatedPerformance && showPerformanceBeforeRadioPath && estimatedPerformanceSection}

        {/* Link Budget */}
        <LeoLinkBudgetSummaryCard
          debugInfo={isS2S ? s2sLinkBudgetDebugInfo : (leoPerformance?.debugInfo ?? null)}
          highlighted={isLinkBudgetDrawerOpen}
          onToggle={() => setIsLinkBudgetDrawerOpen((open) => !open)}
        />
        <LeoLinkBudgetDrawer
          open={isLinkBudgetDrawerOpen}
          onClose={() => setIsLinkBudgetDrawerOpen(false)}
          debugInfo={leoPerformance?.debugInfo ?? null}
          siteToSiteResult={s2sServiceActive ? siteToSiteResult : undefined}
          siteToSiteDirection={s2sDirection}
          debugInfoSiteA={s2sView?.debugSiteA}
          debugInfoSiteB={s2sView?.debugSiteB}
          snpAName={s2sSnpAName !== '—' ? s2sSnpAName : undefined}
          snpBName={s2sSnpBName !== '—' ? s2sSnpBName : undefined}
          popName={s2sPopName}
        />

        {/* Radio Path */}
        <CollapsibleSection
          storageKey="leo-radio-path"
          title={<>{isRegulatoryBlocked && !isS2S ? 'Radio Path (Diagnostic only)' : isS2S ? <>Radio Path <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">({s2sPrimaryLabel})</span></> : 'Radio Path'}<SectionTooltip content={isS2S ? "Full OneWeb site-to-site logical path. Backbone routing is estimated." : "Active one-way LEO signal route: Site A → LEO Satellite → SNP/Gateway. RTT details are shown in the latency breakdown below."} /></>}
          subtitle={isRegulatoryBlocked && !isS2S ? blockedDiagnosticMessage : undefined}
          accentColor="#db2777"
          defaultOpen={true}
        >
          {isS2S ? (
            s2sServiceActive ? (
              <div className="space-y-3 text-xs">
                {/* Compact route badge — order follows selected direction */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 min-w-0 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950 px-3 py-2">
                  <Route className="h-4 w-4 shrink-0 text-pink-500 mr-1" />
                  {isAtoB ? (
                    <>
                      <span className="text-cyan-600 dark:text-cyan-400 font-medium shrink-0">Site A</span>
                      <span className="text-slate-400 shrink-0">→</span>
                      <button onClick={() => onSatelliteClick?.(siteToSiteResult!.servingSatelliteA!)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium shrink-0 truncate max-w-[5rem]" title={s2sSatAName}>{s2sSatAName}</button>
                      <span className="text-slate-400 shrink-0">→</span>
                      <span className="text-orange-600 dark:text-orange-400 shrink-0 truncate max-w-[4rem]" title={`SNP ${s2sSnpAName}`}>SNP {s2sSnpAName}</span>
                      {!s2sSameSNP && (
                        <>
                          <span className="text-slate-400 shrink-0">→</span>
                          <span className="text-violet-600 dark:text-violet-400 font-medium shrink-0">PoP</span>
                          <span className="text-slate-400 shrink-0">→</span>
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 truncate max-w-[4rem]" title={`SNP ${s2sSnpBName}`}>SNP {s2sSnpBName}</span>
                        </>
                      )}
                      <span className="text-slate-400 shrink-0">→</span>
                      <button onClick={() => onSatelliteClick?.(siteToSiteResult!.servingSatelliteB!)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium shrink-0 truncate max-w-[5rem]" title={s2sSatBName}>{s2sSatBName}</button>
                      <span className="text-slate-400 shrink-0">→</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-medium shrink-0">Site B</span>
                    </>
                  ) : (
                    <>
                      <span className="text-cyan-600 dark:text-cyan-400 font-medium shrink-0">Site B</span>
                      <span className="text-slate-400 shrink-0">→</span>
                      <button onClick={() => onSatelliteClick?.(siteToSiteResult!.servingSatelliteB!)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium shrink-0 truncate max-w-[5rem]" title={s2sSatBName}>{s2sSatBName}</button>
                      <span className="text-slate-400 shrink-0">→</span>
                      <span className="text-orange-600 dark:text-orange-400 shrink-0 truncate max-w-[4rem]" title={`SNP ${s2sSnpBName}`}>SNP {s2sSnpBName}</span>
                      {!s2sSameSNP && (
                        <>
                          <span className="text-slate-400 shrink-0">→</span>
                          <span className="text-violet-600 dark:text-violet-400 font-medium shrink-0">PoP</span>
                          <span className="text-slate-400 shrink-0">→</span>
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 truncate max-w-[4rem]" title={`SNP ${s2sSnpAName}`}>SNP {s2sSnpAName}</span>
                        </>
                      )}
                      <span className="text-slate-400 shrink-0">→</span>
                      <button onClick={() => onSatelliteClick?.(siteToSiteResult!.servingSatelliteA!)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium shrink-0 truncate max-w-[5rem]" title={s2sSatAName}>{s2sSatAName}</button>
                      <span className="text-slate-400 shrink-0">→</span>
                      <span className="text-cyan-600 dark:text-cyan-400 font-medium shrink-0">Site A</span>
                    </>
                  )}
                </div>
                {/* Hop details — ordered by direction */}
                <div className="space-y-1.5 text-slate-500 dark:text-slate-400">
                  {isAtoB ? (
                    <>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Access A</div>
                        <div className="pl-3 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Site A → {s2sSatAName}{resolvedLEOConnectivity?.connectedBeamIndex != null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</span>
                            <span className="tabular-nums">{fmtMs(siteToSiteResult!.userLinkLatencyAms)}</span>
                          </div>
                          <div className="text-[10px]">Elevation: {fmtDeg(siteToSiteResult!.elevationADeg)} · {formatLeoServiceZoneLabel(siteToSiteResult!.elevationADeg)} | Slant: {resolvedLEOConnectivity ? `${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km` : '—'}</div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Feeder A</div>
                        <div className="pl-3 flex justify-between">
                          <span>{s2sSatAName} → SNP {s2sSnpAName}</span>
                          <span className="tabular-nums">{fmtMs(siteToSiteResult!.feederLatencyAms)}</span>
                        </div>
                      </div>
                      {!s2sSameSNP && (
                        <div>
                          <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Backbone</div>
                          <div className="pl-3 space-y-0.5">
                            <div className="flex justify-between">
                              <span>SNP {s2sSnpAName} → {s2sPopName} → SNP {s2sSnpBName}</span>
                              <span className="tabular-nums">{fmtMs(siteToSiteResult!.backboneOneWayLatencyMs)}</span>
                            </div>
                            <div className="text-[10px]">{Math.round(siteToSiteResult!.backboneDistanceKm).toLocaleString()} km · ×1.20 route factor · fiber 200 km/ms</div>
                          </div>
                        </div>
                      )}
                      {s2sSameSNP && <div className="pl-3 text-[10px] italic">Same SNP — internal OneWeb routing, no backbone hop.</div>}
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Feeder B</div>
                        <div className="pl-3 flex justify-between">
                          <span>SNP {s2sSnpBName} → {s2sSatBName}</span>
                          <span className="tabular-nums">{fmtMs(siteToSiteResult!.feederLatencyBms)}</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Access B</div>
                        <div className="pl-3 space-y-0.5">
                          <div className="flex justify-between">
                            <span>{s2sSatBName} → Site B</span>
                            <span className="tabular-nums">{fmtMs(siteToSiteResult!.userLinkLatencyBms)}</span>
                          </div>
                          <div className="text-[10px]">Elevation: {fmtDeg(siteToSiteResult!.elevationBDeg)} · {formatLeoServiceZoneLabel(siteToSiteResult!.elevationBDeg)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Access B</div>
                        <div className="pl-3 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Site B → {s2sSatBName}</span>
                            <span className="tabular-nums">{fmtMs(siteToSiteResult!.userLinkLatencyBms)}</span>
                          </div>
                          <div className="text-[10px]">Elevation: {fmtDeg(siteToSiteResult!.elevationBDeg)} · {formatLeoServiceZoneLabel(siteToSiteResult!.elevationBDeg)}</div>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Feeder B</div>
                        <div className="pl-3 flex justify-between">
                          <span>{s2sSatBName} → SNP {s2sSnpBName}</span>
                          <span className="tabular-nums">{fmtMs(siteToSiteResult!.feederLatencyBms)}</span>
                        </div>
                      </div>
                      {!s2sSameSNP && (
                        <div>
                          <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Backbone</div>
                          <div className="pl-3 space-y-0.5">
                            <div className="flex justify-between">
                              <span>SNP {s2sSnpBName} → {s2sPopName} → SNP {s2sSnpAName}</span>
                              <span className="tabular-nums">{fmtMs(siteToSiteResult!.backboneOneWayLatencyMs)}</span>
                            </div>
                            <div className="text-[10px]">{Math.round(siteToSiteResult!.backboneDistanceKm).toLocaleString()} km · ×1.20 route factor · fiber 200 km/ms</div>
                          </div>
                        </div>
                      )}
                      {s2sSameSNP && <div className="pl-3 text-[10px] italic">Same SNP — internal OneWeb routing, no backbone hop.</div>}
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Feeder A</div>
                        <div className="pl-3 flex justify-between">
                          <span>SNP {s2sSnpAName} → {s2sSatAName}</span>
                          <span className="tabular-nums">{fmtMs(siteToSiteResult!.feederLatencyAms)}</span>
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-700 dark:text-slate-200 text-[11px] mb-0.5">Access A</div>
                        <div className="pl-3 space-y-0.5">
                          <div className="flex justify-between">
                            <span>{s2sSatAName} → Site A{resolvedLEOConnectivity?.connectedBeamIndex != null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</span>
                            <span className="tabular-nums">{fmtMs(siteToSiteResult!.userLinkLatencyAms)}</span>
                          </div>
                          <div className="text-[10px]">Elevation: {fmtDeg(siteToSiteResult!.elevationADeg)} · {formatLeoServiceZoneLabel(siteToSiteResult!.elevationADeg)} | Slant: {resolvedLEOConnectivity ? `${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km` : '—'}</div>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="rounded border border-violet-200/70 bg-violet-50/60 dark:border-violet-800/50 dark:bg-violet-950/30 px-2.5 py-1.5 text-[10px] text-violet-700 dark:text-violet-300">
                    <span className="font-semibold">Logical PoP: {s2sPopName}.</span>{' '}
                    Logical Point of Presence representing OneWeb core interconnect. Actual routing is proprietary.
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                {s2sActive ? 'No complete LEO Site-to-Site path for the current beam coverage.' : 'Place Site B on the globe to see the full routed path.'}
              </div>
            )
          ) : resolvedLEOConnectivity ? (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
              {isRegulatoryBlocked && diagnosticOnlyNotice}
              {resolvedLEOConnectivity.snp ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <Route className="h-4 w-4 shrink-0 text-pink-500" />
                  <div className="min-w-0 break-words leading-relaxed">
                    {siteALabel}
                    {' → '}
                    <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button>
                    {' → '}
                    SNP {resolvedLEOConnectivity.snp.name}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                  <Route className="h-4 w-4 shrink-0 text-pink-500" />
                  <div className="min-w-0 break-words leading-relaxed">
                    {siteALabel}
                    {' → '}
                    <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button>
                    {' → No SNP connectivity'}
                  </div>
                </div>
              )}
              {resolvedLEOConnectivity.snp ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                  <div>
                    <div className="break-words">{siteALabel} → {resolvedLEOConnectivity.satellite.name}{resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</div>
                    <div className="pl-3 sm:pl-4 break-words">
                      → Slant Range: {formatHopDistance(
                        resolvedLEOConnectivity.userLEODistance,
                        leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
                      )} | Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° · {formatLeoServiceZoneLabel(resolvedLEOConnectivity.userLEOElevation)}
                    </div>
                  </div>
                  <div>
                    <div className="break-words">{resolvedLEOConnectivity.satellite.name} → SNP {resolvedLEOConnectivity.snp.name}</div>
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
                    )} | Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° · {formatLeoServiceZoneLabel(resolvedLEOConnectivity.userLEOElevation)}
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

        {/* Latency Breakdown */}
        <LatencyBreakdownCard
          accentColor="#db2777"
          tooltip={isS2S
            ? "Full one-way propagation: Access A + Feeder A + Backbone + Feeder B + Access B + Processing margin."
            : "Breakdown of the full round-trip propagation delay over the LEO link: Site A → Satellite → SNP/Gateway → Satellite → Site A, plus network overhead."}
          title={isRegulatoryBlocked && !isS2S ? 'Latency breakdown (Diagnostic only)' : 'Latency breakdown'}
          summary={isS2S
            ? (s2sServiceActive
                ? `One-way (${s2sPrimaryLabel}): ${fmtMs(s2sPrimaryLatency)} · RTT: ${fmtMs(siteToSiteResult!.rttMs)}`
                : (s2sActive ? 'No complete LEO Site-to-Site path for the current beam coverage.' : 'Place Site B to see end-to-end latency.'))
            : (isRegulatoryBlocked
                ? `Diagnostic only — estimated RTT total: ${leoGeometry ? leoGeometry.rttTotalMs.toFixed(1) : 'N/A'} ms`
                : leoGeometry
                  ? `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`
                  : 'No LEO latency breakdown available without SNP connectivity.')}
        >
          {isS2S ? (
            s2sServiceActive ? (
              <div className="space-y-0.5">
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 mb-2">
                  Propagation delays derived from slant range (speed of light). Backbone uses geodesic × 1.20 ÷ 200 km/ms.
                </div>
                <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs mb-1">One-way hops ({s2sPrimaryLabel})</div>
                <S2SMetricRow label="Access A (Site A → Satellite A)" value={fmtMs(siteToSiteResult!.userLinkLatencyAms)} />
                <S2SMetricRow label="Feeder A (Satellite A → SNP A)" value={fmtMs(siteToSiteResult!.feederLatencyAms)} />
                {!s2sSameSNP && <S2SMetricRow label={`Backbone (SNP ${s2sSnpAName} → PoP → SNP ${s2sSnpBName})`} value={fmtMs(siteToSiteResult!.backboneOneWayLatencyMs)} />}
                <S2SMetricRow label="Feeder B (SNP B → Satellite B)" value={fmtMs(siteToSiteResult!.feederLatencyBms)} />
                <S2SMetricRow label="Access B (Satellite B → Site B)" value={fmtMs(siteToSiteResult!.userLinkLatencyBms)} />
                <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs mt-2 mb-1">Overhead</div>
                <S2SMetricRow label="Processing margin" value={fmtMs(siteToSiteResult!.processingMarginMs, 0)} />
                {siteToSiteResult!.handoverRiskMarginMs > 0 && <S2SMetricRow label="Handover risk margin" value={fmtMs(siteToSiteResult!.handoverRiskMarginMs, 0)} />}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5 space-y-0.5">
                  <S2SMetricRow label={`One-way latency (${s2sPrimaryLabel})`} value={fmtMs(s2sPrimaryLatency)} accent />
                  <S2SMetricRow label="RTT" value={fmtMs(siteToSiteResult!.rttMs)} accent />
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
                {s2sActive ? 'No complete LEO Site-to-Site path for the current beam coverage.' : 'Place Site B to see end-to-end latency breakdown.'}
              </div>
            )
          ) : leoGeometry ? (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              {isRegulatoryBlocked && diagnosticOnlyNotice}
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                Propagation delays are physics-derived from slant range. Overhead values are model estimates.
              </div>
              <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
              <div className="flex justify-between"><span>Site A {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} SNP</span><span>{leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>SNP {'->'} Satellite</span><span>{leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} Site A</span><span>{leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms</span></div>
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

        {/* Estimated Performance — Site-to-Site (after latency breakdown to match spec order) */}
        {isS2S && (
          <CollapsibleSection
            storageKey="leo-performance"
            title={<>Estimated Performance (Site-to-Site)<SectionTooltip content="Throughput is the access-link bottleneck (min of uplink at source, downlink at destination). Backbone capacity is assumed non-limiting. Symmetric terminal assumption." /></>}
            accentColor="#db2777"
            defaultOpen={true}
            collapsible={false}
          >
            {s2sServiceActive ? (
              <>
                <PerformancePanel
                  rtt={siteToSiteResult!.rttMs}
                  downlinkGbps={(s2sView?.primaryMbps ?? 0) / 1000}
                  uplinkGbps={(s2sView?.secondaryMbps ?? 0) / 1000}
                  maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                  maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                  performanceFactor={leoPerformance?.performanceFactor ?? 1}
                  accentColor="#db2777"
                  rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
                  rttLabel="End-to-End RTT"
                  downlinkLabel={`${s2sView?.primaryLabel ?? 'A → B'} throughput`}
                  uplinkLabel={`${s2sView?.secondaryLabel ?? 'B → A'} throughput`}
                />
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Path stability</span>
                  <StabilityBadge stability={siteToSiteResult!.pathStability} />
                </div>
                <div className="mt-2">{simulatedNotice}</div>
              </>
            ) : (
              <PerformancePanel
                rtt={null}
                downlinkGbps={null}
                uplinkGbps={null}
                maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                accentColor="#db2777"
                noDataMessage={s2sActive ? 'No complete LEO Site-to-Site path for the current beam coverage.' : 'Place Site B on the globe to compute end-to-end performance.'}
              />
            )}
          </CollapsibleSection>
        )}

        {/* Pass Beam Timeline — Site A only (hide in S2S to keep sidebar compact) */}
        {!isS2S && resolvedLEOConnectivity?.satellite && activePoint && (
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
        {!isS2S && showEstimatedPerformance && !showPerformanceBeforeRadioPath && estimatedPerformanceSection}

      </div>
    </>
  );
});

LEOConnectivitySection.displayName = 'LEOConnectivitySection';
export default LEOConnectivitySection;
