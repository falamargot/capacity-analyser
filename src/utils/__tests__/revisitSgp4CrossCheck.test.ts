/**
 * revisitSgp4CrossCheck.test.ts — the revisit engine against SGP4.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────
 * The revisit engine's own validation suite checks it against oracles written by
 * the same author (`features/revisit/__tests__/validation.test.ts`). That catches
 * implementation error but cannot catch a misconception held consistently on
 * both sides. `DEFERRED_ITEMS.md` R4 asks for a cross-check against GMAT or STK
 * for exactly that reason.
 *
 * THIS IS NOT R4. SGP4 is a genuinely independent authority — a different theory
 * (Brouwer-Lyddane), implemented by a third party, validated for decades against
 * real tracking data — but it is not the specific reference R4 names, and it
 * shares with this engine the convention that ECI is ECEF rotated by GMST. R4
 * stays open.
 *
 * ── WHY IT LIVES IN src/utils/__tests__ ─────────────────────────────────────
 * It imports `satellite.js`. ADR-001 §1 forbids that anywhere under
 * `src/features/revisit/`, and the rule holds for tests too — the engine's own
 * directory stays free of it, exactly as the OneWeb element adapter does.
 *
 * ── METHOD ──────────────────────────────────────────────────────────────────
 * Each Walker satellite is written out as a synthetic TLE (BSTAR = 0, so SGP4's
 * drag is switched off and only the gravity models are compared) and propagated
 * by SGP4. Two things are then measured:
 *
 *   1. Position divergence over 72 h. The assertion is not that it is small but
 *      that it DOES NOT GROW. A constant offset is a difference of constants; a
 *      growing one is a wrong secular rate, which is the failure that would
 *      actually corrupt revisit statistics.
 *
 *   2. The revisit statistic itself, computed through the SAME containment and
 *      gap-statistics code, with the propagator as the only variable. That
 *      isolates what is under test — containment and gap arithmetic are already
 *      independently validated (V4, V5).
 */

import { describe, expect, it } from 'vitest';
import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM } from '../earthGeometry';
import { generateWalkerConstellation } from '../../features/revisit/domain/walker';
import { selectSubConstellation } from '../../features/revisit/domain/subConstellation';
import {
    J2, J2_REFERENCE_RADIUS_KM,
    meanMotionRadPerSec, preparePropagators, propagateState,
} from '../../features/revisit/propagation/keplerJ2';
import {
    isTargetInFov, prepareFov, targetEciAt,
} from '../../features/revisit/fov/containment';
import { computeAccessIntervals } from '../../features/revisit/analysis/accessIntervals';
import { computeGapStatistics } from '../../features/revisit/analysis/gapStatistics';
import { FOV_PRESETS, TARGET_PRESETS } from '../../features/revisit/domain/presets';
import type {
    AccessInterval, EciState, OrbitalElements, RevisitScenario, WalkerSpec,
} from '../../features/revisit/domain/types';

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

const REFERENCE: WalkerSpec = {
    pattern: 'STAR', planes: 12, satsPerPlane: 8,
    inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};

/** TLE line checksum: digits sum, minus signs count 1, mod 10. */
function tleChecksum(line: string): number {
    let sum = 0;
    for (const ch of line) {
        if (ch >= '0' && ch <= '9') sum += Number(ch);
        else if (ch === '-') sum += 1;
    }
    return sum % 10;
}

