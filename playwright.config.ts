import { defineConfig, devices } from '@playwright/test';

const port = 4173;

/**
 * Spec files that skip EVERY test on a given viewport (Programme 7D).
 *
 * `test.skip(project.name !== …)` is evaluated inside the test body, so the
 * `beforeEach` — a real navigation and a full Cesium boot — has already been
 * paid by the time the skip fires. Across the suite that was ~64 app boots
 * spent to reach `skipped`, and it dominated the wall time.
 *
 * Ignoring those file × project combinations changes WHICH tests run not at
 * all: every entry below is a file where the project in question already ran
 * zero tests. The in-test skips are deliberately left in place as the source of
 * truth, and `e2e/__tests__/projectCoverage.test.ts` fails if these lists ever
 * stop agreeing with them — so adding a test without a skip cannot silently
 * lose viewport coverage.
 */
/**
 * Desktop and tablet: the standalone chrome column needs `md` width and more
 * than 640 px of height, so the phone and the wide-but-short window run none of
 * its tests.
 */
const DESKTOP_AND_TABLET_ONLY = ['**/standalone-mode.spec.ts'];

/** Runs on `desktop-chromium` alone; the other three projects run nothing. */
const DESKTOP_ONLY = [
  // Both drive their own viewport matrix from inside the test.
  '**/accessibility.spec.ts', '**/revisit-visual.spec.ts',
  // Every P7C test is an engine-freshness contract, asserted once.
  '**/revisit-p7c.spec.ts',
];

/** Desktop and phone only: no test in these targets the two mid widths. */
const COMPACT_AND_DESKTOP_ONLY = [
  '**/revisit-p2a.spec.ts', '**/revisit-p2b.spec.ts', '**/revisit-p2b-b1.spec.ts',
  '**/revisit-p2b-b2.spec.ts', '**/revisit-p2b-b3.spec.ts', '**/revisit-p2c-a.spec.ts',
  '**/revisit-p2c-b.spec.ts', '**/revisit-p2c-c.spec.ts', '**/revisit-p7a.spec.ts',
  '**/revisit-p7b.spec.ts', '**/revisit-p7e.spec.ts',
];

export const PROJECT_TEST_IGNORE: Record<string, string[]> = {
  'desktop-chromium': [],
  'short-wide-chromium': [
    ...DESKTOP_ONLY, ...COMPACT_AND_DESKTOP_ONLY, ...DESKTOP_AND_TABLET_ONLY,
  ],
  'tablet-chromium': [...DESKTOP_ONLY, ...COMPACT_AND_DESKTOP_ONLY],
  'mobile-chromium': [...DESKTOP_ONLY, ...DESKTOP_AND_TABLET_ONLY],
};

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/playwright',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    launchOptions: { args: ['--js-flags=--expose-gc'] },
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'short-wide-chromium',
      testIgnore: PROJECT_TEST_IGNORE['short-wide-chromium'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 2048, height: 560 } },
    },
    {
      name: 'tablet-chromium',
      testIgnore: PROJECT_TEST_IGNORE['tablet-chromium'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'mobile-chromium',
      testIgnore: PROJECT_TEST_IGNORE['mobile-chromium'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: `PLAYWRIGHT_TEST=1 VITE_FORCE_LOCAL_CELESTRAK=true npm run dev:vite-only -- --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
