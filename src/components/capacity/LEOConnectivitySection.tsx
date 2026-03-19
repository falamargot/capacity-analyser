import { memo, useState, type ReactNode } from 'react';
import { ChevronDown, ShieldCheck, ShieldAlert, ShieldX, Users, Zap } from 'lucide-react';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import PassBeamTimeline from '../PassBeamTimeline';
import CollapsibleSection from '../layout/CollapsibleSection';
import { SPEED_OF_LIGHT_RADIO_KM_S } from '../../utils/capacityCalculator';
import type { SatelliteData } from '../../types/satellites';
import type { BeamHealthData, WeatherCondition } from '../../utils/realisticSimulation';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { BeamLoadResult } from '../../utils/capacityLayer';
import type { ServiceLayerResult } from '../../utils/serviceLayer';
import type { TerminalType } from './TerminalConfig';
import { TERMINAL_PROFILES } from './TerminalConfig';

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
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
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
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
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
}

const RTT_VISUAL_SCALE_MAX_MS = 600;

const LEOConnectivitySection = memo<LEOConnectivitySectionProps>(({
  resolvedLEOConnectivity,
  leoGeometry,
  leoPerformance,
  mobileLeoMetrics,
  activePoint,
  terminalType,
  analysisSource,
  aircraftCallsign,
  onSatelliteClick,
  failedSnps,
  hsBeamsSet,
  weatherCondition,
  beamHealthFactors,
  regulatoryResult,
  beamLoadResult,
  serviceLayerResult,
}) => {
  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';

  // ─── Service status colour helpers ───────────────────────────────────────
  const serviceStatusColor = (status: ServiceLayerResult['status'] | undefined) => {
    if (status === 'ALLOWED') return { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-200' };
    if (status === 'DEGRADED') return { bg: 'bg-amber-50 dark:bg-amber-900/20', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200' };
    if (status === 'BLOCKED') return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-700 dark:text-red-300', border: 'border-red-200 dark:border-red-800', badge: 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-200' };
    return { bg: 'bg-gray-50 dark:bg-slate-800/50', text: 'text-gray-500 dark:text-gray-400', border: 'border-gray-200 dark:border-slate-700', badge: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300' };
  };
  const regStatusColor = (status: RegulatoryResult['status'] | undefined) => {
    if (status === 'ALLOWED') return 'text-emerald-600 dark:text-emerald-400';
    if (status === 'RESTRICTED') return 'text-amber-600 dark:text-amber-400';
    if (status === 'BLOCKED') return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };
  const loadStatusColor = (status: BeamLoadResult['capacityStatus'] | undefined) => {
    if (status === 'NOMINAL') return 'bg-emerald-500';
    if (status === 'DEGRADED') return 'bg-amber-500';
    if (status === 'SATURATED') return 'bg-red-500';
    return 'bg-gray-400';
  };
  const isRegulatoryBlocked =
    serviceLayerResult?.status === 'BLOCKED' &&
    serviceLayerResult.primaryReasonLayer === 'regulatory';
  const blockedDiagnosticMessage = 'Underlying RF geometry only — service blocked by regulation.';
  const blockedCapacityMessage = 'Contextual diagnostic only — service blocked by regulation.';

  const diagnosticOnlyNotice = (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
      {blockedDiagnosticMessage}
    </div>
  );

  return (
    <>
      <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#db2777' }}>
        LEO Connectivity
        <SectionTooltip content="Low Earth Orbit connectivity block. Shows how the user terminal connects through the nearest OneWeb LEO satellite and its associated SNP (Satellite Network Point) backhaul gateway." />
      </h3>
      <div className="space-y-4">

        {/* ── Service Status Panel ─────────────────────────────────────── */}
        {serviceLayerResult && (() => {
          const colors = serviceStatusColor(serviceLayerResult.status);
          const ServiceIcon = serviceLayerResult.status === 'ALLOWED' ? ShieldCheck : serviceLayerResult.status === 'BLOCKED' ? ShieldX : ShieldAlert;
          return (
            <div className={`rounded-lg border px-4 py-3 ${colors.bg} ${colors.border}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <ServiceIcon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Service Status</span>
                  <SectionTooltip content="Simulated end-to-end service decision combining RF, network, capacity, and regulatory layers." />
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${colors.badge}`}>
                  {serviceLayerResult.status}
                </span>
              </div>
              <p className={`mt-1.5 text-xs ${colors.text}`}>{serviceLayerResult.reason}</p>
              {serviceLayerResult.details.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {serviceLayerResult.details.map((d, i) => (
                    <li key={i} className="text-xs text-gray-500 dark:text-gray-400 leading-snug">• {d}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {/* ── Regulatory Status Panel ──────────────────────────────────── */}
        {regulatoryResult && (
          <CollapsibleSection
            storageKey="leo-regulatory-status"
            title={
              <>
                Regulatory Status
                <SectionTooltip content="Simulated country-level regulatory status from the OneWeb demo policy map. Not real licensing data." />
              </>
            }
            accentColor="#db2777"
            defaultOpen={regulatoryResult.status !== 'ALLOWED'}
          >
            <div className="text-xs space-y-2">
              {/* Country + status badge */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  {regulatoryResult.status === 'ALLOWED'    && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
                  {regulatoryResult.status === 'RESTRICTED' && <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />}
                  {regulatoryResult.status === 'BLOCKED'    && <ShieldX className="h-3.5 w-3.5 text-red-500" />}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {regulatoryResult.isOcean
                      ? 'International waters'
                      : (regulatoryResult.countryName ?? 'Unknown territory')}
                  </span>
                  {regulatoryResult.isoA2 && !regulatoryResult.isOcean && (
                    <span className="text-gray-400 dark:text-gray-500">({regulatoryResult.isoA2})</span>
                  )}
                </div>
                <span className={`shrink-0 font-bold uppercase tracking-wide ${regStatusColor(regulatoryResult.status)}`}>
                  {regulatoryResult.status}
                </span>
              </div>
              {/* Reason */}
              <p className="text-gray-600 dark:text-gray-400 leading-snug">{regulatoryResult.reason}</p>
              {/* Confidence */}
              <div className="flex justify-between text-gray-500 dark:text-gray-500">
                <span>Simulated confidence</span>
                <span>{Math.round((regulatoryResult.confidence ?? 0) * 100)}%</span>
              </div>
              {/* Permissions */}
              <div className="flex gap-3 pt-0.5">
                <span className={`text-[11px] font-medium ${regulatoryResult.emitAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {regulatoryResult.emitAllowed ? '✓' : '✗'} Emit
                </span>
                <span className={`text-[11px] font-medium ${regulatoryResult.serviceAllowed ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {regulatoryResult.serviceAllowed ? '✓' : '✗'} Service
                </span>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic pt-0.5">
                Simulated demo data — not real OneWeb licensing
              </p>
            </div>
          </CollapsibleSection>
        )}

        {/* ── Beam Load Panel ──────────────────────────────────────────── */}
        {beamLoadResult && (
          <CollapsibleSection
            storageKey="leo-beam-load"
            title={
              <>
                Beam Load
                <SectionTooltip content="Estimated beam utilisation based on geographic density heuristics. Values are SIMULATED — no real subscriber counts are used." />
              </>
            }
            subtitle={isRegulatoryBlocked ? blockedCapacityMessage : undefined}
            accentColor="#db2777"
            defaultOpen={false}
          >
            <div className="text-xs space-y-3">
              {/* Load bar */}
              <div>
                <div className="flex justify-between mb-1.5 text-gray-700 dark:text-gray-300 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    Estimated load
                  </span>
                  <span>{beamLoadResult.beamLoadPercent}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${loadStatusColor(beamLoadResult.capacityStatus)}`}
                    style={{ width: `${Math.min(100, beamLoadResult.beamLoadPercent)}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-gray-500 dark:text-gray-500">
                  <span>0%</span>
                  <span className={`font-semibold text-[11px] uppercase ${
                    beamLoadResult.capacityStatus === 'NOMINAL' ? 'text-emerald-600 dark:text-emerald-400' :
                    beamLoadResult.capacityStatus === 'DEGRADED' ? 'text-amber-600 dark:text-amber-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>{beamLoadResult.capacityStatus}</span>
                  <span>100%</span>
                </div>
              </div>

              {/* User estimate */}
              <div className="space-y-1.5 border-t border-gray-100 dark:border-slate-700 pt-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                    <Users className="h-3 w-3" />
                    Est. active users
                  </span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    ~{beamLoadResult.estimatedActiveUsers}
                  </span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-500">
                  <span>Max concurrent (QoS)</span>
                  <span>{beamLoadResult.maxConcurrentUsers}</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-500">
                  <span>Beam capacity</span>
                  <span>{beamLoadResult.beamCapacityMbps} Mbps</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-300 font-medium">
                  <span>Est. user share</span>
                  <span>~{beamLoadResult.estimatedUserThroughputMbps} Mbps</span>
                </div>
                <div className="flex justify-between text-gray-500 dark:text-gray-500">
                  <span>Zone</span>
                  <span>{beamLoadResult.densityZoneLabel}</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">
                Estimated from geographic density heuristics — not real subscriber data
              </p>
            </div>
          </CollapsibleSection>
        )}

        {/* LEO Radio Path */}
        <CollapsibleSection
          storageKey="leo-radio-path"
          title={<>{isRegulatoryBlocked ? 'Radio Path (Diagnostic only)' : 'Radio Path'}<SectionTooltip content="End-to-end signal route: User → LEO Satellite → SNP gateway and back. Shows elevation angle, slant range, and one-way propagation delay for each segment. No SNP means no service is available." /></>}
          subtitle={isRegulatoryBlocked ? blockedDiagnosticMessage : undefined}
          accentColor="#db2777"
          defaultOpen={true}
        >
          {resolvedLEOConnectivity ? (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
              {isRegulatoryBlocked && diagnosticOnlyNotice}
              {resolvedLEOConnectivity.snp ? (
                <div className="break-words leading-relaxed">{userLabel} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button> → {resolvedLEOConnectivity.snp.name} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button> → {userLabel}</div>
              ) : (
                <div className="break-words leading-relaxed">{userLabel} → <button onClick={() => onSatelliteClick?.(resolvedLEOConnectivity.satellite)} className="underline hover:no-underline text-pink-600 dark:text-pink-400 font-medium cursor-pointer break-all">{resolvedLEOConnectivity.satellite.name}</button> (→ No SNP connectivity)</div>
              )}
              {resolvedLEOConnectivity.snp ? (
                <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                  <div>
                    <div className="break-words">{userLabel} → {resolvedLEOConnectivity.satellite.name}{resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}</div>
                    <div className="pl-3 sm:pl-4 break-words">→ Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.userLEODistance?.toFixed(0)} km ({(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)</div>
                  </div>
                  <div>
                    <div className="break-words">{resolvedLEOConnectivity.snp.name} → {resolvedLEOConnectivity.satellite.name}</div>
                    <div className="pl-3 sm:pl-4 break-words">→ Elevation: {resolvedLEOConnectivity.snpLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.snpLEODistance?.toFixed(0)} km ({(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)</div>
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
                  <div>→ Elevation: {resolvedLEOConnectivity.userLEOElevation?.toFixed(1)}° | Distance: {resolvedLEOConnectivity.userLEODistance?.toFixed(0)} km ({(resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000).toFixed(1)} ms)</div>
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

        {/* LEO Estimated Performance */}
        <CollapsibleSection
          storageKey="leo-performance"
          title={<>{isRegulatoryBlocked ? 'Estimated Performance (Diagnostic only)' : 'Estimated Performance'}<SectionTooltip content="Predicted downlink/uplink throughput and round-trip latency based on LEO link geometry, beam health factors, weather attenuation, and the current corridor DC level." /></>}
          subtitle={isRegulatoryBlocked ? blockedDiagnosticMessage : undefined}
          accentColor="#db2777"
          defaultOpen={true}
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

      </div>
    </>
  );
});

LEOConnectivitySection.displayName = 'LEOConnectivitySection';
export default LEOConnectivitySection;
