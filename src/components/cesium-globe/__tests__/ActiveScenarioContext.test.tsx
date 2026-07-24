// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ActiveScenarioContext from '../ActiveScenarioContext';

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
        />,
      );
    });

    expect(container.querySelector('time')?.textContent).toBe('2026-07-24 08:15:42 UTC');
    expect(container.querySelector('[aria-label="GEO active scenario"]')?.textContent)
      .toContain('GEOEUTELSAT 10BUL Europe TxDL Europe Rx');
    expect(container.querySelector('[aria-label="LEO active scenario"]')?.textContent)
      .toContain('LEOONEWEB-0364 · ONEWEB-0212');
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="combobox"]')).toBeNull();
  });

  it('keeps the timer visible without an active scenario', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T08:15:42.000Z'));
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<ActiveScenarioContext geo={null} leo={null} />);
    });

    expect(container.querySelector('time')?.textContent).toBe('2026-07-24 08:15:42 UTC');
    expect(container.querySelectorAll('section')).toHaveLength(0);
  });
});
