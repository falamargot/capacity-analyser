/**
 * R4 — cross-check the REVISIT propagator against NASA GMAT R2026a.
 *
 * GMAT is the external authority R4 names. It is an independent implementation
 * of an independent theory: numerical Runge-Kutta 8(9) integration of a real
 * spherical-harmonic gravity field, against this engine's closed-form Kepler +
 * J2 secular model. Critically, GMAT also computes the Earth-fixed frame from
 * the full IAU precession/nutation/polar-motion chain with loaded EOP, where
 * this engine uses a single GMST rotation — so unlike the SGP4 cross-check,
 * this one *can* see an error in the ECI-is-ECEF-rotated-by-GMST convention.
 *
 * SCOPE: this is a FIXED-SEMI-MAJOR-AXIS regression. It says nothing about the
 * altitude datum — see `REFERENCE_SMA_KM` below.
 *
 * The fixture was produced by `docs/revisit/gmat/r4_eph.script`, run headless
 * with `GmatConsole --run`. Force model: Earth JGM2 degree 2, order 0 (J2 only,
 * no tesserals), no drag, no SRP, no third bodies — the closest numerical
 * analogue of what this engine claims to model. Osculating SMA was tuned so the
 * Brouwer mean SMA lands on 7571.013 km. (At the time the fixture was made that
 * was what the engine meant by "altitude 1200 km"; since R28 it is not, which is
 * exactly why the test pins the SMA rather than the altitude.)
 *
 * The fixture is committed because regenerating it requires a 455 MB install.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    earthRotationRad,
    ecefToEci,
    ecefToGeodetic,
    eciToEcef,
    preparePropagator,
    propagateState,
} from '../../features/revisit/propagation/keplerJ2';
import { isTargetInFov, prepareFov, targetEciAt } from '../../features/revisit/fov/containment';
import { FOV_PRESETS, TARGET_PRESETS } from '../../features/revisit/domain/presets';
import type { EciState, OrbitalElements, Target } from '../../features/revisit/domain/types';

/** Epoch of the GMAT run: 06 Aug 2026 00:00:00.000 UTC. */
const EPOCH_MS = Date.UTC(2026, 7, 6, 0, 0, 0);

/**
 * FIXED SEMI-MAJOR AXIS — deliberately, and not an altitude.
 *
 * 7571 km is the value GMAT was asked about. It happens to be what the engine
 * derived from "1200 km altitude" under the pre-R28 datum, but this fixture is
 * pinned to the SMA itself and must stay that way.
 *
 * **This test therefore validates the PROPAGATOR, not the altitude convention.**
 * R28 changed how `altitudeKm` maps to a semi-major axis; nothing here exercises
 * that mapping, and no external-validation claim for the R28 datum may rest on
 * this fixture. Closing that gap needs a new GMAT run seeded from the equatorial
 * datum — recorded as outstanding in docs/SPATIAL_PHYSICS_AUDIT.md.
 */
const REFERENCE_SMA_KM = 7571;
const REFERENCE_INCLINATION_DEG = 87.9;

type Vec3 = { x: number; y: number; z: number };

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const norm = (a: Vec3) => Math.sqrt(dot(a, a));
const unit = (a: Vec3): Vec3 => {
    const n = norm(a);
    return { x: a.x / n, y: a.y / n, z: a.z / n };
};
const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
});

interface Sample {
    t: number;
    ecef: Vec3;
    /** GMAT's Earth-fixed position rotated into the engine's ECI by its own GMST. */
    eci: Vec3;
}

function loadFixture(): Sample[] {
    const path = fileURLToPath(new URL('./fixtures/gmat_r4_reference_ephemeris.csv', import.meta.url));
    const rows: Sample[] = [];
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        const parts = line.trim().split(',');
        if (parts.length < 4) continue;
        const nums = parts.map(Number);
        if (nums.some((n) => !Number.isFinite(n))) continue; // header
        const [t, x, y, z] = nums;
        const ecef = { x, y, z };
        rows.push({ t, ecef, eci: ecefToEci(ecef, earthRotationRad(EPOCH_MS, t)) });
    }
    return rows;
}

/**
 * Velocity by second-order finite difference of the ECI track.
 *
 * GMAT reported position only. At 30 s spacing on a ~6900 s orbit the truncation
 * error is ~1e-5 relative, four orders below anything the FOV test resolves.
 */
