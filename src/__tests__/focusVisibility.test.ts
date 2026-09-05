/*
 * S-7 — a keyboard user must be able to see where they are.
 *
 * `outline-none` removes the browser's focus ring. That is legitimate when a
 * replacement is provided (`focus-visible:ring-*`) and a WCAG 2.4.7 failure when
 * it is not. Six controls — two REVISIT selects, two header selects, the command
 * palette input and the inline location search — had removed it with nothing in
 * its place.
 *
 * This is a SOURCE-LEVEL guard on purpose: axe cannot see a missing focus ring,
 * and neither can a rendering test that never tabs. Cheap, and it catches the
 * regression at the moment someone writes it.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sourceFiles(full, out);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A className string is compliant when it either keeps the native outline or
 * declares a visible replacement. Both spellings occur in this codebase:
 * `outline-none` plus a ring, and `focus-visible:outline-none` plus a ring.
 */
function offendingLines(source: string): number[] {
  const lines = source.split('\n');
  const bad: number[] = [];
  lines.forEach((line, i) => {
    if (!line.includes('outline-none')) return;
    const hasReplacement = /focus-visible:(ring|outline|border|shadow)/.test(line)
      || /focus:(ring|outline|border|shadow)/.test(line);
    if (!hasReplacement) bad.push(i + 1);
  });
  return bad;
}

describe('focus visibility (WCAG 2.4.7)', () => {
  it('never removes the focus ring without providing one', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      for (const line of offendingLines(readFileSync(file, 'utf8'))) {
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(offenders, 'add focus-visible:ring-* beside outline-none').toEqual([]);
  });

  it('recognises both compliant spellings and the non-compliant one', () => {
    expect(offendingLines('className="outline-none focus-visible:ring-2"')).toEqual([]);
    expect(offendingLines('className="focus-visible:outline-none focus-visible:ring-2"')).toEqual([]);
    expect(offendingLines('className="bg-transparent outline-none"')).toEqual([1]);
  });
});
