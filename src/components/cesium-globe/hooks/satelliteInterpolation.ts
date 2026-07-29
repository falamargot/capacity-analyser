/**
 * The interpolation that decides where a satellite is DRAWN.
 *
 * Extracted from usePositionCallbacks (behaviour unchanged) so it can be
 * evaluated without Cesium — by the dev-only orbital-alignment diagnostic, and
 * by deterministic fixed-UTC tests. Everything here is pure.
 *
 * The globe does not draw raw SGP4 output: a worker propagates the
 * constellation about once a second with a lookahead, and these functions blend
 * linearly between the last two samples using wall-clock time.
 */

export interface SatellitePosition {
    lat: number;
    lng: number;
    /** Kilometres. */
    alt: number;
}

export interface SatelliteSampleWindow {
    previousPosition: SatellitePosition;
    currentPosition: SatellitePosition;
    previousSampleTimeMs: number;
    currentSampleTimeMs: number;
}

export const SATELLITE_INTERPOLATION_FALLBACK_MS = 1000;

// How far past the latest sample we allow linear extrapolation before the satellite
// appears frozen. During normal foreground operation the next worker tick arrives
// ~200 ms before the current sample expires, so this cap is almost never reached.
//
// The cap is intentionally generous (4 s) to cover two tab-resume scenarios:
//   1. The last background timer fired ≥2 s before the tab became visible.
//   2. A React reconciliation burst on resume blocks rAF for 1-2 s while
//      calculateCoverages runs for 640 satellites.
// In both cases the satellite must keep moving on screen until the
// visibilitychange handler (useSatelliteLoader) delivers fresh positions.
// Linear drift over 4 s is ~30 km for a LEO satellite — acceptable for a
// capacity analyser. Tighten this if orbital accuracy becomes a concern.
export const SATELLITE_MAX_EXTRAPOLATION_MS = 4000;

/**
 * How far BEFORE the older sample the same chord may be extrapolated backwards.
 *
 * Why this exists (measured, 2026-07-29): the worker propagates at
 * `Date.now() + 1200 ms`, so for a moment after each tick BOTH samples in the
 * window are still in the future and `progress` clamped at 0 pinned the marker
 * to the older sample — i.e. the globe drew where the satellite WILL be. The
 * fixed-UTC diagnostic measured that lead at up to 200 ms, worth ~1.1 km of
 * ground-track error at OneWeb speeds, right after every tick.
 *
 * The same measurement showed the chord itself is accurate to ~10 m over ±4 s,
 * so extrapolating backwards along it is far more accurate than freezing on the
 * sample. 400 ms covers the worst observed clamp with margin while staying
 * bounded, so a late or out-of-order sample can never run the marker backwards
 * indefinitely.
 */
export const SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS = 400;

export const positionsMatch = (a: SatellitePosition, b: SatellitePosition): boolean => (
    a.lat === b.lat &&
    a.lng === b.lng &&
    a.alt === b.alt
);

const lerp = (start: number, end: number, t: number): number => (
    start + ((end - start) * t)
);

export const interpolateLongitudeDegrees = (start: number, end: number, t: number): number => {
    let delta = end - start;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;

    const value = start + (delta * t);
    if (value > 180) return value - 360;
    if (value < -180) return value + 360;
    return value;
};

export const getInterpolatedSatellitePosition = (
    previousPosition: SatellitePosition,
    currentPosition: SatellitePosition,
    previousSampleTimeMs: number,
    currentSampleTimeMs: number,
    nowMs: number
): SatellitePosition => {
    const sampleDuration = Math.max(currentSampleTimeMs - previousSampleTimeMs, 1);
    const maxProgress = 1 + (SATELLITE_MAX_EXTRAPOLATION_MS / sampleDuration);
    const minProgress = -(SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS / sampleDuration);
    const progress = Math.min(Math.max((nowMs - previousSampleTimeMs) / sampleDuration, minProgress), maxProgress);
    return {
        lat: lerp(previousPosition.lat, currentPosition.lat, progress),
        lng: interpolateLongitudeDegrees(previousPosition.lng, currentPosition.lng, progress),
        alt: lerp(previousPosition.alt, currentPosition.alt, progress),
    };
};

/**
 * The exact position the globe draws for a satellite at `nowMs`.
 *
 * `progress` is bounded on both sides: forward by
 * SATELLITE_MAX_EXTRAPOLATION_MS (a late sample must not freeze the marker),
 * backward by SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS (the propagation
 * lookahead leaves wall-clock time behind both samples for a moment after each
 * tick, and freezing there drew the satellite ahead of real time).
 */
export const resolveDisplayedSatellitePosition = (
    window: SatelliteSampleWindow,
    nowMs: number
): SatellitePosition => {
    if (positionsMatch(window.previousPosition, window.currentPosition)) {
        return window.currentPosition;
    }
    return getInterpolatedSatellitePosition(
        window.previousPosition,
        window.currentPosition,
        window.previousSampleTimeMs,
        window.currentSampleTimeMs,
        nowMs
    );
};
