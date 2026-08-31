/**
 * referenceProfiles.ts — the named, versioned constellations REVISIT models.
 *
 * ── WHY VERSIONED, AND WHY NAMED ────────────────────────────────────────────
 * Until now the reference fleet was a bare `WalkerSpec` living in `presets.ts`
 * with no identity. That is fine while there is one of them and it is openly a
 * demo. It stops being fine the moment a profile claims to represent a real
 * operator's constellation, because then two questions become load-bearing and
 * neither has an answer in a bare spec: WHICH constellation is this, and WHICH
 * revision of the public information about it.
 *
 * So each profile carries an id, a version, and an explicit
 * `isAuthoritative` flag. A demo profile that produces a plausible-looking
 * number is more dangerous than one that produces an obviously fake number,
 * because nothing on screen distinguishes them — the flag is what the UI and
 * the CSV header use to say which they are looking at.
 */

import type { WalkerSpec } from './types';

export type ReferenceProfileId = 'ONEWEB_HLD_V1' | 'DEMO_12X8';

export interface ReferenceProfile {
    id: ReferenceProfileId;
    /** Bumped whenever the numbers change, so an export can be traced to one. */
    version: string;
    label: string;
    /**
     * True when the profile is intended to represent a real constellation and
     * its outputs may be quoted as such. False for illustrative shells.
     */
    isAuthoritative: boolean;
    spec: WalkerSpec;
    /** Provenance and known limits — surfaced in the UI and CSV, not decoration. */
    notes: string[];
}

// ─── OneWeb Gen1, per the HLD reference ─────────────────────────────────────

/** 12 planes. */
const HLD_PLANES = 12;
/** 48 active satellites per plane → 576 active. */
const HLD_ACTIVE_PER_PLANE = 48;
/** 58 non-payload spares. 576 + 58 = 634 displayed. */
const HLD_SPARE_TOTAL = 58;

/**
 * The plane altitude ladder: 1175 km rising in 4 km steps to 1219 km.
 *
 * Exactly 12 rungs for 12 planes — 1175 + 11·4 = 1219 — so the ladder and the
 * plane count are consistent by arithmetic rather than by coincidence.
 */
export const HLD_PLANE_ALTITUDES_KM: number[] = Array.from(
    { length: HLD_PLANES },
    (_, p) => 1175 + 4 * p,
);

/** Ordinary inter-plane RAAN spacing, degrees. */
export const HLD_ORDINARY_SPACING_DEG = 15.225;
/** The seam: the single narrower gap that closes the Walker Star. */
export const HLD_SEAM_SPACING_DEG = 12.525;

/**
 * Absolute RAAN offsets, degrees.
 *
 * Eleven ordinary gaps and one seam close the 180° Star exactly:
 * 11 × 15.225 + 12.525 = 180.000. The seam is the wrap gap — between the last
 * plane and plane 0 — so the offsets themselves are a simple cumulative sum of
 * the ordinary spacing, and the seam appears as the remainder.
 */
export const HLD_RAAN_OFFSETS_DEG: number[] = Array.from(
    { length: HLD_PLANES },
    (_, p) => p * HLD_ORDINARY_SPACING_DEG,
);

/**
 * Spares distributed as evenly as 58 over 12 planes allows: ten planes carry
 * five, two carry four.
 *
 * The HLD gives a fleet total, not a per-plane split. This rule is deterministic
 * and documented rather than arbitrary, and it is recorded as an ASSUMPTION —
 * spares carry no payload, so the split cannot move a revisit number; it only
 * moves which dots appear where.
 */
export const HLD_SPARES_PER_PLANE: number[] = Array.from(
    { length: HLD_PLANES },
    (_, p) => Math.floor((HLD_SPARE_TOTAL + HLD_PLANES - 1 - p) / HLD_PLANES),
);

const ONEWEB_HLD_V1: ReferenceProfile = {
    id: 'ONEWEB_HLD_V1',
    version: '1.0.0',
    label: 'OneWeb Gen1 (HLD reference)',
    isAuthoritative: true,
    spec: {
        pattern: 'STAR',
        planes: HLD_PLANES,
        satsPerPlane: HLD_ACTIVE_PER_PLANE,
        inclinationDeg: 87.9,
        // The label altitude. The ladder below is what actually propagates; this
        // is the shell figure a reader expects to see quoted.
        altitudeKm: 1200,
        phasingF: 1,
        // Ignored: raanOffsetsDeg supplies the spacing directly.
        fudge: 1,
        planeAltitudesKm: HLD_PLANE_ALTITUDES_KM,
        raanOffsetsDeg: HLD_RAAN_OFFSETS_DEG,
        sparesPerPlane: HLD_SPARES_PER_PLANE,
    },
    notes: [
        '576 active across 12 planes; 58 non-payload spares; 634 displayed.',
        'Plane altitudes 1175–1219 km in 4 km steps.',
        `Inter-plane RAAN ${HLD_ORDINARY_SPACING_DEG}°, seam ${HLD_SEAM_SPACING_DEG}°.`,
        'Spare distribution per plane is an assumption; the HLD gives only a fleet total.',
    ],
};

