import { describe, expect, it } from 'vitest';
import { WGS84_A_KM, orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toRad, toDeg, v3 } from '../../../utils/sphericalGeometry';
import {
    DEFAULT_FOOTPRINT_SAMPLES, computeFootprint, groundArcRad,
    halfSwathKm, horizonOffNadirDeg, maskLimbRad,
} from '../fov/footprint';
import { swathWidthDeg } from '../domain/areaTarget';
import { prepareFov } from '../fov/containment';
import { argLatRateRadPerSec, earthRotationRad, eciToEcef, geodeticToEcef } from '../propagation/keplerJ2';
import type { EciState, FovSpec } from '../domain/types';

// ─── EXIT GATE 2 — swath table ──────────────────────────────────────────────
describe('footprint — the swath table', () => {
    // From `sin η = (R_e/r)·cos ε`, `λ = 90° − η − ε`, swath width = 2·R_e·λ.
    // These are the design note §4.3 figures, and they reproduce EXACTLY on the
    // spherical Earth at R = 6371 km that ADR-001 §2 mandates.
    const expected: Record<number, [number, number, number]> = {
        500: [269, 585, 1044],
        600: [323, 704, 1265],
        700: [377, 824, 1490],
    };

    it.each([500, 600, 700])('reproduces the swath widths at h = %i km', (h) => {
        const widths = [15, 30, 45].map((eta) => 2 * halfSwathKm(h, eta));
        widths.forEach((w, i) => expect(Math.round(w)).toBe(expected[h][i]));
    });

    it('gives the maximum off-nadir angle at the horizon', () => {
        // R28 RESOLVES AUDIT FINDING R1, and in the opposite direction to the
        // one recorded there.
        //
        // The old note here said the design note's table "mixes two Earth
        // radii", because its swath widths reproduced on a 6371 km sphere while
        // its horizon angles (68.0 / 66.07 / 64.3°) looked like WGS84-equatorial
        // values. That reading was wrong.
        //
        // Swath widths are NEARLY INSENSITIVE to the datum at the table's quoted
        // precision, provided each datum is paired consistently — they differ by
        // metres, which rounds away in a table quoted to the kilometre. They are
        // therefore a CONSISTENCY CHECK, not an independent discriminator, and
        // they never distinguished the two conventions. The horizon angles do,
        // and they vote WGS84-equatorial; so do the orbital periods
        // (keplerJ2.test.ts). The source table was consistent all along; the
        // 6371 km model was the outlier.
        //
        // Expected values are the closed form asin(a / (a + h)), computed
        // independently, and they now agree with the published table.
        expect(horizonOffNadirDeg(500)).toBeCloseTo(68.019, 3);
        expect(horizonOffNadirDeg(600)).toBeCloseTo(66.067, 3);
        expect(horizonOffNadirDeg(700)).toBeCloseTo(64.304, 3);
    });

    it('grows the swath faster than linearly in the look angle', () => {
        // Doubling the off-nadir angle more than doubles the swath — the reason
        // to add payloads rather than widen the instrument.
        const a = halfSwathKm(600, 15);
        const b = halfSwathKm(600, 30);
        const c = halfSwathKm(600, 45);
        expect(b / a).toBeGreaterThan(2);
        expect(c / b).toBeGreaterThan(1.7);
    });
});

