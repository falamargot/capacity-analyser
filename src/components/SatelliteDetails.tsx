import { SatelliteData } from '../types/satellites';
import { formatCoordinates } from '../utils/formatters';
import { getNearestSNPInBackhaul } from '../services/coverageService';
import { getActiveBeamCount } from '../utils/oneWebComb';
import { JulianDate } from 'cesium';
import { useState, useEffect, useMemo } from 'react';
import * as satellite from 'satellite.js';
import { useGSOAvoidance } from '../hooks/useGSOAvoidance';

// NEW IMPORTS - BeamStatusComponents integration
import { BeamStatusGrid, CoveragePolicyDisplay } from './BeamStatusComponents';
import { useSimulation } from '../contexts/SimulationContext';


// Pitch Monitoring Chart Component
const PitchMonitoringChart: React.FC<{ currentLatitude: number; currentPitch: number }> = ({
  currentLatitude,
  currentPitch
}) => {
  const PITCH_START_LAT = 45.0;
  const MAX_PITCH_DEG = 17.0;

  // Generate Safety Dome curve points using same formula as calculateGSOAvoidanceAngle
  const curvePoints = useMemo(() => {
    const points: string[] = [];
    for (let lat = -90; lat <= 90; lat += 1) {
      // Safety Dome formula: pitch = MAX_PITCH * cos((lat / 45) * (PI / 2))
      const progress = Math.abs(lat) / PITCH_START_LAT;
      const pitchMagnitude = progress <= 1 ? MAX_PITCH_DEG * Math.cos(progress * (Math.PI / 2)) : 0;

      // Apply direction based on hemisphere and movement (simplified for visualization)
      const pitch = lat >= 0 ? pitchMagnitude : -pitchMagnitude;

      const x = 30 + ((lat + 90) / 180) * 270; // Map -90 to 90 onto 0-280px
      const y = 97 - (Math.abs(pitch) / 20) * 94; // Map 0-20° onto 107-13px (absolute pitch)
      points.push(`${x},${y}`);
    }
    return points.join(' ');
  }, []);

  // Calculate current position on curve using same formula
  const currentX = 30 + ((currentLatitude + 90) / 180) * 270;
  const currentY = 97 - (Math.abs(currentPitch) / 20) * 94;

  return (
    <div className="relative w-full h-full">
      <svg width="100%" height="100%" viewBox="0 0 320 120" className="overflow-visible">
        {/* Grid lines */}
        <defs>
          <pattern id="grid" width="15" height="24" patternUnits="userSpaceOnUse">
            <path d="M 15 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
          </pattern>
        </defs>
        <rect x="30" y="0" width="272" height="94" fill="url(#grid)" />

        {/* Axes */}
        <line x1="30" y1="97" x2="300" y2="97" stroke="#9ca3af" strokeWidth="1" />
        <line x1="30" y1="0" x2="30" y2="97" stroke="#9ca3af" strokeWidth="1" />

        {/* Avoidance Zone - between -45° and +45° */}
        <rect x="97" y="0" width="137" height="97" fill="#ecb54fff" opacity="0.2" />

        {/* Equator line with flip visualization */}
        <text x="170" y="-3" textAnchor="middle" fill="#ecb54fff" fontSize="9" fontWeight="medium">GSO Arc Protection</text>

        {/* Exclusion Zone - between -2° and +2° */}
        <rect x="163" y="0" width="5" height="97" fill="#6b7280" opacity="0.3" />
        <text x="160" y="68" textAnchor="middle" fill="#374151" fontSize="8" fontWeight="medium" opacity="0.8" transform="rotate(-90 160 60)">EXCLUSION</text>

        {/* Dome curve */}
        <polyline
          points={curvePoints}
          fill="none"
          stroke="#ec4899"
          strokeWidth="2"
        />

        {/* Current position dot - snapped to curve */}
        <circle
          cx={currentX}
          cy={currentY}
          r="4"
          fill={Math.abs(currentLatitude) <= 2 ? "#6b7280" : "#ec4899"}
          stroke="white"
          strokeWidth="2"
        />

        {/* Tooltip with calculated values */}
        <g transform={`translate(${currentX}, ${currentY - 10})`}>
          <rect
            x="-30"
            y="-13"
            width="60"
            height="14"
            fill="white"
            stroke="#e5e7eb"
            strokeWidth="1"
            rx="2"
          />
          <text
            x="2"
            y="-3"
            textAnchor="middle"
            fill="#374151"
            fontSize="9"
            fontWeight="medium"
          >
            {currentLatitude.toFixed(1)}° | {Math.abs(currentPitch).toFixed(1)}°
          </text>
        </g>

        {/* Axis labels */}
        <text x="168" y="115" textAnchor="middle" fill="#6b7280" fontSize="10">Latitude</text>
        <text x="10" y="50" textAnchor="middle" fill="#6b7280" fontSize="10" transform="rotate(-90 10 50)">Pitch</text>

        {/* X-axis labels */}
        <text x="30" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">-90°</text>
        <text x="98" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">-45°</text>
        <text x="168" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">0°</text>
        <text x="233" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">+45°</text>
        <text x="300" y="105" textAnchor="middle" fill="#6b7280" fontSize="8">+90°</text>

        {/* Y-axis labels */}
        <text x="25" y="102" textAnchor="end" fill="#6b7280" fontSize="8">0°</text>
        <text x="25" y="53" textAnchor="end" fill="#6b7280" fontSize="8">10°</text>
        <text x="25" y="07" textAnchor="end" fill="#6b7280" fontSize="8">20°</text>
      </svg>
    </div>
  );
};


