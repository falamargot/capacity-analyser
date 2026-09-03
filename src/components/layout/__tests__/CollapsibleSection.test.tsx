// @vitest-environment jsdom

/*
 * ── Persisted collapse state belongs to a scenario (audit INT-9) ────────────
 *
 * The state was stored under `collapsible:<storageKey>` alone, so one
 * preference governed every scenario that rendered the same section. Live case:
 * the LEO latency breakdown lists different legs in single-site and
 * site-to-site, and collapsing it in one collapsed it in the other; two GEO
 * call sites also shared a single key across MESH and STAR.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import CollapsibleSection from '../CollapsibleSection';

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  root = null;
  localStorage.clear();
});

function render(scope: string | undefined): void {
  act(() => {
    root?.render(
      <CollapsibleSection storageKey="latency" scope={scope} title="Latency" defaultOpen>
        <p>body</p>
      </CollapsibleSection>,
    );
  });
}

/** The header button is the only toggle. */
function collapse(): void {
  const header = container.querySelector('button');
  act(() => header?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

const isOpen = (): boolean => container.textContent?.includes('body') ?? false;

describe('CollapsibleSection persistence', () => {
  it('keeps a collapse within its own scope', () => {
    render('leo-single');
    expect(isOpen()).toBe(true);
    collapse();
    expect(isOpen()).toBe(false);
    expect(localStorage.getItem('collapsible:leo-single:latency')).toBe('0');

    // The same section in another scenario is a different section.
    render('leo-s2s');
    expect(isOpen()).toBe(true);

    // ...and returning to the first one restores what the user chose there.
    render('leo-single');
    expect(isOpen()).toBe(false);
  });

  it('still persists globally when no scope is given', () => {
    render(undefined);
    collapse();
    expect(localStorage.getItem('collapsible:latency')).toBe('0');
    render(undefined);
    expect(isOpen()).toBe(false);
  });
});
