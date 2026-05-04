import { memo, useState, type ReactNode } from 'react';
import { ChevronDown, Route } from 'lucide-react';
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

/** RF chain internals captured for the Link Budget panel. */
export interface LeoRFDebugInfo {
  // ── Geometry / beam selection ───────────────────────────────────────────
  satelliteId: string;
  selectedBeamIndex: number;
  candidateBeamCount: number;
  normalizedDistance: number;
  elevationDeg: number;
  slantRangeKm: number;
  // ── RF chain (FSPL → C/N → MODCOD) ─────────────────────────────────────
  scanLossDb: number;
  effectiveEirpDb: number;
  fsplDb: number;
  cnDb: number;
  modcod: string | null;
  /**
   * RF chain throughput at the 50 MHz per-user allocation:
   *   spectralEfficiency × RF_THROUGHPUT_BW_HZ.
   * This is a single-carrier result — not a per-user ceiling.
   * Displayed in the Link Budget section alongside MODCOD / C/N.
   */
  rfCarrierMbps: number;
  // ── Network layer pipeline ───────────────────────────────────────────────
  /**
   * Per-user RF ceiling: min(rfCarrier × BEAM_BW_SCALE, terminalCap).
   * The maximum throughput this terminal can receive if it were the only
   * active user on the beam. Every downstream pipeline stage is ≤ this value.
   */
  peakRfMbps: number;
  /** After dividing beam-total throughput by estimated active users (+ terminal cap). */
  afterBeamSharingMbps: number;
  /** After applying SNP elevation backhaul factor to the shared per-user value. */
  afterBackhaulMbps: number;
  /** After applying one-frame handover degradation on satellite switch. */
  afterHandoverMbps: number;
  /** Terminal hardware ceiling used in beam-sharing cap (for reference). */
  terminalCapMbps: number;
  /**
   * After EMA temporal smoothing — this is the value forwarded to the
   * Estimated Performance panel as the displayed user throughput.
   */
  smoothedUserMbps: number;
}

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
  /** Link Budget panel data — absent in SERVICE_ZONE mode or when no beam is connected. */
  debugInfo?: LeoRFDebugInfo;
}

// ─── Link Budget panel helpers ─────────────────────────────────────────────

type LimitingFactor = 'backhaul' | 'load' | 'rf' | 'terminal' | null;

function detectLimitingFactor(d: LeoRFDebugInfo): LimitingFactor {
  // Backhaul: SNP elevation reduces throughput by >25% after sharing
  const backhaulRatio = d.afterBeamSharingMbps > 0
    ? d.afterBackhaulMbps / d.afterBeamSharingMbps
    : 1;
  if (backhaulRatio < 0.75) return 'backhaul';

  // Load: many concurrent users reduce per-user share >20% below single-user peak
  const loadRatio = d.peakRfMbps > 0
    ? d.afterBeamSharingMbps / d.peakRfMbps
    : 1;
  if (loadRatio < 0.8) return 'load';

  // RF: low C/N or low MODCOD (carrier below 16APSK territory)
  if (d.cnDb < 14.5 || d.rfCarrierMbps < 50) return 'rf';

  // Terminal: hardware ceiling is the active constraint (sharing result is at cap)
  if (d.afterBeamSharingMbps >= d.terminalCapMbps * 0.97) return 'terminal';

  return null;
}

