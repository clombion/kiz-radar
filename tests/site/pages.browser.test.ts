// The built site as GitHub Pages serves it, under /kiz-radar/ (vitest.config.ts serves public/ there), whole in a
// frame: a community's one address, c/<key>/, is its page, an older #community/<key> link moves to it, and the tabs
// from it go to the site's root. The data is the fixture's (community.fixture.ts), and a community's page the site's
// page from its address: what pipeline/generate.py adds, its head tags, tests/test_community_card.py tests.
// Each frame is the build as a visitor gets it, under the Content-Security-Policy of its page's meta (which binds the
// frame's document, not the test's), with storage of its own, so the smoke set below fails on a broken bundle and on
// anything the policy refuses: every view of routes.ts's HASH_ROUTES and of its path routes (a community's page), the
// older link to it, and review.html, each drawn with nothing said to have gone wrong, no request failed, no violation
// and no console error. The routes come from routes.ts's types, so a new one has no case until it is given one; the
// older link and review.html, which no route names, are listed by hand.
import { expect, onTestFinished, test, vi } from 'vitest';
import {
  artistsHref,
  countriesHref,
  EXPLORE,
  festivalsHref,
  friendsHref,
  HASH_ROUTES,
  mapHref,
  parseRoute,
  type Route,
  sourcesHref,
  sqlHref,
  TABS,
} from '../../site/routes.ts';
import { kept } from './app.ts';
import { FIXTURE_COMMUNITY, FIXTURE_NAME } from './community.fixture.ts';

const ROOT = '/kiz-radar/';
const KEY = FIXTURE_COMMUNITY;
const NAME = FIXTURE_NAME;

const WAIT_MS = 10_000; // a page draws in under a second; under Vitest's 15 s test timeout, with QUIET_MS twice
const QUIET_MS = 2000; // the page asks for nothing more for this long: what it asks late is asked by then

// What went wrong in a frame, heard from its window as the page starts: the policy's refusals, errors and rejections
// that escaped, the console's errors, and each request of the page's fetch that failed or was refused. The frame's
// window is the one its first page reuses (a frame's initial about:blank, of the same origin), so what is set on it as
// the frame is made, the console's error among it, is the page's from its first script; its storage is its own, so
// that no other test file's frame shares it.
interface Heard {
  readonly violations: string[];
  readonly errors: string[];
  readonly fetched: string[];
  asked: number;
  readonly said: unknown;
}
const heardIn = new WeakMap<HTMLIFrameElement, Heard>();
// a property of the frame's window, which its Window type does not name
function own(frame: HTMLIFrameElement, name: string): object {
  const win = frame.contentWindow;
  if (win === null) throw new Error('the frame has no window');
  const value: unknown = Reflect.get(win, name);
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
    throw new Error(`the frame has no ${name}`);
  return value;
}
const statusOf = (res: unknown): number | undefined =>
  typeof res === 'object' && res !== null && 'status' in res && typeof res.status === 'number' ? res.status : undefined;
