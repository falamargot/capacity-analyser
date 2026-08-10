/**
 * explainRevisit.ts — "what is holding me back?"
 *
 * Transposes ENG's `WHY THIS RESULT` checklist. One row per factor, and at most
 * one row marked as *limiting* — the direct analogue of ENG's decisive factor.
 *
 * ── THE RULE THIS MODULE IS BUILT AROUND ────────────────────────────────────
 * A wrong decisive factor is worse than no decisive factor. Somebody will
 * re-plan a constellation around this line. So `limiting` is only ever set from
 * evidence the engine has actually produced, and when nothing supports a
 * verdict the answer is `NOT_DETERMINED` rather than a plausible guess.
 *
 * What counts as evidence here:
 *   - GEOMETRY      analytic latitude reach: a satellite at inclination i sees
 *                   up to |lat| = i + λ, where λ is the FOV's ground half-angle.
 *                   Beyond that no amount of payloads helps, which makes this
 *                   the only factor that can be *blocking*.
 *   - PLANE SPREAD  the sweep evaluated the other splits at this payload count.
 *                   If a different split measured better, that is measurement,
 *                   not inference.
 *   - ACCESS WINDOWS the window length against the reliability floor.
 *
 * SWATH and PHASING are reported but never claimed as limiting: establishing
 * that would need engine runs this module does not perform (widen the FOV, vary
 * f, re-measure). Saying so is the honest position — see `notDeterminedReason`.
 */

import { WGS84_A_KM, WGS84_F, orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toDeg, toRad } from '../../../utils/sphericalGeometry';
import type { GapStatistics, RevisitScenario } from '../domain/types';
import { computeFootprint, groundArcRad } from '../fov/footprint';
import { prepareFov } from '../fov/containment';
import { preparePropagator, propagateState } from '../propagation/keplerJ2';
import { payloadCount } from '../domain/subConstellation';
import { MIN_RELIABLE_WINDOW_HOURS } from './accessIntervals';
import type { PayloadSweepResult } from './payloadSweep';

export type RevisitFactorId =
    | 'GEOMETRY' | 'SWATH' | 'PLANE_SPREAD' | 'PHASING' | 'ACCESS_WINDOWS';

export type FactorStatus = 'OK' | 'WARN' | 'BLOCKING' | 'UNKNOWN';

export interface RevisitFactor {
    id: RevisitFactorId;
    label: string;
    /** The compact right-hand value, e.g. `704 km` or `lat < incl ✓`. */
    value: string;
    /** One sentence of expandable detail. */
    detail: string;
    status: FactorStatus;
    isLimiting: boolean;
}

export interface RevisitExplanation {
    factors: RevisitFactor[];
    /** The limiting factor, or null when the evidence does not support one. */
    limiting: RevisitFactorId | null;
    /** Set when `limiting` is null: why no verdict was reached. */
    notDeterminedReason: string | null;
}

/** How much better a different split must measure before we call spread limiting. */
const SPREAD_LIMITING_THRESHOLD = 0.10;

/** The highest latitude a satellite at this inclination passes over. */
export function turningLatitudeDeg(inclinationDeg: number): number {
    return inclinationDeg <= 90 ? inclinationDeg : 180 - inclinationDeg;
}

/**
 * The FOV's ground half-angle, degrees — how far off-track the target can be.
 *
 * R28: the orbital radius comes from the equatorial altitude datum, and the
 * ground arc is the EQUATORIAL reference figure (`groundArcRad` is defined
 * against `a`). This drives the WHY THIS REVISIT reach statement, which is a
 * user-facing claim, so it must not derive its radius from the coverage sphere.
 */
export function groundHalfAngleDeg(scenario: RevisitScenario): number {
    const a = orbitalRadiusKm(scenario.reference.altitudeKm);
    const widest = Math.max(scenario.payload.halfAngle1Deg, scenario.payload.halfAngle2Deg);
    const bias = Math.hypot(
        scenario.payload.biasDeg.alongTrack, scenario.payload.biasDeg.crossTrack
    );
    return toDeg(groundArcRad(a, toRad(Math.min(widest + bias, 89))).arcRad);
}

