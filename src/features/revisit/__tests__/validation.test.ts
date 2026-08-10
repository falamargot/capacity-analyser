/**
 * validation.test.ts — cross-check the engine against INDEPENDENT oracles.
 *
 * Every other test in this directory checks the engine against the algebra it
 * was built from. These check it against results derived a different way:
 *
 *   V1  analytic J2 secular rates      vs  RK4 integration of the J2 force model
 *   V2  the sun-synchronous condition  vs  the published SSO inclination table
 *   V3  ray/ellipsoid footprints       vs  Cesium's WGS84 ray intersection
 *   V4  interval + gap arithmetic      vs  brute-force time sampling
 *   V5  LVLH tangent containment       vs  a direct off-nadir angle test
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * Most oracles below were written by the same author against the same
 * understanding of the problem, so a shared modelling misconception could pass
 * them. R4 proved that concretely — GMAT found two defects this suite did not.
 * V3 is the exception since R28: its oracle is Cesium's WGS84 ellipsoid, a
 * third-party implementation, chosen because a hand-rolled ray/ellipsoid oracle
 * would now be the same algorithm as the code under test.
 *
 * GMAT (R4) validated the PROPAGATOR. The R28 altitude datum is NOT yet
 * externally validated: the committed GMAT fixture is pinned to a fixed
 * semi-major axis and deliberately says nothing about how altitude maps to it.
 *
 * What it does establish: the implementation matches independent derivations of
 * the same physics, and the residuals are explained rather than tolerated.
 */

import { describe, expect, it } from 'vitest';
import { Cartesian3, Ellipsoid, IntersectionTests, Ray } from 'cesium';
import { WGS84_A_KM, orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toRad, toDeg } from '../../../utils/sphericalGeometry';
import {
    J2, J2_REFERENCE_RADIUS_KM, MU_EARTH_KM3_S2, argLatRateRadPerSec, eciToEcef,
    geodeticToEcef, gmstRad,
    meanMotionRadPerSec, nodalRegressionRadPerSec, preparePropagator, propagateState,
} from '../propagation/keplerJ2';
import { isTargetInFov, prepareFov, targetEciAt } from '../fov/containment';
import { computeFootprint, groundArcRad, halfSwathKm } from '../fov/footprint';
import { computeAccessIntervals } from '../analysis/accessIntervals';
import { computeGapStatistics } from '../analysis/gapStatistics';
import type { AnalysisWindow, EciState, FovSpec, OrbitalElements, Target } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

// ─── V1 — numerical integration of the J2 force model ───────────────────────

type State6 = [number, number, number, number, number, number];

/** Two-body plus J2 acceleration, in ECI. Written from the force model, not from
 *  the secular rates the engine uses — that is the whole point.
 *
 *  The J₂ term carries the EQUATORIAL radius, matching the geopotential's own
 *  definition and `J2_REFERENCE_RADIUS_KM`. Using the 6371 km geometry sphere
 *  here instead would build the engine's convention into the oracle and make
 *  the comparison circular on exactly the constant R4 found wrong. */
function accelerationJ2(s: State6, j2: number): [number, number, number] {
    const [x, y, z] = s;
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2);
    const r5 = r2 * r2 * r;
    const k =
        (-1.5 * j2 * MU_EARTH_KM3_S2 * J2_REFERENCE_RADIUS_KM * J2_REFERENCE_RADIUS_KM) / r5;
    const zr2 = (5 * z * z) / r2;
    return [
        (-MU_EARTH_KM3_S2 * x) / (r2 * r) + k * x * (1 - zr2),
        (-MU_EARTH_KM3_S2 * y) / (r2 * r) + k * y * (1 - zr2),
        (-MU_EARTH_KM3_S2 * z) / (r2 * r) + k * z * (3 - zr2),
    ];
}

function rk4Step(s: State6, dt: number, j2: number): State6 {
    const d = (u: State6): State6 => {
        const a = accelerationJ2(u, j2);
        return [u[3], u[4], u[5], a[0], a[1], a[2]];
    };
    const add = (u: State6, v: State6, f: number): State6 =>
        u.map((e, i) => e + v[i] * f) as State6;
    const k1 = d(s);
    const k2 = d(add(s, k1, dt / 2));
    const k3 = d(add(s, k2, dt / 2));
    const k4 = d(add(s, k3, dt));
    return s.map((e, i) => e + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i])) as State6;
}

/**
 * Argument of latitude from the state — the angle from the ascending node.
 *
 * Like `raanFromState`, derived from the integrated Cartesian state by a route
 * the engine never takes.
 */
function argLatFromState(s: State6): number {
    const [x, y, z, vx, vy, vz] = s;
    const hx = y * vz - z * vy;
    const hy = z * vx - x * vz;
    // Node vector = ẑ × h = (−h_y, h_x, 0).
    const nx = -hy;
    const ny = hx;
    const nLen = Math.hypot(nx, ny);
    const rLen = Math.hypot(x, y, z);
    if (nLen === 0 || rLen === 0) return 0;
    const cos = Math.max(-1, Math.min(1, (nx * x + ny * y) / (nLen * rLen)));
    const u = Math.acos(cos);
    return z < 0 ? 2 * Math.PI - u : u;
}

/** RAAN from the angular momentum vector — an element the engine never computes. */
function raanFromState(s: State6): number {
    const [x, y, z, vx, vy, vz] = s;
    const hx = y * vz - z * vy;
    const hy = z * vx - x * vz;
    return Math.atan2(hx, -hy);
}

