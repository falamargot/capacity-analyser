import { memo, useMemo, type ReactNode } from 'react';
import { Route } from 'lucide-react';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
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
import type { LeoBottleneckFactor, LeoThroughputLeg, LeoThroughputResult } from '../../types/leoThroughput';
import { buildLeoSingleSiteConfidence, type PredictionConfidence } from '../../utils/predictionConfidence';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from '../../utils/linkAvailabilityContext';
import { isEngineeringDeliveryState, type EngineeringAnalysisViewModel } from '../../utils/engineeringAnalysisViewModel';
import { fmtMbps, fmtMs } from '../../utils/engineeringFormat';
import LatencyBreakdownCard from './shared/LatencyBreakdownCard';
import LayerHeading from './shared/LayerHeading';
import EngineeringResultSummary from './shared/EngineeringResultSummary';
import { EngineeringDeliveryEvidence, EngineeringEvidenceSummary, EngineeringScenarioEvidence } from './shared/EngineeringStageEvidence';
import DetailsTogglePill from './shared/DetailsTogglePill';

// ─────────────────────────────────────────────────────────────────────────────
// TODO: DC Level / Throughput / Power synchronisation (Q2-Q3-Q4)
//
// No calculation linking corridor DC level to effective throughput or power
// budget has been implemented.
//
// When the formulas are specified, implement:
//   1. dcLevelToThroughputMbps(dcLevel: number, nominalMbps: number): number
//      Maps the corridor duty-cycle level [0..1] to an effective throughput,
//      accounting for TDM scheduling efficiency.
//   2. dcLevelToPowerW(dcLevel: number, nominalPowerW: number): number
//      Maps DC level to active beam power consumption, feeding the dynamic
//      power budget model in realisticSimulation.ts.
//   3. Wire these functions into LeoConnectivityViewModel and expose the
//      result through the canonical Engineering Truth.
//
// Do NOT implement without a precise specification — an incorrect model would
// silently degrade simulation fidelity.
// ─────────────────────────────────────────────────────────────────────────────

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

