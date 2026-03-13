/**
 * Satellite resolution utilities - business logic for auto-selecting satellites
 */
import type { SatelliteData } from '../types/satellites';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SNPData } from '../components/globe/GlobeConfig';
import { SNPS_DATA } from '../components/globe/GlobeConfig';
import { calculateElevationAngle } from './capacityCalculator';
import {
    findCandidateCoverages,
    rankCandidateCoverages,
    resolveCandidateCoverage,
} from './geoCoverageSelection';

import { getConnectivityStatus, hasRFConnectivity } from './rfConnectivity';
import { type CoveragePolicy } from './leoFootprint';

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
    time?: any, // JulianDate from Cesium
    policy: CoveragePolicy = { type: "DB_THRESHOLD", thresholdDb: -10 },
    failedSnps: ReadonlySet<string> = new Set()
): SatelliteResolutionResult => {
    let autoSelectedGEOSat: SatelliteData | null = null;
    let autoSelectedLEOSat: SatelliteData | null = null;
    let selectedSNP: SNPData | null = null;

    // GEO satellite selection logic - only run when GEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'GEO') {
        const geoSatellites = satellites.filter(sat => sat.orbitType === 'GEO' && sat.opsStatus === 'operational');
        const rankedCandidates = rankCandidateCoverages(
            findCandidateCoverages(userLocation, geoSatellites)
        );
        autoSelectedGEOSat = rankedCandidates.length > 0
            ? geoSatellites.find((sat) => sat.id === rankedCandidates[0].satelliteId) ?? null
            : null;
    }

    // LEO satellite selection logic - only run when LEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'LEO') {
        const leoSatellites = satellites.filter(sat => sat.orbitType === 'LEO' && sat.opsStatus === 'operational');

        // Apply RF connectivity requirement - satellite must have active beam covering user
        const eligibleLEO = leoSatellites.filter(sat => {
            if (!time) return false; // Need time for RF connectivity check

            // Rule 1: RF connectivity (user must be inside active beam)
            if (!hasRFConnectivity(userLocation, sat, time, policy)) {
                return false;
            }

            // Rule 2: Satellite sees at least one active SNP (gateway) simultaneously with SNP elevation ≥ 15°
            let hasVisibleSNP = false;
            for (const snp of SNPS_DATA) {
                if (failedSnps.has(snp.name)) continue;
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
                if (failedSnps.has(snp.name)) continue;
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
                if (!hasRFConnectivity(userLocation, sat, time, policy)) {
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

    const rankedCandidates = rankCandidateCoverages(
        findCandidateCoverages(position, [satellite])
    );
    const resolved = resolveCandidateCoverage(rankedCandidates[0] ?? null, [satellite]);

    if (resolved?.beam) {
        return resolved.beam;
    }

    return satellite.coverages[0] ?? null;
};
