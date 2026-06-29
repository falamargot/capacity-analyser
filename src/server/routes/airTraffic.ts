import type { FastifyInstance } from 'fastify';
import { fetchAirTrafficSnapshot } from '../services/openSkyService.js';

export async function airTrafficRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/air-traffic', async (_request, reply) => {
    const result = await fetchAirTrafficSnapshot();
    return reply
      .header('Cache-Control', 'public, max-age=30, stale-while-revalidate=90')
      .send(result);
  });
}
