import { describe, expect, it } from 'vitest';
import { WGS84_A_KM, WGS84_E2, orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { v3, toRad, toDeg } from '../../../utils/sphericalGeometry';
import {
    earthRotationGrid, evaluateContainment, isTargetInFov, prepareFov, targetEciAt, targetTrack,
} from '../fov/containment';
import { groundArcRad } from '../fov/footprint';
import { argLatRateRadPerSec, geodeticToEcef, gmstRad } from '../propagation/keplerJ2';
import type { EciState, FovSpec } from '../domain/types';

const ALT_KM = 600;
const A_KM = orbitalRadiusKm(ALT_KM);

/**
 * R28 re-derivation note.
 *
 * The ground is now the WGS84 ellipsoid. That does NOT weaken these oracles,
 * because they are built on the equator, and the ellipsoid's equatorial
 * cross-section is EXACTLY a circle of radius `a`. Every along-track case below
 * therefore keeps its exact closed form, with `a` in place of the old 6371.
 *
 * The cross-track cases are different: they run along a MERIDIAN, which is an
 * ellipse. Those are re-derived from the ellipse itself (`meridianPoint`) with
 * the expected look angle taken straight from the vectors, rather than from a
 * spherical arc relation that is no longer true off the equator.
 */

/**
 * An equatorial satellite at ECI (a, 0, 0) moving toward +Y.
 * Its LVLH frame is then: ẑ (nadir) = (−1,0,0), x̂ (along-track) = (0,1,0),
 * ŷ (cross-track) = (0,0,−1).
 */
function equatorialSat(): EciState {
    const speed = A_KM * argLatRateRadPerSec(A_KM, 0);
    return { x: A_KM, y: 0, z: 0, vx: 0, vy: speed, vz: 0 };
}

/** A ground point on the equator, `deltaDeg` ahead of the sub-satellite point. */
function targetAlongTrack(deltaDeg: number) {
    // On the equator, exactly: x² + y² = a², z = 0.
    const d = toRad(deltaDeg);
    return v3(WGS84_A_KM * Math.cos(d), WGS84_A_KM * Math.sin(d), 0);
}

/**
 * A surface point on the x–z meridian at GEODETIC latitude `latDeg`.
 *
 * Written from the ellipse's own parametrisation — N = a/√(1−e²sin²φ), then
 * (N cosφ, 0, N(1−e²) sinφ) — not by calling the module under test.
 */
function meridianPoint(latDeg: number) {
    const phi = toRad(latDeg);
    const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) * Math.sin(phi));
    return v3(n * Math.cos(phi), 0, n * (1 - WGS84_E2) * Math.sin(phi));
}

/** Off-nadir angle from an equatorial satellite at (A,0,0) to a target, degrees. */
function lookAngleDeg(target: { x: number; y: number; z: number }): number {
    const dx = target.x - A_KM;
    const dy = target.y;
    const dz = target.z;
    const len = Math.hypot(dx, dy, dz);
    // Nadir from (A,0,0) is (−1,0,0); the look angle is the angle between them.
    return toDeg(Math.acos(-dx / len));
}

/** A ground point `deltaDeg` off to the cross-track side of the sub-satellite point. */
function targetCrossTrack(deltaDeg: number) {
    return meridianPoint(deltaDeg);
}

const cone = (halfAngleDeg: number): FovSpec => ({
    biasDeg: { alongTrack: 0, crossTrack: 0 },
    shape: 'ELLIPSE',
    halfAngle1Deg: halfAngleDeg,
    halfAngle2Deg: halfAngleDeg,
    clockingDeg: 0,
});

