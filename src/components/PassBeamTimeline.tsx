/**
 * PassBeamTimeline.tsx
 *
 * Feature 4 – Pass Beam Timeline
 *
 * Computes and renders a ±10-minute window around "now" for a given LEO satellite
 * overpass above a user position. For each 30-second sample it shows:
 *  - Which of the 16 beams covers the user (beam index 0-15, N to S)
 *  - Satellite elevation above the user
 *  - Whether an SNP is reachable (backhaul available)
 *  - Estimated throughput (Mbps)
 *
 * The timeline answers the sat engineer's original question:
 * "Does the connection drop between two beams?"
 * → The overlap between adjacent beams (and the DC-based power allocation) ensures
 *   seamless transition, visible as consecutive cells of the same or adjacent beam index.
 */

import React, { useMemo, useState } from 'react';
import { SectionTooltip } from './SectionTooltip';
import * as satelliteJs from 'satellite.js';
import { JulianDate } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import type { WeatherCondition } from '../utils/realisticSimulation';
import { getBeamPerformance } from '../utils/realisticSimulation';
import { calculateGSOAvoidanceAngle } from '../utils/oneWebComb';
import { findConnectedBeamIndex } from '../utils/rfConnectivity';
import { calculateElevationAngle } from '../utils/capacityCalculator';
import { haversineDistanceKm, BACKHAUL_RADIUS_KM } from '../utils/leoFootprint';
import { SNPS_DATA } from './globe/GlobeConfig';
import { getBeamBaseColor } from '../config/beamVisualization';
import type { BeamHealthData } from '../utils/realisticSimulation';
import { buildSimulationStateSnapshot } from '../types/simulation';
import { useSimulation } from '../contexts/SimulationContext';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

interface TimelinePoint {
  /** Minutes relative to "now" (negative = past, positive = future) */
  offsetMin: number;
  /** Satellite elevation above user horizon (degrees). Negative = below horizon. */
  elevation: number;
  /** Active beam index covering user, or null if not in any beam */
  beamIndex: number | null;
  /** Estimated throughput at this instant (Mbps) */
  throughputMbps: number;
  /** Whether at least one non-failed SNP is within backhaul range */
  snpAvailable: boolean;
  /** Name of the nearest reachable SNP, if any */
  nearestSnpName: string | null;
  /** Number of active beams on this satellite (0, 8, or 16) */
  activeBeamCount: number;
  /** Satellite latitude at this time step (for GSO context) */
  satLatDeg: number;
}