function listen(frame: HTMLIFrameElement): void {
  const win = frame.contentWindow;
  if (win === null) throw new Error('the frame has no window');
  const says = own(frame, 'console'),
    fetches = own(frame, 'fetch');
  const error: unknown = Reflect.get(says, 'error');
  if (typeof error !== 'function' || typeof fetches !== 'function')
    throw new Error('the frame has no console or fetch');
  const said = (...args: readonly unknown[]): void => {
    heard.errors.push(`console: ${args.map(String).join(' ')}`);
    Reflect.apply(error, says, args);
  };
  const heard: Heard = { violations: [], errors: [], fetched: [], asked: 0, said };
  heardIn.set(frame, heard);
  win.addEventListener('securitypolicyviolation', (ev) => {
    heard.violations.push(`${ev.effectiveDirective} ${ev.blockedURI} ${ev.sourceFile}:${ev.lineNumber}`);
  });
  win.addEventListener('error', (ev) => {
    heard.errors.push(`error: ${ev.message}`);
  });
  win.addEventListener('unhandledrejection', (ev) => {
    heard.errors.push(`rejection: ${String(ev.reason)}`);
  });
  Reflect.set(says, 'error', said);
  Reflect.set(win, 'fetch', async (...args: readonly unknown[]): Promise<unknown> => {
    heard.asked += 1;
    const url = String(args[0]);
    try {
      const res: unknown = await Reflect.apply(fetches, win, args);
      const status = statusOf(res);
      if (status === undefined || status < 200 || status > 299) heard.fetched.push(`fetch ${status} ${url}`);
      return res;
    } catch (e) {
      heard.fetched.push(`fetch refused ${url}: ${String(e)}`);
      throw e;
    }
  });
  for (const name of ['localStorage', 'sessionStorage'])
    Object.defineProperty(win, name, { value: kept(), configurable: true });
  win.performance.setResourceTimingBufferSize(1000);
}
// a frame of the site at an address, once its community page or view has drawn; removed as the test ends
async function framed(address: string, drawn: string): Promise<HTMLIFrameElement> {
  for (const old of document.querySelectorAll('iframe')) old.remove();
  const frame = document.createElement('iframe');
  frame.style.width = '1000px';
  frame.style.height = '800px';
  frame.title = 'The built site';
  frame.src = address;
  document.body.append(frame);
  onTestFinished(() => frame.remove());
  listen(frame);
  await vi.waitFor(
    () => {
      if (!frame.contentDocument?.querySelector(drawn)) throw new Error(`${address} has drawn no ${drawn} yet`);
    },
    { timeout: WAIT_MS, interval: 100 },
  );
  // the page's window is the one listened to: its console's error is still ours, or nothing was heard
  if (Reflect.get(own(frame, 'console'), 'error') !== heardIn.get(frame)?.said)
    throw new Error(`${address}: the frame's page has a window of its own, which nothing listens to`);
  return frame;
}
// once the frame's page has asked for nothing more (no request, no fetch) for QUIET_MS
async function quiet(frame: HTMLIFrameElement, seen = -1): Promise<void> {
  const now =
    (frame.contentWindow?.performance.getEntriesByType('resource').length ?? 0) + (heardIn.get(frame)?.asked ?? 0);
  if (now === seen) return;
  await new Promise((settle) => {
    setTimeout(settle, QUIET_MS);
  });
  await quiet(frame, now);
}
// What a frame's page shows and heard of going wrong, once it asks for nothing more: the lines report.ts and a view's
// guard write; the requests that failed (the page's own and each file it asked for, all of this origin, so their
// status is the frame's to read; and each fetch that failed or was refused), and the bundle if it was never asked for;
// the policy's refusals and the errors.
const BUNDLE = [/\/js\/(?:main|review)\.js$/u, /\/js\/shared-[^/]+\.js$/u];
async function troubles(frame: HTMLIFrameElement): Promise<Record<string, string[]>> {
  const doc = frame.contentDocument,
    win = frame.contentWindow;
  const heard = heardIn.get(frame);
  if (doc === null || win === null || heard === undefined) throw new Error('no page in the frame');
  await quiet(frame);
  const entries = [...win.performance.getEntriesByType('navigation'), ...win.performance.getEntriesByType('resource')];
  const statuses = entries.map((e) => {
    if (!('responseStatus' in e) || typeof e.responseStatus !== 'number')
      throw new Error(`${e.name}: no responseStatus to read`);
    return [e.responseStatus, e.name] as const;
  });
  return {
    said: [...doc.querySelectorAll('[role="alert"], .status.error')].map((el) => el.textContent),
    failed: [
      ...statuses.filter(([status]) => status < 200 || status > 299).map(([status, name]) => `${status} ${name}`),
      ...heard.fetched,
      ...BUNDLE.filter((file) => !entries.some((e) => file.test(e.name))).map((file) => `never asked: ${file}`),
    ],
    violations: heard.violations,
    errors: heard.errors,
  };
}
const NONE = { said: [], failed: [], violations: [], errors: [] };
const where = (frame: HTMLIFrameElement) => {
  const at = frame.contentWindow?.location;
  return `${at?.pathname ?? ''}${at?.search ?? ''}${at?.hash ?? ''}`;
};
// once the frame shows the Friends tab
const onFriends = async (frame: HTMLIFrameElement) =>
  await vi.waitFor(
    () => {
      if (!frame.contentDocument?.querySelector('.who-list')) throw new Error('not on the Friends tab yet');
    },
    { timeout: WAIT_MS, interval: 100 },
  );
const heading = (frame: HTMLIFrameElement) => frame.contentDocument?.querySelector('.profile-head h1')?.textContent;