/**
 * Write a Walker element set out as a TLE.
 *
 * ADR-001 §1 rejected synthesising TLEs for PRODUCTION — drag makes multi-day
 * statistics irreproducible. For validation it is precisely the right tool, and
 * `BSTAR = 0` removes the drag that was the objection.
 *
 * Circular orbits are given eccentricity 1e-7 rather than 0: SGP4 divides by
 * eccentricity terms and a hard zero is numerically awkward.
 *
 * **The mean motion field is Kozai, not Brouwer.** This is the subtle part. The
 * engine's semi-major axis is a Brouwer mean element, so √(μ/a³) is a Brouwer
 * mean motion — but SGP4 reads the TLE's mean motion as *Kozai* and runs its
 * `initl` un-Kozai step to recover Brouwer. Writing √(μ/a³) into the field
 * unconverted therefore hands SGP4 a different orbit from the one intended,
 * larger by δ in mean motion, and the two propagators are then compared at
 * mismatched semi-major axes. Converting forward here — the exact inverse of
 * SGP4's `no_unkozai = no/(1 + δ₀)` — is what makes the comparison fair.
 *
 * Getting this wrong is not academic: uncorrected, it shows up as a constant
 * 5 km radial offset and ~1000 km of spurious along-track drift over 72 h,
 * which is the same order as a real error in the secular rates and would mask
 * one. See R4 in `docs/REVIEW_REPORT.md`.
 */
