/**
 * Stable positions property for route segments.
 *
 * WHY
 * ---
 * A route segment's positions callback is rebuilt — and briefly becomes `null`
 * — whenever its inputs change: `autoSelectedLEOSatellite` is unresolved for a
 * moment on every serving-satellite handover, and `selectedSNP` follows it.
 * When the segment's JSX presence is gated on that callback, the segment's
 * Cesium entities unmount and remount under the SAME ids.
 *
 * That is what produced the repeated
 * `An entity with id "…-leo-uplink-main" already exists in this collection`
 * errors. Resium destroys an entity asynchronously — `unmount()` awaits a
 * microtask and the pending mount promise before calling `entities.remove()`
 * (node_modules/resium/src/core/hooks.ts) — and the guard that serialises
 * unmount before mount (`unmountReadyRef`) lives on the React component
 * instance. A remount is a NEW instance with fresh refs, so its
 * `entities.add()` is free to run before the previous instance's `remove()`,
 * and `EntityCollection.add` throws.
 *
 * The fix is to remove the reason to unmount: wrap the changing callback in a
 * property whose identity never changes, keep the entities mounted, and toggle
 * Cesium's native `show`. Ids stay exactly as they were — deterministic and one
 * per semantic entity.
 */
import { useMemo, useRef } from 'react';
import { CallbackProperty, type Cartesian3, type JulianDate } from 'cesium';

/** Returns the segment's current positions callback, or null when it has none. */
export type RoutePositionsSource = () => CallbackProperty | null | undefined;

/**
 * Builds a `CallbackProperty` that forwards to whatever `getSource()` returns
 * at evaluation time, and yields an empty path when there is nothing to draw.
 *
 * Deliberately non-constant (`false`): the underlying paths track moving
 * satellites, so the property must still be re-evaluated per frame exactly as
 * the callbacks it wraps were.
 */
export function createStableRoutePositions(getSource: RoutePositionsSource): CallbackProperty {
  return new CallbackProperty((time?: JulianDate, result?: Cartesian3[]) => {
    const source = getSource();
    if (!source || !time) return [];
    const value = source.getValue(time, result);
    return Array.isArray(value) ? value : [];
  }, false);
}

/** React binding: one stable property per component instance, always current. */
export function useStableRoutePositions(
  callback: CallbackProperty | null | undefined,
): CallbackProperty {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  return useMemo(() => createStableRoutePositions(() => callbackRef.current), []);
}