/** Least-squares secular RAAN rate over `orbits` revolutions, rad/s. */
function integratedRaanRate(altKm: number, incDeg: number, j2: number, orbits = 20): number {
    const a = orbitalRadiusKm(altKm);
    const i = toRad(incDeg);
    const speed = Math.sqrt(MU_EARTH_KM3_S2 / a);
    let s: State6 = [a, 0, 0, 0, speed * Math.cos(i), speed * Math.sin(i)];

    const dt = 1;
    const steps = Math.round((orbits * 2 * Math.PI) / meanMotionRadPerSec(a) / dt);
    let prev = raanFromState(s);
    let unwrapped = prev;
    const base = prev;
    const ts: number[] = [];
    const ys: number[] = [];

    for (let k = 1; k <= steps; k++) {
        s = rk4Step(s, dt, j2);
        const cur = raanFromState(s);
        let delta = cur - prev;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        unwrapped += delta;
        prev = cur;
        if (k % 50 === 0) { ts.push(k * dt); ys.push(unwrapped - base); }
    }

    const n = ts.length;
    const st = ts.reduce((p, c) => p + c, 0);
    const sy = ys.reduce((p, c) => p + c, 0);
    const stt = ts.reduce((p, c) => p + c * c, 0);
    const sty = ts.reduce((p, c, k) => p + c * ys[k], 0);
    return (n * sty - st * sy) / (n * stt - st * st);
}

describe('V1 — analytic J2 secular rates vs numerical integration', () => {
    // The analytic rate is a first-order MEAN-element result; the integrator is
    // seeded with an OSCULATING circular state. Those differ at O(J₂), and since
    // Ω̇ ∝ a^(-3.5) the induced discrepancy is ~3.5·J₂ ≈ 0.4 %. That is what is
    // observed, and the scaling test below pins it as exactly that artefact
    // rather than an unexplained residual.
    it.each([
        [600, 97.8],
        [600, 51.6],
        [1200, 87.9],
    ])('agrees within 1 %% at h = %i km, i = %s°', (altKm, incDeg) => {
        const numerical = integratedRaanRate(altKm, incDeg, J2);
        const analytic = nodalRegressionRadPerSec(orbitalRadiusKm(altKm), incDeg);

        expect(Math.sign(numerical)).toBe(Math.sign(analytic));
        expect(Math.abs(numerical - analytic) / Math.abs(analytic)).toBeLessThan(0.01);
    }, 30_000);

    it('shrinks the residual in proportion to J₂, confirming it is a mean-vs-osculating artefact', () => {
        const alt = 600;
        const inc = 97.8;
        const discrepancy = (factor: number) => {
            const j2 = J2 * factor;
            const numerical = integratedRaanRate(alt, inc, j2, 10);
            const a = orbitalRadiusKm(alt);
            const analytic =
                -1.5 * meanMotionRadPerSec(a) * j2 * (J2_REFERENCE_RADIUS_KM / a) ** 2
                * Math.cos(toRad(inc));
            return Math.abs(numerical - analytic) / Math.abs(analytic);
        };

        const full = discrepancy(1);
        const half = discrepancy(0.5);
        // Halving J₂ halves the discrepancy. A formula error would not do this.
        expect(half / full).toBeGreaterThan(0.40);
        expect(half / full).toBeLessThan(0.62);
    }, 30_000);

    it('reproduces the orbital period from the integrated trajectory', () => {
        // Independent of meanMotionRadPerSec: integrate with J₂ = 0 and time the
        // return through the initial plane crossing.
        const a = orbitalRadiusKm(600);
        const speed = Math.sqrt(MU_EARTH_KM3_S2 / a);
        let s: State6 = [a, 0, 0, 0, speed, 0];
        const dt = 0.5;
        let t = 0;
        let prevY = 0;
        for (let k = 1; k < 40000; k++) {
            const next = rk4Step(s, dt, 0);
            t += dt;
            if (k > 10 && prevY < 0 && next[1] >= 0) {
                // Linear interpolation of the ascending y = 0 crossing.
                const frac = -prevY / (next[1] - prevY);
                t = t - dt + frac * dt;
                break;
            }
            prevY = next[1];
            s = next;
        }
        expect(t).toBeCloseTo((2 * Math.PI) / meanMotionRadPerSec(a), 1);
    }, 30_000);
});

// ─── V2 — the published sun-synchronous inclination table ───────────────────

// ── V1b — the argument-of-latitude rate ────────────────────────────────────

/** Osculating semi-major axis from a state vector, via vis-viva. */
function osculatingSmaKm(s: State6): number {
    const r = Math.hypot(s[0], s[1], s[2]);
    const v2 = s[3] * s[3] + s[4] * s[4] + s[5] * s[5];
    return 1 / (2 / r - v2 / MU_EARTH_KM3_S2);
}

