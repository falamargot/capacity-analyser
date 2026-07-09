/**
 * beamActivation.ts
 *
 * Single source of truth for OneWeb GSO Protection beam activation logic.
 * Extracted to a standalone zero-dependency module to avoid any ESM circular
 * evaluation issues that arise when this pure function was co-located in
 * oneWebComb.ts (which has heavy Cesium + SGP4 dependencies).
 *
 * Simulated OneWeb GSO Protection rules (ITU-R S.1428 context):
 *  - Blanking zone  (|lat| ≤ GSO_EXCLUSION_HALF_ANGLE_DEG, currently 5° — see
 *    config/oneweb.ts): ALL beams OFF → 0 Tx (GEO arc exclusion zone)
 *  - GSO Avoidance  (blanking < |lat| < 45°): HALF beams ON — comb pitched away from GEO arc
 *      Beam IDs are fixed in the payload frame: beam 0 is always northernmost,
 *      beam 15 always southernmost, regardless of pass direction.
 *      Northern half (beams 0-7)  active when satLat > 0 (NH, GEO arc is to the south)
 *      Southern half (beams 8-15) active when satLat < 0 (SH, GEO arc is to the north)
 *  - Normal         (|lat| ≥ 45°): ALL 16 beams active
 */

/**
 * Returns true if the given beam should be transmitting given the current
 * GSO Protection state of the satellite.
 *
 * @param beamIndex       0 = northernmost beam, 15 = southernmost beam
 * @param isBlankingZone  satellite is in the GSO exclusion zone (|lat| ≤ GSO_EXCLUSION_HALF_ANGLE_DEG)
 * @param isGSOAvoidance  satellite is pitching for GSO Protection (blanking < |lat| < 45°)
 * @param satLatDeg       current geodetic latitude of the satellite (degrees)
 * @param hsBeams         optional set of beam indices marked as Hard Out of Service (HS).
 *                        When a beam is HS it is excluded from service regardless of GSO state.
 */
export function isBeamActive(
    beamIndex: number,
    isBlankingZone: boolean,
    isGSOAvoidance: boolean,
    satLatDeg: number,
    hsBeams?: ReadonlySet<number>
): boolean {
    // Feature 3: Beam HS — hard out-of-service overrides everything
    if (hsBeams?.has(beamIndex)) return false;

    // GSO exclusion zone (±GSO_EXCLUSION_HALF_ANGLE_DEG latitude) — all beams silenced
    if (isBlankingZone) return false;

    // GSO Protection (half-comb): only 8 of the 16 beams illuminated.
    // Beam IDs are fixed in the payload frame (beam 0 = northernmost, always).
    // We activate the half that points AWAY from the equatorial GEO arc:
    //   - Northern hemisphere (satLat > 0): GEO arc is to the south → activate northern beams (0–7)
    //   - Southern hemisphere (satLat < 0): GEO arc is to the north → activate southern beams (8–15)
    // Pass direction (isMovingNorth) does not affect beam selection because beam IDs
    // are no longer coupled to the direction of travel.
    if (isGSOAvoidance) {
        const shouldActivateNorthernBeams = satLatDeg > 0;
        return shouldActivateNorthernBeams
            ? beamIndex >= 0 && beamIndex <= 7    // Northern half (beams 0–7), away from GEO
            : beamIndex >= 8 && beamIndex <= 15;  // Southern half (beams 8–15), away from GEO
    }

    // Normal operation: all 16 beams active
    return true;
}