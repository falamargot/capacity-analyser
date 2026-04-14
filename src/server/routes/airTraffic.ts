import type { FastifyInstance } from 'fastify';
import { fetchAirTrafficSnapshot } from '../services/openSkyService.js';

interface AirTrafficQuery {
  lat?: string;
  lng?: string;
}

export async function airTrafficRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: AirTrafficQuery }>('/api/air-traffic', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lng: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
    },
  }, async (request, reply) => {
    const lat = request.query.lat != null ? Number(request.query.lat) : undefined;
    const lng = request.query.lng != null ? Number(request.query.lng) : undefined;
    const result = await fetchAirTrafficSnapshot(lat, lng);
    return reply
      .header('Cache-Control', 'public, max-age=30, stale-while-revalidate=90')
      .send(result);
  });
}