interface SatelliteDetailsProps {
  satellites: SatelliteData[];
  selectedSatellite: SatelliteData;
}


const getSelectedSatellitePosition = (satellites: SatelliteData[], selectedSatellite: SatelliteData) => {
  const position = satellites.find(sat => sat.id === selectedSatellite.id)?.position;
  return (!position) ? { lat: 0, lng: 0 } : { lat: position.lat, lng: position.lng };
};


const SatelliteDetails: React.FC<SatelliteDetailsProps> = ({ satellites, selectedSatellite }) => {
  // NEW: Get coverage policy from simulation context
  const { coveragePolicy, beamHealthFactors, setBeamHealthFactor, resetBeamHealth, weatherCondition } = useSimulation();

  // Get current satellite position from satellites array (real-time)
  const currentSatellite = satellites.find(sat => sat.id === selectedSatellite.id);

  // Calculate nearest SNP for LEO satellites using current position (real-time)
  const nearestSNP = currentSatellite?.type === 'ONEWEB' ? getNearestSNPInBackhaul(currentSatellite) : null;

  // Track GSO Protection state for ONEWEB satellites — via shared hook (no duplicate interval)
  const gsoAvoidanceData = useGSOAvoidance(selectedSatellite.type === 'ONEWEB' ? selectedSatellite : null);

  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
      <div className="p-4 flex flex-col h-full overflow-y-auto">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200 dark:border-slate-700">
            <div className="flex items-center space-x-3">
              <div className="w-3 h-3 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 animate-pulse shadow-lg shadow-pink-500/50"></div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Satellite Details</h2>
                {selectedSatellite.name}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${selectedSatellite.type === 'EUTELSAT'
              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200'
              : 'bg-pink-100 dark:bg-pink-900/40 text-pink-800 dark:text-pink-200'
              }`}>
              {selectedSatellite.type}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 mb-4">
            <div className="sm:col-span-6 bg-gray-50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-sm py-2 px-4 border border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Position</h3>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {formatCoordinates(getSelectedSatellitePosition(satellites, selectedSatellite))}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Altitude: {(currentSatellite?.position.alt || selectedSatellite.position.alt).toFixed(0)} km
              </p>
            </div>

            <div className="sm:col-span-6 bg-gray-50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg shadow-sm py-2 px-4 border border-gray-100 dark:border-slate-700">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Capacity</h3>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedSatellite.capacity.maxThroughput.toLocaleString()} Gbps
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Availability: {(selectedSatellite.capacity.availability * 100).toFixed(2)}%
              </p>
            </div>
          </div>

          {/* Separate SNP Information Section */}
          {selectedSatellite.type === 'ONEWEB' && (
            <div className="mb-4">
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                {nearestSNP ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        Nearest SNP: <span className="font-medium text-gray-800 dark:text-gray-100">{nearestSNP.name} ({nearestSNP.distance.toFixed(0)} km, {nearestSNP.latency.toFixed(1)} ms latency)</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    Nearest SNP: <span className="font-medium text-gray-500 dark:text-gray-400">None</span>
                  </p>
                )}
                {gsoAvoidanceData && (
                  <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-600 space-y-2">
                    {/* Mode Indicator Badge */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Mode:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${gsoAvoidanceData.isBlankingZone
                        ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 animate-pulse'
                        : gsoAvoidanceData.isGSOAvoidance
                          ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-800 dark:text-orange-200 border border-orange-200 dark:border-orange-800'
                          : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 border border-green-200 dark:border-green-800'
                        }`}>
                        {gsoAvoidanceData.isBlankingZone
                          ? 'OFF (EXCLUSION ZONE)'
                          : gsoAvoidanceData.isGSOAvoidance
                            ? 'GSO Protection'
                            : 'Nadir Pointing'
                        }
                      </span>
                    </div>


                    {/* Equatorial Transition Alert */}
                    {Math.abs(gsoAvoidanceData.latitude) <= 2.0 && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-2">
                        <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 flex items-center">
                          ⚠️ EQUATORIAL FLIP IN PROGRESS
                        </p>
                      </div>
                    )}

                    {/* Real-time Pitch Value */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-300">Pitch:</span>
                      <span className={`font-medium text-sm ${gsoAvoidanceData.isGSOAvoidance
                        ? 'text-orange-600 dark:text-orange-400'
                        : 'text-green-600 dark:text-green-400'
                        }`}>
                        {gsoAvoidanceData.pitchAngleDeg.toFixed(1)}°
                      </span>
                    </div>

                    {/* Pitch Monitoring Chart */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Pitch Monitoring</h4>
                      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3" style={{ height: '200px' }}>
                        <PitchMonitoringChart
                          currentLatitude={gsoAvoidanceData.latitude}
                          currentPitch={gsoAvoidanceData.pitchAngleDeg}
                        />
                      </div>
                    </div>

                    {/* NEW: Beam Status Grid */}
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Beam Status
                      </h4>
                      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                        <BeamStatusGrid
                          activeBeams={gsoAvoidanceData.activeBeamCount}
                          isBlankingZone={gsoAvoidanceData.isBlankingZone}
                          isGSOAvoidance={gsoAvoidanceData.isGSOAvoidance}
                          latitude={gsoAvoidanceData.latitude}
                          beamHealthFactors={beamHealthFactors}
                          onHealthChange={setBeamHealthFactor}
                          onReset={resetBeamHealth}
                          weatherCondition={weatherCondition}
                          isMovingNorth={gsoAvoidanceData.isMovingNorth}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NEW: Coverage Policy Display */}
          {selectedSatellite.type === 'ONEWEB' && (
            <CoveragePolicyDisplay policy={coveragePolicy} />
          )}

          {/* Coverage Areas - only for GEO satellites */}
          {selectedSatellite.type === 'EUTELSAT' && (
            <div className="mb-4">
              <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">Coverage Areas</h3>
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
                {selectedSatellite.coverages && selectedSatellite.coverages.length > 0 ? (
                  <ul className="space-y-1">
                    {selectedSatellite.coverages.map((coverage, index) => (
                      <li
                        key={index}
                        className="text-sm text-gray-700 dark:text-gray-300 flex items-center"
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
                        {coverage.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">No coverage areas defined</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


export default SatelliteDetails;