/**
 * Least-squares secular rate of a state-derived angle, plus the run's MEAN
 * semi-major axis.
 *
 * Returning the mean `a` is what makes this oracle usable for an absolute rate
 * comparison. The integration is seeded with an *osculating* circular state at
 * radius `orbitalRadiusKm(altKm)`, but J₂'s short-period term means the
 * corresponding *mean* semi-major axis is several kilometres away — and by an
 * amount that varies with inclination, since the short-period coefficient
 * carries (1 − (3/2)sin²i). Comparing a rate computed at mean `a` against a
 * formula evaluated at the osculating seed therefore injects an
 * inclination-dependent bias, which is precisely the shape a cos²i fit is
 * trying to measure. That confound is why an earlier version of this suite
 * concluded the engine's ω̇-only u̇ was correct; GMAT later showed it was not.
 *
 * The time-average of the osculating `a` recovers the Brouwer mean `a` to first
 * order in J₂ — checked against GMAT's own Brouwer converter, where the two
 * agree to 15 m at the reference shell.
 */
function integratedAngleRate(
    altKm: number, incDeg: number, angleOf: (s: State6) => number, orbits = 30
): { rate: number; meanSmaKm: number } {
    const a = orbitalRadiusKm(altKm);
    const i = toRad(incDeg);
    const speed = Math.sqrt(MU_EARTH_KM3_S2 / a);
    let s: State6 = [a, 0, 0, 0, speed * Math.cos(i), speed * Math.sin(i)];

    const dt = 1;
    const steps = Math.round((orbits * 2 * Math.PI) / meanMotionRadPerSec(a) / dt);
    let prev = angleOf(s);
    let unwrapped = prev;
    const base = prev;
    const ts: number[] = [];
    const ys: number[] = [];
    let smaSum = osculatingSmaKm(s);
    let smaCount = 1;

    for (let k = 1; k <= steps; k++) {
        s = rk4Step(s, dt, J2);
        const cur = angleOf(s);
        let delta = cur - prev;
        while (delta > Math.PI) delta -= 2 * Math.PI;
        while (delta < -Math.PI) delta += 2 * Math.PI;
        unwrapped += delta;
        prev = cur;
        smaSum += osculatingSmaKm(s);
        smaCount++;
        if (k % 50 === 0) { ts.push(k * dt); ys.push(unwrapped - base); }
    }

    const n = ts.length;
    const st = ts.reduce((p, c) => p + c, 0);
    const sy = ys.reduce((p, c) => p + c, 0);
    const stt = ts.reduce((p, c) => p + c * c, 0);
    const sty = ts.reduce((p, c, k) => p + c * ys[k], 0);
    return {
        rate: (n * sty - st * sy) / (n * stt - st * st),
        meanSmaKm: smaSum / smaCount,
    };
}

describe('V1b — argument-of-latitude rate vs numerical integration', () => {
    // V1 validated the NODE and nothing else. Ω̇ governs how the orbit plane
    // drifts; u̇ governs where the satellite is along that plane, which is what
    // sets access times — so leaving it unchecked left the more consequential
    // rate unvalidated. This closes that gap.
    //
    // Once the oracle reports the mean semi-major axis it actually integrated
    // (see `integratedAngleRate`), the comparison can be made ABSOLUTE rather
    // than through a cos²i slope fit. That is a far stronger assertion: a slope
    // fit is blind to any constant bias, and it was the slope fit's tolerance
    // that once made an ω̇-only u̇ look correct.
    const ALT_KM = 1200;

    it('matches the engine to 1e-4 relative across inclination', () => {
        // i = 0 is excluded: the node vector, and hence the argument of latitude,
        // is undefined for an equatorial orbit.
        for (const incDeg of [15, 30, 45, 60, 75, 90]) {
            const { rate, meanSmaKm } = integratedAngleRate(ALT_KM, incDeg, argLatFromState);
            const analytic = argLatRateRadPerSec(meanSmaKm, incDeg);
            expect(Math.abs(rate - analytic) / rate).toBeLessThan(1e-4);
        }
    }, 60_000);

    it('excludes the ω̇-only form this module used before R4', () => {
        // The discarded formulation, u̇ = n + ω̇, kept the unperturbed mean motion
        // for Ṁ. It differs from the correct sum by n·γ·(0.75 − 2.25cos²i),
        // which at 87.9° is +0.057 % — small, but 500× the residual above, and
        // the direction of the error reverses below i ≈ 54.7°. Asserting that
        // the numerical oracle can TELL THE TWO APART is what stops the old form
        // from being reintroduced as a simplification.
        for (const incDeg of [30, 87.9]) {
            const { rate, meanSmaKm } = integratedAngleRate(ALT_KM, incDeg, argLatFromState);
            const n = meanMotionRadPerSec(meanSmaKm);
            const cosI = Math.cos(toRad(incDeg));
            const omegaDotOnly =
                n + 0.75 * n * J2 * (J2_REFERENCE_RADIUS_KM / meanSmaKm) ** 2
                * (5 * cosI * cosI - 1);
            const correct = argLatRateRadPerSec(meanSmaKm, incDeg);
            expect(Math.abs(rate - omegaDotOnly)).toBeGreaterThan(
                10 * Math.abs(rate - correct)
            );
        }
    }, 60_000);

    it('stays close to the Keplerian mean motion — J2 perturbs, it does not dominate', () => {
        const a = orbitalRadiusKm(ALT_KM);
        const { rate } = integratedAngleRate(ALT_KM, 87.9, argLatFromState, 20);
        expect(Math.abs(rate - meanMotionRadPerSec(a)) / meanMotionRadPerSec(a))
            .toBeLessThan(0.01);
    }, 60_000);
});

