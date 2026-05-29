import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SYNC_SCRIPT_PATH = new URL('./sync-geo-coverage-prebuilt.mjs', import.meta.url);
const VITE_PACKAGE_JSON_PATH = require.resolve('vite/package.json');
const VITE_BIN_PATH = resolve(dirname(VITE_PACKAGE_JSON_PATH), 'bin/vite.js');
const SERVER_ENTRY = new URL('../src/server/server.ts', import.meta.url);
const API_HOST = process.env.HOST ?? '0.0.0.0';
const API_PUBLIC_HOST = API_HOST === '0.0.0.0' ? 'localhost' : API_HOST;
const PREFERRED_API_PORT = Number(process.env.PORT ?? 3001);
const FALLBACK_API_PORT_START = Number(process.env.REGULATORY_API_FALLBACK_PORT ?? 3101);

const childProcesses = [];

const isPortAvailable = (port, host) => new Promise((resolveAvailable) => {
  const server = createServer();
  server.once('error', () => resolveAvailable(false));
  server.once('listening', () => {
    server.close(() => resolveAvailable(true));
  });
  server.listen({ port, host });
});

const resolveAvailableApiPort = async () => {
  if (await isPortAvailable(PREFERRED_API_PORT, API_HOST)) {
    return PREFERRED_API_PORT;
  }

  for (let port = FALLBACK_API_PORT_START; port < FALLBACK_API_PORT_START + 50; port++) {
    if (await isPortAvailable(port, API_HOST)) {
      console.warn(`[regulatory-api] port ${PREFERRED_API_PORT} is in use; using ${port} instead.`);
      return port;
    }
  }

  throw new Error(
    `No free regulatory API port found. Tried ${PREFERRED_API_PORT} and ${FALLBACK_API_PORT_START}-${FALLBACK_API_PORT_START + 49}.`
  );
};

const resolveTsxBinPath = () => {
  try {
    const tsxPackageJsonPath = require.resolve('tsx/package.json');
    return resolve(dirname(tsxPackageJsonPath), 'dist/cli.mjs');
  } catch {
    return null;
  }
};

const terminateChildren = (signal = 'SIGTERM') => {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

const main = async () => {
  const tsxBinPath = resolveTsxBinPath();
  const apiPort = await resolveAvailableApiPort();
  const apiBaseUrl = `http://${API_PUBLIC_HOST}:${apiPort}`;
  const childEnv = {
    ...process.env,
    PORT: String(apiPort),
    VITE_API_URL: process.env.VITE_API_URL ?? apiBaseUrl,
    VITE_LOCAL_API_BASE: process.env.VITE_LOCAL_API_BASE ?? apiBaseUrl,
    VITE_REGULATORY_API_BASE: process.env.VITE_REGULATORY_API_BASE ?? apiBaseUrl,
  };

  const apiServer = tsxBinPath
    ? spawn(process.execPath, [tsxBinPath, fileURLToPath(SERVER_ENTRY)], {
        stdio: 'inherit',
        env: childEnv,
      })
    : null;

  if (apiServer) {
    childProcesses.push(apiServer);
  } else {
    console.warn('[regulatory-api] Optional dependency "tsx" is not installed.');
    console.warn('[regulatory-api] Starting dev mode without the local API server.');
    console.warn('[regulatory-api] Run "npm install" to restore regulatory lookup support during local development.');
  }

  const syncWatcher = spawn(process.execPath, [fileURLToPath(SYNC_SCRIPT_PATH), '--watch'], {
    stdio: 'inherit',
  });
  childProcesses.push(syncWatcher);

  const viteProcess = spawn(process.execPath, [VITE_BIN_PATH, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: childEnv,
  });
  childProcesses.push(viteProcess);

  // API server failures are non-fatal: Vite + the app continue working,
  // regulatory lookups will gracefully return OCEAN_RESULT.
  apiServer?.on('error', (error) => {
    console.error('[regulatory-api] failed to spawn API server:', error.message);
    console.warn('[regulatory-api] Regulatory lookups will return default ocean result.');
  });

  apiServer?.on('exit', (code) => {
    if (viteProcess.killed || viteProcess.exitCode !== null) return;
    if (code && code !== 0) {
      console.warn(`[regulatory-api] server exited with code ${code}; regulatory lookups degraded.`);
      console.warn('[regulatory-api] Start a new dev session to retry on another free port.');
    }
  });

  syncWatcher.on('error', (error) => {
    console.error('[geo-prebuilt] failed to start sync watcher:', error);
    terminateChildren();
    process.exit(1);
  });

  viteProcess.on('error', (error) => {
    console.error('[geo-prebuilt] failed to start Vite dev server:', error);
    terminateChildren();
    process.exit(1);
  });

  viteProcess.on('exit', (code, signal) => {
    terminateChildren();
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  syncWatcher.on('exit', (code) => {
    if (viteProcess.killed || viteProcess.exitCode !== null) {
      return;
    }

    if (code && code !== 0) {
      console.error(`[geo-prebuilt] watcher exited with code ${code}. Stopping dev server.`);
      terminateChildren();
      process.exit(code);
    }
  });
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    terminateChildren(signal);
  });
}

main().catch((error) => {
  console.error('[regulatory-api] failed to prepare dev server:', error);
  terminateChildren();
  process.exit(1);
});
