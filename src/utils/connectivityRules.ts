import { SatelliteData } from '../types/satellites';
import { SNPData, SNPS_DATA } from '../components/globe/GlobeConfig';
import { calculateElevationAngle, compute3DDistanceKm, SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { MIN_SNP_GATEWAY_ELEVATION_DEG } from './leoFootprint';
import type { LeoFeederLink } from '../data/leoGroundSegment';

/**
 * Materialize the SNP↔satellite Ka feeder relationship (LeoFeederLink, L-O1)
 * from a gateway choice: true 3-D slant range + one-way propagation latency.
 * Single owner of this construction — the resolver and the inspection surfaces
 * all obtain feeder geometry through here.
 */
export function buildLeoFeederLink(
  snp: SNPData,
  satellite: SatelliteData,
  elevationDeg: number,
): LeoFeederLink {
  const slantRangeKm = compute3DDistanceKm(
    { lat: snp.lat, lng: snp.lng },
    { lat: satellite.position.lat, lng: satellite.position.lng, alt: satellite.position.alt },
  );
  return {
    snp,
    satelliteId: satellite.id,
    elevationDeg,
    slantRangeKm,
    oneWayLatencyMs: (slantRangeKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000,
    band: 'Ka',
  };
}

/**
 * THE canonical SNP selector (LEO audit L-Mo5): highest feeder elevation among
 * non-failed SNPs at or above the 15° mask, gated by GSO blanking. Used by
 * satellite auto-resolution, the satellite inspection card and rendering so
 * every surface names the same gateway for a given satellite.
 *
 * Returns the full feeder relationship (LeoFeederLink, L-O1).
 *
 * (The former nearest-surface-distance selector in coverageService gave the
 * inspection card a different answer than the route used — removed.)
 */
export function selectSnpForSatellite(
  satellite: SatelliteData,
  failedSnps: ReadonlySet<string> = new Set(),
): LeoFeederLink | null {
  if (satellite.type !== 'ONEWEB') return null;

  const best = getBestConnectedGateway(satellite, MIN_SNP_GATEWAY_ELEVATION_DEG, failedSnps);
  if (!best) return null;

  return buildLeoFeederLink(best.snp, satellite, best.elevation);
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
