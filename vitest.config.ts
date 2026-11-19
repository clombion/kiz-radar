// The site's tests: in Node for what runs on data alone (prices, wording, the sources and the shipped database), in
// Chromium for what the page does (tests/site/*.browser.test.ts). Vitest reads this file and not vite.config.ts, the
// build's, so the tests' modules are Vite's dev transform of site/, never the bundle; the tests that load the whole
// site load the bundle mise run build:site wrote into public/js/. Solid's plugin compiles the browser tests' JSX with
// Solid's development build, which carries its diagnostics: the plugin adds the development condition under Vitest and
// vite dev, never in vite build, where Vite's own condition picks the production build as long as NODE_ENV is unset
// (vite build then sets it to production).
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize } from 'node:path';
import process from 'node:process';
import solid from '@solidjs/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import type { BrowserCommand } from 'vitest/node';
import { configDefaults, defineConfig } from 'vitest/config';
import { DATA_FILE, FIXTURE_DATA } from './tests/site/community.fixture.ts';

// oxlint-disable-next-line house/env -- the machine may name its own Chromium, the one setting read from the environment
const { CHROMIUM } = process.env; // a Chromium to run the browser tests in, when not Playwright's own

// The built site (public/), served under /kiz-radar/ as GitHub Pages serves it, for the tests that load it whole in a
// frame: a folder's address serves its index.html, as Pages does, and data/ is the fixture's database. The tests' own
// pages (app.ts) get the fixture too: data/ at the root is the fixture's alone, at any depth, never the build's rows,
// which Vite would serve from public/; any other address is Vite's (the pages' mark.svg and loading.svg from public/).
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
// no such file: a 404, where any other error is the server's own
const absent = (e: unknown): boolean => e instanceof Error && 'code' in e && (e.code === 'ENOENT' || e.code === 'EISDIR');
// the file's body, served; else said missing, or failed
async function answer(res: ServerResponse, name: string, read: () => Promise<Buffer | string>) {
  let body: Buffer | string;
  try {
    body = await read();
  } catch (e) {
    if (absent(e)) missing(res);
    else failed(res, e);
    return;
  }
  served(res, name, body);
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
      if (data === undefined) next();
      else {
        answer(res, data, async () => await readFile(join(FIXTURE_DATA, data))).catch((e: unknown) => failed(res, e));
      }
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

// The Solid component of tests/site/hello.tsx built as the site is (vite.config.ts: its plugins and options), written
// nowhere: the code of the one module, Solid within it, for solid.browser.test.ts to run. Its exports are kept, which
// the site's entries have none of and Vite drops. The build runs in a Node of its own without NODE_ENV, as
// pnpm run build runs it: Vitest's NODE_ENV=test would make Vite pick Solid's development build.
const HELLO = 'tests/site/hello.tsx';
const BUILD = `
const { build } = await import('vite');
const out = await build({
  configFile: 'vite.config.ts',
  logLevel: 'warn',
  build: { write: false, rolldownOptions: { input: '${HELLO}', preserveEntrySignatures: 'strict' } },
});
const [only, ...more] = 'output' in out ? out.output : [];
if (only?.type !== 'chunk' || more.length > 0) throw new Error('${HELLO} built as other than one module');
process.stdout.write(only.code);
`;
const built: BrowserCommand<[], string> = async () =>
  await new Promise((resolve, reject) => {
    const node = [process.execPath, '--input-type=module', '--eval', BUILD];
    execFile('env', ['-u', 'NODE_ENV', ...node], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error !== null) reject(new Error(`${HELLO}'s build failed: ${stderr}`, { cause: error }));
      else if (stderr === '') resolve(stdout);
      else reject(new Error(`${HELLO}'s build said: ${stderr}`));
    });
  });

// The tests of the page, in Chromium, with motion as the visitor asked for it, whatever the machine's setting: the
// browser project as most visitors have it (the tabs' tests watch the oval move), and its calm twin for the visitor who
// asked for less motion, which runs the files named *.calm.browser.test.ts alone, the browser project every other one.
// A machine whose Chromium is not Playwright's own (a container with one installed) names it in CHROMIUM.
const browserTests = (kind = '') => `tests/site/**/*${kind}.browser.test.{ts,tsx}`;
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
          include: ['tests/site/**/*.test.{ts,tsx}'],
          exclude: [...configDefaults.exclude, BROWSER],
          environment: 'node',
          // a zone where local midnight is mid-morning the day before in UTC, so a day read in UTC is caught
          env: { TZ: 'Pacific/Kiritimati' },
        },
      },
      ...BROWSER_PROJECTS.map(({ name, reducedMotion, include, exclude }) => ({
        plugins: [pages(), solid()],
        test: {
          name,
          include: [include],
          exclude: [...configDefaults.exclude, ...exclude],
          // a warning or an error said to the console that the test did not declare fails it (console.ts)
          setupFiles: ['tests/site/console.setup.ts'],
          // each test file in a frame of its own, as Vitest's default: the guard (console.ts) holds one file's
          // window, and halted.browser.test.ts's halt of Solid lasts the window it happens in
          isolate: true,
          browser: {
            enabled: true,
            provider: playwright({
              contextOptions: { reducedMotion },
              launchOptions: CHROMIUM === undefined ? {} : { executablePath: CHROMIUM },
            }),
            headless: true,
            commands: { built },
            instances: [{ browser: 'chromium' as const }],
          },
        },
      })),
    ],
  },
});
