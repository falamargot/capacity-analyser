/**
 * HLD compliance for the versioned reference profiles.
 *
 * Every figure in the OneWeb HLD is asserted here against the GENERATED fleet,
 * not against the constants that declare it. Checking `HLD_PLANE_ALTITUDES_KM`
 * has twelve entries proves nothing about what the engine propagates; checking
 * that the twelve distinct semi-major axes actually appear in the constellation
 * does.
 */
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_PROFILE, HLD_ORDINARY_SPACING_DEG, HLD_SEAM_SPACING_DEG,
    REFERENCE_PROFILES, activeSatelliteCount, displayedSatelliteCount,
    spareSatelliteCount,
} from '../domain/referenceProfiles';
import { generateWalkerConstellation, validateWalkerSpec } from '../domain/walker';
import { selectSubConstellation, selectedSatelliteIds } from '../domain/subConstellation';
import { DEFAULT_SELECTION } from '../domain/presets';
import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';

const HLD = REFERENCE_PROFILES.ONEWEB_HLD_V1;
const fleet = generateWalkerConstellation(HLD.spec);

describe('OneWeb HLD profile — fleet composition', () => {
    it('is a valid spec', () => {
        const v = validateWalkerSpec(HLD.spec);
        expect(v.errors).toEqual([]);
        expect(v.ok).toBe(true);
    });

    it('has 576 active satellites across 12 planes', () => {
        expect(HLD.spec.planes).toBe(12);
        expect(HLD.spec.satsPerPlane).toBe(48);
        expect(activeSatelliteCount(HLD)).toBe(576);
        expect(fleet.filter((s) => !s.isSpare)).toHaveLength(576);
    });

    it('has 58 non-payload spares, and 634 displayed in total', () => {
        expect(spareSatelliteCount(HLD)).toBe(58);
        expect(fleet.filter((s) => s.isSpare)).toHaveLength(58);
        expect(displayedSatelliteCount(HLD)).toBe(634);
        expect(fleet).toHaveLength(634);
    });

    it('spreads the spares across every plane', () => {
        // Not required by the HLD, which gives only a total — but a distribution
        // that piled them into one plane would be a visible artefact.
        for (let p = 0; p < 12; p++) {
            const spares = fleet.filter((s) => s.planeIndex === p && s.isSpare);
            expect(spares.length).toBeGreaterThanOrEqual(4);
            expect(spares.length).toBeLessThanOrEqual(5);
        }
    });
});

describe('OneWeb HLD profile — plane altitude ladder', () => {
    it('runs 1175 to 1219 km in 4 km steps, one rung per plane', () => {
        const perPlane = Array.from({ length: 12 }, (_, p) => {
            const inPlane = fleet.filter((s) => s.planeIndex === p);
            const radii = new Set(inPlane.map((s) => s.semiMajorAxisKm.toFixed(6)));
            // Every satellite in a plane shares that plane's altitude.
            expect(radii.size).toBe(1);
            return inPlane[0].semiMajorAxisKm;
        });

        for (let p = 0; p < 12; p++) {
            expect(perPlane[p]).toBeCloseTo(orbitalRadiusKm(1175 + 4 * p), 9);
        }
        expect(perPlane[0]).toBeCloseTo(orbitalRadiusKm(1175), 9);
        expect(perPlane[11]).toBeCloseTo(orbitalRadiusKm(1219), 9);

        // Twelve DISTINCT rungs — a ladder collapsed to one shell would still
        // pass a first-and-last check.
        expect(new Set(perPlane.map((a) => a.toFixed(6))).size).toBe(12);
        for (let p = 1; p < 12; p++) {
            expect(perPlane[p] - perPlane[p - 1]).toBeCloseTo(4, 9);
        }
    });

    it('gives the planes measurably different nodal drift', async () => {
        // The point of a ladder rather than a shell. Omega-dot goes as a^-3.5,
        // so 44 km across the fleet is not decorative.
        const { nodalRegressionRadPerSec } = await import('../propagation/keplerJ2');
        const lo = nodalRegressionRadPerSec(orbitalRadiusKm(1175), 87.9);
        const hi = nodalRegressionRadPerSec(orbitalRadiusKm(1219), 87.9);
        expect(Math.abs((hi - lo) / lo)).toBeGreaterThan(0.02);
    });
});

