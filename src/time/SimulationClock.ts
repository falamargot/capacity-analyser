/**
 * Authoritative application timeline.
 *
 * The store deliberately owns no timer. Consumers choose their own refresh
 * cadence and call getTimeMs() when they need the current scenario instant.
 * This keeps the clock allocation-free while it runs and prevents a global
 * React render loop from being coupled to time progression.
 */

export const MIN_SIMULATION_SPEED = -100;
export const MAX_SIMULATION_SPEED = 100;

/** Pause, or any finite playback rate from −100×…−1× or +1×…+100×. */
export type SimulationSpeed = number;
export type SimulationClockMode = 'live' | 'simulation';

export interface SimulationClockSnapshot {
  readonly mode: SimulationClockMode;
  readonly speed: SimulationSpeed;
  /** Scenario instant captured at the latest control change. */
  readonly anchorSimulationMs: number;
  /** Real wall-clock instant captured at the same control change. */
  readonly anchorWallClockMs: number;
  /**
   * Changes whenever the orbital timeline controls change. Future async
   * consumers use it to reject work started against an obsolete timeline.
   */
  readonly revision: number;
}

export interface SimulationClockStore {
  /** Returns the current scenario instant as a UTC epoch timestamp. */
  readonly getTimeMs: () => number;
  /** Stable snapshot; its identity changes only after a control mutation. */
  readonly getSnapshot: () => SimulationClockSnapshot;
  /** Subscribe to control changes. Time progression itself emits no events. */
  readonly subscribe: (listener: () => void) => () => void;
  /** Select an explicit scenario instant and resume from it at normal speed. */
  readonly setDateTime: (timestampMs: number) => void;
  /** Change direction/rate without changing the currently displayed instant. */
  readonly setSpeed: (speed: SimulationSpeed) => void;
  /** Return to the real current time and normal playback. */
  readonly resetToLive: () => void;
}

interface CreateSimulationClockOptions {
  /** Injectable wall clock for deterministic tests. Defaults to Date.now. */
  now?: () => number;
}

export function isSimulationSpeed(value: number): value is SimulationSpeed {
  return Number.isFinite(value)
    && (value === 0 || Math.abs(value) >= 1)
    && value >= MIN_SIMULATION_SPEED
    && value <= MAX_SIMULATION_SPEED;
}

function assertFiniteTimestamp(timestampMs: number, label: string): void {
  if (!Number.isFinite(timestampMs)) {
    throw new RangeError(`${label} must be a finite UTC epoch timestamp`);
  }
}

function freezeSnapshot(snapshot: SimulationClockSnapshot): SimulationClockSnapshot {
  return Object.freeze(snapshot);
}

export function createSimulationClock(
  options: CreateSimulationClockOptions = {},
): SimulationClockStore {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();

  const readWallClock = (): number => {
    const value = now();
    assertFiniteTimestamp(value, 'Wall clock');
    return value;
  };

  const initialNow = readWallClock();
  let snapshot = freezeSnapshot({
    mode: 'live',
    speed: 1,
    anchorSimulationMs: initialNow,
    anchorWallClockMs: initialNow,
    revision: 0,
  });

  const getTimeAt = (wallClockMs: number): number => {
    if (snapshot.mode === 'live') return wallClockMs;
    return snapshot.anchorSimulationMs
      + ((wallClockMs - snapshot.anchorWallClockMs) * snapshot.speed);
  };

  const publish = (next: SimulationClockSnapshot): void => {
    snapshot = freezeSnapshot(next);
    for (const listener of listeners) listener();
  };

  const getTimeMs = (): number => getTimeAt(readWallClock());

  const getSnapshot = (): SimulationClockSnapshot => snapshot;

  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  const setDateTime = (timestampMs: number): void => {
    assertFiniteTimestamp(timestampMs, 'Simulation time');
    const wallClockMs = readWallClock();
    publish({
      mode: 'simulation',
      speed: 1,
      anchorSimulationMs: timestampMs,
      anchorWallClockMs: wallClockMs,
      revision: snapshot.revision + 1,
    });
  };

  const setSpeed = (speed: SimulationSpeed): void => {
    if (!isSimulationSpeed(speed)) {
      throw new RangeError(`Unsupported simulation speed: ${String(speed)}`);
    }
    if (snapshot.speed === speed && (snapshot.mode === 'simulation' || speed === 1)) return;

    const wallClockMs = readWallClock();
    const simulationMs = getTimeAt(wallClockMs);
    publish({
      mode: speed === 1 && snapshot.mode === 'live' ? 'live' : 'simulation',
      speed,
      anchorSimulationMs: simulationMs,
      anchorWallClockMs: wallClockMs,
      revision: snapshot.revision + 1,
    });
  };

  const resetToLive = (): void => {
    if (snapshot.mode === 'live') return;
    const wallClockMs = readWallClock();
    publish({
      mode: 'live',
      speed: 1,
      anchorSimulationMs: wallClockMs,
      anchorWallClockMs: wallClockMs,
      revision: snapshot.revision + 1,
    });
  };

  return {
    getTimeMs,
    getSnapshot,
    subscribe,
    setDateTime,
    setSpeed,
    resetToLive,
  };
}
