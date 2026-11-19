// The site's page, started in a browser test as a visitor gets it: index.html (or review.html) with its stylesheets
// and libraries from the build (public/, which mise run test:site builds), main.ts (or review.ts) started on it, and
// the fixture's data (data.setup.ts) from the test server, with the rows a test plants. A test states what a visit
// depends on before the page starts, and then uses the page:
// - once per file: the page starts on import, and each test file is a page of its own;
// - its day, always (`now`, YYYY-MM-DD, pinned at local noon in the browser's own zone, or an instant). open(href, on)
//   opens a page on another day, as a page left open past midnight does, until the test ends or the next open();
// - its data: `plant` changes the fixture's database before the page reads it (the build's artist_stats and
//   event_stats are not computed again from planted rows); `review` is the review page's data;
// - its storage, which a reload keeps: the page's localStorage and sessionStorage are this file's own and hold
//   `storage` alone (test files run at once, and the origin's own storage is theirs to share);
// - what another host answers, on the review page (`elsewhere`, or answer() inside one test), for the hosts its
//   Content-Security-Policy lets it ask; nothing else leaves the page.
// The page's fetch, storage and clock are the helper's for the whole file, and cannot be replaced: fetch records what
// the page asked since it started (`asked`), serves the planted data, and passes the page's own files to the test
// server; a file a test holds (hold(), inside one test) is asked of it once the test lets it go. vi's fake timers may
// lie over the clock, installed after the page starts, and give it back; while they do, the day is theirs
// (vi.setSystemTime). The page's Content-Security-Policy is read, not applied: in the test's page it would also bind
// Vitest's own scripts. A start, or an open(), whose page says it failed is refused with its words, and so is one
// during which a new line says that something went wrong (report.ts's), so that no error passes unseen.
import type { Database } from 'sql.js';
import { onTestFinished, vi } from 'vitest';
import { commands } from 'vitest/browser';
import type { Review } from '../../site/pending.ts';
import { DATA_FILE, ROOT_FILE } from './community.fixture.ts';

type Day = `${number}-${number}-${number}`;
type Now = Day | Date;
type Answer = (url: URL, init: RequestInit) => Response | Promise<Response>;
interface Asked {
  readonly url: URL;
  readonly init: RequestInit;
}
interface Visit {
  now: Now;
  storage?: { local?: Readonly<Record<string, string>>; session?: Readonly<Record<string, string>> };
}
// the two pages: each one's HTML, the module that starts it, and the data file a test may give it
const PAGES = {
  site: { html: 'public/index.html', entry: () => import('../../site/main.ts'), data: 'kiz.sqlite' },
  review: { html: 'public/review.html', entry: () => import('../../site/review.ts'), data: 'review.json' },
} as const;
type Page = (typeof PAGES)[keyof typeof PAGES];
const START_MS = 30_000; // a start takes under a second; it runs before any test, so no test timeout cuts it
const OPEN_MS = 10_000; // under Vitest's 15 s test timeout, so that a page that never draws is said as such

const RealDate = Date;
const own = fetch; // the page's fetch, before the helper's replaces it
const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const pad = (n: number) => String(n).padStart(2, '0');
// a day's instant, at local noon (a zone's midnight would move it a day in another), or the instant given
function pinned(now: Now): number {
  if (typeof now !== 'string') {
    if (Number.isNaN(now.getTime())) throw new Error('now: an Invalid Date');
    return now.getTime();
  }
  const t = new RealDate(`${now}T12:00:00`);
  if (!DAY.test(now) || [t.getFullYear(), pad(t.getMonth() + 1), pad(t.getDate())].join('-') !== now) {
    throw new Error(`${now}: no such day (a day is YYYY-MM-DD)`);
  }
  return t.getTime();
}

const main = (): HTMLElement => {
  const el = document.querySelector('main');
  if (el === null) throw new Error('the page has no <main>');
  return el;
};
const said = () => (document.querySelector('main')?.textContent ?? '(no <main>)').trim().slice(0, 600);
// what a visitor is told while a page waits for its data (index.html's first line, ui.ts's loading()), and when a
// page failed (report.ts's guarded(), main.ts's and sentence.ts's lines; not updating.ts's page, "Kiz Radar could not
// load", which is a page a visitor gets mid-update and a test may start on)
const LOADING = /^\s*Loading/u;
const FAILED = /This page could not be shown|Could not load the /u;
const loading = (): boolean =>
  [...main().querySelectorAll('[role="status"]')].some((s) => LOADING.test(s.textContent ?? ''));
// until the page is drawn: ready (what is waited for named), and no line says it is loading; refused if it failed
async function drawn(what: string, timeout: number, [ready, waited] = [() => true, 'its data']): Promise<void> {
  try {
    await vi.waitUntil(() => ready() && !loading(), { timeout, interval: 16 });
  } catch (e) {
    throw new Error(`${what}: still waiting for ${waited} after ${timeout} ms; <main> says: ${said()}`, { cause: e });
  }
  if (FAILED.test(main().textContent ?? '')) throw new Error(`${what}: the page says it failed: ${said()}`);
}