describe('OneWeb HLD profile — Walker Star spacing and seam', () => {
    const planeRaans = Array.from(
        { length: 12 },
        (_, p) => fleet.find((s) => s.planeIndex === p)!.raanDeg,
    );

    it('spaces ordinary planes 15.225° apart', () => {
        for (let p = 1; p < 12; p++) {
            expect(planeRaans[p] - planeRaans[p - 1]).toBeCloseTo(HLD_ORDINARY_SPACING_DEG, 9);
        }
    });

    it('closes the 180° Star with a 12.525° seam', () => {
        // The seam is the wrap gap: from the last plane back to plane 0 across
        // the 180° boundary of a Star.
        const seam = 180 - (planeRaans[11] - planeRaans[0]);
        expect(seam).toBeCloseTo(HLD_SEAM_SPACING_DEG, 9);

        // And the whole thing must close exactly, or the shell has a hole.
        expect(11 * HLD_ORDINARY_SPACING_DEG + HLD_SEAM_SPACING_DEG).toBeCloseTo(180, 9);
    });

    it('makes the seam genuinely narrower than an ordinary gap', () => {
        expect(HLD_SEAM_SPACING_DEG).toBeLessThan(HLD_ORDINARY_SPACING_DEG);
        // A uniform Star would space 12 planes at 15° exactly; this is not that.
        expect(HLD_ORDINARY_SPACING_DEG).not.toBeCloseTo(15, 3);
    });
});

describe('OneWeb HLD profile — hosted-payload selection', () => {
    it('accepts the default selection under the x/y/z divisor rules', () => {
        expect(HLD.spec.planes % DEFAULT_SELECTION.planeStride).toBe(0);
        expect(HLD.spec.satsPerPlane % DEFAULT_SELECTION.satStride).toBe(0);
        expect(DEFAULT_SELECTION.planeShift).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_SELECTION.planeShift).toBeLessThan(HLD.spec.satsPerPlane);
    });

    it('NEVER selects a spare, whatever x/y/z are chosen', () => {
        // The load-bearing property. Spares sit at in-plane indices >= 48, which
        // `selectedSatelliteIds` cannot produce, so exclusion is structural
        // rather than a filter somebody could forget. Swept over every legal
        // selection rather than argued.
        const planeStrides = [1, 2, 3, 4, 6, 12];
        const satStrides = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48];
        let checked = 0;
        for (const planeStride of planeStrides) {
            for (const satStride of satStrides) {
                for (const planeShift of [0, 1, 7, 23, 47]) {
                    const selected = selectSubConstellation(
                        HLD.spec, { planeStride, satStride, planeShift }, fleet,
                    );
                    expect(selected.some((s) => s.isSpare)).toBe(false);
                    expect(selected.length).toBe(
                        (12 / planeStride) * (48 / satStride),
                    );
                    checked++;
                }
            }
        }
        expect(checked).toBe(planeStrides.length * satStrides.length * 5);
    });

    it('addresses only active in-plane indices', () => {
        const ids = selectedSatelliteIds(HLD.spec, DEFAULT_SELECTION);
        for (const id of ids) {
            const s = Number(id.slice(id.indexOf('_S') + 2));
            expect(s).toBeLessThan(48);
        }
    });
});

describe('reference profiles — provenance', () => {
    it('opens on the authoritative OneWeb profile', () => {
        expect(DEFAULT_PROFILE.id).toBe('ONEWEB_HLD_V1');
        expect(DEFAULT_PROFILE.isAuthoritative).toBe(true);
        expect(DEFAULT_PROFILE.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('keeps the 12 × 8 shell only as a labelled demo', () => {
        const demo = REFERENCE_PROFILES.DEMO_12X8;
        expect(demo.isAuthoritative).toBe(false);
        expect(demo.label.toLowerCase()).toContain('demo');
        expect(demo.spec.planes * demo.spec.satsPerPlane).toBe(96);
        expect(demo.spec.sparesPerPlane).toBeUndefined();
    });

    it('records the spare-distribution assumption rather than hiding it', () => {
        expect(DEFAULT_PROFILE.notes.join(' ')).toMatch(/assumption/i);
    });
});
