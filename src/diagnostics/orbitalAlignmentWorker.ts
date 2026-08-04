/**
 * orbitalAlignmentWorker — independent SGP4 verification, off the main thread.
 *
 * The main thread never propagates anything for this diagnostic: it sends the
 * positions the globe is ALREADY displaying, and this worker answers the only
 * question that matters — where SGP4 says those satellites were at that exact
 * UTC instant.
 *
 * It also owns the aggregation. Nothing is posted back per batch, so a soak run
 * costs the main thread one `postMessage` per second and nothing else; the
 * accumulated statistics come back once, when the controller asks for them.
 *
 * Protocol:
 *   init   { satellites: [{id, satrec}] }        → (no response)
 *   verify { atMs, clockDeltaMs, samples[] }     → (no response, accumulates)
 *   report {}                                    → { type: 'report', stats, workerCpuMs }
 */
import * as satellite from 'satellite.js';
import {
  PhasedAlignmentAccumulator,
  computeSkew,
  type AlignmentPhase,
  type AlignmentStats,
} from './orbitalAlignmentMath';

/** Lookahead used to derive the ground-track direction and speed for the skew. */
const TRACK_DELTA_MS = 1000;

interface VerifySample {
  id: string;
  /** Position the globe is displaying, as produced by the interpolation under test. */
  lat: number;
  lng: number;
  /** Kilometres, matching SatelliteData.position.alt. */
  alt: number;
  /** now − latest worker sample timestamp, ms. */
  workerSampleAgeMs: number;
  /** now − last React render that refreshed the cell backing this position, ms. */
  cellRefreshAgeMs: number;
}

export type AlignmentWorkerIn =
  | { type: 'init'; satellites: { id: string; satrec: satellite.SatRec }[] }
  | {
      type: 'verify';
      atMs: number;
      clockDeltaMs: number;
      /** Which usePositionCallbacks instance these cells came from. */
      ownerLabel: string;
      /** hidden / resume / settled-visible — never pooled in the report. */
      phase: AlignmentPhase;
      samples: VerifySample[];
    }
  | { type: 'report'; ownerLabel: string };

export interface AlignmentWorkerReport {
  type: 'report';
  stats: AlignmentStats;
  /** Total time this worker spent inside verify handlers, ms. */
  workerCpuMs: number;
  /** Samples skipped because SGP4 could not be evaluated (bad TLE, decayed orbit). */
  skipped: number;
  /** Why they were skipped, and which satellites — bounded to the first 10 ids. */
  skippedDetail: {
    reasons: Record<SkipReason, number>;
    ids: string[];
    /** Distinct satellites skipped, even if only the first 10 ids are listed. */
    distinctSatellites: number;
  };
}

/** Why a sample could not be verified. */
export type SkipReason =
  /** The measured owner rendered a satellite whose satrec never reached this worker. */
  | 'no-satrec'
  /** SGP4 refused the epoch (decayed orbit, numerically diverged TLE). */
  | 'propagation-failed';

const satrecs = new Map<string, satellite.SatRec>();
const accumulator = new PhasedAlignmentAccumulator();
let workerCpuMs = 0;
let skipped = 0;
const skipReasons: Record<SkipReason, number> = { 'no-satrec': 0, 'propagation-failed': 0 };
/** Bounded: ids are for identifying the offender, not for accounting. */
const SKIPPED_ID_LIMIT = 10;
const skippedIds = new Set<string>();

function recordSkip(id: string, reason: SkipReason): void {
  skipped++;
  skipReasons[reason]++;
  if (skippedIds.size < SKIPPED_ID_LIMIT || skippedIds.has(id)) skippedIds.add(id);
}

const ctx = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent<AlignmentWorkerIn>) => void): void;
  postMessage(message: AlignmentWorkerReport): void;
};

/** Sub-satellite point + altitude (km) from SGP4, or null when propagation fails. */
function referenceAt(satrec: satellite.SatRec, date: Date): { lat: number; lng: number; alt: number } | null {
  try {
    const pv = satellite.propagate(satrec, date);
    if (!pv?.position || typeof pv.position === 'boolean') return null;
    const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
    const lat = satellite.degreesLat(geo.latitude);
    const lng = satellite.degreesLong(geo.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(geo.height)) return null;
    return { lat, lng, alt: geo.height };
  } catch {
    return null;
  }
}

ctx.addEventListener('message', (event: MessageEvent<AlignmentWorkerIn>) => {
  const msg = event.data;

  if (msg.type === 'init') {
    satrecs.clear();
    accumulator.reset();
    workerCpuMs = 0;
    skipped = 0;
    skipReasons['no-satrec'] = 0;
    skipReasons['propagation-failed'] = 0;
    skippedIds.clear();
    for (const { id, satrec } of msg.satellites) satrecs.set(id, satrec);
    return;
  }

  if (msg.type === 'report') {
    ctx.postMessage({
      type: 'report',
      stats: accumulator.snapshot(msg.ownerLabel),
      workerCpuMs,
      skipped,
      skippedDetail: {
        reasons: { ...skipReasons },
        ids: [...skippedIds],
        distinctSatellites: skippedIds.size,
      },
    } satisfies AlignmentWorkerReport);
    // Release the satellite records as soon as the run is reported; the
    // controller terminates the worker right after, but this keeps the heap
    // clean even if it does not.
    satrecs.clear();
    return;
  }

  const startedAt = performance.now();
  const date = new Date(msg.atMs);
  const aheadDate = new Date(msg.atMs + TRACK_DELTA_MS);

  for (const sample of msg.samples) {
    const satrec = satrecs.get(sample.id);
    if (!satrec) { recordSkip(sample.id, 'no-satrec'); continue; }

    const reference = referenceAt(satrec, date);
    const referenceAhead = referenceAt(satrec, aheadDate);
    if (!reference || !referenceAhead) { recordSkip(sample.id, 'propagation-failed'); continue; }

    const { geodesicErrorM, skewMs } = computeSkew({
      displayed: { lat: sample.lat, lng: sample.lng },
      reference,
      referenceAhead,
      aheadDeltaMs: TRACK_DELTA_MS,
    });

    accumulator.add({
      satelliteId: sample.id,
      ownerLabel: msg.ownerLabel,
      phase: msg.phase,
      cellRefreshAgeMs: sample.cellRefreshAgeMs,
      atMs: msg.atMs,
      geodesicErrorM,
      altitudeErrorM: (sample.alt - reference.alt) * 1000,
      skewMs,
      workerSampleAgeMs: sample.workerSampleAgeMs,
      clockDeltaMs: msg.clockDeltaMs,
    });
  }

  workerCpuMs += performance.now() - startedAt;
});