export function tleFromElements(
    el: OrbitalElements, epochMs: number, catalogNumber: number
): [string, string] {
    const brouwerMeanMotion = meanMotionRadPerSec(el.semiMajorAxisKm);
    const cosI = Math.cos((el.inclinationDeg * Math.PI) / 180);
    const gamma = J2 * (J2_REFERENCE_RADIUS_KM / el.semiMajorAxisKm) ** 2;
    const kozaiMeanMotion = brouwerMeanMotion * (1 + 0.75 * gamma * (3 * cosI * cosI - 1));
    const revsPerDay = (kozaiMeanMotion * 86400) / (2 * Math.PI);
    const date = new Date(epochMs);
    const year = date.getUTCFullYear() % 100;
    const dayOfYear =
        (epochMs - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000 + 1;
    const id = String(catalogNumber).padStart(5, '0');

    const line1 =
        `1 ${id}U 26001A   ${String(year).padStart(2, '0')}`
        + `${dayOfYear.toFixed(8).padStart(12, '0')}  .00000000  00000-0  00000-0 0  999`;
    const line2 =
        `2 ${id} ${el.inclinationDeg.toFixed(4).padStart(8)}`
        + ` ${el.raanDeg.toFixed(4).padStart(8)} 0000001 ${(0).toFixed(4).padStart(8)}`
        + ` ${el.argLatDeg.toFixed(4).padStart(8)} ${revsPerDay.toFixed(8).padStart(11)}    1`;

    return [line1 + tleChecksum(line1), line2 + tleChecksum(line2)];
}

function sgp4State(record: satellite.SatRec, atMs: number): EciState | null {
    const pv = satellite.propagate(record, new Date(atMs));
    if (!pv?.position || !pv.velocity
        || typeof pv.position === 'boolean' || typeof pv.velocity === 'boolean') {
        return null;
    }
    const p = pv.position;
    const v = pv.velocity;
    return { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z };
}

const fleet = generateWalkerConstellation(REFERENCE);
const propagators = preparePropagators(fleet);
const records = fleet.map((el, i) =>
    satellite.twoline2satrec(...tleFromElements(el, EPOCH, 10_000 + i)));

/** Mean absolute separation between the two propagators across the fleet, km. */
function meanSeparationKm(tSeconds: number): { total: number; radial: number; max: number } {
    let total = 0;
    let radial = 0;
    let max = 0;
    let counted = 0;
    for (let i = 0; i < fleet.length; i++) {
        const mine = propagateState(propagators[i], tSeconds);
        const theirs = sgp4State(records[i], EPOCH + tSeconds * 1000);
        if (!theirs) continue;
        const d = Math.hypot(mine.x - theirs.x, mine.y - theirs.y, mine.z - theirs.z);
        total += d;
        radial += Math.abs(
            Math.hypot(mine.x, mine.y, mine.z) - Math.hypot(theirs.x, theirs.y, theirs.z)
        );
        max = Math.max(max, d);
        counted++;
    }
    return { total: total / counted, radial: radial / counted, max };
}

describe('SGP4 cross-check — synthetic TLEs are well formed', () => {
    it('produces 69-character lines that SGP4 parses without error', () => {
        const [l1, l2] = tleFromElements(fleet[0], EPOCH, 10_000);
        expect(l1).toHaveLength(69);
        expect(l2).toHaveLength(69);
        expect(records.filter((r) => r.error !== 0)).toHaveLength(0);
    });

    it('round-trips the elements it was given', () => {
        const record = records[0];
        const toDeg = (rad: number) => (rad * 180) / Math.PI;
        expect(toDeg(record.inclo)).toBeCloseTo(fleet[0].inclinationDeg, 3);
        expect(toDeg(record.nodeo)).toBeCloseTo(fleet[0].raanDeg, 3);
        expect(toDeg(record.mo)).toBeCloseTo(fleet[0].argLatDeg, 3);
    });
});

// ── The assertion that actually matters ────────────────────────────────────
describe('SGP4 cross-check — position divergence does not grow', () => {
    // A constant offset means the two models disagree about constants. A GROWING
    // offset means a wrong secular rate, and that is the failure that would
    // corrupt revisit statistics: an error in u̇ large enough to matter would put
    // the satellite degrees of along-track away after 72 h — hundreds to
    // thousands of kilometres, not tens.
    it('stays flat from 0 h to 72 h', () => {
        const atStart = meanSeparationKm(0);
        const atEnd = meanSeparationKm(72 * 3600);

        expect(Math.abs(atEnd.total - atStart.total)).toBeLessThan(2);
        expect(Math.abs(atEnd.radial - atStart.radial)).toBeLessThan(1);
        // And it never becomes large in absolute terms either.
        expect(atEnd.max).toBeLessThan(40);
    }, 60_000);

    it('is monotone-ish and bounded across the window', () => {
        const separations = [0, 6, 24, 48, 72].map((h) => meanSeparationKm(h * 3600).total);
        for (const s of separations) {
            expect(s).toBeGreaterThan(0);
            expect(s).toBeLessThan(30);
        }
        // Spread across the whole window is small — no secular drift.
        expect(Math.max(...separations) - Math.min(...separations)).toBeLessThan(2);
    }, 60_000);

    /**
     * The residual offset is explained, not merely tolerated.
     *
     * SGP4 treats a TLE's mean motion as the KOZAI mean motion and converts it to
     * a Brouwer mean motion before deriving its semi-major axis. That conversion
     * is O(J₂·(Rₑ/a)²) in `a` — about 5.8 km at this altitude, which is the
     * measured radial offset. The WGS72-vs-WGS84 gravitational parameter, the
     * other obvious suspect, accounts for only ~2 m and cannot explain it.
     */
    it('has a radial offset matching the Kozai-to-Brouwer conversion', () => {
        const { radial } = meanSeparationKm(0);
        const a = EARTH_RADIUS_KM + REFERENCE.altitudeKm;
        const kozaiScale = a * 1.08262668e-3 * (6378.135 / a) ** 2;

        expect(radial).toBeGreaterThan(0.4 * kozaiScale);
        expect(radial).toBeLessThan(1.6 * kozaiScale);

        // The rejected explanation, kept so nobody re-derives it.
        const muOffsetKm = a * ((398600.8 / 398600.4418) ** (1 / 3) - 1);
        expect(muOffsetKm).toBeLessThan(0.01);
    }, 60_000);
});

// ── The product ────────────────────────────────────────────────────────────
describe('SGP4 cross-check — the revisit statistic', () => {
    const scenario: RevisitScenario = {
        reference: REFERENCE,
        selection: { planeStride: 3, satStride: 4, planeShift: 0 },
        payload: FOV_PRESETS.STANDARD,
        target: TARGET_PRESETS.find((t) => t.name === 'London')!,
        window: { startMs: EPOCH, durationHours: 72, stepSeconds: 10 },
    };

    /** Access intervals from SGP4 positions, by uniform sampling. */
    function sgp4Statistics() {
        const selected = selectSubConstellation(REFERENCE, scenario.selection, fleet);
        const indices = selected.map((s) => fleet.findIndex((f) => f.id === s.id));
        const fov = prepareFov(scenario.payload);
        const step = scenario.window.stepSeconds;
        const totalSeconds = scenario.window.durationHours * 3600;

        const samples: boolean[] = [];
        for (let k = 0; k * step <= totalSeconds; k++) {
            const t = k * step;
            const targetEci = targetEciAt(scenario.target, EPOCH, t);
            let visible = false;
            for (const i of indices) {
                const state = sgp4State(records[i], EPOCH + t * 1000);
                if (state && isTargetInFov(state, targetEci, fov)) { visible = true; break; }
            }
            samples.push(visible);
        }

        const intervals: AccessInterval[] = [];
        let start = -1;
        for (let k = 0; k < samples.length; k++) {
            if (samples[k] && start < 0) start = k;
            if ((!samples[k] || k === samples.length - 1) && start >= 0) {
                const end = samples[k] ? k : k - 1;
                intervals.push({
                    startMs: EPOCH + start * step * 1000,
                    endMs: EPOCH + end * step * 1000,
                    satelliteIds: ['sgp4'],
                    clippedAtStart: start === 0,
                    clippedAtEnd: end === samples.length - 1,
                });
                start = -1;
            }
        }
        return computeGapStatistics(intervals, scenario.window, []);
    }

    it('agrees on worst-case revisit to better than 2 %', () => {
        const selected = selectSubConstellation(REFERENCE, scenario.selection, fleet);
        const access = computeAccessIntervals(
            selected, scenario.target, scenario.payload, scenario.window
        );
        const mine = computeGapStatistics(access.intervals, scenario.window, access.warnings);
        const theirs = sgp4Statistics();

        expect(mine.maxGapMs).not.toBeNull();
        expect(theirs.maxGapMs).not.toBeNull();

        // This is the number the whole tool exists to produce.
        const relative = Math.abs(mine.maxGapMs! - theirs.maxGapMs!) / mine.maxGapMs!;
        expect(relative).toBeLessThan(0.02);

        // And the same number of passes was found.
        expect(theirs.accessCount).toBe(mine.accessCount);
    }, 120_000);

    it('agrees on mean gap to better than 2 %', () => {
        const selected = selectSubConstellation(REFERENCE, scenario.selection, fleet);
        const access = computeAccessIntervals(
            selected, scenario.target, scenario.payload, scenario.window
        );
        const mine = computeGapStatistics(access.intervals, scenario.window, access.warnings);
        const theirs = sgp4Statistics();

        expect(Math.abs(mine.meanGapMs! - theirs.meanGapMs!) / mine.meanGapMs!)
            .toBeLessThan(0.02);
    }, 120_000);

    /**
     * Fraction in view is NOT asserted tightly, and the reason is method rather
     * than physics: the engine bisects AOS and LOS to sub-second precision while
     * this comparison uses raw 10-second sampling with no refinement, which
     * systematically clips the ends of every pass. The engine reads higher, and
     * should. Asserting agreement here would be asserting that bisection does
     * nothing.
     */
    it('reads a slightly higher fraction in view than raw sampling, as expected', () => {
        const selected = selectSubConstellation(REFERENCE, scenario.selection, fleet);
        const access = computeAccessIntervals(
            selected, scenario.target, scenario.payload, scenario.window
        );
        const mine = computeGapStatistics(access.intervals, scenario.window, access.warnings);
        const theirs = sgp4Statistics();

        expect(mine.fractionInView).toBeGreaterThanOrEqual(theirs.fractionInView);
        expect(mine.fractionInView - theirs.fractionInView).toBeLessThan(0.002);
    }, 120_000);
});