function velocityAt(s: Sample[], i: number): Vec3 {
    const h = s[1].t - s[0].t;
    if (i === 0) {
        const [a, b, c] = [s[0].eci, s[1].eci, s[2].eci];
        return {
            x: (-3 * a.x + 4 * b.x - c.x) / (2 * h),
            y: (-3 * a.y + 4 * b.y - c.y) / (2 * h),
            z: (-3 * a.z + 4 * b.z - c.z) / (2 * h),
        };
    }
    if (i === s.length - 1) return velocityAt(s, i - 1);
    const p = s[i - 1].eci;
    const n = s[i + 1].eci;
    return { x: (n.x - p.x) / (2 * h), y: (n.y - p.y) / (2 * h), z: (n.z - p.z) / (2 * h) };
}

/**
 * Seed the engine from GMAT's own initial state.
 *
 * Inclination, RAAN and argument of latitude are *read off* GMAT so both sides
 * start from the same physical point — that removes the frame-alignment
 * question (GMAT's MJ2000Eq is J2000; the engine's ECI is GMST-of-date, and the
 * two differ by ~0.36° of precession in 2026) and leaves the test measuring
 * propagation, not initialisation.
 *
 * The semi-major axis is NOT fitted: it is the fixed `REFERENCE_SMA_KM` the
 * fixture was generated at. It is supplied directly rather than via an altitude,
 * so the altitude datum plays no part in this comparison.
 */
function seedFromGmat(samples: Sample[]): OrbitalElements {
    const r = samples[0].eci;
    const v = velocityAt(samples, 0);
    const h = cross(r, v);
    const inclinationDeg = (Math.acos(h.z / norm(h)) * 180) / Math.PI;
    const raanRad = Math.atan2(h.x, -h.y);
    const node = { x: Math.cos(raanRad), y: Math.sin(raanRad), z: 0 };
    const sinI = Math.sin((inclinationDeg * Math.PI) / 180);
    const argLatRad = Math.atan2(r.z / (norm(r) * sinI), dot(node, r) / norm(r));
    return {
        id: 'gmat-ref',
        planeIndex: 0,
        satIndexInPlane: 0,
        semiMajorAxisKm: REFERENCE_SMA_KM,
        inclinationDeg,
        raanDeg: (raanRad * 180) / Math.PI,
        argLatDeg: (argLatRad * 180) / Math.PI,
    };
}

/** Radial / along-track / cross-track decomposition in GMAT's own frame. */
function rswOffset(rGmat: Vec3, vGmat: Vec3, rEngine: Vec3) {
    const d = sub(rEngine, rGmat);
    const radial = unit(rGmat);
    const crossTrack = unit(cross(rGmat, vGmat));
    const alongTrack = cross(crossTrack, radial);
    return { r: dot(d, radial), s: dot(d, alongTrack), w: dot(d, crossTrack), total: norm(d) };
}

/** In-view booleans on the fixture's native grid, for an arbitrary ECI track. */
function inViewSeries(
    states: EciState[],
    times: number[],
    target: Target,
    fov: ReturnType<typeof prepareFov>
): boolean[] {
    return states.map((s, i) => isTargetInFov(s, targetEciAt(target, EPOCH_MS, times[i]), fov));
}

/**
 * Gaps between access spans, on the sample grid, boundary-truncated gaps
 * discarded — the same rule as `gapStatistics` (ADR-001 §3), reimplemented here
 * so both sides go through *identical* code and the comparison isolates
 * propagation rather than interval bookkeeping.
 */
function gapsHours(inView: boolean[], times: number[]): number[] {
    const spans: Array<[number, number]> = [];
    let start: number | null = null;
    for (let i = 0; i < inView.length; i++) {
        if (inView[i] && start === null) start = times[i];
        if (!inView[i] && start !== null) {
            spans.push([start, times[i]]);
            start = null;
        }
    }
    if (start !== null) spans.push([start, times[times.length - 1]]);
    const gaps: number[] = [];
    for (let i = 1; i < spans.length; i++) gaps.push((spans[i][0] - spans[i - 1][1]) / 3600);
    return gaps;
}

