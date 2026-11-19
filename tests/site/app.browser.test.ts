// The helper that starts the site's page in a test (app.ts): each thing a test states before the page starts reaches
// the page, its route among them, and nothing a test does later takes the page's data or day from it. Each test fails
// if the helper leaves out what it names.
import { expect, onTestFinished, test, vi } from 'vitest';
import { page } from 'vitest/browser';
import { dbDay } from '../../site/db.ts';
import { get } from '../../site/net.ts';
import { artistsHref, communityHref, EXPLORE, mapHref } from '../../site/routes.ts';
import { startSite } from './app.ts';
import { FIXTURE_COMMUNITY, PRAGUE_GOLD } from './community.fixture.ts';
import { entries } from './seen.ts';

// a festival of the fixture's that week (Prague GOLD, 14–18 January), renamed
const PLANTED = 'A festival planted before the page starts';
const week = EXPLORE.find(([k]) => k === 'week')?.[2] ?? '';
const app = await startSite({
  now: '2027-01-12',
  route: week,
  storage: { local: { seeded: 'local' }, session: { seeded: 'session' } },
  plant: (db) => {
    db.run('UPDATE events SET title = ?, listed_title = ? WHERE id = ?', [PLANTED, PLANTED, PRAGUE_GOLD]);
  },
});
const shown = () => document.querySelector('main')?.textContent ?? '';
// where the page arrived, and the database's day then, before any test opens another route or day
const arrived = { hash: location.hash, shown: shown(), day: dbDay() };
const JANUARY = 'Monday 11 Jan and Sunday 17 Jan'; // the start's week
// what This week shows, opened on the start's day
async function startsWeek(): Promise<string> {
  await app.open(week);
  return shown();
}

test('the page starts on the day given and the rows planted', async () => {
  // the day the page started on, read before any test opened a page: the clock was the helper's when the database loaded
  expect(arrived.day).toBe('2027-01-12');
  expect(await startsWeek()).toContain(JANUARY);
  expect(shown()).toContain(PLANTED);
});

test('the page starts at the route given, as a visitor who reloads the page at its address arrives', () => {
  expect({ hash: arrived.hash, day: arrived.day }).toEqual({ hash: week, day: '2027-01-12' });
  expect(arrived.shown).toContain(JANUARY);
});

// the origin's own storage, as another test file's page sees it: a same-origin frame's
function origins(): Storage {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  onTestFinished(() => frame.remove());
  const shared = frame.contentWindow?.localStorage;
  if (shared === undefined) throw new Error('the frame has no window');
  return shared;
}

test("the page's storage holds what the test seeded, and is no other file's", () => {
  expect([localStorage.getItem('seeded'), sessionStorage.getItem('seeded')]).toEqual(['local', 'session']);
  const shared = origins();
  localStorage.setItem('written', 'by this page');
  shared.setItem('elsewhere', 'by another file');
  onTestFinished(() => shared.removeItem('elsewhere'));
  expect([shared.getItem('written'), shared.getItem('seeded'), localStorage.getItem('elsewhere')]).toEqual([
    null,
    null,
    null,
  ]);
});

test("the page's fetch cannot be stubbed, and vi's timers give the day back", async () => {
  expect(() => vi.stubGlobal('fetch', () => new Response())).toThrow(TypeError);
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000);
  vi.useRealTimers();
  // the map asks for the world's outlines when it first shows
  const from = app.asked.length;
  await app.open(mapHref());
  await expect
    .poll(() => app.asked.slice(from).some(({ url }) => url.pathname.endsWith('/countries-50m.json')))
    .toBe(true);
  expect(await startsWeek()).toContain(JANUARY);
});

test('a page opened on another day shows that day, and the next page is back on the start', async () => {
  await app.open(week, '2026-11-21');
  expect(shown()).toContain('Monday 16 Nov and Sunday 22 Nov');
  await expect.element(page.getByText('On now', { exact: false }).first()).toBeVisible();
  expect(await startsWeek()).toContain(JANUARY);
});

test('a page opened on another day moves it for its test alone', async () => {
  await app.open(week, '2026-11-21');
  expect(Date.now()).toBe(new Date('2026-11-21T12:00:00').getTime());
});

test("the next test is on the start's day, in every form the clock is read", () => {
  const start = new Date('2027-01-12T12:00:00').getTime();
  // oxlint-disable-next-line unicorn/new-for-builtins -- Date() called as a function is one of the forms of the clock the test reads
  expect([Date.now(), new Date().toISOString(), Date(), new Date(0).getTime(), new Date() instanceof Date]).toEqual([
    start,
    new Date(start).toISOString(),
    new Date(start).toString(),
    0,
    true,
  ]);
});

test("while vi's timers lie over the clock, the day is theirs, and open() refuses another", async () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  await expect(app.open(week, '2026-11-21')).rejects.toThrow("vi's fake timers are on");
});

test('the page shown opens again as a new page, in place of its history entry', async () => {
  await app.open(week);
  const [first, before] = [document.querySelector('main')?.firstElementChild, entries()];
  await app.open(week);
  expect(document.querySelector('main')?.firstElementChild).not.toBe(first);
  expect(entries()).toBe(before);
});

test('a page that says what its link left out opens', async () => {
  // a status line that stays: "The link asks for …"
  await app.open(artistsHref({ kind: 'nobody' }));
  expect(shown()).toContain('The link asks for');
});

test("the page has the build's stylesheets", () => {
  expect(getComputedStyle(document.querySelector('header') ?? document.body).position).toBe('sticky');
});

test("every request is noted with its signal, and no host the page's policy refuses is reached", async () => {
  const wasm = app.asked.find(({ url }) => url.pathname.endsWith('/sql-wasm.wasm'));
  expect(wasm?.init.signal).toBeInstanceOf(AbortSignal);
  await expect(get(new URL('https://api.github.com/user'))).rejects.toThrow('Content-Security-Policy');
});

test('the page starts once, on a day that is one, at a route if any, and opens only a route', async () => {
  await expect(startSite({ now: '2026-02-30' })).rejects.toThrow('no such day');
  await expect(startSite({ now: '2027-01-12', route: 'index.html' })).rejects.toThrow("takes a route's #link");
  await expect(startSite({ now: '2027-01-12' })).rejects.toThrow('once per test file');
  await expect(app.open(communityHref(FIXTURE_COMMUNITY))).rejects.toThrow("takes a route's #link");
});
