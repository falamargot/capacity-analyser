import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock, ClockStep, JulianDate } from 'cesium';
import {
    configureCesiumClock,
    configureLiveCesiumClock,
    configureSimulationCesiumClock,
} from '../liveClock';

describe('configureLiveCesiumClock', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('leaves the real Cesium clock in absolute system-clock mode', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

        const clock = new Clock({
            currentTime: JulianDate.fromIso8601('2026-07-29T09:00:00.000Z'),
            canAnimate: false,
            shouldAnimate: false,
            clockStep: ClockStep.SYSTEM_CLOCK_MULTIPLIER,
        });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };

        configureLiveCesiumClock(viewer);

        expect(viewer.allowDataSourcesToSuspendAnimation).toBe(false);
        expect(clock.canAnimate).toBe(true);
        expect(clock.shouldAnimate).toBe(true);
        expect(clock.multiplier).toBe(1);
        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK);
        expect(JulianDate.toDate(clock.currentTime).toISOString())
            .toBe('2026-07-29T10:00:00.000Z');
    });

    it('re-snaps to current UTC on the first tick after a long gap', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));

        const clock = new Clock({ canAnimate: false, shouldAnimate: false });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };
        configureLiveCesiumClock(viewer);

        vi.setSystemTime(new Date('2026-07-29T10:00:27.000Z'));
        clock.tick();

        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK);
        expect(JulianDate.toDate(clock.currentTime).toISOString())
            .toBe('2026-07-29T10:00:27.000Z');
    });
});

describe('configureSimulationCesiumClock', () => {
    it('starts Cesium at the scenario date and advances with the selected speed', () => {
        const clock = new Clock({ canAnimate: false, shouldAnimate: false });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };

        configureSimulationCesiumClock(viewer, {
            mode: 'simulation',
            speed: 5,
            anchorSimulationMs: Date.parse('2030-01-02T03:04:05.000Z'),
            anchorWallClockMs: 0,
            revision: 3,
        }, Date.parse('2030-01-02T03:04:07.000Z'));

        expect(viewer.allowDataSourcesToSuspendAnimation).toBe(false);
        expect(clock.canAnimate).toBe(true);
        expect(clock.shouldAnimate).toBe(true);
        expect(clock.multiplier).toBe(5);
        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK_MULTIPLIER);
        expect(JulianDate.toDate(clock.currentTime).toISOString())
            .toBe('2030-01-02T03:04:07.000Z');
    });

    it('supports reverse time and restores absolute live mode', () => {
        const clock = new Clock({ canAnimate: false, shouldAnimate: false });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };

        configureCesiumClock(viewer, {
            mode: 'simulation',
            speed: -10,
            anchorSimulationMs: Date.parse('2025-04-03T02:01:00.000Z'),
            anchorWallClockMs: 0,
            revision: 7,
        }, Date.parse('2025-04-03T02:01:00.000Z'));

        expect(clock.multiplier).toBe(-10);
        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK_MULTIPLIER);

        configureCesiumClock(viewer, {
            mode: 'live',
            speed: 1,
            anchorSimulationMs: 0,
            anchorWallClockMs: 0,
            revision: 8,
        }, Date.now());

        expect(clock.multiplier).toBe(1);
        expect(clock.shouldAnimate).toBe(true);
        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK);
    });

    it('stops Cesium animation while playback is paused', () => {
        const clock = new Clock({ canAnimate: false, shouldAnimate: true });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };

        configureSimulationCesiumClock(viewer, {
            mode: 'simulation',
            speed: 0,
            anchorSimulationMs: 1_000,
            anchorWallClockMs: 0,
            revision: 2,
        }, 1_000);

        expect(clock.multiplier).toBe(0);
        expect(clock.shouldAnimate).toBe(false);
        expect(clock.clockStep).toBe(ClockStep.SYSTEM_CLOCK_MULTIPLIER);
    });

    it('does not count a hidden-tab gap twice when re-anchoring accelerated time', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-07-29T10:00:00.000Z'));
        const initialScenarioMs = Date.parse('2030-01-02T03:04:05.000Z');
        const clock = new Clock({ canAnimate: false, shouldAnimate: false });
        const viewer = {
            allowDataSourcesToSuspendAnimation: true,
            clock,
        };
        const snapshot = {
            mode: 'simulation' as const,
            speed: 5 as const,
            anchorSimulationMs: initialScenarioMs,
            anchorWallClockMs: Date.now(),
            revision: 1,
        };

        configureSimulationCesiumClock(viewer, snapshot, initialScenarioMs);
        vi.advanceTimersByTime(10_000);

        const reanchoredScenarioMs = initialScenarioMs + 50_000;
        configureSimulationCesiumClock(viewer, snapshot, reanchoredScenarioMs);
        clock.tick();

        expect(JulianDate.toDate(clock.currentTime).getTime()).toBe(reanchoredScenarioMs);
    });
});
