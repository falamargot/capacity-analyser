import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM } from '../earthGeometry';
import {
    argLatAtEpochDeg, observedElementsFromMeanElements, observedElementsFromSatellites,
} from '../observedOrbitalElements';
import { fitWalker } from '../../features/revisit/calibration/fitWalker';
import { meanMotionRadPerSec } from '../../features/revisit/propagation/keplerJ2';

// This adapter is the ONLY place a satrec is read on the way to the revisit
// module (ADR-001 §1), so its tests live here with it rather than inside
// src/features/revisit — which keeps that directory free of satrec entirely.

describe('observedOrbitalElements — the adapter', () => {
    // Mean elements of a plausible OneWeb satellite: i = 87.9°, RAAN 120.5°,
    // ~13.15 revs/day, near-circular.
    const source = {
        inclo: (87.9 * Math.PI) / 180,
        nodeo: (120.5 * Math.PI) / 180,
        argpo: (90 * Math.PI) / 180,
        mo: (270 * Math.PI) / 180,
        no: (13.15 * 2 * Math.PI) / 1440,
        ecco: 0.0001,
        jdsatepoch: 2461123.5,
    };

/** 2461123.5 JD as Unix ms — the epoch the fixture is referenced to. */
const FIXTURE_EPOCH_MS = (2461123.5 - 2440587.5) * 86_400_000;

    it('converts radians to degrees and sums argp + M into argument of latitude', () => {
        const elements = observedElementsFromMeanElements('1', 'ONEWEB-0001', source)!;
        expect(elements.inclinationDeg).toBeCloseTo(87.9, 9);
        expect(elements.raanDeg).toBeCloseTo(120.5, 9);
        expect(elements.argLatDeg).toBeCloseTo(0, 9); // 90 + 270 = 360 → 0
    });

    it('derives a semi-major axis consistent with the revisit engine', () => {
        const elements = observedElementsFromMeanElements('1', 'A', source)!;
        // Round-trip through the engine's own mean motion.
        const n = meanMotionRadPerSec(elements.semiMajorAxisKm);
        expect(n * 60).toBeCloseTo(source.no, 12);
        // ~13.15 revs/day is a ~1200 km shell.
        expect(elements.semiMajorAxisKm - EARTH_RADIUS_KM).toBeGreaterThan(1000);
        expect(elements.semiMajorAxisKm - EARTH_RADIUS_KM).toBeLessThan(1400);
    });

    it('rejects records missing the fields the fit needs', () => {
        expect(observedElementsFromMeanElements('1', 'A', null)).toBeNull();
        expect(observedElementsFromMeanElements('1', 'A', {})).toBeNull();
        expect(observedElementsFromMeanElements('1', 'A', { ...source, no: 0 })).toBeNull();
        expect(observedElementsFromMeanElements('1', 'A', { ...source, inclo: NaN })).toBeNull();
    });

    it('rejects a record with no epoch — its phase cannot be compared with anything', () => {
        const { jdsatepoch: _dropped, ...noEpoch } = source;
        expect(observedElementsFromMeanElements('1', 'A', noEpoch)).toBeNull();
    });

    it('carries the epoch through as Unix ms', () => {
        const elements = observedElementsFromMeanElements('1', 'A', source)!;
        expect(elements.epochMs).toBeCloseTo(FIXTURE_EPOCH_MS, 3);
        expect(elements.meanMotionRadPerSec).toBeCloseTo(source.no / 60, 15);
    });

    // The correction that made the real OneWeb fit meaningful: mean anomaly is
    // measured from each satellite's own epoch, so phases must be propagated to
    // a common instant before they can be compared at all.
    it('advances the argument of latitude to a common epoch', () => {
        const element = observedElementsFromMeanElements('1', 'A', source)!;
        const oneOrbitMs = (2 * Math.PI / element.meanMotionRadPerSec) * 1000;

        // Compared on the circle: 359.999…° and 0° are the same angle.
        const separation = (a: number, b: number) =>
            Math.abs((((a - b) % 360) + 540) % 360 - 180);

        // A full orbit later it is back where it started: zero separation.
        expect(separation(
            argLatAtEpochDeg(element, element.epochMs + oneOrbitMs), element.argLatDeg
        )).toBeCloseTo(0, 6);
        // Half an orbit later it is antipodal.
        expect(separation(
            argLatAtEpochDeg(element, element.epochMs + oneOrbitMs / 2), element.argLatDeg
        )).toBeCloseTo(180, 6);
        // At its own epoch it is unchanged.
        expect(argLatAtEpochDeg(element, element.epochMs)).toBeCloseTo(element.argLatDeg, 9);
    });

    it('drops unusable satellites from a fleet rather than failing the batch', () => {
        const fleet = [
            { id: 'a', name: 'A', satrec: source },
            { id: 'b', name: 'B', satrec: undefined },
            { id: 'c', name: 'C', satrec: { ...source, no: undefined } },
            { id: 'd', name: 'D', satrec: source },
        ];
        const elements = observedElementsFromSatellites(fleet);
        expect(elements.map((e) => e.id)).toEqual(['a', 'd']);
    });

    it('feeds the fit end to end', () => {
        const fleet = Array.from({ length: 24 }, (_, i) => ({
            id: `s${i}`,
            name: `S${i}`,
            satrec: {
                ...source,
                nodeo: ((i % 6) * 30 * Math.PI) / 180,
                mo: ((Math.floor(i / 6) * 90) * Math.PI) / 180,
                argpo: 0,
                jdsatepoch: 2461123.5,
            },
        }));
        const fit = fitWalker(observedElementsFromSatellites(fleet));
        expect(fit.satellitesUsed).toBe(24);
        expect(fit.planesDetected).toBe(6);
        expect(fit.spec.satsPerPlane).toBe(4);
        expect(fit.spec.inclinationDeg).toBeCloseTo(87.9, 6);
    });
});
