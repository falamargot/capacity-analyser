import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM, haversineDistanceKm } from '../../../utils/earthGeometry';
import { toRad, toDeg } from '../../../utils/sphericalGeometry';
import {
    DEFAULT_FOOTPRINT_SAMPLES, computeFootprint, groundArcRad,
    halfSwathKm, horizonOffNadirDeg,
} from '../fov/footprint';
import { prepareFov } from '../fov/containment';
import { argLatRateRadPerSec } from '../propagation/keplerJ2';
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
        // NOTE: the design note quotes 68.0 / 66.07 / 64.3°. The 600 km figure of
        // 66.07° is a WGS84-equatorial-radius (6378.137 km) value; on the R = 6371
        // sphere this codebase uses it is 66.05°. The swath widths in the same
        // table are R = 6371 values, so the source table mixes two Earth radii.
        // ADR-001 §2 settles it: spherical, 6371. See keplerJ2.test.ts for the
        // matching note on orbital period.
        expect(horizonOffNadirDeg(500)).toBeCloseTo(68.007, 3);
        expect(horizonOffNadirDeg(600)).toBeCloseTo(66.054, 3);
        expect(horizonOffNadirDeg(700)).toBeCloseTo(64.290, 3);
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
        expect(groundArcRad(EARTH_RADIUS_KM + 600, 0).arcRad).toBeCloseTo(0, 12);
    });

    it('clamps to the limb rather than failing when the ray misses the Earth', () => {
        const r = EARTH_RADIUS_KM + 600;
        const beyond = groundArcRad(r, toRad(80));
        expect(beyond.clampedToLimb).toBe(true);
        // The limb arc is 90° − asin(R_e/r).
        expect(toDeg(beyond.arcRad)).toBeCloseTo(90 - horizonOffNadirDeg(600), 6);
    });

    it('increases monotonically with the look angle up to the limb', () => {
        const r = EARTH_RADIUS_KM + 600;
        let prev = -1;
        for (let eta = 0; eta < 66; eta += 2) {
            const arc = groundArcRad(r, toRad(eta)).arcRad;
            expect(arc).toBeGreaterThan(prev);
            prev = arc;
        }
    });

    it('inverts the containment relation — the arc that maps back to the look angle', () => {
        const r = EARTH_RADIUS_KM + 600;
        for (const eta of [5, 20, 40, 60]) {
            const lambda = groundArcRad(r, toRad(eta)).arcRad;
            // Law of sines the other way: tan η = R_e sin λ / (r − R_e cos λ).
            const back = Math.atan2(
                EARTH_RADIUS_KM * Math.sin(lambda),
                r - EARTH_RADIUS_KM * Math.cos(lambda)
            );
            expect(toDeg(back)).toBeCloseTo(eta, 8);
        }
    });
});

describe('footprint — projection onto the ground', () => {
    const ALT_KM = 600;
    const A_KM = EARTH_RADIUS_KM + ALT_KM;
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

    it('puts every boundary vertex at the half-swath distance from the centre', () => {
        const fp = computeFootprint(sat, prepareFov(cone(25)), EPOCH, 0)!;
        const expectedKm = halfSwathKm(ALT_KM, 25);
        for (const p of fp.boundary) {
            expect(haversineDistanceKm(fp.center, { lat: p.lat, lng: p.lng }))
                .toBeCloseTo(expectedKm, 6);
        }
        expect(fp.clampedVertices).toBe(0);
    });

    it('draws an elongated footprint for unequal half-angles', () => {
        const fov: FovSpec = {
            biasDeg: { alongTrack: 0, crossTrack: 0 },
            shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 5, clockingDeg: 0,
        };
        const fp = computeFootprint(sat, prepareFov(fov), EPOCH, 0)!;
        const distances = fp.boundary.map((p) =>
            haversineDistanceKm(fp.center, { lat: p.lat, lng: p.lng })
        );
        expect(Math.max(...distances)).toBeCloseTo(halfSwathKm(ALT_KM, 30), 4);
        expect(Math.min(...distances)).toBeCloseTo(halfSwathKm(ALT_KM, 5), 4);
    });

    it('moves the centre downrange under an along-track bias', () => {
        const biased = computeFootprint(
            sat, prepareFov(cone(5, { alongTrack: 30, crossTrack: 0 })), EPOCH, 0
        )!;
        expect(haversineDistanceKm(biased.subSatellitePoint, biased.center))
            .toBeCloseTo(halfSwathKm(ALT_KM, 30), 4);
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
        const distances = fp.boundary.map((p) =>
            haversineDistanceKm(fp.center, { lat: p.lat, lng: p.lng })
        );
        // The corner is the farthest point: off-nadir angle atan(√(tan²10 + tan²4)).
        const cornerEta = toDeg(Math.atan(Math.hypot(Math.tan(toRad(10)), Math.tan(toRad(4)))));
        expect(Math.max(...distances)).toBeCloseTo(halfSwathKm(ALT_KM, cornerEta), 4);
        // The nearest edge midpoint is the short half-angle.
        expect(Math.min(...distances)).toBeCloseTo(halfSwathKm(ALT_KM, 4), 4);
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
});
