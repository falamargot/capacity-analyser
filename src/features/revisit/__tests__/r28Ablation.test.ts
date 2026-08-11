/**
 * R28 ablation — WHICH change moved Singapore's worst-case gap?
 *
 * R28 changed two things at once: the orbital semi-major axis (the altitude
 * datum) and the ground model (sphere → ellipsoid). The first write-up
 * attributed the resulting 2 h 39 min shift to the geodetic-vs-geocentric
 * deflection. That attribution was not established, and it is implausible on
 * its face: Singapore sits at 1.35° latitude, where the deflection is ~0.009°,
 * not the 0.19° maximum quoted.
 *
 * This file decomposes the change into a 2×2 and pins the answer, so the
 * documentation cites a measurement rather than a guess.
 *
 * The access scan is reimplemented here — sample, detect sign change, bisect —
 * so that all four configurations go through IDENTICAL code and the only
 * variables are the two under study. Using `computeAccessIntervals` would fix
 * the ground model at the production one and make two of the four cells
 * unreachable.
 */
import { describe, expect, it } from 'vitest';
import { generateWalkerConstellation } from '../domain/walker';
import { selectSubConstellation } from '../domain/subConstellation';
import { FOV_PRESETS } from '../domain/presets';
import { REFERENCE_PROFILES } from '../domain/referenceProfiles';

/**
 * R28's ablation was measured on the 12 x 8 demo shell, and it is pinned to that
 * shell deliberately. R29 made the OneWeb HLD profile the default; following it
 * would silently re-measure the historical record against a different
 * constellation and invalidate every figure this file exists to preserve.
 */
const DEFAULT_REFERENCE = REFERENCE_PROFILES.DEMO_12X8.spec;
const DEFAULT_SELECTION = { planeStride: 3, satStride: 4, planeShift: 0 };
import {
    conservativeReachUpperBoundDeg, groundHalfAngleDeg, maxReachableLatitudeDeg,
    turningLatitudeDeg,
} from '../analysis/explainRevisit';
import { isTargetInFov, prepareFov } from '../fov/containment';
import {
    earthRotationRad, ecefToEci, preparePropagator, propagateState,
} from '../propagation/keplerJ2';
import { geodeticToEcef as wgs84ToEcef, WGS84_A_KM } from '../../../utils/wgs84Geometry';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { v3 } from '../../../utils/sphericalGeometry';
import type { EciState, OrbitalElements } from '../domain/types';
import type { Vec3 } from '../../../utils/sphericalGeometry';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);
const SINGAPORE = { latDeg: 1.3521, lonDeg: 103.8198 };
const WINDOW_S = 72 * 3600;

/** Pre-R28 semi-major axis for "1200 km": the 6371 km mean radius. */
const SMA_OLD = EARTH_RADIUS_KM + DEFAULT_REFERENCE.altitudeKm;
/** Post-R28: the WGS84 equatorial semi-major axis. */
const SMA_NEW = WGS84_A_KM + DEFAULT_REFERENCE.altitudeKm;

type GroundModel = 'sphere' | 'wgs84';

/** The target's ECEF position under each ground model. */
function targetEcef(model: GroundModel): Vec3 {
    if (model === 'wgs84') {
        const e = wgs84ToEcef({ ...SINGAPORE, altKm: 0 });
        return v3(e.x, e.y, e.z);
    }
    // Pre-R28: geodetic latitude treated as geocentric, on a 6371 km sphere.
    const lat = (SINGAPORE.latDeg * Math.PI) / 180;
    const lon = (SINGAPORE.lonDeg * Math.PI) / 180;
    return v3(
        EARTH_RADIUS_KM * Math.cos(lat) * Math.cos(lon),
        EARTH_RADIUS_KM * Math.cos(lat) * Math.sin(lon),
        EARTH_RADIUS_KM * Math.sin(lat),
    );
}

interface Interval { start: number; end: number; clippedStart: boolean; clippedEnd: boolean }

/**
 * Access spans for a fleet against one target, under one ground model.
 *
 * Same shape as production: uniform sampling, bisected transitions, boundary
 * spans flagged so their adjacent gaps can be discarded.
 */
