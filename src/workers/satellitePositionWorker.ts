/**
 * satellitePositionWorker — SGP4 propagation off the main thread.
 *
 * Protocol:
 *   init     { type: 'init', satellites: [{id, satrec}] }  → (no response)
 *   propagate { type: 'propagate', timestamp: number }      → { positions: PosResult[] }
 *
 * Satrec objects are stored in a persistent Map so the main thread only transfers
 * them once (on load / hourly refresh) instead of on every 1-second tick.
 * This eliminates ~240 KB/s of structured-clone traffic and the GC pauses it causes.
 */

import * as satellite from 'satellite.js';

// ─── Message contract ─────────────────────────────────────────────────────────

interface SatInput {
  id: string;
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

type WorkerInMessage =
  | { type: 'init'; satellites: SatInput[] }
  | { type: 'propagate'; timestamp: number };

export interface WorkerOutput {
  positions: PosResult[];
}

// ─── Satrec cache — persists across ticks ────────────────────────────────────

const satrecCache = new Map<string, satellite.SatRec>();

// ─── Propagation ──────────────────────────────────────────────────────────────

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener('message', (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    satrecCache.clear();
    for (const { id, satrec } of msg.satellites) {
      satrecCache.set(id, satrec);
    }
    return;
  }

  // type === 'propagate'
  const { timestamp } = msg;
  const date = new Date(timestamp);

  // Compute GMST once per tick — reused for every satellite's ECI → geodetic conversion.
  const gmst = satellite.gstime(date);

  const positions: PosResult[] = [];
  for (const [id, satrec] of satrecCache) {
    try {
      const pv = satellite.propagate(satrec, date);
      if (pv?.position && typeof pv.position !== 'boolean') {
        const geo = satellite.eciToGeodetic(pv.position, gmst);
        positions.push({
          id,
          lat: satellite.degreesLat(geo.latitude),
          lng: satellite.degreesLong(geo.longitude),
          alt: geo.height,
          sampleTimeMs: timestamp,
          isValid: true,
        });
        continue;
      }
    } catch {
      // Propagation errors (decayed orbit, bad TLE) fall through to the invalid sentinel.
    }
    // Do NOT use (0, 0, 0) as a real position — that is the Gulf of Guinea.
    positions.push({ id, lat: 0, lng: 0, alt: 0, sampleTimeMs: timestamp, isValid: false });
  }

  ctx.postMessage({ positions } satisfies WorkerOutput);
});
