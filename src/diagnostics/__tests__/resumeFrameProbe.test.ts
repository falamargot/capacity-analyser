/**
 * Post-resume rendered-frame verdict.
 *
 * The hide/resume soak reported a 27 s Cesium/system clock delta. That value was
 * read BETWEEN frames, so it does not establish that a stale frame was ever
 * drawn — only a measurement taken at postRender can. These tests pin the rule
 * that decides it, so the browser run's verdict is not a judgement call.
 */
import { describe, expect, it } from 'vitest';
import {
  RESUME_FRAME_CLOCK_SKEW_LIMIT_MS,
  RESUME_FRAME_MARKER_ROUTE_LIMIT_M,
  evaluateResumeFrames,
  formatResumeFrameReport,
  type ResumeFrameRecord,
} from '../resumeFrameProbe';

const NOW = 1_700_000_000_000;

const frame = (over: Partial<ResumeFrameRecord> = {}): ResumeFrameRecord => ({
  frameIndex: 1,
  firstFrameAfterResume: true,
  scenarioUtcMs: NOW,
  wallClockMs: NOW,
  cesiumClockMs: NOW,
  clockSkewMs: 0,
  hiddenForMs: 27_000,
  satelliteId: '55178',
  marker: { lat: 10, lng: 20, alt: 1200 },
  routeEndpoint: { lat: 10, lng: 20, alt: 1200 },
  markerToRouteM: 0,
  ...over,
});

describe('evaluateResumeFrames', () => {
  it('passes when the first frame after resume is already current', () => {
    // The "no application change needed" outcome: the 27 s was pre-render state.
    const verdict = evaluateResumeFrames([
      frame({ clockSkewMs: -12, markerToRouteM: 4.2 }),
      frame({ frameIndex: 2, firstFrameAfterResume: false, clockSkewMs: -8, markerToRouteM: 3.1 }),
    ]);

    expect(verdict.pass).toBe(true);
    expect(verdict.breaches).toEqual([]);
    expect(verdict.worstClockSkewMs).toBe(12);
    expect(verdict.worstMarkerToRouteM).toBeCloseTo(4.2, 5);
    expect(verdict.unavailableMarkerToRoute).toBe(0);
  });

  it('fails a frame whose clock is behind by more than the limit', () => {
    // The "stale frame really was rendered" outcome: 27 s of clock lag reaching
    // the screen would put a route endpoint ~165 km from its marker.
    const verdict = evaluateResumeFrames([
      frame({ clockSkewMs: -27_000, markerToRouteM: 164_000 }),
    ]);

    expect(verdict.pass).toBe(false);
    expect(verdict.breaches).toHaveLength(1);
    expect(verdict.breaches[0].firstFrameAfterResume).toBe(true);
  });

  it('fails on marker/route divergence even when the clock looks fine', () => {
    const verdict = evaluateResumeFrames([
      frame({ clockSkewMs: -5, markerToRouteM: RESUME_FRAME_MARKER_ROUTE_LIMIT_M + 1 }),
    ]);
    expect(verdict.pass).toBe(false);
  });

  it('treats both limits as inclusive', () => {
    const verdict = evaluateResumeFrames([
      frame({
        clockSkewMs: -RESUME_FRAME_CLOCK_SKEW_LIMIT_MS,
        markerToRouteM: RESUME_FRAME_MARKER_ROUTE_LIMIT_M,
      }),
    ]);
    expect(verdict.pass).toBe(true);
  });

  it('does not pass when nothing was captured — absence of evidence is not a pass', () => {
    const verdict = evaluateResumeFrames([]);
    expect(verdict.pass).toBe(false);
    expect(verdict.frames).toBe(0);
  });

  it('flags a run where the route endpoint was never measured', () => {
    // The 2026-07-29 run sampled satellite 28187 — a GEO entity SatelliteLayer
    // renders but which is not in the OneWeb satrec set — so every route
    // endpoint came back null and the marker/route criterion silently did not
    // run. `worstMarkerToRouteM` of 0 with no endpoint is NOT evidence of
    // agreement, and the caller must be able to see that.
    const verdict = evaluateResumeFrames([
      frame({ routeEndpoint: null, markerToRouteM: null, clockSkewMs: -27_056 }),
    ]);
    expect(verdict.pass).toBe(false);
    expect(verdict.worstMarkerToRouteM).toBe(0);
    expect(verdict.breaches[0].routeEndpoint).toBeNull();
  });

  it('fails when a route endpoint could not be propagated even with a current clock', () => {
    const verdict = evaluateResumeFrames([
      frame({ routeEndpoint: null, markerToRouteM: null, clockSkewMs: -3 }),
    ]);
    expect(verdict.pass).toBe(false);
    expect(verdict.worstMarkerToRouteM).toBe(0);
    expect(verdict.unavailableMarkerToRoute).toBe(1);
    expect(verdict.breaches).toHaveLength(1);
  });

  it('reports the first frame explicitly, and says so when nothing was captured', () => {
    expect(formatResumeFrameReport([])).toContain('nothing captured');
    const report = formatResumeFrameReport([frame({ clockSkewMs: -9, markerToRouteM: 2 })]);
    expect(report).toContain('[FIRST]');
    expect(report).toContain('PASS');
  });
});
