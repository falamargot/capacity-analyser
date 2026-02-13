/**
 * Satellite resolution utilities - business logic for auto-selecting satellites
 */
import type { SatelliteData } from '../types/satellites';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SNPData } from '../components/globe/GlobeConfig';
import { SNPS_DATA } from '../components/globe/GlobeConfig';
import { calculateElevationAngle } from './capacityCalculator';
import { isPointInGEOCoverage } from './geoUtils';
import { STANDARD_ELEVATION_DEG } from './leoFootprint';
import { getConnectivityStatus, hasRFConnectivity } from './rfConnectivity';

export interface SatelliteResolutionResult {
    autoSelectedLEOSat: SatelliteData | null;
    autoSelectedGEOSat: SatelliteData | null;
    selectedSNP: SNPData | null;
}

/**
 * Resolve auto-selected satellites based on business rules
 * Pure function - no side effects
 */
export const resolveAutoSelectedSatellites = (
    userLocation: { lat: number; lng: number },
    satellites: SatelliteData[],
    satelliteScope: SatelliteScope,
    time?: any // JulianDate from Cesium
): SatelliteResolutionResult => {
    let autoSelectedGEOSat: SatelliteData | null = null;
    let autoSelectedLEOSat: SatelliteData | null = null;
    let selectedSNP: SNPData | null = null;

    // GEO satellite selection logic - only run when GEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'GEO') {
        const geoSatellites = satellites.filter(sat => sat.orbitType === 'GEO');

        // Find all GEO satellites that cover the location
        const coveredGEO = geoSatellites.filter(sat =>
            isPointInGEOCoverage(userLocation, sat)
        );

        // Select GEO satellite based on business rules
        if (coveredGEO.length === 1) {
            // If exactly one GEO satellite covers the location → select it
            autoSelectedGEOSat = coveredGEO[0];
        } else if (coveredGEO.length > 1) {
            // If multiple GEO satellites cover the location → select one with highest elevation angle
            const satellitesWithElevation = coveredGEO.map(sat => ({
                satellite: sat,
                elevation: calculateElevationAngle(userLocation, sat)
            }));

            // Sort by highest elevation angle
            satellitesWithElevation.sort((a, b) => b.elevation - a.elevation);
            autoSelectedGEOSat = satellitesWithElevation[0].satellite;
        }
    }

    // LEO satellite selection logic - only run when LEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'LEO') {
        const leoSatellites = satellites.filter(sat => sat.orbitType === 'LEO');

        // Apply RF connectivity requirement - satellite must have active beam covering user
        const eligibleLEO = leoSatellites.filter(sat => {
            if (!time) return false; // Need time for RF connectivity check
            
            // Rule 1: RF connectivity (user must be inside active beam)
            if (!hasRFConnectivity(userLocation, sat, time)) {
                return false;
            }

            // Rule 2: Satellite sees at least one SNP (gateway) simultaneously with SNP elevation ≥ 15°
            let hasVisibleSNP = false;
            for (const snp of SNPS_DATA) {
                const snpElevation = calculateElevationAngle(
                    { lat: snp.lat, lng: snp.lng }, sat
                );
                if (snpElevation >= 15) {
                    hasVisibleSNP = true;
                    break;
                }
            }
            if (!hasVisibleSNP) return false;

            return true;
        });

        // Score eligible LEO satellites
        const scoredLEO = eligibleLEO.map(sat => {
            const elevation = calculateElevationAngle(userLocation, sat);

            // Get RF connectivity status for service quality scoring
            const connectivityStatus = time ? getConnectivityStatus(userLocation, sat, time) : null;

            // Scoring criteria (normalized, deterministic)
            const elevationScore = elevation / 90;
            const persistenceScore = 0.5; // Neutral value

            // Count visible SNPs
            let visibleSNPCount = 0;
            let bestSNP: SNPData | null = null;
            let bestSNPElevation = -1;

            for (const snp of SNPS_DATA) {
                const snpElevation = calculateElevationAngle(
                    { lat: snp.lat, lng: snp.lng }, sat
                );
                if (snpElevation >= 15) {
                    visibleSNPCount++;
                    if (snpElevation > bestSNPElevation) {
                        bestSNPElevation = snpElevation;
                        bestSNP = snp;
                    }
                }
            }
            const snpScore = visibleSNPCount >= 2 ? 1.0 : 0.8;
            
            // Service quality score based on active beam count
            let serviceQualityScore = 1.0;
            if (connectivityStatus && connectivityStatus.hasRFConnectivity) {
                const beamRatio = connectivityStatus.activeBeamCount / 16; // Full capacity = 16 beams
                serviceQualityScore = 0.7 + (0.3 * beamRatio); // Range: 0.7-1.0
            }
            
            const loadScore = 0.5;

            // Global score with service quality weighting
            const totalScore =
                0.35 * elevationScore +           // Reduced from 0.45
                0.20 * persistenceScore +          // Reduced from 0.25  
                0.15 * snpScore +               // Reduced from 0.20
                0.20 * serviceQualityScore +        // NEW: Service quality component
                0.10 * loadScore;

            return {
                satellite: sat,
                elevation,
                totalScore,
                bestSNP
            };
        });

        // Select LEO satellite with highest score
        if (scoredLEO.length > 0) {
            scoredLEO.sort((a, b) => b.totalScore - a.totalScore);
            autoSelectedLEOSat = scoredLEO[0].satellite;
            selectedSNP = scoredLEO[0].bestSNP;
        } else {
            // Fallback: Check if there are LEO satellites with RF connectivity but without SNP connectivity
            const rfConnectedLEO = leoSatellites.filter(sat => {
                if (!time) return false; // Need time for RF connectivity check
                
                // Rule 1: RF connectivity (user must be inside active beam)
                if (!hasRFConnectivity(userLocation, sat, time)) {
                    return false;
                }

                return true;
            });

            if (rfConnectedLEO.length > 0) {
                // Select best RF-connected LEO satellite based on elevation only (no SNP available)
                const satellitesWithElevation = rfConnectedLEO.map(sat => ({
                    satellite: sat,
                    elevation: calculateElevationAngle(userLocation, sat)
                }));

                satellitesWithElevation.sort((a, b) => b.elevation - a.elevation);
                autoSelectedLEOSat = satellitesWithElevation[0].satellite;
                // No SNP selected - this indicates LEO-only connectivity without ground station
                selectedSNP = null;
            }
        }
    }

    return {
        autoSelectedLEOSat,
        autoSelectedGEOSat,
        selectedSNP
    };
};

/**
 * Find the best GEO beam for a given position
 */
export const findBestGEOBeam = (
    position: { lat: number; lng: number },
    satellite: SatelliteData
): any | null => {
    if (!satellite.coverages || satellite.coverages.length === 0) {
        return null;
    }

    let bestBeam: any = null;
    let bestElevation = -1;

    for (const coverage of satellite.coverages) {
        if (coverage.feature?.geometry?.type === 'Polygon') {
            const ring = coverage.feature.geometry.coordinates[0] as unknown as number[][];
            // Simple point-in-polygon check
            const { isPointInPolygon } = require('./geoUtils');
            if (isPointInPolygon(position, ring)) {
                const elevation = calculateElevationAngle(position, satellite);
                if (elevation > bestElevation) {
                    bestElevation = elevation;
                    bestBeam = coverage;
                }
            }
        }
    }

    // If no beam contains the point, use the first beam as fallback
    if (!bestBeam && satellite.coverages.length > 0) {
        bestBeam = satellite.coverages[0];
    }

    return bestBeam;
};
