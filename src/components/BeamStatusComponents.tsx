/**
 * Beam Status Components for SatelliteDetails
 * Add these components to enhance satellite details display
 */

import React from 'react';
import { getRadiusAtPowerLevel, type CoveragePolicy } from '../utils/leoFootprint';
import { getBeamFrequency, getBeamBaseColor, FREQUENCY_REUSE } from '../config/beamVisualization';
import {
  type BeamHealthData,
  PERIPHERAL_BEAM_INDICES,
  calculateBeamPowerAllocation,
  MAX_PAYLOAD_POWER,
  KA_BACKHAUL_CONSUMPTION,
  type WeatherCondition
} from '../utils/realisticSimulation';

// Helper to get polarization display
const getPolarizationDisplay = (polarization: string): string => {
  switch (polarization) {
    case 'LHCP': return 'LHCP';
    case 'RHCP': return 'RHCP';
    default: return polarization;
  }
};

// ─────────────────────────────────────────────────────────────────
// BeamStatusGrid Component
// ─────────────────────────────────────────────────────────────────

interface BeamStatusGridProps {
  activeBeams: number;
  isBlankingZone: boolean;
  isGSOAvoidance: boolean;
  latitude: number;
  beamHealthFactors: BeamHealthData[];
  onHealthChange: (beamIndex: number, value: number) => void;
  onReset: () => void;
  weatherCondition: WeatherCondition;
  isMovingNorth?: boolean;
  /** Feature 3 – Beam HS: array of 16 booleans indicating HS status */
  beamHsStatus?: readonly boolean[];
  /** Feature 3 – Beam HS: toggle callback */
  onHsToggle?: (beamIndex: number) => void;
  onResetHs?: () => void;
}

