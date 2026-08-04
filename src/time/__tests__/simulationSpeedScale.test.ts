import { describe, expect, it } from 'vitest';
import {
  formatSimulationSpeed,
  simulationSpeedToSliderPosition,
  sliderPositionToSimulationSpeed,
} from '../simulationSpeedScale';

describe('simulation speed scale', () => {
  it('maps both extrema to 100× and the centre to pause', () => {
    expect(sliderPositionToSimulationSpeed(-100)).toBe(-100);
    expect(sliderPositionToSimulationSpeed(-20)).toBe(-1);
    expect(sliderPositionToSimulationSpeed(0)).toBe(0);
    expect(sliderPositionToSimulationSpeed(20)).toBe(1);
    expect(sliderPositionToSimulationSpeed(100)).toBe(100);
  });

  it('uses an exponential rather than linear progression', () => {
    expect(sliderPositionToSimulationSpeed(-60)).toBe(-10);
    expect(sliderPositionToSimulationSpeed(60)).toBe(10);
    expect(sliderPositionToSimulationSpeed(40)).toBeCloseTo(3.16, 2);
  });

  it('places a selected speed back at its matching slider position', () => {
    expect(sliderPositionToSimulationSpeed(simulationSpeedToSliderPosition(-5))).toBe(-5);
    expect(sliderPositionToSimulationSpeed(simulationSpeedToSliderPosition(10))).toBe(10);
    expect(simulationSpeedToSliderPosition(0)).toBe(0);
    expect(simulationSpeedToSliderPosition(1)).toBe(20);
  });

  it('formats signed fractional speeds without noisy decimals', () => {
    expect(formatSimulationSpeed(-3.16)).toBe('−3.16×');
    expect(formatSimulationSpeed(10)).toBe('10×');
    expect(formatSimulationSpeed(0)).toBe('Pause');
  });
});