function accessSpans(
    elements: OrbitalElements[], model: GroundModel, stepSeconds: number
): Interval[] {
    const ecef = targetEcef(model);
    const fov = prepareFov(FOV_PRESETS.STANDARD);
    const props = elements.map(preparePropagator);
    const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };

    const targetAt = (t: number) => ecefToEci(ecef, earthRotationRad(EPOCH, t));
    const anyInView = (t: number): boolean => {
        const tgt = targetAt(t);
        for (const p of props) {
            propagateState(p, t, scratch);
            if (isTargetInFov(scratch, tgt, fov)) return true;
        }
        return false;
    };
    const bisect = (lo: number, hi: number, loState: boolean): number => {
        let a = lo;
        let b = hi;
        for (let i = 0; i < 40; i++) {
            const mid = (a + b) / 2;
            if (anyInView(mid) === loState) a = mid; else b = mid;
        }
        return (a + b) / 2;
    };

    const out: Interval[] = [];
    let prevT = 0;
    let prev = anyInView(0);
    let openStart = prev ? 0 : NaN;
    let openClipped = prev;
    const steps = Math.ceil(WINDOW_S / stepSeconds);

    for (let i = 1; i <= steps; i++) {
        const t = Math.min(i * stepSeconds, WINDOW_S);
        const now = anyInView(t);
        if (now !== prev) {
            const cross = bisect(prevT, t, prev);
            if (now) { openStart = cross; openClipped = false; } else {
                out.push({ start: openStart, end: cross, clippedStart: openClipped, clippedEnd: false });
                openStart = NaN;
            }
        }
        prevT = t;
        prev = now;
        if (t >= WINDOW_S) break;
    }
    if (prev && Number.isFinite(openStart)) {
        out.push({ start: openStart, end: WINDOW_S, clippedStart: openClipped, clippedEnd: true });
    }
    return out;
}

/** Interior gaps only — boundary-truncated gaps discarded, as ADR-001 §3 requires. */
function interiorGaps(spans: Interval[]): number[] {
    const gaps: number[] = [];
    for (let i = 1; i < spans.length; i++) gaps.push(spans[i].start - spans[i - 1].end);
    return gaps;
}

const fleet = generateWalkerConstellation(DEFAULT_REFERENCE);
const withSma = (a: number) =>
    selectSubConstellation(DEFAULT_REFERENCE, DEFAULT_SELECTION, fleet)
        .map((el) => ({ ...el, semiMajorAxisKm: a }));

const CASES = [
    { name: 'old SMA + sphere  (pre-R28)', sma: SMA_OLD, model: 'sphere' as GroundModel },
    { name: 'NEW SMA + sphere', sma: SMA_NEW, model: 'sphere' as GroundModel },
    { name: 'old SMA + WGS84', sma: SMA_OLD, model: 'wgs84' as GroundModel },
    { name: 'NEW SMA + WGS84   (post-R28)', sma: SMA_NEW, model: 'wgs84' as GroundModel },
];

