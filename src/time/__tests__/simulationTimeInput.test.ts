import { describe, expect, it } from 'vitest';
import {
  formatSimulationTimeInput,
  formatSimulationTimeReadout,
  parseSimulationTimeInput,
} from '../simulationTimeInput';

describe('simulationTimeInput', () => {
  it('formats an instant as explicit UTC date and time fields', () => {
    const timestampMs = Date.parse('2031-02-03T04:05:06.789Z');
    expect(formatSimulationTimeInput(timestampMs)).toEqual({
      date: '2031-02-03',
      time: '04:05:06',
    });
    expect(formatSimulationTimeReadout(timestampMs)).toBe('2031-02-03 04:05:06 UTC');
  });

  it('parses seconds as UTC and accepts minute precision', () => {
    expect(parseSimulationTimeInput('2031-02-03', '04:05:06'))
      .toBe(Date.parse('2031-02-03T04:05:06.000Z'));
    expect(parseSimulationTimeInput('2031-02-03', '04:05'))
      .toBe(Date.parse('2031-02-03T04:05:00.000Z'));
  });

  it('rejects incomplete and normalized invalid dates', () => {
    expect(parseSimulationTimeInput('', '04:05:06')).toBeNull();
    expect(parseSimulationTimeInput('2031-02-30', '04:05:06')).toBeNull();
    expect(parseSimulationTimeInput('2031-02-03', '25:00:00')).toBeNull();
  });
});
