/**
 * The e2e project-ignore lists must never outrun the skips they mirror
 * (Programme 7D).
 *
 * `playwright.config.ts` excludes whole spec files from the `short-wide`,
 * `tablet` and `mobile` projects. That is purely a speed measure: every file
 * listed there already skipped all of its tests on that viewport, and skipping
 * happens inside the test body — after `beforeEach` has paid a full navigation
 * and Cesium boot. Removing ~64 of those boots is where the suite's wall time
 * went.
 *
 * The hazard is obvious and worth guarding: add a test to one of those files
 * WITHOUT a project skip and it silently stops running on two of four
 * viewports — a coverage loss that no failing test would report, because the
 * test would simply never be collected.
 *
 * So this parses the specs, works out which projects each test actually
 * targets, and asserts the config ignores a file for a project only when that
 * project runs none of its tests. It fails in both directions: an over-broad
 * ignore loses coverage, and a stale one silently reintroduces the waste.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_TEST_IGNORE } from '../../../../playwright.config';

const E2E_DIR = join(process.cwd(), 'e2e');
const PROJECTS = [
    'desktop-chromium', 'short-wide-chromium', 'tablet-chromium', 'mobile-chromium',
] as const;

/**
 * Which projects a test targets, read from its `test.skip(...)` modifier.
 *
 * Only the two shapes the suite actually uses are understood. Anything else is
 * treated as "runs everywhere", which is the conservative direction: it can
 * only make this test complain about an ignore entry, never bless one.
 */
function projectsForTest(body: string): Set<string> {
    const skip = /test\.skip\(([\s\S]*?)\);/.exec(body);
    if (!skip) return new Set(PROJECTS);
    const condition = skip[1];

    const single = /project\.name !== '([\w-]+)'/.exec(condition);
    if (single) return new Set([single[1]]);

    const list = /!\[([^\]]+)\]\.includes/.exec(condition);
    if (list) return new Set(list[1].match(/'([\w-]+)'/g)?.map((q) => q.slice(1, -1)) ?? []);

    return new Set(PROJECTS);
}

/**
 * Any indentation, because `revisit-visual.spec.ts` declares its tests inside
 * two `for` loops — the case an indentation-limited split silently skipped,
 * which is exactly the kind of file this guard is supposed to cover.
 */
function testBodies(source: string): string[] {
    const parts = source.split(/\n\s*test\(/).slice(1);
    return parts.map((part) => part.split(/\n\s*test\(/)[0]);
}

/** Projects that run at least one test of this file. */
function projectsCovered(source: string): Set<string> {
    const covered = new Set<string>();
    for (const body of testBodies(source)) {
        for (const project of projectsForTest(body)) covered.add(project);
    }
    return covered;
}

const specs = readdirSync(E2E_DIR)
    .filter((name) => name.endsWith('.spec.ts'))
    .map((name) => ({ name, source: readFileSync(join(E2E_DIR, name), 'utf8') }));

function isIgnored(project: string, name: string): boolean {
    return (PROJECT_TEST_IGNORE[project] ?? []).some((pattern) => pattern.endsWith(`/${name}`));
}

describe('playwright project ignore lists', () => {
    it('finds the specs it is meant to check', () => {
        expect(specs.length).toBeGreaterThan(10);
    });

    it('never ignores a file a project still has tests for', () => {
        const lost: string[] = [];
        for (const { name, source } of specs) {
            const covered = projectsCovered(source);
            for (const project of PROJECTS) {
                if (isIgnored(project, name) && covered.has(project)) {
                    lost.push(`${project} ignores ${name}, which still targets it`);
                }
            }
        }
        expect(lost, lost.join('\n')).toEqual([]);
    });

    /*
     * The other direction. Without this the lists rot: a file whose tests all
     * become desktop-only stops being ignored anywhere and quietly pays the
     * boots again.
     */
    it('ignores every file a project runs no tests for', () => {
        const missed: string[] = [];
        for (const { name, source } of specs) {
            const covered = projectsCovered(source);
            for (const project of PROJECTS) {
                if (!covered.has(project) && !isIgnored(project, name)) {
                    missed.push(`${project} runs no test in ${name} but does not ignore it`);
                }
            }
        }
        expect(missed, missed.join('\n')).toEqual([]);
    });
});
