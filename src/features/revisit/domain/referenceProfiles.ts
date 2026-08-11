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

/** Active (payload-capable) satellites in a profile. */
export const activeSatelliteCount = (profile: ReferenceProfile): number =>
    profile.spec.planes * profile.spec.satsPerPlane;

/** Non-payload spares in a profile. */
export const spareSatelliteCount = (profile: ReferenceProfile): number =>
    (profile.spec.sparesPerPlane ?? []).reduce((sum, n) => sum + n, 0);

/** Everything drawn on the globe: active + spares. */
export const displayedSatelliteCount = (profile: ReferenceProfile): number =>
    activeSatelliteCount(profile) + spareSatelliteCount(profile);
