// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiModeState } from '../useUiModeState';

// The mode-switch suite that used to live here moved to useAppModeState.test.tsx
// when the top-level mode was lifted to the root shell. What remains in this
// hook is scope and technology focus — ENG/COMM concepts that deliberately did
// NOT travel up (audit §5.1) and that had no coverage of their own before.

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

function ScopeHarness() {
  const {
    satelliteScope, activeConnectivityTab, handleTechnologyChange, handleTechnologyScopeChange,
  } = useUiModeState();
  return (
    <>
      <output data-testid="scope">{satelliteScope}</output>
      <output data-testid="tech">{activeConnectivityTab}</output>
      <button type="button" onClick={() => handleTechnologyChange('GEO')}>Tech GEO</button>
      <button type="button" onClick={() => handleTechnologyScopeChange('GEO')}>Scope GEO</button>
      <button type="button" onClick={() => handleTechnologyScopeChange('ALL')}>Scope ALL</button>
    </>
  );
}

const clickButton = async (label: string) => {
  const button = Array.from(container.querySelectorAll('button'))
    .find((candidate) => candidate.textContent === label);
  await act(async () => button?.click());
};

const read = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent;

describe('useUiModeState', () => {
  it('starts at ALL scope on LEO', async () => {
    await act(async () => root?.render(<ScopeHarness />));
    expect(read('scope')).toBe('ALL');
    expect(read('tech')).toBe('LEO');
  });

  // The documented invariant: scope is either ALL or equal to the active
  // technology, and both handlers maintain it synchronously so no render ever
  // observes the two disagreeing.
  it('leaves an ALL scope alone when the technology focus changes', async () => {
    await act(async () => root?.render(<ScopeHarness />));
    await clickButton('Tech GEO');
    expect(read('tech')).toBe('GEO');
    expect(read('scope')).toBe('ALL');
  });

  it('follows the technology focus when scope is already narrowed', async () => {
    await act(async () => root?.render(<ScopeHarness />));
    await clickButton('Scope GEO');
    expect(read('scope')).toBe('GEO');
    expect(read('tech')).toBe('GEO');
  });

  it('moves the technology focus when a narrow scope is chosen', async () => {
    await act(async () => root?.render(<ScopeHarness />));
    await clickButton('Scope GEO');
    expect(read('tech')).toBe('GEO');
  });

  it('keeps the technology focus when scope widens back to ALL', async () => {
    await act(async () => root?.render(<ScopeHarness />));
    await clickButton('Scope GEO');
    await clickButton('Scope ALL');
    expect(read('scope')).toBe('ALL');
    expect(read('tech')).toBe('GEO');
  });
});
