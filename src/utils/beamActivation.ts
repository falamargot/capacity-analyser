/**
 * beamActivation.ts
 *
 * Single source of truth for OneWeb GSO Protection beam activation logic.
 * Extracted to a standalone zero-dependency module to avoid any ESM circular
 * evaluation issues that arise when this pure function was co-located in
 * oneWebComb.ts (which has heavy Cesium + SGP4 dependencies).
 *
 * OneWeb operational rules (ITU-R S.1428 / GSO Protection):
 *  - Blanking zone  (|lat| ≤ 2°) : ALL beams OFF → 0 Tx (GEO arc exclusion zone)
 *  - GSO Avoidance  (2° < |lat| < 45°): HALF beams ON — comb rotated away from GEO arc
 *      Northern half (beams 0-7)  active when (lat > 0 AND moving north)
 *                                           OR (lat < 0 AND moving south)
 *      Southern half (beams 8-15) active otherwise
 *  - Normal         (|lat| ≥ 45°): ALL 16 beams active
 */

/**
 * Returns true if the given beam should be transmitting given the current
 * GSO Protection state of the satellite.
 *
 * @param beamIndex       0 = northernmost beam, 15 = southernmost beam
 * @param isBlankingZone  satellite is in GSO exclusion zone (|lat| ≤ 2°)
 * @param isGSOAvoidance  satellite is pitching for GSO Protection (2° < |lat| < 45°)
 * @param satLatDeg       current geodetic latitude of the satellite (degrees)
 * @param isMovingNorth   true if the satellite's along-track velocity has a northward component
 */
export function isBeamActive(
    beamIndex: number,
    isBlankingZone: boolean,
    isGSOAvoidance: boolean,
    satLatDeg: number,
    isMovingNorth: boolean
): boolean {
    // GSO exclusion zone ±2° latitude — all beams silenced
    if (isBlankingZone) return false;

    // GSO Protection (half-comb rotation): only 8 of the 16 beams illuminated
    if (isGSOAvoidance) {
        // The northern half of the comb is activated when the satellite is in the
        // northern hemisphere and moving north, or in the southern hemisphere and
        // moving south — i.e. when the boresight pitches away from the equatorial GEO arc.
        const shouldActivateNorthernBeams = (satLatDeg > 0) === isMovingNorth;
        return shouldActivateNorthernBeams
            ? beamIndex >= 0 && beamIndex <= 7    // Northern half (beams 0–7)
            : beamIndex >= 8 && beamIndex <= 15;  // Southern half (beams 8–15)
    }

    // Normal operation: all 16 beams active
    return true;
}