describe('V2 — sun-synchronous inclination table', () => {
    // Gate test 1 checks Ω̇ at one inclination. This inverts the relation and
    // compares the answer against the standard published SSO table across six
    // altitudes — a different question, and a much wider net.
    const SSO_RATE_RAD_S = (2 * Math.PI) / (365.2422 * 86400);

    /**
     * The inclination that makes the node track the mean Sun, at this altitude.
     *
     * `altitudeRadiusKm` is the radius the ALTITUDE is measured from, and it is
     * an explicit parameter because the two callers below genuinely need
     * different ones:
     *
     *   - the published-table comparison passes the equatorial radius, because
     *     that is the convention the published table was computed with;
     *   - the round-trip passes `EARTH_RADIUS_KM`, because that is the
     *     convention the engine uses, and the round-trip's job is to confirm
     *     the engine is self-consistent.
     *
     * The J₂ term always uses the equatorial radius, matching
     * `nodalRegressionRadPerSec`. That correspondence is required, not
     * incidental: the round-trip inverts this against that function, so a
     * mismatched J₂ radius would cancel out and turn the round-trip into a
     * tautology that passes on a wrong constant.
     */
    function ssoInclinationDeg(altKm: number, altitudeRadiusKm: number): number {
        const a = altitudeRadiusKm + altKm;
        const coefficient =
            -1.5 * meanMotionRadPerSec(a) * J2 * (J2_REFERENCE_RADIUS_KM / a) ** 2;
        return toDeg(Math.acos(SSO_RATE_RAD_S / coefficient));
    }

    it.each([
        [400, 97.0],
        [500, 97.4],
        [600, 97.8],
        [700, 98.2],
        [800, 98.6],
        [1000, 99.5],
    ])('gives i ≈ %s° at h = %i km', (altKm, published) => {
        expect(ssoInclinationDeg(altKm, J2_REFERENCE_RADIUS_KM)).toBeCloseTo(published, 1);
    });

    it('no longer shifts the table — R28 unified the two conventions', () => {
        // This test previously asserted the OPPOSITE: that measuring altitude
        // from the 6371 km mean sphere moved the sun-synchronous inclination by
        // up to ~0.03° away from the published table, and that the shift had to
        // stay visible rather than be absorbed into a tolerance.
        //
        // R28 adopted the equatorial datum, so "the engine convention" and "the
        // convention the published table was computed with" are now the same
        // computation. The assertion is inverted rather than deleted, so that
        // reintroducing a separate engine datum fails here rather than passing
        // silently.
        for (const altKm of [400, 600, 1000]) {
            const engine = ssoInclinationDeg(altKm, orbitalRadiusKm(0));
            const standard = ssoInclinationDeg(altKm, J2_REFERENCE_RADIUS_KM);
            // WGS84_A_KM and J2_REFERENCE_RADIUS_KM differ by 0.7 m by design —
            // one is the altitude datum, the other J₂'s defining radius — so
            // this is "identical to within that", not bit-identical.
            expect(Math.abs(engine - standard)).toBeLessThan(1e-5);
        }
    });

    it('round-trips: the derived inclination reproduces the sun-synchronous rate', () => {
        for (const altKm of [400, 600, 800, 1000]) {
            const a = orbitalRadiusKm(altKm);
            const rate = nodalRegressionRadPerSec(a, ssoInclinationDeg(altKm, orbitalRadiusKm(0)));
            expect(rate).toBeCloseTo(SSO_RATE_RAD_S, 12);
            // One full turn per tropical year.
            expect(toDeg(rate) * 365.2422 * 86400).toBeCloseTo(360, 6);
        }
    });
});

// ─── V3 — footprint projection vs CESIUM's WGS84 ray intersection ───────────

