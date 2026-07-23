// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommercialScenarioViewModel } from '../commercialViewModel';
import CustomerDecisionInspector from '../CustomerDecisionInspector';
import CustomerDecisionLauncher from '../CustomerDecisionLauncher';

const viewModel = {
  commercialIntent: {
    objective: undefined,
    trafficDirection: 'BIDIRECTIONAL',
    primaryTechnology: undefined,
  },
  recommendation: {
    technology: 'geo',
    label: 'GEO',
    chipLabel: 'Recommended: GEO',
    reason: 'Legacy recommendation',
    message: 'Legacy recommendation',
    expectedExperience: 'Planning comparison',
  },
  comparison: { options: [] },
} as unknown as CommercialScenarioViewModel;

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

describe('Customer Decision inspector interaction', () => {
  it('changes section on the first tab click', async () => {
    await act(async () => {
      root?.render(
        <CustomerDecisionInspector
          viewModel={viewModel}
          mode="engineering"
          onClose={() => undefined}
        />,
      );
    });

    const recommendationTab = container.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-controls="customer-decision-panel-recommendation"]',
    );
    expect(recommendationTab).not.toBeNull();
    await act(async () => recommendationTab?.click());

    expect(recommendationTab?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[role="tabpanel"]')?.textContent).toContain('No customer priority selected');
  });

  it('closes on Escape without owning any scenario-reset action', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root?.render(
        <CustomerDecisionInspector
          viewModel={viewModel}
          mode="commercial"
          onClose={onClose}
        />,
      );
    });

    const inspector = container.querySelector('aside');
    inspector?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens from the launcher on the first click', async () => {
    const Shell = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <CustomerDecisionLauncher
            viewModel={viewModel}
            open={open}
            onToggle={() => setOpen((current) => !current)}
          />
          {open && <div data-testid="decision-open">Open</div>}
        </>
      );
    };
    await act(async () => root?.render(<Shell />));

    const launcher = container.querySelector<HTMLButtonElement>('button[aria-controls="customer-decision-inspector"]');
    await act(async () => launcher?.click());

    expect(container.querySelector('[data-testid="decision-open"]')).not.toBeNull();
    expect(launcher?.getAttribute('aria-expanded')).toBe('true');
  });
});
