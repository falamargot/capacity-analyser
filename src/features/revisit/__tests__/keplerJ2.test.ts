import { describe, expect, it } from 'vitest';
import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import {
    EARTH_ROTATION_RATE_RAD_S, J2, MU_EARTH_KM3_S2,
    argLatRateRadPerSec, earthRotationRad, ecefToGeodetic, ecefToEci, eciToEcef,
    geodeticToEcef, gmstRad, meanMotionRadPerSec, nodalRegressionRadPerSec,
    orbitalPeriodSec, preparePropagator, propagate, propagateState,
} from '../propagation/keplerJ2';
import type { OrbitalElements } from '../domain/types';

const toDeg = (rad: number) => (rad * 180) / Math.PI;

describe('keplerJ2 — constants', () => {
    // These enter the codebase here for the first time (audit §5.3). Pinning
    // them makes a typo in the tenth digit a test failure rather than a slow
    // drift in every revisit figure the tool produces.
    it('pins μ, J₂ and the Earth rotation rate', () => {
        expect(MU_EARTH_KM3_S2).toBe(398600.4418);
        expect(J2).toBe(1.08262668e-3);
        expect(EARTH_ROTATION_RATE_RAD_S).toBe(7.2921159e-5);
    });

    it('completes one sidereal rotation in 86164 s', () => {
        expect((2 * Math.PI) / EARTH_ROTATION_RATE_RAD_S).toBeCloseTo(86164.1, 0);
    });
});

// ─── EXIT GATE 1 — sun-synchronous drift ────────────────────────────────────
describe('keplerJ2 — sun-synchronous nodal drift', () => {
    it('gives Ω̇ ≈ +0.9856 °/day at h = 600 km, i = 97.8°', () => {
        const a = orbitalRadiusKm(600);
        const driftDegPerDay = toDeg(nodalRegressionRadPerSec(a, 97.8)) * 86400;

        const textbook = 0.9856;
        expect(driftDegPerDay).toBeGreaterThan(0);
        expect(Math.abs(driftDegPerDay - textbook) / textbook).toBeLessThan(0.01);

        // The value this model actually produces, pinned so a change to the
        // formula or to either radius constant shows up as a diff.
        expect(driftDegPerDay).toBeCloseTo(0.98720, 4);
    });

    it('agrees with the published figure to 0.16 % — R28 closed the gap', () => {
        // History, because the number moved and the reason matters.
        //
        // Before R28 this read 0.99074 °/day, 0.52 % from the textbook value,
        // and a companion test existed here solely to demonstrate that feeding
        // the aerospace altitude convention cut the error to 0.16 %. R28 adopted
        // that convention, so the demonstration and the engine are now the same
        // computation and the companion test has been folded into this one.
        //
        // What is left — 0.16 % — is 97.8° being a figure rounded to a tenth of
        // a degree, not a modelling residual. dΩ̇/Ω̇ = −tan(i)·di, and at i ≈ 98°
        // that is ≈ 7 per radian, so ±0.05° of rounding is ±0.6 % on its own.
        // The agreement is therefore as close as the published input allows.
        const drift = toDeg(nodalRegressionRadPerSec(orbitalRadiusKm(600), 97.8)) * 86400;
        expect(Math.abs(drift - 0.9856) / 0.9856).toBeLessThan(0.002);
    });

    it('regresses westward for prograde orbits and eastward for retrograde', () => {
        const a = orbitalRadiusKm(600);
        expect(nodalRegressionRadPerSec(a, 51.6)).toBeLessThan(0);
        expect(nodalRegressionRadPerSec(a, 97.8)).toBeGreaterThan(0);
    });

    it('vanishes at 90° inclination, where the node does not regress', () => {
        expect(nodalRegressionRadPerSec(orbitalRadiusKm(600), 90)).toBeCloseTo(0, 15);
    });
});

