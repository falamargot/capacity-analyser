import {
  MAX_SIMULATION_SPEED,
  MIN_SIMULATION_SPEED,
  type SimulationSpeed,
} from './SimulationClock';

export const SPEED_SLIDER_MIN = -100;
export const SPEED_SLIDER_MAX = 100;
/** Keeps −1×, Pause and +1× visually distinct around the centre. */
export const SPEED_SLIDER_ONE_X_POSITION = 20;

function clampSliderPosition(position: number): number {
  return Math.max(
    SPEED_SLIDER_MIN,
    Math.min(SPEED_SLIDER_MAX, position),
  );
}

/**
 * Maps both sides of the slider to a logarithmic 1×…100× scale.
 * The centre is a dedicated pause detent; the adjacent positions are −1×/+1×.
 */
export function sliderPositionToSimulationSpeed(position: number): SimulationSpeed {
  const clamped = clampSliderPosition(position);
  const absolutePosition = Math.abs(clamped);
  if (absolutePosition < SPEED_SLIDER_ONE_X_POSITION / 2) return 0;

  const maxMagnitude = Math.max(Math.abs(MIN_SIMULATION_SPEED), MAX_SIMULATION_SPEED);
  const playbackPosition = Math.max(absolutePosition, SPEED_SLIDER_ONE_X_POSITION);
  const magnitude = maxMagnitude ** (
    (playbackPosition - SPEED_SLIDER_ONE_X_POSITION)
    / (SPEED_SLIDER_MAX - SPEED_SLIDER_ONE_X_POSITION)
  );
  const rounded = Math.round(magnitude * 100) / 100;
  return clamped < 0 ? -rounded : rounded;
}

/** Returns the slider position representing an already-selected playback rate. */
export function simulationSpeedToSliderPosition(speed: SimulationSpeed): number {
  if (speed === 0) return 0;

  const maxMagnitude = Math.max(Math.abs(MIN_SIMULATION_SPEED), MAX_SIMULATION_SPEED);
  const position = SPEED_SLIDER_ONE_X_POSITION
    + ((Math.log(Math.abs(speed)) / Math.log(maxMagnitude))
      * (SPEED_SLIDER_MAX - SPEED_SLIDER_ONE_X_POSITION));
  return speed < 0 ? -position : position;
}

export function formatSimulationSpeed(speed: number): string {
  if (speed === 0) return 'Pause';
  const absolute = Math.abs(speed);
  const value = Number.isInteger(absolute) ? absolute.toFixed(0) : absolute.toFixed(2);
  return `${speed < 0 ? '−' : ''}${value}×`;
}
