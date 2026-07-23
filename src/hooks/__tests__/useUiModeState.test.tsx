// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiModeState } from '../useUiModeState';

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

function ModeSwitchHarness() {
  const { uiMode, handleUiModeChange } = useUiModeState();
  return (
    <>
      <output data-testid="mode">{uiMode}</output>
      <button type="button" onClick={() => handleUiModeChange('commercial')}>Commercial</button>
      <button type="button" onClick={() => handleUiModeChange('engineering')}>Engineering</button>
    </>
  );
}

describe('useUiModeState', () => {
  it('commits each primary mode change on the first click', async () => {
    await act(async () => root?.render(<ModeSwitchHarness />));

    const commercial = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Commercial');
    const engineering = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Engineering');
    const mode = container.querySelector('[data-testid="mode"]');

    await act(async () => commercial?.click());
    expect(mode?.textContent).toBe('commercial');

    await act(async () => engineering?.click());
    expect(mode?.textContent).toBe('engineering');
  });
});
