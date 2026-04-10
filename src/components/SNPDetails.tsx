import { memo } from 'react';
import type { SNPData } from './globe/GlobeConfig';
import type { SNPConnectedSatellite } from '../services/coverageService';
import type { SatelliteData } from '../types/satellites';
import { useSimulation } from '../contexts/SimulationContext';
import { BACKHAUL_RADIUS_KM } from '../utils/leoFootprint';
import { SectionTooltip } from './SectionTooltip';

interface SNPDetailsProps {
  snp: SNPData;
  connectedSatellites: SNPConnectedSatellite[];
  onSatelliteClick?: (satellite: SatelliteData) => void;
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

const SNPDetails = memo<SNPDetailsProps>(({ snp, connectedSatellites, onSatelliteClick, compactDesktop = false, externalHeader = false }) => {
  const { failedSnps, toggleSnpFailure } = useSimulation();
  const isFailed = failedSnps.has(snp.name);

  const avgElevation = connectedSatellites.length > 0
    ? connectedSatellites.reduce((s, c) => s + c.elevation, 0) / connectedSatellites.length
    : null;
  const minLatency = connectedSatellites.length > 0
    ? Math.min(...connectedSatellites.map(c => c.latencyMs))
    : null;
  const maxLatency = connectedSatellites.length > 0
    ? Math.max(...connectedSatellites.map(c => c.latencyMs))
    : null;

  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
      <div className={`flex h-full flex-col overflow-y-auto ${compactDesktop ? 'p-3.5' : 'p-4'}`}>
        <div className={compactDesktop ? 'space-y-3.5' : 'space-y-4'}>

          {/* Header — same structure as SatelliteDetails */}
          {!externalHeader && (
            <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center space-x-3">
                <div className="w-3 h-3 rounded-full bg-[#FFA500] shadow-lg shadow-orange-400/50" style={{ animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite' }} />
                <div>
                  <h2 className={`font-bold text-gray-900 dark:text-gray-100 ${compactDesktop ? 'text-xl' : 'text-2xl'}`}>SNP Details</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{snp.name} · {snp.region}</p>
                </div>
              </div>
              <span className={`rounded-full font-medium ${compactDesktop ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${
                isFailed
                  ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200'
                  : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200'
              }`}>
                {isFailed ? 'Failed' : 'Operational'}
              </span>
            </div>
          )}

          {/* Backhaul Coverage */}
          <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700">
            <h3 className="mb-2 flex items-center text-sm font-semibold text-gray-900 dark:text-gray-100">
              Backhaul Coverage
              <SectionTooltip content="The geographic zone within which LEO satellites can establish a backhaul link to this SNP. Based on a 15° minimum elevation mask at the satellite." />
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Coverage radius</span>
                <span className="font-mono font-medium text-gray-800 dark:text-gray-200">{BACKHAUL_RADIUS_KM.toLocaleString()} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Elevation mask</span>
                <span className="font-mono font-medium text-gray-800 dark:text-gray-200">≥ 15°</span>
              </div>
            </div>
          </div>

          {/* Connected Satellites */}
          <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700">
            <h3 className="mb-3 flex items-center text-sm font-semibold text-gray-900 dark:text-gray-100">
              Connected Satellites
              <SectionTooltip content="LEO satellites currently within this SNP's backhaul coverage zone (elevation ≥ 15°). Updated every 2 seconds." />
            </h3>

            {connectedSatellites.length === 0 ? (
              <p className="text-sm text-center text-gray-500 dark:text-gray-400 py-2">
                {isFailed ? 'SNP offline — no connections' : 'No satellites in coverage'}
              </p>
            ) : (
              <>
                {/* Aggregate stats */}
                <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b border-gray-200 dark:border-slate-700">
                  <div>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{connectedSatellites.length}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">satellites</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {avgElevation != null ? avgElevation.toFixed(1) + '°' : '—'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">avg elev.</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
                      {minLatency != null ? Math.round(minLatency) + '–' + Math.round(maxLatency!) + ' ms' : '—'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">1-way latency</div>
                  </div>
                </div>

                {/* Per-satellite list */}
                <div className="space-y-1 max-h-64 overflow-y-auto -mx-1 px-1">
                  {connectedSatellites.map(({ satellite, elevation, distanceKm, latencyMs }) => (
                    <div
                      key={satellite.id}
                      className={`rounded-lg px-3 py-2 flex items-center justify-between gap-2 bg-white dark:bg-slate-900 border border-gray-100 dark:border-slate-700 ${
                        onSatelliteClick ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors' : ''
                      }`}
                      onClick={onSatelliteClick ? () => onSatelliteClick(satellite) : undefined}
                      title={onSatelliteClick ? `Open ${satellite.name}` : undefined}
                    >
                      <span className="text-sm font-medium truncate text-pink-600 dark:text-pink-400">{satellite.name}</span>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 font-mono">
                        <span title="Elevation">{elevation.toFixed(1)}°</span>
                        <span title="Surface distance">{Math.round(distanceKm)} km</span>
                        <span title="One-way latency">{Math.round(latencyMs)} ms</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Control */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => toggleSnpFailure(snp.name)}
              className={`w-full py-2 px-4 rounded-lg text-sm font-semibold transition-colors ${
                isFailed
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isFailed ? 'Restore SNP (mark operational)' : 'Mark SNP as failed'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
});

SNPDetails.displayName = 'SNPDetails';

export default SNPDetails;
