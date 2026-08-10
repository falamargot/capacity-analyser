/**
 * V-C — the GSO belt separation geometry, against NASA GMAT R2026a.
 *
 * Phase 2 of `docs/SPATIAL_PHYSICS_AUDIT.md` §9, validating the SPA-02
 * correction: `gsoProtection` now builds its ECEF vectors on the WGS84
 * ellipsoid instead of a 6371 km sphere fed geodetic latitudes.
 *
 * ── HOW THIS IS GMAT-BACKED WITHOUT A NEW GMAT RUN ──────────────────────────
 * The belt separation decomposes into exactly three things:
 *
 *   1. the ground point's ECEF position      — WGS84, GMAT-verified (V-B)
 *   2. the satellite's ECEF position         — WGS84, GMAT-verified (V-B)
 *   3. the belt point's ECEF position        — r = GEO_ORBIT_RADIUS_KM in the
 *                                              equatorial plane of the
 *                                              Earth-fixed frame. A DEFINITION.
 *                                              No Earth model enters it.
 *
 * plus the angle between two difference vectors, which is arithmetic.
 *
 * So the reused V-B fixture — GMAT's own topocentric state of a satellite
 * relative to three ground stations — carries the whole evidential load. What
 * V-B did not pin down was the *direction* as a full 3-D quantity: it asserted
 * elevation and range, which leave azimuth free. The first test below closes
 * that gap, and it does so **frame-invariantly**: the angle between two
 * directions is the same in any orthonormal frame, so GMAT's SEZ vectors can be
 * compared against our ECEF vectors with no basis construction of our own
 * standing between them. Building an SEZ basis here would have re-introduced
 * exactly the correlation this is meant to avoid.
 *
 * ── WHY NOT A FRESH GMAT SCENARIO ───────────────────────────────────────────
 * A V-C run with real spacecraft parked on the belt was prepared and would have
 * been marginally more direct. The GMAT install lives in a session scratchpad
 * that had been cleaned, and re-downloading 455 MB to re-derive a quantity that
 * decomposes into two already-verified components and one definition is not a
 * good trade. This is recorded rather than glossed: the belt-point leg of the
 * geometry rests on a definition, not on an executable oracle.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    GSO_KEEPOUT_ANGLE_DEG,
    gsoBeltSeparationAngleDeg,
    gsoPointSeparationAngleDeg,
} from '../gsoProtection';
import { calculateElevationAngle } from '../capacityCalculator';
import type { SatelliteData } from '../../types/satellites';

const SITES = [
    { name: 'SIN', lat: 1.3521, lng: 103.8198 },
    { name: 'PAR', lat: 48.85, lng: 2.35 },
    { name: 'LYR', lat: 78.2232, lng: 15.6267 },
];

interface Row {
    satLat: number; satLng: number; satAltKm: number;
    sez: Array<{ s: number; e: number; z: number }>;
}

function loadFixture(): Row[] {
    const path = fileURLToPath(new URL('./fixtures/gmat_vb_site_geometry.csv', import.meta.url));
    const rows: Row[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line || line.startsWith('#')) continue;
        const v = line.split(',').map(Number);
        if (v.length < 13 || v.some((n) => !Number.isFinite(n))) continue;
        rows.push({
            satLat: v[1], satLng: v[2], satAltKm: v[3],
            sez: [
                { s: v[4], e: v[5], z: v[6] },
                { s: v[7], e: v[8], z: v[9] },
                { s: v[10], e: v[11], z: v[12] },
            ],
        });
    }
    return rows;
}

const WGS84_A = 6378.137;
const WGS84_E2 = 2 * (1 / 298.257223563) - (1 / 298.257223563) ** 2;

/** The same WGS84 conversion the corrected `gsoProtection` performs. */
function ecef(latDeg: number, lngDeg: number, altKm: number) {
    const lat = (latDeg * Math.PI) / 180;
    const lng = (lngDeg * Math.PI) / 180;
    const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2);
    return {
        x: (n + altKm) * Math.cos(lat) * Math.cos(lng),
        y: (n + altKm) * Math.cos(lat) * Math.sin(lng),
        z: (n * (1 - WGS84_E2) + altKm) * Math.sin(lat),
    };
}

