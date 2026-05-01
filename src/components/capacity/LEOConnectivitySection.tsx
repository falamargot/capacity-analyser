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
}

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
  serviceLayerResult,
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

  const estimatedPerformanceSection = (
    <CollapsibleSection
      storageKey="leo-performance"
      title={<>{isRegulatoryBlocked ? 'Estimated Performance (Diagnostic only)' : 'Estimated Performance'}<SectionTooltip content="Predicted downlink/uplink throughput and round-trip latency based on LEO link geometry, beam health factors, weather attenuation, and the current corridor DC level." /></>}
      subtitle={isRegulatoryBlocked ? blockedDiagnosticMessage : undefined}
      accentColor="#db2777"
      defaultOpen={true}
      collapsible={false}
    >
      {leoPerformance ? (
        <>
          {isRegulatoryBlocked && <div className="mb-3">{diagnosticOnlyNotice}</div>}
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
