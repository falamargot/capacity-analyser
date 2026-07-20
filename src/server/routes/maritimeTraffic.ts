import type { FastifyInstance } from 'fastify';
import { isAllowedOrigin } from '../services/corsPolicy.js';
import { createConcurrencyLimiter } from '../services/rateLimiter.js';

type SseClient = {
  reply: any;
  heartbeat: NodeJS.Timeout;
};

// SEC-2: this route bypasses the app's CORS plugin (raw SSE headers via
// reply.hijack()), so it needs its own origin check — previously a hardcoded
// wildcard let any third-party origin open the stream and consume the
// shared, rate-limited AISStream.io upstream for free. Also caps concurrent
// connections per IP so one client can't hold an unbounded number open
// (the only close trigger was clients.size === 0, i.e. nothing per-IP).
const MAX_SSE_CONNECTIONS_PER_IP = 3;
const sseConcurrencyLimiter = createConcurrencyLimiter(MAX_SSE_CONNECTIONS_PER_IP);

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
const RECONNECT_DELAY_MS = 3000;
const HEARTBEAT_MS = 15000;

const subscriptionMessage = {
  APIKey: '',
  BoundingBoxes: [
    [[30, -6], [45, 36]],
    [[20, -80], [60, 0]],
    [[10, -100], [30, -60]],
  ],
  FiltersShipMMSI: [],
  FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
};

let upstream: WebSocket | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
const clients = new Set<SseClient>();

const writeSse = (reply: any, event: string, payload: string) => {
  reply.raw.write(`event: ${event}\n`);
  const lines = payload.split(/\r?\n/);
  for (const line of lines) {
    reply.raw.write(`data: ${line}\n`);
  }
  reply.raw.write('\n');
};

const broadcast = (event: string, payload: string) => {
  for (const client of clients) {
    writeSse(client.reply, event, payload);
  }
};

const clearReconnectTimer = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const closeUpstream = () => {
  clearReconnectTimer();
  if (upstream) {
    try {
      upstream.close();
    } catch {
      // no-op
    }
    upstream = null;
  }
};

const scheduleReconnect = () => {
  if (reconnectTimer || clients.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectUpstream();
  }, RECONNECT_DELAY_MS);
};

const connectUpstream = () => {
  if (upstream || clients.size === 0) return;

  const apiKey = process.env['AISSTREAM_API_KEY']?.trim();
  if (!apiKey) {
    broadcast('status', JSON.stringify({ state: 'error', reason: 'AISSTREAM_API_KEY missing on server' }));
    return;
  }

  upstream = new WebSocket(AISSTREAM_URL);
  let isOpen = false;
  const connectTimeout = setTimeout(() => {
    if (isOpen) return;
    broadcast('status', JSON.stringify({ state: 'error', reason: 'AIS upstream connect timeout' }));
    try {
      upstream?.close();
    } catch {
      // no-op
    }
  }, 12000);

  upstream.onopen = () => {
    isOpen = true;
    clearTimeout(connectTimeout);
    try {
      upstream?.send(JSON.stringify({ ...subscriptionMessage, APIKey: apiKey }));
      broadcast('status', JSON.stringify({ state: 'connected' }));
    } catch {
      broadcast('status', JSON.stringify({ state: 'error', reason: 'Failed to send AIS subscription' }));
    }
  };

  upstream.onmessage = async (event) => {
    try {
      const raw = typeof event.data === 'string'
        ? event.data
        : Buffer.from(await (event.data as Blob).arrayBuffer()).toString('utf8');
      if (raw) broadcast('ais', raw);
    } catch {
      // ignore malformed frames
    }
  };

  upstream.onerror = () => {
    broadcast('status', JSON.stringify({ state: 'error', reason: 'AIS upstream socket error' }));
  };

  upstream.onclose = () => {
    clearTimeout(connectTimeout);
    upstream = null;
    broadcast('status', JSON.stringify({ state: 'closed' }));
    scheduleReconnect();
  };
};

export async function maritimeTrafficRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/ais/stream', async (request, reply) => {
    const clientIp = request.ip;
    if (!sseConcurrencyLimiter.tryAcquire(clientIp)) {
      reply.code(429).send({ error: 'Too many concurrent AIS stream connections from this client' });
      return;
    }

    const origin = request.headers.origin;
    const corsHeader = isAllowedOrigin(origin) ? { 'Access-Control-Allow-Origin': origin as string } : {};
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...corsHeader,
    });

    const client: SseClient = {
      reply,
      heartbeat: setInterval(() => {
        reply.raw.write(': heartbeat\n\n');
      }, HEARTBEAT_MS),
    };
    clients.add(client);

    writeSse(reply, 'status', JSON.stringify({
      state: 'connecting',
      hasApiKey: !!process.env['AISSTREAM_API_KEY'],
    }));

    if (upstream && upstream.readyState === WebSocket.OPEN) {
      writeSse(reply, 'status', JSON.stringify({ state: 'connected' }));
    } else {
      connectUpstream();
    }

    request.raw.on('close', () => {
      clearInterval(client.heartbeat);
      clients.delete(client);
      sseConcurrencyLimiter.release(clientIp);
      if (clients.size === 0) {
        closeUpstream();
      }
    });

    return reply.hijack();
  });
}
