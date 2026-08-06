import { describe, expect, it } from 'vitest';
import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
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

    it('applies the Walker phasing offset of f·360/(P·S) per plane', () => {
        // P=12, S=8, f=1 → each plane is offset by 360/96 = 3.75°.
        const fleet = generateWalkerConstellation(spec());
        expect(fleet.find((f) => f.id === 'P00_S00')!.argLatDeg).toBeCloseTo(0, 10);
        expect(fleet.find((f) => f.id === 'P01_S00')!.argLatDeg).toBeCloseTo(3.75, 10);
        expect(fleet.find((f) => f.id === 'P02_S00')!.argLatDeg).toBeCloseTo(7.5, 10);
        expect(fleet.find((f) => f.id === 'P01_S01')!.argLatDeg).toBeCloseTo(48.75, 10);
    });

    it('sets a = R_e + h and carries the inclination through', () => {
        const fleet = generateWalkerConstellation(spec({ altitudeKm: 600, inclinationDeg: 97.8 }));
        expect(fleet[0].semiMajorAxisKm).toBe(EARTH_RADIUS_KM + 600);
        expect(fleet[0].inclinationDeg).toBe(97.8);
    });

    it('is deterministic — the same spec yields a deeply identical fleet', () => {
        expect(generateWalkerConstellation(spec())).toEqual(generateWalkerConstellation(spec()));
    });
});