describe('V3 — footprint projection vs Cesium ray/ellipsoid intersection', () => {
    // R28 re-derivation, and a deliberate change of oracle.
    //
    // This used to ray-cast against a 6371 km SPHERE, written out here by hand.
    // That was independent while the implementation walked a geodesic. It no
    // longer is: `computeFootprint` is itself a ray/ellipsoid intersection, so a
    // hand-rolled ray/ellipsoid oracle would be the same algorithm twice and
    // would agree with a wrong flattening as happily as a right one — exactly
    // the correlated-oracle trap R4 was.
    //
    // Cesium's `IntersectionTests.rayEllipsoid` is a third-party implementation
    // with its own constants, already in this project's dependency tree. The
    // FOV body axes are still shared between the two sides, so this validates
    // the PROJECTION, not the FOV definition.
    const ALT_KM = 600;
    const A_KM = orbitalRadiusKm(ALT_KM);
    const sat: EciState = {
        x: A_KM, y: 0, z: 0,
        vx: 0, vy: A_KM * argLatRateRadPerSec(A_KM, 0), vz: 0,
    };

    /**
     * Cesium's ray/WGS84 intersection, in ECEF, returned as geodetic lat/lng.
     *
     * Cesium works in metres; everything here is kilometres.
     */
    const KM = 1000;
    function rayCastToGround(
        dir: { x: number; y: number; z: number },
        thetaRad: number
    ): { lat: number; lng: number } | null {
        const satEcef = eciToEcef({ x: sat.x, y: sat.y, z: sat.z }, thetaRad);
        const dirEcef = eciToEcef(dir, thetaRad);

        const origin = new Cartesian3(satEcef.x * KM, satEcef.y * KM, satEcef.z * KM);
        const direction = Cartesian3.normalize(
            new Cartesian3(dirEcef.x * KM, dirEcef.y * KM, dirEcef.z * KM),
            new Cartesian3()
        );
        const ray = new Ray(origin, direction);
        const interval = IntersectionTests.rayEllipsoid(ray, Ellipsoid.WGS84);
        if (!interval) return null;

        const hit = Ray.getPoint(ray, interval.start);
        const carto = Ellipsoid.WGS84.cartesianToCartographic(hit);
        return {
            lat: (carto.latitude * 180) / Math.PI,
            lng: (carto.longitude * 180) / Math.PI,
        };
    }

    /** LVLH basis rebuilt from the spec, not imported from the module under test. */
    function basis() {
        const rLen = Math.hypot(sat.x, sat.y, sat.z);
        const zHat = { x: -sat.x / rLen, y: -sat.y / rLen, z: -sat.z / rLen };
        const vLen = Math.hypot(sat.vx, sat.vy, sat.vz);
        const xHat = { x: sat.vx / vLen, y: sat.vy / vLen, z: sat.vz / vLen };
        const yHat = {
            x: zHat.y * xHat.z - zHat.z * xHat.y,
            y: zHat.z * xHat.x - zHat.x * xHat.z,
            z: zHat.x * xHat.y - zHat.y * xHat.x,
        };
        return { xHat, yHat, zHat };
    }

    it.each([5, 15, 30, 45, 60])(
        'lands within a metre of the ray-cast ground point (θ = %i°)',
        (halfAngleDeg) => {
            const fovSpec: FovSpec = {
                biasDeg: { alongTrack: 0, crossTrack: 0 },
                shape: 'ELLIPSE',
                halfAngle1Deg: halfAngleDeg, halfAngle2Deg: halfAngleDeg, clockingDeg: 0,
            };
            const fov = prepareFov(fovSpec);
            const fp = computeFootprint(sat, fov, EPOCH, 0)!;
            const { xHat, yHat, zHat } = basis();
            const theta = gmstRad(EPOCH);

            for (let i = 0; i < fp.boundary.length - 1; i++) {
                const phi = (i / (fp.boundary.length - 1)) * 2 * Math.PI;
                const t1 = fov.tanHalf1 * Math.cos(phi);
                const t2 = fov.tanHalf2 * Math.sin(phi);
                const body = {
                    x: fov.bHat.x + t1 * fov.u1Hat.x + t2 * fov.u2Hat.x,
                    y: fov.bHat.y + t1 * fov.u1Hat.y + t2 * fov.u2Hat.y,
                    z: fov.bHat.z + t1 * fov.u1Hat.z + t2 * fov.u2Hat.z,
                };
                const dirEci = {
                    x: body.x * xHat.x + body.y * yHat.x + body.z * zHat.x,
                    y: body.x * xHat.y + body.y * yHat.y + body.z * zHat.y,
                    z: body.x * xHat.z + body.y * yHat.z + body.z * zHat.z,
                };
                const oracle = rayCastToGround(dirEci, theta)!;
                expect(oracle).not.toBeNull();
                expect(fp.boundary[i].lat).toBeCloseTo(oracle.lat, 8);
                expect(fp.boundary[i].lng).toBeCloseTo(oracle.lng, 8);
            }
        }
    );

    it('agrees with the ray-cast on the biased boresight ground centre', () => {
        const fov = prepareFov({
            biasDeg: { alongTrack: 25, crossTrack: -10 },
            shape: 'ELLIPSE', halfAngle1Deg: 5, halfAngle2Deg: 5, clockingDeg: 0,
        });
        const fp = computeFootprint(sat, fov, EPOCH, 0)!;
        const { xHat, yHat, zHat } = basis();
        const b = fov.bHat;
        const dirEci = {
            x: b.x * xHat.x + b.y * yHat.x + b.z * zHat.x,
            y: b.x * xHat.y + b.y * yHat.y + b.z * zHat.y,
            z: b.x * xHat.z + b.y * yHat.z + b.z * zHat.z,
        };
        const oracle = rayCastToGround(dirEci, gmstRad(EPOCH))!;
        expect(fp.center.lat).toBeCloseTo(oracle.lat, 8);
        expect(fp.center.lng).toBeCloseTo(oracle.lng, 8);
    });

    it('agrees with the closed-form swath on the half-width', () => {
        // Third route to the same number: law of sines, ray-cast, geodesic walk.
        const fov = prepareFov({
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 30, clockingDeg: 0,
        });
        const fp = computeFootprint(sat, fov, EPOCH, 0)!;
        const { xHat, yHat, zHat } = basis();
        const t1 = fov.tanHalf1;
        const body = {
            x: fov.bHat.x + t1 * fov.u1Hat.x,
            y: fov.bHat.y + t1 * fov.u1Hat.y,
            z: fov.bHat.z + t1 * fov.u1Hat.z,
        };
        const dirEci = {
            x: body.x * xHat.x + body.y * yHat.x + body.z * zHat.x,
            y: body.x * xHat.y + body.y * yHat.y + body.z * zHat.y,
            z: body.x * xHat.z + body.y * yHat.z + body.z * zHat.z,
        };
        const oracle = rayCastToGround(dirEci, gmstRad(EPOCH))!;
        // The satellite is equatorial and this is the along-track edge, so the
        // arc runs along the EQUATOR — exactly a circle of radius `a`, which is
        // also the reference `halfSwathKm` is defined at. Both sides are exact
        // here; off the equator they would not be comparable at all.
        const arcRad = toRad(Math.abs(oracle.lng - fp.center.lng));
        expect(WGS84_A_KM * arcRad).toBeCloseTo(halfSwathKm(ALT_KM, 30), 3);
    });
});