// ─── EXIT GATE 5 — analytic single-satellite case ───────────────────────────
describe('containment — closed-form conical FOV', () => {
    // For a nadir-pointing cone of half-angle θ the access condition is exactly
    // "central angle ≤ λ(θ)", where λ comes from the law of sines in the
    // Earth-centre / satellite / ground-point triangle:
    //     sin(η + λ) = (r/R_e)·sin η
    // `groundArcRad` derives that independently of the LVLH tangent algebra in
    // `isTargetInFov`, so agreement between the two is a real cross-check.

    it.each([10, 20, 30, 45, 60])(
        'switches from in-view to out-of-view exactly at the closed-form limit (θ = %i°)',
        (thetaDeg) => {
            const sat = equatorialSat();
            const fov = prepareFov(cone(thetaDeg));
            const limitDeg = toDeg(groundArcRad(A_KM, toRad(thetaDeg)).arcRad);

            expect(isTargetInFov(sat, targetAlongTrack(limitDeg * 0.999), fov)).toBe(true);
            expect(isTargetInFov(sat, targetAlongTrack(limitDeg * 1.001), fov)).toBe(false);
            expect(isTargetInFov(sat, targetAlongTrack(-limitDeg * 0.999), fov)).toBe(true);
            expect(isTargetInFov(sat, targetAlongTrack(-limitDeg * 1.001), fov)).toBe(false);
        }
    );

    it('is rotationally symmetric in LOOK ANGLE, which is the cone\'s own property', () => {
        // R28 changed what this test can assert, and the distinction is real.
        //
        // A conical FOV is rotationally symmetric about its boresight, so the
        // limit is the same 30° of LOOK ANGLE in every azimuth. It is NOT the
        // same ground arc: along-track runs along the equator (curvature 1/a),
        // cross-track runs along a meridian (curvature varying with latitude),
        // so equal look angles subtend unequal ground angles on an ellipsoid.
        // On a sphere the two coincided, which is why the old form worked.
        //
        // Asserting the ground arc here would now be asserting that the Earth
        // is round. So the symmetry is tested where it actually lives.
        const sat = equatorialSat();
        const fov = prepareFov(cone(30));

        // Bisect the meridian for the geodetic latitude at which the look angle
        // reaches 30°, using only the ellipse and vector algebra.
        let lo = 0;
        let hi = 40;
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (lookAngleDeg(meridianPoint(mid)) < 30) lo = mid; else hi = mid;
        }
        const crossLimitDeg = (lo + hi) / 2;
        expect(lookAngleDeg(meridianPoint(crossLimitDeg))).toBeCloseTo(30, 6);

        expect(isTargetInFov(sat, targetCrossTrack(crossLimitDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(crossLimitDeg * 1.001), fov)).toBe(false);
        expect(isTargetInFov(sat, targetCrossTrack(-crossLimitDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(-crossLimitDeg * 1.001), fov)).toBe(false);

        // And the ground arcs genuinely differ, which is the substance of the
        // change rather than an artefact of it.
        const alongLimitDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);
        expect(Math.abs(crossLimitDeg - alongLimitDeg)).toBeGreaterThan(1e-4);
    });

    it('reports the off-boresight angle as exactly the half-angle at the limit', () => {
        const sat = equatorialSat();
        const fov = prepareFov(cone(30));
        const limitDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);
        const detail = evaluateContainment(sat, targetAlongTrack(limitDeg), fov);
        expect(detail.offBoresightDeg).toBeCloseTo(30, 6);
    });

    it('sees the sub-satellite point at zero off-nadir and 90° elevation', () => {
        const sat = equatorialSat();
        const detail = evaluateContainment(sat, targetAlongTrack(0), prepareFov(cone(5)));
        expect(detail.inView).toBe(true);
        expect(detail.offBoresightDeg).toBeCloseTo(0, 9);
        expect(detail.elevationDeg).toBeCloseTo(90, 6);
        expect(detail.slantRangeKm).toBeCloseTo(ALT_KM, 6);
    });
});