test('a community’s address is its page: the site, its own title, and the address kept', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.profile-head h1');
  expect([heading(frame), where(frame), frame.contentDocument?.title]).toEqual([
    NAME,
    `${ROOT}c/${KEY}/`,
    `${NAME} · Kiz Radar`,
  ]);
  // no step elsewhere
  expect(frame.contentDocument?.querySelector('meta[http-equiv="refresh"]')).toBeNull();
});

test('its Share button gives its address', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.share-row button');
  const shared = vi.fn(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(frame.contentWindow?.navigator, 'share', { value: shared, configurable: true });
  frame.contentDocument?.querySelector<HTMLButtonElement>('.share-row button')?.click();
  expect(shared).toHaveBeenCalledWith({ title: NAME, url: `${location.origin}${ROOT}c/${KEY}/` });
});

test('an older #community/<key> link moves to the community’s address and shows its page', async () => {
  const frame = await framed(`${ROOT}#community/${KEY}`, '.profile-head h1');
  expect([heading(frame), where(frame)]).toEqual([NAME, `${ROOT}c/${KEY}/`]);
  // its links still the root's, the address moved or not
  expect(frame.contentDocument?.querySelector<HTMLAnchorElement>('a.brand')?.href).toBe(
    `${location.origin}${ROOT}${festivalsHref()}`,
  );
});

test('the tabs and the brand from a community’s page go to the site’s root', async () => {
  const frame = await framed(`${ROOT}c/${KEY}/`, '.profile-head h1');
  const links = [...(frame.contentDocument?.querySelectorAll<HTMLAnchorElement>('nav.tabs a, a.brand') ?? [])];
  expect(links.map((a) => a.href)).toEqual([
    `${location.origin}${ROOT}${festivalsHref()}`, // the brand
    ...TABS.map(([, , href]) => `${location.origin}${ROOT}${href}`),
  ]);
  frame.contentDocument?.querySelector<HTMLAnchorElement>('nav.tabs a[data-nav="friends"]')?.click();
  await onFriends(frame);
  expect(where(frame)).toBe(`${ROOT}${TABS.find(([nav]) => nav === 'friends')?.[2]}`);
});

test('the currency asked for stays through a choice, a tab and a community’s page', async () => {
  // the festivals in, so nothing of the first view is still to draw
  const frame = await framed(`${ROOT}?cur=eur${festivalsHref()}`, '.festival-cards, .sentence-results .empty');
  const months = frame.contentDocument?.querySelector<HTMLSelectElement>('.sentence-hero select');
  if (months) {
    months.selectedIndex = 0;
    months.dispatchEvent(new Event('change'));
  }
  expect(where(frame)).toMatch(new RegExp(`^${ROOT}\\?cur=eur#finder\\?when=weekend`, 'u'));
  frame.contentDocument?.querySelector<HTMLAnchorElement>('nav.tabs a[data-nav="friends"]')?.click();
  await onFriends(frame);
  await vi.waitFor(() => expect(where(frame)).toBe(`${ROOT}?cur=eur${TABS.find(([nav]) => nav === 'friends')?.[2]}`));
  const community = await framed(`${ROOT}c/${KEY}/?cur=eur`, '.profile-head h1');
  expect(community.contentDocument?.querySelector<HTMLAnchorElement>('a.brand')?.href).toBe(
    `${location.origin}${ROOT}?cur=eur${festivalsHref()}`,
  );
});

// The smoke set: each page the build serves, as a visitor arrives at it, drawn whole and clean. Each route of
// routes.ts needs a case here, or the tests do not type-check: the link to it, what shows it drew once its data is in
// (the database, or site.json for the sources, which the page waits for before any view) and the page's title.
type Drawn = Readonly<{ href: string; drawn: string; title: string }>;
const HASHED: Readonly<Record<(typeof HASH_ROUTES)[number], Drawn>> = {
  finder: { href: festivalsHref(), drawn: '.festival-cards, .sentence-results .empty', title: 'Kiz Radar' },
  friends: { href: friendsHref(), drawn: '.who-list', title: 'Friends · Kiz Radar' },
  week: {
    href: EXPLORE.find(([k]) => k === 'week')?.[2] ?? '',
    drawn: '.page-intro ~ .festival-cards .festival-card, .page-intro ~ .empty',
    title: 'This week · Kiz Radar',
  },
  map: { href: mapHref(), drawn: '.leaflet-land-pane path', title: 'Map · Kiz Radar' },
  artists: { href: artistsHref(), drawn: '.artist-list li', title: 'Artists · Kiz Radar' },
  countries: { href: countriesHref(), drawn: '.country-list li', title: 'Countries · Kiz Radar' },
  sql: { href: sqlHref(), drawn: '.schema li', title: 'SQL · Kiz Radar' },
  sources: { href: sourcesHref(), drawn: '#freshness', title: 'Sources · Kiz Radar' },
};
const COMMUNITY_PAGE: Drawn = {
  href: `c/${KEY}/`,
  drawn: '.profile-head h1',
  title: `${NAME} · Kiz Radar`,
};
const PATHED: Readonly<Record<Exclude<Route, (typeof HASH_ROUTES)[number]>, Drawn>> = { community: COMMUNITY_PAGE };
const SMOKE: readonly Drawn[] = [
  ...HASH_ROUTES.map((route) => HASHED[route]),
  ...Object.values(PATHED),
  { ...COMMUNITY_PAGE, href: `#community/${KEY}` },
  { href: 'review.html', drawn: '#queues a', title: 'Kiz Radar review' },
];

