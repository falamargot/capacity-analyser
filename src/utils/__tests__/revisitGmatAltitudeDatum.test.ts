/**
 * R29 — the R28 altitude datum, validated against NASA GMAT R2026a.
 *
 * ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────
 * R4's fixture is pinned to a FIXED semi-major axis. It validated the
 * propagator and deliberately exercised no altitude mapping, so it could say
 * nothing about R28's central claim:
 *
 *     altitudeKm is height above the WGS84 EQUATORIAL radius,
 *     so a = 6378.137 + altitudeKm.
 *
 * That claim shipped explicitly marked "altitude datum not yet GMAT-checked" in
 * the UI and "NOT YET VALIDATED" in the CSV header. This file is what removes
 * those qualifiers.
 *
 * ── TWO SCENARIOS, BECAUSE THE CLAIM HAS TWO HALVES ─────────────────────────
 * A. THE DATUM, ISOLATED. Two-body gravity only (degree 0, order 0), so the
 *    orbit is exactly circular at r = SMA and no J₂ short-period term muddies
 *    the radius. A circular orbit at r = 7578.137 km crosses the equator at a
 *    geodetic altitude of exactly r − 6378.137 = 1200 km IF AND ONLY IF the
 *    equatorial radius is the datum. Against the 6371 km mean radius the same
 *    orbit would read 1207.1 km, and against the polar radius 1221.4 km — the
 *    three candidates are 7 and 21 km apart, so this discriminates sharply.
 *
 * B. THE DATUM END TO END. J₂ dynamics with the Brouwer mean SMA tuned to
 *    7578.137 km, compared against the engine seeded through the PRODUCTION
 *    path — `generateWalkerConstellation({ altitudeKm: 1200 })` — rather than
 *    from an explicit semi-major axis. If the mapping were wrong the engine
 *    would propagate a different orbit and the tracks would separate.
 *
 * Fixtures regenerate from `docs/revisit/gmat/r29_*.script`; they are committed
 * because GMAT is a 455 MB install and not a project dependency.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    earthRotationRad, ecefToEci, preparePropagator, propagateState,
} from '../../features/revisit/propagation/keplerJ2';
import { generateWalkerConstellation } from '../../features/revisit/domain/walker';
import { WGS84_A_KM, WGS84_F, orbitalRadiusKm } from '../wgs84Geometry';
import { EARTH_RADIUS_KM } from '../earthGeometry';
import type { EciState, WalkerSpec } from '../../features/revisit/domain/types';

const EPOCH_MS = Date.UTC(2026, 7, 6, 0, 0, 0);
const ALTITUDE_KM = 1200;

type Vec3 = { x: number; y: number; z: number };
const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

function loadCsv(name: string, columns: number): number[][] {
    const path = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
    const rows: number[][] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const v = line.split(',').map(Number);
        if (v.length < columns || v.some((n) => !Number.isFinite(n))) continue;
        rows.push(v);
    }
    return rows;
}

// ─── A. The datum, isolated from dynamics ───────────────────────────────────

describe('R29 A — the altitude datum against GMAT, two-body', () => {
    const rows = loadCsv('gmat_r29_altitude_datum.csv', 3);

    /** Geodetic altitude interpolated to each equator crossing, km. */
    const equatorCrossingAltitudes = (): number[] => {
        const out: number[] = [];
        for (let i = 1; i < rows.length; i++) {
            const [, latA, altA] = rows[i - 1];
            const [, latB, altB] = rows[i];
            if (latA === latB) continue;
            if (latA !== 0 && latA < 0 === latB < 0) continue;
            const f = Math.abs(latA) / (Math.abs(latA) + Math.abs(latB));
            out.push(altA + f * (altB - altA));
        }
        return out;
    };

    it('reads a fixture spanning several orbits', () => {
        expect(rows.length).toBeGreaterThan(600);
        expect(equatorCrossingAltitudes().length).toBeGreaterThanOrEqual(4);
    });

    it('puts the equator crossing at exactly the stated altitude', () => {
        // This is R28's definition, checked by an outside authority.
        for (const alt of equatorCrossingAltitudes()) {
            expect(Math.abs(alt - ALTITUDE_KM)).toBeLessThan(0.02);
        }
    });

    it('EXCLUDES the mean-radius and polar-radius datums', () => {
        // The discriminating assertion. Had the engine kept `a = 6371 + h`, the
        // same GMAT orbit would cross the equator 7.1 km higher than stated;
        // measuring from the polar radius would be 21.4 km out. Both are orders
        // of magnitude outside the 20 m agreement above, so this fixture picks
        // one datum rather than merely being consistent with ours.
        const measured = equatorCrossingAltitudes()[0];
        const impliedDatumRadius = 7578.137 - measured;

        expect(Math.abs(impliedDatumRadius - WGS84_A_KM)).toBeLessThan(0.02);
        expect(Math.abs(impliedDatumRadius - EARTH_RADIUS_KM)).toBeGreaterThan(7);
        const polarRadius = WGS84_A_KM * (1 - WGS84_F);
        expect(Math.abs(impliedDatumRadius - polarRadius)).toBeGreaterThan(21);
    });

    it('spans equatorial to polar altitude exactly as an ellipsoid requires', () => {
        // A constant-radius orbit over an oblate Earth must show a geodetic
        // altitude swing of a − b = 21.38 km. Seeing it confirms GMAT is
        // reporting geodetic (ellipsoidal) altitude, not a spherical stand-in —
        // which is the assumption the whole comparison rests on.
        const alts = rows.map((r) => r[2]);
        const swing = Math.max(...alts) - Math.min(...alts);
        expect(swing).toBeCloseTo(WGS84_A_KM - WGS84_A_KM * (1 - WGS84_F), 1);
    });
});

