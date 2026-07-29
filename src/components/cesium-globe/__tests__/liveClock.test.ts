import { afterEach, describe, expect, it, vi } from 'vitest';
import { Clock, ClockStep, JulianDate } from 'cesium';
import { configureLiveCesiumClock } from '../liveClock';

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
