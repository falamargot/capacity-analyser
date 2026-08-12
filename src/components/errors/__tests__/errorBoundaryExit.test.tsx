// @vitest-environment jsdom

/**
 * The exit path of both crash boundaries must purge the snapshot that caused
 * the crash.
 *
 * Reset was never the problem — it always cleared. The escape hatch was: a
 * faulty restored session crashes ENG/COMM, the user takes "Switch to REVISIT"
 * instead of "Reset session", comes back, and the same snapshot is rehydrated
 * into the same crash with no way out but Reset. The REVISIT boundary already
 * purged on exit; the telecom one did not, which also contradicted the U15
 * claim of clearing "on any exit path".
 *
 * These tests assert the purge through storage rather than through a mocked
 * clear function, so they fail if the wiring is removed even when the helper
 * is still imported.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TelecomErrorBoundary } from '../TelecomErrorBoundary';
import { RevisitErrorBoundary } from '../../../features/revisit/ui/RevisitErrorBoundary';

const TELECOM_KEY = 'capacity-analyzer:telecom-session:v1';
const REVISIT_KEY = 'capacity-analyzer:revisit-session:v1';

const Boom: React.FC = () => {
  throw new Error('restored session is invalid');
};

let root: Root | null = null;
let container: HTMLDivElement;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // React reports the caught error on the console; that is expected here.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container.remove();
  consoleError.mockRestore();
  sessionStorage.clear();
});

/** The boundary's secondary button — "Switch to REVISIT" / "Back to telecom analysis". */
function exitButton(): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  expect(buttons.length).toBe(2);
  return buttons[1] as HTMLButtonElement;
}

describe('TelecomErrorBoundary — exit path', () => {
  it('purges the telecom snapshot when the user escapes to REVISIT', async () => {
    sessionStorage.setItem(TELECOM_KEY, '{"schemaVersion":1}');
    const onSwitchToRevisit = vi.fn();

    await act(async () => {
      root?.render(
        <TelecomErrorBoundary onSwitchToRevisit={onSwitchToRevisit}>
          <Boom />
        </TelecomErrorBoundary>
      );
    });

    expect(container.textContent).toContain('Something went wrong');
    // Still present while the fallback is showing — the purge is the button's job.
    expect(sessionStorage.getItem(TELECOM_KEY)).not.toBeNull();

    await act(async () => exitButton().click());

    expect(sessionStorage.getItem(TELECOM_KEY)).toBeNull();
    expect(onSwitchToRevisit).toHaveBeenCalledTimes(1);
  });

  it('leaves the REVISIT snapshot alone — only the crashing session is discarded', async () => {
    sessionStorage.setItem(TELECOM_KEY, '{"schemaVersion":1}');
    sessionStorage.setItem(REVISIT_KEY, '{"schemaVersion":1}');

    await act(async () => {
      root?.render(
        <TelecomErrorBoundary onSwitchToRevisit={() => {}}>
          <Boom />
        </TelecomErrorBoundary>
      );
    });
    await act(async () => exitButton().click());

    expect(sessionStorage.getItem(TELECOM_KEY)).toBeNull();
    expect(sessionStorage.getItem(REVISIT_KEY)).not.toBeNull();
  });

  it('offers no exit button when no destination was supplied', async () => {
    await act(async () => {
      root?.render(
        <TelecomErrorBoundary>
          <Boom />
        </TelecomErrorBoundary>
      );
    });

    expect(container.querySelectorAll('button').length).toBe(1);
  });
});

describe('RevisitErrorBoundary — exit path', () => {
  it('purges the revisit snapshot when the user returns to telecom', async () => {
    sessionStorage.setItem(REVISIT_KEY, '{"schemaVersion":1}');
    const onExit = vi.fn();

    await act(async () => {
      root?.render(
        <RevisitErrorBoundary onExit={onExit}>
          <Boom />
        </RevisitErrorBoundary>
      );
    });
    await act(async () => exitButton().click());

    expect(sessionStorage.getItem(REVISIT_KEY)).toBeNull();
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
