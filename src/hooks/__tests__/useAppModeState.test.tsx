// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppModeState } from '../useAppModeState';

// This suite moved here from useUiModeState.test.tsx along with the state it
// covers: the top-level mode was lifted out of App.tsx so REVISIT could be a
// peer view that unmounts App entirely (ADR-001 §4). The first-click guarantee
// below is the original regression guard, unchanged in intent — deferring the
// commit made the pressed state lag behind the user's click.

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.replaceState({}, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function ModeSwitchHarness() {
  const { appMode, handleAppModeChange } = useAppModeState();
  return (
    <>
      <output data-testid="mode">{appMode}</output>
      <button type="button" onClick={() => handleAppModeChange('commercial')}>Commercial</button>
      <button type="button" onClick={() => handleAppModeChange('engineering')}>Engineering</button>
      <button type="button" onClick={() => handleAppModeChange('revisit')}>Revisit</button>
    </>
  );
}

const clickButton = async (label: string) => {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent === label);
  await act(async () => button?.click());
};

describe('useAppModeState', () => {
  it('commits each primary mode change on the first click', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));
    const mode = container.querySelector('[data-testid="mode"]');

    await clickButton('Commercial');
    expect(mode?.textContent).toBe('commercial');

    await clickButton('Engineering');
    expect(mode?.textContent).toBe('engineering');
  });

  it('treats revisit as a peer of the other two', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));
    const mode = container.querySelector('[data-testid="mode"]');

    await clickButton('Revisit');
    expect(mode?.textContent).toBe('revisit');

    // And back again — REVISIT must not be a one-way door.
    await clickButton('Engineering');
    expect(mode?.textContent).toBe('engineering');
  });

  it('defaults to engineering', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('engineering');
  });

  it('reads all three modes from the URL and writes mode changes to history', async () => {
    window.history.replaceState({}, '', '/?mode=commercial');
    const initialLength = window.history.length;
    await act(async () => root?.render(<ModeSwitchHarness />));
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('commercial');

    await clickButton('Revisit');
    expect(window.location.search).toBe('?mode=revisit');
    expect(window.history.length).toBe(initialLength + 1);
  });

  it('follows browser history changes', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));
    window.history.pushState({}, '', '/?mode=commercial');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('commercial');
  });
});