describe('containment — horizon', () => {
    it('rejects a target on the far side of the Earth even with a 90° FOV', () => {
        const sat = equatorialSat();
        const fov = prepareFov(cone(89));
        expect(isTargetInFov(sat, targetAlongTrack(150), fov)).toBe(false);
        expect(evaluateContainment(sat, targetAlongTrack(150), fov).aboveHorizon).toBe(false);
    });

    it('places the geometric horizon at 90° − asin(R_e/r) of central angle', () => {
        const sat = equatorialSat();
        const horizonDeg = 90 - toDeg(Math.asin(WGS84_A_KM / A_KM));
        const fov = prepareFov(cone(89));
        expect(isTargetInFov(sat, targetAlongTrack(horizonDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetAlongTrack(horizonDeg * 1.001), fov)).toBe(false);
    });

    it('reports elevation crossing zero at the horizon', () => {
        const sat = equatorialSat();
        const horizonDeg = 90 - toDeg(Math.asin(WGS84_A_KM / A_KM));
        const detail = evaluateContainment(sat, targetAlongTrack(horizonDeg), prepareFov(cone(89)));
        expect(detail.elevationDeg).toBeCloseTo(0, 6);
    });
});

describe('containment — boresight bias', () => {
    it('an along-track bias moves the centre of view forward by that look angle', () => {
        const sat = equatorialSat();
        const fov = prepareFov({ ...cone(2), biasDeg: { alongTrack: 30, crossTrack: 0 } });
        // The biased boresight looks 30° off nadir forward, hitting the ground
        // at the same arc the closed form gives for η = 30°.
        const centreDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);
        expect(isTargetInFov(sat, targetAlongTrack(centreDeg), fov)).toBe(true);
        expect(isTargetInFov(sat, targetAlongTrack(0), fov)).toBe(false);
        expect(evaluateContainment(sat, targetAlongTrack(centreDeg), fov).offBoresightDeg)
            .toBeCloseTo(0, 6);
    });

    it('a negative along-track bias looks backward', () => {
        const sat = equatorialSat();
        const fov = prepareFov({ ...cone(2), biasDeg: { alongTrack: -30, crossTrack: 0 } });
        const centreDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);
        expect(isTargetInFov(sat, targetAlongTrack(-centreDeg), fov)).toBe(true);
        expect(isTargetInFov(sat, targetAlongTrack(centreDeg), fov)).toBe(false);
    });

    it('a cross-track bias moves the centre of view to the +Y side', () => {
        const sat = equatorialSat();
        const fov = prepareFov({ ...cone(2), biasDeg: { alongTrack: 0, crossTrack: 30 } });
        const centreDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);
        // +ŷ_body is −Z_eci for this satellite, so the target sits at negative z.
        expect(isTargetInFov(sat, targetCrossTrack(-centreDeg), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(centreDeg), fov)).toBe(false);
    });
});

describe('containment — rectangle and clocking', () => {
    const rect = (h1: number, h2: number, clock: number): FovSpec => ({
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'RECTANGLE',
        halfAngle1Deg: h1,
        halfAngle2Deg: h2,
        clockingDeg: clock,
    });

    it('accepts the corner of a rectangle, which an inscribed ellipse would reject', () => {
        const sat = equatorialSat();
        const along = toDeg(groundArcRad(A_KM, toRad(9.5)).arcRad);
        const across = toDeg(groundArcRad(A_KM, toRad(9.5)).arcRad);
        // Build a target offset diagonally, inside the 10°×10° box but outside
        // the inscribed 10° cone.
        const d1 = toRad(along), d2 = toRad(across);
        const corner = v3(
            WGS84_A_KM * Math.cos(d1) * Math.cos(d2),
            WGS84_A_KM * Math.sin(d1),
            WGS84_A_KM * Math.cos(d1) * Math.sin(d2),
        );
        expect(isTargetInFov(sat, corner, prepareFov(rect(10, 10, 0)))).toBe(true);
        expect(isTargetInFov(sat, corner, prepareFov(cone(10)))).toBe(false);
    });

    it('is wide along-track and narrow cross-track at zero clocking', () => {
        const sat = equatorialSat();
        const fov = prepareFov(rect(20, 3, 0));
        const wide = toDeg(groundArcRad(A_KM, toRad(15)).arcRad);
        expect(isTargetInFov(sat, targetAlongTrack(wide), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(wide), fov)).toBe(false);
    });

    it('swaps the wide axis when clocked by 90°', () => {
        const sat = equatorialSat();
        const fov = prepareFov(rect(20, 3, 90));
        const wide = toDeg(groundArcRad(A_KM, toRad(15)).arcRad);
        expect(isTargetInFov(sat, targetAlongTrack(wide), fov)).toBe(false);
        expect(isTargetInFov(sat, targetCrossTrack(wide), fov)).toBe(true);
    });

    it('is unchanged by a 180° clocking, the shape being centrally symmetric', () => {
        const sat = equatorialSat();
        const a = prepareFov(rect(20, 3, 0));
        const b = prepareFov(rect(20, 3, 180));
        for (const d of [-10, -5, 0, 5, 10]) {
            expect(isTargetInFov(sat, targetAlongTrack(d), a))
                .toBe(isTargetInFov(sat, targetAlongTrack(d), b));
            expect(isTargetInFov(sat, targetCrossTrack(d), a))
                .toBe(isTargetInFov(sat, targetCrossTrack(d), b));
        }
    });

    it('reports α along-track and β cross-track at zero clocking', () => {
        const sat = equatorialSat();
        const fov = prepareFov(rect(30, 30, 0));
        const alongDetail = evaluateContainment(sat, targetAlongTrack(5), fov);
        expect(alongDetail.alphaDeg).toBeGreaterThan(0);
        expect(alongDetail.betaDeg).toBeCloseTo(0, 9);

        const crossDetail = evaluateContainment(sat, targetCrossTrack(5), fov);
        expect(crossDetail.alphaDeg).toBeCloseTo(0, 9);
        expect(crossDetail.betaDeg).not.toBeCloseTo(0, 6);
    });
});

