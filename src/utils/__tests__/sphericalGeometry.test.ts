import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM, haversineDistanceKm } from '../earthGeometry';
import {
    clamp, cross, destinationGeodesic, dot, normalize, normalizeLng,
    rotateAround, toDeg, toRad, v3,
} from '../sphericalGeometry';

// These helpers were private to oneWebCombCore until the revisit module needed
// them. The move was behaviour-preserving; these tests pin the behaviour so a
// future edit to the shared copy cannot silently change OneWeb comb geometry.

describe('sphericalGeometry — angles and wrapping', () => {
    it('round-trips degrees and radians', () => {
        expect(toDeg(toRad(137.5))).toBeCloseTo(137.5, 12);
        expect(toRad(180)).toBeCloseTo(Math.PI, 12);
    });

    it('clamps to the closed interval', () => {
        expect(clamp(5, 0, 1)).toBe(1);
        expect(clamp(-5, 0, 1)).toBe(0);
        expect(clamp(0.5, 0, 1)).toBe(0.5);
    });

    it('wraps longitude across the antimeridian without a discontinuity in distance', () => {
        expect(normalizeLng(190)).toBeCloseTo(-170, 12);
        expect(normalizeLng(-190)).toBeCloseTo(170, 12);
        // The range is half-open [-180, 180): the antimeridian resolves to -180.
        expect(normalizeLng(180)).toBeCloseTo(-180, 12);
        expect(normalizeLng(540)).toBeCloseTo(-180, 12);
        expect(normalizeLng(-180)).toBeCloseTo(-180, 12);
    });
});

describe('sphericalGeometry — vector math', () => {
    it('produces a right-handed cross product', () => {
        const c = cross(v3(1, 0, 0), v3(0, 1, 0));
        expect(c).toEqual({ x: 0, y: 0, z: 1 });
    });

    it('returns the zero vector rather than NaN when normalising zero', () => {
        expect(normalize(v3(0, 0, 0))).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('rotates by Rodrigues about an arbitrary axis, preserving length', () => {
        const axis = normalize(v3(1, 1, 1));
        const v = v3(3, -2, 0.5);
        const r = rotateAround(axis, Math.PI / 3, v);
        expect(Math.sqrt(dot(r, r))).toBeCloseTo(Math.sqrt(dot(v, v)), 10);
        // The component along the axis is invariant under rotation about it.
        expect(dot(r, axis)).toBeCloseTo(dot(v, axis), 10);
    });

    it('rotating +Z about +Y by θ tilts toward +X — the boresight bias convention', () => {
        const r = rotateAround(v3(0, 1, 0), toRad(30), v3(0, 0, 1));
        expect(r.x).toBeCloseTo(Math.sin(toRad(30)), 12);
        expect(r.y).toBeCloseTo(0, 12);
        expect(r.z).toBeCloseTo(Math.cos(toRad(30)), 12);
    });

    it('a full turn is the identity', () => {
        const v = v3(0.3, -0.7, 2);
        const r = rotateAround(v3(0, 0, 1), 2 * Math.PI, v);
        expect(r.x).toBeCloseTo(v.x, 10);
        expect(r.y).toBeCloseTo(v.y, 10);
        expect(r.z).toBeCloseTo(v.z, 10);
    });
});

describe('sphericalGeometry — destinationGeodesic', () => {
    it('walks the distance it was asked for, measured back by haversine', () => {
        const start = { lat: 51.5, lng: -0.13 };
        for (const bearing of [0, 45, 90, 180, 270, 359]) {
            for (const distKm of [1, 100, 2000]) {
                const end = destinationGeodesic(start.lat, start.lng, bearing, distKm);
                expect(haversineDistanceKm(start, end)).toBeCloseTo(distKm, 6);
            }
        }
    });

    it('walks due north along a meridian', () => {
        const end = destinationGeodesic(0, 10, 0, EARTH_RADIUS_KM * toRad(1));
        expect(end.lat).toBeCloseTo(1, 9);
        expect(end.lng).toBeCloseTo(10, 9);
    });

    it('returns a normalised longitude when crossing the antimeridian', () => {
        const end = destinationGeodesic(0, 179, 90, 500);
        expect(end.lng).toBeLessThan(0);
        expect(end.lng).toBeGreaterThan(-180);
        expect(haversineDistanceKm({ lat: 0, lng: 179 }, end)).toBeCloseTo(500, 6);
    });

    it('clamps latitude at the pole rather than overshooting', () => {
        const end = destinationGeodesic(89, 0, 0, 5000);
        expect(end.lat).toBeLessThanOrEqual(90);
        expect(end.lat).toBeGreaterThanOrEqual(-90);
    });
});
