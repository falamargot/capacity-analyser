/**
 * wgs84Geometry — independent oracles for the R28 ellipsoid model.
 *
 * These are NOT a rebaseline. Not one expected value here was produced by
 * running the code under test. Each check comes from one of:
 *
 *   1. a closed form that is exact by definition (equator → a, pole → b);
 *   2. the WGS84 ellipsoid equation itself, x²/a² + y²/a² + z²/b² = 1;
 *   3. a geometric invariant the implementation never asserts internally
 *      (collinearity of ray and hit, positive intersection distance);
 *   4. a round trip, which can only pass if two independent directions agree;
 *   5. **Cesium's WGS84 ellipsoid** — a third-party implementation already in
 *      this project's dependency tree, used in tests only.
 *
 * The fifth is the important one and the reason this file exists. R4's
 * post-mortem was that every oracle shared the engine's own constants and
 * conventions, so none could see a wrong one. `geodeticToEcef` and
 * `ecefToGeodetic` validating each other via a round trip is exactly that trap:
 * a round trip through a consistently-wrong flattening passes perfectly.
 * Cesium's ellipsoid is built from its own constants and its own algorithms, so
 * it can fail in a way the round trip cannot.
 */
import { describe, expect, it } from 'vitest';
import {
    Cartesian3,
    Cartographic,
    Ellipsoid,
    IntersectionTests,
    Ray,
} from 'cesium';
import {
    WGS84_A_KM,
    WGS84_E2,
    WGS84_F,
    ecefToGeodetic,
    geodeticToEcef,
    orbitalRadiusKm,
    rayEllipsoidIntersect,
    type EcefVec3,
} from '../wgs84Geometry';

/** Semi-minor axis, from the flattening — not read back from the module. */
const B_KM = WGS84_A_KM * (1 - WGS84_F);

/** How far a point sits from the ellipsoid surface, as the defining equation. */
function ellipsoidResidual(p: EcefVec3): number {
    return (p.x * p.x) / (WGS84_A_KM * WGS84_A_KM)
        + (p.y * p.y) / (WGS84_A_KM * WGS84_A_KM)
        + (p.z * p.z) / (B_KM * B_KM)
        - 1;
}

const norm = (p: EcefVec3) => Math.hypot(p.x, p.y, p.z);

// ─── 1. Closed forms that are true by definition ────────────────────────────

describe('WGS84 — closed-form anchors', () => {
    it('puts the equator at exactly the semi-major axis', () => {
        for (const lon of [-180, -90, -33.3, 0, 45, 120, 179.9]) {
            const p = geodeticToEcef({ latDeg: 0, lonDeg: lon, altKm: 0 });
            expect(norm(p)).toBeCloseTo(WGS84_A_KM, 9);
            expect(p.z).toBeCloseTo(0, 9);
        }
    });

    it('puts the poles at exactly the semi-minor axis', () => {
        const north = geodeticToEcef({ latDeg: 90, lonDeg: 0, altKm: 0 });
        const south = geodeticToEcef({ latDeg: -90, lonDeg: 0, altKm: 0 });
        expect(north.z).toBeCloseTo(B_KM, 9);
        expect(south.z).toBeCloseTo(-B_KM, 9);
        expect(Math.hypot(north.x, north.y)).toBeCloseTo(0, 9);
    });

    it('derives e² from f by its own definition', () => {
        expect(WGS84_E2).toBeCloseTo(2 * WGS84_F - WGS84_F * WGS84_F, 15);
        // Independent published value of the first eccentricity squared.
        expect(WGS84_E2).toBeCloseTo(0.00669437999014, 12);
    });

    it('measures altitude from the equatorial radius, not the mean radius', () => {
        // R28's whole content, stated as an equation rather than a constant.
        expect(orbitalRadiusKm(0)).toBeCloseTo(WGS84_A_KM, 12);
        expect(orbitalRadiusKm(1200)).toBeCloseTo(7578.137, 9);
        expect(orbitalRadiusKm(1200) - orbitalRadiusKm(0)).toBeCloseTo(1200, 12);
    });
});

// ─── 2. The ellipsoid equation, applied to surface points ───────────────────

