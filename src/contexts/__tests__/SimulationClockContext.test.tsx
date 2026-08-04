// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SimulationClockProvider,
  useSimulationClock,
  useSimulationClockSnapshot,
} from '../SimulationClockContext';
import { createSimulationClock } from '../../time/SimulationClock';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('SimulationClockContext', () => {
  it('provides a stable API and rerenders reactive consumers only on controls', async () => {
    let wallNow = 1_000;
    const clock = createSimulationClock({ now: () => wallNow });
    let renderCount = 0;
    let observedClock = clock;

    function Harness() {
      observedClock = useSimulationClock();
      const snapshot = useSimulationClockSnapshot();
      renderCount += 1;
      return <output>{`${snapshot.mode}:${snapshot.speed}:${snapshot.revision}`}</output>;
    }

    await act(async () => {
      root?.render(
        <SimulationClockProvider clock={clock}>
          <Harness />
        </SimulationClockProvider>,
      );
    });

    expect(observedClock).toBe(clock);
    expect(container.textContent).toBe('live:1:0');
    const rendersAfterMount = renderCount;

    wallNow += 5_000;
    expect(clock.getTimeMs()).toBe(6_000);
    expect(renderCount).toBe(rendersAfterMount);

    await act(async () => clock.setSpeed(5));
    expect(container.textContent).toBe('simulation:5:1');
    expect(renderCount).toBe(rendersAfterMount + 1);
  });
});
