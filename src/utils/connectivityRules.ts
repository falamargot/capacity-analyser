import { JulianDate } from 'cesium';
import { SatelliteData } from '../types/satellites';
import { SNPData, SNPS_DATA } from '../components/globe/GlobeConfig';
import { calculateElevationAngle, compute3DDistanceKm, SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { MIN_SNP_GATEWAY_ELEVATION_DEG } from './leoFootprint';
import { calculateGSOAvoidanceAngle } from './oneWebComb';

/**
 * Checks if a satellite has a valid connection to at least one Gateway (SNP).
 * A valid connection requires Line-of-Sight with an elevation angle >= minElevation.
 * 
 * @param satellite The satellite to check
 * @param minElevation Minimum elevation angle in degrees (default: 15)
 * @returns true if connected to at least one gateway, false otherwise
 */
export function isSatelliteConnectedToGateway(
    satellite: SatelliteData,
    minElevation: number = MIN_SNP_GATEWAY_ELEVATION_DEG,
    failedSnps: ReadonlySet<string> = new Set()
): boolean {
    for (const snp of SNPS_DATA) {
        if (failedSnps.has(snp.name)) continue;

        const snpElevation = calculateElevationAngle(
            { lat: snp.lat, lng: snp.lng },
            satellite
        );

        if (snpElevation >= minElevation) {
            return true;
        }
    }
    return false;
}

export interface SelectedSnpForSatellite {
  snp: SNPData;
  /** Feeder elevation of the satellite as seen from the SNP (degrees). */
  elevation: number;
  /** 3-D line-of-sight distance SNP ↔ satellite (km). */
  distanceKm: number;
  /** One-way feeder propagation latency (ms). */
  oneWayLatencyMs: number;
}

/**
 * THE canonical SNP selector (LEO audit L-Mo5): highest feeder elevation among
 * non-failed SNPs at or above the 15° mask, gated by GSO blanking. Used by
 * satellite auto-resolution, the satellite inspection card and rendering so
 * every surface names the same gateway for a given satellite.
 *
 * (The former nearest-surface-distance selector in coverageService gave the
 * inspection card a different answer than the route used — removed.)
 */
export function selectSnpForSatellite(
  satellite: SatelliteData,
  failedSnps: ReadonlySet<string> = new Set(),
  /** Evaluation time for the GSO gate — pass the render/simulation snapshot when available. */
  now: Date = new Date(),
): SelectedSnpForSatellite | null {
  if (satellite.type !== 'ONEWEB') return null;

  // A blanked satellite (GSO exclusion zone) serves no feeder link.
  if (satellite.satrec) {
    try {
      const { isBlankingZone } = calculateGSOAvoidanceAngle(satellite.satrec, JulianDate.fromDate(now));
      if (isBlankingZone) return null;
    } catch (error) {
      console.warn('Error checking GSO exclusion zone:', error);
      // Continue with normal processing if the GSO check fails.
    }
  }

  const best = getBestConnectedGateway(satellite, MIN_SNP_GATEWAY_ELEVATION_DEG, failedSnps);
  if (!best) return null;

  const distanceKm = compute3DDistanceKm(
    { lat: best.snp.lat, lng: best.snp.lng },
    { lat: satellite.position.lat, lng: satellite.position.lng, alt: satellite.position.alt },
  );

  return {
    snp: best.snp,
    elevation: best.elevation,
    distanceKm,
    oneWayLatencyMs: (distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000,
  };
}

/**
 * Returns the best connected gateway for a satellite, or null if none connected.
 */
export function getBestConnectedGateway(
    satellite: SatelliteData,
    minElevation: number = MIN_SNP_GATEWAY_ELEVATION_DEG,
    failedSnps: ReadonlySet<string> = new Set()
): { snp: SNPData, elevation: number } | null {
    let bestSNP = null;
    let bestElevation = -1;

    for (const snp of SNPS_DATA) {
        if (failedSnps.has(snp.name)) continue;

        const snpElevation = calculateElevationAngle(
            { lat: snp.lat, lng: snp.lng },
            satellite
        );

        if (snpElevation >= minElevation) {
            if (snpElevation > bestElevation) {
                bestElevation = snpElevation;
                bestSNP = snp;
            }
        }
    }

    if (bestSNP) {
        return { snp: bestSNP, elevation: bestElevation };
    }

    return null;
}
