import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import tailwindcss from '@tailwindcss/vite';

function aisStreamProxyPlugin(): Plugin {
  type SseClient = {
    res: import('node:http').ServerResponse;
  };

  let apiKey = '';
  let upstream: any = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  const clients = new Set<SseClient>();

  const subscriptionMessage = {
    APIKey: '',
    BoundingBoxes: [
      [[30, -6], [45, 36]], // Mediterranean
      [[20, -80], [60, 0]], // North Atlantic
      [[10, -100], [30, -60]] // Caribbean
    ],
    FiltersShipMMSI: [],
    FilterMessageTypes: ['PositionReport', 'ShipStaticData']
  };

  const writeSse = (res: import('node:http').ServerResponse, event: string, payload: string) => {
    res.write(`event: ${event}\n`);
    const lines = payload.split(/\r?\n/);
    for (const line of lines) {
      res.write(`data: ${line}\n`);
    }
    res.write('\n');
  };

  const broadcast = (event: string, payload: string) => {
    for (const client of clients) {
      writeSse(client.res, event, payload);
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
    if (reconnectTimer || clients.size === 0 || !apiKey) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectUpstream();
    }, 3000);
  };

  const connectUpstream = () => {
    if (upstream || clients.size === 0) return;

    const WS = (globalThis as any).WebSocket;
    if (!WS) {
      broadcast('status', JSON.stringify({ state: 'error', reason: 'WebSocket client unavailable in Node runtime' }));
      return;
    }

    if (!apiKey) {
      broadcast('status', JSON.stringify({ state: 'error', reason: 'AISSTREAM_API_KEY missing on server' }));
      return;
    }

    upstream = new WS('wss://stream.aisstream.io/v0/stream');
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
      const msg = { ...subscriptionMessage, APIKey: apiKey };
      try {
        upstream?.send(JSON.stringify(msg));
      } catch {
        broadcast('status', JSON.stringify({ state: 'error', reason: 'Failed to send AIS subscription' }));
      }
      broadcast('status', JSON.stringify({ state: 'connected' }));
    };

    upstream.onmessage = (event: any) => {
      try {
        const raw = typeof event?.data === 'string'
          ? event.data
          : Buffer.from(event?.data ?? '').toString('utf8');
        if (raw) {
          broadcast('ais', raw);
        }
      } catch {
        // Ignore malformed frames
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

  return {
    name: 'aisstream-sse-proxy',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      apiKey = (env.AISSTREAM_API_KEY || env.VITE_AISSTREAM_API_KEY || '').trim();

      server.middlewares.use('/api/ais/stream', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.flushHeaders?.();

        const client: SseClient = { res };
        clients.add(client);

        writeSse(res, 'status', JSON.stringify({
          state: 'connecting',
          hasApiKey: !!apiKey
        }));

        if (!apiKey) {
          writeSse(res, 'status', JSON.stringify({
            state: 'error',
            reason: 'Missing AISSTREAM_API_KEY on dev server'
          }));
        } else {
          // If already connected, notify immediately.
          if (upstream && upstream.readyState === 1) {
            writeSse(res, 'status', JSON.stringify({ state: 'connected' }));
          } else {
            connectUpstream();
          }
        }

        const heartbeat = setInterval(() => {
          res.write(': heartbeat\n\n');
        }, 15000);

        req.on('close', () => {
          clearInterval(heartbeat);
          clients.delete(client);
          if (clients.size === 0) {
            closeUpstream();
          }
        });
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    cesium(),
    tailwindcss(),
    aisStreamProxyPlugin()
  ],
  server: {
    port: 3000,
    open: true
  }
});
