import { readdirSync, statSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Turns a silent operator error into a loud one.
 *
 * Editing a file under `src/` while Playwright is running makes Vite full-reload
 * the page mid-test. The test then fails on whatever it was doing — a click that
 * never lands, an element that vanishes — and the report reads exactly like an
 * application defect. On 2026-09-04 that cost three "flaky gate" investigations
 * and one wrong root cause written into the backlog: the same 96-test batch ran
 * 23.2 min with 1 failure while files were being edited, and 14.6 min with 0
 * failures when nothing was touched.
 *
 * The rule was already written down in HANDOFF.md and still got broken three
 * times in one day, which is the argument for checking it mechanically instead
 * of remembering it.
 */

const WATCHED = ['src', 'e2e'];
const STAMP = 'test-results/.source-mtime.json';

function newestMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    newest = Math.max(newest, stat.isDirectory() ? newestMtime(full) : stat.mtimeMs);
  }
  return newest;
}

function snapshot(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const dir of WATCHED) {
    if (existsSync(dir)) out[dir] = newestMtime(dir);
  }
  return out;
}

export default function globalSetup() {
  mkdirSync(dirname(STAMP), { recursive: true });
  writeFileSync(STAMP, JSON.stringify(snapshot()));
}

export function globalTeardown() {
  if (!existsSync(STAMP)) return;
  const before = JSON.parse(readFileSync(STAMP, 'utf8')) as Record<string, number>;
  const after = snapshot();
  const touched = Object.keys(after).filter((dir) => after[dir] > (before[dir] ?? 0));
  if (touched.length === 0) return;
  console.error(
    `\n  ⚠  ${touched.join(' and ')} changed WHILE this run was in progress.`
    + '\n     Vite full-reloads the page on a src change, so any failure above may'
    + '\n     be the edit, not the app. Re-run without touching the tree before'
    + '\n     believing it.\n',
  );
}