describe('keplerJ2 — mean motion and period', () => {
    it('reproduces the orbital period at 500 / 600 / 700 km', () => {
        // R28 RESOLVES THE THIRD AND LAST OF THESE DISCREPANCIES.
        //
        // This note used to say the design note's 94.6 / 96.7 / 98.8 min were
        // "WGS84-equatorial values" differing from the Earth model this codebase
        // had chosen, and that the discrepancy lay in the source table. It did
        // not. On the equatorial altitude datum the periods come out
        // 94.62 / 96.69 / 98.77 — the published figures.
        //
        // Together with the horizon angles (footprint.test.ts) and the swath
        // widths, that is three independent quantities from one source table,
        // all agreeing once the datum is equatorial. The table was consistent
        // throughout; the 6371 km model was the outlier. Audit finding R1,
        // which recorded the opposite, is corrected in
        // docs/SPATIAL_PHYSICS_AUDIT.md.
        expect(orbitalPeriodSec(orbitalRadiusKm(500)) / 60).toBeCloseTo(94.616, 2);
        expect(orbitalPeriodSec(orbitalRadiusKm(600)) / 60).toBeCloseTo(96.687, 2);
        expect(orbitalPeriodSec(orbitalRadiusKm(700)) / 60).toBeCloseTo(98.773, 2);
    });

    it('satisfies n = 2π/T', () => {
        const a = orbitalRadiusKm(1200);
        expect(meanMotionRadPerSec(a) * orbitalPeriodSec(a)).toBeCloseTo(2 * Math.PI, 10);
    });

    it('perturbs the argument of latitude rate only slightly away from n', () => {
        const a = orbitalRadiusKm(600);
        const n = meanMotionRadPerSec(a);
        const uDot = argLatRateRadPerSec(a, 97.8);
        // u̇ = ω̇ + Ṁ carries both Brouwer secular terms, so it sits ~1.3e-3 from
        // the unperturbed n at this altitude — roughly twice the ω̇-only figure
        // this bound was originally written against. Still a small perturbation;
        // the point of the assertion is that it has not become a large one.
        expect(Math.abs(uDot - n) / n).toBeLessThan(2e-3);
    });
});

describe('keplerJ2 — propagation geometry', () => {
    const element = (over: Partial<OrbitalElements> = {}): OrbitalElements => ({
        id: 'P00_S00',
        planeIndex: 0,
        satIndexInPlane: 0,
        semiMajorAxisKm: orbitalRadiusKm(600),
        inclinationDeg: 60,
        raanDeg: 0,
        argLatDeg: 0,
        ...over,
    });

    it('keeps the satellite on a circle of radius a', () => {
        const sat = preparePropagator(element());
        for (const t of [0, 137, 2000, 54321]) {
            const s = propagateState(sat, t);
            expect(Math.hypot(s.x, s.y, s.z)).toBeCloseTo(orbitalRadiusKm(600), 8);
        }
    });

    it('places u = 0 at the ascending node and u = 90° at maximum latitude', () => {
        const a = orbitalRadiusKm(600);
        const atNode = propagateState(preparePropagator(element({ argLatDeg: 0 })), 0);
        expect(atNode.z).toBeCloseTo(0, 9);
        expect(atNode.x).toBeCloseTo(a, 6);

        const atApex = propagateState(preparePropagator(element({ argLatDeg: 90 })), 0);
        expect(toDeg(Math.asin(atApex.z / a))).toBeCloseTo(60, 6);
    });

    it('rotates the orbit plane by the RAAN', () => {
        const a = orbitalRadiusKm(600);
        const s = propagateState(preparePropagator(element({ raanDeg: 90, argLatDeg: 0 })), 0);
        expect(s.x).toBeCloseTo(0, 6);
        expect(s.y).toBeCloseTo(a, 6);
    });

    it('produces a velocity perpendicular to the radius, at circular speed', () => {
        const a = orbitalRadiusKm(600);
        const s = propagateState(preparePropagator(element()), 1234);
        const rDotV = s.x * s.vx + s.y * s.vy + s.z * s.vz;
        expect(rDotV / (a * Math.hypot(s.vx, s.vy, s.vz))).toBeCloseTo(0, 9);
        // v = a·u̇ for a circular orbit.
        expect(Math.hypot(s.vx, s.vy, s.vz))
            .toBeCloseTo(a * argLatRateRadPerSec(a, 60), 9);
    });

    it('returns to the same point after one nodal period', () => {
        const a = orbitalRadiusKm(600);
        const el = element({ inclinationDeg: 0, raanDeg: 0 });
        const sat = preparePropagator(el);
        // At i = 0 the in-plane angle advances at u̇ + Ω̇, since RAAN and argument
        // of latitude are degenerate into one angle.
        const rate = sat.argLatRateRadPerSec + sat.raanRateRadPerSec;
        const period = (2 * Math.PI) / rate;
        const s0 = propagateState(sat, 0);
        const s1 = propagateState(sat, period);
        expect(s1.x).toBeCloseTo(s0.x, 6);
        expect(s1.y).toBeCloseTo(s0.y, 6);
        expect(s1.z).toBeCloseTo(s0.z, 6);
        expect(a).toBeGreaterThan(0);
    });

    it('writes into the supplied output object without allocating', () => {
        const sat = preparePropagator(element());
        const out = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        const returned = propagateState(sat, 500, out);
        expect(returned).toBe(out);
        expect(out.x).not.toBe(0);
    });

    it('propagate() runs a whole fleet to one instant', () => {
        const fleet = [element({ id: 'A' }), element({ id: 'B', raanDeg: 180 })];
        const states = propagate(fleet, 900);
        expect(states).toHaveLength(2);
        expect(states[0].x).toBeCloseTo(-states[1].x, 6);
    });
});

