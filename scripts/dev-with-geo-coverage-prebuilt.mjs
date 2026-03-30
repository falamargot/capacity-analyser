import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SYNC_SCRIPT_PATH = new URL('./sync-geo-coverage-prebuilt.mjs', import.meta.url);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const childProcesses = [];

const terminateChildren = (signal = 'SIGTERM') => {
  for (const child of childProcesses) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

const syncWatcher = spawn(process.execPath, [fileURLToPath(SYNC_SCRIPT_PATH), '--watch'], {
  stdio: 'inherit',
});
childProcesses.push(syncWatcher);

const viteProcess = spawn(npmCommand, ['run', 'dev:vite-only', '--', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
childProcesses.push(viteProcess);

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
