/**
 * Centralized configuration for beam visualization.
 *
 * All RF-power-related rendering parameters are gathered here so that
 * changes to the physics model are automatically reflected in both
 * individual beam rendering and the Aggregated Connectivity layer.
 */
import { Color } from 'cesium';

// ────────────────────────────────────────────────────────────────────
// Power-decay model
// ────────────────────────────────────────────────────────────────────
export const POWER_DECAY = {
    /** Model type – only COSINE_N is currently implemented */
    MODEL: 'COSINE_N' as const,
    /** Exponent for cos^n decay (higher = sharper roll-off) */
    COSINE_EXPONENT: 8,

    // Thresholds (linear power ratios)
    THRESHOLD_3DB: 0.707,   // −3 dB
    THRESHOLD_6DB: 0.501,   // −6 dB
    THRESHOLD_10DB: 0.316,  // −10 dB
} as const;

// ────────────────────────────────────────────────────────────────────
// Gradient rendering
// ────────────────────────────────────────────────────────────────────
export const GRADIENT_RENDERING = {
    /** Master switch – when false, beams use a single flat polygon */
    ENABLE_GRADIENT: true,

    /**
     * Each ring definition: percentage of polygon radius + opacity.
     * Ordered from outermost (full polygon) to innermost (beam center).
     * The `scaleFactor` contracts the polygon toward its centroid.
     */
    RINGS: [
        { scaleFactor: 1.00, opacity: 0.08 },   // −10 dB edge
        { scaleFactor: 0.85, opacity: 0.15 },   // −6 dB zone
        { scaleFactor: 0.70, opacity: 0.30 },   // −3 dB zone
        { scaleFactor: 0.50, opacity: 0.50 },   // nominal zone
        { scaleFactor: 0.30, opacity: 0.75 },   // boresight core
    ],
} as const;

// ────────────────────────────────────────────────────────────────────
// Frequency-reuse 4-color scheme
// ────────────────────────────────────────────────────────────────────
export const FREQUENCY_REUSE = {
    ENABLED: true,
    /** Number of color groups (classic 4-cell pattern) */
    PATTERN: 4,

    /** Color for each frequency group (A–D) */
    COLORS: {
        GROUP_A: Color.fromBytes(219, 39, 119, 255),   // Rose foncé
        GROUP_B: Color.fromBytes(236, 72, 153, 255),   // Rose clair
        GROUP_C: Color.fromBytes(168, 85, 247, 255),   // Violet
        GROUP_D: Color.fromBytes(217, 70, 239, 255),   // Magenta
    },
} as const;

/** Look-up ordered list of group keys so we can index by beamIndex % 4 */
const GROUP_KEYS = ['GROUP_A', 'GROUP_B', 'GROUP_C', 'GROUP_D'] as const;

/** Return the frequency-reuse group key for a given beam index */
export function getFrequencyGroup(beamIndex: number): typeof GROUP_KEYS[number] {
    return GROUP_KEYS[beamIndex % FREQUENCY_REUSE.PATTERN];
}

/** Return the Cesium Color for a beam based on its frequency-reuse group */
export function getBeamBaseColor(beamIndex: number): Color {
    if (!FREQUENCY_REUSE.ENABLED) {
        return Color.fromBytes(219, 39, 119, 255); // Default pink
    }
    const group = getFrequencyGroup(beamIndex);
    return FREQUENCY_REUSE.COLORS[group].clone();
}

// ────────────────────────────────────────────────────────────────────
// Aggregated Connectivity thresholds
// ────────────────────────────────────────────────────────────────────
export const AGGREGATED_CONNECTIVITY = {
    /**
     * Power level (dB) below beam center at which a cell is still
     * considered "covered".  Must match the outermost visible ring
     * in the gradient rendering so that the grid and beams align.
     */
    THRESHOLD_DB: -10,

    /** If true, show grid cells below the threshold (debug only) */
    SHOW_BELOW_THRESHOLD: false,
} as const;

// ────────────────────────────────────────────────────────────────────
// Connectivity / link-quality thresholds
// ────────────────────────────────────────────────────────────────────
export const CONNECTIVITY_THRESHOLDS = {
    EXCELLENT: -3,   // dB from beam center
    GOOD: -6,
    ACCEPTABLE: -10,
    MINIMUM: -12,
} as const;

export type LinkQualityLevel = 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'MINIMUM' | 'NO_SIGNAL';

// ────────────────────────────────────────────────────────────────────
// Debug flags
// ────────────────────────────────────────────────────────────────────
export const DEBUG = {
    SHOW_POWER_CONTOURS: false,
    SHOW_BEAM_CENTERS: false,
    LOG_CALCULATIONS: false,
    SHOW_THRESHOLD_RADIUS: false,
} as const;

// ────────────────────────────────────────────────────────────────────
// Convenience aggregate export
// ────────────────────────────────────────────────────────────────────
export const BEAM_VISUALIZATION_CONFIG = {
    POWER_DECAY,
    RENDERING: GRADIENT_RENDERING,
    FREQUENCY_REUSE,
    AGGREGATED_CONNECTIVITY,
    CONNECTIVITY_THRESHOLDS,
    DEBUG,
} as const;
