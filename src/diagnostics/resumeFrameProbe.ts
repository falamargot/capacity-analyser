/**
 * Post-resume rendered-frame check — DEV-ONLY.
 *
 * THE QUESTION
 * ------------
 * The hide/resume soak reported a Cesium/system clock delta of 27 s — the exact
 * length of the hide. Under `requestRenderMode` the Cesium clock only advances
 * when `clock.tick()` runs, and that happens per RENDERED frame, so while the
 * tab is hidden and nothing renders the clock necessarily falls behind wall
 * time. The open question is whether that stale clock ever reaches the screen:
 *
 *   • Marker positions are interpolated from `Date.now()`, so they are immune.
 *   • Route geometry (TransmissionLinks) calls `propagateSatellite(sat, time)`
 *     with `viewer.clock.currentTime`, so it is NOT.
 *
 * If the first frame rendered after a resume is already current, the 27 s was
 * diagnostic pre-render state — a value read between frames that no viewer ever
 * saw — and no application change is warranted. If a stale frame really is
 * rendered, the marker and the route endpoint for the same satellite will be
 * far apart in that frame, and the distance says by how much.
 *
 * So this measures the frame itself, at postRender, for the first frames after
 * a resume. One satellite, one main-thread SGP4 evaluation per captured frame —
 * never the constellation.
 *
 * Nothing here runs unless armed, and nothing here exists in a production build.
 */
import * as satellite from 'satellite.js';
import { geodesicDistanceM } from './orbitalAlignmentMath';
import {
  getCesiumFrameProbe,
  selectMeasurementProbe,
} from './orbitalAlignmentProbe';

export interface ResumeFrameRecord {
  /** Frames captured since the resume; 1 is the first rendered frame. */
  frameIndex: number;
  firstFrameAfterResume: boolean;
  /** Wall clock at the moment the frame finished rendering. */
  systemUtcMs: number;
  /** Cesium clock currentTime for that same frame. */
  cesiumClockMs: number;
  /** cesiumClockMs − systemUtcMs. Negative means the scene is behind real time. */
  clockSkewMs: number;
  /** How long the tab had been hidden. */
  hiddenForMs: number;
  satelliteId: string;
  /** What the billboard was drawing: interpolated from Date.now(). */
  marker: { lat: number; lng: number; alt: number };
  /** What a route endpoint would be: SGP4 at the Cesium clock time. */
  routeEndpoint: { lat: number; lng: number; alt: number } | null;
  /** Ground distance between the two, metres — 0 when they agree. */
  markerToRouteM: number | null;
}

/** How many frames after each resume to capture. */
const FRAMES_PER_RESUME = 3;
/** Bounded history so an armed session cannot grow without limit. */
const MAX_RECORDS = 12;

const records: ResumeFrameRecord[] = [];
let armed = false;
let detachVisibility: (() => void) | null = null;
let detachFrames: (() => void) | null = null;
let hiddenAtMs = 0;
let framesRemaining = 0;
let frameIndex = 0;

/** Sub-satellite point from SGP4 at an arbitrary instant — one satellite only. */
function subPointAt(satrec: satellite.SatRec, atMs: number) {
  try {
    const date = new Date(atMs);
    const pv = satellite.propagate(satrec, date);
    if (!pv?.position || typeof pv.position === 'boolean') return null;
    const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
    return {
      lat: satellite.degreesLat(geo.latitude),
      lng: satellite.degreesLong(geo.longitude),
      alt: geo.height,
    };
  } catch {
    return null;
  }
}

function captureFrame(): void {
  const frames = getCesiumFrameProbe();
  const probe = selectMeasurementProbe();
  if (!frames || !probe) return;

  const systemUtcMs = Date.now();
  const cesiumClockMs = frames.getClockTimeMs();

  // One sampled satellite — and it must be one we can BOTH read a marker for
  // and propagate a route endpoint for. SatelliteLayer renders more entities
  // (680) than there are OneWeb satellites (651): the extra ones are GEO, and
  // picking one of those returned a null route endpoint, which silently skipped
  // the marker/route comparison entirely in the 2026-07-29 run.
  const satrecById = new Map(probe.getSatrecs().map((s) => [s.id, s.satrec as satellite.SatRec]));
  const candidateId = probe.getRenderedSatelliteIds().find((id) => satrecById.has(id));
  if (!candidateId) return;
  const [marker] = probe.sampleDisplayed([candidateId], systemUtcMs);
  if (!marker) return;

  const satrec = satrecById.get(candidateId);
  // The route endpoint is derived from CESIUM time, exactly as
  // propagateSatellite does for TransmissionLinks.
  const routeEndpoint = satrec ? subPointAt(satrec, cesiumClockMs) : null;

  frameIndex++;
  records.push({
    frameIndex,
    firstFrameAfterResume: frameIndex === 1,
    systemUtcMs,
    cesiumClockMs,
    clockSkewMs: cesiumClockMs - systemUtcMs,
    hiddenForMs: hiddenAtMs ? systemUtcMs - hiddenAtMs : 0,
    satelliteId: candidateId,
    marker: { lat: marker.lat, lng: marker.lng, alt: marker.alt },
    routeEndpoint,
    markerToRouteM: routeEndpoint ? geodesicDistanceM(marker, routeEndpoint) : null,
  });
  while (records.length > MAX_RECORDS) records.shift();

  framesRemaining--;
  if (framesRemaining <= 0) {
    detachFrames?.();
    detachFrames = null;
  }
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    hiddenAtMs = Date.now();
    return;
  }
  // Attach at resume, not at arm time, so no postRender listener is held during
  // normal operation.
  const frames = getCesiumFrameProbe();
  if (!frames) return;
  frameIndex = 0;
  framesRemaining = FRAMES_PER_RESUME;
  detachFrames?.();
  detachFrames = frames.addPostRenderListener(captureFrame);
}

