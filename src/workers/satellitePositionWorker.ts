/**
 * satellitePositionWorker — SGP4 propagation off the main thread.
 *
 * Receives a batch of { id, satrec } pairs + a UTC timestamp, propagates every
 * satellite with satellite.js, and posts back an array of { id, lat, lng, alt }.
 *
 * Running this in a Worker means the main thread is never blocked by ~600 SGP4
 * calls per 2-second tick (~60 ms of CPU time freed per cycle).
 *
 * Vite handles module Workers natively — no config change required.
 * Usage in the host:
 *   new Worker(new URL('./workers/satellitePositionWorker.ts', import.meta.url), { type: 'module' })
 */

import * as satellite from 'satellite.js';

// ─── Message contract ─────────────────────────────────────────────────────────

interface SatInput {
  id: string;
  // satrec is a plain-object record produced by satellite.twoline2satrec().
  // All fields are numbers/strings — safe for structured-clone serialisation.
  satrec: satellite.SatRec;
}

interface PosResult {
  id: string;
  lat: number;
  lng: number;
  alt: number;
  sampleTimeMs: number;
  /**
   * False when SGP4 propagation failed (bad TLE, decayed orbit, numerical divergence).
   * Consumers must exclude satellites with isValid === false from all rendering and
   * coverage/connectivity logic — never treat (0, 0, 0) as a real position.
   */
  isValid: boolean;
}

export interface WorkerInput {
  satellites: SatInput[];
  /** Date.now() value — avoids Date object serialisation */
  timestamp: number;
}

export interface WorkerOutput {
  positions: PosResult[];
}

// ─── Propagation ──────────────────────────────────────────────────────────────

// Use DedicatedWorkerGlobalScope via type assertion to avoid conflicts with the
// DOM lib's Window type (both are available in the compilation unit).
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<WorkerInput>) => {
  const { satellites: inputs, timestamp } = event.data;
  const date = new Date(timestamp);

  // Compute GMST once per tick — reused for every satellite's ECI → geodetic
  // conversion. This was previously computed once per satellite call site.
  const gmst = satellite.gstime(date);

  const positions: PosResult[] = inputs.map(({ id, satrec }) => {
    try {
      const pv = satellite.propagate(satrec, date);
      if (pv?.position && typeof pv.position !== 'boolean') {
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        return {
          id,
          lat: satellite.degreesLat(geo.latitude),
          lng: satellite.degreesLong(geo.longitude),
          alt: geo.height,
          sampleTimeMs: timestamp,
          isValid: true,
        };
      }
    } catch {
      // Propagation errors (decayed orbit, bad TLE) fall through to the invalid sentinel.
    }
    // Do NOT use (0, 0, 0) as a real position — that is the Gulf of Guinea.
    // Mark as invalid so consumers skip this satellite entirely.
    return { id, lat: 0, lng: 0, alt: 0, sampleTimeMs: timestamp, isValid: false };
  });

  ctx.postMessage({ positions } satisfies WorkerOutput);
});