// ─── V4 — interval arithmetic vs brute-force time sampling ──────────────────

describe('V4 — gap statistics vs brute-force sampling', () => {
    // The statistics come from bisected AOS/LOS, interval union and complement.
    // Brute force just asks "in view?" on a fine uniform grid and counts. The two
    // share only the containment predicate.
    const A_KM = orbitalRadiusKm(600);
    const element: OrbitalElements = {
        id: 'P00_S00', planeIndex: 0, satIndexInPlane: 0,
        semiMajorAxisKm: A_KM, inclinationDeg: 0, raanDeg: 0, argLatDeg: 0,
    };
    const target: Target = { kind: 'POINT', name: 'Equator', latDeg: 0, lonDeg: 0 };
    const fovSpec: FovSpec = {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 30, clockingDeg: 0,
    };
    const window: AnalysisWindow = { startMs: EPOCH, durationHours: 6, stepSeconds: 10 };

    function bruteForce(gridSeconds: number) {
        const fov = prepareFov(fovSpec);
        const sat = preparePropagator(element);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        const total = window.durationHours * 3600;
        const samples = Math.floor(total / gridSeconds);
        let inView = 0;
        let transitions = 0;
        let prev = false;
        for (let k = 0; k < samples; k++) {
            const t = k * gridSeconds;
            propagateState(sat, t, scratch);
            const now = isTargetInFov(scratch, targetEciAt(target, EPOCH, t), fov);
            if (now) inView++;
            if (k > 0 && now && !prev) transitions++;
            prev = now;
        }
        return { fraction: inView / samples, risingEdges: transitions };
    }

    const access = computeAccessIntervals([element], target, fovSpec, window);
    const stats = computeGapStatistics(access.intervals, window, access.warnings);

    it('agrees on the fraction of the window in view', () => {
        const brute = bruteForce(0.5);
        // Grid quantisation is ±1 sample per pass edge; with ~109 s passes and a
        // 0.5 s grid that is well under 1 % of the total in-view time.
        expect(brute.fraction).toBeCloseTo(stats.fractionInView, 4);
        expect(Math.abs(brute.fraction - stats.fractionInView) / stats.fractionInView)
            .toBeLessThan(0.01);
    });

    it('agrees on the number of passes', () => {
        const brute = bruteForce(0.5);
        // Rising edges miss a pass already open at t = 0, which the interval
        // machinery reports as a clipped interval.
        const clippedAtStart = access.intervals.filter((i) => i.clippedAtStart).length;
        expect(brute.risingEdges + clippedAtStart).toBe(stats.accessCount);
    });

    it('converges toward the interval answer as the grid is refined', () => {
        const coarse = bruteForce(4);
        const fine = bruteForce(0.25);
        const err = (f: number) => Math.abs(f - stats.fractionInView);
        expect(err(fine.fraction)).toBeLessThan(err(coarse.fraction));
    });

    it('finds every gap boundary inside a real access interval', () => {
        // Spot-check the timeline directly: the midpoint of each interval must be
        // in view, and the midpoint of each gap must not be.
        const fov = prepareFov(fovSpec);
        const sat = preparePropagator(element);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        const inViewAt = (ms: number) => {
            const t = (ms - EPOCH) / 1000;
            propagateState(sat, t, scratch);
            return isTargetInFov(scratch, targetEciAt(target, EPOCH, t), fov);
        };

        for (const iv of access.intervals) {
            expect(inViewAt((iv.startMs + iv.endMs) / 2)).toBe(true);
            // Just outside each unclipped edge must be out of view.
            if (!iv.clippedAtStart) expect(inViewAt(iv.startMs - 2000)).toBe(false);
            if (!iv.clippedAtEnd) expect(inViewAt(iv.endMs + 2000)).toBe(false);
        }
    });
});

// ─── V5 — containment vs a direct off-nadir angle test ─────────────────────