/**
 * Starts watching for the next resume. Idempotent.
 *
 * Clears previous records: a gate's verdict must describe THAT run. The soak
 * arms at start and disarms at the end, so each report covers one run's resumes
 * rather than accumulating breaches from earlier ones.
 */
export function armResumeFrameProbe(): void {
  if (!import.meta.env.DEV || typeof document === 'undefined' || armed) return;
  armed = true;
  records.length = 0;
  hiddenAtMs = 0;
  document.addEventListener('visibilitychange', onVisibilityChange);
  detachVisibility = () => document.removeEventListener('visibilitychange', onVisibilityChange);
}

/** Stops watching and releases every listener. Captured records are kept. */
export function disarmResumeFrameProbe(): void {
  detachVisibility?.();
  detachVisibility = null;
  detachFrames?.();
  detachFrames = null;
  armed = false;
}

export function getResumeFrameRecords(): ResumeFrameRecord[] {
  return [...records];
}

/** Acceptance thresholds for the post-resume frame check. */
export const RESUME_FRAME_CLOCK_SKEW_LIMIT_MS = 25;
export const RESUME_FRAME_MARKER_ROUTE_LIMIT_M = 250;

export interface ResumeFrameVerdict {
  frames: number;
  worstClockSkewMs: number;
  worstMarkerToRouteM: number;
  /** Frames where the marker/route comparison could not be performed. */
  unavailableMarkerToRoute: number;
  /** True when no captured frame breached either limit. */
  pass: boolean;
  /** The frames that breached, if any. */
  breaches: ResumeFrameRecord[];
}

export function evaluateResumeFrames(
  input: ResumeFrameRecord[] = records,
): ResumeFrameVerdict {
  let worstClockSkewMs = 0;
  let worstMarkerToRouteM = 0;
  let unavailableMarkerToRoute = 0;
  const breaches: ResumeFrameRecord[] = [];

  for (const record of input) {
    worstClockSkewMs = Math.max(worstClockSkewMs, Math.abs(record.clockSkewMs));
    if (record.markerToRouteM == null) {
      unavailableMarkerToRoute++;
    } else {
      worstMarkerToRouteM = Math.max(worstMarkerToRouteM, record.markerToRouteM);
    }
    if (
      Math.abs(record.clockSkewMs) > RESUME_FRAME_CLOCK_SKEW_LIMIT_MS ||
      record.markerToRouteM == null ||
      record.markerToRouteM > RESUME_FRAME_MARKER_ROUTE_LIMIT_M
    ) {
      breaches.push(record);
    }
  }

  return {
    frames: input.length,
    worstClockSkewMs,
    worstMarkerToRouteM,
    unavailableMarkerToRoute,
    pass: input.length > 0 && unavailableMarkerToRoute === 0 && breaches.length === 0,
    breaches,
  };
}

export function formatResumeFrameReport(input: ResumeFrameRecord[] = records): string {
  if (input.length === 0) {
    return '── post-resume frames ── nothing captured (arm the probe, then hide and reopen the tab)';
  }
  const verdict = evaluateResumeFrames(input);
  return [
    `── post-resume frames · ${verdict.frames} captured · ${verdict.pass ? 'PASS' : 'BREACH'} ──`,
    `  worst |cesium−system| : ${verdict.worstClockSkewMs.toFixed(1)} ms  (limit ${RESUME_FRAME_CLOCK_SKEW_LIMIT_MS} ms)`,
    `  worst marker↔route    : ${verdict.worstMarkerToRouteM.toFixed(1)} m  (limit ${RESUME_FRAME_MARKER_ROUTE_LIMIT_M} m)`,
    `  unavailable comparison: ${verdict.unavailableMarkerToRoute}`,
    '',
    ...input.map((r) => (
      `  frame ${String(r.frameIndex).padStart(2)}${r.firstFrameAfterResume ? ' [FIRST]' : '        '}`
      + `  hidden ${(r.hiddenForMs / 1000).toFixed(1)}s`
      + `  skew ${r.clockSkewMs.toFixed(1)} ms`
      + `  marker↔route ${r.markerToRouteM != null ? `${r.markerToRouteM.toFixed(1)} m` : 'n/a'}`
      + `  (${r.satelliteId})`
    )),
  ].join('\n');
}

/** Installs the console entry points. Called only from a DEV-guarded site. */
export function installResumeFrameProbe(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const win = window as unknown as Record<string, unknown>;
  win['__resumeFrameWatch'] = (on = true) => (on ? armResumeFrameProbe() : disarmResumeFrameProbe());
  win['__resumeFrames'] = () => {
    console.log(formatResumeFrameReport());
    return getResumeFrameRecords();
  };
}
