import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { v3, toRad, toDeg } from '../../../utils/sphericalGeometry';
import {
    evaluateContainment, isTargetInFov, prepareFov, targetEciAt,
} from '../fov/containment';
import { groundArcRad } from '../fov/footprint';
import { argLatRateRadPerSec, geodeticToEcef, gmstRad } from '../propagation/keplerJ2';
import type { EciState, FovSpec } from '../domain/types';

const ALT_KM = 600;
const A_KM = EARTH_RADIUS_KM + ALT_KM;

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
    const d = toRad(deltaDeg);
    return v3(EARTH_RADIUS_KM * Math.cos(d), EARTH_RADIUS_KM * Math.sin(d), 0);
}

/** A ground point `deltaDeg` off to the cross-track side of the sub-satellite point. */
function targetCrossTrack(deltaDeg: number) {
    const d = toRad(deltaDeg);
    return v3(EARTH_RADIUS_KM * Math.cos(d), 0, EARTH_RADIUS_KM * Math.sin(d));
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

    it('is rotationally symmetric — the cross-track limit equals the along-track one', () => {
        const sat = equatorialSat();
        const fov = prepareFov(cone(30));
        const limitDeg = toDeg(groundArcRad(A_KM, toRad(30)).arcRad);

        expect(isTargetInFov(sat, targetCrossTrack(limitDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(limitDeg * 1.001), fov)).toBe(false);
        expect(isTargetInFov(sat, targetCrossTrack(-limitDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetCrossTrack(-limitDeg * 1.001), fov)).toBe(false);
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
        const horizonDeg = 90 - toDeg(Math.asin(EARTH_RADIUS_KM / A_KM));
        const fov = prepareFov(cone(89));
        expect(isTargetInFov(sat, targetAlongTrack(horizonDeg * 0.999), fov)).toBe(true);
        expect(isTargetInFov(sat, targetAlongTrack(horizonDeg * 1.001), fov)).toBe(false);
    });

    it('reports elevation crossing zero at the horizon', () => {
        const sat = equatorialSat();
        const horizonDeg = 90 - toDeg(Math.asin(EARTH_RADIUS_KM / A_KM));
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
            EARTH_RADIUS_KM * Math.cos(d1) * Math.cos(d2),
            EARTH_RADIUS_KM * Math.sin(d1),
            EARTH_RADIUS_KM * Math.cos(d1) * Math.sin(d2),
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

    it('keeps the target on the sphere as the Earth turns', () => {
        const target = { kind: 'POINT' as const, name: 'T', latDeg: 20, lonDeg: 100 };
        const epochMs = Date.UTC(2026, 7, 6);
        for (const t of [0, 3600, 43200, 86400]) {
            const p = targetEciAt(target, epochMs, t);
            expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(EARTH_RADIUS_KM, 9);
        }
    });

    it('honours a target altitude', () => {
        const p = targetEciAt(
            { kind: 'POINT', name: 'T', latDeg: 0, lonDeg: 0, altitudeKm: 2 }, 0, 0
        );
        expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(EARTH_RADIUS_KM + 2, 9);
    });
});
