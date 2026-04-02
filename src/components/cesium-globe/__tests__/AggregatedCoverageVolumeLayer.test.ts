import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let pickBeamFootprintPoints: typeof import('../AggregatedCoverageVolumeLayer').pickBeamFootprintPoints;

beforeAll(async () => {
  vi.stubGlobal('window', { devicePixelRatio: 1 });
  ({ pickBeamFootprintPoints } = await import('../AggregatedCoverageVolumeLayer'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('pickBeamFootprintPoints', () => {
  it('returns an empty ring when the GEO beam feature is null', () => {
    expect(pickBeamFootprintPoints(null)).toEqual([]);
  });
});
