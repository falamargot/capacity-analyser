/**
 * V-B — ENG site geometry against NASA GMAT R2026a.
 *
 * Phase 1 of the plan in `docs/SPATIAL_PHYSICS_AUDIT.md` §9. Before that audit,
 * every ENG spatial test was self-referential: it checked internal consistency
 * or restated the implementation. SPA-04 recorded that ENG therefore held the
 * same evidential position REVISIT held before R4 — many passing tests, no
 * external authority — and R4 showed empirically that this can hide a defect
 * large enough to move a headline number.
 *
 * This is the first external check ENG has ever had.
 *
 * ── WHY THIS ORACLE IS INDEPENDENT ──────────────────────────────────────────
 * The fixture is GMAT's own topocentric state of a satellite relative to three
 * ground stations. Crucially it does NOT pass through `satellite.js`:
 *
 *   - GMAT propagates its own trajectory from Keplerian elements;
 *   - GMAT converts to its own Earth-fixed frame (full IAU chain with EOP);
 *   - GMAT computes the topocentric vector with its own WGS84 station model.
 *
 * We feed the code under test only GMAT's published geodetic latitude,
 * longitude and altitude, and compare against GMAT's independently computed
 * topocentric vector. No constant, frame, Earth model or line of code is shared
 * between the two sides. That is the property the R4 post-mortem said to check
 * explicitly, so it is stated explicitly here.
 *
 * Residual correlation, stated rather than glossed: both sides take "geodetic
 * latitude and height above the WGS84 ellipsoid" to mean the same thing. That
 * is a standards-level definition, and it was confirmed empirically — with the
 * station placed at the sub-satellite point, GMAT's topocentric Z equalled its
 * reported altitude to all printed digits.
 *
 * ── AXIS CONVENTION ─────────────────────────────────────────────────────────
 * GMAT's Topocentric axes are SEZ, determined by experiment rather than from
 * documentation: X = South, Y = East, Z = Zenith. Verified two ways — a station
 * directly beneath the satellite gives (0, 0, altitude), and a satellite to the
 * south-east gives (+, +, −).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculateElevationAngle, compute3DDistanceKm } from '../capacityCalculator';
import { distanceKm, elevationDeg } from '../geoConnectivityModel';
import type { SatelliteData } from '../../types/satellites';

interface Site { name: string; lat: number; lng: number; }

/** Matches the fixture header. Altitude is 0 for all three. */
const SITES: Site[] = [
    { name: 'SIN', lat: 1.3521, lng: 103.8198 },
    { name: 'PAR', lat: 48.85, lng: 2.35 },
    { name: 'LYR', lat: 78.2232, lng: 15.6267 },
];

interface Row {
    t: number;
    satLat: number;
    satLng: number;
    satAltKm: number;
    /** GMAT topocentric SEZ per site, km. */
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
            t: v[0],
            satLat: v[1],
            satLng: v[2],
            satAltKm: v[3],
            sez: [
                { s: v[4], e: v[5], z: v[6] },
                { s: v[7], e: v[8], z: v[9] },
                { s: v[10], e: v[11], z: v[12] },
            ],
        });
    }
    return rows;
}

/** GMAT's elevation, from its own topocentric vector. */
const gmatElevationDeg = (p: { s: number; e: number; z: number }) =>
    (Math.atan2(p.z, Math.hypot(p.s, p.e)) * 180) / Math.PI;

/** GMAT's slant range, from its own topocentric vector. */
const gmatRangeKm = (p: { s: number; e: number; z: number }) => Math.hypot(p.s, p.e, p.z);

const rows = loadFixture();

/**
 * Only geometry above the horizon is asserted. Below it the elevation angle is
 * not a quantity ENG acts on, and grazing geometry inflates relative range
 * error without saying anything about the model.
 */
const VISIBLE_ELEVATION_DEG = 10;

