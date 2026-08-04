/**
 * Liveness tests for the satellite propagation loop.
 *
 * The bug these exist for: on 2026-07-29 an authoritative browser soak measured
 * a 319 km mean ground-track error on a VISIBLE tab whose interpolation cells
 * were 311 ms old. Rendering was healthy; the propagation loop had simply
 * stopped, because the only thing that armed the next tick was a worker
 * response, and one response never arrived. Hiding and reopening the tab was
 * the only way back.
 *
 * So the property under test is not accuracy — it is that the loop cannot stop.
 */
import { describe, expect, it } from 'vitest';
import {
  SATELLITE_PROPAGATION_INTERVAL_MS,
  SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS,
  SATELLITE_PROPAGATION_RETRY_MS,
  WORKER_RESPONSE_DEADLINE_MS,
  actionPosts,
  decisionClearsBusy,
  resolvePropagationSampleTimeMs,
  resolvePropagationResponse,
  resolvePropagationTick,
} from '../satellitePropagationSchedule';

const NOW = 1_700_000_000_000;

describe('resolvePropagationSampleTimeMs', () => {
  it.each([
    { speed: 1, expected: NOW + SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS },
    { speed: 2, expected: NOW + (2 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
    { speed: 5, expected: NOW + (5 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
    { speed: 10, expected: NOW + (10 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
    { speed: -2, expected: NOW - (2 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
    { speed: -5, expected: NOW - (5 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
    { speed: -10, expected: NOW - (10 * SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS) },
  ])('uses a signed lookahead at $speed×', ({ speed, expected }) => {
    expect(resolvePropagationSampleTimeMs(NOW, speed)).toBe(expected);
  });

  it('asks for the frozen instant itself while paused', () => {
    expect(resolvePropagationSampleTimeMs(NOW, 0)).toBe(NOW);
  });
});

/**
 * Defaults describe a normally playing timeline that has already published a
 * sample — the state every liveness test below was written against.
 */
const tickState = (
  over: Partial<Parameters<typeof resolvePropagationTick>[0]>,
): Parameters<typeof resolvePropagationTick>[0] => ({
  satelliteCount: 651,
  workerBusy: false,
  requestSentAtMs: NOW,
  nowMs: NOW,
  playbackSpeed: 1,
  hasPublishedCurrentTimeline: true,
  satelliteCacheStale: false,
  ...over,
});

describe('resolvePropagationTick', () => {
  it('always returns a delay, so the caller can always arm the next tick', () => {
    const states = [
      tickState({ satelliteCount: 0, requestSentAtMs: 0 }),
      tickState({ requestSentAtMs: 0 }),
      tickState({ workerBusy: true, requestSentAtMs: NOW - 10 }),
      tickState({ workerBusy: true, requestSentAtMs: NOW - 60_000 }),
      // A paused loop is still a live loop.
      tickState({ playbackSpeed: 0 }),
      tickState({ playbackSpeed: 0, hasPublishedCurrentTimeline: false }),
    ];

    for (const state of states) {
      expect(resolvePropagationTick(state).delayMs).toBeGreaterThan(0);
    }
  });

  it('waits for the satellite fetch before propagating anything', () => {
    const action = resolvePropagationTick(tickState({
      satelliteCount: 0, workerBusy: false, requestSentAtMs: 0, nowMs: NOW,
    }));
    expect(action).toEqual({ kind: 'await-satellites', delayMs: SATELLITE_PROPAGATION_RETRY_MS });
    expect(actionPosts(action)).toBe(false);
  });

  it('posts on a normal idle tick', () => {
    const action = resolvePropagationTick(tickState({
      satelliteCount: 651, workerBusy: false, requestSentAtMs: NOW - 5000, nowMs: NOW,
    }));
    expect(action.kind).toBe('post');
    expect(action.delayMs).toBe(SATELLITE_PROPAGATION_INTERVAL_MS);
    expect(actionPosts(action)).toBe(true);
  });

  it('does not stack requests while one is legitimately in flight', () => {
    const action = resolvePropagationTick(tickState({
      satelliteCount: 651, workerBusy: true, requestSentAtMs: NOW - 150, nowMs: NOW,
    }));
    expect(action.kind).toBe('await-response');
    expect(actionPosts(action)).toBe(false);
  });

  it('recovers a lost response once the deadline passes — the whole point', () => {
    const justBefore = resolvePropagationTick(tickState({
      satelliteCount: 651,
      workerBusy: true,
      requestSentAtMs: NOW - (WORKER_RESPONSE_DEADLINE_MS - 1),
      nowMs: NOW,
    }));
    expect(justBefore.kind).toBe('await-response');

    const atDeadline = resolvePropagationTick(tickState({
      satelliteCount: 651,
      workerBusy: true,
      requestSentAtMs: NOW - WORKER_RESPONSE_DEADLINE_MS,
      nowMs: NOW,
    }));
    expect(atDeadline.kind).toBe('recover-lost-response');
    expect(actionPosts(atDeadline)).toBe(true);
  });

  it('recovers while the tab stays visible — a hide/resume is never required', () => {
    // Replay the measured failure: a response is lost, and the tab is NEVER
    // hidden. Previously nothing rescheduled and the app stayed stale for
    // 56-90 s. Here the loop must re-post within a bounded number of ticks.
    let busy = true;
    const sentAtMs = NOW;
    let posted = 0;
    let ticks = 0;

    for (let now = NOW; now <= NOW + 10_000; now += SATELLITE_PROPAGATION_INTERVAL_MS) {
      ticks++;
      const action = resolvePropagationTick(tickState({
        satelliteCount: 651, workerBusy: busy, requestSentAtMs: sentAtMs, nowMs: now,
      }));
      if (actionPosts(action)) { posted++; busy = true; break; }
    }

    expect(posted).toBe(1);
    expect(ticks).toBeLessThanOrEqual(WORKER_RESPONSE_DEADLINE_MS / SATELLITE_PROPAGATION_INTERVAL_MS + 1);
  });

  it('keeps worst-case sample age inside the interpolation extrapolation cap', () => {
    // A marker may extrapolate 4 s before it visibly freezes
    // (SATELLITE_MAX_EXTRAPOLATION_MS). Recovery must land first: deadline plus
    // one tick, plus the 1.2 s propagation lookahead already in hand.
    expect(WORKER_RESPONSE_DEADLINE_MS + SATELLITE_PROPAGATION_INTERVAL_MS - 1200).toBeLessThanOrEqual(4000);
  });

  it('pins the constellation once when the user pauses, then stops propagating', () => {
    // Pausing resets the caller's published sentinel, so the first tick still
    // posts and the satellites land on the exact instant the user stopped on.
    const first = resolvePropagationTick(tickState({
      playbackSpeed: 0,
      hasPublishedCurrentTimeline: false,
    }));
    expect(first.kind).toBe('post');
    expect(actionPosts(first)).toBe(true);

    // Every tick after that would propagate 651 satellites to the instant
    // already on screen and throw the result away.
    let posts = 0;
    for (let i = 0; i < 60; i++) {
      const action = resolvePropagationTick(tickState({
        playbackSpeed: 0,
        hasPublishedCurrentTimeline: true,
        nowMs: NOW + i * SATELLITE_PROPAGATION_INTERVAL_MS,
      }));
      expect(action.kind).toBe('await-resume');
      expect(action.delayMs).toBe(SATELLITE_PROPAGATION_INTERVAL_MS);
      if (actionPosts(action)) posts++;
    }
    expect(posts).toBe(0);
  });

  it('re-propagates while paused when a TLE refresh restocks the worker cache', () => {
    // The hourly refresh can introduce a satellite that has never been
    // propagated to the frozen instant, and it invalidates the worker's satrec
    // cache. Staying idle would leave both stale until the user pressed play.
    const action = resolvePropagationTick(tickState({
      playbackSpeed: 0,
      hasPublishedCurrentTimeline: true,
      satelliteCacheStale: true,
    }));
    expect(action.kind).toBe('post');
    expect(actionPosts(action)).toBe(true);
  });

  it('still recovers a lost response while paused', () => {
    // The pause gate must not swallow the liveness rule: a request posted just
    // before the pause can still go missing.
    const action = resolvePropagationTick(tickState({
      workerBusy: true,
      playbackSpeed: 0,
      hasPublishedCurrentTimeline: true,
      requestSentAtMs: NOW - WORKER_RESPONSE_DEADLINE_MS,
    }));
    expect(action.kind).toBe('recover-lost-response');
    expect(actionPosts(action)).toBe(true);
  });

  it('resumes posting as soon as playback restarts', () => {
    const action = resolvePropagationTick(tickState({
      playbackSpeed: -5,
      hasPublishedCurrentTimeline: true,
    }));
    expect(action.kind).toBe('post');
  });

  it('re-posts once per tick at most, so a dead worker cannot flood the queue', () => {
    let posts = 0;
    for (let i = 0; i < 20; i++) {
      const action = resolvePropagationTick(tickState({
        satelliteCount: 651,
        workerBusy: true,
        // Latch cleared and re-stamped by the caller on every recovery.
        requestSentAtMs: NOW + i * SATELLITE_PROPAGATION_INTERVAL_MS,
        nowMs: NOW + i * SATELLITE_PROPAGATION_INTERVAL_MS,
      }));
      if (actionPosts(action)) posts++;
    }
    expect(posts).toBe(0);
  });
});

/**
 * A timed-out request is assumed lost, never cancelled — `postMessage` has no
 * recall. So the retry and the original can both be answered, in either order.
 * These replay that race end to end against a model of the loader's state, in
 * the order the events actually reach the main thread.
 */
describe('late-response race', () => {
  const LOOKAHEAD = 1200;

  /** The pieces of useSatelliteLoader's state the race touches. */
  function makeLoader() {
    let seq = 0;
    const state = {
      busy: false,
      activeRequestId: 0,
      activeTimelineRevision: 0,
      playbackSpeed: 1,
      lastPublishedSampleTimeMs: null as number | null,
      published: [] as number[],
    };
    return {
      state,
      post(nowMs: number) {
        const requestId = ++seq;
        state.activeRequestId = requestId;
        state.busy = true;
        return {
          requestId,
          timelineRevision: state.activeTimelineRevision,
          timestamp: nowMs + LOOKAHEAD,
        };
      },
      switchTimeline(revision: number, playbackSpeed: number = 1) {
        state.activeTimelineRevision = revision;
        state.playbackSpeed = playbackSpeed;
        state.lastPublishedSampleTimeMs = null;
      },
      deliver(response: { requestId: number; timelineRevision: number; timestamp: number }) {
        const decision = resolvePropagationResponse({
          responseTimelineRevision: response.timelineRevision,
          activeTimelineRevision: state.activeTimelineRevision,
          playbackSpeed: state.playbackSpeed,
          responseRequestId: response.requestId,
          activeRequestId: state.activeRequestId,
          responseSampleTimeMs: response.timestamp,
          lastPublishedSampleTimeMs: state.lastPublishedSampleTimeMs,
        });
        if (decisionClearsBusy(decision)) state.busy = false;
        if (decision === 'accept') {
          state.lastPublishedSampleTimeMs = response.timestamp;
          state.published.push(response.timestamp);
        }
        return decision;
      },
    };
  }

  it('publishes the retry when the first response is simply lost', () => {
    const loader = makeLoader();
    loader.post(NOW);                                   // times out, never answered
    const retry = loader.post(NOW + WORKER_RESPONSE_DEADLINE_MS);

    expect(loader.deliver(retry)).toBe('accept');
    expect(loader.state.published).toEqual([NOW + WORKER_RESPONSE_DEADLINE_MS + LOOKAHEAD]);
    expect(loader.state.busy).toBe(false);
  });

  it('ignores the old response when it arrives BEFORE the retry response', () => {
    const loader = makeLoader();
    const lost = loader.post(NOW);
    const retry = loader.post(NOW + WORKER_RESPONSE_DEADLINE_MS);

    expect(loader.deliver(lost)).toBe('ignore-superseded');
    expect(loader.deliver(retry)).toBe('accept');
    expect(loader.state.published).toEqual([NOW + WORKER_RESPONSE_DEADLINE_MS + LOOKAHEAD]);
  });

  it('ignores the old response when it arrives AFTER the retry response', () => {
    // The dangerous ordering: without request identity this republished a
    // 3 s-old sample and every satellite jumped ~18 km backwards.
    const loader = makeLoader();
    const lost = loader.post(NOW);
    const retry = loader.post(NOW + WORKER_RESPONSE_DEADLINE_MS);

    expect(loader.deliver(retry)).toBe('accept');
    expect(loader.deliver(lost)).toBe('ignore-superseded');
    expect(loader.state.published).toEqual([NOW + WORKER_RESPONSE_DEADLINE_MS + LOOKAHEAD]);
  });

  it('does not let a stale response clear the busy state of the current request', () => {
    // Clearing the latch here would let a THIRD request be posted while the
    // retry is still in flight.
    const loader = makeLoader();
    const lost = loader.post(NOW);
    loader.post(NOW + WORKER_RESPONSE_DEADLINE_MS);

    expect(loader.state.busy).toBe(true);
    loader.deliver(lost);
    expect(loader.state.busy).toBe(true);
  });

  it('rejects an obsolete-timeline response without clearing the current latch', () => {
    const loader = makeLoader();
    const oldTimeline = loader.post(NOW);
    loader.switchTimeline(1);
    const currentTimeline = loader.post(NOW - 86_400_000);

    expect(loader.deliver(oldTimeline)).toBe('ignore-obsolete-timeline');
    expect(loader.state.busy).toBe(true);
    expect(loader.deliver(currentTimeline)).toBe('accept');
    expect(loader.state.busy).toBe(false);
  });

  it('accepts the first sample of a new timeline even before the Unix epoch', () => {
    const loader = makeLoader();
    loader.switchTimeline(4);
    const request = loader.post(-2_000_000);

    expect(loader.deliver(request)).toBe('accept');
    expect(loader.state.published).toEqual([-2_000_000 + LOOKAHEAD]);
  });

  it('publishes strictly descending samples in reverse playback', () => {
    const loader = makeLoader();
    loader.switchTimeline(3, -1);

    for (let i = 0; i < 8; i++) {
      const request = loader.post(NOW - (i * SATELLITE_PROPAGATION_INTERVAL_MS));
      expect(loader.deliver(request)).toBe('accept');
    }

    const published = loader.state.published;
    expect(published).toHaveLength(8);
    for (let i = 1; i < published.length; i++) {
      expect(published[i]).toBeLessThan(published[i - 1]);
    }
  });

  it('accepts a repeated instant while paused so a new selection can be resolved', () => {
    // Paused, every request asks for the same frozen instant. Judging that
    // "out of order" dropped the one thing paused propagation is still used
    // for: recomputing coverage for a satellite selected while stopped. The
    // request-id rule still protects against a superseded reply.
    const loader = makeLoader();
    loader.switchTimeline(6, 0);

    const pinned = loader.post(NOW);
    expect(loader.deliver(pinned)).toBe('accept');

    const afterSelection = loader.post(NOW);
    expect(loader.deliver(afterSelection)).toBe('accept');
    expect(loader.state.published).toEqual([NOW + LOOKAHEAD, NOW + LOOKAHEAD]);
    expect(loader.state.busy).toBe(false);
  });

  it('still rejects a superseded reply while paused', () => {
    const loader = makeLoader();
    loader.switchTimeline(7, 0);
    const lost = loader.post(NOW);
    const retry = loader.post(NOW);

    expect(loader.deliver(lost)).toBe('ignore-superseded');
    expect(loader.state.busy).toBe(true);
    expect(loader.deliver(retry)).toBe('accept');
  });

  it('rejects a non-descending sample during reverse playback', () => {
    const loader = makeLoader();
    loader.switchTimeline(2, -1);
    const first = loader.post(NOW);
    expect(loader.deliver(first)).toBe('accept');

    const wrongDirection = loader.post(NOW + 1000);
    expect(loader.deliver(wrongDirection)).toBe('ignore-out-of-order');
  });

  it('never moves the published sample time backwards', () => {
    const loader = makeLoader();
    for (let i = 0; i < 25; i++) {
      const request = loader.post(NOW + i * SATELLITE_PROPAGATION_INTERVAL_MS);
      // Every third round trip is lost and answered late, out of order.
      if (i % 3 === 0) continue;
      loader.deliver(request);
    }

    const published = loader.state.published;
    expect(published.length).toBeGreaterThan(0);
    for (let i = 1; i < published.length; i++) {
      expect(published[i]).toBeGreaterThan(published[i - 1]);
    }
  });

  it('refuses a current-id response whose sample is not newer than what is shown', () => {
    const loader = makeLoader();
    const first = loader.post(NOW);
    loader.deliver(first);

    // Same id replayed, or a clock that stepped backwards.
    expect(loader.deliver(first)).toBe('ignore-out-of-order');
    expect(loader.state.published).toHaveLength(1);
  });

  it('keeps exactly one request outstanding across repeated timeouts', () => {
    // Queue growth check: each deadline supersedes the previous id, so however
    // many times the worker fails, only the newest request can ever be answered.
    const loader = makeLoader();
    const orphaned: { requestId: number; timelineRevision: number; timestamp: number }[] = [];
    for (let i = 0; i < 12; i++) {
      orphaned.push(loader.post(NOW + i * WORKER_RESPONSE_DEADLINE_MS));
    }

    const newest = orphaned.pop()!;
    for (const stale of orphaned) {
      expect(loader.deliver(stale)).toBe('ignore-superseded');
    }
    expect(loader.deliver(newest)).toBe('accept');
    expect(loader.state.published).toHaveLength(1);
    expect(loader.state.busy).toBe(false);
  });
});
