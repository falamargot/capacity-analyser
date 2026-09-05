import { afterEach, describe, expect, it, vi } from 'vitest';
import { regulatoryLookup } from '../regulatoryService';
import { evaluateLeoServiceGates } from '../../utils/leoServiceDecision';
afterEach(() => vi.unstubAllGlobals());
describe('regulatory evidence on transport failure', () => {
  it.each([false, true])('does not fabricate ocean permission (network failure: %s)', async (networkFailure) => {
    vi.stubGlobal('fetch', networkFailure ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: false }));
    const result = await regulatoryLookup(48.8566, 2.3522);
    expect(result).toBeNull();
    expect(evaluateLeoServiceGates({ regulatoryStatus: result?.status, hasSatellite: true, hasRF: true, hasSNP: true })).toBe('REGULATORY_PENDING');
  });
  it('does not cache failures and preserves actual ocean evidence', async () => {
    const ocean = { status: 'ALLOWED_ESTIMATED', isOcean: true, countryName: null };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ocean }));
    expect(await regulatoryLookup(0, -35)).toBeNull();
    expect(await regulatoryLookup(0, -35)).toEqual(ocean);
  });
});