describe('V5 — LVLH tangent containment vs a direct angle test', () => {
    // For an unbiased cone the access condition needs no frame at all: the target
    // is in view when the angle between the nadir direction and the line of sight
    // is at most θ. That oracle touches none of the LVLH construction, the
    // clocking, or the tangent-space algebra.
    function directConeTest(sat: EciState, target: { x: number; y: number; z: number }, thetaDeg: number) {
        const rLen = Math.hypot(sat.x, sat.y, sat.z);
        const nadir = { x: -sat.x / rLen, y: -sat.y / rLen, z: -sat.z / rLen };
        const d = { x: target.x - sat.x, y: target.y - sat.y, z: target.z - sat.z };
        const dLen = Math.hypot(d.x, d.y, d.z);
        const cosAngle = (d.x * nadir.x + d.y * nadir.y + d.z * nadir.z) / dLen;
        const angleDeg = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAngle))));
        // Above the target's horizon, and inside the cone.
        // R28: the horizon is the plane perpendicular to the ELLIPSOID NORMAL
        // at the target, not to its radius vector. On a sphere those coincide,
        // which is why `d · target < 0` used to serve; on the ellipsoid they
        // differ by the deflection of the vertical, up to 0.19°, and the old
        // form silently mislabels grazing geometry.
        //
        // The normal at a surface point is (x/a², y/a², z/b²). It is computed
        // from the ECI components directly: Earth rotation is about z, and a
        // rotation about z commutes with diag(1/a², 1/a², 1/b²), so the form is
        // the same in either frame.
        const bSq = (WGS84_A_KM * (1 - 1 / 298.257223563)) ** 2;
        const aSq = WGS84_A_KM * WGS84_A_KM;
        const nx = target.x / aSq;
        const ny = target.y / aSq;
        const nz = target.z / bSq;
        const aboveHorizon = d.x * nx + d.y * ny + d.z * nz < 0;
        return aboveHorizon && angleDeg <= thetaDeg;
    }

    /** Deterministic LCG, so a failure is always reproducible. */
    function lcg(seed: number) {
        let s = seed >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    it('agrees on 20 000 randomised satellite/target/time combinations', () => {
        const rand = lcg(20260806);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        let checked = 0;
        let inViewCount = 0;

        for (let trial = 0; trial < 20000; trial++) {
            const altKm = 400 + rand() * 1000;
            const incDeg = rand() * 180;
            const thetaDeg = 2 + rand() * 55;
            const element: OrbitalElements = {
                id: 'X', planeIndex: 0, satIndexInPlane: 0,
                semiMajorAxisKm: orbitalRadiusKm(altKm),
                inclinationDeg: incDeg,
                raanDeg: rand() * 360,
                argLatDeg: rand() * 360,
            };
            const target: Target = {
                kind: 'POINT', name: 'T',
                latDeg: toDeg(Math.asin(2 * rand() - 1)),
                lonDeg: rand() * 360 - 180,
            };
            const t = rand() * 86400;

            propagateState(preparePropagator(element), t, scratch);
            const targetEci = targetEciAt(target, EPOCH, t);
            const fov = prepareFov({
                biasDeg: { alongTrack: 0, crossTrack: 0 },
                shape: 'ELLIPSE',
                halfAngle1Deg: thetaDeg, halfAngle2Deg: thetaDeg, clockingDeg: 0,
            });

            const engine = isTargetInFov(scratch, targetEci, fov);
            const oracle = directConeTest(scratch, targetEci, thetaDeg);

            // Skip the measure-zero band where the two disagree only by rounding.
            const rLen = Math.hypot(scratch.x, scratch.y, scratch.z);
            const nadir = { x: -scratch.x / rLen, y: -scratch.y / rLen, z: -scratch.z / rLen };
            const d = {
                x: targetEci.x - scratch.x, y: targetEci.y - scratch.y, z: targetEci.z - scratch.z,
            };
            const dLen = Math.hypot(d.x, d.y, d.z);
            const angleDeg = toDeg(Math.acos(Math.max(-1, Math.min(1,
                (d.x * nadir.x + d.y * nadir.y + d.z * nadir.z) / dLen))));
            if (Math.abs(angleDeg - thetaDeg) < 1e-9) continue;

            checked++;
            if (engine) inViewCount++;
            expect(engine).toBe(oracle);
        }

        // Guard against a vacuous pass: the sample must exercise both outcomes.
        // A random satellite sees a random ground point only rarely — roughly
        // half a percent here — so the in-view floor is deliberately low.
        expect(checked).toBeGreaterThan(19000);
        expect(inViewCount).toBeGreaterThan(50);
        expect(inViewCount).toBeLessThan(checked - 50);
    });

    it('agrees on 5 000 targets placed deliberately either side of the FOV edge', () => {
        // Uniform random sampling almost never lands near the boundary, which is
        // exactly where a frame or metric error would show. This places every
        // target at the closed-form limit ± 0.1 %, so each trial is a boundary
        // test rather than a bulk one.
        const rand = lcg(884422);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        let inside = 0;
        let outside = 0;

        for (let trial = 0; trial < 5000; trial++) {
            const altKm = 400 + rand() * 1000;
            const a = orbitalRadiusKm(altKm);
            const thetaDeg = 2 + rand() * 55;
            const element: OrbitalElements = {
                id: 'X', planeIndex: 0, satIndexInPlane: 0,
                semiMajorAxisKm: a,
                inclinationDeg: rand() * 180,
                raanDeg: rand() * 360,
                argLatDeg: rand() * 360,
            };
            propagateState(preparePropagator(element), rand() * 86400, scratch);

            // Build a ground point at a chosen central angle from the sub-satellite
            // point, in a random azimuth — independent of the LVLH frame.
            const rLen = Math.hypot(scratch.x, scratch.y, scratch.z);
            const sub = { x: scratch.x / rLen, y: scratch.y / rLen, z: scratch.z / rLen };
            let ref = Math.abs(sub.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
            let e1 = {
                x: ref.y * sub.z - ref.z * sub.y,
                y: ref.z * sub.x - ref.x * sub.z,
                z: ref.x * sub.y - ref.y * sub.x,
            };
            const e1Len = Math.hypot(e1.x, e1.y, e1.z);
            e1 = { x: e1.x / e1Len, y: e1.y / e1Len, z: e1.z / e1Len };
            const e2 = {
                x: sub.y * e1.z - sub.z * e1.y,
                y: sub.z * e1.x - sub.x * e1.z,
                z: sub.x * e1.y - sub.y * e1.x,
            };
            const az = rand() * 2 * Math.PI;
            const axis = {
                x: e1.x * Math.cos(az) + e2.x * Math.sin(az),
                y: e1.y * Math.cos(az) + e2.y * Math.sin(az),
                z: e1.z * Math.cos(az) + e2.z * Math.sin(az),
            };

            // R28 re-derivation. The target must sit ON THE ELLIPSOID, and the
            // central angle at which the FOV edge falls is no longer the
            // closed-form spherical arc — it depends on azimuth, because the
            // ground curvature does.
            //
            // So the boundary is FOUND rather than assumed: bisect the central
            // angle for the point whose true look angle is exactly thetaDeg,
            // then place the trial at ±0.1 % of it. `surfacePoint` scales a unit
            // direction out to the ellipsoid, from the ellipsoid equation.
            const surfacePoint = (arcRad: number) => {
                const c = Math.cos(arcRad);
                const sn = Math.sin(arcRad);
                const ux = sub.x * c + axis.x * sn;
                const uy = sub.y * c + axis.y * sn;
                const uz = sub.z * c + axis.z * sn;
                const bSq = (WGS84_A_KM * (1 - 1 / 298.257223563)) ** 2;
                const aSq = WGS84_A_KM * WGS84_A_KM;
                const r = 1 / Math.sqrt((ux * ux) / aSq + (uy * uy) / aSq + (uz * uz) / bSq);
                return { x: r * ux, y: r * uy, z: r * uz };
            };
            const lookDeg = (arcRad: number) => {
                const q = surfacePoint(arcRad);
                const dx = q.x - scratch.x;
                const dy = q.y - scratch.y;
                const dz = q.z - scratch.z;
                const dl = Math.hypot(dx, dy, dz);
                const sl = Math.hypot(scratch.x, scratch.y, scratch.z);
                const cosv = -(dx * scratch.x + dy * scratch.y + dz * scratch.z) / (dl * sl);
                return toDeg(Math.acos(Math.max(-1, Math.min(1, cosv))));
            };

            let lo = 0;
            let hi = groundArcRad(a, toRad(thetaDeg)).arcRad * 1.5;
            // The bracket must straddle the root. Near the limb the look angle
            // stops increasing, so `hi` can fail to reach thetaDeg; skip those
            // trials rather than bisecting toward a root that is not there.
            if (lookDeg(hi) < thetaDeg) continue;
            for (let i = 0; i < 60; i++) {
                const mid = (lo + hi) / 2;
                if (lookDeg(mid) < thetaDeg) lo = mid; else hi = mid;
            }
            const limitRad = (lo + hi) / 2;
            if (Math.abs(lookDeg(limitRad) - thetaDeg) > 1e-6) continue;

            const wantInside = rand() < 0.5;
            const targetEci = surfacePoint(limitRad * (wantInside ? 0.999 : 1.001));

            const fov = prepareFov({
                biasDeg: { alongTrack: 0, crossTrack: 0 },
                shape: 'ELLIPSE',
                halfAngle1Deg: thetaDeg, halfAngle2Deg: thetaDeg, clockingDeg: 0,
            });

            expect(isTargetInFov(scratch, targetEci, fov)).toBe(wantInside);
            expect(directConeTest(scratch, targetEci, thetaDeg)).toBe(wantInside);
            if (wantInside) inside++; else outside++;
        }

        expect(inside).toBeGreaterThan(2000);
        expect(outside).toBeGreaterThan(2000);
    });

    it('agrees on the rectangle degenerating to a square cone at zero clocking', () => {
        // A rectangle whose half-angles are equal is NOT a cone — its corners
        // reach further. The oracle here is the analytic corner angle.
        const A_KM = orbitalRadiusKm(600);
        const sat: EciState = {
            x: A_KM, y: 0, z: 0, vx: 0, vy: A_KM * argLatRateRadPerSec(A_KM, 0), vz: 0,
        };
        const fov = prepareFov({
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'RECTANGLE', halfAngle1Deg: 10, halfAngle2Deg: 10, clockingDeg: 0,
        });
        const fp = computeFootprint(sat, fov, EPOCH, 0, 48)!;
        const cornerEta = toDeg(Math.atan(Math.hypot(Math.tan(toRad(10)), Math.tan(toRad(10)))));
        expect(cornerEta).toBeGreaterThan(10);

        // Asserted as a LOOK ANGLE. A haversine distance on a 6371 km sphere
        // compared against an equatorial reference figure would be measuring two
        // different surfaces; the corner angle is the property the rectangle
        // actually defines.
        const satEcef = eciToEcef({ x: sat.x, y: sat.y, z: sat.z }, gmstRad(EPOCH));
        const sLen = Math.hypot(satEcef.x, satEcef.y, satEcef.z);
        const angles = fp.boundary.map((p) => {
            const g = geodeticToEcef(p.lat, p.lng, 0);
            const dx = g.x - satEcef.x;
            const dy = g.y - satEcef.y;
            const dz = g.z - satEcef.z;
            const dl = Math.hypot(dx, dy, dz);
            const cosv = -(dx * satEcef.x + dy * satEcef.y + dz * satEcef.z) / (dl * sLen);
            return toDeg(Math.acos(Math.max(-1, Math.min(1, cosv))));
        });
        expect(Math.max(...angles)).toBeCloseTo(cornerEta, 6);
    });
});
