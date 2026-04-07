import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { regulatoryLookup } from '../services/regulatoryIndex.js';

interface RegulatoryQuery {
  lat: string;
  lng: string;
}

export async function regulatoryRoutes(app: FastifyInstance, options: { publicDir: string }): Promise<void> {
  const { publicDir } = options;
  // Point-in-polygon regulatory lookup
  app.get<{ Querystring: RegulatoryQuery }>('/api/regulatory', {
    schema: {
      querystring: {
        type: 'object',
        required: ['lat', 'lng'],
        properties: {
          lat: { type: 'number', minimum: -90, maximum: 90 },
          lng: { type: 'number', minimum: -180, maximum: 180 },
        },
      },
    },
  }, async (request, reply) => {
    const lat = Number(request.query.lat);
    const lng = Number(request.query.lng);
    const result = regulatoryLookup(lat, lng);
    return reply
      .header('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
      .send(result);
  });

  // Gzip-compressed regulatory overlay GeoJSON (replaces direct /oneweb_regulatory_overlay.geojson)
  app.get('/api/regulatory/overlay', async (_request, reply) => {
    const filePath = join(publicDir, 'oneweb_regulatory_overlay.geojson');
    const stream = createReadStream(filePath);
    return reply
      .header('Content-Type', 'application/json')
      .header('Cache-Control', 'public, max-age=604800')
      .send(stream);
  });
}