// the lines report.ts puts at the top of the page when something goes wrong
const alerts = (): Element[] => [...document.querySelectorAll('[role="alert"]')];
// refused when a line that something went wrong is new since `before` (the lines there before a start or an open())
function unalarmed(what: string, before: readonly Element[]): void {
  const raised = alerts().filter((a) => !before.includes(a));
  if (raised.length > 0) {
    throw new Error(`${what}: the page says ${raised.map((a) => (a.textContent ?? '').trim()).join(' / ')}`);
  }
}

// a stylesheet or library of the page, added to this one by its own address, the libraries run in the page's order
// (they are deferred there); a missing one is the build's
function added(part: Element): Promise<void> {
  const el = document.createElement(part.tagName.toLowerCase());
  for (const a of part.attributes) if (a.name !== 'defer') el.setAttribute(a.name, a.value);
  if (el instanceof HTMLScriptElement) el.async = false;
  const name = part.getAttribute('src') ?? part.getAttribute('href') ?? '';
  return new Promise((ok, failed) => {
    el.addEventListener('load', () => ok());
    el.addEventListener('error', () => failed(new Error(`${name} did not load: mise run build:site makes it`)));
    document.head.append(el);
  });
}
async function bytes(path: string): Promise<ArrayBuffer> {
  const r = await own(path);
  if (!r.ok) {
    throw new Error(`${path}: ${r.status}: mise run build:site makes vendor/, the tests' setup the fixture's data`);
  }
  return r.arrayBuffer();
}
// the fixture's database as plant leaves it, by the page's own sql.js (its WebAssembly where db.ts asks it, in vendor/)
async function planted(plant: (db: Database) => void): Promise<Uint8Array<ArrayBuffer>> {
  const SQL = await initSqlJs({ wasmBinary: await bytes('/vendor/sql-wasm.wasm') });
  const db = new SQL.Database(new Uint8Array(await bytes('/data/kiz.sqlite')));
  try {
    plant(db);
    return new Uint8Array(db.export());
  } finally {
    db.close();
  }
}

// a Storage of the page's own, which no other test file sees: what the site calls, and what a test reads back
function kept(seed: Readonly<Record<string, string>> = {}): Storage {
  const items = new Map(Object.entries(seed));
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (key) => {
      items.delete(key);
    },
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
}
const owned = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, writable: false, configurable: false });

// the other hosts the page may ask: the full origins its Content-Security-Policy's connect-src lists
function reachable(page: Page, html: Document): (url: URL) => boolean {
  const policy = html.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
  const [, ...sources] =
    policy
      .split(';')
      .map((d) => d.trim().split(/\s+/u))
      .find(([name]) => name === 'connect-src') ?? [];
  if (sources.length === 0) throw new Error(`${page.html}: its Content-Security-Policy has no connect-src`);
  const origins = sources.filter((s) => s !== "'self'");
  for (const s of origins) {
    if (!URL.canParse(s) || new URL(s).origin !== s) throw new Error(`${page.html}: connect-src ${s} is no origin`);
  }
  return (url) => origins.includes(url.origin);
}
// an answer the helper gives, given up as a real request is when its signal aborts (net.ts's deadline, a view left)
function within(signal: AbortSignal | null | undefined, make: () => Response | Promise<Response>): Promise<Response> {
  return new Promise((ok, refused) => {
    if (signal?.aborted === true) {
      refused(signal.reason);
      return;
    }
    signal?.addEventListener('abort', () => refused(signal.reason), { once: true });
    Promise.resolve().then(make).then(ok).catch(refused);
  });
}

