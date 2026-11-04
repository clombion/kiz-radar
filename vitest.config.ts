// The site's tests: in Node for what runs on data alone (prices, wording, the sources and the shipped database), in
// Chromium for what the page does (tests/site/*.browser.test.ts).
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // public/data/, which the tests read, built when the checkout has none
    globalSetup: ['tests/site/data.setup.ts'],
    // the modules of pure logic, which run on values alone: each must be covered by the tests, line and branch
    coverage: {
      enabled: true,
      provider: 'v8',
      reportsDirectory: '.vitest/coverage', // with vitest's other files: never committed, nothing a test watches
      include: ['site/{calendar,claims,currency,days,fares,find,finder,fold,json,names,pending,pricing,roles,roster,routes,rows,wording}.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: { perFile: true, lines: 95, branches: 90, functions: 95, statements: 95 },
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/site/**/*.test.ts'],
          exclude: ['tests/site/**/*.browser.test.ts'],
          environment: 'node',
          // a zone where local midnight is mid-morning the day before in UTC, so a day read in UTC is caught
          env: { TZ: 'Pacific/Kiritimati' },
        },
      },
      {
        test: {
          name: 'browser',
          include: ['tests/site/**/*.browser.test.ts'],
          browser: {
            enabled: true,
            // motion as most visitors have it, whatever the machine's setting: the tabs' tests watch the oval move
            // (a test of their own stubs reduced motion)
            provider: playwright({ contextOptions: { reducedMotion: 'no-preference' } }),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
