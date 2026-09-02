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
  const { appMode, handleAppModeChange, standalone } = useAppModeState();
  return (
    <>
      <output data-testid="mode">{appMode}</output>
      <output data-testid="standalone">{String(standalone)}</output>
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

  it('accepts the short spelling of each mode beside the long one', async () => {
    // `?mode=eng` / `?mode=comm` are what a person types into a link they are
    // about to send. The long forms stay valid: four e2e specs and the docs
    // use them, and the application writes them back on every mode change.
    for (const [param, expected] of [
      ['eng', 'engineering'], ['engineering', 'engineering'],
      ['comm', 'commercial'], ['commercial', 'commercial'],
      ['revisit', 'revisit'],
      ['ENG', 'engineering'], [' comm ', 'commercial'],
      ['nonsense', 'engineering'],
    ] as const) {
      window.history.replaceState({}, '', `/?mode=${encodeURIComponent(param)}`);
      if (root) await act(async () => root?.unmount());
      root = createRoot(container);
      await act(async () => root?.render(<ModeSwitchHarness />));
      expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe(expected);
    }
  });

  describe('?standalone=1', () => {
    const renderAt = async (search: string) => {
      window.history.replaceState({}, '', search);
      await act(async () => root?.render(<ModeSwitchHarness />));
      return {
        mode: container.querySelector('[data-testid="mode"]')?.textContent,
        standalone: container.querySelector('[data-testid="standalone"]')?.textContent,
      };
    };

    it('composes with every mode', async () => {
      expect(await renderAt('/?mode=comm&standalone=1'))
        .toEqual({ mode: 'commercial', standalone: 'true' });
    });

    it('is off unless it is asked for', async () => {
      // Absent, empty and anything that is not 1/true all mean the normal
      // application. A typo must not silently lock an interface.
      for (const search of ['/?mode=revisit', '/?mode=revisit&standalone=0',
        '/?mode=revisit&standalone=', '/?mode=revisit&standalone=yes']) {
        if (root) await act(async () => root?.unmount());
        root = createRoot(container);
        expect((await renderAt(search)).standalone).toBe('false');
      }
    });

    it('cannot be turned off by navigating within the session', async () => {
      // The flag describes the link the session was opened with. A `popstate`
      // carrying a URL without it must not unlock an interface that opened
      // locked — otherwise Back is the escape hatch the lock exists to remove.
      expect((await renderAt('/?mode=revisit&standalone=1')).standalone).toBe('true');
      window.history.pushState({}, '', '/?mode=engineering');
      await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
      expect(container.querySelector('[data-testid="standalone"]')?.textContent).toBe('true');
    });
  });

  it('follows browser history changes', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));
    window.history.pushState({}, '', '/?mode=commercial');
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(container.querySelector('[data-testid="mode"]')?.textContent).toBe('commercial');
  });
});