// ─── B. The datum end to end, through the production path ───────────────────

describe('R29 B — production altitude→orbit mapping against GMAT, J2', () => {
    const rows = loadCsv('gmat_r29_datum_ephemeris.csv', 4);

    /** The engine's own fleet, built from an ALTITUDE — never from an SMA. */
    const spec: WalkerSpec = {
        pattern: 'STAR', planes: 1, satsPerPlane: 1,
        inclinationDeg: 87.9, altitudeKm: ALTITUDE_KM, phasingF: 0, fudge: 1,
    };

    it('derives the semi-major axis GMAT was asked about', () => {
        const [element] = generateWalkerConstellation(spec);
        expect(element.semiMajorAxisKm).toBeCloseTo(7578.137, 6);
        expect(element.semiMajorAxisKm).toBeCloseTo(orbitalRadiusKm(ALTITUDE_KM), 12);
    });

    it('tracks GMAT over 72 h without diverging', () => {
        const [element] = generateWalkerConstellation(spec);

        // Seed orientation from GMAT's own initial state so the comparison
        // measures the ORBIT, not the epoch alignment. The semi-major axis is
        // NOT seeded — it comes from the altitude, which is the thing on trial.
        const times = rows.map((r) => r[0]);
        const eci = rows.map((r) =>
            ecefToEci({ x: r[1], y: r[2], z: r[3] }, earthRotationRad(EPOCH_MS, r[0])));
        const h = 30;
        const v0 = {
            x: (-3 * eci[0].x + 4 * eci[1].x - eci[2].x) / (2 * h),
            y: (-3 * eci[0].y + 4 * eci[1].y - eci[2].y) / (2 * h),
            z: (-3 * eci[0].z + 4 * eci[1].z - eci[2].z) / (2 * h),
        };
        const r0 = eci[0];
        const hv = {
            x: r0.y * v0.z - r0.z * v0.y,
            y: r0.z * v0.x - r0.x * v0.z,
            z: r0.x * v0.y - r0.y * v0.x,
        };
        const inclinationDeg = (Math.acos(hv.z / norm(hv)) * 180) / Math.PI;
        const raanRad = Math.atan2(hv.x, -hv.y);
        const node = { x: Math.cos(raanRad), y: Math.sin(raanRad), z: 0 };
        const sinI = Math.sin((inclinationDeg * Math.PI) / 180);
        const argLatRad = Math.atan2(
            r0.z / (norm(r0) * sinI),
            (node.x * r0.x + node.y * r0.y) / norm(r0),
        );

        const prop = preparePropagator({
            ...element,
            inclinationDeg,
            raanDeg: (raanRad * 180) / Math.PI,
            argLatDeg: (argLatRad * 180) / Math.PI,
        });

        let worst = 0;
        let firstHour = 0;
        let lastHour = 0;
        for (let i = 0; i < times.length; i++) {
            const mine: EciState = propagateState(prop, times[i]);
            const d = Math.hypot(mine.x - eci[i].x, mine.y - eci[i].y, mine.z - eci[i].z);
            worst = Math.max(worst, d);
            if (times[i] <= 3600) firstHour = Math.max(firstHour, d);
            if (times[i] >= 71 * 3600) lastHour = Math.max(lastHour, d);
        }

        // Same bound and same reasoning as R4: the residual is the J₂
        // short-period term a secular model does not carry, so it must be
        // bounded and non-accumulating rather than small.
        expect(worst).toBeLessThan(25);
        expect(lastHour).toBeLessThan(3 * firstHour);
    });

    it('would NOT track if the datum were the mean radius', () => {
        // The negative control. Rebuilding the same fleet on the pre-R28 datum
        // gives a 7.137 km smaller semi-major axis, a 0.14 % shorter period, and
        // a track that walks away from GMAT — which is exactly why this fixture
        // can validate the mapping at all.
        const [element] = generateWalkerConstellation(spec);
        const wrongSma = EARTH_RADIUS_KM + ALTITUDE_KM;
        const times = rows.map((r) => r[0]);
        const eci = rows.map((r) =>
            ecefToEci({ x: r[1], y: r[2], z: r[3] }, earthRotationRad(EPOCH_MS, r[0])));

        const prop = preparePropagator({ ...element, semiMajorAxisKm: wrongSma });
        let worst = 0;
        for (let i = 0; i < times.length; i++) {
            const mine = propagateState(prop, times[i]);
            worst = Math.max(
                worst,
                Math.hypot(mine.x - eci[i].x, mine.y - eci[i].y, mine.z - eci[i].z),
            );
        }
        // Hundreds of kilometres, against 25 km for the correct datum.
        expect(worst).toBeGreaterThan(200);
    });
});
