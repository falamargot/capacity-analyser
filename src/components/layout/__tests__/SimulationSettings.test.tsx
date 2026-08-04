// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationProvider } from '../../../contexts/SimulationContext';
import { SimulationClockProvider } from '../../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../../time/SimulationClock';
import { simulationSpeedToSliderPosition } from '../../../time/simulationSpeedScale';
import SimulationSettings from '../SimulationSettings';

let root: Root | null = null;
let container: HTMLDivElement;

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('SimulationSettings timeline controls', () => {
  it('can be controlled by the same open state as an external globe trigger', async () => {
    const clock = createSimulationClock({ now: () => Date.parse('2026-08-04T12:00:00.000Z') });
    const onOpenChange = vi.fn();

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" open={false} onOpenChange={onOpenChange} />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    const trigger = container.querySelector('[aria-controls]')!;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => click(trigger));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" open onOpenChange={onOpenChange} />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    expect(container.querySelector('[aria-label="Displayed scenario time"]')).not.toBeNull();

    await act(async () => click(container.querySelector('[aria-controls]')!));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('applies UTC time, reverses playback, and returns to live time', async () => {
    let wallNow = Date.parse('2026-08-04T12:00:00.000Z');
    const clock = createSimulationClock({ now: () => wallNow });

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });

    const trigger = container.querySelector('[aria-controls]');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    expect(trigger?.getAttribute('aria-label')).toContain('Live time');

    await act(async () => click(trigger!));
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[aria-label="Displayed scenario time"]')?.textContent)
      .toBe('2026-08-04 12:00:00 UTC');

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    const timeInput = container.querySelector('input[type="time"]') as HTMLInputElement;
    await act(async () => {
      changeInput(dateInput, '2031-02-03');
      changeInput(timeInput, '04:05:06');
    });
    const applyButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === 'Apply');
    await act(async () => click(applyButton!));

    expect(clock.getSnapshot()).toMatchObject({
      mode: 'simulation',
      speed: 1,
      anchorSimulationMs: Date.parse('2031-02-03T04:05:06.000Z'),
    });
    expect(container.querySelector('[aria-label="Displayed scenario time"]')?.textContent)
      .toBe('2031-02-03 04:05:06 UTC');

    const speedSlider = container.querySelector(
      '[aria-label="Exponential playback speed"]',
    ) as HTMLInputElement;
    await act(async () => {
      changeInput(speedSlider, String(simulationSpeedToSliderPosition(-5)));
      speedSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(clock.getSnapshot()).toMatchObject({ mode: 'simulation', speed: -5 });
    expect(speedSlider.getAttribute('aria-valuetext')).toBe('−5×');

    wallNow += 2_000;
    expect(clock.getTimeMs()).toBe(Date.parse('2031-02-03T04:04:56.000Z'));

    const resetButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Return to current time'));
    expect(resetButton?.className).toContain('bg-emerald-600');
    await act(async () => click(resetButton!));
    expect(clock.getSnapshot()).toMatchObject({ mode: 'live', speed: 1 });
    expect(clock.getTimeMs()).toBe(wallNow);
    expect(trigger?.getAttribute('aria-label')).toContain('Live time');
    expect(resetButton?.className).toContain('bg-gray-100');
    expect(speedSlider.value).toBe('20');
  });

  it('pauses at the central detent and resumes at 1×', async () => {
    let wallNow = Date.parse('2026-08-04T12:00:00.000Z');
    const clock = createSimulationClock({ now: () => wallNow });

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    await act(async () => click(container.querySelector('[aria-controls]')!));
    const speedSlider = container.querySelector(
      '[aria-label="Exponential playback speed"]',
    ) as HTMLInputElement;

    await act(async () => {
      changeInput(speedSlider, '0');
      speedSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(clock.getSnapshot()).toMatchObject({ mode: 'simulation', speed: 0 });
    expect(speedSlider.getAttribute('aria-valuetext')).toBe('Pause');
    const pausedAt = clock.getTimeMs();
    wallNow += 5_000;
    expect(clock.getTimeMs()).toBe(pausedAt);

    await act(async () => {
      changeInput(speedSlider, '20');
      speedSlider.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(clock.getSnapshot()).toMatchObject({ mode: 'simulation', speed: 1 });
    expect(speedSlider.getAttribute('aria-valuetext')).toBe('1×');
  });

  it('issues exactly one clock command for a whole slider drag', async () => {
    // Every clock command bumps the timeline revision, and every revision
    // recycles the SGP4 worker and re-uploads ~640 satrecs. A range input emits
    // one event per step, so applying per event turned a single drag into
    // hundreds of worker restarts. The thumb must track the pointer live while
    // the clock hears about it once, on release.
    const clock = createSimulationClock({ now: () => Date.parse('2026-08-04T12:00:00.000Z') });
    const revisions: number[] = [];
    clock.subscribe(() => revisions.push(clock.getSnapshot().revision));

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    await act(async () => click(container.querySelector('[aria-controls]')!));
    const speedSlider = container.querySelector(
      '[aria-label="Exponential playback speed"]',
    ) as HTMLInputElement;

    // Drag across every intermediate step, as a real pointer would.
    await act(async () => {
      for (let position = 21; position <= 100; position++) {
        changeInput(speedSlider, String(position));
      }
    });
    expect(revisions).toEqual([]);
    expect(clock.getSnapshot()).toMatchObject({ mode: 'live', speed: 1 });
    // The thumb and its label still follow the pointer during the drag.
    expect(speedSlider.getAttribute('aria-valuetext')).toBe('100×');

    await act(async () => speedSlider.dispatchEvent(new Event('pointerup', { bubbles: true })));
    expect(revisions).toEqual([1]);
    expect(clock.getSnapshot().speed).toBe(100);
    expect(speedSlider.value).toBe('100');

    // Releasing again without moving the thumb must not cost another revision.
    await act(async () => speedSlider.dispatchEvent(new Event('pointerup', { bubbles: true })));
    expect(revisions).toEqual([1]);
  });

  it('discards a slider drag that is abandoned by unmounting', async () => {
    const clock = createSimulationClock({ now: () => Date.parse('2026-08-04T12:00:00.000Z') });
    const revisions: number[] = [];
    clock.subscribe(() => revisions.push(clock.getSnapshot().revision));

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="ALL" />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    await act(async () => click(container.querySelector('[aria-controls]')!));
    const speedSlider = container.querySelector(
      '[aria-label="Exponential playback speed"]',
    ) as HTMLInputElement;
    await act(async () => changeInput(speedSlider, '80'));

    await act(async () => root?.unmount());
    root = null;

    // An uncommitted rate is never applied behind the user's back.
    expect(revisions).toEqual([]);
    expect(clock.getSnapshot()).toMatchObject({ mode: 'live', speed: 1 });
  });

  it('runs its display interval only while the panel is open', async () => {
    const intervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const clock = createSimulationClock({ now: () => Date.parse('2026-08-04T12:00:00.000Z') });

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <SimulationProvider>
            <SimulationSettings satelliteScope="GEO" />
          </SimulationProvider>
        </SimulationClockProvider>,
      );
    });
    expect(intervalSpy).not.toHaveBeenCalled();

    const trigger = container.querySelector('[aria-controls]')!;
    await act(async () => click(trigger));
    expect(intervalSpy).toHaveBeenCalledTimes(1);

    await act(async () => click(trigger));
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