describe('V-B — ENG site geometry vs NASA GMAT R2026a', () => {
    it('loads a 24 h three-site fixture with real passes at every latitude', () => {
        expect(rows.length).toBeGreaterThan(1400);
        expect(rows[rows.length - 1].t).toBeCloseTo(24 * 3600, -1);
        for (let i = 0; i < SITES.length; i++) {
            const peak = Math.max(...rows.map((r) => gmatElevationDeg(r.sez[i])));
            expect(peak).toBeGreaterThan(50);
        }
    });

    it('calculateElevationAngle agrees with GMAT at every site', () => {
        for (let i = 0; i < SITES.length; i++) {
            const site = SITES[i];
            let worst = 0;
            let n = 0;
            for (const r of rows) {
                const truth = gmatElevationDeg(r.sez[i]);
                if (truth < VISIBLE_ELEVATION_DEG) continue;
                const sat = {
                    position: { lat: r.satLat, lng: r.satLng, alt: r.satAltKm },
                } as SatelliteData;
                const mine = calculateElevationAngle({ lat: site.lat, lng: site.lng }, sat);
                worst = Math.max(worst, Math.abs(mine - truth));
                n++;
            }
            expect(n).toBeGreaterThan(20);
            // Measured worst case: 4.7e-6 deg (SIN), 5.4e-6 (PAR), 7.2e-6 (LYR)
            // — microdegrees, consistent with the fixture's 6-decimal printing
            // rather than with any modelling difference. The bound keeps ~14x
            // headroom so print precision never flakes the test, while still
            // catching any real change in the Earth model.
            expect(worst).toBeLessThan(1e-4);
        }
    });

    it('compute3DDistanceKm agrees with GMAT slant range at every site', () => {
        for (let i = 0; i < SITES.length; i++) {
            const site = SITES[i];
            let worst = 0;
            for (const r of rows) {
                if (gmatElevationDeg(r.sez[i]) < VISIBLE_ELEVATION_DEG) continue;
                const mine = compute3DDistanceKm(
                    { lat: site.lat, lng: site.lng, alt: 0 },
                    { lat: r.satLat, lng: r.satLng, alt: r.satAltKm }
                );
                worst = Math.max(worst, Math.abs(mine - gmatRangeKm(r.sez[i])));
            }
            // Measured worst case: 0.3 m, 0.4 m, 0.6 m against slant ranges of
            // 1197-3146 km — i.e. agreement to ~2e-7 relative.
            expect(worst).toBeLessThan(0.005);
        }
    });

    it('geoConnectivityModel elevation and range agree with GMAT', () => {
        // The GEO-side implementation is a separate copy (SPA-01). It is
        // exercised here against the same authority so that consolidating the
        // two in Phase 3 has a baseline both must reproduce.
        for (let i = 0; i < SITES.length; i++) {
            const site = SITES[i];
            let worstEl = 0;
            let worstRange = 0;
            for (const r of rows) {
                const truth = gmatElevationDeg(r.sez[i]);
                if (truth < VISIBLE_ELEVATION_DEG) continue;
                const observer = { lat: site.lat, lng: site.lng, altKm: 0 };
                const target = { lat: r.satLat, lng: r.satLng, altKm: r.satAltKm };
                worstEl = Math.max(worstEl, Math.abs(elevationDeg(observer, target) - truth));
                worstRange = Math.max(
                    worstRange,
                    Math.abs(distanceKm(observer, target) - gmatRangeKm(r.sez[i]))
                );
            }
            // Identical to the capacityCalculator figures above, to the digit.
            expect(worstEl).toBeLessThan(1e-4);
            expect(worstRange).toBeLessThan(0.005);
        }
    });

    it('the two ENG elevation implementations agree with each other', () => {
        // Guards the Phase 3 consolidation: if these ever diverge, one of them
        // has stopped matching GMAT above.
        let worst = 0;
        for (let i = 0; i < SITES.length; i++) {
            const site = SITES[i];
            for (const r of rows) {
                if (gmatElevationDeg(r.sez[i]) < VISIBLE_ELEVATION_DEG) continue;
                const sat = {
                    position: { lat: r.satLat, lng: r.satLng, alt: r.satAltKm },
                } as SatelliteData;
                const a = calculateElevationAngle({ lat: site.lat, lng: site.lng }, sat);
                const b = elevationDeg(
                    { lat: site.lat, lng: site.lng, altKm: 0 },
                    { lat: r.satLat, lng: r.satLng, altKm: r.satAltKm }
                );
                worst = Math.max(worst, Math.abs(a - b));
            }
        }
        expect(worst).toBeLessThan(1e-6);
    });
});