type V3 = { x: number; y: number; z: number };
const angleDeg = (a: V3, b: V3) => {
    const d = a.x * b.x + a.y * b.y + a.z * b.z;
    const na = Math.hypot(a.x, a.y, a.z);
    const nb = Math.hypot(b.x, b.y, b.z);
    return (Math.acos(Math.min(1, Math.max(-1, d / (na * nb)))) * 180) / Math.PI;
};

const rows = loadFixture();
const VISIBLE = 10;
const gmatElev = (p: { s: number; e: number; z: number }) =>
    (Math.atan2(p.z, Math.hypot(p.s, p.e)) * 180) / Math.PI;

describe('V-C — GSO belt geometry vs NASA GMAT R2026a', () => {
    it('reproduces GMAT angles between satellite directions, frame-invariantly', () => {
        // The load-bearing test. For each station, take every pair of visible
        // satellite positions and measure the angle subtended at that station.
        // GMAT gives it from its own topocentric vectors; we compute it from
        // WGS84 ECEF differences. Agreement means our station and satellite
        // ECEF positions, and the angle arithmetic applied to them, match an
        // external authority — which is precisely what the belt separation is
        // made of.
        for (let i = 0; i < SITES.length; i++) {
            const site = SITES[i];
            const visible = rows.filter((r) => gmatElev(r.sez[i]) >= VISIBLE);
            expect(visible.length).toBeGreaterThan(20);

            const g = ecef(site.lat, site.lng, 0);
            let worst = 0;
            let pairs = 0;
            for (let a = 0; a < visible.length; a += 3) {
                for (let b = a + 3; b < visible.length; b += 7) {
                    const pa = ecef(visible[a].satLat, visible[a].satLng, visible[a].satAltKm);
                    const pb = ecef(visible[b].satLat, visible[b].satLng, visible[b].satAltKm);
                    const mine = angleDeg(
                        { x: pa.x - g.x, y: pa.y - g.y, z: pa.z - g.z },
                        { x: pb.x - g.x, y: pb.y - g.y, z: pb.z - g.z },
                    );
                    const sa = visible[a].sez;
                    const sb = visible[b].sez;
                    const truth = angleDeg(
                        { x: sa[i].s, y: sa[i].e, z: sa[i].z },
                        { x: sb[i].s, y: sb[i].e, z: sb[i].z },
                    );
                    worst = Math.max(worst, Math.abs(mine - truth));
                    pairs++;
                }
            }
            expect(pairs).toBeGreaterThan(20);
            // Measured worst case is ~2e-4 deg, set by the fixture's 6-decimal
            // printing. A spherical-Earth regression here would show as ~0.1 deg.
            expect(worst).toBeLessThan(0.01);
        }
    });

    it('satisfies the zenith invariant: equatorial station, belt point overhead', () => {
        // An exact analytic tie between the belt geometry and elevation. For a
        // station on the equator, the WGS84 geodetic vertical lies in the
        // equatorial plane and points at the belt longitude directly overhead,
        // so the belt point at that longitude sits exactly at zenith. The
        // separation to it must therefore be 90 deg minus the satellite's
        // elevation — and `calculateElevationAngle` is itself GMAT-verified
        // (V-B, 7e-6 deg), so this chains onto external evidence rather than
        // restating the implementation.
        for (const lng of [-140, -35, 0, 12, 97, 175]) {
            for (const satLat of [-20, -5, 0, 8, 25]) {
                for (const dLng of [-12, -3, 0, 4, 15]) {
                    const satLng = lng + dLng;
                    const sep = gsoPointSeparationAngleDeg(0, lng, satLat, satLng, 1200, lng);
                    const elev = calculateElevationAngle(
                        { lat: 0, lng },
                        { position: { lat: satLat, lng: satLng, alt: 1200 } } as SatelliteData,
                    );
                    // Holds to ~1.2e-6 deg. The residual is float-level, not
                    // modelling: the dot product mixes a 42164 km belt vector
                    // with a 6378 km station vector, and `acos` amplifies the
                    // resulting rounding by 1/sin(theta).
                    expect(Math.abs(sep - (90 - elev))).toBeLessThan(1e-5);
                }
            }
        }
    });

    it('takes the belt minimum at or below every sampled belt point', () => {
        // The minimum returned by the scan must dominate any individual point,
        // and must be attained: this catches a scan that misses the true
        // minimum, which a point-wise test alone cannot see.
        for (const site of SITES) {
            for (const r of rows.slice(0, 400)) {
                const min = gsoBeltSeparationAngleDeg(
                    site.lat, site.lng, r.satLat, r.satLng, r.satAltKm,
                );
                let sampledMin = Infinity;
                for (let lon = -180; lon < 180; lon += 2) {
                    sampledMin = Math.min(
                        sampledMin,
                        gsoPointSeparationAngleDeg(
                            site.lat, site.lng, r.satLat, r.satLng, r.satAltKm, lon,
                        ),
                    );
                }
                expect(min).toBeLessThanOrEqual(sampledMin + 1e-9);
                // The 5 deg coarse scan plus 0.25 deg refinement should land
                // within the curvature of a 2 deg sampling, not far below it.
                expect(min).toBeGreaterThan(sampledMin - 0.5);
            }
        }
    });

    it('pins the size of the SPA-02 correction', () => {
        // The old model, reproduced here so the change is documented and a
        // silent revert to the sphere is loud rather than invisible.
        const R = 6371;
        const sphericalSep = (
            gLat: number, gLng: number, sLat: number, sLng: number, sAlt: number,
        ): number => {
            const sph = (la: number, lo: number, r: number) => ({
                x: r * Math.cos((la * Math.PI) / 180) * Math.cos((lo * Math.PI) / 180),
                y: r * Math.cos((la * Math.PI) / 180) * Math.sin((lo * Math.PI) / 180),
                z: r * Math.sin((la * Math.PI) / 180),
            });
            const g = sph(gLat, gLng, R);
            const p = sph(sLat, sLng, R + sAlt);
            const toSat = { x: p.x - g.x, y: p.y - g.y, z: p.z - g.z };
            let best = Infinity;
            for (let t = 0; t < 360; t += 0.25) {
                const th = (t * Math.PI) / 180;
                best = Math.min(best, angleDeg(toSat, {
                    x: 42164 * Math.cos(th) - g.x,
                    y: 42164 * Math.sin(th) - g.y,
                    z: -g.z,
                }));
            }
            return best;
        };

        let worst = 0;
        let flips = 0;
        let total = 0;
        for (let satLat = -44; satLat <= 44; satLat += 4) {
            for (let beam = 0; beam < 16; beam++) {
                const gLat = satLat + ((beam - 7.5) * 67.5) / 111.32;
                const now = gsoBeltSeparationAngleDeg(gLat, 0, satLat, 0, 1200);
                const before = sphericalSep(gLat, 0, satLat, 0, 1200);
                worst = Math.max(worst, Math.abs(now - before));
                if ((now < GSO_KEEPOUT_ANGLE_DEG) !== (before < GSO_KEEPOUT_ANGLE_DEG)) flips++;
                total++;
            }
        }
        // Audit measured 0.113 deg worst and 0.062 % of beam-instants flipping
        // across a finer sweep. Bounds here are deliberately loose: the point is
        // to record the order of magnitude, not to freeze a sampling artefact.
        expect(worst).toBeGreaterThan(0.02);
        expect(worst).toBeLessThan(0.25);
        expect(flips / total).toBeLessThan(0.02);
    });
});