describe('R28 ablation — attributing the Singapore delta', () => {
    const results = CASES.map((c) => {
        const spans = accessSpans(withSma(c.sma), c.model, 10);
        const gaps = interiorGaps(spans);
        return { ...c, spans, gaps, maxGap: gaps.length ? Math.max(...gaps) : NaN };
    });

    it('dumps the 2x2 and the interval detail', async () => {
        const { writeFileSync } = await import('node:fs');
        const L: string[] = [];
        const hhmm = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`;
        L.push('=== 2x2 ABLATION: Singapore, 72 h, STANDARD FOV, 8 payloads ===');
        L.push(`SMA_OLD = ${SMA_OLD.toFixed(4)} km   SMA_NEW = ${SMA_NEW.toFixed(4)} km`);
        const te = targetEcef('sphere'); const tw = targetEcef('wgs84');
        L.push(`target radius: sphere ${Math.hypot(te.x, te.y, te.z).toFixed(4)} km  wgs84 ${Math.hypot(tw.x, tw.y, tw.z).toFixed(4)} km`);
        L.push('');
        for (const r of results) {
            L.push(`${r.name.padEnd(30)} spans=${String(r.spans.length).padStart(3)} interiorGaps=${String(r.gaps.length).padStart(3)} maxGap=${hhmm(r.maxGap)}`);
        }
        L.push('');
        L.push('=== INTERVALS (start_h -> end_h, dur_min) ===');
        for (const r of results) {
            L.push(`-- ${r.name}`);
            L.push(r.spans.map((s) =>
                `${(s.start / 3600).toFixed(3)}->${(s.end / 3600).toFixed(3)}(${((s.end - s.start) / 60).toFixed(1)}m)`
                + (s.clippedStart || s.clippedEnd ? '*' : '')).join('  '));
            const g = r.gaps.map((x) => (x / 3600).toFixed(3));
            L.push(`   interior gaps h: ${g.join(', ')}`);
        }
        L.push('');
        L.push('=== STEP CONVERGENCE (both ends of the delta) ===');
        for (const [label, sma, model] of [
            ['pre-R28  (old SMA + sphere)', SMA_OLD, 'sphere' as GroundModel],
            ['post-R28 (new SMA + WGS84) ', SMA_NEW, 'wgs84' as GroundModel],
        ] as const) {
            for (const step of [20, 10, 5, 2]) {
                const sp = accessSpans(withSma(sma), model, step);
                const gg = interiorGaps(sp);
                L.push(`${label}  step ${String(step).padStart(2)} s   spans=${String(sp.length).padStart(3)}  maxGap=${(Math.max(...gg) / 3600).toFixed(5)} h`);
            }
        }
        L.push('');
        L.push('=== THE PASS THAT MOVES THE MAXIMUM ===');
        const pre = results[0]; const post = results[3];
        const preStarts = pre.spans.map((x) => x.start / 3600);
        const postStarts = post.spans.map((x) => x.start / 3600);
        const near = (a: number, list: number[]) => list.some((b) => Math.abs(a - b) < 0.5);
        L.push(`only pre-R28 : ${preStarts.filter((a) => !near(a, postStarts)).map((a) => a.toFixed(3)).join(', ')} h`);
        L.push(`only post-R28: ${postStarts.filter((a) => !near(a, preStarts)).map((a) => a.toFixed(3)).join(', ')} h`);
        writeFileSync('/tmp/r28_ablation.txt', L.join('\n') + '\n');
    }, 900_000);

    it('reproduces the reported before and after maximum gaps', () => {
        const before = results[0].maxGap / 3600;
        const after = results[3].maxGap / 3600;
        // 11 h 48 m and 9 h 09 m as reported from the production harness.
        expect(before).toBeCloseTo(11.8, 1);
        expect(after).toBeCloseTo(9.15, 1);
    }, 300_000);

    it('attributes the shift to the SEMI-MAJOR AXIS, not the ground model', () => {
        const [oldSph, newSph, oldWgs, newWgs] = results.map((r) => r.maxGap);

        // Holding the ground model fixed, changing the SMA reproduces almost
        // the entire shift — in BOTH ground models.
        const smaEffectOnSphere = Math.abs(newSph - oldSph);
        const smaEffectOnWgs84 = Math.abs(newWgs - oldWgs);
        // Holding the SMA fixed, changing the ground model barely moves it.
        const groundEffectOldSma = Math.abs(oldWgs - oldSph);
        const groundEffectNewSma = Math.abs(newWgs - newSph);

        expect(smaEffectOnSphere).toBeGreaterThan(3600);
        expect(smaEffectOnWgs84).toBeGreaterThan(3600);
        expect(groundEffectOldSma).toBeLessThan(smaEffectOnSphere / 5);
        expect(groundEffectNewSma).toBeLessThan(smaEffectOnWgs84 / 5);
    }, 300_000);

    it('is not a sampling artefact — BOTH ends converge across step sizes', () => {
        // If the 2 h 39 min were coarse-sampling aliasing, refining the step
        // would move one end or the other. Transition bisection is enabled in
        // every case, so the step size only decides whether a short pass is
        // DETECTED at all — and these passes are short, 30 s to 2 min, which is
        // precisely the regime where aliasing would bite.
        for (const [sma, model] of [[SMA_OLD, 'sphere'], [SMA_NEW, 'wgs84']] as const) {
            const maxima = [20, 10, 5, 2].map((step) =>
                Math.max(...interiorGaps(accessSpans(withSma(sma), model as GroundModel, step))));
            // Agreement to a second across a 10x range of step sizes.
            for (const m of maxima) expect(m).toBeCloseTo(maxima[1], 0);
        }
    }, 900_000);
});

/**
 * The exact latitude-reach bound that replaced the equatorial scalar.
 *
 * `maxReachableLatitudeDeg` is computed from ray/ellipsoid FOOTPRINT geometry.
 * It is validated here through `isTargetInFov` — the CONTAINMENT path — which
 * shares no code with the footprint projection. A bound derived from one and
 * checked against the other is a real check; checking it against itself would
 * not be.
 */
describe('R28 — the latitude reach bound is exact, not an equatorial estimate', () => {
    const window = { startMs: EPOCH, durationHours: 24, stepSeconds: 30 };

    /** Is a target at this latitude ever seen, anywhere in longitude, over a day? */
    function everSeen(latDeg: number, scenario: Parameters<typeof maxReachableLatitudeDeg>[0]): boolean {
        const fov = prepareFov(scenario.payload);
        const props = generateWalkerConstellation(scenario.reference).map(preparePropagator);
        const scratch: EciState = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
        for (let lon = -180; lon < 180; lon += 15) {
            const e = wgs84ToEcef({ latDeg, lonDeg: lon, altKm: 0 });
            const ecef = v3(e.x, e.y, e.z);
            for (let t = 0; t < window.durationHours * 3600; t += window.stepSeconds) {
                const tgt = ecefToEci(ecef, earthRotationRad(EPOCH, t));
                for (const p of props) {
                    propagateState(p, t, scratch);
                    if (isTargetInFov(scratch, tgt, fov)) return true;
                }
            }
        }
        return false;
    }

    it.each([
        ['87.9° near-polar (reference)', 87.9],
        ['55° mid-inclination', 55],
        ['30° low-inclination', 30],
    ])('brackets what containment actually sees — %s', (_label, inclinationDeg) => {
        const scenario = {
            reference: { ...DEFAULT_REFERENCE, inclinationDeg, planes: 6, satsPerPlane: 4 },
            selection: DEFAULT_SELECTION,
            payload: FOV_PRESETS.STANDARD,
            target: { kind: 'POINT' as const, name: 'probe', latDeg: 0, lonDeg: 0 },
            window,
        };
        const reach = maxReachableLatitudeDeg(scenario);

        // Just inside the bound must be reachable. 0.6° of margin absorbs the
        // 5° argument-of-latitude sampling, which can only ever UNDER-state the
        // reach, never over-state it.
        expect(everSeen(reach - 0.6, scenario)).toBe(true);

        // THE SAFETY PROPERTY of the conservative bound: it may over-state
        // reach (withholding a verdict) but must never under-state it, because
        // under-stating is what produces a false BLOCKING. Checked against the
        // containment path, not against the footprint sampling it derives from.
        const upper = conservativeReachUpperBoundDeg(scenario);
        expect(upper).toBeGreaterThanOrEqual(reach);
        if (upper < 89.9) expect(everSeen(upper + 0.6, scenario)).toBe(false);

        if (reach >= 89.9) {
            // Saturated: the footprint reaches the pole, so there is no "just
            // outside" — latitude stops at 90°. Assert the property that
            // actually holds, which is full polar coverage. The reference
            // 87.9° shell is this case, and a bound that quietly returned
            // something above 90° would be meaningless rather than blocking.
            expect(reach).toBeLessThanOrEqual(90);
            expect(everSeen(90, scenario)).toBe(true);
            return;
        }
        expect(everSeen(reach + 0.6, scenario)).toBe(false);
    }, 900_000);

    it('differs from the equatorial scalar it replaced', () => {
        // If these agreed everywhere the change would be cosmetic. They do not:
        // the equatorial scalar is not a latitude reach on an ellipsoid.
        const scenario = {
            reference: { ...DEFAULT_REFERENCE, inclinationDeg: 55 },
            selection: DEFAULT_SELECTION,
            payload: FOV_PRESETS.WIDE,
            target: { kind: 'POINT' as const, name: 'probe', latDeg: 0, lonDeg: 0 },
            window,
        };
        const exact = maxReachableLatitudeDeg(scenario);
        const equatorialEstimate = turningLatitudeDeg(55) + groundHalfAngleDeg(scenario);
        expect(Math.abs(exact - equatorialEstimate)).toBeGreaterThan(0.05);
    });
});