export const BeamStatusGrid: React.FC<BeamStatusGridProps> = ({
  activeBeams,
  isBlankingZone,
  isGSOAvoidance,
  latitude,
  beamHealthFactors,
  onHealthChange,
  onReset,
  weatherCondition,
  isMovingNorth = false,
  beamHsStatus = Array(16).fill(false),
  onHsToggle,
  onResetHs,
}) => {
  const getHealth = (beamIndex: number): number => {
    const entry = beamHealthFactors.find(b => b.beamIndex === beamIndex);
    return entry ? entry.healthFactor : 1.0;
  };

  const getHealthColor = (h: number): string => {
    if (h >= 0.90) return 'bg-green-500';
    if (h >= 0.70) return 'bg-amber-500';
    return 'bg-red-500';
  };

  // Convert Cesium Color to RGB string for CSS
  const getBeamColorRgb = (beamIndex: number): string => {
    const cesiumColor = getBeamBaseColor(beamIndex);
    const red = Math.round(cesiumColor.red * 255);
    const green = Math.round(cesiumColor.green * 255);
    const blue = Math.round(cesiumColor.blue * 255);
    return `rgb(${red}, ${green}, ${blue})`;
  };

  // Determine satellite movement direction for arrow display
  const getMovementDirection = (): 'north' | 'south' => {
    return isMovingNorth ? 'north' : 'south';
  };

  const movementDirection = getMovementDirection();

  // Determine which beams are active based on GSO Protection logic
  const getBeamStatus = (beamIndex: number): 'active' | 'inactive' | 'gso-half' => {
    if (isBlankingZone) return 'inactive';

    if (isGSOAvoidance) {
      // In GSO avoidance, the satellite turns off the beams pointing towards the equator
      // to avoid illuminating the geostationary arc.
      // Therefore, in the Northern hemisphere, Northern beams remain active (pointing away from equator).
      // In the Southern hemisphere, Southern beams remain active.
      const shouldActivateNorthernBeams = latitude >= 0;
      const isActive = shouldActivateNorthernBeams
        ? beamIndex >= 0 && beamIndex <= 7
        : beamIndex >= 8 && beamIndex <= 15;
      return isActive ? 'gso-half' : 'inactive';
    }

    return 'active';
  };

  // Calculate total power
  let payloadPower = 0;
  for (let i = 0; i < 16; i++) {
    const status = getBeamStatus(i);
    const isBeamActive = status !== 'inactive';
    const beamPower = calculateBeamPowerAllocation(isBeamActive, activeBeams, weatherCondition);
    payloadPower += beamPower;
  }
  const currentTotalPower = payloadPower + KA_BACKHAUL_CONSUMPTION;

  return (
    <div className="space-y-3">
      {/* Frequency Summary */}
      <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-200 dark:border-slate-700">
        <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Frequency Assignment Summary</h5>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {Object.entries(FREQUENCY_REUSE.FREQUENCIES).map(([group, freq]) => {
            const groupBeams = Array.from({ length: 4 }, (_, i) => i * 4 + Object.keys(FREQUENCY_REUSE.FREQUENCIES).indexOf(group));
            const color = FREQUENCY_REUSE.COLORS[group as keyof typeof FREQUENCY_REUSE.COLORS];
            return (
              <div key={group} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full border border-white/20"
                  style={{ backgroundColor: color.toCssColorString() }}
                />
                <div>
                  <span className="font-medium" style={{ color: color.toCssColorString() }}>{group.slice(-1)}:</span>
                  <span className="ml-1 text-gray-600 dark:text-gray-400">{freq.band}</span>
                  <div style={{ color: color.toCssColorString() }}>
                    ↓ {freq.downlink} GHz
                  </div>
                  <div style={{ color: color.toCssColorString() }}>
                    ↑ {freq.uplink} GHz
                  </div>
                  <div className="text-gray-500 dark:text-gray-500">
                    {getPolarizationDisplay(freq.polarization)}
                  </div>
                  <div className="text-gray-500 dark:text-gray-500">
                    {groupBeams.map(b => `B${b}`).join(', ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Gateway/Backhaul Information */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500 border border-white/20"></div>
            <div>
              <span className="font-medium text-orange-600 dark:text-orange-400">Gateway (Backhaul):</span>
              <span className="ml-1 text-gray-600 dark:text-gray-400">{FREQUENCY_REUSE.GATEWAY.band}</span>
              <div className="text-gray-500 dark:text-gray-500">
                ↓ {FREQUENCY_REUSE.GATEWAY.downlink} GHz
              </div>
              <div className="text-gray-500 dark:text-gray-500">
                ↑ {FREQUENCY_REUSE.GATEWAY.uplink} GHz
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-slate-700">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
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
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
            Power: {Math.round(currentTotalPower)} (Payload: {Math.round(payloadPower)}W + Backhaul: {KA_BACKHAUL_CONSUMPTION}W) / {MAX_PAYLOAD_POWER} W
          </span>
        </div>
      </div>

      {/* Beam Grid - 2 rows of 8 beams with single arrow */}
      <div className="flex gap-1">
        {/* Single arrow showing satellite movement direction */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-lg text-gray-300">
            {movementDirection === 'north' ? '↑' : '↓'}
          </div>
        </div>

        {/* Beams container */}
        <div className="flex-1 space-y-4">
          {/* Beams 0-7 */}
          <div className="flex items-end gap-1">
            <div className="flex gap-1 flex-1">
              {Array.from({ length: 8 }, (_, i) => {
                const isHs = beamHsStatus[i] ?? false;
                const status = isHs ? 'hs' : getBeamStatus(i);
                const h = getHealth(i);
                const isPeripheral = PERIPHERAL_BEAM_INDICES.has(i);
                const pct = Math.round(h * 100);
                const isBeamActive = status !== 'inactive' && status !== 'hs';
                const beamPower = isHs ? 0 : calculateBeamPowerAllocation(isBeamActive, activeBeams, weatherCondition);

                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    {/* Operational Status Badge */}
                    <div
                      className={`w-full h-6 rounded flex items-center justify-center text-[10px] font-medium transition-colors ${
                        isHs
                          ? 'bg-red-700 dark:bg-red-900 text-white shadow-sm'
                          : status === 'active' || status === 'gso-half'
                            ? 'text-white shadow-sm'
                            : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                      style={{
                        backgroundColor: !isHs && status !== 'inactive' ? getBeamColorRgb(i) : undefined
                      }}
                      title={`Beam ${i}: ${isHs ? 'HS – Hard Out of Service' : status === 'active' ? 'Active' : status === 'gso-half' ? 'GSO Mode' : 'Inactive'} | ${getBeamFrequency(i).band}-band | ${getBeamFrequency(i).downlink} GHz downlink`}
                    >
                      {isHs
                        ? <span className="font-bold tracking-tight">HS</span>
                        : <span className={isPeripheral && isBeamActive ? 'font-bold underline decoration-2 underline-offset-2' : ''}>{i}</span>
                      }
                    </div>

                    {/* HS Toggle button */}
                    {onHsToggle && (
                      <button
                        type="button"
                        onClick={() => onHsToggle(i)}
                        title={isHs ? `Restore beam ${i}` : `Mark beam ${i} as HS (out of service)`}
                        className={`w-full h-4 rounded-sm text-[8px] font-bold transition-colors ${
                          isHs
                            ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900'
                        }`}
                      >
                        {isHs ? 'RESTORE' : 'HS'}
                      </button>
                    )}

                    {/* Health Body */}
                    <div className={`w-full flex flex-col items-center gap-1 transition-opacity duration-300 ${(!isBeamActive || isHs) ? 'opacity-30 grayscale' : 'opacity-100'}`}>

                      {/* Interactive Health bar */}
                      <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-sm overflow-hidden" style={{ height: '40px' }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-sm transition-all duration-300 ${isHs ? 'bg-red-500' : getHealthColor(h)}`}
                          style={{ height: `${isHs ? 100 : pct}%` }}
                        />

                        {/* Text Inside Bar */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                            {isHs ? 'HS' : `${pct}%`}
                          </span>
                        </div>

                        {/* Invisible Interactive Slider Layer */}
                        {isBeamActive && !isHs && (
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={h}
                            onChange={e => onHealthChange(i, parseFloat(e.target.value))}
                            title={`Beam ${i} health: ${pct}%`}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize m-0 p-0"
                            style={{
                              WebkitAppearance: 'slider-vertical' as any,
                              appearance: 'slider-vertical' as any
                            }}
                          />
                        )}
                      </div>

                      {/* Wattage */}
                      <span className={`text-[10px] font-bold ${isHs ? 'text-red-500 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                        {isHs ? '0W' : `${beamPower.toFixed(1)}W`}
                      </span>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Beams 8-15 */}
          <div className="flex items-end gap-1">
            <div className="flex gap-1 flex-1">
              {Array.from({ length: 8 }, (_, i) => {
                const beamIndex = i + 8;
                const isHs = beamHsStatus[beamIndex] ?? false;
                const status = isHs ? 'hs' : getBeamStatus(beamIndex);
                const h = getHealth(beamIndex);
                const isPeripheral = PERIPHERAL_BEAM_INDICES.has(beamIndex);
                const pct = Math.round(h * 100);
                const isBeamActive = status !== 'inactive' && status !== 'hs';
                const beamPower = isHs ? 0 : calculateBeamPowerAllocation(isBeamActive, activeBeams, weatherCondition);

                return (
                  <div
                    key={beamIndex}
                    className="flex-1 flex flex-col items-center gap-1"
                  >
                    {/* Operational Status Badge */}
                    <div
                      className={`w-full h-6 rounded flex items-center justify-center text-[10px] font-medium transition-colors ${
                        isHs
                          ? 'bg-red-700 dark:bg-red-900 text-white shadow-sm'
                          : status === 'active' || status === 'gso-half'
                            ? 'text-white shadow-sm'
                            : 'bg-gray-300 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                      }`}
                      style={{
                        backgroundColor: !isHs && status !== 'inactive' ? getBeamColorRgb(beamIndex) : undefined
                      }}
                      title={`Beam ${beamIndex}: ${isHs ? 'HS – Hard Out of Service' : status === 'active' ? 'Active' : status === 'gso-half' ? 'GSO Mode' : 'Inactive'} | ${getBeamFrequency(beamIndex).band}-band | ${getBeamFrequency(beamIndex).downlink} GHz downlink`}
                    >
                      {isHs
                        ? <span className="font-bold tracking-tight">HS</span>
                        : <span className={isPeripheral && isBeamActive ? 'font-bold underline decoration-2 underline-offset-2' : ''}>{beamIndex}</span>
                      }
                    </div>

                    {/* HS Toggle button */}
                    {onHsToggle && (
                      <button
                        type="button"
                        onClick={() => onHsToggle(beamIndex)}
                        title={isHs ? `Restore beam ${beamIndex}` : `Mark beam ${beamIndex} as HS (out of service)`}
                        className={`w-full h-4 rounded-sm text-[8px] font-bold transition-colors ${
                          isHs
                            ? 'bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900'
                        }`}
                      >
                        {isHs ? 'RESTORE' : 'HS'}
                      </button>
                    )}

                    {/* Health Body */}
                    <div className={`w-full flex flex-col items-center gap-1 transition-opacity duration-300 ${(!isBeamActive || isHs) ? 'opacity-30 grayscale' : 'opacity-100'}`}>

                      {/* Interactive Health bar */}
                      <div className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-sm overflow-hidden" style={{ height: '40px' }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-sm transition-all duration-300 ${isHs ? 'bg-red-500' : getHealthColor(h)}`}
                          style={{ height: `${isHs ? 100 : pct}%` }}
                        />

                        {/* Text Inside Bar */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                            {isHs ? 'HS' : `${pct}%`}
                          </span>
                        </div>

                        {/* Invisible Interactive Slider Layer */}
                        {isBeamActive && !isHs && (
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={h}
                            onChange={e => onHealthChange(beamIndex, parseFloat(e.target.value))}
                            title={`Beam ${beamIndex} health: ${pct}%`}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize m-0 p-0"
                            style={{
                              WebkitAppearance: 'slider-vertical' as any,
                              appearance: 'slider-vertical' as any
                            }}
                          />
                        )}
                      </div>

                      {/* Wattage */}
                      <span className={`text-[10px] font-bold ${isHs ? 'text-red-500 dark:text-red-400' : 'text-blue-700 dark:text-blue-400'}`}>
                        {isHs ? '0W' : `${beamPower.toFixed(1)}W`}
                      </span>

                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legends and Controls */}
      <div className="flex flex-col gap-2 pt-3 border-t border-gray-200 dark:border-slate-700">
        <div className="flex items-center justify-between text-[11px]">
          {/* Health Legend */}
          <div className="flex items-center gap-3">
            <span className="font-semibold text-gray-700 dark:text-gray-300">Health:</span>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
              <span className="text-gray-600 dark:text-gray-400">≥ 90%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
              <span className="text-gray-600 dark:text-gray-400">70–89%</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-red-600 dark:text-red-400">&lt; 70%</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={onReset}
              className="px-2 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Reset Health
            </button>
            {onResetHs && (
              <button
                onClick={onResetHs}
                className="px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
              >
                Restore All HS
              </button>
            )}
          </div>
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
