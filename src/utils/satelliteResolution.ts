/**
 * Satellite resolution utilities - business logic for auto-selecting satellites
 */
import { JulianDate } from 'cesium';
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
import { estimateCurrentLeoBeamLink, findConnectedBeamIndex, hasRFConnectivity } from './rfConnectivity';
import type { SimulationStateSnapshot } from '../types/simulation';
import {
    degreesLat,
    degreesLong,
    eciToGeodetic,
    gstime,
    propagate,
} from 'satellite.js';

export interface SatelliteResolutionResult {
    autoSelectedLEOSat: SatelliteData | null;
    autoSelectedGEOSat: SatelliteData | null;
    selectedSNP: SNPData | null;
}

interface GatewayAssessment {
    bestSNP: SNPData | null;
    bestElevation: number;
    marginScore: number;
}

interface EligibleLeoCandidate {
    satellite: SatelliteData;
    gateway: GatewayAssessment;
    connectedBeamIndex: number | null;
}

interface ScoredLeoCandidate extends EligibleLeoCandidate {
    totalScore: number;
    throughputScore: number;
    rvtScore: number;
    hysteresisScore: number;
}

const RVT_HORIZON_S = 900;
const RVT_STEP_S = 15;
const RVT_MIN_ELEVATION_DEG = 15;
const MAX_RVT_S = 720;

const W_THROUGHPUT = 0.45;
const W_RVT = 0.30;
const W_HYSTERESIS = 0.15;
const W_GATEWAY = 0.10;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

function toDate(value: Date | JulianDate): Date {
    return value instanceof Date ? value : JulianDate.toDate(value);
}

function assessGatewayLinks(
    sat: SatelliteData,
    failedSnps: ReadonlySet<string>
): GatewayAssessment {
    let bestSNP: SNPData | null = null;
    let bestElevation = -1;

    for (const snp of SNPS_DATA) {
        if (failedSnps.has(snp.name)) continue;

        const elevation = calculateElevationAngle({ lat: snp.lat, lng: snp.lng }, sat);
        if (elevation < 15) continue;

        if (elevation > bestElevation) {
            bestElevation = elevation;
            bestSNP = snp;
        }
    }

    return {
        bestSNP,
        bestElevation,
        // Match the backhaul-factor curve used by the beam estimator:
        // 15 deg = just reachable, 50 deg = excellent gateway margin.
        marginScore: bestElevation >= 15
            ? clamp01((bestElevation - 15) / (50 - 15))
            : 0,
    };
}

function computeElevationFromCoords(
    observerLatDeg: number,
    observerLngDeg: number,
    satLatDeg: number,
    satLngDeg: number,
    satAltKm: number
): number {
    const toRad = Math.PI / 180;
    const observerLat = observerLatDeg * toRad;
    const observerLng = observerLngDeg * toRad;
    const satLat = satLatDeg * toRad;
    const satLng = satLngDeg * toRad;

    const deltaLng = satLng - observerLng;
    const cosGamma =
        Math.sin(observerLat) * Math.sin(satLat) +
        Math.cos(observerLat) * Math.cos(satLat) * Math.cos(deltaLng);
    const gamma = Math.acos(Math.max(-1, Math.min(1, cosGamma)));

    if (gamma < 1e-10) return 90;

    const earthRadiusKm = 6371;
    const satRadiusKm = earthRadiusKm + satAltKm;
    const tanElevation = (Math.cos(gamma) - earthRadiusKm / satRadiusKm) / Math.sin(gamma);

    return Math.atan(tanElevation) / toRad;
}

function computeRemainingVisibleTime(
    userLocation: { lat: number; lng: number },
    sat: SatelliteData,
    currentTime: Date
): number {
    if (!sat.satrec) return 0;

    for (let dt = RVT_STEP_S; dt <= RVT_HORIZON_S; dt += RVT_STEP_S) {
        const futureDate = new Date(currentTime.getTime() + (dt * 1000));
        const positionAndVelocity = propagate(sat.satrec, futureDate);

        if (!positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean') {
            return dt - RVT_STEP_S;
        }

        const gmst = gstime(futureDate);
        const geodetic = eciToGeodetic(positionAndVelocity.position, gmst);
        const futureElevation = computeElevationFromCoords(
            userLocation.lat,
            userLocation.lng,
            degreesLat(geodetic.latitude),
            degreesLong(geodetic.longitude),
            geodetic.height,
        );

        if (futureElevation < RVT_MIN_ELEVATION_DEG) {
            return dt - RVT_STEP_S;
        }
    }

    return RVT_HORIZON_S;
}

function getFallbackThroughputScore(
    userLocation: { lat: number; lng: number },
    sat: SatelliteData,
    gateway: GatewayAssessment
): number {
    const userElevation = calculateElevationAngle(userLocation, sat);
    const limitingElevation = gateway.bestElevation >= 15
        ? Math.min(userElevation, gateway.bestElevation)
        : userElevation;

    return clamp01(limitingElevation / 90);
}

/**
 * Resolve auto-selected satellites based on business rules
 * Pure function - no side effects
 */
