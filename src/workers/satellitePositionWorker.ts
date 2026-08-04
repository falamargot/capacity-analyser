/**
 * satellitePositionWorker — SGP4 propagation off the main thread.
 *
 * Protocol:
 *   init      { type: 'init', satellites: [{id, satrec}] }        → (no response)
 *   propagate { type: 'propagate', requestId, timelineRevision,
 *               timestamp, renderTimestamp }                     → exact + render positions
 *
 * `requestId` is echoed untouched so the caller can tell a current response
 * from a superseded one. The worker itself is stateless per request: it never
 * inspects the id, it only hands it back.
 *
 * Satrec objects are stored in a persistent Map so the main thread only transfers
 * them once (on load / hourly refresh) instead of on every 1-second tick.
 * This eliminates ~240 KB/s of structured-clone traffic and the GC pauses it causes.
 */

import * as satellite from 'satellite.js';
import type {
  SatellitePositionWorkerInput,
  SatellitePositionWorkerOutput,
  SatellitePositionWorkerPosition,
} from './satellitePositionProtocol';

// ─── Message contract ─────────────────────────────────────────────────────────

// ─── Satrec cache — persists across ticks ────────────────────────────────────

const satrecCache = new Map<string, satellite.SatRec>();

// ─── Propagation ──────────────────────────────────────────────────────────────

interface SatellitePositionWorkerContext {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<SatellitePositionWorkerInput>) => void,
  ): void;
  postMessage(message: SatellitePositionWorkerOutput): void;
}

// Keep the worker contract local: tsconfig.app intentionally includes DOM but
// not the full WebWorker lib, whose globals conflict with DOM declarations.
const ctx = self as unknown as SatellitePositionWorkerContext;

ctx.addEventListener('message', (event: MessageEvent<SatellitePositionWorkerInput>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    satrecCache.clear();
    for (const { id, satrec } of msg.satellites) {
      satrecCache.set(id, satrec);
    }
    return;
  }

  // type === 'propagate'
  const { requestId, timelineRevision, timestamp, renderTimestamp } = msg;
  const propagateAt = (sampleTimeMs: number): SatellitePositionWorkerPosition[] => {
    const date = new Date(sampleTimeMs);
    const gmst = satellite.gstime(date);
    const result: SatellitePositionWorkerPosition[] = [];
    for (const [id, satrec] of satrecCache) {
      try {
        const pv = satellite.propagate(satrec, date);
        if (pv?.position && typeof pv.position !== 'boolean') {
          const geo = satellite.eciToGeodetic(pv.position, gmst);
          result.push({
            id,
            lat: satellite.degreesLat(geo.latitude),
            lng: satellite.degreesLong(geo.longitude),
            alt: geo.height,
            sampleTimeMs,
            isValid: true,
          });
          continue;
        }
      } catch {
        // Propagation errors (decayed orbit, bad TLE) fall through to the invalid sentinel.
      }
      // Do NOT use (0, 0, 0) as a real position — that is the Gulf of Guinea.
      result.push({ id, lat: 0, lng: 0, alt: 0, sampleTimeMs, isValid: false });
    }
    return result;
  };

  const positions = propagateAt(timestamp);
  const renderPositions = renderTimestamp === timestamp ? positions : propagateAt(renderTimestamp);

  ctx.postMessage({
    requestId,
    timelineRevision,
    timestamp,
    renderTimestamp,
    positions,
    renderPositions,
  } satisfies SatellitePositionWorkerOutput);
});
