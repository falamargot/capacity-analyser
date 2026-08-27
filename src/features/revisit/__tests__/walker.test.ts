import { describe, expect, it } from 'vitest';
import {
    generateWalkerConstellation, normalizeDeg, raanSpanDeg, satelliteId, validateWalkerSpec,
} from '../domain/walker';
import type { WalkerSpec } from '../domain/types';

const spec = (over: Partial<WalkerSpec> = {}): WalkerSpec => ({
    pattern: 'STAR',
    planes: 12,
    satsPerPlane: 8,
    inclinationDeg: 87.9,
    altitudeKm: 1200,
    phasingF: 1,
    fudge: 1,
    ...over,
});

describe('walker — identifiers and angles', () => {
    it('formats zero-based, zero-padded satellite ids', () => {
        expect(satelliteId(0, 0)).toBe('P00_S00');
        expect(satelliteId(3, 7)).toBe('P03_S07');
        expect(satelliteId(11, 15)).toBe('P11_S15');
    });

    it('wraps angles into [0, 360)', () => {
        expect(normalizeDeg(-90)).toBe(270);
        expect(normalizeDeg(360)).toBe(0);
        expect(normalizeDeg(725)).toBe(5);
    });

    it('spans 180° for a Star and 360° for a Delta', () => {
        expect(raanSpanDeg({ pattern: 'STAR' })).toBe(180);
        expect(raanSpanDeg({ pattern: 'DELTA' })).toBe(360);
    });
});

describe('walker — validation', () => {
    it('accepts a well-formed spec', () => {
        const v = validateWalkerSpec(spec());
        expect(v.ok).toBe(true);
        expect(v.errors).toEqual([]);
        expect(v.warnings).toEqual([]);
    });

    it('rejects non-integer or non-positive P and S', () => {
        expect(validateWalkerSpec(spec({ planes: 0 })).ok).toBe(false);
        expect(validateWalkerSpec(spec({ satsPerPlane: 2.5 })).ok).toBe(false);
    });

    it('rejects an impossible altitude or inclination', () => {
        expect(validateWalkerSpec(spec({ altitudeKm: 0 })).ok).toBe(false);
        expect(validateWalkerSpec(spec({ inclinationDeg: 200 })).ok).toBe(false);
    });

    it('permits a non-integer phasing factor but flags it as non-standard', () => {
        const v = validateWalkerSpec(spec({ phasingF: 1.5 }));
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/non-standard/);
    });

    it('throws rather than generating a fleet from an invalid spec', () => {
        expect(() => generateWalkerConstellation(spec({ planes: -1 }))).toThrow(/Invalid WalkerSpec/);
    });
});

