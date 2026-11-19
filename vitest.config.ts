// The site's tests: in Node for what runs on data alone (prices, wording, the sources and the shipped database), in
// Chromium for what the page does (tests/site/*.browser.test.ts).
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import process from 'node:process';
import { playwright } from '@vitest/browser-playwright';
import { configDefaults, defineConfig } from 'vitest/config';
import { DATA_FILE, FIXTURE_DATA, ROOT_FILE } from './tests/site/community.fixture.ts';

// oxlint-disable-next-line house/env -- the machine may name its own Chromium, the one setting read from the environment
const { CHROMIUM } = process.env; // a Chromium to run the browser tests in, when not Playwright's own

// The built site (public/), served under /kiz-radar/ as GitHub Pages serves it, for the tests that load it whole in a
// frame: a folder's address serves its index.html, as Pages does, and data/ is the fixture's database. The tests' own
// pages (app.ts) get the fixture too: data/ at the root is the fixture's alone, at any depth, never the build's rows,
// which Vite would serve from public/; and a file asked at the root is the fixture's, else the build's vendor/, since
// in a test Vite's transform rewrites db.ts's '../data/' and '../vendor/' to the root itself.
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
const COMMUNITY_PAGE = /^\/c\/[^/]+\/(?:index\.html)?$/u;
const BASE = '<base href="./">',
  COMMUNITY_BASE = '<base href="../../">';
type Handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;
const served = (res: ServerResponse, file: string, body: Buffer | string): void => {
  res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.end(body);
};
const missing = (res: ServerResponse): void => {
  res.statusCode = 404;
  res.end();
};
const failed = (res: ServerResponse, e: unknown): void => {
  res.statusCode = 500;
  res.end(String(e));
};
// no such file: a 404 (or the next handler's), where any other error is the server's own
const absent = (e: unknown): boolean => e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'EISDIR');
// the file's body, served; else said absent, or failed
async function answer(res: ServerResponse, name: string, read: () => Promise<Buffer | string>, gone: () => void) {
  let body: Buffer | string;
  try {
    body = await read();
  } catch (e) {
    if (absent(e)) gone();
    else failed(res, e);
    return;
  }
  served(res, name, body);
}
// a file from the first folder that has it, in order
async function first(dirs: readonly string[], name: string): Promise<Buffer> {
  for (const dir of dirs) {
    try {
      return await readFile(join(dir, name));
    } catch (e) {
      if (!absent(e)) throw e;
    }
  }
  throw Object.assign(new Error(name), { code: 'ENOENT' });
}
// the address asked for, without its query; null for one no file has (a malformed escape)
function asked(req: IncomingMessage): string | null {
  try {
    return normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/'));
  } catch {
    return null;
  }
}
const pages = () => ({
  name: 'pages',
  configureServer(server: { readonly middlewares: { readonly use: (path: string, handler: Handler) => void } }) {
    server.middlewares.use('/', (req, res, next) => {
      const path = asked(req) ?? '';
      const data = DATA_FILE.exec(path)?.groups?.['file'];
      const root = ROOT_FILE.exec(path)?.groups?.['file'];
      if (data !== undefined) {
        answer(res, data, async () => await readFile(join(FIXTURE_DATA, data)), () => missing(res)).catch((e: unknown) =>
          failed(res, e),
        );
      } else if (root === undefined) next();
      else answer(res, root, async () => await first([FIXTURE_DATA, 'public/vendor'], root), next).catch((e: unknown) => failed(res, e));
    });
    server.middlewares.use('/kiz-radar', (req, res, next) => {
      const path = asked(req);
      if (path === null || path.includes('..')) {
        next();
        return;
      }
      const data = DATA_FILE.exec(path)?.groups?.['file'];
      // its data the fixture's (data.setup.ts), never the build's rows; a community's page the site's page from c/<key>/,
      // as pipeline/generate.py makes it but for its head tags, whatever communities the data has
      const file =
        data === undefined ? join('public', path.endsWith('/') ? `${path}index.html` : path) : join(FIXTURE_DATA, data);
      const read = COMMUNITY_PAGE.test(path)
        ? readFile('public/index.html', 'utf8').then((index) => index.replace(BASE, COMMUNITY_BASE))
        : stat(file).then(async () => await readFile(file));
      read.then((body) => served(res, file, body)).catch(() => missing(res));
    });
  },
});

// The tests of the page, in Chromium, with motion as the visitor asked for it, whatever the machine's setting: the
// browser project as most visitors have it (the tabs' tests watch the oval move), and its calm twin for the visitor who
// asked for less motion, which runs the files named *.calm.browser.test.ts alone, the browser project every other one.
// A machine whose Chromium is not Playwright's own (a container with one installed) names it in CHROMIUM.
const browserTests = (kind = '') => `tests/site/**/*${kind}.browser.test.ts`;
const BROWSER = browserTests(),
  CALM = browserTests('.calm');
// each browser project: its name, the visitor's motion setting, and its files
const BROWSER_PROJECTS: readonly {
  name: string;
  reducedMotion: 'no-preference' | 'reduce';
  include: string;
  exclude: readonly string[];
}[] = [
  { name: 'browser', reducedMotion: 'no-preference', include: BROWSER, exclude: [CALM] },
  { name: 'browser-calm', reducedMotion: 'reduce', include: CALM, exclude: [] },
];

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
          exclude: [...configDefaults.exclude, BROWSER],
          environment: 'node',
          // a zone where local midnight is mid-morning the day before in UTC, so a day read in UTC is caught
          env: { TZ: 'Pacific/Kiritimati' },
        },
      },
      ...BROWSER_PROJECTS.map(({ name, reducedMotion, include, exclude }) => ({
        plugins: [pages()],
        test: {
          name,
          include: [include],
          exclude: [...configDefaults.exclude, ...exclude],
          browser: {
            enabled: true,
            provider: playwright({
              contextOptions: { reducedMotion },
              launchOptions: CHROMIUM === undefined ? {} : { executablePath: CHROMIUM },
            }),
            headless: true,
            instances: [{ browser: 'chromium' as const }],
          },
        },
      })),
    ],
  },
});
