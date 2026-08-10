/**
 * Satellite resolution utilities - business logic for auto-selecting satellites
 */
import { JulianDate } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SNPData } from '../components/globe/GlobeConfig';
import { buildLeoFeederLink, getBestConnectedGateway } from './connectivityRules';
import type { LeoServingAssignment } from '../data/leoGroundSegment';
import { calculateElevationAngle } from './capacityCalculator';
import { elevationAngleDeg } from './wgs84Geometry';
import {
    findCandidateCoverages,
    rankCandidateCoverages,
    resolveCandidateCoverage,
} from './geoCoverageSelection';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG } from './leoFootprint';
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
    /** Derived from servingAssignment.feeder — kept for existing call sites. */
    selectedSNP: SNPData | null;
    /**
     * The canonical (satellite, beam, feeder) tuple for this point (L-O1).
     * `feeder: null` = RF-only diagnostic state; `score: null` = diagnostic
     * fallback selection that bypassed scoring.
     */
    servingAssignment: LeoServingAssignment | null;
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
const RVT_MIN_ELEVATION_DEG = MIN_USER_TERMINAL_ELEVATION_DEG;
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
    // L-Mo5: delegate to the canonical max-feeder-elevation selector shared
    // with the inspection card and rendering.
    const best = getBestConnectedGateway(sat, MIN_SNP_GATEWAY_ELEVATION_DEG, failedSnps);

    return {
        bestSNP: best?.snp ?? null,
        bestElevation: best?.elevation ?? -1,
        // Gateway-margin score for candidate ranking only (NOT a throughput
        // scaler — the Ka feeder budget owns capacity effects, L-O2):
        // 15 deg = just reachable, 50 deg = excellent gateway margin.
        marginScore: best
            ? clamp01((best.elevation - MIN_SNP_GATEWAY_ELEVATION_DEG) / (50 - MIN_SNP_GATEWAY_ELEVATION_DEG))
            : 0,
    };
}

/**
 * Elevation from the observer to a satellite's sub-point, degrees.
 *
 * Phase 3 (docs/SPATIAL_PHYSICS_AUDIT.md, SPA-01): this was the third and last
 * elevation implementation in the codebase, and the only one still on a
 * spherical Earth — R = 6371 km, fed the geodetic latitude and ellipsoid height
 * that `eciToGeodetic` returns. That is the same conflation SPA-02 found in the
 * GSO keep-out, in a less consequential place.
 *
 * Consolidating it onto the shared ellipsoid model is NOT bit-identical: it
 * moves the answer by up to 0.13 deg, and 0.026-0.046 deg near the elevation
 * gates that matter. That is deliberate and is an improvement — the ellipsoid
 * figure is the one verified against GMAT to 7.2e-6 deg — and it cannot change
 * behaviour here in any case: the only caller samples on RVT_STEP_S = 15 s, and
 * at LEO elevation rates 0.05 deg is well under a second, roughly 30x below the
 * sampling quantisation.
 */
function computeElevationFromCoords(
    observerLatDeg: number,
    observerLngDeg: number,
    satLatDeg: number,
    satLngDeg: number,
    satAltKm: number
): number {
    return elevationAngleDeg(
        { latDeg: observerLatDeg, lonDeg: observerLngDeg, altKm: 0 },
        { latDeg: satLatDeg, lonDeg: satLngDeg, altKm: satAltKm },
    );
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
    const limitingElevation = gateway.bestElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG
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
    let servingAssignment: LeoServingAssignment | null = null;

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
            const winner = scoredLEO[0];
            autoSelectedLEOSat = winner.satellite;
            servingAssignment = {
                satelliteId: winner.satellite.id,
                beamIndex: winner.connectedBeamIndex,
                feeder: winner.gateway.bestSNP
                    ? buildLeoFeederLink(winner.gateway.bestSNP, winner.satellite, winner.gateway.bestElevation)
                    : null,
                score: {
                    total: winner.totalScore,
                    throughput: winner.throughputScore,
                    rvt: winner.rvtScore,
                    hysteresis: winner.hysteresisScore,
                    gatewayMargin: winner.gateway.marginScore,
                },
            };
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
                // No reachable SNP: downstream service logic must treat this as BLOCKED.
                servingAssignment = {
                    satelliteId: autoSelectedLEOSat.id,
                    beamIndex: null,
                    feeder: null,
                    score: null,
                };
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
                    .filter(({ elevation }) => elevation >= MIN_USER_TERMINAL_ELEVATION_DEG);

                if (geometricallyVisibleLEO.length > 0) {
                    geometricallyVisibleLEO.sort((a, b) => b.elevation - a.elevation);
                    autoSelectedLEOSat = geometricallyVisibleLEO[0].satellite;
                    servingAssignment = {
                        satelliteId: autoSelectedLEOSat.id,
                        beamIndex: null,
                        feeder: null,
                        score: null,
                    };
                }
            }
        }
    }

    return {
        autoSelectedLEOSat,
        autoSelectedGEOSat,
        // Single source: the SNP a caller sees IS the assignment's feeder site.
        selectedSNP: servingAssignment?.feeder?.snp ?? null,
        servingAssignment,
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
