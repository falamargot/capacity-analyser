/**
 * SEC-2: single source of truth for which origins may talk to this server.
 *
 * Previously duplicated: server.ts registered @fastify/cors with this exact
 * policy, but the AIS SSE route (maritimeTraffic.ts) bypasses the CORS plugin
 * entirely (it writes raw SSE headers via reply.hijack()) and had its own,
 * unrelated `Access-Control-Allow-Origin: '*'` — a wildcard allowing any
 * third-party origin to open the stream and consume the shared, rate-limited
 * AISStream.io upstream. Both call sites now read from here.
 */
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export function isAllowedOrigin(origin: string | undefined | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGIN_PATTERNS.some((pattern) => pattern.test(origin));
}

export { ALLOWED_ORIGIN_PATTERNS };