describe('footprint — groundArcRad', () => {
    it('maps a nadir look to zero ground arc', () => {
        expect(groundArcRad(orbitalRadiusKm(600), 0).arcRad).toBeCloseTo(0, 12);
    });

    it('clamps to the limb rather than failing when the ray misses the Earth', () => {
        const r = orbitalRadiusKm(600);
        const beyond = groundArcRad(r, toRad(80));
        expect(beyond.clampedToLimb).toBe(true);
        // The limb arc is 90° − asin(R_e/r).
        expect(toDeg(beyond.arcRad)).toBeCloseTo(90 - horizonOffNadirDeg(600), 6);
    });

    it('increases monotonically with the look angle up to the limb', () => {
        const r = orbitalRadiusKm(600);
        let prev = -1;
        for (let eta = 0; eta < 66; eta += 2) {
            const arc = groundArcRad(r, toRad(eta)).arcRad;
            expect(arc).toBeGreaterThan(prev);
            prev = arc;
        }
    });

    it('inverts the containment relation — the arc that maps back to the look angle', () => {
        // Equatorial reference: `groundArcRad` is defined against `a`, where the
        // ellipsoid's cross-section is exactly circular, so the spherical law of
        // sines is exact rather than approximate.
        const r = orbitalRadiusKm(600);
        for (const eta of [5, 20, 40, 60]) {
            const lambda = groundArcRad(r, toRad(eta)).arcRad;
            // Law of sines the other way: tan η = a sin λ / (r − a cos λ).
            const back = Math.atan2(
                WGS84_A_KM * Math.sin(lambda),
                r - WGS84_A_KM * Math.cos(lambda)
            );
            expect(toDeg(back)).toBeCloseTo(eta, 8);
        }
    });
});

