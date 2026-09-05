// @vitest-environment jsdom

/*
 * M-5 — the globe↔sidebar hover link, both directions.
 *
 * The globe has published `hoveredSatelliteId` all along and fed it back to
 * itself; the sidebar was never told. These assert the two halves that were
 * missing, and the one guarantee that keeps the change safe: a node with no
 * `globeId` behaves exactly as before.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RouteDiagram, { type RouteDiagramNode } from '../RouteDiagram';
import { HoveredEntityProvider } from '../../../../contexts/HoveredEntityContext';

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

const nodes: RouteDiagramNode[] = [
  { id: 'site-a', label: 'Toulouse', kind: 'site' },
  { id: 'satellite', label: 'ONEWEB-0123', kind: 'satellite', globeId: 'sat-123' },
  { id: 'snp', label: 'Fucino', kind: 'snp' },
];

const render = async (hovered: string | null, onHover = vi.fn()) => {
  await act(async () => root?.render(
    <HoveredEntityProvider satelliteId={hovered} setHoveredSatelliteId={onHover}>
      <RouteDiagram
        technology="LEO"
        ariaLabel="LEO resolved route"
        nodes={nodes}
        connectors={[{}, {}]}
      />
    </HoveredEntityProvider>,
  ));
  return onHover;
};

const rows = () => Array.from(container.querySelectorAll('[data-route-diagram-node]'));

describe('RouteDiagram hover link (M-5)', () => {
  it('highlights the row the globe is hovering, and only that row', async () => {
    await render('sat-123');
    const highlighted = rows().filter((r) => r.hasAttribute('data-route-diagram-hovered'));
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].textContent).toContain('ONEWEB-0123');
  });

  it('highlights nothing when the globe hovers a satellite that is not on this route', async () => {
    await render('sat-999');
    expect(rows().filter((r) => r.hasAttribute('data-route-diagram-hovered'))).toHaveLength(0);
  });

  it('tells the globe when the pointer enters and leaves the row', async () => {
    const onHover = await render(null);
    const satelliteRow = rows()[1];

    await act(async () => satelliteRow.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    expect(onHover).toHaveBeenCalledWith('sat-123');

    onHover.mockClear();
    await act(async () => satelliteRow.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
    expect(onHover).toHaveBeenCalledWith(null);
  });

  it('does the same from the KEYBOARD, so the link is not pointer-only', async () => {
    const onHover = await render(null);
    const satelliteRow = rows()[1];

    await act(async () => satelliteRow.dispatchEvent(new FocusEvent('focusin', { bubbles: true })));
    expect(onHover).toHaveBeenCalledWith('sat-123');
  });

  /*
   * The safety property. Sites and SNPs carry no `globeId` yet, and a row
   * without one must not start emitting hover — that would clear the globe's
   * highlight every time the pointer crossed the diagram.
   */
  it('leaves rows without a globeId completely inert', async () => {
    const onHover = await render(null);
    for (const index of [0, 2]) {
      await act(async () => rows()[index].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    }
    expect(onHover).not.toHaveBeenCalled();
  });
});
