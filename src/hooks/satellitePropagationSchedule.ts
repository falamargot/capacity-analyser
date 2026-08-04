/**
 * Liveness policy for the satellite propagation loop.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * The 2026-07-29 authoritative browser soak measured a 319 km mean ground-track
 * error on a VISIBLE tab, with interpolation cells refreshed 311 ms ago (React
 * rendering normally) but worker samples 56–90 s old. Cesium was faithfully
 * interpolating between two ancient SGP4 samples: the propagation loop itself
 * had stopped, and only hiding and reopening the tab restarted it.
 *
 * The loop was structured so that the ONLY thing that armed the next tick was
 * the arrival of a worker response:
 *
 *     scheduleTick()  →  if (busy) return;            // no timer armed
 *                        busy = true; postMessage()   // no timer armed
 *     onmessage       →  busy = false; setTimeout(scheduleTick, 1000)
 *
 * So a single response that never arrives — a worker suspended by the browser,
 * a message lost across a tab suspension, an exception on the response path —
 * leaves `busy` latched true with no pending timer, and nothing ever retries.
 * The `visibilitychange` handler was the only code that cleared the latch,
 * which is precisely why the tab had to be hidden and reopened to recover.
 *
 * The policy below makes liveness independent of the response path, and is kept
 * pure so the recovery rule can be tested without a worker or a browser.
 */

/** Nominal gap between propagation ticks. */
export const SATELLITE_PROPAGATION_INTERVAL_MS = 1000;

/**
 * Real-time lookahead used to bracket smooth interpolation. It is multiplied
 * by the signed playback speed before being applied to scenario time.
 */
export const SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS = 1200;

/** Retry delay while the satellite list is still loading. */
export const SATELLITE_PROPAGATION_RETRY_MS = 500;

/**
 * How long a propagate request may be in flight before it is treated as lost.
 *
 * Three cadences. Long enough that a slow round trip is never mistaken for a
 * failure, short enough that the worst-case sample age stays inside the 4 s
 * extrapolation cap the interpolation already honours — so recovery happens
 * before a marker can visibly freeze.
 */
export const WORKER_RESPONSE_DEADLINE_MS = 3 * SATELLITE_PROPAGATION_INTERVAL_MS;

/** Resolves the UTC SGP4 sample instant for the current playback direction. */
export function resolvePropagationSampleTimeMs(
  simulationTimeMs: number,
  playbackSpeed: number,
): number {
  return simulationTimeMs + (SATELLITE_PROPAGATION_LOOKAHEAD_REAL_MS * playbackSpeed);
}

export interface PropagationTickState {
  /** Satellites currently available to propagate. */
  satelliteCount: number;
  /** True while a propagate request has been posted and not yet answered. */
  workerBusy: boolean;
  /** When the in-flight request was posted; ignored when `workerBusy` is false. */
  requestSentAtMs: number;
  nowMs: number;
  /** Signed playback rate; 0 means the scenario clock is paused. */
  playbackSpeed: number;
  /** True once a sample has been published for the current timeline. */
  hasPublishedCurrentTimeline: boolean;
  /**
   * True while the worker's satrec cache does not describe the current
   * satellite list — after the initial load, an hourly TLE refresh, or a worker
   * recycle. A paused loop must still post in that state: the refresh can
   * introduce satellites that have never been propagated to the frozen instant.
   */
  satelliteCacheStale: boolean;
}

export type PropagationTickAction =
  /** Nothing to propagate yet — wait for the satellite fetch. */
  | { kind: 'await-satellites'; delayMs: number }
  /** A request is in flight and still within its deadline. */
  | { kind: 'await-response'; delayMs: number }
  /** Scenario time is frozen and already drawn — nothing to recompute. */
  | { kind: 'await-resume'; delayMs: number }
  /** Normal propagation. */
  | { kind: 'post'; delayMs: number }
  /** The in-flight request exceeded its deadline; clear the latch and re-post. */
  | { kind: 'recover-lost-response'; delayMs: number; inFlightMs: number };

/**
 * Decides what a tick should do. The caller ALWAYS arms the next tick using
 * `delayMs`, whatever the decision — that is the property that makes the loop
 * unable to stop. `await-resume` is no exception: the timer keeps running so a
 * paused loop is still a live loop.
 */
