import { useCallback, useState } from 'react';
import type { GeoGatewayData, SNPData } from '../components/globe/GlobeConfig';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';

/**
 * The inspected-entity cluster (S-2 final slice: MOVED out of `App.tsx`).
 *
 * These seven pieces of state are kept mutually exclusive by hand: every
 * selection handler clears the others before setting its own. The clearing sets
 * DO NOT all agree, and this hook does not make them agree — `applyInspection`
 * writes exactly the fields a call site names, so each handler still declares
 * its own set, in one call instead of five scattered setters.
 *
 * ── The divergences, as measured on 2026-09-04 ────────────────────────────────
 *
 * Full clear = { snp, gateway, moon, aircraft, aircraftB, vessel, iss }.
 *
 *   handleSatelliteClick        full clear
 *   handlePointClick            full clear
 *   handleResetView             full clear
 *   handleSwapRouteEndpoints    full clear, aircraft/aircraftB swapped
 *   handleMoonSelectionChange   clears iss, KEEPS aircraftB
 *   handleSnpClick              KEEPS iss and aircraftB
 *   handleGatewaySelect         KEEPS iss and aircraftB
 *   handleAircraftSelect        KEEPS iss and aircraftB
 *   handleVesselSelect          KEEPS iss and aircraftB
 *   handleLocationSelect        KEEPS iss and aircraftB
 *   handleIssClick              sets iss, KEEPS aircraftB
 *
 * Two different things are going on, and only one of them is a defect:
 *
 * 1. `aircraftB` is NOT an inspection target — it is the Site B endpoint that
 *    happens to be an aircraft. It is meant to survive an inspection change and
 *    is cleared only by endpoint operations (clear Site A/B, point click, reset,
 *    swap). It lives here because it is set and cleared alongside the others.
 *
 * 2. `iss` surviving an SNP, gateway, aircraft, vessel or location selection is
 *    the real inconsistency: the ISS stays flagged as selected while another
 *    entity is being inspected. Normalising it is a BEHAVIOUR CHANGE — the ISS
 *    panel would close in five situations where it currently stays open — so it
 *    is left exactly as it is, and recorded here and in docs/AUDIT_BACKLOG.md
 *    for a deliberate decision rather than fixed in passing by a refactor.
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

/** Every inspected entity cleared — the set the four "full clear" handlers use. */
export const CLEAR_ALL_INSPECTION: InspectionPatch = {
  snp: null,
  gateway: null,
  moon: false,
  aircraft: null,
  aircraftB: null,
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
  };
}
