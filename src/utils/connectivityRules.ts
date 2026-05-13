import { SatelliteData } from '../types/satellites';
import { SNPData, SNPS_DATA } from '../components/globe/GlobeConfig';
import { calculateElevationAngle } from './capacityCalculator';
import { MIN_SNP_GATEWAY_ELEVATION_DEG } from './leoFootprint';

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
