/**
 * observedOrbitalElements.ts — the satrec → plain-elements adapter.
 *
 * ── WHY THIS FILE EXISTS OUTSIDE src/features/revisit/ ──────────────────────
 * ADR-001 §1 is categorical: no `satrec` ever enters the revisit module, and
 * `satellite.js` is never imported there. The Walker calibration nonetheless
 * needs to know where the real fleet actually is.
 *
 * The resolution is that it does not need PROPAGATION — only mean elements,
 * which a TLE already carries and `twoline2satrec` has already parsed. This
 * adapter reads those fields and hands the revisit module plain numbers. The
 * boundary holds, and the fit never runs SGP4.
 *
 * Nothing here propagates, and nothing here imports satellite.js: it reads
 * fields off an object the caller already owns.
 */

/**
 * Mean orbital elements of a real satellite, as plain numbers.
 *
 * This is the whole contract between the real fleet and the parametric fit.
 */
export interface ObservedElements {
    id: string;
    name: string;
    inclinationDeg: number;
    /** Right ascension of the ascending node, degrees in [0, 360). */
    raanDeg: number;
    /**
     * Argument of latitude, degrees in [0, 360).
     *
     * For a near-circular orbit the argument of perigee is poorly determined but
     * `argp + M` — the angle from the ascending node — is well determined. That
     * sum is what a Walker constellation actually distributes, so it is what the
     * fit consumes.
     */
    argLatDeg: number;
    semiMajorAxisKm: number;
    eccentricity: number;
    /**
     * UTC epoch these elements are referenced to, milliseconds.
     *
     * NOT optional, and not cosmetic. Mean anomaly is measured from each
     * satellite's OWN epoch, so `argLatDeg` values are not comparable between
     * satellites until they are propagated to a common instant.
     *
     * The real OneWeb catalogue makes this unmissable: its TLEs are issued at
     * each satellite's ascending-node crossing, so `argp + M` is the same
     * constant (~360.13°) for all 651 of them and every satellite appears to sit
     * at the same point in its orbit. Their true phase lives entirely in the
     * epoch spread — 15 hours across the fleet.
     */
    epochMs: number;
    /** Mean motion, rad/s — what propagates `argLatDeg` to a common epoch. */
    meanMotionRadPerSec: number;
}

/** The minimum shape this adapter reads. Deliberately not `satellite.js`'s SatRec. */
interface MeanElementSource {
    inclo?: number;   // rad
    nodeo?: number;   // rad
    argpo?: number;   // rad
    mo?: number;      // rad
    no?: number;      // rad/min
    ecco?: number;
    /** Julian date of the TLE epoch. */
    jdsatepoch?: number;
}

/** Julian date of the Unix epoch. */
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86_400_000;

const RAD_TO_DEG = 180 / Math.PI;
/** Earth's gravitational parameter, km³/s². Matches the revisit engine's value. */
const MU_EARTH_KM3_S2 = 398600.4418;

const normalizeDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/**
 * Extract mean elements from a parsed TLE record.
 *
 * Returns null when the record is missing anything the fit needs — a fleet
 * always contains a few unusable entries, and dropping them silently is
 * correct here as long as the caller reports how many were used.
 *
 * The semi-major axis is derived from mean motion by Kepler's third law rather
 * than read from `satrec.a`: that field is in SGP4's internal Earth radii and
 * carries SGP4's own constants, whereas this value must be consistent with the
 * revisit engine's μ or the altitude residual is meaningless. The difference is
 * small — a few km — but it would show up as a fixed bias in the fit report.
 */
export function observedElementsFromMeanElements(
    id: string,
    name: string,
    source: MeanElementSource | null | undefined
): ObservedElements | null {
    if (!source) return null;
    const { inclo, nodeo, argpo, mo, no, ecco, jdsatepoch } = source;
    if (![inclo, nodeo, argpo, mo, no].every((v) => typeof v === 'number' && Number.isFinite(v))) {
        return null;
    }
    if (!no || no <= 0) return null;
    // Without an epoch the argument of latitude cannot be made comparable with
    // any other satellite's, so the record is unusable for a fit.
    if (typeof jdsatepoch !== 'number' || !Number.isFinite(jdsatepoch)) return null;

    const meanMotionRadPerSec = no / 60;
    const semiMajorAxisKm = Math.cbrt(MU_EARTH_KM3_S2 / (meanMotionRadPerSec ** 2));
    if (!Number.isFinite(semiMajorAxisKm) || semiMajorAxisKm <= 0) return null;

    return {
        id,
        name,
        inclinationDeg: normalizeDeg(inclo! * RAD_TO_DEG),
        raanDeg: normalizeDeg(nodeo! * RAD_TO_DEG),
        argLatDeg: normalizeDeg((argpo! + mo!) * RAD_TO_DEG),
        semiMajorAxisKm,
        eccentricity: typeof ecco === 'number' && Number.isFinite(ecco) ? ecco : 0,
        epochMs: (jdsatepoch - JD_UNIX_EPOCH) * MS_PER_DAY,
        meanMotionRadPerSec,
    };
}

/**
 * Propagate an argument of latitude to a common epoch.
 *
 * `u(t) = u(epoch) + n·(t − epoch)`. Only the secular mean-motion term is
 * applied, which is all that is needed to make phases comparable across a fleet
 * whose epochs differ by hours.
 */
export function argLatAtEpochDeg(element: ObservedElements, commonEpochMs: number): number {
    const dtSeconds = (commonEpochMs - element.epochMs) / 1000;
    const advanceDeg = element.meanMotionRadPerSec * dtSeconds * RAD_TO_DEG;
    return normalizeDeg(element.argLatDeg + advanceDeg);
}

/** Map a loaded fleet to observed elements, dropping entries that cannot be read. */
export function observedElementsFromSatellites(
    satellites: Array<{ id: string; name: string; satrec?: unknown }>
): ObservedElements[] {
    const out: ObservedElements[] = [];
    for (const satellite of satellites) {
        const elements = observedElementsFromMeanElements(
            satellite.id, satellite.name, satellite.satrec as MeanElementSource | undefined
        );
        if (elements) out.push(elements);
    }
    return out;
}