export interface PassBeamTimelineProps {
  satellite: SatelliteData;
  userPosition: { lat: number; lng: number };
  failedSnps: ReadonlySet<string>;
  hsBeams: ReadonlySet<number>;
  weatherCondition: WeatherCondition;
  beamHealthFactors: BeamHealthData[];
  /** Terminal max downlink (Mbps) — caps per-step throughput to match Estimated Performance */
  maxDlMbps: number;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const WINDOW_MINUTES = 10;
const STEP_SECONDS   = 30;
const TOTAL_STEPS    = (WINDOW_MINUTES * 2 * 60) / STEP_SECONDS; // 40 steps

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Propagate satellite position at a given Date using satellite.js SGP4. */
function propagateSatPosition(
  satrec: any,
  date: Date
): { lat: number; lng: number; alt: number } | null {
  try {
    const posVel = satelliteJs.propagate(satrec, date);
    if (!posVel.position || typeof posVel.position === 'boolean') return null;
    const gmst = satelliteJs.gstime(date);
    const geodetic = satelliteJs.eciToGeodetic(
      posVel.position as satelliteJs.EciVec3<number>,
      gmst
    );
    return {
      lat: satelliteJs.degreesLat(geodetic.latitude),
      lng: satelliteJs.degreesLong(geodetic.longitude),
      alt: geodetic.height, // km above surface
    };
  } catch {
    return null;
  }
}

/** Convert a Cesium Color to a CSS rgb() string. */
function cesiumColorToCss(color: { red: number; green: number; blue: number }): string {
  return `rgb(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)})`;
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

const PassBeamTimeline: React.FC<PassBeamTimelineProps> = ({
  satellite,
  userPosition,
  failedSnps,
  hsBeams,
  weatherCondition,
  beamHealthFactors,
  maxDlMbps,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { coveragePolicy } = useSimulation();

  // ── Compute the timeline (memoized on satellite + user position) ────────────
  const timeline = useMemo((): TimelinePoint[] => {
    if (!satellite?.satrec) return [];

    const simulationState = buildSimulationStateSnapshot({
      coveragePolicy,
      weatherCondition,
      beamHealthFactors,
      hsBeams,
    });

    const now = Date.now();
    const points: TimelinePoint[] = [];

    for (let step = 0; step <= TOTAL_STEPS; step++) {
      const offsetSec = -WINDOW_MINUTES * 60 + step * STEP_SECONDS;
      const sampleDate = new Date(now + offsetSec * 1000);
      const julianDate = JulianDate.fromDate(sampleDate);

      // 1. Propagate satellite position at this time step
      const satPos = propagateSatPosition(satellite.satrec, sampleDate);
      if (!satPos) continue;

      // 2. Elevation of the satellite above the user at this time step
      const mockSat = { ...satellite, position: satPos } as SatelliteData;
      const elevation = calculateElevationAngle(userPosition, mockSat);

      // 3. GSO state at this time
      const gsoState = calculateGSOAvoidanceAngle(satellite.satrec, julianDate);
      const activeBeamCount = gsoState.isBlankingZone ? 0 : (gsoState.isGSOAvoidance ? 8 : 16);

      // 4. Beam index covering user (using real Cesium polygon geometry)
      let beamIndex: number | null = null;
      if (elevation > 0 && activeBeamCount > 0) {
        try {
          beamIndex = findConnectedBeamIndex(
            userPosition,
            satellite,
            julianDate,
            simulationState
          );
        } catch {
          beamIndex = null;
        }
      }

      // 5. SNP backhaul availability at this time
      let snpAvailable = false;
      let nearestSnpName: string | null = null;
      let snpElevation = 0;
      if (activeBeamCount > 0 && !gsoState.isBlankingZone) {
        let minDist = Infinity;
        for (const snp of SNPS_DATA) {
          if (failedSnps.has(snp.name)) continue;
          const dist = haversineDistanceKm(satPos, { lat: snp.lat, lng: snp.lng });
          if (dist <= BACKHAUL_RADIUS_KM && dist < minDist) {
            minDist = dist;
            snpAvailable = true;
            nearestSnpName = snp.name;
            // Elevation of the satellite as seen from this SNP (same geometry as user elevation)
            snpElevation = calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, mockSat);
          }
        }
      }

      // 6. Throughput estimate (only when in a beam AND SNP available)
      let throughputMbps = 0;
      if (beamIndex !== null && snpAvailable) {
        const hf = beamHealthFactors.find(b => b.beamIndex === beamIndex!)?.healthFactor ?? 1.0;
        const perf = getBeamPerformance({
          beamIndex: beamIndex!,
          activeBeamCount,
          healthFactor: hf,
          weather: weatherCondition,
          normalizedDistance: 0.3, // moderate position within beam
        });
        // Apply the same backhaul quality factor as Estimated Performance:
        // limiting link is the weaker of user↔sat and snp↔sat elevation.
        const limitingElev = Math.min(elevation, snpElevation);
        const backhaulFactor = limitingElev < 15 ? 0
          : limitingElev >= 50 ? 1
          : (limitingElev - 15) / (50 - 15);
        // Cap by terminal profile max to stay consistent with Estimated Performance
        throughputMbps = Math.min(perf.deliveredThroughputMbps * backhaulFactor, maxDlMbps);
      }

      points.push({
        offsetMin: offsetSec / 60,
        elevation,
        beamIndex,
        throughputMbps,
        snpAvailable,
        nearestSnpName,
        activeBeamCount,
        satLatDeg: satPos.lat,
      });
    }

    return points;
  }, [satellite, userPosition, failedSnps, hsBeams, weatherCondition, beamHealthFactors, maxDlMbps, coveragePolicy]);

  // Summary stats
  const inPassPoints    = timeline.filter(p => p.elevation > 0);
  const connectedPoints = timeline.filter(p => p.beamIndex !== null && p.snpAvailable);
  const passStart       = inPassPoints[0];
  const passEnd         = inPassPoints[inPassPoints.length - 1];
  const maxElev         = inPassPoints.length > 0 ? Math.max(...inPassPoints.map(p => p.elevation)) : 0;
  const avgThroughput   = connectedPoints.length > 0
    ? connectedPoints.reduce((s, p) => s + p.throughputMbps, 0) / connectedPoints.length
    : 0;

  // Unique beam transitions
  const beamTransitions: Array<{ from: number | null; to: number | null; at: number }> = [];
  let prevBeam: number | null | undefined = undefined;
  for (const p of timeline) {
    if (prevBeam !== undefined && p.beamIndex !== prevBeam) {
      beamTransitions.push({ from: prevBeam, to: p.beamIndex, at: p.offsetMin });
    }
    prevBeam = p.beamIndex;
  }
  const handoverCount = beamTransitions.filter(t => t.from !== null && t.to !== null).length;

  const summaryText = inPassPoints.length === 0
    ? 'No pass in ±10 min window'
    : `Max elev: ${maxElev.toFixed(1)}° · ${handoverCount} beam handover${handoverCount !== 1 ? 's' : ''} · avg ${avgThroughput.toFixed(0)} Mbps`;

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg border border-gray-100 dark:border-slate-700">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0">
          <h4 className="text-sm font-semibold flex items-center" style={{ color: '#db2777' }}>Pass Beam Timeline<SectionTooltip content="A ±10-minute window around the satellite overpass showing beam handovers every 30 seconds. Each row shows which of the 16 beams covers the user, satellite elevation, SNP reachability, and estimated throughput — helping identify whether a connection drops between beam transitions." /></h4>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{summaryText}</p>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="border-t border-gray-200 dark:border-slate-700 px-4 py-4 space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-[11px] text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-green-500" />
              <span>In beam + SNP</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-amber-400" />
              <span>In beam, no SNP</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-gray-300 dark:bg-gray-600" />
              <span>No beam / below horizon</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm bg-red-400" />
              <span>Beam HS / blanking zone</span>
            </div>
          </div>

          {/* Timeline grid */}
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* Time axis labels */}
              <div className="flex items-center mb-1">
                <div className="w-16 shrink-0" />
                <div className="flex gap-0.5 text-[10px] text-gray-400">
                  {timeline.filter((_, i) => i % 4 === 0).map(p => (
                    <div key={p.offsetMin} className="w-6 text-center">
                      {p.offsetMin >= 0 ? `+${p.offsetMin.toFixed(0)}` : p.offsetMin.toFixed(0)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Row: Beam index */}
              <div className="flex items-center gap-1 mb-1">
                <div className="w-16 shrink-0 text-[10px] text-gray-500 dark:text-gray-400 text-right pr-2">Beam #</div>
                <div className="flex gap-0.5">
                  {timeline.map((p, i) => {
                    const isNow = Math.abs(p.offsetMin) < STEP_SECONDS / 120;
                    let bgColor = '#e5e7eb'; // gray - no beam
                    let label = '–';

                    if (p.elevation <= 0) {
                      bgColor = '#1f2937'; // below horizon
                      label = '▽';
                    } else if (p.activeBeamCount === 0) {
                      bgColor = '#ef4444'; // blanking zone
                      label = '✕';
                    } else if (p.beamIndex !== null) {
                      const cesColor = getBeamBaseColor(p.beamIndex);
                      bgColor = p.snpAvailable
                        ? cesiumColorToCss(cesColor)
                        : '#fbbf24';
                      label = String(p.beamIndex);
                    }

                    return (
                      <div
                        key={i}
                        title={`t${p.offsetMin >= 0 ? '+' : ''}${p.offsetMin.toFixed(1)}m | Beam ${p.beamIndex ?? '–'} | Elev ${p.elevation.toFixed(1)}° | ${p.throughputMbps.toFixed(0)} Mbps | SNP: ${p.nearestSnpName ?? 'none'} | Sat lat ${p.satLatDeg.toFixed(1)}°`}
                        className={`flex items-center justify-center rounded-sm text-[9px] font-bold text-white transition-all cursor-help
                          ${isNow ? 'ring-2 ring-white ring-offset-1' : ''}`}
                        style={{ width: 22, height: 22, backgroundColor: bgColor, flexShrink: 0 }}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Row: Elevation bar */}
              <div className="flex items-center gap-1 mb-1">
                <div className="w-16 shrink-0 text-[10px] text-gray-500 dark:text-gray-400 text-right pr-2">Elev</div>
                <div className="flex gap-0.5 items-end" style={{ height: 28 }}>
                  {timeline.map((p, i) => {
                    const h = Math.max(0, Math.min(1, p.elevation / 90));
                    const barH = Math.round(h * 24);
                    const barColor = p.elevation > 40 ? '#22c55e' : p.elevation > 15 ? '#f59e0b' : p.elevation > 0 ? '#ef4444' : '#374151';
                    return (
                      <div
                        key={i}
                        title={`${p.elevation.toFixed(1)}°`}
                        className="rounded-sm cursor-help"
                        style={{ width: 22, height: barH || 2, backgroundColor: barColor, flexShrink: 0, alignSelf: 'flex-end' }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Row: Throughput bar */}
              <div className="flex items-center gap-1 mb-1">
                <div className="w-16 shrink-0 text-[10px] text-gray-500 dark:text-gray-400 text-right pr-2">Mbps</div>
                <div className="flex gap-0.5 items-end" style={{ height: 28 }}>
                  {timeline.map((p, i) => {
                    const maxMbps = 200;
                    const h = Math.max(0, Math.min(1, p.throughputMbps / maxMbps));
                    const barH = Math.round(h * 24);
                    return (
                      <div
                        key={i}
                        title={`${p.throughputMbps.toFixed(0)} Mbps`}
                        className="rounded-sm cursor-help bg-pink-500"
                        style={{ width: 22, height: barH || 0, flexShrink: 0, alignSelf: 'flex-end' }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Row: SNP availability dots */}
              <div className="flex items-center gap-1">
                <div className="w-16 shrink-0 text-[10px] text-gray-500 dark:text-gray-400 text-right pr-2">SNP</div>
                <div className="flex gap-0.5">
                  {timeline.map((p, i) => (
                    <div
                      key={i}
                      title={p.snpAvailable ? `SNP: ${p.nearestSnpName}` : 'No SNP in range'}
                      className="rounded-full cursor-help"
                      style={{
                        width: 22,
                        height: 22,
                        backgroundColor: p.elevation <= 0 ? '#1f2937' : p.snpAvailable ? '#22c55e' : '#ef4444',
                        flexShrink: 0,
                        opacity: p.elevation <= 0 ? 0.3 : 1,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Time axis minutes labels every 4 steps */}
              <div className="flex items-center mt-1">
                <div className="w-16 shrink-0 text-[10px] text-gray-400 text-right pr-2">min</div>
                <div className="flex gap-0.5 text-[9px] text-gray-400">
                  {timeline.map((p, i) => (
                    <div
                      key={i}
                      className="text-center"
                      style={{ width: 22, flexShrink: 0 }}
                    >
                      {i % 4 === 0
                        ? (p.offsetMin >= 0 ? `+${p.offsetMin.toFixed(0)}` : p.offsetMin.toFixed(0))
                        : ''
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Pass summary stats */}
          {inPassPoints.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-slate-900 rounded p-2 border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 dark:text-gray-400">Pass window</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">
                  {passStart?.offsetMin.toFixed(1)}m → {passEnd?.offsetMin.toFixed(1)}m
                  <span className="ml-1 text-gray-400">({((passEnd?.offsetMin ?? 0) - (passStart?.offsetMin ?? 0)).toFixed(1)} min)</span>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded p-2 border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 dark:text-gray-400">Max elevation</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">{maxElev.toFixed(1)}°</div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded p-2 border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 dark:text-gray-400">Beam handovers</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">{handoverCount}</div>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded p-2 border border-gray-100 dark:border-slate-700">
                <div className="text-gray-500 dark:text-gray-400">Avg throughput</div>
                <div className="font-semibold text-gray-800 dark:text-gray-100">
                  {avgThroughput > 0 ? `${avgThroughput.toFixed(0)} Mbps` : '–'}
                </div>
              </div>
            </div>
          )}

          {/* Beam handover list */}
          {beamTransitions.filter(t => t.from !== null && t.to !== null).length > 0 && (
            <div className="text-xs">
              <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Beam handovers (overlap-based, seamless)</div>
              <div className="space-y-0.5">
                {beamTransitions
                  .filter(t => t.from !== null && t.to !== null)
                  .map((t, i) => (
                    <div key={i} className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <span
                        className="w-5 h-3 rounded-sm"
                        style={{ backgroundColor: cesiumColorToCss(getBeamBaseColor(t.from!)), flexShrink: 0 }}
                      />
                      <span>Beam {t.from} → Beam {t.to}</span>
                      <span className="ml-auto text-gray-400">
                        at t{t.at >= 0 ? '+' : ''}{t.at.toFixed(1)} min
                      </span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {inPassPoints.length === 0 && (
            <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-4">
              Satellite is not above the horizon in the ±{WINDOW_MINUTES}-minute window.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PassBeamTimeline;
