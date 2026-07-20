import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { airTrafficRoutes } from '../airTraffic';
import { resetAirTrafficCacheForTests } from '../../services/openSkyService';

const oneAircraftState = ['abc123', 'TEST123 ', null, null, 1_700_000_000, 2.35, 48.85, 10000, false, 200, 90];

describe('GET /api/air-traffic — SEC-1 rate limiting', () => {
  beforeEach(() => {
    resetAirTrafficCacheForTests();
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ time: 1_700_000_000, states: [oneAircraftState] }),
    }));
    vi.stubEnv('OPENSKY_CLIENT_ID', undefined);
    vi.stubEnv('OPENSKY_CLIENT_SECRET', undefined);
    // The route-level limiter is a module-level singleton shared across
    // tests/requests (matches production — one limiter per process) — jump
    // the fake clock past its 10s window so each test starts unthrottled.
    vi.advanceTimersByTime(10_001);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  async function buildApp() {
    const app = Fastify({ logger: false });
    await app.register(airTrafficRoutes);
    await app.ready();
    return app;
  }

  it('serves requests under the limit normally', async () => {
    const app = await buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/air-traffic' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).aircraft).toHaveLength(1);
    await app.close();
  });

  it('returns 429 with a Retry-After header once the per-IP limit is exceeded', async () => {
    const app = await buildApp();

    let last;
    for (let i = 0; i < 11; i += 1) {
      last = await app.inject({ method: 'GET', url: '/api/air-traffic' });
    }

    expect(last!.statusCode).toBe(429);
    expect(last!.headers['retry-after']).toBeDefined();
    await app.close();
  });

  it('recovers after the rate-limit window elapses', async () => {
    const app = await buildApp();

    for (let i = 0; i < 11; i += 1) {
      await app.inject({ method: 'GET', url: '/api/air-traffic' });
    }
    const blocked = await app.inject({ method: 'GET', url: '/api/air-traffic' });
    expect(blocked.statusCode).toBe(429);

    vi.advanceTimersByTime(10_001);

    const recovered = await app.inject({ method: 'GET', url: '/api/air-traffic' });
    expect(recovered.statusCode).toBe(200);
    await app.close();
  });
});
