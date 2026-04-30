import type { FastifyInstance } from 'fastify';

const ISS_NORAD_ID = 25544;
const CELESTRAK_ISS_TLE_URL = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${ISS_NORAD_ID}&FORMAT=TLE`;

export async function issRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/iss/tle', async (_request, reply) => {
    const response = await fetch(CELESTRAK_ISS_TLE_URL, {
      signal: AbortSignal.timeout(12_000),
      headers: {
        'User-Agent': 'capacity-analyser/1.0',
      },
    });

    if (!response.ok) {
      return reply
        .status(502)
        .send({ error: `CelesTrak ISS TLE request failed with HTTP ${response.status}` });
    }

    const text = await response.text();
    return reply
      .type('text/plain; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600')
      .send(text);
  });
}
