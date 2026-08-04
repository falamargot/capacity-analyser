// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActiveScenarioContext from '../ActiveScenarioContext';
import { SimulationClockProvider } from '../../../contexts/SimulationClockContext';
import { createSimulationClock } from '../../../time/SimulationClock';

let root: Root | null = null;

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('ActiveScenarioContext', () => {
  it('renders the UTC clock, GEO UL/DL coverage and active LEO satellites', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:15:42.000Z'));
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider>
          <ActiveScenarioContext
            geo={{
              status: 'resolved',
              satelliteName: 'EUTELSAT 10B',
              uplinkCoverage: 'Europe Tx',
              downlinkCoverage: 'Europe Rx',
            }}
            leo={{
              status: 'resolved',
              satelliteNames: ['ONEWEB-0364', 'ONEWEB-0212'],
            }}
          />
        </SimulationClockProvider>,
      );
    });

    expect(container.querySelector('time')?.textContent).toBe('2026-07-24 08:15:42 UTC');
    expect(container.querySelector('[aria-label="GEO active scenario"]')?.textContent)
      .toContain('GEOEUTELSAT 10BUL Europe TxDL Europe Rx');
    expect(container.querySelector('[aria-label="LEO active scenario"]')?.textContent)
      .toContain('LEOONEWEB-0364 · ONEWEB-0212');
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Toggle scenario time controls');
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it('keeps the timer visible without an active scenario', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:15:42.000Z'));
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider>
          <ActiveScenarioContext geo={null} leo={null} />
        </SimulationClockProvider>,
      );
    });

    expect(container.querySelector('time')?.textContent).toBe('2026-07-24 08:15:42 UTC');
    expect(container.querySelectorAll('section')).toHaveLength(0);
  });

  it('delegates opening and closing the shared time controls from the clock', async () => {
    const onTimeToggle = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider>
          <ActiveScenarioContext geo={null} leo={null} onTimeToggle={onTimeToggle} />
        </SimulationClockProvider>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Toggle scenario time controls"]')?.click();
    });
    expect(onTimeToggle).toHaveBeenCalledTimes(1);
  });

  it('delegates camera focus for each displayed GEO and LEO satellite', async () => {
    const onSatelliteFocus = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider>
          <ActiveScenarioContext
            geo={{ status: 'resolved', satelliteName: 'EUTELSAT 10B' }}
            leo={{ status: 'resolved', satelliteNames: ['ONEWEB-0364', 'ONEWEB-0212'] }}
            onSatelliteFocus={onSatelliteFocus}
          />
        </SimulationClockProvider>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Focus GEO satellite EUTELSAT 10B"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Focus LEO satellite ONEWEB-0364"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Focus LEO satellite ONEWEB-0212"]')?.click();
    });

    expect(onSatelliteFocus.mock.calls).toEqual([
      ['EUTELSAT 10B'],
      ['ONEWEB-0364'],
      ['ONEWEB-0212'],
    ]);
  });

  it('delegates camera focus for each displayed GEO coverage', async () => {
    const onGeoCoverageFocus = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider>
          <ActiveScenarioContext
            geo={{
              status: 'resolved',
              satelliteName: 'EUTELSAT 10B',
              uplinkCoverage: 'Europe Tx',
              downlinkCoverage: 'Europe Rx',
            }}
            leo={null}
            onGeoCoverageFocus={onGeoCoverageFocus}
          />
        </SimulationClockProvider>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[aria-label="Focus GEO uplink coverage Europe Tx"]')?.click();
      container.querySelector<HTMLButtonElement>('[aria-label="Focus GEO downlink coverage Europe Rx"]')?.click();
    });

    expect(onGeoCoverageFocus.mock.calls).toEqual([
      ['uplink'],
      ['downlink'],
    ]);
  });

  it('displays and reverses the authoritative scenario time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:15:42.000Z'));
    const clock = createSimulationClock();
    clock.setDateTime(Date.parse('2031-01-02T03:04:05.000Z'));
    clock.setSpeed(-2);
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <ActiveScenarioContext geo={null} leo={null} />
        </SimulationClockProvider>,
      );
    });
    expect(container.querySelector('time')?.textContent).toBe('2031-01-02 03:04:05 UTC');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(container.querySelector('time')?.textContent).toBe('2031-01-02 03:04:03 UTC');
  });
});