describe('footprint — projection onto the ground', () => {
    /**
 * Look angle from the satellite to a ground point, degrees — the ORACLE for
 * every footprint-shape assertion below.
 *
 * R28 re-derivation. These tests used to measure a haversine ground distance on
 * a 6371 km sphere and compare it against `halfSwathKm`. That worked while the
 * footprint was itself a geodesic walk on that same sphere; against an
 * ellipsoid footprint it compares two different surfaces and is meaningless.
 *
 * The look angle is the right invariant and always was: a footprint boundary is
 * BY DEFINITION the set of ground points at the FOV half-angle from the
 * boresight. Asserting that directly is independent of how the projection is
 * computed, exact on any Earth model, and does not go through `halfSwathKm` —
 * which is an equatorial reference figure, not a distance that survives off the
 * equator.
 */
function lookAngleFromSatDeg(
    sat: EciState, epochMs: number, tSeconds: number, p: { lat: number; lng: number }
): number {
    const theta = earthRotationRad(epochMs, tSeconds);
    const satEcef = eciToEcef(v3(sat.x, sat.y, sat.z), theta);
    const g = geodeticToEcef(p.lat, p.lng, 0);
    const dx = g.x - satEcef.x;
    const dy = g.y - satEcef.y;
    const dz = g.z - satEcef.z;
    const dLen = Math.hypot(dx, dy, dz);
    const sLen = Math.hypot(satEcef.x, satEcef.y, satEcef.z);
    // Nadir is −r̂; the look angle is the angle between it and the line of sight.
    const cos = -(dx * satEcef.x + dy * satEcef.y + dz * satEcef.z) / (dLen * sLen);
    return toDeg(Math.acos(Math.min(1, Math.max(-1, cos))));
}

const ALT_KM = 600;
    const A_KM = orbitalRadiusKm(ALT_KM);
    const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

    /** Equatorial satellite at ECI (a, 0, 0) moving toward +Y. */
    const sat: EciState = {
        x: A_KM, y: 0, z: 0,
        vx: 0, vy: A_KM * argLatRateRadPerSec(A_KM, 0), vz: 0,
    };

    const cone = (halfAngleDeg: number, bias = { alongTrack: 0, crossTrack: 0 }): FovSpec => ({
        biasDeg: bias,
        shape: 'ELLIPSE',
        halfAngle1Deg: halfAngleDeg,
        halfAngle2Deg: halfAngleDeg,
        clockingDeg: 0,
    });

    it('centres an unbiased footprint on the sub-satellite point', () => {
        const fp = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 0)!;
        expect(fp).not.toBeNull();
        expect(fp.center.lat).toBeCloseTo(fp.subSatellitePoint.lat, 6);
        expect(fp.center.lng).toBeCloseTo(fp.subSatellitePoint.lng, 6);
        expect(fp.centerClampedToLimb).toBe(false);
    });

    it('returns a closed ring of the requested sample count', () => {
        const fp = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 0)!;
        expect(fp.boundary).toHaveLength(DEFAULT_FOOTPRINT_SAMPLES + 1);
        expect(fp.boundary[0]).toEqual(fp.boundary[fp.boundary.length - 1]);
    });

    it('puts every boundary vertex at exactly the FOV half-angle', () => {
        const fp = computeFootprint(sat, prepareFov(cone(25)), EPOCH, 0)!;
        for (const p of fp.boundary) {
            expect(lookAngleFromSatDeg(sat, EPOCH, 0, p)).toBeCloseTo(25, 6);
        }
        expect(fp.clampedVertices).toBe(0);
    });

    /*
     * ── The drawn footprint must obey the elevation mask ────────────────────
     *
     * The mask lives in the access predicate, and the globe used to draw the
     * bare optical cone regardless: the picture claimed coverage the numbers
     * had already refused. These pin the two together.
     */
    describe('elevation mask', () => {
        /** Elevation of the satellite above the WGS84 horizon at a ground point. */
        const elevationDeg = (p: { lat: number; lng: number }): number => {
            const theta = earthRotationRad(EPOCH, 0);
            const satEcef = eciToEcef(v3(sat.x, sat.y, sat.z), theta);
            const g = geodeticToEcef(p.lat, p.lng, 0);
            const d = v3(satEcef.x - g.x, satEcef.y - g.y, satEcef.z - g.z);
            const f = 1 / 298.257223563;
            const bSq = (WGS84_A_KM * (1 - f)) ** 2;
            // Unnormalised WGS84 normal at the ground point.
            const n = v3(g.x / (WGS84_A_KM ** 2), g.y / (WGS84_A_KM ** 2), g.z / bSq);
            const dot = d.x * n.x + d.y * n.y + d.z * n.z;
            return toDeg(Math.asin(dot / (Math.hypot(d.x, d.y, d.z) * Math.hypot(n.x, n.y, n.z))));
        };

        it('leaves the footprint untouched when the mask is looser than the cone', () => {
            const bare = computeFootprint(sat, prepareFov(cone(25)), EPOCH, 0)!;
            const masked = computeFootprint(
                sat, prepareFov({ ...cone(25), minElevationDeg: 10 }), EPOCH, 0
            )!;
            expect(masked.boundary).toEqual(bare.boundary);
        });

        it('pulls the boundary back to the mask when the cone reaches past it', () => {
            const masked = computeFootprint(
                sat, prepareFov({ ...cone(45), minElevationDeg: 40 }), EPOCH, 0
            )!;
            const limit = toDeg(maskLimbRad(A_KM, toRad(40)));
            expect(limit).toBeLessThan(45);
            for (const p of masked.boundary) {
                expect(lookAngleFromSatDeg(sat, EPOCH, 0, p)).toBeCloseTo(limit, 6);
                // And the point of the whole exercise: the drawn edge is where
                // the access test stops counting. Equatorial satellite, so the
                // WGS84 normal and the spherical clamp agree closely.
                expect(elevationDeg(p)).toBeCloseTo(40, 1);
            }
        });

        it('shrinks the swath figure the area grid guard is sized against', () => {
            const reference = {
                pattern: 'STAR', planes: 6, satsPerPlane: 4, inclinationDeg: 87.9,
                altitudeKm: ALT_KM, phasingF: 1, fudge: 1,
            } as const;
            const wide = cone(45);
            const bare = swathWidthDeg(reference, wide);
            const masked = swathWidthDeg(reference, { ...wide, minElevationDeg: 40 });
            expect(masked).toBeLessThan(bare);
            // A mask below the cone's own edge elevation changes nothing.
            expect(swathWidthDeg(reference, { ...wide, minElevationDeg: 1 })).toBeCloseTo(bare, 9);
        });
    });

    it('draws an elongated footprint for unequal half-angles', () => {
        const fov: FovSpec = {
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 5, clockingDeg: 0,
        };
        const fp = computeFootprint(sat, prepareFov(fov), EPOCH, 0)!;
        const angles = fp.boundary.map((p) => lookAngleFromSatDeg(sat, EPOCH, 0, p));
        expect(Math.max(...angles)).toBeCloseTo(30, 6);
        expect(Math.min(...angles)).toBeCloseTo(5, 6);
    });

    it('moves the centre downrange under an along-track bias', () => {
        const biased = computeFootprint(
            sat, prepareFov(cone(5, { alongTrack: 30, crossTrack: 0 })), EPOCH, 0
        )!;
        // The bias IS a look angle, so assert it as one. Measuring a ground
        // distance and comparing against `halfSwathKm` would be comparing an
        // ellipsoid displacement against an equatorial reference figure.
        expect(lookAngleFromSatDeg(sat, EPOCH, 0, biased.center)).toBeCloseTo(30, 6);
        // The sub-satellite point is the nadir hit, so its look angle is zero.
        expect(lookAngleFromSatDeg(sat, EPOCH, 0, biased.subSatellitePoint))
            .toBeCloseTo(0, 6);
    });

    it('clamps vertices to the limb instead of dropping them, keeping the ring closed', () => {
        // A 70° half-angle exceeds the 66.05° horizon, so part of the boundary
        // misses the Earth entirely.
        const fp = computeFootprint(sat, prepareFov(cone(70)), EPOCH, 0)!;
        expect(fp.clampedVertices).toBeGreaterThan(0);
        expect(fp.boundary).toHaveLength(DEFAULT_FOOTPRINT_SAMPLES + 1);
        for (const p of fp.boundary) {
            expect(Number.isFinite(p.lat)).toBe(true);
            expect(Number.isFinite(p.lng)).toBe(true);
            expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
        }
    });

    it('places the four corners of a rectangle exactly', () => {
        const fov: FovSpec = {
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'RECTANGLE', halfAngle1Deg: 10, halfAngle2Deg: 4, clockingDeg: 0,
        };
        const fp = computeFootprint(sat, prepareFov(fov), EPOCH, 0, 48)!;
        const angles = fp.boundary.map((p) => lookAngleFromSatDeg(sat, EPOCH, 0, p));
        // The corner is the farthest point: off-nadir angle atan(√(tan²10 + tan²4)).
        const cornerEta = toDeg(Math.atan(Math.hypot(Math.tan(toRad(10)), Math.tan(toRad(4)))));
        expect(Math.max(...angles)).toBeCloseTo(cornerEta, 6);
        // The nearest edge midpoint is the short half-angle.
        expect(Math.min(...angles)).toBeCloseTo(4, 6);
    });

    it('rejects a satellite inside the Earth rather than producing nonsense', () => {
        const inside: EciState = { x: 100, y: 0, z: 0, vx: 0, vy: 7, vz: 0 };
        expect(computeFootprint(inside, prepareFov(cone(20)), EPOCH, 0)).toBeNull();
    });

    it('follows the Earth as it rotates under an inertially fixed satellite', () => {
        const t0 = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 0)!;
        const t1 = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 3600)!;
        // One hour of Earth rotation ≈ 15°, and the satellite state is unchanged,
        // so the ground point drifts west by that amount.
        const drift = t0.subSatellitePoint.lng - t1.subSatellitePoint.lng;
        expect(((drift + 540) % 360) - 180).toBeCloseTo(15.041, 2);
    });

    it('is deterministic', () => {
        const a = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 1234);
        const b = computeFootprint(sat, prepareFov(cone(20)), EPOCH, 1234);
        expect(a).toEqual(b);
    });

    // ── Over and near a pole ────────────────────────────────────────────────
    // `east` is ẑ × up, whose magnitude is cos(latitude), so it vanishes exactly
    // over a pole and takes the bearing with it. A near-polar constellation
    // crosses the polar region every orbit, so the NEAR-pole case is the one
    // that actually matters; the exact pole is measure-zero and is covered here
    // only to prove it degrades safely rather than producing NaN.
    describe('near and over a pole', () => {
        /** Satellite exactly above a pole, moving along the +X meridian. */
        const overPole = (sign: 1 | -1): EciState => ({
            x: 0, y: 0, z: sign * A_KM,
            vx: A_KM * argLatRateRadPerSec(A_KM, 90), vy: 0, vz: 0,
        });

        /** Satellite `offsetDeg` of arc from the pole — the reachable case. */
        const nearPole = (offsetDeg: number): EciState => {
            const colat = toRad(offsetDeg);
            return {
                x: A_KM * Math.sin(colat), y: 0, z: A_KM * Math.cos(colat),
                vx: 0, vy: A_KM * argLatRateRadPerSec(A_KM, 90), vz: 0,
            };
        };

        it.each([1, 0.1, 0.001])(
            'spreads a full ring %s° from the pole — the reachable case',
            (offsetDeg) => {
                const fp = computeFootprint(nearPole(offsetDeg), prepareFov(cone(20)), EPOCH, 0)!;
                const longitudes = new Set(fp.boundary.map((p) => p.lng.toFixed(3)));
                expect(longitudes.size).toBeGreaterThan(20);
                for (const p of fp.boundary) {
                    expect(Number.isFinite(p.lat)).toBe(true);
                    expect(Number.isFinite(p.lng)).toBe(true);
                }
            }
        );

        it.each([[1 as const, 'north'], [-1 as const, 'south']])(
            'degrades safely exactly over the %s pole',
            (sign: 1 | -1, _hemisphere: string) => {
                const fp = computeFootprint(overPole(sign), prepareFov(cone(20)), EPOCH, 0)!;
                expect(fp).not.toBeNull();
                for (const p of fp.boundary) {
                    expect(Number.isFinite(p.lat)).toBe(true);
                    expect(Number.isFinite(p.lng)).toBe(true);
                    expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
                }
                expect(fp.boundary[0]).toEqual(fp.boundary[fp.boundary.length - 1]);
                expect(Math.abs(fp.center.lat)).toBeCloseTo(90, 6);
            }
        );

        it('holds the ring at the FOV half-angle even at the exact pole', () => {
            const fp = computeFootprint(overPole(1), prepareFov(cone(25)), EPOCH, 0)!;
            for (const p of fp.boundary) {
                expect(lookAngleFromSatDeg(overPole(1), EPOCH, 0, p))
                    .toBeCloseTo(25, 6);
            }
        });

        // KNOWN LIMITATION, deliberately pinned rather than worked around.
        //
        // `destinationGeodesic` loses the bearing when walking from an exact
        // pole: cos(φ₁) is 0, which zeroes the numerator of its longitude term,
        // so every bearing returns the same meridian and the ring collapses onto
        // it. Fixing that means changing a shared utility that OneWeb comb
        // geometry also uses, to serve a case real propagation cannot reach —
        // `satEcef.x` and `.y` must both be exactly 0. One ten-millionth of a
        // degree away (≈1 cm) the formula resolves all bearings correctly, as
        // the test above shows at 0.001°.
        it('draws a FULL ring at the exact pole — R21 is fixed, not merely guarded', () => {
            // This test previously asserted the OPPOSITE: that the ring
            // collapsed onto one meridian at the pole. That was R21, a
            // measure-zero defect pinned rather than fixed, because the
            // geodesic-walk projection needed a compass bearing and "east" is
            // undefined over a pole.
            //
            // R28 removed the cause rather than the symptom. A ray/ellipsoid
            // intersection never forms an azimuth, so the pole is not a special
            // point and no guard is needed. The ring is now as well formed
            // there as anywhere else.
            const atPole = computeFootprint(overPole(1), prepareFov(cone(20)), EPOCH, 0)!;
            const poleLongitudes = new Set(atPole.boundary.map((p) => p.lng.toFixed(3)));
            expect(poleLongitudes.size).toBeGreaterThan(20);

            // And every vertex sits at the half-angle, exactly as off the pole.
            for (const p of atPole.boundary) {
                expect(lookAngleFromSatDeg(overPole(1), EPOCH, 0, p)).toBeCloseTo(20, 6);
            }

            // A hair off the pole is unchanged — no discontinuity across it.
            const offPole = computeFootprint(nearPole(1e-6), prepareFov(cone(20)), EPOCH, 0)!;
            expect(new Set(offPole.boundary.map((p) => p.lng.toFixed(3))).size)
                .toBeGreaterThan(20);
        });
    });
});
