// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useKeyboardShortcuts from '../useKeyboardShortcuts';

type HarnessProps = {
  overlayOpen?: boolean;
  onDismissOverlay: () => void;
  onResetView: () => void;
  onScopeChange: (scope: 'ALL' | 'GEO' | 'LEO') => void;
};

function Harness({
  overlayOpen = false,
  onDismissOverlay,
  onResetView,
  onScopeChange,
}: HarnessProps) {
  useKeyboardShortcuts({
    onScopeChange,
    onToggleFullscreen: () => undefined,
    onToggleHelpPanel: () => undefined,
    onToggleEntryPointPanel: () => undefined,
    onResetView,
    onDismissOverlay,
    overlayOpen,
  });
  return null;
}

let root: Root | null = null;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.body.appendChild(document.createElement('div')));
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('useKeyboardShortcuts overlay arbitration', () => {
  it('lets Escape close Decision Support without resetting the scenario', async () => {
    const onDismissOverlay = vi.fn();
    const onResetView = vi.fn();
    const onScopeChange = vi.fn();
    await act(async () => {
      root?.render(
        <Harness
          overlayOpen
          onDismissOverlay={onDismissOverlay}
          onResetView={onResetView}
          onScopeChange={onScopeChange}
        />,
      );
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onDismissOverlay).toHaveBeenCalledOnce();
    expect(onResetView).not.toHaveBeenCalled();
  });

  it('suspends scope-changing shortcuts while Decision Support owns the keyboard', async () => {
    const onScopeChange = vi.fn();
    await act(async () => {
      root?.render(
        <Harness
          overlayOpen
          onDismissOverlay={() => undefined}
          onResetView={() => undefined}
          onScopeChange={onScopeChange}
        />,
      );
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));

    expect(onScopeChange).not.toHaveBeenCalled();
  });

  it('retains the established Escape reset when no overlay is open', async () => {
    const onResetView = vi.fn();
    await act(async () => {
      root?.render(
        <Harness
          onDismissOverlay={() => undefined}
          onResetView={onResetView}
          onScopeChange={() => undefined}
        />,
      );
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onResetView).toHaveBeenCalledOnce();
  });
});