describe('WGS84 — the defining equation holds', () => {
    it('places every zero-altitude point exactly on the ellipsoid', () => {
        for (let lat = -90; lat <= 90; lat += 7.5) {
            for (const lon of [-175, -80, 0, 61, 143]) {
                const p = geodeticToEcef({ latDeg: lat, lonDeg: lon, altKm: 0 });
                expect(Math.abs(ellipsoidResidual(p))).toBeLessThan(1e-12);
            }
        }
    });

    it('is not a sphere — the polar radius is 21.4 km shorter', () => {
        // Guards the failure mode where flattening is dropped and the
        // "ellipsoid" silently becomes a sphere, which every round trip and
        // every self-consistency check would still pass.
        expect(WGS84_A_KM - B_KM).toBeCloseTo(21.3846857, 6);
        const equator = geodeticToEcef({ latDeg: 0, lonDeg: 0, altKm: 0 });
        const pole = geodeticToEcef({ latDeg: 90, lonDeg: 0, altKm: 0 });
        expect(norm(equator) - norm(pole)).toBeGreaterThan(21);
    });
});

// ─── 3. Round trips ─────────────────────────────────────────────────────────

describe('WGS84 — geodetic round trips', () => {
    it('round-trips at the surface', () => {
        for (let lat = -88; lat <= 88; lat += 8) {
            for (const lon of [-179, -95, -12, 0, 37, 88, 174]) {
                const back = ecefToGeodetic(geodeticToEcef({ latDeg: lat, lonDeg: lon, altKm: 0 }));
                expect(back.latDeg).toBeCloseTo(lat, 9);
                expect(back.lonDeg).toBeCloseTo(lon, 9);
                expect(back.altKm).toBeCloseTo(0, 8);
            }
        }
    });

    it('round-trips at orbital altitude, where closed forms lose accuracy', () => {
        // The reason `ecefToGeodetic` iterates rather than using Bowring.
        for (const alt of [400, 1200, 8000, 35786]) {
            for (let lat = -85; lat <= 85; lat += 17) {
                const back = ecefToGeodetic(
                    geodeticToEcef({ latDeg: lat, lonDeg: 23.4, altKm: alt })
                );
                expect(back.latDeg).toBeCloseTo(lat, 8);
                expect(back.altKm).toBeCloseTo(alt, 6);
            }
        }
    });

    it('returns the pole rather than dividing by zero on the spin axis', () => {
        const up = ecefToGeodetic({ x: 0, y: 0, z: B_KM + 500 });
        expect(up.latDeg).toBe(90);
        expect(up.altKm).toBeCloseTo(500, 9);
        const down = ecefToGeodetic({ x: 0, y: 0, z: -(B_KM + 500) });
        expect(down.latDeg).toBe(-90);
        expect(down.altKm).toBeCloseTo(500, 9);
    });
});

// ─── 4. Ray/ellipsoid intersection, by invariant ────────────────────────────

describe('WGS84 — ray intersection invariants', () => {
    const cases: Array<{ origin: EcefVec3; dir: EcefVec3 }> = [];
    for (let lat = -80; lat <= 80; lat += 20) {
        for (const lon of [-120, 0, 75]) {
            const sat = geodeticToEcef({ latDeg: lat, lonDeg: lon, altKm: 1200 });
            // Straight down, plus a spray of off-nadir directions.
            for (const tilt of [0, 0.1, 0.25, 0.4]) {
                cases.push({
                    origin: sat,
                    dir: { x: -sat.x + tilt * 2000, y: -sat.y + tilt * 1500, z: -sat.z + tilt * 900 },
                });
            }
        }
    }

    it('lands every hit exactly on the ellipsoid', () => {
        let hits = 0;
        for (const c of cases) {
            const hit = rayEllipsoidIntersect(c.origin, c.dir);
            if (!hit) continue;
            hits++;
            expect(Math.abs(ellipsoidResidual(hit))).toBeLessThan(1e-9);
        }
        expect(hits).toBeGreaterThan(30);
    });

    it('keeps the hit collinear with the ray, at positive distance', () => {
        for (const c of cases) {
            const hit = rayEllipsoidIntersect(c.origin, c.dir);
            if (!hit) continue;
            const d = { x: hit.x - c.origin.x, y: hit.y - c.origin.y, z: hit.z - c.origin.z };
            const dLen = norm(d);
            const dirLen = norm(c.dir);
            // Parallel to the ray...
            const cos = (d.x * c.dir.x + d.y * c.dir.y + d.z * c.dir.z) / (dLen * dirLen);
            expect(cos).toBeCloseTo(1, 9);
            // ...and ahead of the origin, never behind it.
            expect(dLen).toBeGreaterThan(0);
        }
    });

    it('takes the NEAR root — the visible surface, not the far side', () => {
        const sat = geodeticToEcef({ latDeg: 30, lonDeg: 10, altKm: 1200 });
        const hit = rayEllipsoidIntersect(sat, { x: -sat.x, y: -sat.y, z: -sat.z })!;
        expect(hit).not.toBeNull();
        // The near hit is on the same side as the satellite: the vector to it
        // shortens the radius rather than crossing the centre.
        expect(hit.x * sat.x + hit.y * sat.y + hit.z * sat.z).toBeGreaterThan(0);
        expect(norm(hit)).toBeLessThan(norm(sat));
    });

    it('returns null when the ray misses, rather than a spurious point', () => {
        const sat = geodeticToEcef({ latDeg: 0, lonDeg: 0, altKm: 1200 });
        // Straight up.
        expect(rayEllipsoidIntersect(sat, { x: sat.x, y: sat.y, z: sat.z })).toBeNull();
        // Tangentially past the limb.
        expect(rayEllipsoidIntersect(sat, { x: 0, y: 0, z: 1 })).toBeNull();
        expect(rayEllipsoidIntersect(sat, { x: 0, y: 0, z: 0 })).toBeNull();
    });

    it('hits the sub-point when fired straight down from over the equator', () => {
        // Closed form: from directly above (0°, 0°) the radial ray must land on
        // (0°, 0°) at radius exactly a.
        const sat = geodeticToEcef({ latDeg: 0, lonDeg: 0, altKm: 1200 });
        const hit = rayEllipsoidIntersect(sat, { x: -1, y: 0, z: 0 })!;
        expect(hit.x).toBeCloseTo(WGS84_A_KM, 9);
        expect(hit.y).toBeCloseTo(0, 9);
        expect(hit.z).toBeCloseTo(0, 9);
    });
});

