import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SYNC_SCRIPT_PATH = new URL('./sync-geo-coverage-prebuilt.mjs', import.meta.url);
const VITE_PACKAGE_JSON_PATH = require.resolve('vite/package.json');
const VITE_BIN_PATH = resolve(dirname(VITE_PACKAGE_JSON_PATH), 'bin/vite.js');

const TSX_PACKAGE_JSON_PATH = require.resolve('tsx/package.json');
const TSX_BIN_PATH = resolve(dirname(TSX_PACKAGE_JSON_PATH), 'dist/cli.mjs');
const SERVER_ENTRY = new URL('../src/server/server.ts', import.meta.url);

const childProcesses = [];

const terminateChildren = (signal = 'SIGTERM') => {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

const apiServer = spawn(process.execPath, [TSX_BIN_PATH, fileURLToPath(SERVER_ENTRY)], {
  stdio: 'inherit',
});
childProcesses.push(apiServer);

const syncWatcher = spawn(process.execPath, [fileURLToPath(SYNC_SCRIPT_PATH), '--watch'], {
  stdio: 'inherit',
});
childProcesses.push(syncWatcher);

const viteProcess = spawn(process.execPath, [VITE_BIN_PATH, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
childProcesses.push(viteProcess);

// API server failures are non-fatal: Vite + the app continue working,
// regulatory lookups will gracefully return OCEAN_RESULT.
apiServer.on('error', (error) => {
  console.error('[regulatory-api] failed to spawn API server:', error.message);
  console.warn('[regulatory-api] Regulatory lookups will return default ocean result.');
});

apiServer.on('exit', (code) => {
  if (viteProcess.killed || viteProcess.exitCode !== null) return;
  if (code && code !== 0) {
    console.warn(`[regulatory-api] server exited with code ${code} — regulatory lookups degraded.`);
    console.warn('[regulatory-api] If port 3001 is in use, run: lsof -ti:3001 | xargs kill -9');
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

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    terminateChildren(signal);
  });
}
