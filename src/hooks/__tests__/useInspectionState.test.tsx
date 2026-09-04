// @vitest-environment jsdom

/*
 * The contract the inspection cluster rests on: `applyInspection` writes ONLY
 * the fields the patch names. Every selection handler in App.tsx relies on that
 * — an implementation that cleared everything, or that treated a missing key as
 * `undefined`, would close panels the handler meant to leave alone.
 *
 * `aircraftB` is the one entity that deliberately survives an inspection
 * change: it is the Site B endpoint, not something being inspected. That is
 * asserted here rather than only described, so normalising it later has to be a
 * decision rather than an accident. (`iss` used to be a second such case; S-2b
 * decided it on 2026-09-04 and it is now cleared like every other entity —
 * covered by `targetRoleSwap`-style handler tests, not here.)
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useInspectionState, CLEAR_ALL_INSPECTION, type InspectionPatch } from '../useInspectionState';
import type { Aircraft } from '../../modules/airTraffic/airTrafficService';
import type { SNPData } from '../../components/globe/GlobeConfig';

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

const aircraft = { icao24: 'abc123' } as Aircraft;
const aircraftB = { icao24: 'def456' } as Aircraft;
const snp = { name: 'Woodbine' } as SNPData;

let apply: (patch: InspectionPatch) => void;
let clear: () => void;
let only: (patch?: InspectionPatch) => void;

function Harness() {
  const state = useInspectionState();
  apply = state.applyInspection;
  clear = state.clearInspection;
  only = state.inspectOnly;
  return (
    <output data-testid="state">{JSON.stringify({
      snp: state.inspectedSNP?.name ?? null,
      gateway: state.selectedGateway?.name ?? null,
      moon: state.selectedMoon,
      aircraft: state.selectedAircraft?.icao24 ?? null,
      aircraftB: state.selectedAircraftB?.icao24 ?? null,
      vessel: state.selectedVessel?.mmsi ?? null,
      iss: state.selectedIss,
    })}</output>
  );
}

const read = () => JSON.parse(container.querySelector('[data-testid="state"]')!.textContent!);
const render = async () => { await act(async () => root?.render(<Harness />)); };
const run = async (fn: () => void) => { await act(async () => fn()); };
const vessel = { mmsi: '111222333' } as import('../../modules/maritimeTraffic/maritimeTrafficService').Vessel;

describe('useInspectionState', () => {
  it('leaves fields the patch does not name untouched', async () => {
    await render();
    await run(() => apply({ iss: true, aircraftB }));
    // An SNP selection as App.tsx spells it: it clears `iss` but never names
    // `aircraftB`, which is the Site B endpoint and must survive.
    await run(() => apply({ snp, moon: false, gateway: null, aircraft: null, vessel: null, iss: false }));

    const state = read();
    expect(state.snp).toBe('Woodbine');
    expect(state.iss).toBe(false);
    expect(state.aircraftB).toBe('def456');
  });

  it('clears a named field even when the value is null or false', async () => {
    await render();
    await run(() => apply({ iss: true, aircraft, snp }));
    await run(() => apply({ iss: false, aircraft: null }));

    const state = read();
    expect(state.iss).toBe(false);
    expect(state.aircraft).toBeNull();
    expect(state.snp).toBe('Woodbine');
  });

  it('clearInspection empties all seven entities', async () => {
    await render();
    await run(() => apply({ iss: true, aircraft, aircraftB, snp, moon: true }));
    await run(() => clear());

    expect(read()).toEqual({
      snp: null, gateway: null, moon: false,
      aircraft: null, aircraftB: null, vessel: null, iss: false,
    });
    // The exported patch is the same set the four "full clear" handlers use.
    expect(Object.keys(CLEAR_ALL_INSPECTION).sort()).toEqual(
      ['aircraft', 'aircraftB', 'gateway', 'iss', 'moon', 'snp', 'vessel'],
    );
  });

  it('swaps the two aircraft endpoints in a single patch', async () => {
    await render();
    await run(() => apply({ aircraft, aircraftB }));
    await run(() => apply({ aircraft: aircraftB, aircraftB: aircraft }));

    const state = read();
    expect(state.aircraft).toBe('def456');
    expect(state.aircraftB).toBe('abc123');
  });

  /*
   * Mutual exclusion lives in `inspectOnly` and nowhere else. Before S-2b every
   * handler listed the entities it cleared, the lists disagreed, and `iss` was
   * the one that kept falling off — so these assert the rule itself rather than
   * one handler's spelling of it.
   */
  describe('inspectOnly', () => {
    it('clears every other inspected entity, whichever one is selected', async () => {
      await render();
      for (const [label, patch] of [
        ['snp', { snp }],
        ['gateway', { moon: true }],
        ['aircraft', { aircraft }],
        ['vessel', { vessel }],
        ['iss', { iss: true }],
      ] as const) {
        await run(() => apply({ snp, aircraft, vessel, moon: true, iss: true }));
        await run(() => only(patch));
        const state = read();
        const set = [state.snp, state.aircraft, state.vessel, state.moon, state.iss]
          .filter((value) => value !== null && value !== false);
        expect(set, `${label} left more than itself inspected`).toHaveLength(1);
      }
    });

    it('never touches aircraftB, which is the Site B endpoint', async () => {
      await render();
      await run(() => apply({ aircraftB }));
      await run(() => only({ snp }));
      expect(read().aircraftB).toBe('def456');
    });

    it('with no argument inspects nothing — the location-selection case', async () => {
      await render();
      await run(() => apply({ snp, gateway: null, iss: true, aircraftB }));
      await run(() => only());
      const state = read();
      expect(state.snp).toBeNull();
      expect(state.iss).toBe(false);
      expect(state.aircraftB).toBe('def456');
    });
  });
});
