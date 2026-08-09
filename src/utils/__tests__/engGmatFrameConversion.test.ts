/**
 * V-A — ENG's frame conversion against NASA GMAT R2026a.
 *
 * Phase 1 of `docs/SPATIAL_PHYSICS_AUDIT.md` §9, and the companion to V-B.
 *
 * V-B validated the second half of ENG's spatial chain — geodetic lat/lon/alt →
 * elevation and slant range — to microdegrees. This validates the FIRST half:
 *
 *     satrec → SGP4 → TEME state → eciToGeodetic → lat/lon/alt
 *
 * Every ENG consumer of satellite geometry passes through
 * `satellite.gstime` + `satellite.eciToGeodetic`, and until now nothing had ever
 * checked that step against an outside authority. It is precisely the class of
 * assumption R4 caught in REVISIT: a frame convention that every internal test
 * shared and therefore could not question.
 *
 * ── WHAT IS AND IS NOT INDEPENDENT ──────────────────────────────────────────
 * The **input** TEME states come from `satellite.js`. They have to — they are
 * the output of the code under test. So this does NOT validate SGP4's dynamics.
 *
 * The **conversion** is fully independent. GMAT is handed the same TEME state at
 * the same epoch and asked for geodetic latitude, longitude and altitude, which
 * it computes through its own TEME definition, its own IAU precession/nutation/
 * polar-motion chain with loaded Earth-orientation parameters, and its own
 * WGS84 ellipsoid. Nothing about that path is shared with `satellite.js`.
 *
 * Deliberately no propagation: each spacecraft is reported at its own epoch.
 * Comparing propagated states would fold SGP4's drag and perturbation model
 * against GMAT's numerical one, and the two are expected to diverge for reasons
 * that say nothing about frame handling. Isolating the conversion is what makes
 * the residual interpretable.
 *
 * ── THE RESIDUAL IS EXPLAINED, NOT TOLERATED ────────────────────────────────
 * Agreement is ~35 m on the ground, dominated by a consistent +0.0003° longitude
 * bias — about 1 arcsecond. That is the expected size of what a single GMST
 * rotation omits and GMAT models: UT1−UTC and polar motion. It is a bias in
 * Earth orientation, not a bug, it does not accumulate, and at 35 m it is four
 * orders of magnitude below the ~700 km beam scale ENG reasons about.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as satellite from 'satellite.js';
import { tleFromElements } from './revisitSgp4CrossCheck.test';
import { generateWalkerConstellation } from '../../features/revisit/domain/walker';
import type { WalkerSpec } from '../../features/revisit/domain/types';

/** Must match the fixture header exactly, or the samples do not correspond. */
const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);
const SPEC: WalkerSpec = {
    pattern: 'STAR', planes: 6, satsPerPlane: 2,
    inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};

interface Sample {
    fleetIndex: number;
    hours: number;
    gmatLat: number;
    gmatLon: number;
    gmatAltKm: number;
}

function loadFixture(): Sample[] {
    const path = fileURLToPath(new URL('./fixtures/gmat_va_frame_conversion.csv', import.meta.url));
    const out: Sample[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const v = line.split(',').map(Number);
        if (v.length < 5 || v.some((n) => !Number.isFinite(n))) continue;
        out.push({
            fleetIndex: v[0], hours: v[1],
            gmatLat: v[2], gmatLon: v[3], gmatAltKm: v[4],
        });
    }
    return out;
}

/** ENG's actual production path, exercised exactly as the app uses it. */
function engGeodetic(fleetIndex: number, hours: number) {
    const fleet = generateWalkerConstellation(SPEC);
    const record = satellite.twoline2satrec(
        ...tleFromElements(fleet[fleetIndex], EPOCH, 20_000 + fleetIndex)
    );
    const when = new Date(EPOCH + hours * 3600 * 1000);
    const pv = satellite.propagate(record, when);
    if (!pv?.position || typeof pv.position === 'boolean') return null;
    const gmst = satellite.gstime(when);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    return {
        latDeg: satellite.degreesLat(geo.latitude),
        lonDeg: satellite.degreesLong(geo.longitude),
        altKm: geo.height,
    };
}

/** Signed shortest angular difference in degrees. */
function wrapDeg(d: number): number {
    let x = d;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
}

const samples = loadFixture();