export function resolvePropagationTick(state: PropagationTickState): PropagationTickAction {
  const {
    satelliteCount,
    workerBusy,
    requestSentAtMs,
    nowMs,
    playbackSpeed,
    hasPublishedCurrentTimeline,
    satelliteCacheStale,
  } = state;

  if (satelliteCount === 0) {
    return { kind: 'await-satellites', delayMs: SATELLITE_PROPAGATION_RETRY_MS };
  }

  if (workerBusy) {
    const inFlightMs = nowMs - requestSentAtMs;
    if (inFlightMs < WORKER_RESPONSE_DEADLINE_MS) {
      return { kind: 'await-response', delayMs: SATELLITE_PROPAGATION_INTERVAL_MS };
    }
    // The response is assumed lost — but NOT cancelled, so the caller must
    // recycle the worker to drop whatever is still queued in it, and must
    // discard any late reply by request id. See resolvePropagationResponse.
    return { kind: 'recover-lost-response', delayMs: SATELLITE_PROPAGATION_INTERVAL_MS, inFlightMs };
  }

  // Paused, the frozen instant is already on screen, and the worker's cache
  // still describes the satellites being drawn. Propagating again would run
  // SGP4 over the whole constellation every second to reproduce the positions
  // already displayed. The pause command itself resets the caller's published
  // sentinel, so the first tick after pausing still posts once and pins the
  // constellation to the exact instant the user stopped on.
  if (playbackSpeed === 0 && hasPublishedCurrentTimeline && !satelliteCacheStale) {
    return { kind: 'await-resume', delayMs: SATELLITE_PROPAGATION_INTERVAL_MS };
  }

  return { kind: 'post', delayMs: SATELLITE_PROPAGATION_INTERVAL_MS };
}

/** True when the action means "send a propagate message now". */
export function actionPosts(action: PropagationTickAction): boolean {
  return action.kind === 'post' || action.kind === 'recover-lost-response';
}

// ─── Response acceptance ──────────────────────────────────────────────────────

/**
 * A timed-out request is not cancelled — it is only assumed lost. The worker may
 * still be computing it, and `postMessage` has no recall, so a late reply can
 * arrive at any moment, including AFTER the reply to the retry that replaced it.
 *
 * Before request ids existed, any such reply cleared the busy latch (letting a
 * further request be posted while a newer one was still in flight) and was
 * published unconditionally, moving every satellite back to where it had been
 * seconds earlier. The epsilon gate in `useSatelliteLoader` does not prevent
 * this: it compares position DELTAS, not sample timestamps, so a large backwards
 * jump is exactly the kind of change it lets through.
 */
export interface PropagationResponseState {
  /** Timeline revision echoed by the worker. */
  responseTimelineRevision: number;
  /** Revision currently owned by the application clock. */
  activeTimelineRevision: number;
  /**
   * Signed playback rate. Its sign gives the direction valid sample timestamps
   * must progress in; 0 means time is frozen and there is no ordering to check.
   */
  playbackSpeed: number;
  /** Id echoed by the worker. */
  responseRequestId: number;
  /** Id of the only request whose reply is still wanted. */
  activeRequestId: number;
  /** UTC instant the response was propagated to. */
  responseSampleTimeMs: number;
  /** Newest sample in this timeline; null before its first publication. */
  lastPublishedSampleTimeMs: number | null;
}

export type PropagationResponseDecision =
  /** Current request, newer sample — clear the latch and publish. */
  | 'accept'
  /** Reply produced for clock controls that are no longer active. */
  | 'ignore-obsolete-timeline'
  /** Reply to a request that has been superseded — ignore completely. */
  | 'ignore-superseded'
  /** Current request, but its sample is not newer than what is already shown. */
  | 'ignore-out-of-order';

/**
 * Decides what to do with a worker response.
 *
 * Only the active request on the active timeline may clear the busy latch or
 * publish. Within one moving timeline, sample time cannot move against the
 * direction of playback. Timeline changes reset the caller's last-published
 * sentinel.
 *
 * While paused there is no ordering to enforce: every sample is the same frozen
 * instant, so a reply cannot move anything backwards. Rejecting it as
 * out-of-order would drop the only thing paused propagation is still used for —
 * recomputing coverage for a satellite the user selects while stopped.
 */
export function resolvePropagationResponse(
  state: PropagationResponseState,
): PropagationResponseDecision {
  if (state.responseTimelineRevision !== state.activeTimelineRevision) {
    return 'ignore-obsolete-timeline';
  }
  if (state.responseRequestId !== state.activeRequestId) return 'ignore-superseded';
  if (state.playbackSpeed !== 0 && state.lastPublishedSampleTimeMs !== null) {
    const direction = state.playbackSpeed < 0 ? -1 : 1;
    const deltaMs = state.responseSampleTimeMs - state.lastPublishedSampleTimeMs;
    if (deltaMs * direction <= 0) return 'ignore-out-of-order';
  }
  return 'accept';
}

/** True when the decision means the in-flight latch may be released. */
export function decisionClearsBusy(decision: PropagationResponseDecision): boolean {
  return decision === 'accept' || decision === 'ignore-out-of-order';
}