describe('containment — elevation mask', () => {
    it('applies the mask on top of FOV containment', () => {
        const sat = equatorialSat();
        const wide = prepareFov(cone(60));
        const masked = prepareFov({ ...cone(60), minElevationDeg: 40 });
        // A target far off nadir is inside the wide cone but low on the horizon.
        // At 10° central angle the look angle is ~57.8° and the elevation ~22°,
        // so it clears the 60° cone and fails a 40° mask.
        const far = targetAlongTrack(10);
        expect(isTargetInFov(sat, far, wide)).toBe(true);
        expect(evaluateContainment(sat, far, wide).elevationDeg).toBeLessThan(40);
        expect(isTargetInFov(sat, far, masked)).toBe(false);
    });

    it('leaves a high-elevation target alone', () => {
        const sat = equatorialSat();
        const masked = prepareFov({ ...cone(60), minElevationDeg: 40 });
        expect(isTargetInFov(sat, targetAlongTrack(0), masked)).toBe(true);
    });

    it('uses the ellipsoid normal at a grazing mid-latitude horizon', () => {
        // At 45° the WGS84 normal is ~0.19° poleward of the radius vector.
        // A 0.05°-elevation northward LOS is therefore above the true local
        // horizon while the old radial test classifies it as below.
        const target = meridianPoint(45);
        const phi = toRad(45);
        const up = v3(Math.cos(phi), 0, Math.sin(phi));
        const north = v3(-Math.sin(phi), 0, Math.cos(phi));
        const elevation = toRad(0.05);
        const los = v3(
            north.x * Math.cos(elevation) + up.x * Math.sin(elevation),
            0,
            north.z * Math.cos(elevation) + up.z * Math.sin(elevation),
        );
        const rangeKm = 1000;
        const sat: EciState = {
            x: target.x + rangeKm * los.x,
            y: 0,
            z: target.z + rangeKm * los.z,
            vx: 0,
            vy: 7,
            vz: 0,
        };
        const d = v3(target.x - sat.x, target.y - sat.y, target.z - sat.z);

        // Proves this fixture discriminates the implementation we replaced.
        expect(d.x * target.x + d.y * target.y + d.z * target.z).toBeGreaterThan(0);

        const wide = prepareFov(cone(89));
        const detail = evaluateContainment(sat, target, wide);
        expect(detail.aboveHorizon).toBe(true);
        expect(detail.elevationDeg).toBeCloseTo(0.05, 6);
        expect(isTargetInFov(sat, target, wide)).toBe(true);
    });
});

