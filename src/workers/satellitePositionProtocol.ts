import type { SatRec } from 'satellite.js';

/** Satellite data transferred only when the worker cache is initialized. */
export interface SatellitePositionWorkerSatellite {
  id: string;
  satrec: SatRec;
}

export interface SatellitePositionWorkerPosition {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  sampleTimeMs: number;
  /** False for bad TLEs, decayed orbits and numerical propagation failures. */
  isValid: boolean;
}

export type SatellitePositionWorkerInput =
  | { type: 'init'; satellites: SatellitePositionWorkerSatellite[] }
  | {
      type: 'propagate';
      requestId: number;
      /** Identifies the clock controls against which this work was started. */
      timelineRevision: number;
      /** UTC scenario instant to propagate to. */
      timestamp: number;
      /** Future/past sample used only to bracket smooth Cesium rendering. */
      renderTimestamp: number;
    };

export interface SatellitePositionWorkerOutput {
  /** Echoed so the loader can reject a superseded request. */
  requestId: number;
  /** Echoed so work from an obsolete clock timeline can never be published. */
  timelineRevision: number;
  /** UTC scenario instant used by SGP4. */
  timestamp: number;
  /** UTC scenario instant of the visual bracketing samples. */
  renderTimestamp: number;
  /** Exact-time positions: the only positions consumers may use for analysis. */
  positions: SatellitePositionWorkerPosition[];
  /** Lookahead positions reserved for Cesium interpolation. */
  renderPositions: SatellitePositionWorkerPosition[];
}