describe('keplerJ2 — Earth rotation and frames', () => {
    it('computes a GMST in [0, 2π)', () => {
        for (const ms of [0, Date.UTC(2026, 7, 6), Date.UTC(2000, 0, 1, 12)]) {
            const g = gmstRad(ms);
            expect(g).toBeGreaterThanOrEqual(0);
            expect(g).toBeLessThan(2 * Math.PI);
        }
    });

    it('advances GMST by one sidereal turn per sidereal day', () => {
        const t0 = Date.UTC(2026, 7, 6);
        const siderealDayMs = ((2 * Math.PI) / EARTH_ROTATION_RATE_RAD_S) * 1000;
        const delta = gmstRad(t0 + siderealDayMs) - gmstRad(t0);
        expect(Math.abs(((delta + Math.PI) % (2 * Math.PI)) - Math.PI)).toBeLessThan(1e-4);
    });

    it('advances the rotation angle linearly from the epoch GMST', () => {
        const epoch = Date.UTC(2026, 7, 6);
        expect(earthRotationRad(epoch, 0)).toBeCloseTo(gmstRad(epoch), 12);
        expect(earthRotationRad(epoch, 100) - earthRotationRad(epoch, 0))
            .toBeCloseTo(100 * EARTH_ROTATION_RATE_RAD_S, 12);
    });

    it('round-trips geodetic → ECEF → geodetic', () => {
        for (const p of [
            { lat: 51.5, lon: -0.13 },
            { lat: -33.9, lon: 151.2 },
            { lat: 0, lon: 179.9 },
            { lat: 89, lon: -45 },
        ]) {
            const back = ecefToGeodetic(geodeticToEcef(p.lat, p.lon));
            expect(back.latDeg).toBeCloseTo(p.lat, 9);
            expect(back.lonDeg).toBeCloseTo(p.lon, 9);
            expect(back.altitudeKm).toBeCloseTo(0, 9);
        }
    });

    it('round-trips ECEF → ECI → ECEF', () => {
        const p = geodeticToEcef(45, 30, 100);
        const theta = 1.234;
        const back = eciToEcef(ecefToEci(p, theta), theta);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
        expect(back.z).toBeCloseTo(p.z, 9);
    });

    it('leaves the polar axis unchanged when rotating about it', () => {
        const p = geodeticToEcef(90, 0);
        expect(ecefToEci(p, 2.5).z).toBeCloseTo(p.z, 12);
        expect(ecefToEci(p, 2.5).x).toBeCloseTo(0, 9);
    });
});
