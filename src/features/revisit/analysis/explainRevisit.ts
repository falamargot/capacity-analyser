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

import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { toDeg, toRad } from '../../../utils/sphericalGeometry';
import type { GapStatistics, RevisitScenario } from '../domain/types';
import { groundArcRad } from '../fov/footprint';
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

/** The FOV's ground half-angle, degrees — how far off-track the target can be. */
export function groundHalfAngleDeg(scenario: RevisitScenario): number {
    const a = EARTH_RADIUS_KM + scenario.reference.altitudeKm;
    const widest = Math.max(scenario.payload.halfAngle1Deg, scenario.payload.halfAngle2Deg);
    const bias = Math.hypot(
        scenario.payload.biasDeg.alongTrack, scenario.payload.biasDeg.crossTrack
    );
    return toDeg(groundArcRad(a, toRad(Math.min(widest + bias, 89))).arcRad);
}

export function explainRevisit(
    scenario: RevisitScenario,
    statistics: GapStatistics | null,
    sweep: PayloadSweepResult | null
): RevisitExplanation {
    const { reference, target } = scenario;
    const turning = turningLatitudeDeg(reference.inclinationDeg);
    const lambda = groundHalfAngleDeg(scenario);
    const reach = turning + lambda;
    const absLat = Math.abs(target.latDeg);

    const selectedPlanes = reference.planes / scenario.selection.planeStride;
    const perPlane = reference.satsPerPlane / scenario.selection.satStride;
    const payloads = payloadCount(reference, scenario.selection);

    // ── GEOMETRY ────────────────────────────────────────────────────────────
    const unreachable = absLat > reach;
    const geometry: RevisitFactor = {
        id: 'GEOMETRY',
        label: 'Geometry',
        value: unreachable
            ? `lat ${absLat.toFixed(1)}° > reach ${reach.toFixed(1)}° ✕`
            : `lat ${absLat.toFixed(1)}° < reach ${reach.toFixed(1)}° ✓`,
        detail: unreachable
            ? `The target sits above the highest latitude this constellation can see. `
              + `Ground tracks turn at ${turning.toFixed(1)}° and the instrument reaches `
              + `${lambda.toFixed(1)}° beyond that. No number of payloads changes this — `
              + `only inclination or a wider field of view.`
            : `Ground tracks turn at ${turning.toFixed(1)}°; the instrument adds `
              + `${lambda.toFixed(1)}° of ground half-angle. Coverage is densest just below `
              + `the turning latitude, where successive tracks converge.`,
        status: unreachable ? 'BLOCKING' : 'OK',
        isLimiting: false,
    };

    // ── SWATH ───────────────────────────────────────────────────────────────
    const swathKm = 2 * EARTH_RADIUS_KM * toRad(lambda);
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