const LIMITING_FACTOR_BADGE: Record<NonNullable<LimitingFactor>, { label: string; className: string }> = {
  feeder: {
    label: 'Feeder limited (Ka)',
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
  handover: {
    label: 'Handover limited',
    className: 'bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-700',
  },
  terminal: {
    label: 'Terminal limited',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  },
};

const fmtMhz = (hz: number) => `${(hz / 1e6).toFixed(0)} MHz`;

// Atom: one label + value row used in the geometry and RF sections
const MetricRow = ({ label, value, mono = true }: { label: string; value: string | number; mono?: boolean }) => (
  <div>
    <span className="block text-[9px] text-slate-500">{label}</span>
    <span className={`text-[11px] text-slate-200 font-medium ${mono ? 'tabular-nums font-mono' : ''}`}>{value}</span>
  </div>
);

const CockpitTile = ({
  label,
  value,
  tone = 'default',
  mono = true,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'blue' | 'emerald' | 'pink' | 'amber' | 'violet';
  mono?: boolean;
}) => {
  const toneClassName = {
    default: 'text-slate-100',
    blue: 'text-sky-300',
    emerald: 'text-teal-300',
    pink: 'text-rose-300',
    amber: 'text-amber-300',
    violet: 'text-indigo-300',
  }[tone];

  return (
    <div className="min-w-0 rounded-md border border-slate-800 bg-slate-900/65 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="truncate text-[8px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 truncate text-[11px] font-medium ${toneClassName} ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </div>
    </div>
  );
};

const CockpitPanel = ({
  title,
  eyebrow,
  accent,
  children,
  className = '',
}: {
  title: string;
  eyebrow?: string;
  accent: 'blue' | 'emerald' | 'pink' | 'violet';
  children: ReactNode;
  className?: string;
}) => {
  const accentClassName = {
    blue: 'border-slate-700/80 text-sky-300',
    emerald: 'border-slate-700/80 text-teal-300',
    pink: 'border-slate-700/80 text-rose-300',
    violet: 'border-slate-700/80 text-indigo-300',
  }[accent];

  return (
    <section className={`min-h-0 overflow-hidden rounded-xl border bg-slate-950/75 ${accentClassName} ${className}`}>
      <div className="flex items-baseline justify-between gap-3 border-b border-slate-800 bg-slate-900/75 px-3 py-2">
        <h4 className="truncate text-[11px] font-semibold uppercase tracking-wide">{title}</h4>
        {eyebrow && <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wide text-slate-500">{eyebrow}</span>}
      </div>
      {children}
    </section>
  );
};

// Pipeline step: a single throughput value row
const PipelineStep = ({ value, dimmed = false }: { value: number; dimmed?: boolean }) => (
  <div className={`flex justify-end py-px ${dimmed ? 'text-slate-500' : 'text-slate-300'}`}>
    <span className="tabular-nums font-mono text-[10px]">{value.toFixed(1)} Mbps</span>
  </div>
);

// Pipeline arrow + step label; when isLimiting=false the step does not reduce throughput
const PipelineArrow = ({ label, isLimiting = true }: { label: string; isLimiting?: boolean }) => (
  <div className="flex min-w-0 items-center gap-1 py-px pl-1">
    <span className={`text-[10px] leading-none ${isLimiting ? 'text-teal-400' : 'text-slate-600'}`}>↓</span>
    <span className={`truncate text-[9px] italic ${isLimiting ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
    {!isLimiting && (
      <span className="ml-0.5 text-[8px] text-slate-600">no effect</span>
    )}
  </div>
);

type DirectionBudgetUsage = 'primary' | 'reference';

const DirectionBudgetSection = ({
  leg,
  usage = null,
  primaryDirectionLabel,
  compact = false,
}: {
  leg: LeoThroughputLeg;
  usage?: DirectionBudgetUsage | null;
  primaryDirectionLabel?: string;
  compact?: boolean;
}) => {
  const limitingFactor = detectLegLimitingFactor(leg);
  const badge = limitingFactor ? LIMITING_FACTOR_BADGE[limitingFactor] : null;
  const sharingLimiting = leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.99;
  const feederLimiting = leg.network.feederLimited;
  const handoverLimiting = leg.network.handoverMbps < leg.network.beamSharingMbps * 0.99;
  const usageLabel = usage === 'primary'
    ? `PRIMARY FOR ${primaryDirectionLabel ?? ''}`.trim()
    : usage === 'reference'
      ? 'Reference only'
      : null;
  const usageClassName = usage === 'primary'
    ? 'border-slate-600 bg-slate-800 text-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'
    : 'border-slate-700 bg-slate-950/80 text-slate-400';
  const rfMetrics = leg.direction === 'downlink'
    ? [
      ['Satellite EIRP', `${leg.rf.effectiveEirpDb.toFixed(1)} dBW`],
      ['DL G/T used', `${leg.rf.receiverGtDbK.toFixed(1)} dB/K`],
      ['Raw terminal G/T', `${leg.rf.rawTerminalRfDb.toFixed(1)} dB/K`],
      ['Rx scan loss', `${leg.rf.terminalScanLossDb.toFixed(2)} dB`],
    ]
    : [
      ['UL EIRP used', `${leg.rf.effectiveEirpDb.toFixed(1)} dBW`],
      ['Satellite Rx G/T', `${leg.rf.receiverGtDbK.toFixed(1)} dB/K`],
      ['Raw terminal EIRP', `${leg.rf.rawTerminalRfDb.toFixed(1)} dBW`],
      ['Tx scan loss', `${leg.rf.terminalScanLossDb.toFixed(2)} dB`],
    ];
  const sharedRfMetrics = [
    ['FSPL', `${leg.rf.fsplDb.toFixed(1)} dB`],
    ['C/N', `${leg.rf.cnDb.toFixed(1)} dB`],
    ['Beam scan', `${leg.rf.scanLossDb.toFixed(2)} dB`],
    ['Weather', `${leg.rf.weatherLossDb.toFixed(1)} dB`],
    ['Ref BW', fmtMhz(leg.rf.referenceBandwidthHz)],
    ['Usable BW', fmtMhz(leg.rf.usableBandwidthHz)],
  ];
  const networkRows = [
    ['Peak RF', leg.network.peakRfMbps],
    ['Beam share', leg.network.beamSharingMbps],
    ['Handover', leg.network.handoverMbps],
  ];

  return (
    <div className={[
      'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-slate-950/70',
      usage === 'primary'
        ? 'border-slate-600 shadow-[0_0_0_1px_rgba(148,163,184,0.12)]'
        : 'border-slate-700/80',
    ].join(' ')}>
      <div className="border-b border-slate-800 bg-slate-900/80 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-200">
            {leg.label} Budget
          </span>
          <div className="flex shrink-0 items-center gap-1.5">
            {usageLabel && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${usageClassName}`}>
                {usageLabel}
              </span>
            )}
            <span className="text-[8px] text-slate-500 italic">physical + network</span>
          </div>
        </div>
      </div>
      <div className={[
        'grid min-h-0 flex-1 gap-2 p-2.5',
        compact ? 'grid-rows-[auto_auto_auto]' : 'grid-rows-[auto_auto_minmax(0,1fr)]',
      ].join(' ')}>
        <div className="grid grid-cols-5 gap-1.5">
          {[...rfMetrics, ...sharedRfMetrics].map(([label, value], index) => (
            <CockpitTile key={`${label}-${index}`} label={label} value={value} tone={label === 'C/N' ? 'blue' : 'default'} />
          ))}
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,0.58fr)] gap-2">
          <div className="rounded-lg border border-slate-700/80 bg-slate-900/55 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-0.5">
                RF chain throughput
                <SectionTooltip content="Physical-layer throughput on the reference carrier/allocation. It comes from FSPL, C/N and MODCOD before beam sharing, the Ka feeder bound, handover or smoothing." />
              </span>
              <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-slate-100">
                {leg.rf.rfChainThroughputMbps.toFixed(1)}
                <span className="ml-1 text-[9px] font-normal text-slate-400">Mbps</span>
              </span>
            </div>
            <div className="mt-1 truncate text-[9px] text-slate-400">
              MODCOD-driven · {leg.rf.modcod ?? '—'} · {leg.rf.modcodTableLabel}
            </div>
            <div className="mt-0.5 truncate text-[9px] text-slate-500">{leg.rf.modcodTableSourceNote}</div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <CockpitTile label="Active users" value={leg.network.activeUsers} tone="violet" />
            <CockpitTile label="Terminal cap" value={`${leg.network.terminalCapMbps.toFixed(0)} Mbps`} tone="violet" />
            <CockpitTile
              label="Feeder margin (Ka)"
              value={leg.network.feederMarginDb != null
                ? `${leg.network.feederMarginDb.toFixed(1)} dB${leg.network.feederLimited ? ' · LIMITED' : ''}`
                : '—'}
              tone={leg.network.feederLimited ? 'amber' : 'violet'}
            />
            <CockpitTile label="Handover factor" value={leg.network.handoverFactor.toFixed(2)} tone="violet" />
          </div>
        </div>

        {compact ? (
          <div className="overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/50">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">Network closure</span>
              <span className="text-[8px] italic text-slate-500">beam share · gateway · handover · smoothing</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5 p-2">
              {networkRows.map(([label, value]) => (
                <CockpitTile key={label as string} label={label as string} value={`${(value as number).toFixed(1)} Mbps`} tone="emerald" />
              ))}
              <CockpitTile label="EMA α" value={leg.network.smoothingAlpha.toFixed(2)} tone="violet" />
              <div className="min-w-0 rounded-md border border-slate-700 bg-slate-900/80 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[8px] font-semibold uppercase tracking-wide text-slate-500">Final user</span>
                  {badge && (
                    <span className={`shrink-0 truncate rounded border px-1 py-0.5 text-[7px] font-semibold ${badge.className}`}>
                      {leg.direction === 'downlink' ? 'DL' : 'UL'} {badge.label}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate font-mono text-[13px] font-semibold tabular-nums text-teal-200">
                  {leg.network.finalUserMbps.toFixed(1)} <span className="text-[9px] font-normal text-slate-400">Mbps</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="min-h-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/50">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                Network Layer Effects
              </span>
              <span className="text-[8px] italic text-slate-500">beam share · gateway · smoothing</span>
            </div>
            <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(145px,0.42fr)] gap-2 p-2">
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5">
                <div className="grid grid-cols-4 gap-1.5">
                  {networkRows.map(([label, value]) => (
                    <CockpitTile key={label as string} label={label as string} value={`${(value as number).toFixed(1)} Mbps`} tone="emerald" />
                  ))}
                </div>
                <div className="min-h-0 rounded-lg border border-slate-800 bg-slate-950/55 px-2.5 py-1.5">
                  <p className="truncate text-[8px] italic text-slate-500">
                    Derived from RF capacity after beam sharing, gateway constraints and smoothing.
                  </p>
                  <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2">
                    <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                      Peak RF throughput
                      <SectionTooltip content="RF ceiling after scaling the reference allocation to usable beam bandwidth, then applying the direction-specific terminal cap." />
                    </span>
                    <span className="font-mono text-[9px] tabular-nums text-slate-300">{leg.network.peakRfMbps.toFixed(1)} Mbps</span>
                    <PipelineArrow label="÷ beam sharing · Ka feeder bound" isLimiting={sharingLimiting || feederLimiting} />
                    <PipelineStep value={leg.network.beamSharingMbps} dimmed />
                    <PipelineArrow label="× handover" isLimiting={handoverLimiting} />
                    <PipelineStep value={leg.network.handoverMbps} dimmed />
                    <PipelineArrow label="EMA smoothing" />
                    <div className="flex justify-end py-0.5 text-slate-500">
                      <span className="font-mono text-[10px] tabular-nums">α {leg.network.smoothingAlpha.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex min-h-0 flex-col justify-between overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/65 px-3 py-2">
                <div className="min-w-0">
                  <span className="flex items-center gap-0.5 text-[9px] font-semibold text-slate-300">
                    Final user
                    <SectionTooltip content="Effective user throughput after all network constraints: beam sharing with the Ka feeder bound, handover transient and EMA temporal smoothing." />
                  </span>
                  {badge && (
                    <span className={`mt-1 inline-flex max-w-full items-center truncate rounded border px-1.5 py-0.5 text-[8px] font-semibold ${badge.className}`}>
                      {leg.direction === 'downlink' ? 'DL' : 'UL'} {badge.label}
                    </span>
                  )}
                </div>
                <span className="shrink-0 font-mono text-lg font-semibold tabular-nums text-teal-200">
                  {leg.network.finalUserMbps.toFixed(1)}
                  <span className="ml-1 text-[10px] font-normal text-slate-400">Mbps</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TerminalSummaryMetric = ({ label, value }: { label: string; value: string }) => (
  <span className="inline-flex items-baseline gap-1 rounded-md border border-slate-700 bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300">
    <span className="font-semibold uppercase tracking-wide text-slate-500">{label}</span>
    <span className="font-mono tabular-nums text-slate-100">{value}</span>
  </span>
);

const terminalSummaryText = (terminal: LeoRFDebugInfo['terminal']) => [
    terminal.vendor,
    terminal.model,
    terminal.terminalFamily,
    terminal.supportedBands.join('/'),
  ].filter(Boolean).join(' · ');

const terminalProfileKey = (terminal: LeoRFDebugInfo['terminal']) => [
  terminal.vendor,
  terminal.model,
  terminal.terminalFamily,
  terminal.rxGtDbK.toFixed(2),
  terminal.txEirpDbw.toFixed(2),
  terminal.maxDlMbps.toFixed(0),
  terminal.maxUlMbps.toFixed(0),
  terminal.dlReferenceBandwidthHz,
  terminal.ulReferenceBandwidthHz,
].join('|');

const buildTerminalRows = (terminal: LeoRFDebugInfo['terminal']): Array<[string, string]> => [
    ['Family', terminal.terminalFamily],
    ['Vendor', terminal.vendor],
    ['Model', terminal.model],
    ['Source type', terminal.sourceType.replace(/_/g, ' ')],
    ['Certification', terminal.certificationStatus.replace(/_/g, ' ')],
    ['Antenna', terminal.antennaType],
    ['Mobility', terminal.mobilityClass],
    ['Bands', terminal.supportedBands.join(', ')],
    ['DL raw G/T', `${terminal.rxGtDbK.toFixed(1)} dB/K`],
    ['UL raw EIRP', `${terminal.txEirpDbw.toFixed(1)} dBW`],
    ['Rx scan model', terminal.rxScanLossModelLabel],
    ['Tx scan model', terminal.txScanLossModelLabel],
    ['DL cap', `${terminal.maxDlMbps.toFixed(0)} Mbps`],
    ['UL cap', `${terminal.maxUlMbps.toFixed(0)} Mbps`],
    ['DL ref BW', fmtMhz(terminal.dlReferenceBandwidthHz)],
    ['UL ref BW', fmtMhz(terminal.ulReferenceBandwidthHz)],
    ['DL usable BW', fmtMhz(terminal.dlUsableBeamBandwidthHz)],
    ['UL usable BW', fmtMhz(terminal.ulUsableBeamBandwidthHz)],
  ];

const terminalNotesText = (terminal: LeoRFDebugInfo['terminal']) => [
  terminal.description,
  terminal.notes.length > 0 ? `Notes: ${terminal.notes.join(' · ')}` : '',
  terminal.assumptions.length > 0 ? `Assumptions: ${terminal.assumptions.join(' · ')}` : '',
].filter(Boolean).join(' · ');

const TerminalAssumptionsSection = ({ d }: { d: LeoRFDebugInfo }) => {
  const terminal = d.terminal;
  const terminalSummary = terminalSummaryText(terminal);
  const terminalRows = buildTerminalRows(terminal);
  const terminalNotes = [
    terminal.description,
    terminal.notes.length > 0 ? `Notes: ${terminal.notes.join(' · ')}` : '',
    terminal.assumptions.length > 0 ? `Assumptions: ${terminal.assumptions.join(' · ')}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <CockpitPanel title="Terminal Assumptions" eyebrow="selected terminal" accent="violet" className="h-full">
      <div className="flex h-full min-h-0 flex-col gap-2 p-2.5">
        <div className="min-w-0 rounded-lg border border-slate-700/80 bg-slate-900/55 px-3 py-2">
          <p className="truncate text-[11px] font-semibold text-slate-100">{terminalSummary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <TerminalSummaryMetric label="DL cap" value={`${terminal.maxDlMbps.toFixed(0)} Mbps`} />
            <TerminalSummaryMetric label="UL cap" value={`${terminal.maxUlMbps.toFixed(0)} Mbps`} />
            <TerminalSummaryMetric label="G/T" value={`${terminal.rxGtDbK.toFixed(1)} dB/K`} />
            <TerminalSummaryMetric label="EIRP" value={`${terminal.txEirpDbw.toFixed(1)} dBW`} />
          </div>
        </div>
        <div className="grid min-h-0 grid-cols-3 gap-1.5">
          {terminalRows.map(([label, value]) => (
            <CockpitTile key={label} label={label} value={value} tone="violet" mono={false} />
          ))}
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-950/55 px-3 py-1.5 text-[8px] leading-snug text-slate-400">
          <div>
            <span className="font-semibold">Representative terminal model.</span>{' '}
            RF values are assumptions unless backed by a datasheet; throughput is estimated, not an SLA.
          </div>
          <div className="mt-0.5">
            Source: {terminal.sourceLabel}{terminal.sourceUrl ? ` · ${terminal.sourceUrl}` : ''}
          </div>
          {terminalNotes && <div className="mt-0.5 truncate">{terminalNotes}</div>}
        </div>
      </div>
    </CockpitPanel>
  );
};

const TerminalProfileCockpitPanel = ({
  siteA,
  siteB,
}: {
  siteA: LeoRFDebugInfo | null;
  siteB: LeoRFDebugInfo | null;
}) => {
  const terminals = [
    siteA ? { label: 'Site A terminal', terminal: siteA.terminal } : null,
    siteB ? { label: 'Site B terminal', terminal: siteB.terminal } : null,
  ].filter(Boolean) as Array<{ label: string; terminal: LeoRFDebugInfo['terminal'] }>;
  if (terminals.length === 0) return null;

  const sameTerminal = terminals.length === 1 || terminals.every(({ terminal }) => (
    terminalProfileKey(terminal) === terminalProfileKey(terminals[0].terminal)
  ));
  const displayedTerminals = sameTerminal
    ? [{ label: 'Shared terminal profile', terminal: terminals[0].terminal }]
    : terminals;

  return (
    <CockpitPanel title="Terminal RF Profile" eyebrow={sameTerminal ? 'shared by both sites' : 'site comparison'} accent="violet">
      <div className={`grid gap-2 p-2.5 ${displayedTerminals.length > 1 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
        {displayedTerminals.map(({ label, terminal }) => {
          const terminalRows = buildTerminalRows(terminal);
          const terminalNotes = terminalNotesText(terminal);
          return (
            <div key={label} className="min-w-0 rounded-lg border border-slate-800 bg-slate-950/45 p-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="truncate text-[11px] font-semibold text-slate-100">{terminalSummaryText(terminal)}</div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  <TerminalSummaryMetric label="DL cap" value={`${terminal.maxDlMbps.toFixed(0)} Mbps`} />
                  <TerminalSummaryMetric label="UL cap" value={`${terminal.maxUlMbps.toFixed(0)} Mbps`} />
                  <TerminalSummaryMetric label="G/T" value={`${terminal.rxGtDbK.toFixed(1)} dB/K`} />
                  <TerminalSummaryMetric label="EIRP" value={`${terminal.txEirpDbw.toFixed(1)} dBW`} />
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 min-[1500px]:grid-cols-9">
                {terminalRows.map(([rowLabel, value]) => (
                  <CockpitTile key={`${label}-${rowLabel}`} label={rowLabel} value={value} tone="violet" mono={false} />
                ))}
              </div>
              <div className="mt-1.5 truncate text-[8px] leading-snug text-slate-500">
                Source: {terminal.sourceLabel}{terminal.sourceUrl ? ` · ${terminal.sourceUrl}` : ''}
                {terminalNotes ? ` · ${terminalNotes}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </CockpitPanel>
  );
};

// The full Link Budget panel — geometry + separate DL/UL budgets
const LeoRFLinkBudgetPanel = ({
  d,
  directionUsage,
  primaryDirectionLabel,
  showTerminal = true,
}: {
  d: LeoRFDebugInfo;
  directionUsage?: Partial<Record<'downlink' | 'uplink', DirectionBudgetUsage>>;
  primaryDirectionLabel?: string;
  showTerminal?: boolean;
}) => {
  const beamPosPercent = Math.round(Math.min(d.normalizedDistance, 1) * 100);

  return (
    <div className={[
      'grid h-full min-h-0 grid-cols-1 gap-3 text-xs',
      showTerminal
        ? 'xl:grid-cols-[minmax(300px,0.82fr)_minmax(0,1fr)_minmax(0,1fr)]'
        : 'xl:grid-cols-[minmax(260px,0.62fr)_minmax(0,1fr)_minmax(0,1fr)]',
    ].join(' ')}>
      <div className={showTerminal ? 'grid min-h-0 grid-rows-[minmax(0,0.84fr)_minmax(0,1.16fr)] gap-3' : 'min-h-0'}>
        <CockpitPanel title="Beam Geometry" eyebrow="access layer" accent="emerald" className="h-full">
          <div className="flex h-full min-h-0 flex-col gap-2 p-2.5">
            <div className="rounded-lg border border-slate-700/80 bg-slate-900/55 px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm font-semibold text-slate-100">{d.satelliteId}</span>
                <span className="rounded-full border border-slate-700 bg-slate-950/70 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-300">
                  Beam {d.selectedBeamIndex}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-sky-400 transition-all"
                    style={{ width: `${beamPosPercent}%` }}
                  />
                </div>
                <span className="w-9 text-right font-mono text-[10px] tabular-nums text-slate-300">
                  {d.normalizedDistance.toFixed(2)}
                </span>
              </div>
              <div className="mt-0.5 flex justify-between text-[8px] text-slate-500">
                <span>center</span><span>edge</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <CockpitTile label="User elevation" value={`${d.userElevationDeg.toFixed(1)}°`} tone="emerald" />
              <CockpitTile label="Slant range" value={`${d.downlink.rf.slantRangeKm.toFixed(0)} km`} tone="emerald" />
              <CockpitTile label="Candidate beams" value={d.candidateBeamCount} tone="emerald" />
              <CockpitTile label="SNP elevation" value={fmtDeg(d.snpElevationDeg)} tone="emerald" />
              <CockpitTile label="Limiting elevation" value={`${d.limitingElevationDeg.toFixed(1)}°`} tone="emerald" />
              <CockpitTile label="Main bottleneck" value={d.mainBottleneck.label} tone="amber" mono={false} />
            </div>
          </div>
        </CockpitPanel>
        {showTerminal && <TerminalAssumptionsSection d={d} />}
      </div>
      <DirectionBudgetSection
        leg={d.downlink}
        usage={directionUsage?.downlink}
        primaryDirectionLabel={primaryDirectionLabel}
        compact={!showTerminal}
      />
      <DirectionBudgetSection
        leg={d.uplink}
        usage={directionUsage?.uplink}
        primaryDirectionLabel={primaryDirectionLabel}
        compact={!showTerminal}
      />
    </div>
  );
};

interface LeoLinkBudgetEvidenceProps {
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
  latencyMs?: number | null;
  latencyLabel?: string;
  availabilityLabel?: string;
  confidenceLabel?: string;
  confidenceDetail?: string;
  confidence?: PredictionConfidence;
  viewModel?: EngineeringAnalysisViewModel;
}

const NoBudgetPlaceholder = () => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
    <div className="font-semibold text-slate-900 dark:text-slate-100">No LEO budget available</div>
    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
      No serving LEO satellite and SNP path is currently selected for this instant. The detail panel stays open and will refresh automatically when a valid LEO RF budget is available again.
    </p>
  </div>
);

// ─── Level 4: investigation-oriented sections ────────────────────────────────
// One collapsible block per investigation topic (Site A / Site B / Backbone /
// Terminal) instead of every technical card rendered at once. Subsections start
// collapsed so the engineer chooses where to drill in.
const InvestigationSection = ({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  subtitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => (
  <details className="group group/investigation rounded-xl border border-slate-800 bg-slate-950/60" open={defaultOpen}>
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-100">{title}</h4>
        {subtitle && <p className="mt-0.5 text-xs leading-snug text-slate-500">{subtitle}</p>}
      </div>
      <DetailsTogglePill />
    </summary>
    <div className="border-t border-slate-800 p-2.5">
      {children}
    </div>
  </details>
);

const LeoLinkBudgetEvidence = ({
  debugInfo,
  siteToSiteResult,
  siteToSiteDirection = 'A_TO_B',
  debugInfoSiteA,
  debugInfoSiteB,
  snpAName,
  snpBName,
  popName,
  latencyMs,
  latencyLabel,
  availabilityLabel,
  confidenceLabel,
  confidenceDetail,
  confidence,
  viewModel: providedViewModel,
}: LeoLinkBudgetEvidenceProps) => {
  const isS2S = siteToSiteResult != null;
  const s2sIsAtoB = siteToSiteDirection === 'A_TO_B';
  const s2sDirectionLabel = s2sIsAtoB ? 'A → B' : 'B → A';
  const sourceSiteId = s2sIsAtoB ? 'A' : 'B';
  const destinationSiteId = s2sIsAtoB ? 'B' : 'A';
  const sourceDebugInfo = sourceSiteId === 'A'
    ? (debugInfoSiteA ?? debugInfo)
    : (debugInfoSiteB ?? debugInfo);
  const destinationDebugInfo = destinationSiteId === 'A'
    ? (debugInfoSiteA ?? debugInfo)
    : (debugInfoSiteB ?? debugInfo);
  const hasS2SAccessBudgets = sourceDebugInfo != null && destinationDebugInfo != null;
  const siteBadgeClass = 'border border-slate-600 bg-slate-800 text-slate-100';
  const viewModel = providedViewModel ?? buildLeoEngineeringAnalysisViewModel({
    debugInfo,
    siteToSiteResult,
    siteToSiteDirection,
    debugInfoSiteA,
    debugInfoSiteB,
    snpAName,
    snpBName,
    popName,
    latencyMs,
    latencyLabel,
    availabilityLabel,
    confidenceLabel,
    confidenceDetail,
    confidence,
  });

  const siteInvestigationTitle = (siteId: 'A' | 'B') => (
    <>
      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${siteBadgeClass}`}>{siteId}</span>
      Site {siteId} Investigation
    </>
  );

  const renderS2SAccessBudget = (siteId: 'A' | 'B') => {
    const role: 'source' | 'destination' = siteId === sourceSiteId ? 'source' : 'destination';
    const directionUsage = role === 'source'
      ? { uplink: 'primary' as const, downlink: 'reference' as const }
      : { downlink: 'primary' as const, uplink: 'reference' as const };

    // Use the independent per-site debug chain when available so each panel shows
    // that site's own RF geometry (slant range, elevation, C/N, MODCOD, terminal).
    // Falls back to the combined debugInfo for backward compatibility.
    const siteDebugInfo = siteId === sourceSiteId ? sourceDebugInfo : destinationDebugInfo;

    return (
      <InvestigationSection
        key={siteId}
        title={siteInvestigationTitle(siteId)}
        subtitle={`Beam geometry, uplink and downlink RF budget · ${role} for ${s2sDirectionLabel}.`}
      >
        <LeoRFLinkBudgetPanel
          d={siteDebugInfo!}
          directionUsage={directionUsage}
          primaryDirectionLabel={s2sDirectionLabel}
          showTerminal={false}
        />
      </InvestigationSection>
    );
  };

  return (
    <div className="min-w-0 space-y-3" data-engineering-embedded-evidence={viewModel.mode}>
      {isS2S ? (
        hasS2SAccessBudgets ? (
          <div className="flex flex-col gap-2">
            {renderS2SAccessBudget('A')}
            {renderS2SAccessBudget('B')}

            <InvestigationSection
              title="Backbone Investigation"
              subtitle="SNPs, logical PoP and terrestrial backbone latency."
            >
              <CockpitPanel title="Backbone Network Layer" eyebrow="fiber / IP core" accent="violet">
                <div className="grid items-stretch gap-2 p-2.5">
                  <div className="grid grid-cols-3 gap-1.5">
                    <CockpitTile label="SNP A" value={snpAName ?? '—'} tone="violet" mono={false} />
                    <CockpitTile label="SNP B" value={snpBName ?? '—'} tone="violet" mono={false} />
                    <CockpitTile label="Logical PoP" value={popName ?? 'Core PoP'} tone="violet" mono={false} />
                    <CockpitTile label="Ground distance" value={`${Math.round(siteToSiteResult.backboneDistanceKm).toLocaleString()} km`} tone="violet" />
                    <CockpitTile label="Route factor" value="×1.20" tone="violet" mono={false} />
                    <CockpitTile label="Fiber speed" value="200 km/ms" tone="violet" mono={false} />
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/55 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold text-slate-300">One-way backbone latency</span>
                      <span className="font-mono text-lg font-semibold tabular-nums text-slate-100">
                        {typeof siteToSiteResult.backboneOneWayLatencyMs === 'number'
                          ? `${siteToSiteResult.backboneOneWayLatencyMs.toFixed(1)} ms`
                          : '--'}
                      </span>
                    </div>
                    <div className="mt-1 text-[9px] italic text-slate-500">
                      {snpAName && snpBName && snpAName === snpBName
                        ? 'Same SNP for both sites — no terrestrial backbone hop required.'
                        : 'Routing estimated via logical PoP. Actual OneWeb backbone topology is proprietary.'}
                    </div>
                    {debugInfoSiteB != null && (
                      <div className="mt-0.5 text-[9px] italic text-slate-500">
                        RF parameters are computed independently for each site; final throughput uses a shared-beam capacity model.
                      </div>
                    )}
                  </div>
                </div>
              </CockpitPanel>
            </InvestigationSection>

            {/* Capacity model disclosure — shown only when per-site RF chains are available,
                so the user knows the RF geometry rows are site-specific while the final
                throughput still uses the shared-beam capacity model. */}
            <InvestigationSection
              title="Terminal Investigation"
              subtitle="Selected terminal RF profile for each site."
            >
              <TerminalProfileCockpitPanel siteA={debugInfoSiteA ?? sourceDebugInfo!} siteB={debugInfoSiteB ?? destinationDebugInfo!} />
            </InvestigationSection>
          </div>
        ) : <NoBudgetPlaceholder />
      ) : (
        debugInfo ? (
          <div className="flex flex-col gap-2">
            <InvestigationSection
              title={siteInvestigationTitle('A')}
              subtitle="Beam geometry, uplink and downlink RF budget for the active terminal."
            >
              <LeoRFLinkBudgetPanel d={debugInfo} showTerminal={false} />
            </InvestigationSection>
            <InvestigationSection
              title="Terminal Investigation"
              subtitle="Selected terminal RF profile and capability assumptions."
            >
              <TerminalAssumptionsSection d={debugInfo} />
            </InvestigationSection>
          </div>
        ) : <NoBudgetPlaceholder />
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────


interface LEOConnectivitySectionProps {
  engineeringAnalysisViewModel: EngineeringAnalysisViewModel;
  showConfigurationControls?: boolean;
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
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  onLeoTopologyModeChange?: (mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => void;
  // ── Site-to-site extension ──
  siteToSiteResult?: LeoSiteToSiteResult | null;
  pointBLeo?: { lat: number; lng: number } | null;
  onArmPointBLeo?: () => void;
  isPointBLeoArmed?: boolean;
  activeMeshTab?: 'forward' | 'reverse';
  onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  // ── Site B terminal (S2S only) ──
  terminalTypeB?: TerminalType;
  onTerminalTypeBChange?: (type: TerminalType) => void;
  terminalModelIdB?: string | null;
  onTerminalModelIdBChange?: (id: string) => void;
}

// ─── Site-to-Site sub-components ─────────────────────────────────────────────

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

const formatHopDistance = (distanceKm: number | null | undefined, latencyMs: number | null | undefined): string => {
  const distance = distanceKm != null ? `${distanceKm.toFixed(0)} km` : '--';
  const latency = latencyMs != null ? `${latencyMs.toFixed(1)} ms` : '--';
  return `${distance} (${latency})`;
};

const LEOConnectivitySection = memo<LEOConnectivitySectionProps>(({
  engineeringAnalysisViewModel,
  showConfigurationControls = false,
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
  regulatoryResult = null,
  beamLoadResult = null,
  serviceLayerResult: _serviceLayerResult = null,
  leoServiceViewModel,
  leoTopologyMode,
  onLeoTopologyModeChange,
  siteToSiteResult = undefined,
  pointBLeo = null,
  isPointBLeoArmed = false,
  activeMeshTab,
  terminalTypeB,
  onTerminalTypeBChange,
  terminalModelIdB,
  onTerminalModelIdBChange,
}) => {
  const siteALabel = 'Site A';
  // M3.2: the scenario direction is the single owner — the former local
  // s2sDirection state (synced from activeMeshTab by effect) is now derived.
  const s2sDirection: 'A_TO_B' | 'B_TO_A' = activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B';

  // ── Site-to-site derived values ───────────────────────────────────────────
  const isS2S = siteToSiteResult !== undefined;
  const s2sActive = isS2S && siteToSiteResult != null;
  const s2sServiceActive = s2sActive && siteToSiteResult!.serviceAvailable;
  const isAtoB = s2sDirection === 'A_TO_B';
  const predictionConfidence = isS2S && siteToSiteResult
    ? siteToSiteResult.predictionConfidence
    : buildLeoSingleSiteConfidence({
        mode: 'ENG',
        satelliteResolved: !!resolvedLEOConnectivity?.satellite,
        snpResolved: !!resolvedLEOConnectivity?.snp,
        rfAvailable: !!leoPerformance,
        debugAvailable: !!leoPerformance?.debugInfo,
        regulatoryStatus: regulatoryResult?.status ?? null,
        loadSource: beamLoadResult?.loadSource ?? null,
        elevationDeg: resolvedLEOConnectivity?.userLEOElevation ?? null,
      });
  const availabilityContext = buildLinkAvailabilityContext({
    architecture: 'LEO',
    weatherType,
    lat: activePoint?.lat,
  });

  // Single directional view derived from s2sDirection.
  // Final throughput values (primaryMbps / secondaryMbps) are direction-aware:
  //   A→B picks finalThroughputAtoBMbps as the primary end-to-end value, B→A as secondary.
  //   B→A reverses the assignment.
  // NOTE: the underlying debugInfo RF chain rows (per-hop UL/DL RF parameters) still
  // reflect Site A's terminal geometry — the engine does not yet expose per-site S2S
  // debug chains. Only the top-level finalUserMbps override is direction-corrected here.
  // Extending the full RF chain to be direction-aware is a follow-up engine improvement.
  const s2sView = useMemo(() => {
    if (!s2sActive || !siteToSiteResult) return null;
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
  }, [s2sActive, siteToSiteResult, isAtoB]);

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

  // ── S2S derived display values ────────────────────────────────────────────
  const s2sSameSNP = s2sActive && siteToSiteResult!.selectedSnpA?.name === siteToSiteResult!.selectedSnpB?.name && siteToSiteResult!.selectedSnpA != null;
  const s2sSnpAName = s2sActive ? (siteToSiteResult!.selectedSnpA?.name ?? '—') : '—';
  const s2sSnpBName = s2sActive ? (siteToSiteResult!.selectedSnpB?.name ?? '—') : '—';
  const s2sSatAName = s2sActive ? (siteToSiteResult!.servingSatelliteA?.name ?? '—') : '—';
  const s2sSatBName = s2sActive ? (siteToSiteResult!.servingSatelliteB?.name ?? '—') : '—';
  const s2sPopName  = s2sActive ? (siteToSiteResult!.logicalPop?.name ?? 'Core PoP') : 'Core PoP';
  const s2sLatencyHopRows = s2sServiceActive && siteToSiteResult
    ? (isAtoB
        ? [
            { key: 'access-a', label: 'Access A (Site A → Satellite A)', value: siteToSiteResult.userLinkLatencyAms },
            { key: 'feeder-a', label: 'Feeder A (Satellite A → SNP A)', value: siteToSiteResult.feederLatencyAms },
            ...(!s2sSameSNP ? [{ key: 'backbone', label: `Backbone (SNP ${s2sSnpAName} → PoP → SNP ${s2sSnpBName})`, value: siteToSiteResult.backboneOneWayLatencyMs }] : []),
            { key: 'feeder-b', label: 'Feeder B (SNP B → Satellite B)', value: siteToSiteResult.feederLatencyBms },
            { key: 'access-b', label: 'Access B (Satellite B → Site B)', value: siteToSiteResult.userLinkLatencyBms },
          ]
        : [
            { key: 'access-b', label: 'Access B (Site B → Satellite B)', value: siteToSiteResult.userLinkLatencyBms },
            { key: 'feeder-b', label: 'Feeder B (Satellite B → SNP B)', value: siteToSiteResult.feederLatencyBms },
            ...(!s2sSameSNP ? [{ key: 'backbone', label: `Backbone (SNP ${s2sSnpBName} → PoP → SNP ${s2sSnpAName})`, value: siteToSiteResult.backboneOneWayLatencyMs }] : []),
            { key: 'feeder-a', label: 'Feeder A (SNP A → Satellite A)', value: siteToSiteResult.feederLatencyAms },
            { key: 'access-a', label: 'Access A (Satellite A → Site A)', value: siteToSiteResult.userLinkLatencyAms },
          ])
    : [];
  const siteACoordinatesLabel = activePoint
    ? formatCoordinates(activePoint)
    : '--';
  const siteBCoordinatesLabel = pointBLeo
    ? formatCoordinates(pointBLeo)
    : 'Shift+click to place';
  // The authoritative result and the detailed workspace share this exact
  // direction-aware evidence object; no sidebar-only throughput is derived.
  const answerDebugInfo = isS2S ? s2sLinkBudgetDebugInfo : (leoPerformance?.debugInfo ?? null);
  const answerLatencyMs = isS2S ? s2sPrimaryLatency : (mobileLeoMetrics?.rtt ?? leoGeometry?.rttTotalMs ?? null);
  const answerLatencyLabel = isS2S ? `${s2sPrimaryLabel} latency` : 'End-to-end RTT';
  const scenarioEvidence = (
    <EngineeringScenarioEvidence facts={[
      { label: 'Topology', value: isS2S ? 'SITE TO SITE' : 'SINGLE SITE' },
      { label: 'Selected satellite', value: answerDebugInfo?.satelliteId ?? resolvedLEOConnectivity?.satellite.name ?? '--' },
      { label: 'Site A terminal', value: terminalModelId ?? terminalType },
      ...(isS2S ? [{ label: 'Site B terminal', value: terminalModelIdB ?? terminalTypeB ?? '--' }] : []),
      { label: 'Weather', value: `${weatherType}${autoWeatherEnabled ? ' · automatic' : ' · manual'}` },
      { label: 'Site A', value: siteACoordinatesLabel },
      ...(isS2S ? [{ label: 'Site B', value: siteBCoordinatesLabel }] : []),
      { label: 'Serving beam', value: resolvedLEOConnectivity?.connectedBeamIndex != null ? `Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : '--' },
      { label: 'SNP', value: resolvedLEOConnectivity?.snp?.name ?? s2sSnpAName ?? '--' },
    ]} />
  );
  const leoRouteLabel = isS2S
    ? `${isAtoB ? 'Site A' : 'Site B'} → ${isAtoB ? s2sSatAName : s2sSatBName} → SNP ${isAtoB ? s2sSnpAName : s2sSnpBName} → ${isAtoB ? 'Site B' : 'Site A'}`
    : `${siteALabel} → ${resolvedLEOConnectivity?.satellite.name ?? 'LEO satellite'} → SNP ${resolvedLEOConnectivity?.snp?.name ?? 'unresolved'}`;
  const pathSummaryEvidence = (
    <EngineeringEvidenceSummary
      ariaLabel="LEO route summary"
      facts={[
        { label: 'Route', value: leoRouteLabel },
        { label: answerLatencyLabel, value: answerLatencyMs != null ? `${answerLatencyMs.toFixed(1)} ms` : '--' },
        { label: 'Topology', value: isS2S ? `Site-to-Site · ${s2sPrimaryLabel}` : 'Single Site' },
      ]}
    />
  );
  const scenarioTopologyCompactEvidence = showConfigurationControls && leoTopologyMode && onLeoTopologyModeChange ? (
    <>
          <div className="mb-4 grid grid-cols-2 gap-1">
            <button type="button" onClick={() => onLeoTopologyModeChange('SINGLE_SITE')} className={`rounded px-2 py-2 text-xs font-semibold ${leoTopologyMode === 'SINGLE_SITE' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'}`}>Single Site</button>
            <button type="button" onClick={() => onLeoTopologyModeChange('SITE_TO_SITE')} className={`rounded px-2 py-2 text-xs font-semibold ${leoTopologyMode === 'SITE_TO_SITE' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'}`}>Site-to-Site</button>
          </div>
    </>
  ) : null;
  const scenarioTopologyEvidence = showConfigurationControls && leoTopologyMode && onLeoTopologyModeChange ? (
    <>
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
    </>
  ) : null;
  const scenarioAccessEvidence = showConfigurationControls ? (
    <>
        <LayerHeading title="Terminal Configuration" detail="Terminal model, RF characteristics and weather assumptions for each site." />
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
              title="Site A Advanced RF Details"
              subtitle={<span className="font-mono">{siteACoordinatesLabel}</span>}
              tone={activePoint ? 'user-defined' : 'not-user-defined'}
              statusLabel={activePoint ? 'Manual' : 'Unset'}
              statusTitle={activePoint ? 'Terminal A position is defined' : 'Terminal A position is not defined'}
              stacked
              advancedDetailsOnly
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
              title="Site B Advanced RF Details"
              subtitle={<span className="font-mono">{siteBCoordinatesLabel}</span>}
              tone={pointBLeo ? 'user-defined' : 'not-user-defined'}
              statusLabel={pointBLeo ? 'Manual' : 'Unset'}
              statusTitle={pointBLeo ? 'Terminal B position is defined' : 'Terminal B position is not defined'}
              stacked
              advancedDetailsOnly
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
            title="Advanced RF Details"
            subtitle={<span className="font-mono">{siteACoordinatesLabel}</span>}
            tone={activePoint ? 'user-defined' : 'not-user-defined'}
            statusLabel={activePoint ? 'Manual' : 'Unset'}
            statusTitle={activePoint ? 'Terminal position is defined' : 'Terminal position is not defined'}
            advancedDetailsOnly
          />
        )}
    </>
  ) : null;
  const pathDetailEvidence = (
    <>
        <div className="space-y-3">
        <LayerHeading title="Ground Segment" detail="SNP, PoP/backbone and feeder path details." />
        {/* Radio Path */}
        <CollapsibleSection
          storageKey="leo-radio-path"
          title={<>{isRegulatoryBlocked && !isS2S ? 'Radio Path (Diagnostic only)' : isS2S ? <>Radio Path <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px]">({s2sPrimaryLabel})</span></> : 'Radio Path'}<SectionTooltip content={isS2S ? "Full OneWeb site-to-site logical path. Backbone routing is estimated." : "Active one-way LEO signal route: Site A → LEO Satellite → LEO SNP. RTT details are shown in the latency breakdown below."} /></>}
          subtitle={isRegulatoryBlocked && !isS2S ? blockedDiagnosticMessage : undefined}
          accentColor="#db2777"
          collapsible={false}
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
        </div>
    </>
  );
  const deliveryDetailEvidence = (
    <>
        <div className="space-y-3">
        <LayerHeading title="End-to-End Analysis" detail="Final latency, throughput, availability and bottleneck reasoning." />
        {/* Latency Breakdown */}
        <LatencyBreakdownCard
          storageKey="leo-latency-breakdown"
          accentColor="#db2777"
          tooltip={isS2S
            ? "Full one-way propagation: Access A + Feeder A + Backbone + Feeder B + Access B + Processing margin."
            : "Breakdown of the full round-trip propagation delay over the LEO link: Site A → Satellite → LEO SNP → Satellite → Site A, plus network overhead."}
          title={isRegulatoryBlocked && !isS2S ? 'Latency breakdown (Diagnostic only)' : 'Latency breakdown'}
          collapsible={false}
          summary={isS2S
            ? (s2sServiceActive
                ? `${s2sPrimaryLabel} latency: ${fmtMs(s2sPrimaryLatency)} · round-trip reference: ${fmtMs(siteToSiteResult!.rttMs)}`
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
                {s2sLatencyHopRows.map((row) => (
                  <S2SMetricRow key={row.key} label={row.label} value={fmtMs(row.value)} />
                ))}
                <div className="font-semibold text-gray-700 dark:text-gray-200 text-xs mt-2 mb-1">Overhead</div>
                <S2SMetricRow label="Processing margin" value={fmtMs(siteToSiteResult!.processingMarginMs, 0)} />
                <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5 space-y-0.5">
                  <S2SMetricRow label={`One-way latency (${s2sPrimaryLabel})`} value={fmtMs(s2sPrimaryLatency)} accent />
                  <S2SMetricRow label="Round-trip reference" value={fmtMs(siteToSiteResult!.rttMs)} accent />
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
        </div>
    </>
  );
  if (!isEngineeringDeliveryState(engineeringAnalysisViewModel.truth.state)) {
    const showRfEvidence = engineeringAnalysisViewModel.truth.state === 'blocked'
      || engineeringAnalysisViewModel.truth.state === 'budget-unavailable';
    return (
      <>
        <EngineeringResultSummary
          technology="LEO"
          truth={engineeringAnalysisViewModel.truth}
          stageSummaries={{ path: pathSummaryEvidence }}
          stageEvidence={showRfEvidence ? {
            scenario: <>{scenarioEvidence}{scenarioTopologyCompactEvidence}</>,
            rf: (
            <LeoLinkBudgetEvidence
              debugInfo={leoPerformance?.debugInfo ?? null}
              siteToSiteResult={siteToSiteResult}
              siteToSiteDirection={s2sDirection}
              debugInfoSiteA={s2sView?.debugSiteA}
              debugInfoSiteB={s2sView?.debugSiteB}
              snpAName={s2sSnpAName !== '—' ? s2sSnpAName : undefined}
              snpBName={s2sSnpBName !== '—' ? s2sSnpBName : undefined}
              popName={s2sPopName}
              latencyMs={answerLatencyMs}
              latencyLabel={answerLatencyLabel}
              viewModel={engineeringAnalysisViewModel}
            />
            ),
            delivery: <EngineeringDeliveryEvidence viewModel={engineeringAnalysisViewModel} />,
          } : scenarioTopologyCompactEvidence ? { scenario: scenarioTopologyCompactEvidence } : undefined}
        />
      </>
    );
  }
  return (
    <>

      <div className="space-y-4">
      <EngineeringResultSummary
        technology="LEO"
        truth={engineeringAnalysisViewModel.truth}
        stageSummaries={{ path: pathSummaryEvidence }}
        stageEvidence={{
          scenario: <>{scenarioEvidence}{scenarioTopologyEvidence}{scenarioAccessEvidence}</>,
          rf: (
            <LeoLinkBudgetEvidence
              debugInfo={leoPerformance?.debugInfo ?? null}
              siteToSiteResult={isS2S ? siteToSiteResult : undefined}
              siteToSiteDirection={s2sDirection}
              debugInfoSiteA={s2sView?.debugSiteA}
              debugInfoSiteB={s2sView?.debugSiteB}
              snpAName={s2sSnpAName !== '—' ? s2sSnpAName : undefined}
              snpBName={s2sSnpBName !== '—' ? s2sSnpBName : undefined}
              popName={s2sPopName}
              latencyMs={answerLatencyMs}
              latencyLabel={answerLatencyLabel}
              availabilityLabel={`${availabilityContext.indicativeAvailabilityPct.toFixed(1)}% indicative`}
              confidenceLabel={`${predictionConfidence.level} ${predictionConfidence.score}/100`}
              confidenceDetail={[predictionConfidence.summary, predictionConfidence.reasons[0] ?? predictionConfidence.limitation].filter(Boolean).join('. ')}
              confidence={predictionConfidence}
              viewModel={engineeringAnalysisViewModel}
            />
          ),
          path: pathDetailEvidence,
          delivery: <><EngineeringDeliveryEvidence viewModel={engineeringAnalysisViewModel} />{deliveryDetailEvidence}</>,
        }}
      />




      </div>
    </>
  );
});

LEOConnectivitySection.displayName = 'LEOConnectivitySection';
export default LEOConnectivitySection;
