import { ClockStep, JulianDate } from 'cesium';
import type { SimulationClockSnapshot } from '../../time/SimulationClock';

/**
 * Minimal viewer surface needed to configure the current LIVE clock.
 *
 * Keep this separate from CesiumGlobe so the ordering contract can be tested
 * with Cesium's real Clock implementation. In particular, assigning
 * currentTime, multiplier, or shouldAnimate after SYSTEM_CLOCK would silently
 * demote the clock to SYSTEM_CLOCK_MULTIPLIER.
 */
export interface CesiumClockViewer {
    allowDataSourcesToSuspendAnimation: boolean;
    clock: {
        canAnimate: boolean;
        clockStep: ClockStep;
        currentTime: JulianDate;
        multiplier: number;
        shouldAnimate: boolean;
        tick: () => JulianDate;
    };
}

export function configureLiveCesiumClock(viewer: CesiumClockViewer): void {
    // LIVE wall-clock time must not pause while Cesium visualizers finish
    // asynchronous work. requestRenderMode still controls whether a frame is
    // drawn; this only guarantees that a rendered frame receives current UTC.
    viewer.allowDataSourcesToSuspendAnimation = false;
    viewer.clock.canAnimate = true;

    // Must be last. Cesium sets currentTime=JulianDate.now(), multiplier=1 and
    // shouldAnimate=true when SYSTEM_CLOCK is assigned.
    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
}

export function configureSimulationCesiumClock(
    viewer: CesiumClockViewer,
    snapshot: SimulationClockSnapshot,
    scenarioTimeMs: number,
): void {
    viewer.allowDataSourcesToSuspendAnimation = false;

    // Consume Cesium's elapsed-system-time accumulator while animation is
    // disabled. Otherwise, after a hidden tab is re-anchored below, the first
    // rendered tick would add the hidden duration a second time.
    viewer.clock.canAnimate = false;
    viewer.clock.tick();

    viewer.clock.currentTime = JulianDate.fromDate(new Date(scenarioTimeMs));
    viewer.clock.multiplier = snapshot.speed;
    viewer.clock.shouldAnimate = snapshot.speed !== 0;
    viewer.clock.canAnimate = true;

    // Must be last: assigning currentTime/multiplier/shouldAnimate changes a
    // SYSTEM_CLOCK clock back to SYSTEM_CLOCK_MULTIPLIER in Cesium.
    viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK_MULTIPLIER;
}

export function configureCesiumClock(
    viewer: CesiumClockViewer,
    snapshot: SimulationClockSnapshot,
    scenarioTimeMs: number,
): void {
    if (snapshot.mode === 'live') {
        configureLiveCesiumClock(viewer);
        return;
    }

    configureSimulationCesiumClock(viewer, snapshot, scenarioTimeMs);
}