export const resolveAutoSelectedSatellites = (
    userLocation: { lat: number; lng: number },
    satellites: SatelliteData[],
    satelliteScope: SatelliteScope,
    simulationState: SimulationStateSnapshot,
    time?: any, // JulianDate from Cesium
    failedSnps: ReadonlySet<string> = new Set(),
    previousLEOSatId: string | null = null,
    geoTerminalRFClassId: string | null = null
): SatelliteResolutionResult => {
    let autoSelectedGEOSat: SatelliteData | null = null;
    let autoSelectedLEOSat: SatelliteData | null = null;
    let selectedSNP: SNPData | null = null;

    // GEO satellite selection logic - only run when GEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'GEO') {
        const geoSatellites = satellites.filter(sat => sat.orbitType === 'GEO' && sat.opsStatus === 'operational');
        const rankedCandidates = rankCandidateCoverages(
            findCandidateCoverages(userLocation, geoSatellites, { terminalRFClassId: geoTerminalRFClassId }),
            geoSatellites,
            userLocation
        );
        autoSelectedGEOSat = rankedCandidates.length > 0
            ? geoSatellites.find((sat) => sat.id === rankedCandidates[0].satelliteId) ?? null
            : null;
    }

    // LEO satellite selection logic - only run when LEO is allowed
    if (satelliteScope === 'ALL' || satelliteScope === 'LEO') {
        const leoSatellites = satellites.filter(sat => sat.orbitType === 'LEO' && sat.opsStatus === 'operational');
        const currentTime = time ? toDate(time as Date | JulianDate) : null;

        // Apply RF connectivity requirement - satellite must have active beam covering user
        const eligibleLEO = leoSatellites.map((sat): EligibleLeoCandidate | null => {
            if (!time) return null; // Need time for RF connectivity check

            // Rule 1: RF connectivity (user must be inside active beam)
            if (!hasRFConnectivity(userLocation, sat, time, simulationState)) {
                return null;
            }

            // Rule 2: Satellite sees at least one active SNP (gateway) simultaneously with SNP elevation ≥ 15°
            const gateway = assessGatewayLinks(sat, failedSnps);
            if (!gateway.bestSNP) {
                return null;
            }

            return {
                satellite: sat,
                gateway,
                connectedBeamIndex: findConnectedBeamIndex(userLocation, sat, time, simulationState),
            };
        }).filter((candidate): candidate is EligibleLeoCandidate => candidate !== null);

        // Score eligible LEO satellites using the canonical beam estimator.
        const scoredLEO = eligibleLEO.map((candidate): ScoredLeoCandidate => {
            const { satellite, gateway, connectedBeamIndex } = candidate;
            const throughputScore = connectedBeamIndex !== null
                ? (() => {
                    const estimate = estimateCurrentLeoBeamLink({
                        userPosition: userLocation,
                        satellite,
                        beamIndex: connectedBeamIndex,
                        snpPosition: gateway.bestSNP,
                        time,
                        simulationState,
                    });
                    const referenceMbps = satellite.capacity.simulatedEffectiveBeamCapacityMbps ?? 200;
                    return estimate
                        ? clamp01(estimate.deliveredDownlinkMbps / Math.max(referenceMbps, 1))
                        : getFallbackThroughputScore(userLocation, satellite, gateway);
                })()
                : getFallbackThroughputScore(userLocation, satellite, gateway);

            const rvtScore = currentTime
                ? clamp01(computeRemainingVisibleTime(userLocation, satellite, currentTime) / MAX_RVT_S)
                : 0;
            const hysteresisScore = previousLEOSatId === satellite.id ? 1 : 0;
            const totalScore =
                (W_THROUGHPUT * throughputScore)
                + (W_RVT * rvtScore)
                + (W_HYSTERESIS * hysteresisScore)
                + (W_GATEWAY * gateway.marginScore);

            return {
                ...candidate,
                totalScore,
                throughputScore,
                rvtScore,
                hysteresisScore,
            };
        });

        // Select LEO satellite with highest score
        if (scoredLEO.length > 0) {
            scoredLEO.sort((a, b) => b.totalScore - a.totalScore);
            autoSelectedLEOSat = scoredLEO[0].satellite;
            selectedSNP = scoredLEO[0].gateway.bestSNP;
        } else {
            // Diagnostic fallback only: keep an RF-visible satellite reference for
            // status/debug display. This is not a valid OneWeb service path because
            // Gen 1 bent-pipe service requires simultaneous satellite-SNP visibility.
            const rfConnectedLEO = leoSatellites.filter(sat => {
                if (!time) return false; // Need time for RF connectivity check

                // Rule 1: RF connectivity (user must be inside active beam)
                if (!hasRFConnectivity(userLocation, sat, time, simulationState)) {
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
                // No SNP selected: downstream service logic must treat this as BLOCKED.
                selectedSNP = null;
            } else {
                // Preserve the selected satellite reference independently from RF availability.
                // This lets downstream status logic report "RF unavailable" instead of
                // collapsing the state into "no satellite" whenever a visible satellite
                // exists but the active beam/RF check fails.
                const geometricallyVisibleLEO = leoSatellites
                    .map(sat => ({
                        satellite: sat,
                        elevation: calculateElevationAngle(userLocation, sat)
                    }))
                    .filter(({ elevation }) => elevation >= 15);

                if (geometricallyVisibleLEO.length > 0) {
                    geometricallyVisibleLEO.sort((a, b) => b.elevation - a.elevation);
                    autoSelectedLEOSat = geometricallyVisibleLEO[0].satellite;
                    selectedSNP = null;
                }
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
    satellite: SatelliteData,
    geoTerminalRFClassId: string | null = null
): any | null => {
    if (!satellite.coverages || satellite.coverages.length === 0) {
        return null;
    }

    const rankedCandidates = rankCandidateCoverages(
        findCandidateCoverages(position, [satellite], { terminalRFClassId: geoTerminalRFClassId }),
        [satellite],
        position
    );
    const resolved = resolveCandidateCoverage(rankedCandidates[0] ?? null, [satellite]);

    if (resolved?.beam) {
        return resolved.beam;
    }

    return satellite.coverages[0] ?? null;
};
