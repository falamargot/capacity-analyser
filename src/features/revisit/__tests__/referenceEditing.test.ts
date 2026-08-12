import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE } from '../domain/referenceProfiles';
import { referenceWithPatch } from '../domain/referenceEditing';
import { generateWalkerConstellation } from '../domain/walker';

describe('referenceWithPatch', () => {
    it('detaches every per-plane profile array when the plane count changes', () => {
        const edited = referenceWithPatch(DEFAULT_PROFILE.spec, { planes: 13 });
        expect(edited.planeAltitudesKm).toBeUndefined();
        expect(edited.raanOffsetsDeg).toBeUndefined();
        expect(edited.sparesPerPlane).toBeUndefined();
        expect(() => generateWalkerConstellation(edited)).not.toThrow();
    });

    it('lets altitude and spacing edits affect propagation', () => {
        const altitude = referenceWithPatch(DEFAULT_PROFILE.spec, { altitudeKm: 1300 });
        expect(altitude.planeAltitudesKm).toBeUndefined();
        expect(altitude.raanOffsetsDeg).toBeDefined();

        const spacing = referenceWithPatch(DEFAULT_PROFILE.spec, { pattern: 'DELTA', fudge: 1.5 });
        expect(spacing.raanOffsetsDeg).toBeUndefined();
        expect(spacing.planeAltitudesKm).toBeDefined();
    });

    it('retains unrelated profile detail for non-structural edits', () => {
        const edited = referenceWithPatch(DEFAULT_PROFILE.spec, { inclinationDeg: 88 });
        expect(edited.planeAltitudesKm).toEqual(DEFAULT_PROFILE.spec.planeAltitudesKm);
        expect(edited.raanOffsetsDeg).toEqual(DEFAULT_PROFILE.spec.raanOffsetsDeg);
        expect(edited.sparesPerPlane).toEqual(DEFAULT_PROFILE.spec.sparesPerPlane);
    });
});
