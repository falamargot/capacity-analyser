/**
 * Capacity Analyser — Regulatory API Server
 *
 * Serves regulatory point-in-polygon lookups and the country overlay GeoJSON.
 * Eliminates the need for the browser to download and parse 12.5 MB of GeoJSON.
 *
 * Start: tsx src/server/server.ts
 * Port:  3001 (configure via PORT env var)
 */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyCompress from '@fastify/compress';
import { loadAndIndex } from './services/regulatoryIndex.js';
import { regulatoryRoutes } from './routes/regulatory.js';
import { airTrafficRoutes } from './routes/airTraffic.js';
import { maritimeTrafficRoutes } from './routes/maritimeTraffic.js';
import { issRoutes } from './routes/iss.js';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

// Project root is two levels up from src/server/
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');
const PUBLIC_DIR = join(PROJECT_ROOT, 'public');

const app = Fastify({ logger: false });

async function start() {
  await app.register(fastifyCors, {
    origin: [
      /^http:\/\/localhost:\d+$/,
      /^http:\/\/127\.0\.0\.1:\d+$/,
    ],
  });

  await app.register(fastifyCompress);

  await loadAndIndex(PUBLIC_DIR);

  await app.register(regulatoryRoutes, { publicDir: PUBLIC_DIR });
  await app.register(airTrafficRoutes);
  await app.register(maritimeTrafficRoutes);
  await app.register(issRoutes);

  await app.listen({ port: PORT, host: HOST });
  console.log(`[regulatory-api] ready on :${PORT}`);
}

start().catch((err) => {
  console.error('[regulatory-api] Fatal startup error:', err);
  process.exit(1);
});