test('each view’s link in the smoke set names its view', () => {
  expect(HASH_ROUTES.map((route) => parseRoute(HASHED[route].href).name)).toEqual(HASH_ROUTES);
});

// oxlint-disable-next-line jest/no-done-callback -- test.for's callback takes the case, not a done callback
test.for(SMOKE)('$href is drawn from the build with nothing gone wrong', async ({ href, drawn, title }) => {
  const frame = await framed(`${ROOT}${href}`, drawn);
  expect([frame.contentDocument?.title, await troubles(frame)]).toEqual([title, NONE]);
});

// the page of the sources, drawn, and its document and window
async function sources(): Promise<{ frame: HTMLIFrameElement; doc: Document; win: Window }> {
  const frame = await framed(`${ROOT}${HASHED.sources.href}`, HASHED.sources.drawn);
  const doc = frame.contentDocument,
    win = frame.contentWindow;
  if (doc === null || win === null) throw new Error('no page in the frame');
  return { frame, doc, win };
}

test('a frame hears what the page’s policy refuses: an inline script and an inline style', async () => {
  const { frame, doc } = await sources();
  const inline = doc.createElement('script');
  inline.textContent = 'document.title = "ran"';
  const styled = doc.createElement('p');
  styled.setAttribute('style', 'color: red');
  doc.body.append(inline, styled);
  await vi.waitFor(() => expect(heardIn.get(frame)?.violations.length).toBe(2));
  expect([
    doc.title,
    heardIn
      .get(frame)
      ?.violations.map((v) => v.split(' ')[0])
      .toSorted(),
  ]).toEqual(['Sources · Kiz Radar', ['script-src-elem', 'style-src-attr']]);
});

test('a frame hears its console’s errors, what escapes and what fails to fetch', async () => {
  const { frame, win } = await sources();
  // a function of the frame's own, called as its page would
  const call = (owner: object, name: string, ...args: readonly unknown[]): unknown => {
    const f: unknown = Reflect.get(owner, name);
    if (typeof f !== 'function') throw new Error(`the frame has no ${name}`);
    return Reflect.apply(f, owner, args);
  };
  call(own(frame, 'console'), 'error', 'said');
  // a function of the frame's that throws, from a timer: an error that escapes in the frame, not in this page
  const parse: unknown = Reflect.get(own(frame, 'JSON'), 'parse');
  if (typeof parse !== 'function') throw new Error('the frame has no JSON.parse');
  win.setTimeout(parse, 0, '{');
  call(own(frame, 'Promise'), 'reject', new Error('rejected'));
  await win.fetch('js/missing.js');
  await win.fetch('https://example.com/').catch(() => 'refused');
  const { errors, ...rest } = await troubles(frame);
  expect([rest, errors?.toSorted()]).toEqual([
    {
      said: ['Something went wrong (the page: Error: rejected). Reloading the page may help. Close'],
      failed: [
        `404 ${location.origin}${ROOT}js/missing.js`,
        'fetch 404 js/missing.js',
        'fetch refused https://example.com/: TypeError: Failed to fetch',
      ],
      violations: [expect.stringMatching(/^connect-src https:\/\/example\.com\/ /u)],
    },
    [
      'console: Kiz Radar: the page: Error: rejected',
      'console: Kiz Radar: the page: Script error.',
      'console: said',
      'error: Script error.',
      'rejection: Error: rejected',
    ],
  ]);
});