let started = false;
// the start both pages share: the page served what `data` makes as its data file (once its libraries are in, sql.js
// among them), other hosts answered by `elsewhere`
async function start(
  page: Page,
  { now, storage }: Visit,
  data: () => Promise<BodyInit | undefined> | BodyInit | undefined,
  elsewhere?: Answer,
) {
  const from = pinned(now);
  if (started) throw new Error('the page starts once per test file: it starts on import, and a file is one page');
  started = true;
  if (globalThis.Date !== RealDate) {
    throw new Error(
      "vi's fake timers are on before the page starts: install them after, so useRealTimers() gives it back",
    );
  }

  owned('localStorage', kept(storage?.local));
  owned('sessionStorage', kept(storage?.session));

  // the visitor's clock: now is the pinned instant, which does not tick; any other date is the real Date's
  let at = from;
  const clock = new Proxy(RealDate, {
    apply: () => new RealDate(at).toString(),
    construct: (real, given: unknown[], made: NewableFunction) =>
      Reflect.construct(real, given.length === 0 ? [at] : given, made),
    get: (real, key): unknown => (key === 'now' ? () => at : Reflect.get(real, key)),
  });
  globalThis.Date = clock;

  const html = new DOMParser().parseFromString(await commands.readFile(page.html), 'text/html');
  const allowed = reachable(page, html);
  await Promise.all(
    [...html.head.querySelectorAll('link[rel="stylesheet"], script[src]:not([type="module"])')].map(added),
  );
  const served = await data();

  let answer = elsewhere;
  // the page's own files a test holds, by the end of their path, each until it is let go
  const holds = new Map<string, Promise<void>>();
  const asked: Asked[] = [];
  owned('fetch', (input: URL | string | Request, init: RequestInit = {}): Promise<Response> => {
    if (input instanceof Request) return Promise.reject(new TypeError('the site asks by URL (net.ts), not by Request'));
    const url = new URL(input, location.href);
    asked.push({ url, init });
    if (url.origin !== location.origin) {
      if (!allowed(url)) {
        return Promise.reject(
          new TypeError(`${url.href}: the page's Content-Security-Policy (connect-src) refuses it`),
        );
      }
      const given = answer;
      if (given === undefined) {
        return Promise.reject(new TypeError(`${url.href}: no other host answers in a test (elsewhere)`));
      }
      return within(init.signal, () => given(url, init));
    }
    const file = (DATA_FILE.exec(url.pathname) ?? ROOT_FILE.exec(url.pathname))?.groups?.['file'];
    return served !== undefined && file === page.data
      ? within(init.signal, () => new Response(served))
      : within(init.signal, async () => {
          await Promise.all([...holds].filter(([path]) => url.pathname.endsWith(path)).map(([, held]) => held));
          return own(url, init);
        });
  });

  document.body.replaceChildren(...document.importNode(html.body, true).childNodes);
  // the page's own address, without a route: where the visitor arrives (the page may then write its route in)
  const home = location.pathname + location.search;
  history.replaceState(null, '', home);
  await page.entry();
  await drawn('starting the page', START_MS);
  unalarmed('starting the page', []);
  return {
    asked,
    home,
    // a file of the page's own held until the test lets it go, or ends (onTestFinished: inside a test only)
    hold: (path: string): (() => void) => {
      const held: { go?: () => void } = {};
      holds.set(
        path,
        new Promise<void>((done) => {
          held.go = done;
        }),
      );
      const go = () => {
        holds.delete(path);
        held.go?.();
      };
      onTestFinished(go);
      return go;
    },
    // another host's answer for the test that gives it (onTestFinished: inside a test only)
    answer: (a: Answer) => {
      onTestFinished(() => {
        answer = elsewhere;
      });
      answer = a;
    },
    // the day a page opens on: until the test ends, then the start's
    on: (day: Now | undefined, href: string) => {
      if (day === undefined) {
        at = from;
        return;
      }
      if (globalThis.Date !== clock) {
        throw new Error(
          `open(${href}, ${String(day)}): vi's fake timers are on, so the day is theirs (vi.setSystemTime)`,
        );
      }
      at = pinned(day);
      onTestFinished(() => {
        at = from;
      });
    },
  };
}

// The site's page, started on the fixture's data as plant leaves it. open(href, on) opens a route by its link from
// routes.ts as a new page, on the day `on` or else the start's, once the page has the focus and has its data.
// hold(path) holds the page's own file of that path until the function it returns is called, or the test ends.
export async function startSite({ plant, ...visit }: Visit & { plant?: (db: Database) => void }): Promise<{
  asked: readonly Asked[];
  hold: (path: string) => () => void;
  open: (href: string, on?: Now) => Promise<void>;
}> {
  const { asked, hold, home, on } = await start(PAGES.site, visit, () =>
    plant === undefined ? undefined : planted(plant),
  );
  return {
    asked,
    hold,
    open: async (href, day) => {
      if (!href.startsWith('#')) {
        throw new Error(
          `${href}: open() takes a route's #link; a page of its own is a page load, which a test cannot do`,
        );
      }
      on(day, href);
      const before = alerts();
      // a new page takes the focus (main.ts); until it has, the page shown is the one before (the focus itself,
      // not its event, which a frame without the window's focus never gets: test files share one window)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      // in place of the entry shown, so that no other test file's history.back() lands here (the frames share one
      // history); resolved against the address, not the page's base
      history.replaceState(null, '', home);
      location.replace(new URL(href, location.href).href);
      await drawn(href, OPEN_MS, [() => document.activeElement === main(), 'the focus a new page takes']);
      unalarmed(href, before);
    },
  };
}

// The review page, started on review (else the fixture's review.json), other hosts answered by `elsewhere`.
export async function startReview({
  review,
  elsewhere,
  ...visit
}: Visit & { review?: Review; elsewhere?: Answer }): Promise<{
  asked: readonly Asked[];
  answer: (a: Answer) => void;
}> {
  const { asked, answer } = await start(
    PAGES.review,
    visit,
    () => (review === undefined ? undefined : JSON.stringify(review)),
    elsewhere,
  );
  return { asked, answer };
}
