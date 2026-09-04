import { useCallback, useState } from 'react';
import type { GeoGatewayData, SNPData } from '../components/globe/GlobeConfig';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';

/**
 * The inspected-entity cluster (extracted from `App.tsx` by S-2).
 *
 * These entities are mutually exclusive: every selection handler clears the
 * others before setting its own. `applyInspection` writes exactly the fields a
 * call site names, so each handler still declares its own set in one call
 * rather than five scattered setters.
 *
 * ── Resolved 2026-09-04 (S-2b): the ISS is an inspected entity ───────────────
 *
 * It used to survive an SNP, gateway, aircraft, vessel or location selection
 * while every other entity was cleared, so the ISS panel could stay open
 * "behind" whatever was being inspected. S-2 documented that rather than
 * changing it; S-2b decided it, and the ISS is now cleared wherever the Moon is
 * — the two are the same kind of thing, a live-tracked body you inspect.
 *
 * ── Still asymmetric on purpose: `aircraftB` ─────────────────────────────────
 *
 * `aircraftB` is NOT an inspected entity. It is the Site B endpoint that
 * happens to be an aircraft, so it survives an inspection change by design and
 * is cleared only by endpoint operations — clear Site A/B, a plain point click,
 * reset view, and the endpoint swap that exchanges it with `aircraft`.
 *
 * Full clear = { snp, gateway, moon, aircraft, aircraftB, vessel, iss }, used by
 * satellite click, point click, reset view and swap endpoints.
 */

export interface InspectionPatch {
  snp?: SNPData | null;
  gateway?: GeoGatewayData | null;
  moon?: boolean;
  aircraft?: Aircraft | null;
  aircraftB?: Aircraft | null;
  vessel?: Vessel | null;
  iss?: boolean;
}

/**
 * Every inspected entity cleared, `aircraftB` included — the set the four
 * "full clear" handlers use (satellite click, point click, reset view, swap).
 */
export const CLEAR_ALL_INSPECTION: InspectionPatch = {
  snp: null,
  gateway: null,
  moon: false,
  aircraft: null,
  aircraftB: null,
  vessel: null,
  iss: false,
};

/** The same set WITHOUT `aircraftB`, which is an endpoint rather than an inspection. */
const CLEAR_INSPECTED_ENTITIES: InspectionPatch = {
  snp: null,
  gateway: null,
  moon: false,
  aircraft: null,
  vessel: null,
  iss: false,
};

export function useInspectionState() {
  const [inspectedSNP, setInspectedSNP] = useState<SNPData | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GeoGatewayData | null>(null);
  const [selectedMoon, setSelectedMoon] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedAircraftB, setSelectedAircraftB] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [selectedIss, setSelectedIss] = useState(false);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);

  /**
   * Writes ONLY the fields present in the patch. A field left out is left
   * untouched — that is what preserves each handler's own clearing set.
   * `undefined` is not a value here: use `null` to clear a nullable field.
   */
  const applyInspection = useCallback((patch: InspectionPatch) => {
    if ('snp' in patch) setInspectedSNP(patch.snp ?? null);
    if ('gateway' in patch) setSelectedGateway(patch.gateway ?? null);
    if ('moon' in patch) setSelectedMoon(patch.moon ?? false);
    if ('aircraft' in patch) setSelectedAircraft(patch.aircraft ?? null);
    if ('aircraftB' in patch) setSelectedAircraftB(patch.aircraftB ?? null);
    if ('vessel' in patch) setSelectedVessel(patch.vessel ?? null);
    if ('iss' in patch) setSelectedIss(patch.iss ?? false);
  }, []);

  const clearInspection = useCallback(() => {
    applyInspection(CLEAR_ALL_INSPECTION);
  }, [applyInspection]);

  /**
   * Select exactly one inspected entity: everything in the patch is set,
   * everything else inspected is cleared, and `aircraftB` is left alone.
   *
   * This is where mutual exclusion lives now. Before S-2b each handler listed
   * the entities it cleared, they did not agree, and the ISS was the one that
   * kept falling off the list. A handler that says what it selects cannot
   * forget what it clears.
   */
  const inspectOnly = useCallback((patch: InspectionPatch = {}) => {
    applyInspection({ ...CLEAR_INSPECTED_ENTITIES, ...patch });
  }, [applyInspection]);

  return {
    inspectedSNP,
    selectedGateway,
    selectedMoon,
    selectedAircraft,
    selectedAircraftB,
    selectedVessel,
    selectedIss,
    hoveredSatelliteId,
    setHoveredSatelliteId,
    applyInspection,
    clearInspection,
    inspectOnly,
  };
}
