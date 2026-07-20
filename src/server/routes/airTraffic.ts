import type { FastifyInstance } from 'fastify';
import { fetchAirTrafficSnapshot } from '../services/openSkyService.js';
import { createFixedWindowLimiter } from '../services/rateLimiter.js';

// SEC-1: caps requests per client IP independently of the snapshot cache
// (openSkyService.ts) — the cache absorbs the OpenSky-facing load, this
// limiter protects the server itself from a client hammering the route.
// 10 req/10s per IP comfortably covers normal polling (useAirTraffic's
// default interval is 10s) plus manual retries, while blocking a loop.
const airTrafficLimiter = createFixedWindowLimiter({ windowMs: 10_000, max: 10 });

export async function airTrafficRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/air-traffic', {
    preHandler: async (request, reply) => {
      const { allowed, retryAfterMs } = airTrafficLimiter.check(request.ip);
      if (!allowed) {
        reply
          .code(429)
          .header('Retry-After', Math.ceil(retryAfterMs / 1000))
          .send({ error: 'Too Many Requests' });
      }
    },
  }, async (_request, reply) => {
    const result = await fetchAirTrafficSnapshot();
    return reply
      .header('Cache-Control', 'public, max-age=30, stale-while-revalidate=90')
      .send(result);
  });
}