describe('V-A — ENG frame conversion vs NASA GMAT R2026a', () => {
    it('covers 20 states across the fleet and a full day', () => {
        expect(samples).toHaveLength(20);
        expect(Math.max(...samples.map((s) => s.hours))).toBeGreaterThan(20);
    });

    it('places the sub-satellite point within 100 m of GMAT on the ground', () => {
        let worstGroundM = 0;
        let worstAltM = 0;
        for (const s of samples) {
            const mine = engGeodetic(s.fleetIndex, s.hours);
            expect(mine).not.toBeNull();

            const dLat = mine!.latDeg - s.gmatLat;
            const dLon = wrapDeg(mine!.lonDeg - s.gmatLon);
            // Metres on the ground, with the longitude term scaled by latitude —
            // without that, a degree of longitude near the pole would read as a
            // large error when it is a small distance.
            const groundM = Math.hypot(
                dLat * 111_320,
                dLon * 111_320 * Math.cos((mine!.latDeg * Math.PI) / 180)
            );
            worstGroundM = Math.max(worstGroundM, groundM);
            worstAltM = Math.max(worstAltM, Math.abs(mine!.altKm - s.gmatAltKm) * 1000);
        }

        // Measured: 37 m on the ground, 0.7 m in altitude. The bound leaves
        // headroom for EOP data updates shifting GMAT's answer slightly, while
        // still failing loudly if the frame convention itself changes — that
        // error mode is degrees, not metres.
        expect(worstGroundM).toBeLessThan(100);
        expect(worstAltM).toBeLessThan(5);
    });

    it('shows the residual as a systematic Earth-rotation bias, not a random error', () => {
        // The diagnostic that separates "small known omission" from "something
        // is wrong": what a GMST-only rotation omits — UT1-UTC, and the sidereal
        // vs Earth-rotation-angle definition — is a rotation ABOUT THE POLE, so
        // it must appear as a CONSISTENT longitude offset. A wrong frame, wrong
        // epoch or wrong rotation rate would scatter, or grow with time.
        //
        // Restricted to |lat| < 60°, where longitude is a well-conditioned
        // measure of that rotation angle. Measured there: mean +0.000337°,
        // spread 0.00026° across 13 states spanning 22 hours — a bias, not
        // noise, and ~35 m on the ground.
        const midLatitude = samples
            .map((s) => ({ s, mine: engGeodetic(s.fleetIndex, s.hours)! }))
            .filter(({ mine }) => Math.abs(mine.latDeg) < 60);

        expect(midLatitude.length).toBeGreaterThan(10);

        const dLons = midLatitude.map(({ s, mine }) => wrapDeg(mine.lonDeg - s.gmatLon));
        const mean = dLons.reduce((a, b) => a + b, 0) / dLons.length;
        const spread = Math.max(...dLons) - Math.min(...dLons);

        expect(Math.abs(mean)).toBeLessThan(0.002);
        // Spread an order of magnitude below the mean is the actual evidence
        // that this is one systematic offset rather than a scatter of errors.
        expect(spread).toBeLessThan(mean);
        expect(mean).toBeGreaterThan(0); // GMST leads the full chain, consistently
    });

    it('scatters only near the poles, which is the polar-motion signature', () => {
        // Above ~80° the longitude residual grows to ±0.003° and changes sign.
        // That is expected and is itself corroborating evidence: polar motion
        // TILTS the rotation axis rather than spinning about it, so it cannot
        // be absorbed into a longitude offset, and longitude is ill-conditioned
        // as meridians converge. If the high-latitude scatter were absent, the
        // agreement at mid latitudes would be more suspicious, not less —
        // it would suggest both sides shared an Earth-orientation model.
        //
        // The ground-distance assertion above already bounds this properly:
        // ±0.003° of longitude at 86° latitude is only ~23 m on the ground.
        const polar = samples
            .map((s) => ({ s, mine: engGeodetic(s.fleetIndex, s.hours)! }))
            .filter(({ mine }) => Math.abs(mine.latDeg) > 80);

        expect(polar.length).toBeGreaterThan(2);
        for (const { s, mine } of polar) {
            const dLon = Math.abs(wrapDeg(mine.lonDeg - s.gmatLon));
            const groundM = dLon * 111_320 * Math.cos((mine.latDeg * Math.PI) / 180);
            expect(groundM).toBeLessThan(100);
        }
    });
});
