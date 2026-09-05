import { createContext, useContext, useMemo, type ReactNode } from 'react';

/**
 * M-5 — the globe↔sidebar hover link.
 *
 * The globe has published a hovered satellite since long before this
 * (`hoveredSatelliteId` in `App.tsx`), and fed it straight back to itself: the
 * point scales, its coverage previews. **The sidebar was never told.** Hovering
 * a satellite on the globe left the row naming that same satellite inert, and
 * hovering the row did nothing to the globe.
 *
 * A CONTEXT, not props, and deliberately so. `CapacityDetails` already takes
 * ~70 props and the UX audit calls that out by name (S-3); threading a hover id
 * and a setter through it, then through both connectivity sections, to reach
 * one row would make the thing the audit complains about measurably worse. The
 * audit's own words for what was missing are "no `useHoveredEntity`".
 *
 * Scope is one entity kind — the satellite — because that is the one the globe
 * already publishes. SNPs, gateways and beams have the same shape and can join
 * by widening `HoveredEntity`, not by changing any call site.
 */

export interface HoveredEntity {
  /** Satellite id as the globe knows it, or null when nothing is hovered. */
  satelliteId: string | null;
}

export interface HoveredEntityValue extends HoveredEntity {
  setHoveredSatelliteId: (id: string | null) => void;
}

const EMPTY: HoveredEntityValue = {
  satelliteId: null,
  setHoveredSatelliteId: () => {},
};

const HoveredEntityContext = createContext<HoveredEntityValue>(EMPTY);

export const HoveredEntityProvider = ({
  satelliteId,
  setHoveredSatelliteId,
  children,
}: {
  satelliteId: string | null;
  setHoveredSatelliteId: (id: string | null) => void;
  children: ReactNode;
}) => {
  // Memoised on the two things it carries: without this every App render would
  // re-render every consumer, and App renders on the simulation tick.
  const value = useMemo<HoveredEntityValue>(
    () => ({ satelliteId, setHoveredSatelliteId }),
    [satelliteId, setHoveredSatelliteId],
  );
  return (
    <HoveredEntityContext.Provider value={value}>
      {children}
    </HoveredEntityContext.Provider>
  );
};

/**
 * Consumers outside the provider get an inert value rather than an error: this
 * is a presentation affordance, and a component that renders in a test harness
 * without the provider should still render.
 */
// Same scoped exemption as `EngineeringAnalysisContext`: a provider and its
// hook belong in one file, and Fast Refresh's rule cannot see that.
// eslint-disable-next-line react-refresh/only-export-components
export const useHoveredEntity = (): HoveredEntityValue => useContext(HoveredEntityContext);
