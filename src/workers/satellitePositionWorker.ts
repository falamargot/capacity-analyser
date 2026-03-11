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
        };
      }
    } catch {
      // Propagation errors (decayed orbit, bad TLE) → return zero position.
    }
    return { id, lat: 0, lng: 0, alt: 0 };
  });

  ctx.postMessage({ positions } satisfies WorkerOutput);
});
