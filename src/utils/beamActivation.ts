/**
 * beamActivation.ts
 *
 * Single source of truth for OneWeb beam activation.
 *
 * Since Lot 3 Item 4 the GSO-protection contribution is a GEOMETRY-DERIVED
 * per-beam muted set (gsoProtection.computeGsoMutedBeamSet — a beam is muted
 * only when the GSO-belt separation angle at its own pitched ground center is
 * below GSO_KEEPOUT_ANGLE_DEG). The former rules — full 16-beam blackout at
 * |lat| ≤ 5° and the fixed anti-arc half-comb for |lat| < 45° — are retired;
 * see docs/LEO_Item4_GSO_Validation_2026-07-11.md for the public-evidence
 * basis (the correct muted side emerges from the geometry: the beams still
 * covering high latitudes near the node, on ascending and descending legs
 * alike).
 *
 * Callers obtain the muted set ONCE per (satellite, instant) from the cached
 * accessor `getGsoMutedBeamSet` (oneWebComb.ts) — do not recompute the belt
 * test per consumer.
 */

/**
 * Returns true if the given beam should be transmitting.
 *
 * @param beamIndex      0 = northernmost beam, 15 = southernmost beam
 * @param gsoMutedBeams  Geometry-derived GSO keep-out set for this satellite/instant
 * @param hsBeams        Optional set of beam indices marked Hard Out of Service (HS).
 *                       An HS beam is excluded from service regardless of GSO state.
 */
export function isBeamActive(
    beamIndex: number,
    gsoMutedBeams: ReadonlySet<number>,
    hsBeams?: ReadonlySet<number>
): boolean {
    // Feature 3: Beam HS — hard out-of-service overrides everything
    if (hsBeams?.has(beamIndex)) return false;

    // Geometric GSO keep-out (Lot 3 Item 4)
    return !gsoMutedBeams.has(beamIndex);
}

/**
 * Count of active beams for a given GSO muted set and HS set — single helper
 * for the derivation used by power budgeting and diagnostics (LEO audit L-Mi6).
 */
export function countActiveBeams(
    totalBeams: number,
    gsoMutedBeams: ReadonlySet<number>,
    hsBeams?: ReadonlySet<number>
): number {
    let count = 0;
    for (let beamIndex = 0; beamIndex < totalBeams; beamIndex++) {
        if (isBeamActive(beamIndex, gsoMutedBeams, hsBeams)) count++;
    }
    return count;
}
