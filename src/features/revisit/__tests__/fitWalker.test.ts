import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import type { ObservedElements } from '../../../utils/observedOrbitalElements';
import {
    angleDeltaDeg, circularMeanDeg, clusterPlanesByRaan, fitWalker, unwrapPlaneOrder,
} from '../calibration/fitWalker';
import { generateWalkerConstellation } from '../domain/walker';
import { meanMotionRadPerSec } from '../propagation/keplerJ2';
import type { WalkerSpec } from '../domain/types';

const EPOCH_MS = Date.UTC(2026, 7, 6);

/**
 * Turn a generated Walker into "observed" elements. This is the round-trip
 * fixture: generate a shell with known parameters, hand it to the fit, and
 * require the parameters back.
 */
function observeWalker(spec: WalkerSpec, jitterDeg = 0): ObservedElements[] {
    // Deterministic pseudo-jitter, so a failure is always reproducible.
    let seed = 12345;
    const noise = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return ((seed / 4294967296) - 0.5) * 2 * jitterDeg;
    };
    return generateWalkerConstellation(spec).map((el) => ({
        id: el.id,
        name: el.id,
        inclinationDeg: el.inclinationDeg + noise() * 0.05,
        raanDeg: (el.raanDeg + noise() + 360) % 360,
        argLatDeg: (el.argLatDeg + noise() + 360) % 360,
        semiMajorAxisKm: el.semiMajorAxisKm + noise() * 2,
        eccentricity: 0,
        epochMs: EPOCH_MS,
        meanMotionRadPerSec: meanMotionRadPerSec(el.semiMajorAxisKm),
    }));
}

describe('angle helpers', () => {
    it('wraps signed differences into (-180, 180]', () => {
        expect(angleDeltaDeg(10, 350)).toBeCloseTo(20, 10);
        expect(angleDeltaDeg(350, 10)).toBeCloseTo(-20, 10);
        expect(angleDeltaDeg(0, 0)).toBe(0);
    });

    it('averages angles across the 0°/360° seam', () => {
        // A plain mean of these is 180°, which is the opposite side of the circle.
        expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 6);
        expect(circularMeanDeg([10, 20, 30])).toBeCloseTo(20, 6);
    });
});

describe('unwrapPlaneOrder', () => {
    it('leaves a contiguous run alone', () => {
        const { ordered, spanDeg } = unwrapPlaneOrder([0, 15, 30, 45]);
        expect(ordered).toEqual([0, 15, 30, 45]);
        expect(spanDeg).toBe(45);
    });

    // The real-data bug this exists for. OneWeb's 12 planes sit at 7.5…53.1 and
    // 245.6…352.3 — one contiguous 167.5° run that straddles 0°. Measured with
    // max − min it reads 344.8° and the fleet is misread as a Delta when it is a
    // Star, which then throws fudge out by a factor of two.
    it('rotates a run that straddles 0° and reports its true span', () => {
        const oneWebPlanes = [
            7.5, 22.7, 37.9, 53.1, 245.6, 260.9, 276.1, 291.4, 306.6, 321.9, 337.1, 352.3,
        ];
        const naiveSpan = Math.max(...oneWebPlanes) - Math.min(...oneWebPlanes);
        expect(naiveSpan).toBeGreaterThan(340); // what the wrong measure sees

        const { ordered, spanDeg } = unwrapPlaneOrder(oneWebPlanes);
        expect(ordered[0]).toBeCloseTo(245.6, 6);
        expect(spanDeg).toBeCloseTo(167.5, 1);
        // Ascending and uniformly stepped once unwrapped.
        for (let i = 1; i < ordered.length; i++) {
            expect(ordered[i]).toBeGreaterThan(ordered[i - 1]);
            // The real fleet's steps scatter across 15.2–15.3.
            expect(ordered[i] - ordered[i - 1]).toBeCloseTo(15.24, 0);
        }
    });

    it('handles trivial inputs', () => {
        expect(unwrapPlaneOrder([])).toEqual({ ordered: [], spanDeg: 0 });
        expect(unwrapPlaneOrder([42])).toEqual({ ordered: [42], spanDeg: 0 });
    });
});

describe('clusterPlanesByRaan', () => {
    const at = (raanDeg: number, id: string): ObservedElements => ({
        id, name: id, inclinationDeg: 87.9, raanDeg, argLatDeg: 0,
        semiMajorAxisKm: EARTH_RADIUS_KM + 1200, eccentricity: 0,
        epochMs: EPOCH_MS, meanMotionRadPerSec: meanMotionRadPerSec(EARTH_RADIUS_KM + 1200),
    });

    it('groups satellites sharing a RAAN', () => {
        const groups = clusterPlanesByRaan([at(10, 'a'), at(11, 'b'), at(70, 'c')]);
        expect(groups).toHaveLength(2);
        expect(groups[0].map((s) => s.id).sort()).toEqual(['a', 'b']);
    });

    it('merges a plane split across the 0°/360° seam', () => {
        const groups = clusterPlanesByRaan([at(359, 'a'), at(1, 'b'), at(120, 'c')]);
        expect(groups).toHaveLength(2);
        const seam = groups.find((g) => g.length === 2)!;
        expect(seam.map((s) => s.id).sort()).toEqual(['a', 'b']);
    });

    it('returns nothing for an empty fleet', () => {
        expect(clusterPlanesByRaan([])).toEqual([]);
    });
});

