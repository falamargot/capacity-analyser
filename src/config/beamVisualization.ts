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
        { scaleFactor: 1.00, opacity: 0.10 },   // −10 dB edge
        { scaleFactor: 0.85, opacity: 0.18 },   // −6 dB zone
        { scaleFactor: 0.70, opacity: 0.36 },   // −3 dB zone
        { scaleFactor: 0.50, opacity: 0.60 },   // nominal zone
        { scaleFactor: 0.30, opacity: 0.90 },   // boresight core
    ],
} as const;

// ────────────────────────────────────────────────────────────────────
// Frequency-reuse 4-color scheme with frequency assignments
// ────────────────────────────────────────────────────────────────────
export const FREQUENCY_REUSE = {
    ENABLED: true,
    /**
     * 4-cell frequency-reuse pattern (beamIndex % 4).
     * OneWeb Gen 1 uses 8 × 250 MHz Ku-band channels (4 frequency slices × 2 polarizations).
     * Two beams share each channel: e.g. beams 0 & 8 share GROUP_A/LHCP with ~4 cross-track
     * beams of separation (~810 km), providing sufficient spatial isolation for co-channel reuse.
     *
     * Capacity constraint: the total available Ku-band throughput is limited to
     * 8 channels × 250 MHz — NOT 16 independent channels. The per-satellite 7.2 Gbps
     * headline capacity already accounts for this 4× frequency-reuse factor.
     * Two co-channel beams CANNOT independently schedule conflicting transmissions —
     * the scheduler must coordinate them. This constraint is NOT currently modelled in
     * the beam-level capacity simulation.
     */
    PATTERN: 4,

    /**
     * Number of beams that share each Ku-band frequency channel.
     * With PATTERN=4 groups × 4 beams each and 2-polarization isolation:
     *   8 effective channels, 2 beams per channel (separated by ~810 km cross-track).
     */
    BEAMS_PER_FREQUENCY_CHANNEL: 2,

    /** Color for each frequency group (A–D) */
    COLORS: {
        GROUP_A: Color.fromBytes(219, 39, 119, 255),   // Rose foncé
        GROUP_B: Color.fromBytes(236, 72, 153, 255),   // Rose clair
        GROUP_C: Color.fromBytes(168, 85, 247, 255),   // Violet
        GROUP_D: Color.fromBytes(217, 70, 239, 255),   // Magenta
    },

    /** Frequency assignments for each group (in GHz) - OneWeb Gen 1 FDD specs */
    FREQUENCIES: {
        GROUP_A: { downlink: '10.70-11.20', uplink: '14.00-14.12', band: 'Ku', polarization: 'LHCP' }, // Beams 0, 4, 8, 12
        GROUP_B: { downlink: '11.20-11.70', uplink: '14.12-14.25', band: 'Ku', polarization: 'RHCP' }, // Beams 1, 5, 9, 13
        GROUP_C: { downlink: '11.70-12.20', uplink: '14.25-14.37', band: 'Ku', polarization: 'LHCP' }, // Beams 2, 6, 10, 14
        GROUP_D: { downlink: '12.20-12.70', uplink: '14.37-14.50', band: 'Ku', polarization: 'RHCP' }, // Beams 3, 7, 11, 15
    },

    /** Gateway/Backhaul Ka-band frequencies */
    GATEWAY: {
        downlink: '17.80-19.30', // Backhaul DL
        uplink: '27.50-30.00',   // Backhaul UL
        band: 'Ka'
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

/** Return frequency information for a beam based on its frequency-reuse group */
export function getBeamFrequency(beamIndex: number): typeof FREQUENCY_REUSE.FREQUENCIES[keyof typeof FREQUENCY_REUSE.FREQUENCIES] {
    const group = getFrequencyGroup(beamIndex);
    return FREQUENCY_REUSE.FREQUENCIES[group];
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
