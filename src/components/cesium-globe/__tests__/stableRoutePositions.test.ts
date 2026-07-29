/**
 * The duplicate-entity-id fix rests on one property: a route segment's
 * positions object must survive its data going away and coming back, so the
 * segment never unmounts and never re-adds an id Resium has not finished
 * removing. These tests pin that contract.
 */
import { describe, expect, it } from 'vitest';
import { CallbackProperty, Cartesian3, JulianDate } from 'cesium';
import { createStableRoutePositions } from '../stableRoutePositions';

const time = JulianDate.now();
const pathOf = (...xs: number[]) => xs.map((x) => new Cartesian3(x, 0, 0));

describe('createStableRoutePositions', () => {
  it('keeps one identity across a callback going null and coming back', () => {
    // The handover sequence that produced the duplicate-id errors:
    // satellite → unresolved → satellite.
    let source: CallbackProperty | null = new CallbackProperty(() => pathOf(1, 2), false);
    const stable = createStableRoutePositions(() => source);
    const identity = stable;

    expect(stable.getValue(time)).toHaveLength(2);

    source = null;
    expect(stable).toBe(identity);
    expect(stable.getValue(time)).toEqual([]);

    source = new CallbackProperty(() => pathOf(3, 4), false);
    expect(stable).toBe(identity);
    expect((stable.getValue(time) as Cartesian3[])[0].x).toBe(3);
  });

  it('draws nothing rather than throwing while the route is unavailable', () => {
    const stable = createStableRoutePositions(() => null);
    expect(stable.getValue(time)).toEqual([]);
  });

  it('yields an empty path for a source that returns a non-array', () => {
    const stable = createStableRoutePositions(
      () => new CallbackProperty(() => undefined, false),
    );
    expect(stable.getValue(time)).toEqual([]);
  });

  it('stays non-constant, because the wrapped paths still track moving satellites', () => {
    const stable = createStableRoutePositions(() => new CallbackProperty(() => pathOf(1, 2), false));
    expect(stable.isConstant).toBe(false);
  });

  it('reads the source on every evaluation rather than caching it', () => {
    let calls = 0;
    const source = new CallbackProperty(() => { calls++; return pathOf(1, 2); }, false);
    const stable = createStableRoutePositions(() => source);

    stable.getValue(time);
    stable.getValue(time);
    expect(calls).toBe(2);
  });
});
