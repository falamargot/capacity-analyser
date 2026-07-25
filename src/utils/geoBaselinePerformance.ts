/**
 * Coverage/elevation-derived GEO performance baseline.
 *
 * This is the estimate that exists BEFORE a dual-segment route resolves — it reads
 * beam throughput estimates and the LEO-derived terminal profiles, which is a
 * different model from the RF→network→modem delivery chain. It lives in its own
 * module so `geoDeliveryChain` stays exactly one layer: what happens to a resolved
 * route, and nothing else.
 */

import type { CandidateCoverage } from '../types/analysis';
import {
  TERMINAL_PROFILES,
  WEATHER_PROFILES,
  getWeatherFactor,
  type TerminalType,
  type WeatherType,
} from '../components/capacity/terminalAssumptions';
import { geoStabilityFromMarginDb } from './geoDeliveryChain';
import type { GeoPerformanceEstimate } from '../types/geoPerformance';

export function getGeoCompanionCoverage(
  selectedCoverage: CandidateCoverage | null,
  candidateCoverages: CandidateCoverage[],
  wantUplink: boolean,
): CandidateCoverage | null {
  if (candidateCoverages.length === 0) return null;

  if (selectedCoverage?.isUplink === wantUplink) {
    return selectedCoverage;
  }

  const sameSatellite = candidateCoverages.filter((candidate) => (
    candidate.isUplink === wantUplink &&
    (!selectedCoverage || candidate.satelliteId === selectedCoverage.satelliteId)
  ));

  const sameBand = sameSatellite.filter((candidate) => (
    !selectedCoverage?.band || !candidate.band || candidate.band === selectedCoverage.band
  ));

  if (selectedCoverage?.band) {
    return sameBand[0] ?? null;
  }

  return sameBand[0]
    ?? sameSatellite[0]
    ?? candidateCoverages.find((candidate) => candidate.isUplink === wantUplink)
    ?? null;
}

/**
 * Coverage/elevation-derived baseline, before any dual-segment or modem result exists.
 * `performanceFactor` on this path is the legacy coverage-vs-terminal-profile ratio.
 */
export function calculateGeoBaselinePerformance({
  elevationDeg,
  geoTerminalType,
  selectedCoverage,
  candidateCoverages,
  weatherType,
}: {
  elevationDeg: number;
  geoTerminalType: TerminalType;
  selectedCoverage: CandidateCoverage | null;
  candidateCoverages: CandidateCoverage[];
  weatherType: WeatherType;
}): GeoPerformanceEstimate {
  const profile = TERMINAL_PROFILES[geoTerminalType];
  const downlinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, false);
  const uplinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, true);

  if (elevationDeg < 5) {
    return {
      downlinkGbps: 0,
      uplinkGbps: 0,
      stability: 'Unstable',
      performanceFactor: 0,
      weatherFactor: 1,
      weatherLabel: 'Selected link budget',
    };
  }

  if (downlinkCoverage || uplinkCoverage) {
    const downlinkGbps = downlinkCoverage
      ? Math.min(downlinkCoverage.throughputEstimate / 1000, profile.maxDlGbps)
      : 0;
    const uplinkGbps = uplinkCoverage
      ? Math.min(uplinkCoverage.throughputEstimate / 1000, profile.maxUlGbps)
      : 0;
    const downlinkRatio = profile.maxDlGbps > 0 ? Math.min(downlinkGbps / profile.maxDlGbps, 1) : 0;
    const uplinkRatio = profile.maxUlGbps > 0 ? Math.min(uplinkGbps / profile.maxUlGbps, 1) : 0;
    const weakestMarginDb = [downlinkCoverage?.linkMarginDb, uplinkCoverage?.linkMarginDb]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .reduce<number | null>((current, value) => current == null ? value : Math.min(current, value), null);

    return {
      downlinkGbps,
      uplinkGbps,
      stability: weakestMarginDb == null ? 'Low' : geoStabilityFromMarginDb(weakestMarginDb),
      performanceFactor: Math.max(downlinkRatio, uplinkRatio),
      weatherFactor: 1,
      weatherLabel: 'Selected link budget',
    };
  }

  const weatherFactor = getWeatherFactor(weatherType, geoTerminalType === 'aviation');
  const elevationFactor = elevationDeg >= 50 ? 1 : (elevationDeg - 5) / (50 - 5);
  const performanceFactor = Math.max(0.15, elevationFactor) * weatherFactor;

  return {
    downlinkGbps: profile.maxDlGbps * performanceFactor,
    uplinkGbps: profile.maxUlGbps * performanceFactor,
    stability:
      elevationDeg >= 40 ? 'High'
        : elevationDeg >= 25 ? 'Medium'
          : elevationDeg >= 5 ? 'Low'
            : 'Unstable',
    performanceFactor,
    weatherFactor,
    weatherLabel: WEATHER_PROFILES[weatherType].label,
  };
}
