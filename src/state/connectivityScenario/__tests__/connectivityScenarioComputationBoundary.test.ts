import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * ARCH-2 lock-down: ConnectivityScenario is a label-only shadow read model
 * today (see connectivityScenarioSync.ts's doc comment) — the actual
 * engineering computation reads the legacy per-field state directly. This is
 * currently true only by convention, not by any type-level or structural
 * guarantee, so a future change could silently start threading
 * ConnectivityScenario into the computation hook without anything catching
 * it. Absent a hook-render test harness (none exists in this codebase — see
 * the audit report's other documented test gaps), this static source check
 * is the cheapest available guard: it fails loudly the moment
 * useEngineeringAnalysis.ts starts importing from the connectivityScenario
 * state module, forcing a conscious decision (update this test + the
 * "label-only" doc comment, or don't do it) rather than a silent drift.
 */
describe('ConnectivityScenario computation boundary (ARCH-2)', () => {
  it('useEngineeringAnalysis.ts (the sole engineering computation hook) does not import from state/connectivityScenario', () => {
    const hookPath = fileURLToPath(new URL('../../../hooks/useEngineeringAnalysis.ts', import.meta.url));
    const source = readFileSync(hookPath, 'utf8');

    expect(source).not.toMatch(/from ['"].*connectivityScenario/);
  });
});
