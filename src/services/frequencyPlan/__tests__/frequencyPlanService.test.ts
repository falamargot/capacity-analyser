import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNormalizedPublicTranspondersBySatelliteId } from '../frequencyPlanService';

describe('frequency plan service normalized loader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when normalized public frequency data is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })));

    await expect(loadNormalizedPublicTranspondersBySatelliteId('99999')).resolves.toBeNull();
  });
});