const DEMO_12X8: ReferenceProfile = {
    id: 'DEMO_12X8',
    version: '1.0.0',
    label: 'Demo shell (12 × 8) — illustrative',
    isAuthoritative: false,
    spec: {
        pattern: 'STAR',
        planes: 12,
        satsPerPlane: 8,
        inclinationDeg: 87.9,
        altitudeKm: 1200,
        phasingF: 1,
        fudge: 1,
    },
    notes: [
        'Not a real constellation. Retained because it is small enough to reason',
        'about by hand and it is what every pre-R29 reference figure was computed',
        'against.',
    ],
};

export const REFERENCE_PROFILES: Record<ReferenceProfileId, ReferenceProfile> = {
    ONEWEB_HLD_V1,
    DEMO_12X8,
};

/** The profile the mode opens on. */
export const DEFAULT_PROFILE_ID: ReferenceProfileId = 'ONEWEB_HLD_V1';

export const DEFAULT_PROFILE = REFERENCE_PROFILES[DEFAULT_PROFILE_ID];

/** Exact structural equality for provenance-sensitive Walker specifications. */
export function walkerSpecsEqual(left: WalkerSpec, right: WalkerSpec): boolean {
    const scalarKeys: Array<keyof WalkerSpec> = [
        'pattern', 'planes', 'satsPerPlane', 'inclinationDeg', 'altitudeKm',
        'phasingF', 'fudge', 'raan0Deg',
    ];
    if (scalarKeys.some((key) => left[key] !== right[key])) return false;

    const arrayKeys: Array<keyof WalkerSpec> = [
        'planeAltitudesKm', 'raanOffsetsDeg', 'sparesPerPlane',
    ];
    return arrayKeys.every((key) => {
        const a = left[key] as number[] | undefined;
        const b = right[key] as number[] | undefined;
        if (!a || !b) return a === b;
        return a.length === b.length && a.every((value, index) => value === b[index]);
    });
}

/** Angular budget for the "same constellation" test, degrees. */
const FIT_ANGLE_TOLERANCE_DEG = 0.05;
/** Altitude budget for the same test, km. */
const FIT_ALTITUDE_TOLERANCE_KM = 5;

/**
 * Shortest angular separation between two headings, degrees, in [0, 180].
 *
 * Ω₀ is normalised to [0, 360) by `fitWalker`, so a linear difference reports
 * 359.99° and 0.01° as 359.98° apart when they are 0.02° apart. Every angular
 * comparison on a RAAN has to close the circle.
 */