const LIMITING_FACTOR_BADGE: Record<NonNullable<LimitingFactor>, { label: string; className: string }> = {
  backhaul: {
    label: 'Backhaul limited',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700',
  },
  load: {
    label: 'Load limited',
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700',
  },
  rf: {
    label: 'RF limited',
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700',
  },
  terminal: {
    label: 'Terminal limited',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700',
  },
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

// The full Link Budget panel — three sections + pipeline
const LeoRFLinkBudgetPanel = ({ d }: { d: LeoRFDebugInfo }) => {
  const limitingFactor = detectLimitingFactor(d);
  const badge = limitingFactor ? LIMITING_FACTOR_BADGE[limitingFactor] : null;
  const beamPosPercent = Math.round(Math.min(d.normalizedDistance, 1) * 100);

  // Which pipeline steps actually reduce throughput (>1% drop from their input)?
  const sharingLimiting  = d.afterBeamSharingMbps < d.peakRfMbps         * 0.99;
  const backhaulLimiting = d.afterBackhaulMbps    < d.afterBeamSharingMbps * 0.99;
  const handoverLimiting = d.afterHandoverMbps    < d.afterBackhaulMbps   * 0.99;

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
            <MetricRow label="Elevation" value={`${d.elevationDeg.toFixed(1)} °`} />
            <MetricRow label="Beam index" value={d.selectedBeamIndex} />
            <MetricRow label="Slant range" value={`${d.slantRangeKm.toFixed(0)} km`} />
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

      {/* ── Section 2: Link Budget (physical layer) ───────────────────────── */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 overflow-hidden">
        <div className="px-3 py-1.5 bg-blue-100/70 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-900/60">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Link Budget
            </span>
            <span className="text-[9px] text-blue-400/70 dark:text-blue-500/60 italic">physical layer</span>
          </div>
        </div>
        <div className="px-3 py-2.5 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <MetricRow label="Eff. EIRP" value={`${d.effectiveEirpDb.toFixed(1)} dBW`} />
            <MetricRow label="FSPL" value={`${d.fsplDb.toFixed(1)} dB`} />
            <MetricRow label="Scan loss" value={`${d.scanLossDb.toFixed(2)} dB`} />
            <MetricRow label="C/N" value={`${d.cnDb.toFixed(1)} dB`} />
            <div className="col-span-2">
              <MetricRow label="MODCOD" value={d.modcod ?? '—'} mono={false} />
            </div>
          </div>
          {/* RF chain throughput — highlighted */}
          <div className="rounded-md bg-blue-100 dark:bg-blue-900/40 px-3 py-2 border border-blue-200/60 dark:border-blue-800/40">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 dark:text-blue-300 text-[11px] font-semibold flex items-center gap-0.5">
                RF chain throughput
                <SectionTooltip content="Throughput computed from RF link budget using a 50 MHz reference carrier (MODCOD-based). Not the full beam capacity — the beam bandwidth is shared across users via a ×5 scaling factor." />
              </span>
              <span className="text-blue-800 dark:text-blue-200 font-bold text-sm tabular-nums">
                {d.rfCarrierMbps.toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-blue-600 dark:text-blue-400">Mbps</span>
              </span>
            </div>
            <span className="block text-[9px] text-blue-500/70 dark:text-blue-400/50 mt-0.5">
              MODCOD-driven · 50 MHz reference carrier
            </span>
          </div>
        </div>
      </div>

      {/* ── Section 3: Network Layer Effects ─────────────────────────────── */}
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
          {/* Explanatory note */}
          <p className="text-[9px] text-slate-400 dark:text-slate-500 italic pb-1.5 mb-1.5 border-b border-emerald-100 dark:border-emerald-900/40">
            Derived from RF capacity after beam sharing, backhaul constraints and smoothing.
          </p>

          {/* Throughput pipeline */}
          <div className="flex items-baseline justify-between py-0.5">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
              Peak RF throughput
              <SectionTooltip content="Estimated maximum per-user throughput if alone on the beam, scaled to full beam bandwidth and limited by terminal capability. All downstream stages are guaranteed ≤ this value." />
            </span>
            <span className="tabular-nums font-mono text-xs text-slate-600 dark:text-slate-300">
              {d.peakRfMbps.toFixed(1)} Mbps
            </span>
          </div>
          <PipelineArrow label="÷ beam sharing" isLimiting={sharingLimiting} />
          <PipelineStep value={d.afterBeamSharingMbps} dimmed />
          <PipelineArrow label="× backhaul factor" isLimiting={backhaulLimiting} />
          <PipelineStep value={d.afterBackhaulMbps} dimmed />
          <PipelineArrow label="× handover" isLimiting={handoverLimiting} />
          <PipelineStep value={d.afterHandoverMbps} dimmed />
          <PipelineArrow label="EMA smoothing" />

          {/* Final user throughput — most prominent */}
          <div className="mt-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200/70 dark:border-emerald-800/40 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold text-[11px] flex items-center gap-0.5">
                  Final user throughput
                  <SectionTooltip content="User-experienced throughput after beam capacity sharing, backhaul attenuation, handover transient, and EMA temporal smoothing. Always ≤ Peak RF throughput. This value drives the Estimated Performance panel." />
                </span>
                {badge && (
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </div>
              <span className="text-emerald-800 dark:text-emerald-200 font-bold text-base tabular-nums shrink-0">
                {d.smoothedUserMbps.toFixed(1)}{' '}
                <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">Mbps</span>
              </span>
            </div>
          </div>

          {/* Terminal cap reference line */}
          <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 px-0.5">
            <span>Terminal hardware cap</span>
            <span className="tabular-nums font-mono">{d.terminalCapMbps.toFixed(0)} Mbps</span>
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
      Beam delivers more than the terminal hardware maximum — throughput shown is terminal-limited.
    </div>
  ) : null;

  const simulatedNotice = (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400 space-y-0.5">
      <div>Smoothed user throughput · shared beam capacity · EMA-smoothed · simulation model · no SLA guarantee</div>
      <div>Downlink: RF chain (FSPL → C/N → MODCOD) → beam sharing → backhaul → handover → EMA · Uplink: symmetric assumption (estimated)</div>
    </div>
  );

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="leo-performance"
      title={<>{isRegulatoryBlocked ? 'Estimated Performance (Diagnostic only)' : 'Estimated Performance (simulated)'}<SectionTooltip content="Smoothed user throughput from shared beam capacity. Pipeline: RF chain (FSPL → C/N → MODCOD) → beam load sharing (geographic density model) → backhaul factor → handover transient → EMA smoothing → terminal hardware cap. The displayed value is the EMA-smoothed result — it can temporarily differ from the instant RF throughput. Downlink is RF-chain derived. Uplink uses symmetric assumption. NOT a measured or guaranteed value." /></>}
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

        {/* Link Budget — above Radio Path */}
        {leoPerformance?.debugInfo && (
          <CollapsibleSection
            storageKey="leo-rf-link-budget"
            title={
              <>
                Link Budget
                <SectionTooltip content="Structured RF and network analysis — physical layer: beam geometry, FSPL → C/N → MODCOD → RF chain throughput (50 MHz reference carrier). Network layer: Peak RF throughput (full beam / single user, terminal-capped) → beam sharing → backhaul → handover → EMA smoothing → Final user throughput. Each network stage is monotonically ≤ Peak RF." />
              </>
            }
            subtitle="Simulated — RF + network effects"
            accentColor="#db2777"
            defaultOpen={false}
          >
            <LeoRFLinkBudgetPanel d={leoPerformance.debugInfo} />
          </CollapsibleSection>
        )}

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
