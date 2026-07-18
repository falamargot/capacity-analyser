import { describe, expect, it } from 'vitest';
import {
  createInitialScenarioState,
  directionToMeshTab,
  meshTabToDirection,
  scenarioReducer,
} from '../useScenarioState';

describe('scenario direction adapter', () => {
  it('maps the canonical direction to the legacy mesh tab and back', () => {
    expect(directionToMeshTab('A_TO_B')).toBe('forward');
    expect(directionToMeshTab('B_TO_A')).toBe('reverse');
    expect(meshTabToDirection('forward')).toBe('A_TO_B');
    expect(meshTabToDirection('reverse')).toBe('B_TO_A');
  });
});

describe('scenarioReducer', () => {
  it('sets a field from a plain value and from an updater', () => {
    const state = createInitialScenarioState();
    const next = scenarioReducer(state, { type: 'set', field: 'direction', value: 'B_TO_A' });
    expect(next.direction).toBe('B_TO_A');
    const toggled = scenarioReducer(next, {
      type: 'set',
      field: 'leoTopologyMode',
      value: (mode) => (mode === 'SITE_TO_SITE' ? 'SINGLE_SITE' : mode),
    });
    expect(toggled).toBe(next); // SINGLE_SITE unchanged → bail out with same reference
  });

  it('bails out with the same reference when a set is a no-op', () => {
    const state = createInitialScenarioState();
    expect(scenarioReducer(state, { type: 'set', field: 'weatherType', value: 'clear' })).toBe(state);
  });

  it('patches multiple fields at once and ignores undefined entries', () => {
    const state = createInitialScenarioState();
    const next = scenarioReducer(state, {
      type: 'patch',
      patch: { linkMode: 'MESH', direction: 'B_TO_A', weatherType: undefined },
    });
    expect(next.linkMode).toBe('MESH');
    expect(next.direction).toBe('B_TO_A');
    expect(next.weatherType).toBe('clear');
  });

  it('bails out when a patch changes nothing', () => {
    const state = createInitialScenarioState();
    expect(scenarioReducer(state, { type: 'patch', patch: { linkMode: 'STAR_FORWARD' } })).toBe(state);
  });

  it('honours initial overrides', () => {
    expect(createInitialScenarioState({ weatherType: 'storm' }).weatherType).toBe('storm');
  });
});