// ─── 5. Against Cesium's independent WGS84 implementation ───────────────────

describe('WGS84 — against Cesium, a third-party implementation', () => {
    // Cesium works in METRES and (longitude, latitude) order. Its ellipsoid is
    // constructed from its own constants, and its cartographic conversion and
    // ray intersection share no code with ours.
    const KM = 1000;

    it('agrees on geodetic → ECEF to the millimetre', () => {
        for (let lat = -85; lat <= 85; lat += 5) {
            for (const lon of [-160, -44, 0, 12.5, 99, 178]) {
                for (const alt of [0, 1200]) {
                    const mine = geodeticToEcef({ latDeg: lat, lonDeg: lon, altKm: alt });
                    const theirs = Ellipsoid.WGS84.cartographicToCartesian(
                        Cartographic.fromDegrees(lon, lat, alt * KM)
                    );
                    expect(mine.x * KM).toBeCloseTo(theirs.x, 3);
                    expect(mine.y * KM).toBeCloseTo(theirs.y, 3);
                    expect(mine.z * KM).toBeCloseTo(theirs.z, 3);
                }
            }
        }
    });

    it('agrees on ECEF → geodetic to the microdegree', () => {
        for (let lat = -85; lat <= 85; lat += 5) {
            for (const alt of [0, 550, 1200, 35786]) {
                const p = geodeticToEcef({ latDeg: lat, lonDeg: -73.2, altKm: alt });
                const mine = ecefToGeodetic(p);
                const theirs = Ellipsoid.WGS84.cartesianToCartographic(
                    new Cartesian3(p.x * KM, p.y * KM, p.z * KM)
                );
                expect(mine.latDeg).toBeCloseTo((theirs.latitude * 180) / Math.PI, 6);
                expect(mine.lonDeg).toBeCloseTo((theirs.longitude * 180) / Math.PI, 6);
                expect(mine.altKm * KM).toBeCloseTo(theirs.height, 3);
            }
        }
    });

    it('agrees on ray/ellipsoid intersection to the millimetre', () => {
        for (let lat = -70; lat <= 70; lat += 10) {
            const sat = geodeticToEcef({ latDeg: lat, lonDeg: 30, altKm: 1200 });
            for (const tilt of [0, 500, 1200, 2000]) {
                const dir = { x: -sat.x, y: -sat.y, z: -sat.z + tilt };
                const mine = rayEllipsoidIntersect(sat, dir);

                const origin = new Cartesian3(sat.x * KM, sat.y * KM, sat.z * KM);
                const direction = Cartesian3.normalize(
                    new Cartesian3(dir.x * KM, dir.y * KM, dir.z * KM),
                    new Cartesian3()
                );
                const interval = IntersectionTests.rayEllipsoid(
                    new Ray(origin, direction),
                    Ellipsoid.WGS84
                );

                if (!interval) {
                    expect(mine).toBeNull();
                    continue;
                }
                expect(mine).not.toBeNull();
                const theirs = Ray.getPoint(new Ray(origin, direction), interval.start);
                expect(mine!.x * KM).toBeCloseTo(theirs.x, 2);
                expect(mine!.y * KM).toBeCloseTo(theirs.y, 2);
                expect(mine!.z * KM).toBeCloseTo(theirs.z, 2);
            }
        }
    });
});
