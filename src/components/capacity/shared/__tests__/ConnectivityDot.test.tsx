// @vitest-environment jsdom

/*
 * S-7 — the three states must be distinguishable WITHOUT colour. These assert
 * the two non-colour channels: a shape that survives greyscale, and an
 * accessible name that a screen reader can announce.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectivityDot, type ConnectivityDotState } from '../ConnectivityDot';

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

const render = async (state: ConnectivityDotState) => {
  await act(async () => root?.render(<ConnectivityDot state={state} technology="LEO" />));
  return container.querySelector('span')!;
};

describe('ConnectivityDot', () => {
  it('names every state, so it is announced rather than skipped', async () => {
    expect((await render('ready')).getAttribute('aria-label')).toBe('LEO: connected');
    expect((await render('partial')).getAttribute('aria-label')).toBe('LEO: partial — no gateway path');
    expect((await render('none')).getAttribute('aria-label')).toBe('LEO: no connectivity');
  });

  it('distinguishes the states by SHAPE, not only by hue', async () => {
    const ready = (await render('ready')).className;
    const partial = (await render('partial')).className;
    const none = (await render('none')).className;

    // Filled vs hollow is the greyscale-visible difference.
    expect(ready).toContain('bg-green-400');
    expect(partial).toContain('bg-transparent');
    expect(none).toContain('bg-transparent');
    // Partial is a thicker ring than "none", so the two hollow states differ too.
    expect(partial).toContain('border-2');
    expect(none).not.toContain('border-2');
  });

  it('keeps the same footprint in every state so the tab strip does not shift', async () => {
    for (const state of ['ready', 'partial', 'none'] as const) {
      expect((await render(state)).className).toContain('h-2 w-2');
    }
  });
});
