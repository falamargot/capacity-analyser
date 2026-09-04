// @vitest-environment jsdom

/*
 * The contract that makes the S-2 inspection slice behaviour-preserving:
 * `applyInspection` writes ONLY the fields the patch names. Every selection
 * handler in App.tsx relies on that — their clearing sets differ, and an
 * implementation that cleared everything (or that treated a missing key as
 * `undefined`) would silently close panels the app currently keeps open.
 *
 * The `iss` and `aircraftB` cases below are the two documented divergences, so
 * they are asserted here rather than only described in a comment: if someone
 * later decides to normalise them, these tests are what fails and forces the
 * decision to be explicit.
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

function Harness() {
  const state = useInspectionState();
  apply = state.applyInspection;
  clear = state.clearInspection;
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

describe('useInspectionState', () => {
  it('leaves fields the patch does not name untouched', async () => {
    await render();
    await run(() => apply({ iss: true, aircraftB }));
    await run(() => apply({ snp, moon: false, gateway: null, aircraft: null, vessel: null }));

    const state = read();
    expect(state.snp).toBe('Woodbine');
    // The two documented divergences: an SNP selection keeps both of these.
    expect(state.iss).toBe(true);
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
});