/** Argument-of-latitude samples for the reach scan — 5° apart. */
const REACH_ARGLAT_SAMPLES = 72;
/**
 * Boundary vertices per sample.
 *
 * Dense, because this bound must never UNDER-state the reach: under-stating it
 * makes the product declare `BLOCKING` — "no number of payloads changes this" —
 * for a target that is in fact visible. Over-stating merely withholds a verdict.
 * At 180 vertices the arc between neighbours is 2°, and latitude varies as a
 * cosine near its extreme, so the sagitta is negligible.
 */
const REACH_BOUNDARY_SAMPLES = 180;
const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);

/**
 * Maximum difference between geodetic and geocentric latitude on WGS84.
 *
 * With q = b²/a², tan(theta_geocentric) = q·tan(phi_geodetic). The difference
 * is maximal at tan(phi) = 1/sqrt(q), which gives the closed form below.
 */
const WGS84_MAX_LATITUDE_DEFLECTION_RAD = (() => {
    const q = (1 - WGS84_F) ** 2;
    return 2 * Math.atan(1 / Math.sqrt(q)) - Math.PI / 2;
})();

/**
 * A proven upper bound on reachable geodetic latitude.
 *
 * The sampled footprint maximum below is useful for display, but a sampled
 * maximum is a lower bound and cannot prove that a target is unreachable. This
 * bound deliberately over-approximates instead:
 *
 *  - the triangle inequality bounds every FOV ray's angle from geocentric
 *    nadir by boresight bias + the farthest aperture corner;
 *  - the WGS84 polar radius is no larger than any surface geocentric radius, so
 *    intersecting the smaller polar sphere produces at least as much ground arc
 *    as the ellipsoid can;
 *  - the exact maximum geodetic/geocentric latitude deflection is added.
 *
 * It may withhold BLOCKING close to the boundary, which is safe. It cannot turn
 * a visible target into a false impossibility verdict.
 */
export function conservativeReachUpperBoundDeg(scenario: RevisitScenario): number {
    const satRadius = orbitalRadiusKm(scenario.reference.altitudeKm);
    const prepared = prepareFov(scenario.payload);
    const boresightFromNadir = Math.acos(Math.max(-1, Math.min(1, prepared.bHat.z)));
    const apertureFromBoresight = prepared.shape === 'RECTANGLE'
        ? Math.atan(Math.hypot(prepared.tanHalf1, prepared.tanHalf2))
        : Math.atan(Math.max(prepared.tanHalf1, prepared.tanHalf2));
    const maxOffNadir = boresightFromNadir + apertureFromBoresight;

    // Targets may be as low as -1 km. Using the smallest permitted radial
    // surface keeps the ground-arc bound conservative for those inputs too.
    const targetAltitude = scenario.target.altitudeKm ?? 0;
    const minGroundRadius = WGS84_B_KM + Math.min(0, targetAltitude);
    const limbOffNadir = Math.asin(minGroundRadius / satRadius);
    const maxGroundArc = maxOffNadir >= limbOffNadir
        ? Math.acos(minGroundRadius / satRadius)
        : Math.asin(
            Math.min(1, (satRadius / minGroundRadius) * Math.sin(maxOffNadir))
        ) - maxOffNadir;

    const turning = toRad(turningLatitudeDeg(scenario.reference.inclinationDeg));
    return toDeg(Math.min(
        Math.PI / 2,
        turning + maxGroundArc + WGS84_MAX_LATITUDE_DEFLECTION_RAD,
    ));
}