function circularSeparationDeg(a: number, b: number): number {
    return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/**
 * Whether a calibrated Walker fit still describes `reference`, for the CSV
 * provenance check and the TLE comparison diagnostic.
 *
 * Deliberately looser than walkerSpecsEqual, and not that function plus a
 * tolerance: fitWalker only ever estimates pattern, planes, satsPerPlane,
 * inclinationDeg, altitudeKm, phasingF, fudge and raan0Deg — it never
 * populates the per-plane ladder/seam/spares arrays a real reference profile
 * carries, so an array comparison would always fail regardless of tolerance.
 *
 * ── EVERY ESTIMATED PARAMETER IS COMPARED ───────────────────────────────────
 * This function once checked four of the eight. The consequence was not a
 * cosmetic one: editing `pattern`, `phasingF`, `fudge` or `raan0Deg` left
 * `matchesFit = true`, so the CSV provenance header presented the residuals of
 * a fit against constellation A as applicable to constellation B. A Star folded
 * into 180° and a Delta spread over 360° with
 * the same P, S, i and h are different fleets with different access geometry,
 * and the fit's residual says nothing about the second.
 *
 * Comparison mode follows how `fitWalker` produces each value:
 *  - `pattern` is a two-valued decision and `phasingF` is `Math.round`ed to an
 *    integer, so both are exact.
 *  - `inclinationDeg`, `altitudeKm` and `raan0Deg` are measured, and never
 *    exactly equal the reference's rounded nominal values — hence tolerances,
 *    circular for Ω₀.
 *  - `fudge` is a continuous ratio whose meaning is angular: it scales the
 *    inter-plane step, so it is judged by the plane displacement it causes
 *    rather than by its own magnitude, against the same angular budget.
 */
export function fitMatchesReference(fit: WalkerSpec, reference: WalkerSpec): boolean {
    if (fit.pattern !== reference.pattern) return false;
    if (fit.planes !== reference.planes) return false;
    if (fit.satsPerPlane !== reference.satsPerPlane) return false;
    if (fit.phasingF !== reference.phasingF) return false;
    if (Math.abs(fit.inclinationDeg - reference.inclinationDeg) >= FIT_ANGLE_TOLERANCE_DEG) return false;
    if (Math.abs(fit.altitudeKm - reference.altitudeKm) >= FIT_ALTITUDE_TOLERANCE_KM) return false;

    // Ω₀ defaults to 0 when absent (WalkerSpec), so an unset reference is a
    // constellation whose plane 0 sits at 0° — not a wildcard.
    if (circularSeparationDeg(fit.raan0Deg ?? 0, reference.raan0Deg ?? 0) >= FIT_ANGLE_TOLERANCE_DEG) {
        return false;
    }

    // The outermost plane sits at Ω₀ + fudge·(span/P)·(P−1). A fudge difference
    // displaces it by that much, which is the quantity access geometry actually
    // feels; comparing raw fudge would apply the same threshold to a 2-plane
    // shell and a 12-plane one.
    const span = reference.pattern === 'STAR' ? 180 : 360;
    const outerPlaneShiftDeg = reference.planes > 1
        ? Math.abs(fit.fudge - reference.fudge) * (span / reference.planes) * (reference.planes - 1)
        : 0;
    return outerPlaneShiftDeg < FIT_ANGLE_TOLERANCE_DEG;
}

/**
 * Which model the user chose. Stored as INTENTION, not derived from the spec.
 *
 * `referenceProfileFor` can only ever answer "does this spec equal a named
 * profile", which is a consequence. It cannot distinguish a shell fitted to the
 * live fleet from one typed by hand, because a fit never reproduces a profile's
 * per-plane ladder, seam and spares. Recording the choice removes that guess.
 *
 * Deliberately NOT part of `RevisitScenario`: that type is persisted, shared as
 * versioned JSON and exported to PDF, so a field there would force a schema
 * version bump and a migration for what is a UI-only fact.
 */
export type ReferenceMode = 'HLD' | 'CUSTOM';

/**
 * The subject of the customer question — WHOSE fleet the answer is about.
 *
 * The question used to hardcode "the Eutelsat LEO fleet" whatever the
 * model selector said. On `HLD` that is exactly right. On `CUSTOM` it is a
 * false claim, and a serious one: the seven Walker fields are free, so the user
 * can be simulating a 6 × 20 shell at 550 km while the sentence — and the
 * exported customer summary — puts Eutelsat's name on it.
 *
 * There is deliberately no third case. The live-TLE fit is a DIAGNOSTIC — it
 * answers "does the fleet still look like this Walker shell", and it is never
 * adopted as the analysed reference — so it can never be the subject of the
 * customer question. See `docs/REVISIT_MODEL_SEMANTICS_DECISION_2026-08-29.md`.
 */
export function fleetSubject(mode: ReferenceMode): string {
    switch (mode) {
        case 'HLD':
            return 'the Eutelsat LEO fleet';
        case 'CUSTOM':
            return 'this custom constellation';
    }
}

/**
 * The mode a loaded specification represents.
 *
 * Two cases only: the specification either IS the reference profile, structure
 * included, or it is the user's own. The live-TLE fit never enters here — it is
 * never applied to the scenario.
 */
export function referenceModeFor(spec: WalkerSpec): ReferenceMode {
    return walkerSpecsEqual(spec, DEFAULT_PROFILE.spec) ? 'HLD' : 'CUSTOM';
}

/** Resolve a named profile only while the complete specification still matches it. */
export function referenceProfileFor(spec: WalkerSpec): ReferenceProfile | null {
    return Object.values(REFERENCE_PROFILES)
        .find((profile) => walkerSpecsEqual(profile.spec, spec)) ?? null;
}

/** Active (payload-capable) satellites in a profile. */
export const activeSatelliteCount = (profile: ReferenceProfile): number =>
    profile.spec.planes * profile.spec.satsPerPlane;

/** Non-payload spares in a profile. */
export const spareSatelliteCount = (profile: ReferenceProfile): number =>
    (profile.spec.sparesPerPlane ?? []).reduce((sum, n) => sum + n, 0);

/** Everything drawn on the globe: active + spares. */
export const displayedSatelliteCount = (profile: ReferenceProfile): number =>
    activeSatelliteCount(profile) + spareSatelliteCount(profile);
