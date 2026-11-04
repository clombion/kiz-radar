// The site's tests: in Node for what runs on data alone (prices, wording, the sources and the shipped database), in
// Chromium for what the page does (tests/site/*.browser.test.ts).
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// The built site (public/), served under /kiz-radar/ as GitHub Pages serves it, for the tests that load it whole in a
// frame: a folder's address serves its index.html, as Pages does.
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
const pages = () => ({
  name: 'pages',
  configureServer(server: { middlewares: { use: (path: string, handler: Handler) => void } }) {
    server.middlewares.use('/kiz-radar', (req, res, next) => {
      const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
      if (path.includes('..')) {
        next();
        return;
      }
      const file = join('public', path.endsWith('/') ? `${path}index.html` : path);
      stat(file)
        .then(() => readFile(file))
        .then((body) => {
          res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
          res.end(body);
        })
        .catch(() => {
          res.statusCode = 404;
          res.end();
        });
    });
  },
});

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
        plugins: [pages()],
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