describe('walker — constellation generation', () => {
    it('generates P·S satellites in plane-major order', () => {
        const fleet = generateWalkerConstellation(spec());
        expect(fleet).toHaveLength(96);
        expect(fleet[0].id).toBe('P00_S00');
        expect(fleet[7].id).toBe('P00_S07');
        expect(fleet[8].id).toBe('P01_S00');
        expect(fleet[95].id).toBe('P11_S07');
    });

    it('steps RAAN by span/P across the planes', () => {
        const fleet = generateWalkerConstellation(spec({ pattern: 'STAR', planes: 6 }));
        const raans = [...new Set(fleet.map((f) => f.raanDeg))].sort((a, b) => a - b);
        expect(raans).toEqual([0, 30, 60, 90, 120, 150]);
    });

    it('spreads a Delta over the full 360°', () => {
        const fleet = generateWalkerConstellation(spec({ pattern: 'DELTA', planes: 4 }));
        const raans = [...new Set(fleet.map((f) => f.raanDeg))].sort((a, b) => a - b);
        expect(raans).toEqual([0, 90, 180, 270]);
    });

    it('scales the inter-plane RAAN step by the fudge factor', () => {
        const fleet = generateWalkerConstellation(spec({ planes: 4, fudge: 0.5 }));
        const raans = [...new Set(fleet.map((f) => f.raanDeg))].sort((a, b) => a - b);
        expect(raans).toEqual([0, 22.5, 45, 67.5]);
    });

    it('offsets the ascending node of plane 0 by raan0Deg', () => {
        const fleet = generateWalkerConstellation(spec({ planes: 2, raan0Deg: 45 }));
        expect(fleet[0].raanDeg).toBeCloseTo(45, 10);
    });

    it('spaces satellites evenly in argument of latitude within a plane', () => {
        const fleet = generateWalkerConstellation(spec({ planes: 1, satsPerPlane: 4, phasingF: 0 }));
        expect(fleet.map((f) => f.argLatDeg)).toEqual([0, 90, 180, 270]);
    });

    it.each([4, 5])('places %i spares strictly between the 48 active slots', (spares) => {
        const fleet = generateWalkerConstellation(spec({
            planes: 1,
            satsPerPlane: 48,
            phasingF: 0,
            sparesPerPlane: [spares],
        }));
        const active = fleet.filter((satellite) => !satellite.isSpare);
        const spareFleet = fleet.filter((satellite) => satellite.isSpare);

        expect(spareFleet).toHaveLength(spares);
        for (const spare of spareFleet) {
            expect(active.some((satellite) => satellite.argLatDeg === spare.argLatDeg)).toBe(false);
        }
        expect(new Set(spareFleet.map((satellite) => satellite.argLatDeg)).size).toBe(spares);
    });

    it('does not stack the OneWeb five-spare middle slot on active S24', () => {
        const fleet = generateWalkerConstellation(spec({
            planes: 1,
            satsPerPlane: 48,
            phasingF: 0,
            sparesPerPlane: [5],
        }));
        const activeS24 = fleet.find((satellite) => satellite.id === 'P00_S24')!;
        const middleSpare = fleet.find((satellite) => satellite.id === 'P00_S50')!;

        expect(activeS24.argLatDeg).toBe(180);
        expect(middleSpare.argLatDeg).toBe(183.75);
    });

    it('keeps spares distinct even when there are more spares than active gaps', () => {
        const fleet = generateWalkerConstellation(spec({
            planes: 1,
            satsPerPlane: 2,
            phasingF: 0,
            sparesPerPlane: [5],
        }));
        const angles = fleet.map((satellite) => satellite.argLatDeg);
        expect(new Set(angles).size).toBe(angles.length);
    });

    it('applies the Walker phasing offset of f·360/(P·S) per plane', () => {
        // P=12, S=8, f=1 → each plane is offset by 360/96 = 3.75°.
        const fleet = generateWalkerConstellation(spec());
        expect(fleet.find((f) => f.id === 'P00_S00')!.argLatDeg).toBeCloseTo(0, 10);
        expect(fleet.find((f) => f.id === 'P01_S00')!.argLatDeg).toBeCloseTo(3.75, 10);
        expect(fleet.find((f) => f.id === 'P02_S00')!.argLatDeg).toBeCloseTo(7.5, 10);
        expect(fleet.find((f) => f.id === 'P01_S01')!.argLatDeg).toBeCloseTo(48.75, 10);
    });

    it('measures altitude from the EQUATORIAL radius (R28), not the mean radius', () => {
        // The datum is the whole content of R28. Written as an explicit number
        // rather than as `orbitalRadiusKm(600)`, so that a change to the datum
        // has to be made here too and cannot pass silently.
        const fleet = generateWalkerConstellation(spec({ altitudeKm: 600, inclinationDeg: 97.8 }));
        expect(fleet[0].semiMajorAxisKm).toBeCloseTo(6978.137, 9);
        expect(fleet[0].semiMajorAxisKm).not.toBeCloseTo(6971, 3);
        expect(fleet[0].inclinationDeg).toBe(97.8);
    });

    it('is deterministic — the same spec yields a deeply identical fleet', () => {
        expect(generateWalkerConstellation(spec())).toEqual(generateWalkerConstellation(spec()));
    });

    /**
     * Regression guard for a render-cache bug.
     *
     * `useRevisitScene` used to invalidate its prepared propagators on a digest
     * of `length | fleet[0].id | semiMajorAxisKm | inclinationDeg`. Satellite
     * `P00_S00` is the fixed point of this generator: its argument of latitude is
     * 0 for every `phasingF`, and its RAAN is `raan0Deg` for every `fudge`. So
     * that digest was blind to three real inputs and the globe kept drawing stale
     * geometry while every number updated.
     *
     * These assertions state the property the cache now relies on: each of those
     * inputs genuinely changes the fleet, while leaving `fleet[0]` untouched in
     * the fields the old digest sampled.
     */
    it.each([
        ['phasingF', { phasingF: 3 }],
        ['fudge', { fudge: 0.8 }],
        ['raan0Deg', { raan0Deg: 45 }],
    ] as const)('changes the fleet when %s changes', (_name, patch) => {
        const base = generateWalkerConstellation(spec());
        const changed = generateWalkerConstellation(spec(patch));
        expect(changed).not.toEqual(base);
    });

    it('leaves the fields the old cache digest sampled unchanged under phasingF', () => {
        // Why the old key could not see it: the sampled fields are identical.
        const base = generateWalkerConstellation(spec())[0];
        const changed = generateWalkerConstellation(spec({ phasingF: 3 }))[0];
        expect(changed.id).toBe(base.id);
        expect(changed.semiMajorAxisKm).toBe(base.semiMajorAxisKm);
        expect(changed.inclinationDeg).toBe(base.inclinationDeg);
        expect(changed.argLatDeg).toBe(base.argLatDeg);
    });

    it('regenerates a distinct array each call, so identity is a sound cache key', () => {
        const a = generateWalkerConstellation(spec());
        const b = generateWalkerConstellation(spec());
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});