/**
 * The highest GEODETIC latitude this constellation's instrument can actually
 * reach, degrees — computed from ray/WGS84-ellipsoid geometry.
 *
 * ── WHY THIS EXISTS RATHER THAN turning + groundHalfAngleDeg() ──────────────
 * The old bound added `groundHalfAngleDeg()` to the turning latitude. That
 * scalar is an EQUATORIAL REFERENCE value: it solves the spherical law of sines
 * against `a`, where the ellipsoid's cross-section happens to be circular. It is
 * a fine number to display and a poor one to decide with, for two reasons:
 *
 *   1. it is not a latitude reach on an ellipsoid, where the ground curvature
 *      and the deflection of the vertical both vary with latitude — and the
 *      reach question is asked precisely at high latitude, farthest from where
 *      the scalar is exact;
 *   2. it collapses a possibly asymmetric FOV to one half-angle, so a biased or
 *      clocked instrument is mis-bounded in the direction that matters.
 *
 * That mattered because this fed a `BLOCKING` verdict — the product telling a
 * user "no number of payloads changes this". This file's own rule is that a
 * wrong decisive factor is worse than none, so the decisive path now uses the
 * same ray/ellipsoid geometry the footprint does, and the equatorial scalar
 * stays where it belongs: on the SWATH line, as a reference figure.
 *
 * Method: sweep the argument of latitude over a full orbit, project the FOV
 * boundary at each step, and take the largest |geodetic latitude| any boundary
 * vertex reaches. Exact for a circular orbit up to the sampling, and the
 * sampling is dense against a quantity that varies smoothly over an orbit.
 * Earth rotation is irrelevant here — it is a rotation about the pole and
 * cannot change a latitude.
 */
export function maxReachableLatitudeDeg(scenario: RevisitScenario): number {
    const semiMajorAxisKm = orbitalRadiusKm(scenario.reference.altitudeKm);
    const fov = prepareFov(scenario.payload);
    const propagator = preparePropagator({
        id: 'reach-probe',
        planeIndex: 0,
        satIndexInPlane: 0,
        semiMajorAxisKm,
        inclinationDeg: scenario.reference.inclinationDeg,
        raanDeg: 0,
        argLatDeg: 0,
    });
    let maxAbs = 0;

    for (let k = 0; k < REACH_ARGLAT_SAMPLES; k++) {
        // At t = 0 argument of latitude comes from argLat0Rad. Mutating this
        // probe avoids rebuilding inclination-dependent propagator state 72
        // times on the UI thread.
        propagator.argLat0Rad = toRad((k / REACH_ARGLAT_SAMPLES) * 360);
        const state = propagateState(propagator, 0);
        const footprint = computeFootprint(state, fov, 0, 0, REACH_BOUNDARY_SAMPLES);
        if (!footprint) continue;

        for (const vertex of footprint.boundary) {
            const abs = Math.abs(vertex.lat);
            if (abs > maxAbs) maxAbs = abs;
        }

        // A footprint that CONTAINS a pole reaches 90° even though no boundary
        // vertex does — the ring passes around the pole rather than through it.
        // Taking the maximum over vertices alone silently under-states the
        // reach in exactly the near-polar case this bound is asked about most,
        // and that under-statement is what would produce a false BLOCKING.
        //
        // Detected by winding: sum the signed longitude steps around the closed
        // ring. A ring enclosing a pole winds a full turn; one that does not
        // sums to zero.
        let winding = 0;
        for (let i = 1; i < footprint.boundary.length; i++) {
            let step = footprint.boundary[i].lng - footprint.boundary[i - 1].lng;
            while (step > 180) step -= 360;
            while (step < -180) step += 360;
            winding += step;
        }
        if (Math.abs(winding) > 180) return 90;
    }
    return maxAbs;
}

