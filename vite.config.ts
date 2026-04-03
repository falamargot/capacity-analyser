import { fileURLToPath, URL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import cesium from 'vite-plugin-cesium';
import tailwindcss from '@tailwindcss/vite';

const OFFICIAL_ARTEMIS_TRACKER_URL = 'https://www.nasa.gov/missions/artemis-ii/arow/';
const ARTEMIS_TRACKER_ARTICLE_URL = 'https://www.nasa.gov/missions/artemis/artemis-2/track-nasas-artemis-ii-mission-in-real-time/';
const FALLBACK_ARTEMIS_EPHEMERIS_ZIP_URL = 'https://www.nasa.gov/wp-content/uploads/2026/03/oem-2026-04-02-post-uss-2-to-ei.zip?emrc=69ce69f2a70dc';

type ArtemisEphemerisSample = {
  timestamp: string;
  xKm: number;
  yKm: number;
  zKm: number;
  vxKmS: number;
  vyKmS: number;
  vzKmS: number;
};

type ArtemisTelemetryPayload = {
  sourceName: string;
  officialTrackerUrl: string;
  ephemerisSourceUrl: string | null;
  fetchedAt: string;
  generatedAt: string;
  lastUpdated: string | null;
  objectName: string | null;
  refFrame: string;
  centerName: string;
  startTime: string | null;
  stopTime: string | null;
  samples: ArtemisEphemerisSample[];
};

const decodeHtmlEntities = (value: string) => (
  value
    .replaceAll('&#038;', '&')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#8217;', "'")
);

const findZipEndOfCentralDirectory = (buffer: Buffer) => {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('ZIP end-of-central-directory record not found');
};

const extractSingleZipEntry = (buffer: Buffer) => {
  const eocdOffset = findZipEndOfCentralDirectory(buffer);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);

  let cursor = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('Invalid ZIP central directory header');
    }

    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const filenameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const filename = buffer.toString('utf8', cursor + 46, cursor + 46 + filenameLength);

    cursor += 46 + filenameLength + extraLength + commentLength;

    if (filename.endsWith('/')) {
      continue;
    }

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('Invalid ZIP local file header');
    }

    const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
    const content = compressionMethod === 0
      ? compressedData
      : compressionMethod === 8
        ? inflateRawSync(compressedData)
        : (() => {
            throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`);
          })();

    return { filename, content };
  }

  throw new Error('No file entry found in Artemis ephemeris ZIP');
};

const discoverArtemisEphemerisZipUrl = (articleHtml: string, fallbackUrl: string) => {
  const decodedHtml = decodeHtmlEntities(articleHtml);
  const matches = decodedHtml.match(/https:\/\/www\.nasa\.gov\/wp-content\/uploads\/[^"'<>\\s]+oem[^"'<>\\s]+\.zip(?:\?[^"'<>\\s]*)?/ig);
  return matches?.[0] ?? fallbackUrl;
};

const extractPreformattedOemText = (value: string) => {
  const match = value.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) {
    throw new Error('OEM payload did not contain a <pre> block');
  }
  return match[1]
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
    .trim();
};

const parseOemEphemeris = (oemText: string, ephemerisSourceUrl: string): ArtemisTelemetryPayload => {
  const lines = oemText.split(/\r?\n/);
  let lastUpdated: string | null = null;
  let objectName: string | null = null;
  let refFrame = 'EME2000';
  let centerName = 'EARTH';
  let startTime: string | null = null;
  let stopTime: string | null = null;
  const samples: ArtemisEphemerisSample[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('CREATION_DATE =')) {
      lastUpdated = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (line.startsWith('OBJECT_NAME =')) {
      objectName = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (line.startsWith('REF_FRAME =')) {
      refFrame = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (line.startsWith('CENTER_NAME =')) {
      centerName = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (line.startsWith('START_TIME =')) {
      startTime = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (line.startsWith('STOP_TIME =')) {
      stopTime = line.split('=').slice(1).join('=').trim();
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(line)) {
      continue;
    }

    const [timestamp, xKm, yKm, zKm, vxKmS, vyKmS, vzKmS] = line.split(/\s+/);
    const parsed = [
      Number(xKm),
      Number(yKm),
      Number(zKm),
      Number(vxKmS),
      Number(vyKmS),
      Number(vzKmS),
    ];

    if (parsed.some((value) => !Number.isFinite(value))) {
      continue;
    }

    samples.push({
      timestamp,
      xKm: parsed[0],
      yKm: parsed[1],
      zKm: parsed[2],
      vxKmS: parsed[3],
      vyKmS: parsed[4],
      vzKmS: parsed[5],
    });
  }

  if (samples.length === 0) {
    throw new Error('No OEM ephemeris samples found in NASA payload');
  }

  const generatedAt = new Date().toISOString();

  return {
    sourceName: 'NASA Artemis II ephemeris',
    officialTrackerUrl: OFFICIAL_ARTEMIS_TRACKER_URL,
    ephemerisSourceUrl,
    fetchedAt: generatedAt,
    generatedAt,
    lastUpdated,
    objectName,
    refFrame,
    centerName,
    startTime,
    stopTime,
    samples,
  };
};

function artemisTelemetryProxyPlugin(): Plugin {
  const cacheTtlMs = 5 * 60 * 1000;
  let configuredZipUrl = '';
  let cache: { expiresAt: number; body: string } | null = null;

  const loadPayload = async () => {
    if (cache && cache.expiresAt > Date.now()) {
      return cache.body;
    }

    const articleResponse = await fetch(ARTEMIS_TRACKER_ARTICLE_URL);
    if (!articleResponse.ok) {
      throw new Error(`NASA Artemis article request failed (${articleResponse.status})`);
    }

    const articleHtml = await articleResponse.text();
    const zipUrl = discoverArtemisEphemerisZipUrl(articleHtml, configuredZipUrl || FALLBACK_ARTEMIS_EPHEMERIS_ZIP_URL);
    const zipResponse = await fetch(zipUrl);
    if (!zipResponse.ok) {
      throw new Error(`NASA Artemis ephemeris ZIP request failed (${zipResponse.status})`);
    }

    const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
    const { content } = extractSingleZipEntry(zipBuffer);
    const oemWrapperHtml = content.toString('utf8');
    const oemText = extractPreformattedOemText(oemWrapperHtml);
    const payload = parseOemEphemeris(oemText, zipUrl);
    const body = JSON.stringify(payload);

    cache = {
      expiresAt: Date.now() + cacheTtlMs,
      body,
    };

    return body;
  };

  const installMiddleware = (server: { middlewares: { use: (path: string, fn: (req: any, res: any, next: () => void) => void) => void }; config: { mode: string } }) => {
    const env = loadEnv(server.config.mode, process.cwd(), '');
    configuredZipUrl = (env.ARTEMIS_EPHEMERIS_ZIP_URL || env.VITE_ARTEMIS_EPHEMERIS_ZIP_URL || '').trim();

    server.middlewares.use('/api/artemis/telemetry', async (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }

      try {
        const body = await loadPayload();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(body);
      } catch (error) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Failed to fetch Artemis telemetry',
          officialTrackerUrl: OFFICIAL_ARTEMIS_TRACKER_URL,
        }));
      }
    });
  };

  return {
    name: 'artemis-telemetry-proxy',
    configureServer(server) {
      installMiddleware(server);
    },
    configurePreviewServer(server) {
      installMiddleware(server as any);
    },
  };
}

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
  resolve: {
    alias: {
      resium: fileURLToPath(new URL('./node_modules/resium/src/index.ts', import.meta.url)),
      'satellite.js': fileURLToPath(new URL('./src/vendor/satellite-compat.ts', import.meta.url))
    }
  },
  plugins: [
    react(),
    cesium(),
    tailwindcss(),
    artemisTelemetryProxyPlugin(),
    aisStreamProxyPlugin()
  ],
  server: {
    port: 3000,
    open: true
  }
});
