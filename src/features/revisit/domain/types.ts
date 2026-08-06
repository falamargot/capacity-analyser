/**
 * types.ts — the vocabulary of the revisit engine.
 *
 * Lot 1 is headless: nothing here may reference Cesium, React or the DOM.
 * Every type is plain data so it survives a structured clone into a Worker.
 *
 * Conventions fixed once, here, and relied on everywhere downstream:
 *  - Angles are degrees at module boundaries, radians only inside a function.
 *  - Times are UTC milliseconds (matching SimulationClock.getTimeMs()).
 *  - Distances are kilometres.
 *  - Plane and in-plane indices are ZERO-based (design note §3.1).
 */

/** RAAN span of the reference constellation: STAR spreads over 180°, DELTA over 360°. */
export type WalkerPattern = 'STAR' | 'DELTA';

/** The host fleet — a parametric Walker constellation, `i: T/P/F` with `T = P·S`. */
export interface WalkerSpec {
    pattern: WalkerPattern;
    /** P — number of orbital planes. */
    planes: number;
    /** S — satellites per plane. Total T = P·S. */
    satsPerPlane: number;
    inclinationDeg: number;
    altitudeKm: number;
    /**
     * f — Walker phasing factor F. Integer 0…P−1 nominally; non-integer values
     * are permitted (and are non-standard, which callers should surface).
     */
    phasingF: number;
    /**
     * Scales the inter-plane RAAN step away from the ideal uniform value.
     * 1 is the textbook Walker. Real fleets are not flown exactly uniform.
     */
    fudge: number;
    /** Ω₀ — right ascension of the ascending node of plane 0. Defaults to 0. */
    raan0Deg?: number;
}

/**
 * Which satellites of the reference fleet carry one of our hosted payloads.
 *
 * Selected planes are `p ∈ {0, x, 2x, …}`; within the k-th *selected* plane the
 * chosen in-plane indices are `{ (k·z + j·y) mod S | j = 0 … S/y − 1 }`.
 */
export interface SubConstellationSpec {
    /** x — plane stride. Must divide P. */
    planeStride: number;
    /** y — in-plane stride. Must divide S. */
    satStride: number;
    /** z — in-plane index shift applied once per selected plane. 0 ≤ z ≤ S−1. */
    planeShift: number;
}

/**
 * A satellite of the reference constellation at epoch.
 *
 * Circular orbits (e = 0), so the argument of perigee is undefined and true
 * anomaly collapses into the argument of latitude `u` measured from the
 * ascending node.
 */
export interface OrbitalElements {
    /** `P{pp}_S{ss}`, zero-based, zero-padded to two digits — e.g. `P03_S07`. */
    id: string;
    /** p — zero-based plane index. */
    planeIndex: number;
    /** s — zero-based index within the plane. */
    satIndexInPlane: number;
    /** a = R_e + h, kilometres from Earth centre. */
    semiMajorAxisKm: number;
    inclinationDeg: number;
    /** Ω₀ at epoch. */
    raanDeg: number;
    /** u₀ at epoch — argument of latitude. */
    argLatDeg: number;
}

/** Earth-centred inertial state. Position km, velocity km/s. */
export interface EciState {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
}

/** The instrument. Half-angles are seen from the satellite, not from the ground. */
export interface FovSpec {
    /**
     * Boresight offset from nadir. `alongTrack` tilts the boresight toward the
     * velocity vector, `crossTrack` toward the cross-track (+Y) axis.
     */
    biasDeg: { alongTrack: number; crossTrack: number };
    shape: 'ELLIPSE' | 'RECTANGLE';
    /** θ₁ — semi-axis 1 / half-width, about the (clocked) first transverse axis. */
    halfAngle1Deg: number;
    /** θ₂ — semi-axis 2 / half-height, about the (clocked) second transverse axis. */
    halfAngle2Deg: number;
    /** Rotation of the FOV about its own boresight. */
    clockingDeg: number;
    /** Optional ground-station-style mask, applied on top of FOV containment. */
    minElevationDeg?: number;
}

/** A point on the ground we want to see. Areas are deferred (ADR-001 §5). */
export interface PointTarget {
    kind: 'POINT';
    name: string;
    latDeg: number;
    lonDeg: number;
    /** Height above the sphere, km. Defaults to 0. */
    altitudeKm?: number;
}

export type Target = PointTarget;

/** The analysis window. 72 h is the default; below 24 h the result is unreliable. */
export interface AnalysisWindow {
    /** UTC milliseconds at the start of the window — also the propagation epoch. */
    startMs: number;
    durationHours: number;
    /**
     * Coarse containment sampling step. Must be well below the shortest pass;
     * transitions are then refined by bisection, so this trades run time for
     * the risk of missing a pass entirely, not for AOS/LOS precision.
     */
    stepSeconds: number;
}

/**
 * Everything the engine needs to produce a result. One plain-data object, so it
 * survives a structured clone into the worker and can be compared by value to
 * decide whether a recompute is needed.
 */
export interface RevisitScenario {
    /** The host fleet. */
    reference: WalkerSpec;
    /** Which of its satellites carry our payload. */
    selection: SubConstellationSpec;
    /** The instrument. */
    payload: FovSpec;
    target: Target;
    window: AnalysisWindow;
}

/** A continuous span during which at least one selected satellite sees the target. */
export interface AccessInterval {
    startMs: number;
    endMs: number;
    /** Ids of satellites contributing to this interval, in first-seen order. */
    satelliteIds: string[];
    /** True when the span is cut by the window edge rather than by a real LOS. */
    clippedAtStart: boolean;
    clippedAtEnd: boolean;
}

/**
 * The result. `maxGapMs` is the headline (ADR-001 §3): the longest interval with
 * no access, with gaps truncated by the window boundary discarded.
 */
export interface GapStatistics {
    /** Longest interior gap. `null` when the window contains no interior gap. */
    maxGapMs: number | null;
    meanGapMs: number | null;
    p95GapMs: number | null;
    /** Number of distinct access intervals after union across the sub-constellation. */
    accessCount: number;
    /** Share of the window with at least one satellite in view, 0…1. */
    fractionInView: number;
    meanAccessDurationMs: number | null;
    totalInViewMs: number;
    /** Interior gaps only — the population the statistics above are computed over. */
    interiorGapCount: number;
    /** How many boundary-truncated gaps were discarded (0, 1 or 2). */
    boundaryGapsDiscarded: number;
    coverage: 'NEVER_IN_VIEW' | 'ALWAYS_IN_VIEW' | 'INTERMITTENT';
    /** Human-readable caveats — short window, never in view, and so on. */
    warnings: string[];
}
