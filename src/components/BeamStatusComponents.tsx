/**
 * Beam Status Components for SatelliteDetails
 * Add these components to enhance satellite details display
 */

import React from 'react';
import { getRadiusAtPowerLevel, type CoveragePolicy } from '../utils/leoFootprint';

// ─────────────────────────────────────────────────────────────────
// BeamStatusGrid Component
// ─────────────────────────────────────────────────────────────────

interface BeamStatusGridProps {
  activeBeams: number;
  isBlankingZone: boolean;
  isGSOAvoidance: boolean;
  latitude: number;
  isMovingNorth: boolean;
}

export const BeamStatusGrid: React.FC<BeamStatusGridProps> = ({
  activeBeams,
  isBlankingZone,
  isGSOAvoidance,
  latitude,
  isMovingNorth
}) => {
  // Determine which beams are active based on GSO Protection logic
  const getBeamStatus = (beamIndex: number): 'active' | 'inactive' | 'gso-half' => {
    if (isBlankingZone) return 'inactive';
    
    if (isGSOAvoidance) {
      const shouldActivateNorthernBeams = (latitude > 0) === isMovingNorth;
      const isActive = shouldActivateNorthernBeams
        ? beamIndex >= 0 && beamIndex <= 7
        : beamIndex >= 8 && beamIndex <= 15;
      return isActive ? 'gso-half' : 'inactive';
    }
    
    return 'active';
  };

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-slate-700">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          Total: {activeBeams} / 16 beams
        </span>
        {/* Exclusive status messages - only one should display */}
        {isBlankingZone ? (
          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
            All beams off (Exclusion zone)
          </span>
        ) : isGSOAvoidance ? (
          <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
            8 beams active (GSO Protection)
          </span>
        ) : null}
      </div>

      {/* Beam Grid - 2 rows of 8 beams */}
      <div className="space-y-1">
        {/* Northern Beams (0-7) */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-14 font-medium">
            N (0-7)
          </span>
          <div className="flex gap-1 flex-1">
            {Array.from({ length: 8 }, (_, i) => {
              const status = getBeamStatus(i);
              return (
                <div
                  key={i}
                  className={`flex-1 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                    status === 'active'
                      ? 'bg-green-500 text-white shadow-sm'
                      : status === 'gso-half'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                  title={`Beam ${i}: ${status === 'active' ? 'Active' : status === 'gso-half' ? 'GSO Mode' : 'Inactive'}`}
                >
                  {i}
                </div>
              );
            })}
          </div>
        </div>

        {/* Southern Beams (8-15) */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-14 font-medium">
            S (8-15)
          </span>
          <div className="flex gap-1 flex-1">
            {Array.from({ length: 8 }, (_, i) => {
              const beamIndex = i + 8;
              const status = getBeamStatus(beamIndex);
              return (
                <div
                  key={beamIndex}
                  className={`flex-1 h-7 rounded flex items-center justify-center text-xs font-medium transition-colors ${
                    status === 'active'
                      ? 'bg-green-500 text-white shadow-sm'
                      : status === 'gso-half'
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                  title={`Beam ${beamIndex}: ${status === 'active' ? 'Active' : status === 'gso-half' ? 'GSO Mode' : 'Inactive'}`}
                >
                  {beamIndex}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-slate-700 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-green-500 shadow-sm"></div>
          <span className="text-gray-600 dark:text-gray-400">Active</span>
        </div>
        {isGSOAvoidance && (
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-orange-500 shadow-sm"></div>
            <span className="text-gray-600 dark:text-gray-400">GSO Mode</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-gray-300 dark:bg-gray-700"></div>
          <span className="text-gray-600 dark:text-gray-400">Off</span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────
// Coverage Policy Display Component
// ─────────────────────────────────────────────────────────────────

interface CoveragePolicyDisplayProps {
  policy: CoveragePolicy;
}

export const CoveragePolicyDisplay: React.FC<CoveragePolicyDisplayProps> = ({ policy }) => {
  const isServiceZone = policy.type === 'SERVICE_ZONE';

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-100">
        Coverage Policy
      </h3>
      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
        {isServiceZone ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-cyan-100 dark:bg-cyan-900/40 text-cyan-800 dark:text-cyan-200 border border-cyan-200 dark:border-cyan-800">
                Service Zone
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Elevation:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">37°</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Coverage radius:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">~1100 km</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Coverage model:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Circular</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 p-2 bg-white dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700">
              <strong>Simple circular footprint.</strong> Connectivity is based on a simple distance check with 37° minimum elevation. No individual beam calculation required.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800">
                Threshold-based
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Threshold:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {policy.thresholdDb} dB
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Beam radius:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                ~{Math.round(getRadiusAtPowerLevel(policy.thresholdDb))} km
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Total beams:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                16 beams (when active)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 dark:text-gray-400">Coverage model:</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">Beam-based</span>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-3 p-2 bg-white dark:bg-slate-900 rounded border border-gray-200 dark:border-slate-700">
              <strong>Individual beam calculation.</strong> Connectivity requires user to be inside one of the 16 active beams with power ≥ {policy.thresholdDb} dB.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};