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
    fitMatchesReference, referenceProfileFor, spareSatelliteCount, walkerSpecsEqual,
} from '../domain/referenceProfiles';
import type { WalkerSpec } from '../domain/types';
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

    it('never stacks a spare on an active slot or another spare', () => {
        for (let p = 0; p < HLD.spec.planes; p++) {
            const inPlane = fleet.filter((satellite) => satellite.planeIndex === p);
            const distinctArguments = new Set(
                inPlane.map((satellite) => satellite.argLatDeg.toFixed(9))
            );
            expect(distinctArguments.size).toBe(inPlane.length);
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

    it('drops named provenance after any specification edit', () => {
        expect(referenceProfileFor(DEFAULT_PROFILE.spec)).toBe(DEFAULT_PROFILE);
        const custom = { ...DEFAULT_PROFILE.spec, inclinationDeg: 88 };
        expect(walkerSpecsEqual(DEFAULT_PROFILE.spec, custom)).toBe(false);
        expect(referenceProfileFor(custom)).toBeNull();
    });
});

/**
 * `fitMatchesReference` decides whether a stored calibration residual may be
 * presented as applicable to the constellation currently on screen — in
 * `ModelProvenance` and in the CSV provenance header.
 *
 * It once compared four of the eight parameters `fitWalker` estimates. The four
 * marked "was accepted before" below are the ones that silently kept
 * `matchesFit = true` across a structurally different constellation; each is a
 * regression guard, not a restatement of the implementation.
 */
describe('fitMatchesReference — every estimated parameter is compared', () => {
    /** A uniform fitted shell. Deliberately not the HLD spec: no ladder, no seam. */
    const FIT: WalkerSpec = {
        pattern: 'STAR',
        planes: 12,
        satsPerPlane: 48,
        inclinationDeg: 87.9,
        altitudeKm: 1200,
        phasingF: 1,
        fudge: 1,
        raan0Deg: 7.5,
    };

    it('accepts a fit against the constellation it was computed for', () => {
        expect(fitMatchesReference(FIT, { ...FIT })).toBe(true);
    });

    it('accepts measurement noise on the quantities that are measured', () => {
        expect(fitMatchesReference(FIT, {
            ...FIT,
            inclinationDeg: FIT.inclinationDeg + 0.02,
            altitudeKm: FIT.altitudeKm + 2,
            raan0Deg: 7.51,
        })).toBe(true);
    });

    it('rejects a Star reported against a Delta — was accepted before', () => {
        expect(fitMatchesReference(FIT, { ...FIT, pattern: 'DELTA' })).toBe(false);
    });

    it('rejects a different phasing factor — was accepted before', () => {
        expect(fitMatchesReference(FIT, { ...FIT, phasingF: 2 })).toBe(false);
    });

    it('rejects a rotated constellation — was accepted before', () => {
        expect(fitMatchesReference(FIT, { ...FIT, raan0Deg: 97.5 })).toBe(false);
    });

    it('rejects a rescaled inter-plane step — was accepted before', () => {
        // 12 STAR planes: the ideal step is 15°, so the outermost plane sits
        // 11 steps out. fudge 1 → 1.001 displaces it by 0.165°, well past the
        // 0.05° budget, while fudge itself moved by only one part in a thousand.
        expect(fitMatchesReference(FIT, { ...FIT, fudge: 1.001 })).toBe(false);
        // A displacement inside the budget stays acceptable.
        expect(fitMatchesReference(FIT, { ...FIT, fudge: 1 + 1e-4 })).toBe(true);
    });

    it('closes the circle on Ω₀ rather than subtracting linearly', () => {
        const nearZero = { ...FIT, raan0Deg: 0.01 };
        const nearWrap = { ...FIT, raan0Deg: 359.99 };
        expect(fitMatchesReference(nearZero, nearWrap)).toBe(true);
        expect(fitMatchesReference(nearWrap, nearZero)).toBe(true);
        expect(fitMatchesReference(nearZero, { ...FIT, raan0Deg: 90 })).toBe(false);
    });

    it('treats an absent Ω₀ as 0°, not as a wildcard', () => {
        const { raan0Deg: _omitted, ...withoutRaan } = FIT;
        void _omitted;
        expect(fitMatchesReference(withoutRaan as WalkerSpec, { ...FIT, raan0Deg: 0 })).toBe(true);
        expect(fitMatchesReference(withoutRaan as WalkerSpec, FIT)).toBe(false);
        expect(fitMatchesReference(FIT, withoutRaan as WalkerSpec)).toBe(false);
    });

    it('still rejects the four parameters it always compared', () => {
        expect(fitMatchesReference(FIT, { ...FIT, planes: 11 })).toBe(false);
        expect(fitMatchesReference(FIT, { ...FIT, satsPerPlane: 47 })).toBe(false);
        expect(fitMatchesReference(FIT, { ...FIT, inclinationDeg: 88.5 })).toBe(false);
        expect(fitMatchesReference(FIT, { ...FIT, altitudeKm: 1210 })).toBe(false);
    });

    it('does not present a uniform fit as applicable to the seamed HLD shell', () => {
        // The HLD profile carries a plane ladder and a seam, and leaves Ω₀ at
        // its 0° default; a fit of the real fleet is a uniform shell whose
        // plane 0 sits at 7.5°. P, S, i and h agree, which is exactly why the
        // old four-parameter check called these the same constellation.
        expect(fitMatchesReference(FIT, DEFAULT_PROFILE.spec)).toBe(false);
    });
});
