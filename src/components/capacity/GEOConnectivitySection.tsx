import { memo, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { PerformancePanel } from '../MetricWidgets';
import { SectionTooltip } from '../SectionTooltip';
import CoverageSelector from '../CoverageSelector';
import CollapsibleSection from '../layout/CollapsibleSection';
import { SPEED_OF_LIGHT_RADIO_KM_S } from '../../utils/capacityCalculator';
import type { SatelliteData } from '../../types/satellites';
import type { CandidateCoverage } from '../../types/analysis';
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GEOGeometry {
  userToSatellite: {
    elevationDeg: number;
    slantRangeKm: number;
    latencyMs: number;
  };
  satelliteToGateway: {
    slantRangeKm: number | null;
    latencyMs: number | null;
    gateway: { name: string } | null;
  };
  oneWayRadioMs: number | null;
  rttPropagationMs: number | null;
  rttTotalMs: number | null;
  propagationBreakdownMs: {
    userToSatellite: number | null;
    satelliteToGateway: number | null;
    gatewayToSatellite: number | null;
    satelliteToUser: number | null;
  };
  overheadMs: {
    gatewayProcessing: number;
    modemProcessing: number;
    routing: number;
    total: number;
  };
  warnings: string[];
  isUserLinkUnstable: boolean;
}

export interface ResolvedGEOConnectivity {
  satellite: SatelliteData;
  candidate: { coverageName: string };
  geometry: GEOGeometry | null;
  elevation: number;
  distance: number;
  rtt: number | null;
  beam: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatGeoStabilityTooltip = (elevationDeg: number, isUserLinkUnstable: boolean): string => {
  const currentRule = isUserLinkUnstable
    ? 'Current status: Unstable (elevation is below 5 deg).'
    : elevationDeg >= 40
      ? 'Current status: High (elevation is at least 40 deg).'
      : elevationDeg >= 25
        ? 'Current status: Medium (elevation is between 25 deg and 40 deg).'
        : elevationDeg >= 5
          ? 'Current status: Low (elevation is between 5 deg and 25 deg).'
          : 'Current status: Unstable (elevation is below 5 deg).';

  return `GEO stability rule:
  - Unstable below 5 deg elevation
  - Low from 5 deg to below 25 deg
  - Medium from 25 deg to below 40 deg
  - High at 40 deg and above
Current elevation: ${elevationDeg.toFixed(1)} deg.
${currentRule}`;
};

// ─── Main component ───────────────────────────────────────────────────────────

interface GEOConnectivitySectionProps {
  resolvedGEOConnectivity: ResolvedGEOConnectivity | null;
  geoGeometry: GEOGeometry | null;
  calculateGEOPerformance: (elevationDeg: number) => {
    downlinkGbps: number;
    uplinkGbps: number;
    stability: string;
    performanceFactor: number;
    weatherFactor: number;
    weatherLabel: string;
  };
  terminalType: TerminalType;
  candidateCoverages: CandidateCoverage[];
  selectedCoverage: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
}

const RTT_VISUAL_SCALE_MAX_MS = 600;

const GEOConnectivitySection = memo<GEOConnectivitySectionProps>(({
  resolvedGEOConnectivity,
  geoGeometry,
  calculateGEOPerformance,
  terminalType,
  candidateCoverages,
  selectedCoverage,
  onSelectCoverage,
  analysisSource,
  aircraftCallsign,
  onSatelliteClick,
}) => {
  const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';

  return (
    <>
      <h3 className="text-lg font-semibold mb-1 flex items-center" style={{ color: '#2563eb' }}>
        GEO Connectivity
        <SectionTooltip content="Geostationary orbit connectivity block. Shows how the user terminal connects through a Eutelsat GEO satellite and its nearest eligible ground gateway." />
      </h3>

      {candidateCoverages.length > 0 && selectedCoverage && (
        <div className="mb-4">
          <CoverageSelector
            candidateCoverages={candidateCoverages}
            selectedCoverage={selectedCoverage}
            onSelectCoverage={(coverage) => onSelectCoverage?.(coverage)}
          />
        </div>
      )}

      <div className="space-y-4">
        {/* GEO Radio Path */}
        <CollapsibleSection
          storageKey="geo-radio-path"
          title={<>Radio Path<SectionTooltip content="End-to-end signal route: User → GEO Satellite → Ground Gateway and back. Shows elevation angle, slant range, and propagation delay per segment." /></>}
          accentColor="#2563eb"
          defaultOpen={true}
        >
          {resolvedGEOConnectivity && geoGeometry ? (
            (() => {
              const gatewayName = geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible gateway';
              const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
              const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
                ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
                : null;
              return (
                <div className="text-sm text-gray-700 dark:text-gray-300 text-center space-y-3 min-w-0">
                  <div className="break-words leading-relaxed">{userLabel} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer break-all">{resolvedGEOConnectivity.satellite.name}</button> → {gatewayName} → <button onClick={() => onSatelliteClick?.(resolvedGEOConnectivity.satellite)} className="underline hover:no-underline text-blue-600 dark:text-blue-400 font-medium cursor-pointer break-all">{resolvedGEOConnectivity.satellite.name}</button> → {userLabel}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2 text-left">
                    <div>
                      <div className="break-words">{userLabel} → {userToSatelliteLabel}</div>
                      <div className="pl-3 sm:pl-4 break-words">→ Elevation: {geoGeometry.userToSatellite.elevationDeg.toFixed(1)}° | Slant Range: {geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km ({geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)</div>
                    </div>
                    <div>
                      <div className="break-words">{gatewayName} → {resolvedGEOConnectivity.satellite.name}</div>
                      <div className="pl-3 sm:pl-4 break-words">→ Slant Range: {geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : '--'} ({geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : '--'})</div>
                    </div>
                    <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between font-semibold text-gray-700 dark:text-gray-200">
                      <span>One-way propagation</span>
                      <span className="break-words">{oneWayDistanceKm != null && geoGeometry.oneWayRadioMs != null ? `${oneWayDistanceKm.toFixed(0)} km (${geoGeometry.oneWayRadioMs.toFixed(1)} ms)` : '--'}</span>
                    </div>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
              <div>No GEO visibility or beam coverage.</div>
            </div>
          )}
        </CollapsibleSection>

        {/* GEO Latency Breakdown */}
        <LatencyBreakdownCard
          accentColor="#2563eb"
          tooltip="Breakdown of the full round-trip propagation delay over the GEO link: User → Satellite → Gateway → Satellite → User, plus network overhead. GEO propagation alone accounts for ~480 ms due to the 35,786 km orbital altitude."
          summary={geoGeometry ? `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms` : 'No GEO latency breakdown available'}
        >
          {geoGeometry ? (
            <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
              <div className="font-semibold text-gray-700 dark:text-gray-200">RTT propagation components</div>
              <div className="flex justify-between"><span>User {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} Gateway</span><span>{geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms</span></div>
              <div className="flex justify-between"><span>Gateway {'->'} Satellite</span><span>{geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms</span></div>
              <div className="flex justify-between"><span>Satellite {'->'} User</span><span>{geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms</span></div>
              <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                <span>RTT propagation</span><span>{geoGeometry.rttPropagationMs?.toFixed(1) ?? '--'} ms</span>
              </div>
              <div className="pt-1 font-semibold text-gray-700 dark:text-gray-200">Network overhead components</div>
              <div className="ml-2 flex justify-between"><span>Gateway processing delay</span><span>{geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between"><span>Modem processing delay</span><span>{geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between"><span>Routing delay</span><span>{geoGeometry.overheadMs.routing.toFixed(0)} ms</span></div>
              <div className="ml-2 flex justify-between font-semibold text-gray-700 dark:text-gray-200">
                <span>Network overhead total</span><span>{geoGeometry.overheadMs.total.toFixed(1)} ms</span>
              </div>
              <div className="border-t border-gray-200 dark:border-slate-700 pt-2 flex justify-between font-semibold text-gray-800 dark:text-gray-100">
                <span>Estimated RTT total</span><span>{geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms</span>
              </div>
              {geoGeometry.warnings.length > 0 && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-2 text-amber-800 dark:text-amber-300">
                  {geoGeometry.warnings.map((warning, index) => (
                    <div key={`${warning}-${index}`}>Warning: {warning}</div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300 text-center">
              <div>No GEO latency breakdown available</div>
            </div>
          )}
        </LatencyBreakdownCard>

        {/* GEO Estimated Performance */}
        <CollapsibleSection
          storageKey="geo-performance"
          title={<>Estimated Performance<SectionTooltip content="Predicted GEO link throughput and end-to-end RTT. Throughput degrades at low elevation angles. Note the ~600 ms RTT inherent to all GEO orbits due to the 35,786 km orbital altitude." /></>}
          accentColor="#2563eb"
          defaultOpen={true}
        >
          {resolvedGEOConnectivity && geoGeometry ? (
            (() => {
              const performance = calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
              const geoStabilityTooltip = formatGeoStabilityTooltip(
                geoGeometry.userToSatellite.elevationDeg,
                geoGeometry.isUserLinkUnstable,
              );
              return (
                <PerformancePanel
                  rtt={geoGeometry.rttTotalMs}
                  downlinkGbps={performance.downlinkGbps}
                  uplinkGbps={performance.uplinkGbps}
                  maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
                  maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
                  stability={geoGeometry.isUserLinkUnstable ? 'Unstable' : performance.stability}
                  performanceFactor={performance.performanceFactor}
                  accentColor="#2563eb"
                  rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
                  rttLabel="End-to-End GEO RTT"
                  stabilityTooltip={geoStabilityTooltip}
                />
              );
            })()
          ) : (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={TERMINAL_PROFILES[terminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[terminalType].maxUlGbps}
              accentColor="#2563eb"
              noDataMessage="No GEO coverage available"
            />
          )}
        </CollapsibleSection>
      </div>
    </>
  );
});

GEOConnectivitySection.displayName = 'GEOConnectivitySection';
export default GEOConnectivitySection;
