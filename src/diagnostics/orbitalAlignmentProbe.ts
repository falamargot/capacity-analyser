/**
 * The seam between the live globe and the alignment diagnostic.
 *
 * OWNER-KEYED, NOT A SINGLETON
 * ----------------------------
 * `usePositionCallbacks` is instantiated three times — SatelliteLayer (every
 * rendered OneWeb billboard), CesiumGlobe (selection pulse markers only) and
 * AircraftLayer (no satellites at all) — and each instance owns a SEPARATE map
 * of interpolation cells. The first version of this registry kept one probe and
 * let the last registration win, which made "whose cells did we just measure?"
 * unanswerable: Resium mounts `<Viewer>` children in a later commit than the
 * parent, so registration order is a property of Resium's mount timing rather
 * than of anything the diagnostic controls.
 *
 * So probes are now keyed by owner, every registration is visible, and the
 * diagnostic picks its target explicitly and names it in the report.
 *
 * The probe still deals only in plain numbers: no Cesium object, no
 * `SatelliteData`, no satrec beyond the one-shot handover to the worker.
 * Registration is DEV-only at every call site, so this module holds nothing in
 * a production build.
 */

/** One satellite's displayed state, already interpolated, at `atMs`. */
export interface DisplayedSatelliteSample {
  id: string;
  lat: number;
  lng: number;
  /** Kilometres. */
  alt: number;
  /** now − the timestamp of the newest worker sample backing this position. */
  workerSampleAgeMs: number;
  /**
   * now − the last time a React render refreshed this cell.
   *
   * The discriminator between the two ways a marker can go stale: propagation
   * stopped (worker age grows, refresh age stays small) versus this instance no
   * longer rendering (both grow together).
   */
  cellRefreshAgeMs: number;
}

export interface OrbitalAlignmentProbe {
  /** Stable per-instance id (React useId). */
  ownerId: string;
  /** Human-readable owner, e.g. 'satellite-layer'. Appears in the report. */
  ownerLabel: string;
  /** OneWeb satellite records, for the diagnostic's independent SGP4 pass. */
  getSatrecs: () => { id: string; satrec: unknown }[];
  /** Every OneWeb id this owner knows about. */
  getSatelliteIds: () => string[];
  /** Ids that actually have an interpolation cell — the ones that can be measured. */
  getCellIds: () => string[];
  /**
   * Ids whose position callback was requested in this owner's most recent
   * render pass, i.e. the entities it is currently driving on screen.
   */
  getRenderedSatelliteIds: () => string[];
  /** Displayed positions for the requested ids, evaluated at `atMs`. */
  sampleDisplayed: (ids: string[], atMs: number) => DisplayedSatelliteSample[];
}

const probes = new Map<string, OrbitalAlignmentProbe>();

/**
 * Registers a probe under its owner id. Re-registering the same owner replaces
 * that owner's entry only — it can never silently displace another instance.
 */
export function registerOrbitalAlignmentProbe(probe: OrbitalAlignmentProbe): () => void {
  probes.set(probe.ownerId, probe);
  return () => {
    if (probes.get(probe.ownerId) === probe) probes.delete(probe.ownerId);
  };
}

/** Every registered probe, in registration order. */
export function listOrbitalAlignmentProbes(): OrbitalAlignmentProbe[] {
  return [...probes.values()];
}

/**
 * The probe the diagnostic should measure: the one holding cells for the most
 * satellites it is currently rendering. That is the instance whose
 * interpolation the user is actually looking at; ties break on cell count.
 */
export function selectMeasurementProbe(): OrbitalAlignmentProbe | null {
  let best: OrbitalAlignmentProbe | null = null;
  let bestRendered = -1;
  let bestCells = -1;
  for (const probe of probes.values()) {
    const rendered = probe.getRenderedSatelliteIds().length;
    const cells = probe.getCellIds().length;
    if (rendered > bestRendered || (rendered === bestRendered && cells > bestCells)) {
      best = probe;
      bestRendered = rendered;
      bestCells = cells;
    }
  }
  return best;
}

/** Cesium clock − scenario clock, in ms. Supplied by the globe; a number, never the clock. */
let clockDeltaReader: (() => number) | null = null;

export function registerCesiumClockDeltaReader(reader: () => number): () => void {
  clockDeltaReader = reader;
  return () => {
    if (clockDeltaReader === reader) clockDeltaReader = null;
  };
}

/**
 * Frame-level access to the live scene, for the post-resume render check.
 * Numbers and callbacks only — the diagnostic never holds the viewer.
 */
export interface CesiumFrameProbe {
  /** Cesium clock currentTime as epoch ms. */
  getClockTimeMs: () => number;
  /** Authoritative scenario time as epoch ms. */
  getScenarioTimeMs: () => number;
  /** Subscribes to postRender; returns an unsubscribe. */
  addPostRenderListener: (callback: () => void) => () => void;
}

let frameProbe: CesiumFrameProbe | null = null;

export function registerCesiumFrameProbe(probe: CesiumFrameProbe): () => void {
  frameProbe = probe;
  return () => {
    if (frameProbe === probe) frameProbe = null;
  };
}

export function getCesiumFrameProbe(): CesiumFrameProbe | null {
  return frameProbe;
}

export function readCesiumClockDeltaMs(): number {
  try {
    return clockDeltaReader ? clockDeltaReader() : 0;
  } catch {
    return 0;
  }
}
