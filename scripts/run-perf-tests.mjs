/**
 * Runs the opt-in performance budget suite on a quiet machine.
 *
 * The budgets in engineeringEnginePerf.test.ts are wall-clock p95 thresholds.
 * They only mean something without CPU contention: measured inside the full
 * parallel suite the same code reported p95 7.45 ms against an isolated
 * 0.53 ms. So this runner both sets RUN_PERF_TESTS (which un-skips the suite)
 * and disables file parallelism.
 *
 * Cross-platform: npm scripts run through cmd.exe on Windows, where the
 * `VAR=1 command` prefix is not valid syntax — hence a Node runner rather than
 * an inline env assignment. Vitest's own .mjs entry is invoked directly with
 * process.execPath because Node >=24 refuses to spawn .cmd shims without a
 * shell, which would make `npx.cmd` fail with EINVAL.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

const child = spawn(
  process.execPath,
  [vitestCli, 'run', '--no-file-parallelism', 'src/utils/__tests__/engineeringEnginePerf.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, RUN_PERF_TESTS: '1' },
  },
);

child.on('exit', (code) => process.exit(code ?? 1));