// ── The round trip ─────────────────────────────────────────────────────────
describe('fitWalker — recovers the parameters it was generated from', () => {
    const oneWebLike: WalkerSpec = {
        pattern: 'STAR', planes: 12, satsPerPlane: 8,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    };

    it('recovers a clean OneWeb-shaped Star exactly', () => {
        const fit = fitWalker(observeWalker(oneWebLike));
        expect(fit.spec.pattern).toBe('STAR');
        expect(fit.spec.planes).toBe(12);
        expect(fit.spec.satsPerPlane).toBe(8);
        expect(fit.spec.inclinationDeg).toBeCloseTo(87.9, 6);
        expect(fit.spec.altitudeKm).toBeCloseTo(1200, 6);
        expect(fit.spec.fudge).toBeCloseTo(1, 6);
        expect(fit.satellitesUsed).toBe(96);
        expect(fit.planesDetected).toBe(12);
    });

    it('reports a near-zero residual on synthetic input — the tell that it is synthetic', () => {
        const fit = fitWalker(observeWalker(oneWebLike));
        expect(fit.raanRmsDeg).toBeCloseTo(0, 6);
        expect(fit.argLatRmsDeg).toBeCloseTo(0, 6);
        expect(fit.altitudeRmsKm).toBeCloseTo(0, 6);
        expect(fit.alongTrackRmsKm).toBeCloseTo(0, 4);
    });

    it('recovers a Delta pattern spread over 360°', () => {
        const delta: WalkerSpec = { ...oneWebLike, pattern: 'DELTA', planes: 6, satsPerPlane: 4 };
        const fit = fitWalker(observeWalker(delta));
        expect(fit.spec.pattern).toBe('DELTA');
        expect(fit.spec.planes).toBe(6);
        expect(fit.spec.satsPerPlane).toBe(4);
    });

    it('recovers a non-unity fudge, the knob that perturbs the RAAN step', () => {
        const fit = fitWalker(observeWalker({ ...oneWebLike, planes: 6, fudge: 0.8 }));
        expect(fit.spec.fudge).toBeCloseTo(0.8, 3);
    });

    it('survives realistic jitter, and the residual grows with it', () => {
        const clean = fitWalker(observeWalker(oneWebLike, 0));
        const jittered = fitWalker(observeWalker(oneWebLike, 0.4));

        expect(jittered.spec.planes).toBe(12);
        expect(jittered.spec.satsPerPlane).toBe(8);
        expect(jittered.spec.inclinationDeg).toBeCloseTo(87.9, 1);
        // The point of the residual: it must react to reality being imperfect.
        expect(jittered.argLatRmsDeg).toBeGreaterThan(clean.argLatRmsDeg);
        expect(jittered.alongTrackRmsKm).toBeGreaterThan(0);
    });

    it('expresses the along-track residual in kilometres at the fitted altitude', () => {
        const fit = fitWalker(observeWalker(oneWebLike, 0.4));
        const expected = (fit.argLatRmsDeg * Math.PI / 180) * (EARTH_RADIUS_KM + fit.spec.altitudeKm);
        expect(fit.alongTrackRmsKm).toBeCloseTo(expected, 3);
    });
});

describe('fitWalker — real-fleet imperfections', () => {
    const base: WalkerSpec = {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    };

    it('notes uneven plane populations instead of hiding them', () => {
        const observed = observeWalker(base).filter((_, i) => i !== 0 && i !== 1);
        const fit = fitWalker(observed);
        expect(fit.satellitesUsed).toBe(22);
        expect(fit.planePopulations[0]).toBeLessThan(
            fit.planePopulations[fit.planePopulations.length - 1]
        );
        expect(fit.notes.join(' ')).toMatch(/Plane populations are uneven/);
    });

    it('warns that a single-plane fleet does not constrain P, f or fudge', () => {
        const fit = fitWalker(observeWalker({ ...base, planes: 1, satsPerPlane: 6 }));
        expect(fit.planesDetected).toBe(1);
        expect(fit.notes.join(' ')).toMatch(/does not constrain|not constrained/);
    });

    it('excludes off-shell satellites, which would otherwise invent extra planes', () => {
        const observed = observeWalker(base);
        // A satellite raising its orbit: right inclination, wrong altitude, and
        // its RAAN has drifted away from every real plane.
        observed.push({
            id: 'RAISING', name: 'RAISING', inclinationDeg: 87.9,
            raanDeg: 95, argLatDeg: 40,
            semiMajorAxisKm: EARTH_RADIUS_KM + 1050, eccentricity: 0,
            epochMs: EPOCH_MS, meanMotionRadPerSec: meanMotionRadPerSec(EARTH_RADIUS_KM + 1050),
        });

        const fit = fitWalker(observed);
        expect(fit.planesDetected).toBe(6);
        expect(fit.satellitesExcluded).toBe(1);
        expect(fit.notes.join(' ')).toMatch(/off the median shell/);
    });

    it('treats a stray inside the shell as a stray, not a plane', () => {
        const observed = observeWalker(base);
        // On-shell but parked genuinely between planes. With P = 6 over a 180°
        // Star the planes sit at 0/30/60/90/120/150, so 105 is 15° from its
        // nearest neighbours — well outside the 6° clustering tolerance.
        observed.push({
            id: 'STRAY', name: 'STRAY', inclinationDeg: 87.9,
            raanDeg: 105, argLatDeg: 10,
            semiMajorAxisKm: EARTH_RADIUS_KM + 1200, eccentricity: 0,
            epochMs: EPOCH_MS, meanMotionRadPerSec: meanMotionRadPerSec(EARTH_RADIUS_KM + 1200),
        });
        const fit = fitWalker(observed);
        expect(fit.planesDetected).toBe(6);
        expect(fit.satellitesExcluded).toBe(1);
        expect(fit.notes.join(' ')).toMatch(/treated as strays/);
    });

    it('throws on an empty fleet — that is a data problem, not a modelling one', () => {
        expect(() => fitWalker([])).toThrow(/empty fleet/);
    });
});
