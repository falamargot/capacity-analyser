import { ClockStep } from 'cesium';

/**
 * Minimal viewer surface needed to configure the current LIVE clock.
 *
 * Keep this separate from CesiumGlobe so the ordering contract can be tested
 * with Cesium's real Clock implementation. In particular, assigning
 * currentTime, multiplier, or shouldAnimate after SYSTEM_CLOCK would silently
 * demote the clock to SYSTEM_CLOCK_MULTIPLIER.
 */
export interface LiveClockViewer {
    allowDataSourcesToSuspendAnimation: boolean;
    clock: {
        canAnimate: boolean;
        clockStep: ClockStep;
    };
}

export function configureLiveCesiumClock(viewer: LiveClockViewer): void {
    // LIVE wall-clock time must not pause while Cesium visualizers finish
    // asynchronous work. requestRenderMode still controls whether a frame is
    // drawn; this only guarantees that a rendered frame receives current UTC.
    viewer.allowDataSourcesToSuspendAnimation = false;
    viewer.clock.canAnimate = true;

    // Must be last. Cesium sets currentTime=JulianDate.now(), multiplier=1 and
    // shouldAnimate=true when SYSTEM_CLOCK is assigned.
    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
}