export function explainRevisit(
    scenario: RevisitScenario,
    statistics: GapStatistics | null,
    sweep: PayloadSweepResult | null
): RevisitExplanation {
    const { reference, target } = scenario;
    const turning = turningLatitudeDeg(reference.inclinationDeg);
    // Equatorial reference scalar — DISPLAYED on the swath line, never used to
    // decide reach. See `maxReachableLatitudeDeg`.
    const lambda = groundHalfAngleDeg(scenario);
    const reach = maxReachableLatitudeDeg(scenario);
    const reachUpperBound = conservativeReachUpperBoundDeg(scenario);
    const absLat = Math.abs(target.latDeg);

    const selectedPlanes = reference.planes / scenario.selection.planeStride;
    const perPlane = reference.satsPerPlane / scenario.selection.satStride;
    const payloads = payloadCount(reference, scenario.selection);

    // ── GEOMETRY ────────────────────────────────────────────────────────────
    const unreachable = absLat > reachUpperBound;
    const reachUncertain = !unreachable && absLat > reach;
    const geometry: RevisitFactor = {
        id: 'GEOMETRY',
        label: 'Geometry',
        value: unreachable
            ? `lat ${absLat.toFixed(1)}° > reach ≤ ${reachUpperBound.toFixed(1)}° ✕`
            : reachUncertain
                ? `lat ${absLat.toFixed(1)}° near reach ${reach.toFixed(1)}–${reachUpperBound.toFixed(1)}° ?`
                : `lat ${absLat.toFixed(1)}° < reach ${reach.toFixed(1)}° ✓`,
        detail: unreachable
            ? `The target sits above the highest latitude this constellation can see. `
              + `Even the conservative WGS84 upper bound reaches only `
              + `${reachUpperBound.toFixed(1)}°. No number of payloads changes this — only `
              + `inclination or a wider field of view.`
            : reachUncertain
                ? `The sampled WGS84 footprint reaches ${reach.toFixed(1)}°, while the proven `
                  + `conservative upper bound is ${reachUpperBound.toFixed(1)}°. The target lies `
                  + `inside that uncertainty band, so geometry is not declared blocking.`
            : `Ground tracks turn at ${turning.toFixed(1)}°; projecting the field of view `
              + `onto the ellipsoid around a full orbit reaches ${reach.toFixed(1)}°. `
              + `Coverage is densest just below the turning latitude, where successive `
              + `tracks converge.`,
        status: unreachable ? 'BLOCKING' : reachUncertain ? 'UNKNOWN' : 'OK',
        isLimiting: false,
    };

    // ── SWATH ───────────────────────────────────────────────────────────────
    // Equatorial reference swath, paired with the equatorial ground arc above.
    // Pairing it with the 6371 km sphere instead would mix datums and read
    // ~1.4 % narrow — the error R28 measured and removed.
    const swathKm = 2 * WGS84_A_KM * toRad(lambda);
    const swath: RevisitFactor = {
        id: 'SWATH',
        label: 'Swath',
        value: `${Math.round(swathKm)} km`,
        detail: `Ground half-angle ${lambda.toFixed(2)}° at ${reference.altitudeKm} km, from a `
            + `${Math.max(scenario.payload.halfAngle1Deg, scenario.payload.halfAngle2Deg)}° `
            + `off-nadir half-angle. Widening the instrument grows the swath faster than `
            + `linearly, but degrades IR ground sampling distance and lengthens the `
            + `atmospheric path — which is why adding payloads usually beats widening.`,
        status: 'OK',
        isLimiting: false,
    };

    // ── PLANE SPREAD ────────────────────────────────────────────────────────
    const here = sweep?.points.find((p) => p.payloadCount === payloads);
    const betterSplitExists = Boolean(
        here && here.spreadAdvantage !== null
        && here.spreadAdvantage >= SPREAD_LIMITING_THRESHOLD
        && here.best.selectedPlanes !== selectedPlanes
    );
    const planeSpread: RevisitFactor = {
        id: 'PLANE_SPREAD',
        label: 'Plane spread',
        value: `${selectedPlanes} × ${perPlane}`,
        detail: betterSplitExists && here
            ? `The same ${payloads} payloads over ${here.best.selectedPlanes} planes measured `
              + `${((here.spreadAdvantage ?? 0) * 100).toFixed(0)}% better on worst-case revisit. `
              + `Payloads bunched into few planes revisit the same ground track instead of `
              + `spreading their crossings through the day.`
            : `${payloads} payloads across ${selectedPlanes} `
              + `${selectedPlanes === 1 ? 'plane' : 'planes'}, ${perPlane} per plane.`
              + (here && here.alternatives.length > 0
                  ? ' This is the best split measured at this payload count.'
                  : ' No alternative split exists at this payload count.'),
        status: betterSplitExists ? 'WARN' : 'OK',
        isLimiting: false,
    };

    // ── PHASING ─────────────────────────────────────────────────────────────
    const integerF = Number.isInteger(reference.phasingF);
    const phasing: RevisitFactor = {
        id: 'PHASING',
        label: 'Phasing',
        value: `f = ${reference.phasingF}${integerF ? ' ✓' : ' ⚠'}`,
        detail: integerF
            ? `Walker phasing factor ${reference.phasingF}: each plane is offset by `
              + `${(reference.phasingF * 360 / (reference.planes * reference.satsPerPlane)).toFixed(2)}° `
              + `of argument of latitude from the last.`
            : `${reference.phasingF} is not an integer, so this is not a standard Walker `
              + `constellation. It will still propagate correctly, but it cannot be named `
              + `in i: T/P/F notation.`,
        status: integerF ? 'OK' : 'WARN',
        isLimiting: false,
    };

    // ── ACCESS WINDOWS ──────────────────────────────────────────────────────
    const windowTooShort = scenario.window.durationHours < MIN_RELIABLE_WINDOW_HOURS;
    const accessWindows: RevisitFactor = {
        id: 'ACCESS_WINDOWS',
        label: 'Access windows',
        value: statistics
            ? `${statistics.accessCount} / ${scenario.window.durationHours} h`
            : '—',
        detail: windowTooShort
            ? `A ${scenario.window.durationHours} h window is shorter than the `
              + `${MIN_RELIABLE_WINDOW_HOURS} h reliability floor. A Walker ground-track `
              + `pattern repeats over a repeat cycle, not a day, so this figure is not `
              + `trustworthy yet.`
            : statistics
                ? `${statistics.accessCount} accesses over ${scenario.window.durationHours} h, `
                  + `${(statistics.fractionInView * 100).toFixed(2)}% of the window in view. `
                  + `Boundary-truncated gaps are discarded from the worst case.`
                : 'Not yet computed.',
        status: windowTooShort ? 'WARN' : statistics ? 'OK' : 'UNKNOWN',
        isLimiting: false,
    };

    const factors = [geometry, swath, planeSpread, phasing, accessWindows];

    // ── The verdict, in priority order, from evidence only ──────────────────
    let limiting: RevisitFactorId | null = null;
    let notDeterminedReason: string | null = null;

    if (geometry.status === 'BLOCKING') {
        limiting = 'GEOMETRY';
    } else if (geometry.status === 'UNKNOWN') {
        notDeterminedReason = 'The target lies within the conservative geometry-reach uncertainty '
            + 'band, so no limiting factor is asserted.';
    } else if (windowTooShort) {
        limiting = 'ACCESS_WINDOWS';
    } else if (betterSplitExists) {
        limiting = 'PLANE_SPREAD';
    } else {
        notDeterminedReason = sweep
            ? 'This is the best configuration measured at this payload count, and the target '
              + 'is within reach. Adding payloads is the remaining lever — see the value curve.'
            : 'The configuration ladder has not been swept yet, so no factor can be shown to '
              + 'be limiting.';
    }

    for (const factor of factors) factor.isLimiting = factor.id === limiting;

    return { factors, limiting, notDeterminedReason };
}