describe('REVISIT propagation vs NASA GMAT R2026a', () => {
    const samples = loadFixture();
    const elements = seedFromGmat(samples);
    const prop = preparePropagator(elements);
    const times = samples.map((s) => s.t);

    const engineEci: EciState[] = times.map((t) => propagateState(prop, t));
    const engineEcef = engineEci.map((s, i) =>
        eciToEcef({ x: s.x, y: s.y, z: s.z }, earthRotationRad(EPOCH_MS, times[i]))
    );

    it('reads a 72 h fixture at 30 s spacing', () => {
        expect(samples.length).toBeGreaterThan(8000);
        expect(times[times.length - 1]).toBeCloseTo(72 * 3600, 0);
    });

    it('recovers the reference shell geometry from GMAT', () => {
        expect(elements.inclinationDeg).toBeCloseTo(REFERENCE_INCLINATION_DEG, 1);
    });

    it('does not diverge over 72 h — the secular rates are right', () => {
        const offsets = samples.map((s, i) =>
            rswOffset(s.eci, velocityAt(samples, i), engineEci[i])
        );
        const worst = Math.max(...offsets.map((o) => o.total));

        // This is THE load-bearing assertion. A constant offset is a difference
        // of constants; a growing one is a wrong secular rate, which is the
        // failure that corrupts revisit statistics. Measured worst case is
        // 9.0 km, and it oscillates rather than accumulating.
        //
        // Before R4 corrected u̇, this same measurement read 1084 km and grew
        // linearly to the last sample. The bound is set to catch a return of
        // that failure mode with wide margin against float-level churn.
        expect(worst).toBeLessThan(25);

        // The residual is the J₂ SHORT-PERIOD oscillation, which a secular-only
        // model does not represent and is not trying to: GMAT's osculating
        // radius swings from 7572.9 to 7579.7 km about the 7571 km mean the
        // engine draws. So the error is bounded and periodic, not cumulative —
        // the last hour is no worse than the first.
        const firstHour = offsets.slice(0, 120).map((o) => o.total);
        const lastHour = offsets.slice(-120).map((o) => o.total);
        expect(Math.max(...lastHour)).toBeLessThan(3 * Math.max(...firstHour));

        // Cross-track carries the node error, and Ω̇ at this inclination is so
        // small that 72 h of it is under a kilometre.
        expect(Math.max(...offsets.map((o) => Math.abs(o.w)))).toBeLessThan(2);
    });

    it('agrees on the maximum revisit gap at every preset target', () => {
        const fov = prepareFov(FOV_PRESETS.STANDARD);
        const gmatStates: EciState[] = samples.map((s, i) => {
            const v = velocityAt(samples, i);
            return { x: s.eci.x, y: s.eci.y, z: s.eci.z, vx: v.x, vy: v.y, vz: v.z };
        });
        for (const target of TARGET_PRESETS) {
            const gGaps = gapsHours(inViewSeries(gmatStates, times, target, fov), times);
            const eGaps = gapsHours(inViewSeries(engineEci, times, target, fov), times);
            expect(gGaps.length).toBeGreaterThan(0);

            // Equator to high Arctic, the two propagators put every access
            // boundary in the same 30 s sample bin, so the maximum gap agrees
            // exactly. Cape Town is the sharp one: its worst gap spans a
            // marginal grazing pass, and before the u̇ fix the engine missed
            // that pass entirely and reported 12.16 h against GMAT's 23.68 h.
            expect(Math.max(...eGaps)).toBeCloseTo(Math.max(...gGaps), 6);
        }
    });

    it('keeps the ground track aligned — the GMST convention holds', () => {
        // The engine's single GMST rotation against GMAT's full IAU
        // precession/nutation/polar-motion chain. This is the check SGP4 could
        // not provide, since SGP4 shares the GMST convention.
        //
        // Measured on the sub-satellite longitude rather than the position
        // vector: the radial difference here is the J₂ short-period term tested
        // above, and including it would just re-measure that. A wrong rotation
        // angle — wrong rate, wrong epoch, sidereal-vs-solar day — shows up as a
        // longitude bias that grows across the window.
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
            const a = ecefToGeodetic(samples[i].ecef);
            const b = ecefToGeodetic(engineEcef[i]);
            let d = b.lonDeg - a.lonDeg;
            while (d > 180) d -= 360;
            while (d < -180) d += 360;
            sum += d;
        }
        const meanOffsetDeg = sum / samples.length;

        // 0.0065° measured — about 700 m at the equator. Note this bounds the
        // GMST convention only to the extent the J2000-vs-mean-equinox frame
        // difference (~0.36° of precession by 2026) does not enter, and it does
        // not: inclination, node and argument of latitude were all read off
        // GMAT's own state at t = 0, so both tracks start in the engine's frame.
        expect(Math.abs(meanOffsetDeg)).toBeLessThan(0.05);
    });
});