describe('containment — target in ECI', () => {
    it('places a target at the epoch GMST rotation of its ECEF position', () => {
        const epochMs = Date.UTC(2026, 7, 6, 12);
        const eci = targetEciAt(
            { kind: 'POINT', name: 'London', latDeg: 51.5, lonDeg: -0.13 }, epochMs, 0
        );
        const ecef = geodeticToEcef(51.5, -0.13);
        const theta = gmstRad(epochMs);
        expect(eci.x).toBeCloseTo(ecef.x * Math.cos(theta) - ecef.y * Math.sin(theta), 9);
        expect(eci.y).toBeCloseTo(ecef.x * Math.sin(theta) + ecef.y * Math.cos(theta), 9);
        expect(eci.z).toBeCloseTo(ecef.z, 12);
    });

    it('keeps the target on the ELLIPSOID as the Earth turns', () => {
        // Independent expectation: the geocentric radius at geodetic latitude φ
        // on the WGS84 ellipsoid, from the ellipse parametrisation. Not a
        // constant any more — that was the spherical model's signature.
        const latDeg = 20;
        const phi = toRad(latDeg);
        const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * Math.sin(phi) * Math.sin(phi));
        const expectedRadius = Math.hypot(
            n * Math.cos(phi),
            n * (1 - WGS84_E2) * Math.sin(phi),
        );
        // Sanity: strictly between the polar and equatorial radii.
        expect(expectedRadius).toBeLessThan(WGS84_A_KM);
        expect(expectedRadius).toBeGreaterThan(WGS84_A_KM * (1 - 1 / 298.257223563));

        const target = { kind: 'POINT' as const, name: 'T', latDeg, lonDeg: 100 };
        const epochMs = Date.UTC(2026, 7, 6);
        for (const t of [0, 3600, 43200, 86400]) {
            const p = targetEciAt(target, epochMs, t);
            // Earth rotation is a rotation: it cannot change the radius.
            expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(expectedRadius, 9);
        }
    });

    it('honours a target altitude above the ellipsoid', () => {
        // Chosen on the equator, where the ellipsoid normal is radial, so the
        // expected radius is exactly a + h with no approximation.
        const p = targetEciAt(
            { kind: 'POINT', name: 'T', latDeg: 0, lonDeg: 0, altitudeKm: 2 }, 0, 0
        );
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(WGS84_A_KM + 2, 9);
    });
});

/*
 * The rotation grid depends on the window, never on the target, so the area
 * path shares one across a whole batch of cells. Sharing must change nothing —
 * and the shared table must not become a silent source of NaN when a caller
 * asks for a sample past its end.
 */
describe('targetTrack — shared Earth-rotation grid', () => {
    const EPOCH = Date.UTC(2026, 7, 6);
    const STEP = 10;
    const DURATION = 3600;
    const a = { kind: 'POINT' as const, name: 'A', latDeg: 45, lonDeg: 3 };
    const b = { kind: 'POINT' as const, name: 'B', latDeg: -12, lonDeg: 175, altitudeKm: 1.2 };

    it('gives the same samples shared as it does private', () => {
        const grid = earthRotationGrid(EPOCH, STEP, DURATION);
        for (const target of [a, b]) {
            const shared = targetTrack(target, EPOCH, STEP, DURATION, grid);
            const own = targetTrack(target, EPOCH, STEP, DURATION);
            for (const index of [0, 1, 17, 180, 360]) {
                const s = { ...shared.atStep(index) };
                const o = own.atStep(index);
                // Bit-identical, not merely close: this is the same expression
                // evaluated from the same table.
                expect(s).toEqual({ x: o.x, y: o.y, z: o.z });
                // And still the value the original path produces.
                const reference = targetEciAt(target, EPOCH, Math.min(index * STEP, DURATION));
                expect(s.x).toBe(reference.x);
                expect(s.y).toBe(reference.y);
                expect(s.z).toBe(reference.z);
            }
        }
    });

    /*
     * A grid built for a shorter run used to be read out of bounds, yielding
     * `undefined` cos/sin and NaN coordinates — which `isTargetInFov` reports as
     * "not in view" rather than as an error, so a whole area could have come
     * back never observed with nothing raised.
     */
    it('evaluates directly past the end of the table instead of returning NaN', () => {
        const short = earthRotationGrid(EPOCH, STEP, DURATION);
        const track = targetTrack(a, EPOCH, STEP, DURATION, short);
        const beyond = track.atStep(short.stepCount + 25);
        expect(Number.isFinite(beyond.x)).toBe(true);
        expect(Number.isFinite(beyond.y)).toBe(true);
        // Clamped to the window's end, exactly as the tabulated path clamps it.
        const reference = targetEciAt(a, EPOCH, DURATION);
        expect(beyond.x).toBe(reference.x);
        expect(beyond.y).toBe(reference.y);
    });
});
